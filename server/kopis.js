import { XMLParser } from "fast-xml-parser";
import { matchConcert } from "../src/lib/match.js";
import {
  getAllProgramsCache,
  cleanupOrphanPrograms,
  startUpcomingProgramsWorker,
} from "./programExtractor.js";

const LIST_TTL_MS = 10 * 60 * 1000;
const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  parseTagValue: false,
  stopNodes: ["*.sty", "*.dtguidance", "*.pcseguidance"],
  isArray: (name) => name === "db" || name === "styurl" || name === "relate",
});

function cleanKey(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function ymd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function dateWindows(now = new Date()) {
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 120,
  );
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 180);
  const windows = [];
  let cursor = start;

  while (cursor <= end) {
    const tentative = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + 59,
    );
    const windowEnd = tentative < end ? tentative : end;
    windows.push([ymd(cursor), ymd(windowEnd)]);
    cursor = new Date(
      windowEnd.getFullYear(),
      windowEnd.getMonth(),
      windowEnd.getDate() + 1,
    );
  }

  return windows;
}

function asArray(value) {
  if (value == null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function textValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return stripHtml(value);
  if (typeof value === "object") return stripHtml(value["#text"] || "");
  return String(value);
}

export function parseKopisXml(xml) {
  const data = parser.parse(xml);
  const rows = asArray(data?.dbs?.db).filter(
    (row) => row && typeof row === "object",
  );
  if (rows.length === 1 && rows[0].returncode && !rows[0].mt20id) {
    const error = new Error(rows[0].errmsg || "KOPIS 요청이 거절되었습니다.");
    error.kopis = true;
    throw error;
  }
  return rows.filter((row) => row.mt20id);
}

function mapSummary(row) {
  return {
    id: String(row.mt20id),
    title: textValue(row.prfnm),
    from: textValue(row.prfpdfrom),
    to: textValue(row.prfpdto),
    venue: textValue(row.fcltynm),
    poster: textValue(row.poster),
    area: textValue(row.area),
    genre: textValue(row.genrenm),
    openRun: row.openrun === "Y",
    visit: row.visit === "Y",
    state: textValue(row.prfstate),
  };
}

function extractImages(styurls) {
  if (!styurls) return [];
  if (typeof styurls === "string") {
    return styurls.startsWith("http") ? [styurls] : [];
  }
  return asArray(styurls.styurl)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((url) => url.startsWith("http"));
}

function extractTickets(relates) {
  if (!relates) return [];
  return asArray(relates.relate)
    .map((item) => ({
      name: textValue(item?.relatenm) || "예매처",
      url: textValue(item?.relateurl),
    }))
    .filter((ticket) => ticket.url.startsWith("http"));
}

function mapDetail(row) {
  const summary = mapSummary(row);
  return {
    ...summary,
    facilityId: textValue(row.mt10id),
    registeredAt: textValue(row.frstregdt),
    updatedAt: textValue(row.updatedate),
    cast: textValue(row.prfcast),
    crew: textValue(row.prfcrew),
    runtime: textValue(row.prfruntime),
    age: textValue(row.prfage),
    producer: textValue(row.entrpsnm),
    presenter: textValue(row.entrpsnmH),
    organizer: textValue(row.entrpsnmS),
    planner: textValue(row.entrpsnmA),
    company: textValue(row.entrpsnmP),
    price: textValue(row.pcseguidance),
    story: textValue(row.sty),
    schedule: textValue(row.dtguidance),
    images: extractImages(row.styurls),
    tickets: extractTickets(row.relates),
    child: row.child === "Y",
    festival: row.festival === "Y",
  };
}

function stateRank(state) {
  if (state === "공연중") return 0;
  if (state === "공연예정") return 1;
  if (state === "공연완료") return 2;
  return 3;
}

export function createKopis(rawKey) {
  const serviceKey = cleanKey(rawKey);
  const details = new Map();
  const inflight = new Map();
  const failed = new Set();
  const queue = [];
  const queued = new Set();
  let workers = 0;
  let listCache = null;
  let listPromise = null;
  let listError = null;

  async function kopisGet(path, params, retries = 2) {
    const url = new URL(`http://www.kopis.or.kr/openApi/restful/${path}`);
    url.searchParams.set("service", serviceKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "application/xml, text/xml, */*",
          },
          signal: AbortSignal.timeout(20000),
        });

        if (!response.ok) {
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
            continue;
          }
          throw new Error(`KOPIS 응답 오류 (${response.status})`);
        }

        const xml = await response.text();
        return parseKopisXml(xml);
      } catch (err) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
  }

  async function fetchWindow(stdate, eddate) {
    const rows = [];
    let complete = true;
    for (let page = 1; page <= 20; page += 1) {
      try {
        const pageRows = await kopisGet("pblprfr", {
          stdate,
          eddate,
          cpage: String(page),
          rows: "100",
          shcate: "CCCA",
          // prfstate: "01",
        });
        rows.push(...pageRows);
        if (pageRows.length < 100) break;
        await new Promise((r) => setTimeout(r, 120));
      } catch (err) {
        complete = false;
        console.warn(
          `Window ${stdate}-${eddate} page ${page} failed:`,
          err.message,
        );
        break;
      }
    }
    return { rows, complete };
  }

  async function fetchAllConcerts() {
    const windows = dateWindows();
    const byId = new Map();
    let allWindowsComplete = true;

    for (const [stdate, eddate] of windows) {
      try {
        const { rows, complete } = await fetchWindow(stdate, eddate);
        if (!complete) allWindowsComplete = false;
        for (const row of rows) {
          const concert = mapSummary(row);
          if (
            concert.genre &&
            !concert.genre.includes("서양음악") &&
            !concert.genre.includes("클래식")
          ) {
            continue;
          }
          byId.set(concert.id, concert);
        }
        await new Promise((r) => setTimeout(r, 150));
      } catch (err) {
        allWindowsComplete = false;
        console.warn(
          `Window ${stdate}-${eddate} skipped due to error:`,
          err.message,
        );
      }
    }

    const sorted = [...byId.values()].sort(
      (a, b) =>
        stateRank(a.state) - stateRank(b.state) ||
        a.from.localeCompare(b.from) ||
        a.title.localeCompare(b.title, "ko"),
    );
    return { concerts: sorted, allWindowsComplete };
  }

  function loadList(force = false) {
    if (!serviceKey) {
      return Promise.resolve({
        configured: false,
        concerts: [],
        fetchedAt: null,
      });
    }
    if (!force && listCache && Date.now() - listCache.at < LIST_TTL_MS) {
      const allCache = getAllProgramsCache();
      const concerts = listCache.concerts.map((c) => ({
        ...c,
        programs: allCache[c.id] || c.programs || [],
      }));
      return Promise.resolve({
        configured: true,
        concerts,
        fetchedAt: listCache.at,
      });
    }
    if (!force && listPromise) return listPromise;

    const run = fetchAllConcerts()
      .then(({ concerts: rawConcerts, allWindowsComplete }) => {
        const validIds = new Set(rawConcerts.map((c) => c.id));

        // DB 동기화: 모든 기간 윈도우 조회가 정상 완료되었을 때만 KOPIS에 없는 공연 정리
        if (allWindowsComplete && validIds.size > 0) {
          cleanupOrphanPrograms(validIds);
          for (const detailId of details.keys()) {
            if (!validIds.has(detailId)) {
              details.delete(detailId);
            }
          }
        }

        const allCache = getAllProgramsCache();
        const concerts = rawConcerts.map((c) => ({
          ...c,
          programs: allCache[c.id] || [],
        }));

        listCache = { at: Date.now(), concerts };
        listError = null;
        enqueue(concerts);
        console.log(`KOPIS classical concerts: ${concerts.length}`);

        // 모든 '공연예정' 공연에 대해 AI 프로그램 추출 큐 실행
        startUpcomingProgramsWorker(concerts, getDetail);

        return { configured: true, concerts, fetchedAt: listCache.at };
      })
      .catch((error) => {
        listError = error.message;
        throw error;
      });

    listPromise = run.finally(() => {
      listPromise = null;
    });
    return listPromise;
  }

  function getDetail(id) {
    if (details.has(id)) return Promise.resolve(details.get(id));
    if (!inflight.has(id)) {
      const request = kopisGet(`pblprfr/${id}`, {})
        .then((rows) => {
          const row = rows[0];
          if (!row) throw new Error("공연 정보를 찾지 못했습니다.");
          const detail = mapDetail(row);
          const allCache = getAllProgramsCache();
          detail.programs = allCache[id] || [];
          details.set(id, detail);
          failed.delete(id);
          return detail;
        })
        .finally(() => {
          inflight.delete(id);
        });
      inflight.set(id, request);
    }
    return inflight.get(id);
  }

  function enqueue(concerts) {
    for (const concert of concerts) {
      if (concert.state === "공연완료") continue;
      if (
        details.has(concert.id) ||
        queued.has(concert.id) ||
        failed.has(concert.id)
      )
        continue;
      queued.add(concert.id);
      queue.push(concert);
    }
    pump();
  }

  function pump() {
    while (workers < 1 && queue.length) {
      workers += 1;
      worker();
    }
  }

  async function worker() {
    try {
      while (queue.length) {
        const concert = queue.shift();
        queued.delete(concert.id);
        try {
          await getDetail(concert.id);
        } catch {
          failed.add(concert.id);
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } finally {
      workers -= 1;
      if (queue.length) pump();
    }
  }

  function indexStats() {
    const targets = (listCache?.concerts || []).filter(
      (concert) => concert.state !== "공연완료",
    );
    const indexed = targets.filter(
      (concert) => details.has(concert.id) || failed.has(concert.id),
    ).length;
    return {
      indexed,
      total: targets.length,
      running: workers > 0 || queue.length > 0,
    };
  }

  return {
    async status() {
      const index = indexStats();
      return {
        configured: Boolean(serviceKey),
        loading: Boolean(listPromise),
        error: listError,
        count: listCache?.concerts.length ?? 0,
        fetchedAt: listCache?.at ?? null,
        ...index,
      };
    },
    concerts(force) {
      return loadList(force);
    },
    async concert(id) {
      if (!serviceKey) {
        const error = new Error("KOPIS 서비스 키가 없습니다.");
        error.status = 400;
        throw error;
      }
      if (!/^PF[A-Za-z0-9]+$/.test(id)) {
        const error = new Error("공연 ID가 올바르지 않습니다.");
        error.status = 400;
        throw error;
      }
      const concert = await getDetail(id);
      return { configured: true, concert };
    },
    async matches(kind, query) {
      const needle = String(query || "").trim();
      if (kind !== "artist" && kind !== "song") {
        const error = new Error("알림 종류가 올바르지 않습니다.");
        error.status = 400;
        throw error;
      }
      if (needle.length < 2) {
        const error = new Error("두 글자 이상 입력해 주세요.");
        error.status = 400;
        throw error;
      }

      const list = await loadList(false);
      if (!list.configured) {
        return {
          configured: false,
          matches: [],
          complete: true,
          indexed: 0,
          total: 0,
        };
      }

      const stats = indexStats();
      const matches = [];
      for (const concert of list.concerts) {
        const detail = details.get(concert.id);
        const reason = matchConcert(detail || concert, kind, needle);
        if (!reason) continue;
        matches.push({
          reason,
          concert: detail || concert,
        });
      }

      return {
        configured: true,
        matches,
        complete: stats.total === 0 || stats.indexed >= stats.total,
        indexed: stats.indexed,
        total: stats.total,
      };
    },
  };
}
