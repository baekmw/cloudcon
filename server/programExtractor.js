import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import "dotenv/config";
import {
  DATA_DIR,
  LEGACY_PROGRAMS_DIR,
  PROGRAMS_CACHE_PATH,
  loadUnifiedProgramsCache,
  saveUnifiedProgramsCache,
  writeJsonAtomic,
} from "./storage.js";

// In-memory unified program cache (`server/data/programs_cache.json`)
let memoryCache = loadUnifiedProgramsCache();
console.log(
  `[ProgramCache] Loaded ${Object.keys(memoryCache).length} cached concert programs from ${PROGRAMS_CACHE_PATH}.`
);

export function getAllProgramsCache() {
  return memoryCache;
}

/**
 * Atomically save unified programs cache (`server/data/programs_cache.json`)
 * by writing to a temporary file (*.tmp) first and renaming with fs.renameSync.
 */
export function saveProgramsCache() {
  saveUnifiedProgramsCache(memoryCache);
}

/**
 * 관리자 페이지에서 특정 공연(concertId)의 AI 추출 프로그램을 수동 수정·저장
 */
export function updateConcertProgramCache(concertId, programs) {
  const normalized = Array.isArray(programs)
    ? programs.map((item, idx) => {
        const movements = Array.isArray(item.movements)
          ? item.movements.map((m) => String(m || "").trim()).filter(Boolean)
          : typeof item.movements === "string" && item.movements.trim()
            ? item.movements
                .split(/\r?\n/)
                .map((m) => m.trim())
                .filter(Boolean)
            : undefined;

        const base = {
          ...item,
          id: item.id || `manual-${idx + 1}`,
          composer: String(item.composer ?? "").trim(),
          composerKo: String(item.composerKo ?? item.composer ?? "").trim(),
          composerShort: String(
            item.composerShort ?? item.composerKo ?? item.composer ?? ""
          ).trim(),
          title: String(item.title ?? "").trim(),
          titleKo: String(item.titleKo ?? item.title ?? "").trim(),
          duration: String(item.duration ?? "").trim(),
          searchingWord: String(
            item.searchingWord ??
              `${item.composerShort || item.composerKo || ""} ${
                item.titleKo || item.title || ""
              }`
          ).trim(),
          source: item.source || "admin_edited",
        };

        if (item.genre !== undefined) {
          base.genre = String(item.genre ?? "").trim();
        }
        if (movements !== undefined) {
          base.movements = movements;
        }

        return base;
      })
    : [];

  memoryCache[concertId] = normalized;
  writeJsonAtomic(PROGRAMS_CACHE_PATH, memoryCache);
  return normalized;
}

/**
 * Remove any concert programs from DB/cache if the concert no longer exists in KOPIS
 */
export function cleanupOrphanPrograms(validConcertIds) {
  if (!validConcertIds || validConcertIds.size === 0) return;

  let changed = false;
  let deletedCount = 0;

  for (const concertId of Object.keys(memoryCache)) {
    if (!validConcertIds.has(concertId)) {
      delete memoryCache[concertId];
      changed = true;
      deletedCount++;

      const singleFilePath = path.join(LEGACY_PROGRAMS_DIR, `${concertId}.json`);
      try {
        if (fs.existsSync(singleFilePath)) {
          fs.unlinkSync(singleFilePath);
        }
      } catch {
        // ignore
      }
    }
  }

  // Also remove orphan individual json files in legacy dir if present
  try {
    if (fs.existsSync(LEGACY_PROGRAMS_DIR)) {
      const files = fs.readdirSync(LEGACY_PROGRAMS_DIR);
      for (const file of files) {
        if (file.endsWith(".json") && file !== "programs_cache.json") {
          const id = file.replace(".json", "");
          if (!validConcertIds.has(id)) {
            fs.unlinkSync(path.join(LEGACY_PROGRAMS_DIR, file));
          }
        }
      }
    }
  } catch {
    // ignore
  }

  if (changed) {
    saveProgramsCache();
    console.log(`[DB정리] 존재하지 않는 공연 ${deletedCount}건의 프로그램 데이터를 DB에서 완전 삭제했습니다.`);
  }
}

