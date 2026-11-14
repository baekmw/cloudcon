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
    ? programs.map((item, idx) => ({
        id: item.id || `manual-${idx + 1}`,
        composer: String(item.composer || "").trim(),
        composerKo: String(item.composerKo || item.composer || "").trim(),
        composerShort: String(
          item.composerShort || item.composerKo || item.composer || ""
        ).trim(),
        title: String(item.title || "").trim(),
        titleKo: String(item.titleKo || item.title || "").trim(),
        duration: String(item.duration || "").trim(),
        searchingWord: String(
          item.searchingWord ||
            `${item.composerShort || item.composerKo || ""} ${
              item.titleKo || item.title || ""
            }`
        ).trim(),
        source: item.source || "admin_edited",
      }))
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

// Rate Limiter for Gemini Free Tier (4초 sleep 적용)
let lastCallTime = 0;
const MIN_CALL_GAP_MS = 4000; // 4 seconds sleep between Gemini calls to prevent rate limits
let dailyCallCount = 0;
let dailyCallDate = new Date().toISOString().slice(0, 10);
const MAX_CALLS_PER_DAY = 480; // Strictly below 500 RPD

async function acquireRateLimitToken() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyCallDate) {
    dailyCallDate = today;
    dailyCallCount = 0;
  }

  if (dailyCallCount >= MAX_CALLS_PER_DAY) {
    console.warn(`[Gemini RateLimit] 일일 무료 한도(${MAX_CALLS_PER_DAY}회) 도달. 오늘 AI 호출을 중단합니다.`);
    return false;
  }

  const now = Date.now();
  const waitMs = MIN_CALL_GAP_MS - (now - lastCallTime);
  if (waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
  }
  lastCallTime = Date.now();
  dailyCallCount++;
  return true;
}

/**
 * Call Gemini Flash Lite Vision API to extract structured classical tracks from image (and story text if available)
 */
export async function extractProgramWithGemini(imageUrl, apiKey, storyText = "") {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key || !imageUrl) return null;

  const allowed = await acquireRateLimitToken();
  if (!allowed) return null;

  try {
    // 1. Download image
    const imgRes = await fetch(imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!imgRes.ok) return null;

    const arrayBuffer = await imgRes.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";

    // 2. Minimal prompt to keep token count low
    let prompt = `당신은 클래식 음악 전문 에디터입니다. 이 공연 포스터/상세 이미지에 적힌 연주 프로그램(곡목)을 식별하여 순수 JSON 배열로 반환하세요.
반환형식 (JSON 배열):
[
  {
    "composer": "원어 작곡가명",
    "composerKo": "한글 작곡가명",
    "composerShort": "작곡가 성 (예: 베토벤)",
    "title": "원어 전체 곡명",
    "titleKo": "한글 번역 곡명",
    "duration": "소요시간",
    "searchingWord": "유저 검색용 줄임말/별칭/키워드 모음 (띄어쓰기 구분, 예: 베9 합창 베토벤9)"
  }
]
곡 정보가 없으면 빈 배열 []을 반환하세요.`;

    if (storyText && storyText.trim()) {
      const cleanStory = storyText.trim().slice(0, 1500);
      prompt += `\n\n[참고용 공연 상세 소개글]\n${cleanStory}\n\n위 소개글과 이미지를 함께 종합적으로 대조하여 누락 없는 정확한 프로그램 목록을 작성하세요.`;
    }

    console.log(`[Gemini AI] Calling gemini-3.5-flash-lite for program extraction... (오늘 ${dailyCallCount}회차)`);

    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: [
        {
          inlineData: {
            data: base64Image,
            mimeType: contentType,
          },
        },
        prompt,
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    console.log(response.text);

    let rawText = response.text;
    if (!rawText) return [];

    rawText = rawText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(rawText);

    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((item, idx) => ({
        id: `ai-${idx + 1}`,
        composer: item.composer || "",
        composerKo: item.composerKo || item.composer || "",
        composerShort: item.composerShort || item.composerKo || "",
        title: item.title || "",
        titleKo: item.titleKo || item.title || "",
        duration: item.duration || "",
        searchingWord:
          item.searchingWord || `${item.composerShort} ${item.titleKo}`.trim(),
        source: "ai_vision",
      }));
    }

    return [];
  } catch (err) {
    if (err.status === 429 || err.message?.includes("429")) {
      console.warn("⚠️ Gemini API 429 Rate Limit 초과. 20초간 쿨다운합니다.");
      await new Promise((r) => setTimeout(r, 20000));
    } else {
      console.warn("Gemini extraction failed:", err.message);
    }
    return null;
  }
}

// Track retry attempts for AI extraction
const aiAttempts = new Map();

/**
 * Get or extract the program for a concert
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
    const hasDef = Array.isArray(cachedItems) && cachedItems.some((item) => item.id?.startsWith("def-"));
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

  // Only extract for '공연예정' (or forceAI)
  const key = apiKey || process.env.GEMINI_API_KEY || "";
  if (key && (concert.state === "공연예정" || forceAI)) {
    const attempts = aiAttempts.get(concert.id) || 0;
    aiAttempts.set(concert.id, attempts + 1);

    const imagesToScan = (concert.images && concert.images.length > 0)
      ? concert.images.slice(0, 2)
      : (concert.poster ? [concert.poster] : []);

    for (const imgUrl of imagesToScan) {
      const aiResult = await extractProgramWithGemini(imgUrl, key, concert.story);
      if (aiResult && aiResult.length > 0) {
        memoryCache[concert.id] = aiResult;
        saveProgramsCache();
        return { source: "ai_vision", programs: aiResult };
      }
    }
  }

  // If extraction failed or no program found, return empty array (do NOT create def- items)
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

  // Filter: only '공연예정' concerts that do NOT have cached programs yet
  const upcomingTargets = concerts.filter(
    (c) => c.state === "공연예정" && !memoryCache[c.id]
  );

  if (upcomingTargets.length === 0) {
    console.log("[Worker] 모든 '공연예정' 공연의 프로그램 데이터가 이미 준비되어 있습니다.");
    return;
  }

  console.log(`[Worker] '공연예정' 공연 ${upcomingTargets.length}건에 대해 순차적 AI 프로그램 추출을 시작합니다. (RPM 15 준수)`);
  isWorkerRunning = true;

  try {
    for (const target of upcomingTargets) {
      // If already processed in the meantime (e.g. by user clicking detail page)
      if (memoryCache[target.id]) continue;

      // Stop if daily limit reached
      if (dailyCallCount >= MAX_CALLS_PER_DAY) {
        console.log(`[Worker] 일일 한도(${MAX_CALLS_PER_DAY}) 도달로 금일 작업 종료.`);
        break;
      }

      try {
        let detail = target;
        if (getDetailFn && (!target.images || target.images.length === 0 || !target.story)) {
          detail = await getDetailFn(target.id);
        }

        const images = (detail.images && detail.images.length > 0)
          ? detail.images.slice(0, 2)
          : (detail.poster ? [detail.poster] : []);

        for (const imgUrl of images) {
          const aiResult = await extractProgramWithGemini(imgUrl, key, detail.story);
          if (aiResult && aiResult.length > 0) {
            memoryCache[target.id] = aiResult;
            target.programs = aiResult;
            saveProgramsCache();
            console.log(`[Worker] '${target.title}' (${target.id}) 프로그램 ${aiResult.length}곡 추출 완료.`);
            break;
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
