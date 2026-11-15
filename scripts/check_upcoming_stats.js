import "dotenv/config";
import fs from "node:fs";
import { createKopis } from "../server/kopis.js";
import { isClassicalConcert } from "../server/programExtractor.js";

async function main() {
  const kopisKey = process.env.KOPIS_API_KEY;
  const api = createKopis(kopisKey);
  const cachePath = "server/data/programs_cache.json";
  const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};

  console.log("KOPIS 공연 목록 로딩 중...");
  const listRes = await api.concerts(false);
  const concerts = listRes.concerts || [];

  const upcomingAll = concerts.filter((c) => c.state === "공연예정");
  const upcomingClassical = upcomingAll.filter(isClassicalConcert);
  const nonClassicalUpcoming = upcomingAll.filter((c) => !isClassicalConcert(c));

  const cachedUpcoming = upcomingClassical.filter((c) => cache[c.id] !== undefined);
  const withTracks = upcomingClassical.filter(
    (c) => Array.isArray(cache[c.id]) && cache[c.id].length > 0
  );
  const emptyTracks = upcomingClassical.filter(
    (c) => Array.isArray(cache[c.id]) && cache[c.id].length === 0
  );
  const uncached = upcomingClassical.filter((c) => cache[c.id] === undefined);

  console.log("==========================================");
  console.log(`전체 공연예정 공연 수: ${upcomingAll.length}건`);
  console.log(`- 순수 클래식 공연예정: ${upcomingClassical.length}건`);
  console.log(`- 비클래식(국악/뮤지컬 등 제외대상): ${nonClassicalUpcoming.length}건`);
  console.log("------------------------------------------");
  console.log(`캐시된 클래식 공연예정: 총 ${cachedUpcoming.length}건`);
  console.log(`  ✓ 프로그램 곡 추출 완료 (>0): ${withTracks.length}건`);
  console.log(`  - 프로그램 없음 확인됨 ([]): ${emptyTracks.length}건`);
  console.log(`미분석 (앞으로 AI 추출 필요): ${uncached.length}건`);
  console.log("==========================================");
}

main().catch(console.error);
