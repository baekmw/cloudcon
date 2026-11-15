import cron from "node-cron";
import {
  getAllProgramsCache,
  saveProgramsCache,
  extractProgramWithGemini,
} from "./programExtractor.js";
import {
  appendBatchLog,
  getKstTimestampString,
  loadKnownConcertIds,
  loadSubscribers,
  saveKnownConcertIds,
  saveSubscribers,
} from "./storage.js";
import {
  BATCH_SEND_DELAY_MS,
  canSendBatchEmail,
  sendConcertAlertEmail,
  sendTicketOpenAlertEmail,
  sleep,
} from "./emailService.js";
import { matchConcertClassical } from "../src/lib/classical.js";
import { fetchNolUpcomingClassical } from "./nolCrawler.js";
import { fetchYes24Classical } from "./yes24Crawler.js";

const GEMINI_SLEEP_MS = 4000; // Rate Limit 방어용 호출 간 4초 sleep

let isBatchRunning = false;
let cronTask = null;

export function getBatchRunningStatus() {
  return isBatchRunning;
}

/**
 * 공백 제거 및 소문자 변환 유틸리티 (단순 포함 여부 includes 매칭용)
 */
export function normalizeCompact(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

/**
 * 단일 공연의 매칭 대상 텍스트 풀 생성 (title, cast, venue, area, AI 추출 프로그램의 searchingWord 등)
 */
export function buildConcertSearchPool(concert, programs = []) {
  const parts = [
    concert.title,
    concert.cast,
    concert.crew,
    concert.venue,
    concert.area,
    concert.organizer,
    concert.presenter,
    concert.producer,
  ];

  if (Array.isArray(programs)) {
    for (const track of programs) {
      if (!track) continue;
      parts.push(
        track.composer,
        track.composerKo,
        track.composerShort,
        track.title,
        track.titleKo,
        track.searchingWord
      );
    }
  }

  return normalizeCompact(parts.filter(Boolean).join(" "));
}

/**
 * 단일 공연이 특정 키워드와 매칭되는지 검사 (검색 엔진과 동일한 매칭 + 공백 제거 단순 includes)
 */
export function doesConcertMatchKeyword(concert, programs, keyword) {
  const cleanKw = normalizeCompact(keyword);
  if (!cleanKw) return false;
  if (matchConcertClassical(concert, keyword, programs).matched) {
    return true;
  }
  const pool = buildConcertSearchPool(concert, programs);
  return pool.includes(cleanKw);
}

/**
 * 사용자가 새로운 키워드를 등록했을 때, 현재 DB에 이미 존재하는 기존 매칭 공연들을
 * 미리 notifiedIds에 사전 등록(preseed)하여 알림 메일 발송 대상에서 제외
 */
export async function preseedExistingConcertsForKeyword(kopisApi, email, keyword) {
  const cleanKw = normalizeCompact(keyword);
  if (!email || !cleanKw) return;

  try {
    const subscribers = loadSubscribers();
    const sub = subscribers[email];
    if (!sub) return;

    const listRes = await kopisApi.concerts(false);
    const activeConcerts = (listRes?.concerts || []).filter((c) => c.state !== "공연완료");
    const programsCache = getAllProgramsCache();

    const notifiedSet = new Set(Array.isArray(sub.notifiedIds) ? sub.notifiedIds : []);

    for (const concert of activeConcerts) {
      const programs = programsCache[concert.id] || concert.programs || [];
      if (doesConcertMatchKeyword(concert, programs, cleanKw)) {
        notifiedSet.add(concert.id);
        if (concert.ticketOpen && concert.ticketOpen.openAt) {
          notifiedSet.add(`ticketopen-${concert.id}`);
        }
      }
    }

    sub.notifiedIds = [...notifiedSet];
    subscribers[email] = sub;
    saveSubscribers(subscribers);
    console.log(
      `[Preseed] ${email}에 키워드 '${keyword}' 관련 기존 공연 ${notifiedSet.size}건 사전 등록 완료 (발송 제외)`
    );
  } catch (err) {
    console.warn(`[Preseed] 기존 공연 사전 등록 실패 (${email}, ${keyword}):`, err.message);
  }
}

/**
 * KOPIS 신규 공연 수집 + 미캐시 공연 Gemini 프로그램 추출(4초 딜레이) + 구독자 키워드 매칭 및 이메일 발송 배치
 */
export async function runBatchJob(kopisApi, { trigger = "cron" } = {}) {
  if (isBatchRunning) {
    console.log("[BatchCron] 이미 배치가 실행 중이므로 건너뜁니다.");
    return {
      ok: false,
      skipped: true,
      reason: "already_running",
      error: "이미 배치가 실행 중입니다.",
    };
  }

  isBatchRunning = true;
  const timestamp = getKstTimestampString();
  const triggerLabel = trigger === "manual" ? "수동 실행" : "정기 배치";
  console.log(`[BatchCron] ${triggerLabel} 시작 (${timestamp})`);

  let newConcertsCount = 0;
  let emailsSent = 0;

  try {
    // 1-1. NOL 티켓 오픈 예정 클래식 공연 크롤링
    try {
      console.log("[BatchCron] NOL 티켓오픈 클래식 공연 수집 시작...");
      await fetchNolUpcomingClassical();
    } catch (nolErr) {
      console.warn("[BatchCron] NOL 티켓오픈 수집 오류 (진행 계속):", nolErr.message);
    }

    // 1-2. YES24 클래식 공연 및 티켓 오픈 크롤링
    try {
      console.log("[BatchCron] YES24 클래식 공연 및 티켓오픈 수집 시작...");
      await fetchYes24Classical();
    } catch (yesErr) {
      console.warn("[BatchCron] YES24 수집 오류 (진행 계속):", yesErr.message);
    }

    // 2. KOPIS 최신 공연 목록 강제 갱신 (NOL 데이터 자동 병합 및 중복 제거)
    const listResult = await kopisApi.concerts(true);
    const concerts = listResult?.concerts || [];
    const programsCache = getAllProgramsCache();
    const geminiKey = (process.env.GEMINI_API_KEY || "").trim();

    // 2. programs_cache.json에 없는 신규(공연예정/공연중) 공연만 gemini-3.5-flash-lite로 프로그램 추출
    const activeConcerts = concerts.filter((c) => c.state !== "공연완료");
    const uncachedConcerts = activeConcerts.filter(
      (c) => !Object.prototype.hasOwnProperty.call(programsCache, c.id)
    );

    if (geminiKey && uncachedConcerts.length > 0) {
      console.log(
        `[BatchCron] programs_cache.json 미등록 공연 ${uncachedConcerts.length}건 AI 추출 시작 (호출 간 4초 sleep)...`
      );

      for (const summary of uncachedConcerts) {
        if (Object.prototype.hasOwnProperty.call(programsCache, summary.id)) {
          continue;
        }

        try {
          const detailRes = await kopisApi.concert(summary.id);
          const detail = detailRes?.concert || summary;
          const imagesToScan =
            detail.images && detail.images.length > 0
              ? detail.images.slice(0, 2)
              : detail.poster
              ? [detail.poster]
              : [];

          let extracted = [];
          for (const imgUrl of imagesToScan) {
            const aiResult = await extractProgramWithGemini(
              imgUrl,
              geminiKey,
              detail.story
            );
            // Rate Limit 방어용 4초 sleep
            await sleep(GEMINI_SLEEP_MS);

            if (Array.isArray(aiResult) && aiResult.length > 0) {
              extracted = aiResult;
              break;
            }
          }

          if (extracted.length > 0) {
            programsCache[summary.id] = extracted;
            summary.programs = extracted;
            newConcertsCount += 1;
            // Atomic Write (programs_cache.json.tmp -> programs_cache.json)
            saveProgramsCache();
          }
        } catch (err) {
          console.warn(
            `[BatchCron] 공연 ${summary.id} 상세/AI 추출 실패:`,
            err.message
          );
        }
      }
    }

    // 3. verified: true 구독자들의 keywords와 공연 정보 매칭
    const subscribers = loadSubscribers();
    const verifiedEntries = Object.entries(subscribers).filter(
      ([, sub]) =>
        sub &&
        sub.verified === true &&
        Array.isArray(sub.keywords) &&
        sub.keywords.length > 0
    );

    // 3-0. known_concerts.json 로드 및 신규 추가된 공연/티켓오픈 판별
    // (기존 공연은 절대 발송하지 않고, 배치에서 새로 추가된 공연에 한해서만 발송)
    const knownConcertIds = loadKnownConcertIds();
    const isFirstKnownRun = knownConcertIds.size === 0;

    if (isFirstKnownRun) {
      for (const c of activeConcerts) {
        knownConcertIds.add(c.id);
        if (c.ticketOpen && c.ticketOpen.openAt) {
          knownConcertIds.add(`ticketopen-${c.id}`);
        }
      }
      saveKnownConcertIds(knownConcertIds);
      console.log(
        `[BatchCron] known_concerts 초기화 완료: 기존 공연 ${knownConcertIds.size}건 등록 (기존 공연 발송 제외)`
      );
    }

    // 신규 추가된 공연 및 신규 티켓 오픈 필터링
    const newlyAddedConcerts = isFirstKnownRun
      ? []
      : activeConcerts.filter((c) => !knownConcertIds.has(c.id));

    const newlyAnnouncedTicketOpens = isFirstKnownRun
      ? []
      : activeConcerts.filter(
          (c) =>
            c.ticketOpen &&
            c.ticketOpen.openAt &&
            c.ticketOpen.isUpcoming !== false &&
            !knownConcertIds.has(`ticketopen-${c.id}`)
        );

    console.log(
      `[BatchCron] 신규 추가 공연: ${newlyAddedConcerts.length}건, 신규 오픈 티켓: ${newlyAnnouncedTicketOpens.length}건`
    );

    if (
      verifiedEntries.length > 0 &&
      (newlyAddedConcerts.length > 0 || newlyAnnouncedTicketOpens.length > 0)
    ) {
      // 신규 공연들에 대한 상세 정보 확보 (캐스팅, 프로그램 등)
      const targetConcerts = [
        ...new Set([...newlyAddedConcerts, ...newlyAnnouncedTicketOpens]),
      ];
      const enrichedMap = new Map();

      for (const c of targetConcerts) {
        try {
          const detailRes = await kopisApi.concert(c.id);
          enrichedMap.set(c.id, detailRes?.concert || c);
        } catch {
          enrichedMap.set(c.id, c);
        }
      }

      for (const [email, sub] of verifiedEntries) {
        if (!canSendBatchEmail()) {
          console.warn(
            "[BatchCron] 일일 배치 알림 발송 상한(80통)에 도달하여 남은 발송을 중단합니다."
          );
          break;
        }

        const notifiedSet = new Set(
          Array.isArray(sub.notifiedIds) ? sub.notifiedIds : []
        );

        // 3-1. 신규 티켓 오픈 예정 공연 우선 매칭 및 알림 발송
        const matchedTicketOpens = [];
        for (const rawConcert of newlyAnnouncedTicketOpens) {
          const concert = enrichedMap.get(rawConcert.id) || rawConcert;
          if (
            notifiedSet.has(`ticketopen-${concert.id}`) ||
            notifiedSet.has(concert.id)
          ) {
            continue;
          }

          const programs = programsCache[concert.id] || concert.programs || [];
          const matchedKeywords = sub.keywords.filter((kw) =>
            doesConcertMatchKeyword(concert, programs, kw)
          );

          if (matchedKeywords.length > 0) {
            matchedTicketOpens.push({
              concert,
              matchedKeywords,
            });
          }
        }

        if (matchedTicketOpens.length > 0) {
          try {
            const sendRes = await sendTicketOpenAlertEmail(
              email,
              sub.manageToken,
              matchedTicketOpens
            );

            if (sendRes.ok) {
              emailsSent += 1;
              for (const item of matchedTicketOpens) {
                notifiedSet.add(`ticketopen-${item.concert.id}`);
                notifiedSet.add(item.concert.id);
              }
              sub.notifiedIds = [...notifiedSet];
              sub.totalEmailsSent = Number(sub.totalEmailsSent || 0) + 1;
              sub.lastEmailSentAt = new Date().toISOString();
              subscribers[email] = sub;
              saveSubscribers(subscribers);
              await sleep(BATCH_SEND_DELAY_MS);
            } else if (sendRes.reason === "quota_exceeded") {
              break;
            }
          } catch (tErr) {
            console.error(
              `[BatchCron] ${email} 티켓 오픈 메일 발송 실패:`,
              tErr.message
            );
          }
        }

        // 3-2. 일반 신규 공연 매칭 및 알림 발송
        const matchedItems = [];

        for (const rawConcert of newlyAddedConcerts) {
          const concert = enrichedMap.get(rawConcert.id) || rawConcert;
          // 이미 발송된 공연(notifiedIds)은 제외
          if (notifiedSet.has(concert.id)) continue;

          const programs = programsCache[concert.id] || concert.programs || [];
          const matchedKeywords = sub.keywords.filter((kw) =>
            doesConcertMatchKeyword(concert, programs, kw)
          );

          if (matchedKeywords.length > 0) {
            matchedItems.push({
              concert,
              matchedKeywords,
            });
          }
        }

        if (matchedItems.length === 0) continue;

        try {
          const sendRes = await sendConcertAlertEmail(
            email,
            sub.manageToken,
            matchedItems
          );

          if (sendRes.ok) {
            emailsSent += 1;
            // 발송 성공한 concertId를 notifiedIds에 기록하고 Atomic Write
            for (const item of matchedItems) {
              notifiedSet.add(item.concert.id);
            }
            sub.notifiedIds = [...notifiedSet];
            sub.totalEmailsSent = Number(sub.totalEmailsSent || 0) + 1;
            sub.lastEmailSentAt = new Date().toISOString();
            subscribers[email] = sub;
            saveSubscribers(subscribers);

            // 순차 발송 딜레이 적용 (1초)
            await sleep(BATCH_SEND_DELAY_MS);
          } else if (sendRes.reason === "quota_exceeded") {
            break;
          }
        } catch (emailErr) {
          console.error(
            `[BatchCron] ${email} 알림 메일 발송 실패:`,
            emailErr.message
          );
        }
      }
    }

    // 4. 배치 완료 후 모든 현재 활성 공연 및 티켓 오픈을 knownConcertIds에 등록하여 최신 상태 동기화
    for (const c of activeConcerts) {
      knownConcertIds.add(c.id);
      if (c.ticketOpen && c.ticketOpen.openAt) {
        knownConcertIds.add(`ticketopen-${c.id}`);
      }
    }
    saveKnownConcertIds(knownConcertIds);

    const logEntry = appendBatchLog({
      timestamp,
      newConcerts: newConcertsCount,
      matchedEmails: emailsSent,
      status: "success",
      message: `[${triggerLabel}] 활성 공연 ${activeConcerts.length}건 스캔 · AI 신규 추출 ${newConcertsCount}건 · 알림 메일 ${emailsSent}통 발송`,
    });

    console.log(`[BatchCron] ${triggerLabel} 완료 (발송 메일: ${emailsSent}통)`);
    return {
      ok: true,
      newConcerts: newConcertsCount,
      emailsSent,
      log: logEntry,
    };
  } catch (err) {
    console.error("[BatchCron] 배치 실행 중 오류:", err.message);
    const logEntry = appendBatchLog({
      timestamp,
      newConcerts: newConcertsCount,
      matchedEmails: emailsSent,
      status: "error",
      message: `[${triggerLabel} 오류] ${err.message || "알 수 없는 오류"}`,
    });
    return { ok: false, error: err.message, log: logEntry };
  } finally {
    isBatchRunning = false;
  }
}

/**
 * 일 2회(09:00, 18:00 KST) 크론 스케줄러 시작
 */
export function startBatchCron(kopisApi) {
  if (cronTask) return cronTask;

  cronTask = cron.schedule(
    "0 9,18 * * *",
    () => {
      runBatchJob(kopisApi, { trigger: "cron" }).catch((err) => {
        console.error("[BatchCron] 크론 작업 오류:", err);
      });
    },
    {
      timezone: "Asia/Seoul",
    }
  );

  console.log("[BatchCron] node-cron 등록 완료: 매일 09:00, 18:00 (Asia/Seoul)");
  return cronTask;
}
