import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.resolve(process.cwd(), "server/data");
export const LEGACY_PROGRAMS_DIR = path.join(DATA_DIR, "programs");

export const SUBSCRIBERS_PATH = path.join(DATA_DIR, "subscribers.json");
export const PROGRAMS_CACHE_PATH = path.join(DATA_DIR, "programs_cache.json");
export const ANALYTICS_PATH = path.join(DATA_DIR, "analytics.json");
export const LEGACY_PROGRAMS_CACHE_PATH = path.join(
  LEGACY_PROGRAMS_DIR,
  "programs_cache.json"
);

const MAX_RETENTION_DAYS = 30;
const MAX_BATCH_LOGS = 30;

/**
 * 한국 표준시(KST, Asia/Seoul) 기준 날짜 문자열 (YYYY-MM-DD) 반환
 */
export function getKstDateString(date = new Date()) {
  const kstTime = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kstTime.toISOString().slice(0, 10);
}

/**
 * 한국 표준시(KST, Asia/Seoul) 기준 읽기 쉬운 타임스탬프 (YYYY-MM-DD HH:mm:ss) 반환
 */
export function getKstTimestampString(date = new Date()) {
  const kstTime = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kstTime.toISOString().replace("T", " ").slice(0, 19);
}

export function createDefaultAnalytics() {
  return {
    dailyVisitors: {},
    searchCounts: {},
    dailyEmailSent: {},
    batchLogs: [],
  };
}

/**
 * dailyVisitors와 dailyEmailSent에서 최근 30일 치 데이터만 남기고 오래된 날짜 키 자동 정리
 * batchLogs도 최근 30개만 유지
 */
export function pruneAnalyticsData(analytics) {
  if (!analytics || typeof analytics !== "object") {
    return createDefaultAnalytics();
  }

  if (
    !analytics.dailyVisitors ||
    typeof analytics.dailyVisitors !== "object" ||
    Array.isArray(analytics.dailyVisitors)
  ) {
    analytics.dailyVisitors = {};
  }
  if (
    !analytics.searchCounts ||
    typeof analytics.searchCounts !== "object" ||
    Array.isArray(analytics.searchCounts)
  ) {
    analytics.searchCounts = {};
  }
  if (
    !analytics.dailyEmailSent ||
    typeof analytics.dailyEmailSent !== "object" ||
    Array.isArray(analytics.dailyEmailSent)
  ) {
    analytics.dailyEmailSent = {};
  }
  if (!Array.isArray(analytics.batchLogs)) {
    analytics.batchLogs = [];
  }

  // KST 기준 오늘부터 최근 30일(오늘 포함 30일 전 날짜) 계산
  const cutoffMs =
    Date.now() + 9 * 60 * 60 * 1000 - (MAX_RETENTION_DAYS - 1) * 24 * 60 * 60 * 1000;
  const cutoffDateStr = new Date(cutoffMs).toISOString().slice(0, 10);

  for (const dateKey of Object.keys(analytics.dailyVisitors)) {
    if (dateKey < cutoffDateStr) {
      delete analytics.dailyVisitors[dateKey];
    } else if (Array.isArray(analytics.dailyVisitors[dateKey])) {
      analytics.dailyVisitors[dateKey] = [...new Set(analytics.dailyVisitors[dateKey])];
    } else {
      analytics.dailyVisitors[dateKey] = [];
    }
  }

  // 만약 키 개수가 30개를 초과하면 최신순 30개만 유지
  const visitorKeys = Object.keys(analytics.dailyVisitors).sort().reverse();
  if (visitorKeys.length > MAX_RETENTION_DAYS) {
    for (const oldKey of visitorKeys.slice(MAX_RETENTION_DAYS)) {
      delete analytics.dailyVisitors[oldKey];
    }
  }

  for (const dateKey of Object.keys(analytics.dailyEmailSent)) {
    if (dateKey < cutoffDateStr) {
      delete analytics.dailyEmailSent[dateKey];
    } else {
      analytics.dailyEmailSent[dateKey] = Number(analytics.dailyEmailSent[dateKey] || 0);
    }
  }

  const emailKeys = Object.keys(analytics.dailyEmailSent).sort().reverse();
  if (emailKeys.length > MAX_RETENTION_DAYS) {
    for (const oldKey of emailKeys.slice(MAX_RETENTION_DAYS)) {
      delete analytics.dailyEmailSent[oldKey];
    }
  }

  if (analytics.batchLogs.length > MAX_BATCH_LOGS) {
    analytics.batchLogs = analytics.batchLogs.slice(0, MAX_BATCH_LOGS);
  }

  return analytics;
}