// =========================================================================
// Gemini API Rate Limiter & Global Sequential Execution Queue (15 RPM Strict 준수)
// =========================================================================
const MAX_RPM = 14; // Gemini Free Tier 15 RPM 한도 내 안전 마진 (분당 최대 14회)
const WINDOW_MS = 60000; // 60초 슬라이딩 윈도우
const MIN_GAP_MS = 4500; // 연속 호출 간 최소 4.5초 간격 보장

const callTimestamps = [];
let lastCallTime = 0;
let dailyCallCount = 0;
let dailyCallDate = new Date().toISOString().slice(0, 10);
const MAX_CALLS_PER_DAY = 480; // 일일 무료 한도 500 RPD 대비 안전선

const GEMINI_MODELS = [
  process.env.GEMINI_MODEL || "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
];
let globalGeminiQueue = Promise.resolve();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireRateLimitSlot() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyCallDate) {
    dailyCallDate = today;
    dailyCallCount = 0;
  }

  if (dailyCallCount >= MAX_CALLS_PER_DAY) {
    console.warn(
      `[Gemini RateLimit] 일일 무료 한도(${MAX_CALLS_PER_DAY}회)에 도달하여 금일 AI 호출을 중단합니다.`
    );
    return false;
  }

  while (true) {
    const now = Date.now();

    // 60초 지난 오래된 호출 타임스탬프 정리
    while (callTimestamps.length > 0 && now - callTimestamps[0] >= WINDOW_MS) {
      callTimestamps.shift();
    }

    // 1) 60초 슬라이딩 윈도우 내 호출 수가 MAX_RPM 이상이면 대기
    if (callTimestamps.length >= MAX_RPM) {
      const oldest = callTimestamps[0];
      const waitTime = oldest + WINDOW_MS - now + 250;
      if (waitTime > 0) {
        console.log(
          `[Gemini RateLimit] 15 RPM 준수를 위해 ${Math.ceil(
            waitTime / 1000
          )}초 대기합니다. (최근 1분간 ${callTimestamps.length}회 호출됨)`
        );
        await sleep(waitTime);
        continue;
      }
    }

    // 2) 직전 호출과의 최소 간격 (4.5초) 확인
    const gap = now - lastCallTime;
    if (gap < MIN_GAP_MS) {
      await sleep(MIN_GAP_MS - gap);
      continue;
    }

    // 슬롯 획득 성공
    const callTime = Date.now();
    callTimestamps.push(callTime);
    lastCallTime = callTime;
    dailyCallCount++;
    return true;
  }
}

/**
 * 공연이 순수 클래식(서양 고전음악) 공연인지 검증
 */
export function isClassicalConcert(concert) {
  if (!concert) return false;
  const genre = String(concert.genre || "").trim();
  // KOPIS 장르 분류가 서양음악(클래식)이 아니면 제외
  if (genre && !genre.includes("서양음악") && !genre.includes("클래식")) {
    return false;
  }

  const title = String(concert.title || "").trim();
  // 국악, 대중가요, 뮤지컬, 트로트 등 비클래식 공연 제외 (단, '클래식' 단어가 제목에 명시된 퓨전/해설은 허용)
  const nonClassicalRegex = /국악|판소리|마당놀이|트로트|K-POP|대중가요|뮤지컬\s*(갈라|콘서트)?|힙합/i;
  if (nonClassicalRegex.test(title) && !title.includes("클래식")) {
    return false;
  }

  return true;
}
export function enqueueGeminiTask(taskFn) {
  const run = async () => {
    const allowed = await acquireRateLimitSlot();
    if (!allowed) return null;
    return await taskFn();
  };

  const next = globalGeminiQueue.then(run, run);
  globalGeminiQueue = next.catch(() => {});
  return next;
}

/**
 * 여러 개의 이미지 URL(포스터 + 세부 이미지 전체)을 다운로드하여 Gemini Vision inlineData 배열로 변환
 */
