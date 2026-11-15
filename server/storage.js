import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.resolve(process.cwd(), "server/data");
export const LEGACY_PROGRAMS_DIR = path.join(DATA_DIR, "programs");

export const SUBSCRIBERS_PATH = path.join(DATA_DIR, "subscribers.json");
export const PROGRAMS_CACHE_PATH = path.join(DATA_DIR, "programs_cache.json");
export const ANALYTICS_PATH = path.join(DATA_DIR, "analytics.json");
export const NOL_UPCOMING_PATH = path.join(DATA_DIR, "nol_upcoming.json");
export const YES24_CONCERTS_PATH = path.join(DATA_DIR, "yes24_concerts.json");
export const KNOWN_CONCERTS_PATH = path.join(DATA_DIR, "known_concerts.json");
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
    visitorStats: {
      devices: {},
      os: {},
      browsers: {},
      referrers: {},
      hourly: {},
      pages: {},
      recentLogs: [],
    },
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
  if (!analytics.visitorStats || typeof analytics.visitorStats !== "object") {
    analytics.visitorStats = {
      devices: {},
      os: {},
      browsers: {},
      referrers: {},
      hourly: {},
      pages: {},
      recentLogs: [],
    };
  } else {
    analytics.visitorStats.devices = analytics.visitorStats.devices || {};
    analytics.visitorStats.os = analytics.visitorStats.os || {};
    analytics.visitorStats.browsers = analytics.visitorStats.browsers || {};
    analytics.visitorStats.referrers = analytics.visitorStats.referrers || {};
    analytics.visitorStats.hourly = analytics.visitorStats.hourly || {};
    analytics.visitorStats.pages = analytics.visitorStats.pages || {};
    if (!Array.isArray(analytics.visitorStats.recentLogs)) {
      analytics.visitorStats.recentLogs = [];
    } else if (analytics.visitorStats.recentLogs.length > 50) {
      analytics.visitorStats.recentLogs = analytics.visitorStats.recentLogs.slice(0, 50);
    }
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

    if (!fs.existsSync(NOL_UPCOMING_PATH)) {
      writeJsonAtomic(NOL_UPCOMING_PATH, {
        updatedAt: null,
        totalCount: 0,
        concerts: [],
      });
      console.log(`[Storage] Created initial ${NOL_UPCOMING_PATH}`);
    }

    if (!fs.existsSync(YES24_CONCERTS_PATH)) {
      writeJsonAtomic(YES24_CONCERTS_PATH, {
        updatedAt: null,
        totalCount: 0,
        concerts: [],
      });
      console.log(`[Storage] Created initial ${YES24_CONCERTS_PATH}`);
    }

    if (!fs.existsSync(KNOWN_CONCERTS_PATH)) {
      writeJsonAtomic(KNOWN_CONCERTS_PATH, []);
      console.log(`[Storage] Created initial ${KNOWN_CONCERTS_PATH}`);
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
 * User-Agent 파싱: 기기 유형(모바일/데스크톱/태블릿), OS, 브라우저 판별
 */
export function parseUserAgentDetails(ua = "") {
  const str = String(ua || "").toLowerCase();

  // 1. Device
  let device = "데스크톱";
  if (/ipad|tablet|playbook|silk/i.test(str) || (/android/i.test(str) && !/mobile/i.test(str))) {
    device = "태블릿";
  } else if (/mobi|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop/i.test(str)) {
    device = "모바일";
  }

  // 2. OS
  let os = "기타";
  if (/iphone|ipad|ipod/i.test(str)) {
    os = "iOS";
  } else if (/android/i.test(str)) {
    os = "Android";
  } else if (/windows nt|windows/i.test(str)) {
    os = "Windows";
  } else if (/macintosh|mac os x/i.test(str)) {
    os = "macOS";
  } else if (/linux/i.test(str)) {
    os = "Linux";
  }

  // 3. Browser (우선순위 중요: 카카오톡/인스타 인앱 -> 웨일 -> 삼성 -> 엣지 -> 크롬 -> 사파리)
  let browser = "기타";
  if (/kakaotalk/i.test(str)) {
    browser = "카카오톡";
  } else if (/instagram/i.test(str)) {
    browser = "인스타그램";
  } else if (/whale/i.test(str) || /naver/i.test(str)) {
    browser = "네이버 웨일/앱";
  } else if (/samsungbrowser/i.test(str)) {
    browser = "삼성 인터넷";
  } else if (/edg/i.test(str)) {
    browser = "Edge";
  } else if (/chrome|crios/i.test(str)) {
    browser = "Chrome";
  } else if (/safari/i.test(str)) {
    browser = "Safari";
  } else if (/firefox|fxios/i.test(str)) {
    browser = "Firefox";
  }

  return { device, os, browser };
}

/**
 * Referrer URL 파싱: 직접 접속, 검색엔진, SNS, 외부 링크 등 분류
 */
export function parseReferrerSource(rawReferrer = "") {
  const ref = String(rawReferrer || "").trim().toLowerCase();
  if (
    !ref ||
    ref.includes("cloudcon.app") ||
    ref.includes("localhost") ||
    ref.includes("127.0.0.1")
  ) {
    return "직접 접속 / 북마크";
  }
  if (ref.includes("naver.com")) return "네이버";
  if (ref.includes("google.")) return "구글";
  if (ref.includes("daum.net") || ref.includes("kakao.com")) return "다음 / 카카오";
  if (ref.includes("instagram.com")) return "인스타그램";
  if (ref.includes("t.co") || ref.includes("twitter.com") || ref.includes("x.com")) return "X (트위터)";
  if (ref.includes("youtube.com")) return "유튜브";

  try {
    const url = new URL(ref);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "기타 외부 링크";
  }
}

/**
 * 사용자 개인정보 보호를 위한 IP 마스킹 (예: 211.234.***.***)
 */
export function maskIp(rawIp = "") {
  const ip = String(rawIp || "").trim();
  if (!ip || ip === "unknown") return "unknown";
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length >= 4) {
      return `${parts[0]}.${parts[1]}.***.***`;
    }
  }
  if (ip.includes(":")) {
    const parts = ip.split(":");
    if (parts.length >= 3) {
      return `${parts[0]}:${parts[1]}:****:****`;
    }
  }
  return "***.***.***";
}

