import cron from "node-cron";
import {
  getAllProgramsCache,
  saveProgramsCache,
  extractProgramWithGemini,
} from "./programExtractor.js";
import { loadSubscribers, saveSubscribers } from "./storage.js";
import {
  BATCH_SEND_DELAY_MS,
  canSendBatchEmail,
  sendConcertAlertEmail,
  sleep,
} from "./emailService.js";

const GEMINI_SLEEP_MS = 4000; // Rate Limit 방어용 호출 간 4초 sleep

let isBatchRunning = false;
let cronTask = null;

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
 * 단일 공연이 특정 키워드와 매칭되는지 검사 (공백 제거 후 단순 includes)
 */
export function doesConcertMatchKeyword(concert, programs, keyword) {
  const cleanKw = normalizeCompact(keyword);
  if (!cleanKw) return false;
  const pool = buildConcertSearchPool(concert, programs);
  return pool.includes(cleanKw);
}

/**
 * KOPIS 신규 공연 수집 + 미캐시 공연 Gemini 프로그램 추출(4초 딜레이) + 구독자 키워드 매칭 및 이메일 발송 배치
 */
export async function runBatchJob(kopisApi) {
  if (isBatchRunning) {
    console.log("[BatchCron] 이미 배치가 실행 중이므로 건너뜁니다.");
    return { skipped: true, reason: "already_running" };
  }

  isBatchRunning = true;
  const startedAt = new Date().toISOString();
  console.log(`[BatchCron] 정기 배치 시작 (${startedAt})`);

  try {
    // 1. KOPIS 최신 공연 목록 강제 갱신
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

    if (verifiedEntries.length === 0) {
      console.log("[BatchCron] 인증 완료된 활성 구독자가 없습니다.");
      return { ok: true, emailsSent: 0 };
    }

    // 매칭 정확도를 위해 활성 공연의 상세 정보(cast, venue 등) 확보
    const enrichedConcerts = [];
    for (const c of activeConcerts) {
      try {
        const detailRes = await kopisApi.concert(c.id);
        enrichedConcerts.push(detailRes?.concert || c);
      } catch {
        enrichedConcerts.push(c);
      }
    }

    let emailsSent = 0;

    for (const [email, sub] of verifiedEntries) {
      if (!canSendBatchEmail()) {
        console.warn(
          "[BatchCron] 일일 배치 알림 발송 상한(80통)에 도달하여 남은 발송을 중단합니다."
        );
        break;
      }

      const notifiedSet = new Set(Array.isArray(sub.notifiedIds) ? sub.notifiedIds : []);
      const matchedItems = [];

      for (const concert of enrichedConcerts) {
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

    console.log(`[BatchCron] 정기 배치 완료 (발송 메일: ${emailsSent}통)`);
    return { ok: true, emailsSent };
  } catch (err) {
    console.error("[BatchCron] 배치 실행 중 오류:", err.message);
    return { ok: false, error: err.message };
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
      runBatchJob(kopisApi).catch((err) => {
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