async function fetchImagesToInlineData(imageUrls = []) {
  const urls = Array.from(
    new Set(
      (Array.isArray(imageUrls) ? imageUrls : [imageUrls])
        .filter((u) => typeof u === "string" && u.trim().startsWith("http"))
        .map((u) => u.trim())
    )
  ).slice(0, 8); // 안전을 위해 최대 8장까지 일괄 입력

  if (urls.length === 0) return [];

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const contentType = res.headers.get("content-type") || "image/jpeg";
      return {
        inlineData: {
          data: base64,
          mimeType: contentType.split(";")[0].trim() || "image/jpeg",
        },
      };
    })
  );

  return results
    .filter((r) => r.status === "fulfilled" && r.value?.inlineData?.data)
    .map((r) => r.value);
}

/**
 * Call Gemini Flash Lite Vision API with multiple images (포스터 + 모든 세부 이미지 일괄 입력)
 */
export async function extractProgramWithGemini(
  imageUrls,
  apiKey,
  storyText = ""
) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) return null;

  return enqueueGeminiTask(async () => {
    let attempts = 0;
    const maxRetries = 3;

    while (attempts < maxRetries) {
      attempts++;
      try {
        // 1. 포스터 및 모든 세부 이미지를 병렬로 다운로드하여 base64 변환
        const imageParts = await fetchImagesToInlineData(imageUrls);
        if (imageParts.length === 0) {
          console.warn("[Gemini AI] 유효한 공연 이미지를 다운로드하지 못했습니다.");
          return [];
        }

        // 2. 클래식 음악(서양 고전음악)만 추출하도록 엄격히 제한하는 프롬프트
        let prompt = `당신은 서양 클래식 음악 전문 에디터입니다.
이 서비스는 오직 '클래식 음악(서양 고전음악)' 연주회만을 다룹니다.
제공된 공연 포스터 및 세부 안내 이미지들(총 ${imageParts.length}장), 그리고 공연 소개글을 종합적으로 분석하여
해당 공연에서 연주되는 클래식 연주 프로그램(곡목) 목록을 순수 JSON 배열로 반환하세요.

[필수 엄격 작성 규칙]
1. 오직 클래식 음악(교향곡, 협주곡, 독주곡, 소나타, 실내악, 가곡, 오페라 아리아 등 서양 고전음악 레퍼토리)만 추출하세요.
2. 대중가요, 팝송, 뮤지컬 넘버, 트로트, 국악, 영화/애니메이션 OST 등 비클래식 곡목은 절대로 추출하지 마세요.
3. 곡명(title 또는 titleKo)이 식별되지 않는 항목은 절대 포함하지 마세요. 작곡가만 있고 구체적인 곡명이 없는 항목은 연주곡이 아닙니다.
4. 포스터나 세부 이미지, 소개글에서 연주되는 교향곡, 협주곡, 소나타, 소품 등 구체적인 곡명을 반드시 찾아내세요.
5. 세부 이미지가 여러 장 제공된 경우, 각 이미지에 나뉘어 있는 1부/2부 연주곡 목록이나 상세 프로그램 안내를 모두 꼼꼼히 확인하여 전체 곡을 빠짐없이 추출하세요.
6. 만약 포스터에 '쇼팽 피아노 독주회', '베토벤 교향곡 제9번'처럼 공연 제목 자체에 연주곡이 명시되어 있다면 해당 곡을 프로그램에 포함하세요.
7. 클래식 연주곡이 전혀 식별되지 않거나 비클래식 공연인 경우 반드시 빈 배열 []을 반환하세요.

반환형식 (JSON 배열):
[
  {
    "composer": "원어 작곡가명 (예: Ludwig van Beethoven)",
    "composerKo": "한글 작곡가명 (예: 베토벤)",
    "composerShort": "작곡가 성/약칭 (예: 베토벤)",
    "title": "원어 전체 곡명 (예: Symphony No. 9 in D minor, Op. 125 'Choral')",
    "titleKo": "한글 번역 곡명 (예: 교향곡 제9번 라단조, 작품번호 125 '합창')",
    "genre": "장르 (예: 교향곡, 피아노 협주곡 등)",
    "movements": ["I. Allegro ma non troppo", "II. Molto vivace"],
    "duration": "소요시간",
    "searchingWord": "유저 검색용 줄임말/별칭/키워드 모음 (띄어쓰기 구분, 예: 베토벤9 합창 심포니9)"
  }
]`;

        if (storyText && storyText.trim()) {
          const cleanStory = storyText.trim().slice(0, 2000);
          prompt += `\n\n[참고용 공연 상세 소개글]\n${cleanStory}\n\n위 소개글과 이미지들을 함께 대조하여 누락 없는 정확한 프로그램 목록을 작성하세요.`;
        }

        const ai = new GoogleGenAI({ apiKey: key });
        let response = null;
        let usedModel = GEMINI_MODELS[0];

        for (const candidateModel of GEMINI_MODELS) {
          try {
            console.log(
              `[Gemini AI] Calling ${candidateModel} (이미지 ${imageParts.length}장 일괄 입력, 오늘 ${dailyCallCount}회차)`
            );
            response = await ai.models.generateContent({
              model: candidateModel,
              contents: [...imageParts, prompt],
              config: {
                responseMimeType: "application/json",
                temperature: 0.1,
              },
            });
            usedModel = candidateModel;
            break;
          } catch (modelErr) {
            const isQuotaExceeded =
              modelErr.status === 429 ||
              modelErr.message?.includes("429") ||
              modelErr.message?.includes("RESOURCE_EXHAUSTED");
            if (isQuotaExceeded && candidateModel !== GEMINI_MODELS[GEMINI_MODELS.length - 1]) {
              console.warn(`[Gemini AI] ${candidateModel} 쿼터 초과. 다음 후보 모델로 대체 시도합니다...`);
              continue;
            }
            throw modelErr;
          }
        }

        let rawText = response.text;
        if (!rawText) return [];

        rawText = rawText
          .replace(/```json/gi, "")
          .replace(/```/g, "")
          .trim();
        const parsed = JSON.parse(rawText);

        if (Array.isArray(parsed) && parsed.length > 0) {
          // title 또는 titleKo 중 최소 하나는 반드시 내용이 있는 유효한 곡만 필터링 (제목 "" 원천 제거)
          const validTracks = parsed.filter(
            (item) =>
              (item.title && String(item.title).trim().length > 0) ||
              (item.titleKo && String(item.titleKo).trim().length > 0)
          );

          return validTracks.map((item, idx) => ({
            id: `ai-${idx + 1}`,
            composer: String(item.composer || "").trim(),
            composerKo: String(item.composerKo || item.composer || "").trim(),
            composerShort: String(
              item.composerShort || item.composerKo || item.composer || ""
            ).trim(),
            title: String(item.title || "").trim(),
            titleKo: String(item.titleKo || item.title || "").trim(),
            genre: String(item.genre || "클래식").trim(),
            movements: Array.isArray(item.movements)
              ? item.movements.map((m) => String(m).trim()).filter(Boolean)
              : [],
            duration: String(item.duration || "").trim(),
            searchingWord: String(
              item.searchingWord ||
                `${item.composerShort || item.composerKo || ""} ${
                  item.titleKo || item.title || ""
                }`
            ).trim(),
            source: "ai_vision",
          }));
        }

        return [];
      } catch (err) {
        const is429 = err.status === 429 || err.message?.includes("429");
        if (is429 && attempts < maxRetries) {
          console.warn(
            `⚠️ Gemini API 429 Rate Limit 감지 (시도 ${attempts}/${maxRetries}). 30초 대기 후 자동 재시도합니다...`
          );
          await sleep(30000);
          continue;
        }

        console.warn(`[Gemini AI] 추출 실패 (${attempts}/${maxRetries}):`, err.message);
        if (attempts >= maxRetries) {
          return null;
        }
        await sleep(5000);
      }
    }

    return null;
  });
}

