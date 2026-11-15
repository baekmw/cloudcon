import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createKopis } from "../server/kopis.js";
import { reextractEmptyTitlePrograms } from "../server/programExtractor.js";

async function main() {
  console.log("=== cloudcon 곡명('') 누락 공연 다중 세부 이미지 재분석 스크립트 ===");
  const apiKey = process.env.GEMINI_API_KEY;
  const kopisKey = process.env.KOPIS_API_KEY;

  if (!apiKey) {
    console.error("오류: .env 파일에 GEMINI_API_KEY가 없습니다.");
    process.exit(1);
  }

  const kopisApi = createKopis(kopisKey);
  console.log("KOPIS API 초기화 완료. 15 RPM 한도 준수 하에 재분석을 시작합니다...");

  const startTime = Date.now();
  const result = await reextractEmptyTitlePrograms(kopisApi, apiKey);
  const durationSec = Math.round((Date.now() - startTime) / 1000);

  console.log(`\n=== 재분석 작업 완료 (소요시간: ${durationSec}초) ===`);
  console.log(result);
  process.exit(0);
}

main().catch((err) => {
  console.error("실행 중 오류 발생:", err);
  process.exit(1);
});