/**
 * 방문자 중복 없는 일별 UV 집계 (SHA-256(ip + user-agent + KST_오늘날짜))
 * 상세 유입 기기, OS, 브라우저, 유입 경로, 시간대, 방문 페이지, 최근 방문 로그 함께 집계
 */
export function recordDailyVisit(ip, userAgent, meta = {}) {
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
  } else if (!analytics.dailyVisitors[today]) {
    analytics.dailyVisitors[today] = [...visitorSet];
  }

  // 상세 방문자 정보 분석
  const uaDetails = parseUserAgentDetails(userAgent);
  const referrerSource = parseReferrerSource(meta?.referrer);
  const cleanPath = String(meta?.path || "/").trim() || "/";
  const maskedIp = maskIp(ip);

  // KST 기준 시간대 (00시 ~ 23시)
  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const hourStr = String(kstDate.getUTCHours()).padStart(2, "0") + "시";

  if (!analytics.visitorStats || typeof analytics.visitorStats !== "object") {
    analytics.visitorStats = {
      devices: {},
      os: {},
      browsers: {},
      referrers: {},
      hourly: {},
      pages: {},
      recentLogs: [],
    };
  }

  const vs = analytics.visitorStats;
  vs.devices = vs.devices || {};
  vs.os = vs.os || {};
  vs.browsers = vs.browsers || {};
  vs.referrers = vs.referrers || {};
  vs.hourly = vs.hourly || {};
  vs.pages = vs.pages || {};
  vs.recentLogs = Array.isArray(vs.recentLogs) ? vs.recentLogs : [];

  // 오늘 첫 방문인 경우 디바이스/OS/브라우저/유입경로/시간대 카운트 반영
  if (isNew) {
    vs.devices[uaDetails.device] = (vs.devices[uaDetails.device] || 0) + 1;
    vs.os[uaDetails.os] = (vs.os[uaDetails.os] || 0) + 1;
    vs.browsers[uaDetails.browser] = (vs.browsers[uaDetails.browser] || 0) + 1;
    vs.referrers[referrerSource] = (vs.referrers[referrerSource] || 0) + 1;
    vs.hourly[hourStr] = (vs.hourly[hourStr] || 0) + 1;
  }

  // 페이지 조회수 카운트 (이동할 때마다 누적)
  vs.pages[cleanPath] = (vs.pages[cleanPath] || 0) + 1;

  // 최근 30건 실시간 방문 로그 (동일 IP&동일 경로의 3초 내 연속 호출 방어)
  const logEntry = {
    timestamp: getKstTimestampString(),
    path: cleanPath,
    device: uaDetails.device,
    os: uaDetails.os,
    browser: uaDetails.browser,
    referrer: referrerSource,
    ipMasked: maskedIp,
    isNew,
  };

  const firstLog = vs.recentLogs[0];
  const isDuplicateRecent =
    firstLog &&
    firstLog.ipMasked === maskedIp &&
    firstLog.path === cleanPath &&
    Math.abs(new Date(logEntry.timestamp).getTime() - new Date(firstLog.timestamp).getTime()) < 3000;

  if (!isDuplicateRecent) {
    vs.recentLogs = [logEntry, ...vs.recentLogs].slice(0, 30);
  }

  saveAnalytics(analytics);

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