// Track retry attempts for AI extraction
const aiAttempts = new Map();

/**
 * Get or extract the program for a concert (포스터 + 모든 세부 이미지 일괄 전달)
 */
export async function getConcertProgram(
  concert,
  { forceAI = false, apiKey = "" } = {}
) {
  if (!concert || !concert.id) {
    return { source: "none", programs: [] };
  }

  // Check cache unless forceAI
  if (!forceAI && memoryCache[concert.id]) {
    const cachedItems = memoryCache[concert.id];
    const hasDef =
      Array.isArray(cachedItems) &&
      cachedItems.some((item) => item.id?.startsWith("def-"));
    if (hasDef) {
      const attempts = aiAttempts.get(concert.id) || 1;
      if (attempts < 2) {
        delete memoryCache[concert.id];
        aiAttempts.set(concert.id, attempts + 1);
        forceAI = true;
      } else {
        return { source: "none", programs: [] };
      }
    } else {
      return { source: "cache", programs: cachedItems };
    }
  }

  // Completed concerts are strictly skipped from AI to save quota
  if (concert.state === "공연완료") {
    return { source: "completed_skipped", programs: [] };
  }

  // 순수 클래식 공연이 아니면 AI 분석 건너뜀 (국악, 대중가요, 뮤지컬 등 제외)
  if (!isClassicalConcert(concert)) {
    return { source: "non_classical_skipped", programs: [] };
  }

  // Only extract for '공연예정' (or forceAI)
  const key = apiKey || process.env.GEMINI_API_KEY || "";
  if (key && (concert.state === "공연예정" || forceAI)) {
    const attempts = aiAttempts.get(concert.id) || 0;
    aiAttempts.set(concert.id, attempts + 1);

    // 포스터 및 세부 이미지들을 모두 모아서 한 번에 전달
    const allImages = [
      concert.poster,
      ...(Array.isArray(concert.images) ? concert.images : []),
    ].filter((u) => typeof u === "string" && u.trim().startsWith("http"));

    if (allImages.length > 0) {
      const aiResult = await extractProgramWithGemini(
        allImages,
        key,
        concert.story
      );
      if (aiResult && aiResult.length > 0) {
        memoryCache[concert.id] = aiResult;
        saveProgramsCache();
        return { source: "ai_vision", programs: aiResult };
      }
    }
  }

  return { source: "none", programs: [] };
}