/**
 * 서버 부팅 시 data 디렉터리(fs.mkdirSync(..., { recursive: true }))와
 * subscribers.json, programs_cache.json, analytics.json 파일이 존재하지 않으면
 * 기본 구조로 자동 생성하는 초기화 함수
 */
export function initDataStorage() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    if (!fs.existsSync(SUBSCRIBERS_PATH)) {
      writeJsonAtomic(SUBSCRIBERS_PATH, {});
      console.log(`[Storage] Created initial ${SUBSCRIBERS_PATH} with {}`);
    }

    if (!fs.existsSync(PROGRAMS_CACHE_PATH)) {
      const legacyData = fs.existsSync(LEGACY_PROGRAMS_CACHE_PATH)
        ? readJsonSafe(LEGACY_PROGRAMS_CACHE_PATH, {})
        : {};
      const initialCache =
        legacyData && typeof legacyData === "object" && !Array.isArray(legacyData)
          ? legacyData
          : {};
      writeJsonAtomic(PROGRAMS_CACHE_PATH, initialCache);
      console.log(`[Storage] Created initial ${PROGRAMS_CACHE_PATH}`);
    }

    if (!fs.existsSync(ANALYTICS_PATH)) {
      writeJsonAtomic(ANALYTICS_PATH, createDefaultAnalytics());
      console.log(`[Storage] Created initial ${ANALYTICS_PATH}`);
    }
  } catch (err) {
    console.error("[Storage] Failed to initialize data storage:", err.message);
  }
}

/**
 * 필수 제약 (Atomic Write):
 * 모든 JSON 파일 쓰기 작업은 반드시 임시 파일(*.tmp)에 먼저 기록한 뒤
 * fs.renameSync로 원본을 교체하여 데이터 깨짐을 방지한다.
 */
export function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const FixedTempPath = `${filePath}.tmp`;

  try {
    const serialized = JSON.stringify(data, null, 2);
    fs.writeFileSync(FixedTempPath, serialized, "utf8");
    fs.renameSync(FixedTempPath, filePath);
    return true;
  } catch (err) {
    // Fallback with unique temp path if .tmp was briefly locked
    try {
      const serialized = JSON.stringify(data, null, 2);
      fs.writeFileSync(tempPath, serialized, "utf8");
      fs.renameSync(tempPath, filePath);
      return true;
    } catch (retryErr) {
      console.error(`[Storage] Atomic write failed for ${filePath}:`, retryErr.message);
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {
        // ignore
      }
      return false;
    }
  }
}

/**
 * Safe JSON reader that automatically recovers from *.tmp if primary file was interrupted.
 */
export function readJsonSafe(filePath, defaultValue = {}) {
  const tempPath = `${filePath}.tmp`;

  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      if (raw && raw.trim()) {
        return JSON.parse(raw);
      }
    }
  } catch (err) {
    console.warn(`[Storage] Failed to parse ${filePath}, checking temp backup:`, err.message);
  }

  try {
    if (fs.existsSync(tempPath)) {
      const rawTemp = fs.readFileSync(tempPath, "utf8");
      if (rawTemp && rawTemp.trim()) {
        const parsed = JSON.parse(rawTemp);
        fs.renameSync(tempPath, filePath);
        console.log(`[Storage] Recovered ${filePath} from temporary file.`);
        return parsed;
      }
    }
  } catch (recoverErr) {
    console.warn(`[Storage] Failed to recover ${tempPath}:`, recoverErr.message);
  }

  return typeof defaultValue === "function" ? defaultValue() : { ...defaultValue };
}

// 서버 부팅(모듈 로드) 시 자동 초기화 실행
initDataStorage();

/**
 * Subscribers storage helpers (`server/data/subscribers.json`)
 */
export function loadSubscribers() {
  initDataStorage();
  const data = readJsonSafe(SUBSCRIBERS_PATH, {});
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }
  return data;
}

export function saveSubscribers(subscribers) {
  return writeJsonAtomic(SUBSCRIBERS_PATH, subscribers);
}

/**
 * Analytics storage helpers (`server/data/analytics.json`)
 */