/**
 * NOL 티켓 오픈 공연 저장소 헬퍼 (`server/data/nol_upcoming.json`)
 */
export function loadNolUpcoming() {
  initDataStorage();
  const data = readJsonSafe(NOL_UPCOMING_PATH, {
    updatedAt: null,
    totalCount: 0,
    concerts: [],
  });
  if (!data || typeof data !== "object") {
    return { updatedAt: null, totalCount: 0, concerts: [] };
  }
  if (!Array.isArray(data.concerts)) {
    data.concerts = [];
  }
  return data;
}

export function saveNolUpcoming(data) {
  return writeJsonAtomic(NOL_UPCOMING_PATH, data);
}

/**
 * YES24 클래식 공연 및 티켓 오픈 정보 저장소 헬퍼 (`server/data/yes24_concerts.json`)
 */
export function loadYes24Concerts() {
  initDataStorage();
  const data = readJsonSafe(YES24_CONCERTS_PATH, {
    updatedAt: null,
    totalCount: 0,
    concerts: [],
  });
  if (!data || typeof data !== "object") {
    return { updatedAt: null, totalCount: 0, concerts: [] };
  }
  if (!Array.isArray(data.concerts)) {
    data.concerts = [];
  }
  return data;
}

export function saveYes24Concerts(data) {
  return writeJsonAtomic(YES24_CONCERTS_PATH, data);
}

/**
 * 시스템에 이미 등록되어 알려진 공연 ID 목록 저장소 헬퍼 (`server/data/known_concerts.json`)
 * 새 키워드 추가 시 기존 공연이 발송되지 않도록 방지하고,
 * 배치 실행 시 오직 "새로 추가된 공연"에 한해서만 메일 알림을 발송하기 위해 사용
 */
export function loadKnownConcertIds() {
  initDataStorage();
  const raw = readJsonSafe(KNOWN_CONCERTS_PATH, []);
  if (Array.isArray(raw)) {
    return new Set(raw);
  }
  return new Set();
}

export function saveKnownConcertIds(idsSetOrArray) {
  const arr = Array.isArray(idsSetOrArray)
    ? idsSetOrArray
    : idsSetOrArray instanceof Set
    ? [...idsSetOrArray]
    : [];
  return writeJsonAtomic(KNOWN_CONCERTS_PATH, arr);
}