// Background sequential queue for upcoming concerts
let isWorkerRunning = false;

export async function startUpcomingProgramsWorker(concerts, getDetailFn) {
  if (isWorkerRunning) return;
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.log("[Worker] GEMINI_API_KEY가 설정되지 않아 백그라운드 AI 분석을 건너뜁니다.");
    return;
  }

  // Filter: only '공연예정' concerts that do NOT have cached programs yet (클래식 공연만 선별)
  const upcomingTargets = concerts.filter(
    (c) => c.state === "공연예정" && !memoryCache[c.id] && isClassicalConcert(c)
  );

  if (upcomingTargets.length === 0) {
    console.log("[Worker] 모든 '공연예정' 공연의 프로그램 데이터가 이미 준비되어 있습니다.");
    return;
  }

  console.log(`[Worker] '공연예정' 공연 ${upcomingTargets.length}건에 대해 순차적 AI 프로그램 추출을 시작합니다. (RPM 15 엄격 준수)`);
  isWorkerRunning = true;

  try {
    for (const target of upcomingTargets) {
      if (memoryCache[target.id]) continue;

      if (dailyCallCount >= MAX_CALLS_PER_DAY) {
        console.log(`[Worker] 일일 한도(${MAX_CALLS_PER_DAY}) 도달로 금일 작업 종료.`);
        break;
      }

      try {
        let detail = target;
        if (getDetailFn && (!target.images || target.images.length === 0 || !target.story)) {
          detail = await getDetailFn(target.id);
        }

        const allImages = [
          detail.poster,
          ...(Array.isArray(detail.images) ? detail.images : []),
        ].filter((u) => typeof u === "string" && u.trim().startsWith("http"));

        if (allImages.length > 0) {
          const aiResult = await extractProgramWithGemini(
            allImages,
            key,
            detail.story
          );
          if (aiResult && aiResult.length > 0) {
            memoryCache[target.id] = aiResult;
            target.programs = aiResult;
            saveProgramsCache();
            console.log(`[Worker] '${target.title}' (${target.id}) 프로그램 ${aiResult.length}곡 추출 완료 (이미지 ${allImages.length}장 분석).`);
          }
        }
      } catch (err) {
        console.warn(`[Worker] ${target.id} 처리 중 오류:`, err.message);
      }
    }
  } finally {
    isWorkerRunning = false;
  }
}

