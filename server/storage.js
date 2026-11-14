import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.resolve(process.cwd(), "server/data");
export const LEGACY_PROGRAMS_DIR = path.join(DATA_DIR, "programs");

export const SUBSCRIBERS_PATH = path.join(DATA_DIR, "subscribers.json");
export const PROGRAMS_CACHE_PATH = path.join(DATA_DIR, "programs_cache.json");
export const LEGACY_PROGRAMS_CACHE_PATH = path.join(
  LEGACY_PROGRAMS_DIR,
  "programs_cache.json"
);

// Ensure data directory exists
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch {
  // ignore
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

/**
 * Subscribers storage helpers (`server/data/subscribers.json`)
 */
export function loadSubscribers() {
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
 * Initialize and migrate unified `server/data/programs_cache.json`
 * Preserves all entries from legacy `server/data/programs/programs_cache.json` if present.
 */
export function loadUnifiedProgramsCache() {
  const primary = readJsonSafe(PROGRAMS_CACHE_PATH, {});
  const legacy = readJsonSafe(LEGACY_PROGRAMS_CACHE_PATH, {});

  const merged = { ...legacy, ...primary };

  // If primary didn't exist or had fewer keys than merged, save atomically to primary
  if (
    !fs.existsSync(PROGRAMS_CACHE_PATH) ||
    Object.keys(primary).length < Object.keys(merged).length
  ) {
    writeJsonAtomic(PROGRAMS_CACHE_PATH, merged);
  }

  return merged;
}

export function saveUnifiedProgramsCache(memoryCache) {
  // Read any newly written keys on disk first so concurrent/background writes never get lost
  const diskPrimary = readJsonSafe(PROGRAMS_CACHE_PATH, {});
  const diskLegacy = readJsonSafe(LEGACY_PROGRAMS_CACHE_PATH, {});
  const merged = { ...diskLegacy, ...diskPrimary, ...memoryCache };

  Object.assign(memoryCache, merged);
  const ok = writeJsonAtomic(PROGRAMS_CACHE_PATH, merged);
  // Keep legacy path synced as well if directory exists
  if (fs.existsSync(LEGACY_PROGRAMS_DIR)) {
    writeJsonAtomic(LEGACY_PROGRAMS_CACHE_PATH, merged);
  }
  return ok;
}
