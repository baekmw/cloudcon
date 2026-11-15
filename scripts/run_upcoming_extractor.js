import "dotenv/config";
import fs from "node:fs";
import { createKopis } from "../server/kopis.js";
import {
  extractProgramWithGemini,
  isClassicalConcert,
  getAllProgramsCache,
  saveProgramsCache,
} from "../server/programExtractor.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("=================================================================");
  console.log("cloudcon [공연예정 804건 전수 프로그램 데이터 확보 파이프라인 시작]");
  console.log("규칙: 15 RPM 엄격 준수 | 다중 세부 이미지 일괄 분석 | 순수 클래식만 대상");
  console.log("=================================================================\n");

  const apiKey = process.env.GEMINI_API_KEY;
  const kopisKey = process.env.KOPIS_API_KEY;
  if (!apiKey) {
    console.error("오류: GEMINI_API_KEY가 없습니다.");
    process.exit(1);
  }

  const kopisApi = createKopis(kopisKey);
  console.log("[1/3] KOPIS 클래식 공연 목록 조회 중...");
  const listRes = await kopisApi.concerts(false);
  const concerts = listRes.concerts || [];

  // 공연예정 클래식 공연만 필터링
  const upcomingClassical = concerts.filter(
    (c) => c.state === "공연예정" && isClassicalConcert(c)
  );

  console.log(`[2/3] 전체 공연예정 클래식 공연: 총 ${upcomingClassical.length}건 확인됨.`);

  const cache = getAllProgramsCache();
  const targets = upcomingClassical.filter((c) => cache[c.id] === undefined);
  const alreadyCached = upcomingClassical.filter((c) => cache[c.id] !== undefined);

  console.log(`- 이미 캐시 완료된 공연: ${alreadyCached.length}건 (스킵)`);
  console.log(`- 앞으로 분석 필요한 대상: ${targets.length}건`);
  console.log("-----------------------------------------------------------------");

  if (targets.length === 0) {
    console.log("축하합니다! 모든 공연예정 공연의 프로그램 데이터가 이미 확보되었습니다.");
    process.exit(0);
  }

  console.log(`[3/3] 순차 분석 파이프라인 시작... (예상 소요시간: 약 ${Math.ceil((targets.length * 4.5) / 60)}분)\n`);

  let successCount = 0;
  let emptyCount = 0;
  let failureCount = 0;

  for (let idx = 0; idx < targets.length; idx++) {
    const target = targets[idx];
    const progress = `[${idx + 1}/${targets.length}] (${Math.round(((idx + 1) / targets.length) * 100)}%)`;

    try {
      // 1. 상세 정보 조회 (포스터, 세부 이미지 전체, 소개글)
      const detailRes = await kopisApi.concert(target.id);
      const detail = detailRes?.concert || target;

      const allImages = [
        detail.poster,
        ...(Array.isArray(detail.images) ? detail.images : []),
      ].filter((u) => typeof u === "string" && u.trim().startsWith("http"));

      console.log(`${progress} ${target.id} '${target.title}' (이미지 ${allImages.length}장)`);

      if (allImages.length === 0) {
        cache[target.id] = [];
        saveProgramsCache();
        emptyCount++;
        console.log(`  -> 이미지 없음: 빈 프로그램으로 캐시.`);
        continue;
      }

      // 2. 다중 세부 이미지 + 소개글로 AI 추출 (15 RPM 준수)
      const programs = await extractProgramWithGemini(
        allImages,
        apiKey,
        detail.story
      );

      if (Array.isArray(programs) && programs.length > 0) {
        cache[target.id] = programs;
        saveProgramsCache();
        successCount++;
        console.log(`  -> ✓ ${programs.length}곡 추출 완료! (${programs.map((p) => p.composerShort || p.composerKo).slice(0, 3).join(", ")}...)`);
      } else if (Array.isArray(programs) && programs.length === 0) {
        cache[target.id] = [];
        saveProgramsCache();
        emptyCount++;
        console.log(`  -> - 곡 정보 없음 확인 (빈 프로그램으로 캐시 완료).`);
      } else {
        // API 호출 에러 또는 쿼터 초과
        failureCount++;
        console.warn(`  -> ⚠️ AI 호출 실패 (쿼터 소진 가능성).`);
        if (failureCount >= 5) {
          console.warn("\n[알림] 연속 5회 AI 호출이 실패하여 쿼터 소진으로 판단됩니다. 15분간 대기 후 계속합니다...");
          await sleep(15 * 60 * 1000);
          failureCount = 0;
        }
      }
    } catch (err) {
      console.error(`  -> 오류 발생 (${target.id}):`, err.message);
    }
  }

  console.log("\n=================================================================");
  console.log("전체 순차 분석 작업 완료!");
  console.log(`총 대상: ${targets.length}건 | 성공: ${successCount}건 | 빈 프로그램: ${emptyCount}건 | 실패: ${failureCount}건`);
  console.log("=================================================================");
}

main().catch(console.error);