/**
 * 곡명이 빈 문자열("")이거나 누락된 캐시 항목들을 찾아,
 * 포스터 + 모든 세부 이미지를 일괄 입력하여 15 RPM 준수 하에 재분석·재추출하는 함수
 */
let isReextractRunning = false;

export async function reextractEmptyTitlePrograms(kopisApi, apiKey) {
  if (isReextractRunning) {
    return { ok: false, message: "이미 재추출 작업이 진행 중입니다." };
  }

  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    return { ok: false, message: "GEMINI_API_KEY가 설정되지 않았습니다." };
  }

  // 1. 캐시 내에서 제목이 빈 곡이 포함된 공연 식별
  const targetIds = [];
  for (const [id, progs] of Object.entries(memoryCache)) {
    if (Array.isArray(progs) && progs.length > 0) {
      const hasEmpty = progs.some(
        (p) =>
          (!p.title || String(p.title).trim().length === 0) &&
          (!p.titleKo || String(p.titleKo).trim().length === 0)
      );
      if (hasEmpty) {
        targetIds.push(id);
      }
    }
  }

  if (targetIds.length === 0) {
    console.log("[Reextract] 곡명이 비어있는 캐시 항목이 없습니다.");
    return { ok: true, total: 0, updated: 0, message: "곡명이 비어있는 공연이 없습니다." };
  }

  console.log(
    `[Reextract] 곡명("") 누락 공연 총 ${targetIds.length}건에 대해 다중 세부 이미지 재분석을 시작합니다. (15 RPM 준수)`
  );

  isReextractRunning = true;
  let successCount = 0;
  let emptyRemovedCount = 0;

  try {
    for (let i = 0; i < targetIds.length; i++) {
      const id = targetIds[i];
      console.log(`[Reextract] (${i + 1}/${targetIds.length}) ${id} 공연 정보 조회 및 재분석 시작...`);

      try {
        let concert = null;
        if (kopisApi) {
          const detailRes = await kopisApi.concert(id);
          concert = detailRes?.concert;
        }

        if (!concert) {
          console.warn(`[Reextract] ${id} KOPIS 상세 조회 실패로 건너뜁니다.`);
          continue;
        }

        if (!isClassicalConcert(concert)) {
          console.log(`[Reextract] ${id} '${concert.title}' 클래식 공연이 아니므로 프로그램 캐시를 빈 배열로 정리합니다.`);
          memoryCache[id] = [];
          saveProgramsCache();
          emptyRemovedCount++;
          continue;
        }

        const allImages = [
          concert.poster,
          ...(Array.isArray(concert.images) ? concert.images : []),
        ].filter((u) => typeof u === "string" && u.trim().startsWith("http"));

        console.log(
          `[Reextract] ${id} '${concert.title}' 분석 대상 이미지: 총 ${allImages.length}장 (포스터 + 세부 이미지)`
        );

        const aiResult = await extractProgramWithGemini(allImages, key, concert.story);

        if (Array.isArray(aiResult) && aiResult.length > 0) {
          memoryCache[id] = aiResult;
          saveProgramsCache();
          successCount++;
          console.log(`[Reextract] ✓ ${id} '${concert.title}' 유효 곡 ${aiResult.length}곡 재추출 완료.`);
        } else {
          // AI 분석 결과 유효한 곡명이 없는 경우, 기존의 잘못된 제목 없는 곡들 제거
          memoryCache[id] = [];
          saveProgramsCache();
          emptyRemovedCount++;
          console.log(`[Reextract] - ${id} '${concert.title}' 식별 가능한 곡이 없어 빈 배열로 정리했습니다.`);
        }
      } catch (err) {
        console.error(`[Reextract] ${id} 재추출 중 오류:`, err.message);
      }
    }

    console.log(
      `[Reextract 완료] 총 ${targetIds.length}건 중 ${successCount}건 유효 곡 추출 성공, ${emptyRemovedCount}건 정리 완료.`
    );

    return {
      ok: true,
      total: targetIds.length,
      updated: successCount,
      cleaned: emptyRemovedCount,
      message: `총 ${targetIds.length}건 중 ${successCount}건 곡 추출 성공, ${emptyRemovedCount}건 정리 완료.`,
    };
  } finally {
    isReextractRunning = false;
  }
}