export function loadAnalytics() {
  initDataStorage();
  const raw = readJsonSafe(ANALYTICS_PATH, createDefaultAnalytics);
  return pruneAnalyticsData(raw);
}

export function saveAnalytics(analytics) {
  const pruned = pruneAnalyticsData(analytics);
  return writeJsonAtomic(ANALYTICS_PATH, pruned);
}

/**
 * 방문자 중복 없는 일별 UV 집계 (SHA-256(ip + user-agent + KST_오늘날짜))
 */
export function recordDailyVisit(ip, userAgent) {
  const today = getKstDateString();
  const hash = crypto
    .createHash("sha256")
    .update(`${ip || ""}|${userAgent || ""}|${today}`)
    .digest("hex");

  const analytics = loadAnalytics();
  const list = Array.isArray(analytics.dailyVisitors[today])
    ? analytics.dailyVisitors[today]
    : [];
  const visitorSet = new Set(list);
  const isNew = !visitorSet.has(hash);
  if (isNew) {
    visitorSet.add(hash);
    analytics.dailyVisitors[today] = [...visitorSet];
    saveAnalytics(analytics);
  } else if (!analytics.dailyVisitors[today]) {
    analytics.dailyVisitors[today] = [...visitorSet];
    saveAnalytics(analytics);
  }

  return {
    today,
    todayVisitors: analytics.dailyVisitors[today].length,
    isNew,
  };
}

/**
 * 검색어 카운트 1 증가 후 Atomic Write (빈 문자열 및 1글자 이하 제외)
 */
export function recordSearchQuery(rawQuery) {
  const query = String(rawQuery || "").trim();
  if (query.length <= 1) {
    return { skipped: true };
  }

  const analytics = loadAnalytics();
  analytics.searchCounts[query] = Number(analytics.searchCounts[query] || 0) + 1;
  saveAnalytics(analytics);

  return {
    skipped: false,
    query,
    count: analytics.searchCounts[query],
  };
}

/**
 * 오늘 발송된 이메일 건수 1 증가 후 Atomic Write
 */
export function incrementDailyEmailSent(count = 1) {
  const today = getKstDateString();
  const analytics = loadAnalytics();
  analytics.dailyEmailSent[today] =
    Number(analytics.dailyEmailSent[today] || 0) + count;
  saveAnalytics(analytics);
  return analytics.dailyEmailSent[today];
}

/**
 * 배치 실행 로그 기록 (최근 30개만 유지)
 */
export function appendBatchLog({
  timestamp = getKstTimestampString(),
  newConcerts = 0,
  matchedEmails = 0,
  status = "success",
  message = "",
}) {
  const analytics = loadAnalytics();
  const entry = {
    timestamp,
    newConcerts: Number(newConcerts || 0),
    matchedEmails: Number(matchedEmails || 0),
    status,
    message: String(message || ""),
  };
  analytics.batchLogs = [entry, ...(analytics.batchLogs || [])].slice(
    0,
    MAX_BATCH_LOGS
  );
  saveAnalytics(analytics);
  return entry;
}

/**
 * Initialize and migrate unified `server/data/programs_cache.json`
 * Preserves all entries from legacy `server/data/programs/programs_cache.json` if present.
 */
export function loadUnifiedProgramsCache() {
  const primary = readJsonSafe(PROGRAMS_CACHE_PATH, {});
  const legacy = readJsonSafe(LEGACY_PROGRAMS_CACHE_PATH, {});

  const merged = { ...legacy, ...primary };

  if (
    !fs.existsSync(PROGRAMS_CACHE_PATH) ||
    Object.keys(primary).length < Object.keys(merged).length
  ) {
    writeJsonAtomic(PROGRAMS_CACHE_PATH, merged);
  }

  return merged;
}

export function saveUnifiedProgramsCache(memoryCache) {
  const diskPrimary = readJsonSafe(PROGRAMS_CACHE_PATH, {});
  const diskLegacy = readJsonSafe(LEGACY_PROGRAMS_CACHE_PATH, {});
  const merged = { ...diskLegacy, ...diskPrimary, ...memoryCache };

  Object.assign(memoryCache, merged);
  const ok = writeJsonAtomic(PROGRAMS_CACHE_PATH, merged);
  if (fs.existsSync(LEGACY_PROGRAMS_DIR)) {
    writeJsonAtomic(LEGACY_PROGRAMS_CACHE_PATH, merged);
  }
  return ok;
}
