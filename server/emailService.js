import path from "node:path";
import { Resend } from "resend";
import "dotenv/config";
import {
  DATA_DIR,
  getKstDateString,
  incrementDailyEmailSent,
  readJsonSafe,
  writeJsonAtomic,
} from "./storage.js";

const QUOTA_FILE_PATH = path.join(DATA_DIR, "email_quota.json");

// Resend 무료 티어(일 100통) 중 인증 메일 여유분(20통)을 확보하기 위해 배치 알림 상한을 일 80통으로 제한
export const MAX_BATCH_EMAILS_PER_DAY = Number(
  process.env.MAX_BATCH_EMAILS_PER_DAY || 80
);
export const BATCH_SEND_DELAY_MS = 1000; // 순차 발송 딜레이 (1초)

function getResendClient() {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export function getAppBaseUrl() {
  return (process.env.APP_BASE_URL || "https://cloudcon.app").replace(/\/+$/, "");
}

function getFromEmail() {
  return (
    process.env.RESEND_FROM_EMAIL || "cloudcon 클래식 알림 <noreply@cloudcon.app>"
  ).trim();
}

function getTodayKey() {
  return getKstDateString();
}

export function getBatchQuotaState() {
  const today = getTodayKey();
  const data = readJsonSafe(QUOTA_FILE_PATH, { date: today, batchSent: 0 });
  if (data.date !== today) {
    return { date: today, batchSent: 0 };
  }
  return {
    date: today,
    batchSent: Number(data.batchSent || 0),
  };
}

export function canSendBatchEmail() {
  const state = getBatchQuotaState();
  return state.batchSent < MAX_BATCH_EMAILS_PER_DAY;
}

function incrementBatchQuota() {
  const state = getBatchQuotaState();
  state.batchSent += 1;
  writeJsonAtomic(QUOTA_FILE_PATH, state);
  return state.batchSent;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 매직 링크 인증 이메일 발송 (인증 메일은 배치 상한 80통 제한을 받지 않음)
 */
export async function sendVerificationEmail(email, manageToken, keyword = "") {
  const baseUrl = getAppBaseUrl();
  const verifyUrl = `${baseUrl}/api/verify?token=${encodeURIComponent(manageToken)}`;
  const resend = getResendClient();

  const subject = keyword
    ? `[cloudcon] '${keyword}' 공연 알림 시작을 위해 이메일을 인증해 주세요`
    : `[cloudcon] 클래식 공연 알림 이메일 인증 링크`;

  const logoUrl = `${baseUrl}/logos/logo-stroke-transparent.png`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Apple SD Gothic Neo', sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #e5e8eb; border-radius: 20px; color: #191f28;">
      <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 18px; margin-bottom: 22px; border-bottom: 1px solid #f2f4f6;">
        <a href="${baseUrl}" style="display: inline-flex; align-items: center; text-decoration: none; color: #191f28;">
          <img src="${logoUrl}" alt="cloudcon" width="28" height="28" style="display: inline-block; vertical-align: middle; margin-right: 6px; border: 0;" />
          <span style="font-size: 18px; font-weight: 800; letter-spacing: -0.03em; color: #191f28; vertical-align: middle;">cloudcon</span>
        </a>
        <span style="display: inline-block; background-color: #e8f3ff; color: #3182f6; font-weight: 700; font-size: 12px; padding: 5px 11px; border-radius: 999px;">공연 알림 인증</span>
      </div>
      <h2 style="font-size: 22px; font-weight: 800; margin: 0 0 12px 0; line-height: 1.4; word-break: keep-all;">
        아래 버튼을 눌러 클래식 공연 알림을 시작하세요
      </h2>
      <p style="font-size: 15px; color: #4e5968; line-height: 1.6; margin: 0 0 24px 0; word-break: keep-all;">
        ${
          keyword
            ? `<strong style="color: #191f28;">'${escapeHtml(keyword)}'</strong> 키워드가 등록되었습니다.<br/>`
            : ""
        }아래 인증 링크를 클릭하시면 이메일 인증이 완료되며, 해당 기기에서 알림 키워드를 자유롭게 추가하거나 삭제할 수 있습니다.
      </p>
      <div style="margin: 28px 0;">
        <a href="${verifyUrl}" style="display: inline-block; background-color: #3182f6; color: #ffffff; font-weight: 700; font-size: 15px; text-decoration: none; padding: 14px 26px; border-radius: 12px;">
          이메일 인증하고 알림 시작하기
        </a>
      </div>
      <p style="font-size: 12px; color: #8b95a1; line-height: 1.5; margin-top: 28px; padding-top: 16px; border-top: 1px solid #f2f4f6; word-break: keep-all;">
        버튼이 작동하지 않으면 아래 주소를 브라우저에 복사해 접속해 주세요:<br/>
        <a href="${verifyUrl}" style="color: #3182f6; word-break: break-all;">${verifyUrl}</a>
      </p>
    </div>
  `;

  if (!resend) {
    incrementDailyEmailSent(1);
    console.log(
      `[EmailService - DRY RUN (RESEND_API_KEY 미설정)] To: ${email} | Magic Link: ${verifyUrl}`
    );
    return { ok: true, dryRun: true, verifyUrl };
  }

  const { data, error } = await resend.emails.send({
    from: getFromEmail(),
    to: [email],
    subject,
    html,
  });

  if (error) {
    throw new Error(error.message || "Resend 이메일 발송 실패");
  }

  incrementDailyEmailSent(1);
  return { ok: true, id: data?.id, verifyUrl };
}

/**
 * 신규 매칭 공연 배치 알림 이메일 발송 (일 80통 상한 적용)
 * @param {string} email
 * @param {string} manageToken
 * @param {Array<{ concert: object, matchedKeywords: string[] }>} matchedItems
 */
export async function sendConcertAlertEmail(email, manageToken, matchedItems) {
  if (!matchedItems || matchedItems.length === 0) {
    return { ok: false, reason: "no_items" };
  }

  if (!canSendBatchEmail()) {
    console.warn(
      `[EmailService] 일일 배치 발송 상한(${MAX_BATCH_EMAILS_PER_DAY}통) 도달로 ${email} 발송을 다음 배치로 이월합니다.`
    );
    return { ok: false, reason: "quota_exceeded" };
  }

  const baseUrl = getAppBaseUrl();
  const manageUrl = `${baseUrl}/api/verify?token=${encodeURIComponent(manageToken)}`;
  const resend = getResendClient();

  const firstItem = matchedItems[0];
  const firstKeyword = firstItem.matchedKeywords[0] || "관심 키워드";
  const subject =
    matchedItems.length === 1
      ? `[cloudcon] '${firstKeyword}' 관련 새 클래식 공연 소식이 도착했어요`
      : `[cloudcon] '${firstKeyword}' 외 ${matchedItems.length}건의 새 공연 소식이 도착했어요`;

  const cardsHtml = matchedItems
    .map(({ concert, matchedKeywords }) => {
      const concertUrl = `${baseUrl}/concerts/${encodeURIComponent(concert.id)}`;
      const period =
        concert.to && concert.to !== concert.from
          ? `${concert.from} ~ ${concert.to}`
          : concert.from || "";
      const kwBadges = matchedKeywords
        .map(
          (kw) =>
            `<span style="display:inline-block; background:#e8f3ff; color:#3182f6; font-size:12px; font-weight:700; padding:3px 8px; border-radius:6px; margin-right:6px;">#${escapeHtml(
              kw
            )}</span>`
        )
        .join("");

      return `
        <div style="padding: 18px; margin-bottom: 12px; border: 1px solid #e5e8eb; border-radius: 16px; background-color: #f9fafb;">
          <div style="margin-bottom: 8px;">${kwBadges}</div>
          <a href="${concertUrl}" style="font-size: 17px; font-weight: 800; color: #191f28; text-decoration: none; display: block; margin-bottom: 6px; line-height: 1.4; word-break: keep-all;">
            ${escapeHtml(concert.title)}
          </a>
          <p style="font-size: 13px; color: #6b7684; margin: 0 0 12px 0;">
            ${escapeHtml(concert.venue || "")}${concert.area ? ` · ${escapeHtml(concert.area)}` : ""} | ${escapeHtml(period)}
          </p>
          <a href="${concertUrl}" style="display: inline-block; font-size: 13px; font-weight: 700; color: #3182f6; text-decoration: none;">
            공연 상세 및 프로그램 확인하기 &rarr;
          </a>
        </div>
      `;
    })
    .join("");

  const logoUrl = `${baseUrl}/logos/logo-stroke-transparent.png`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Apple SD Gothic Neo', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #e5e8eb; border-radius: 20px; color: #191f28;">
      <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 18px; margin-bottom: 20px; border-bottom: 1px solid #f2f4f6;">
        <a href="${baseUrl}" style="display: inline-flex; align-items: center; text-decoration: none; color: #191f28;">
          <img src="${logoUrl}" alt="cloudcon" width="28" height="28" style="display: inline-block; vertical-align: middle; margin-right: 6px; border: 0;" />
          <span style="font-size: 18px; font-weight: 800; letter-spacing: -0.03em; color: #191f28; vertical-align: middle;">cloudcon</span>
        </a>
        <span style="display: inline-block; background-color: #e8f3ff; color: #3182f6; font-weight: 700; font-size: 12px; padding: 5px 11px; border-radius: 999px;">신규 공연 알림</span>
      </div>
      <h2 style="font-size: 21px; font-weight: 800; margin: 0 0 8px 0; line-height: 1.4; word-break: keep-all;">
        기다리시던 클래식 공연 ${matchedItems.length}건이 새로 확인되었습니다
      </h2>
      <p style="font-size: 14px; color: #6b7684; margin: 0 0 22px 0; line-height: 1.5; word-break: keep-all;">
        등록해 두신 알림 키워드와 일치하는 공연입니다.
      </p>
      ${cardsHtml}
      <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #f2f4f6; font-size: 12px; color: #8b95a1; line-height: 1.6;">
        알림 키워드를 추가하거나 더 이상 받지 않으시려면 <a href="${manageUrl}" style="color: #3182f6; font-weight: 600; text-decoration: underline;">알림 키워드 관리하기</a>를 눌러 설정을 변경하실 수 있습니다.
      </div>
    </div>
  `;

  if (!resend) {
    const used = incrementBatchQuota();
    incrementDailyEmailSent(1);
    console.log(
      `[EmailService - DRY RUN] Batch alert to ${email} (${matchedItems.length} concerts, quota ${used}/${MAX_BATCH_EMAILS_PER_DAY})`
    );
    return { ok: true, dryRun: true };
  }

  const { data, error } = await resend.emails.send({
    from: getFromEmail(),
    to: [email],
    subject,
    html,
  });

  if (error) {
    throw new Error(error.message || "Resend 배치 알림 발송 실패");
  }

  const used = incrementBatchQuota();
  incrementDailyEmailSent(1);
  console.log(
    `[EmailService] Sent batch alert to ${email} (${matchedItems.length} concerts, quota ${used}/${MAX_BATCH_EMAILS_PER_DAY})`
  );

  return { ok: true, id: data?.id };
}

/**
 * 티켓 오픈 예정 공연 전용 즉시 알림 이메일 발송
 */
export async function sendTicketOpenAlertEmail(email, manageToken, matchedItems) {
  if (!matchedItems || matchedItems.length === 0) {
    return { ok: false, reason: "no_items" };
  }

  if (!canSendBatchEmail()) {
    console.warn(
      `[EmailService] 일일 발송 상한(${MAX_BATCH_EMAILS_PER_DAY}통) 도달로 ${email} 티켓 오픈 알림 발송을 보류합니다.`
    );
    return { ok: false, reason: "quota_exceeded" };
  }

  const baseUrl = getAppBaseUrl();
  const manageUrl = `${baseUrl}/api/verify?token=${encodeURIComponent(manageToken)}`;
  const resend = getResendClient();

  const firstItem = matchedItems[0];
  const firstKeyword = firstItem.matchedKeywords[0] || "관심 키워드";
  const subject =
    matchedItems.length === 1
      ? `[티켓 오픈 알림] '${firstKeyword}' 관련 공연 '${firstItem.concert.title}' 티켓 오픈 예정!`
      : `[티켓 오픈 알림] '${firstKeyword}' 외 ${matchedItems.length}건 공연 티켓 오픈 예정 소식!`;

  const cardsHtml = matchedItems
    .map(({ concert, matchedKeywords }) => {
      const concertUrl = `${baseUrl}/concerts/${encodeURIComponent(concert.id)}`;
      const bookingUrl =
        concert.ticketOpen?.bookingUrl ||
        (concert.tickets && concert.tickets[0]?.url) ||
        concertUrl;

      const rawOpenAt = concert.ticketOpen?.openAt || "";
      let formattedOpen = rawOpenAt;
      if (rawOpenAt) {
        try {
          const d = new Date(rawOpenAt);
          const days = ["일", "월", "화", "수", "목", "금", "토"];
          const dayName = days[d.getDay()];
          const hh = String(d.getHours()).padStart(2, "0");
          const mm = String(d.getMinutes()).padStart(2, "0");
          formattedOpen = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}(${dayName}) ${hh}:${mm}`;
        } catch {
          // fallback
        }
      }

      const kwBadges = matchedKeywords
        .map(
          (kw) =>
            `<span style="display:inline-block; background:#e8f3ff; color:#3182f6; font-size:12px; font-weight:700; padding:3px 8px; border-radius:6px; margin-right:6px;">#${escapeHtml(
              kw
            )}</span>`
        )
        .join("");

      return `
        <div style="padding: 20px; margin-bottom: 16px; border: 1.5px solid #3182f6; border-radius: 16px; background-color: #f7faff;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <div>${kwBadges}</div>
            <span style="display: inline-block; background-color: #f04452; color: #ffffff; font-weight: 800; font-size: 11px; padding: 4px 9px; border-radius: 999px;">
              티켓 오픈 예정
            </span>
          </div>

          <div style="background-color: #ffffff; border: 1px solid #d0e4ff; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px;">
            <div style="font-size: 12px; font-weight: 700; color: #f04452; margin-bottom: 4px;">
              ⏰ 예매 오픈 일시 (${escapeHtml(concert.ticketOpen?.typeName || "일반 예매")})
            </div>
            <div style="font-size: 17px; font-weight: 800; color: #191f28;">
              ${escapeHtml(formattedOpen || "오픈 일정 확인 필요")}
            </div>
          </div>

          <a href="${concertUrl}" style="font-size: 18px; font-weight: 800; color: #191f28; text-decoration: none; display: block; margin-bottom: 6px; line-height: 1.4; word-break: keep-all;">
            ${escapeHtml(concert.title)}
          </a>
          <p style="font-size: 13px; color: #6b7684; margin: 0 0 16px 0;">
            공연장: ${escapeHtml(concert.venue || "")} | 공연일: ${escapeHtml(concert.from || "")}
          </p>

          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <a href="${bookingUrl}" target="_blank" style="display: inline-block; background-color: #3182f6; color: #ffffff; font-size: 13px; font-weight: 700; text-decoration: none; padding: 10px 18px; border-radius: 10px;">
              인터파크/NOL 예매 바로가기 &rarr;
            </a>
            <a href="${concertUrl}" style="display: inline-block; background-color: #ffffff; color: #4e5968; border: 1px solid #d1d6db; font-size: 13px; font-weight: 600; text-decoration: none; padding: 10px 16px; border-radius: 10px;">
              클라우드콘 공연 상세
            </a>
          </div>
        </div>
      `;
    })
    .join("");

  const logoUrl = `${baseUrl}/logos/logo-stroke-transparent.png`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Apple SD Gothic Neo', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #e5e8eb; border-radius: 20px; color: #191f28;">
      <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 18px; margin-bottom: 20px; border-bottom: 1px solid #f2f4f6;">
        <a href="${baseUrl}" style="display: inline-flex; align-items: center; text-decoration: none; color: #191f28;">
          <img src="${logoUrl}" alt="cloudcon" width="28" height="28" style="display: inline-block; vertical-align: middle; margin-right: 6px; border: 0;" />
          <span style="font-size: 18px; font-weight: 800; letter-spacing: -0.03em; color: #191f28; vertical-align: middle;">cloudcon</span>
        </a>
        <span style="display: inline-block; background-color: #fff0f1; color: #f04452; font-weight: 800; font-size: 12px; padding: 5px 11px; border-radius: 999px;">
          티켓 오픈 D-Day 알림
        </span>
      </div>
      <h2 style="font-size: 21px; font-weight: 800; margin: 0 0 8px 0; line-height: 1.4; word-break: keep-all;">
        관심 키워드 공연의 티켓 오픈 일정이 잡혔습니다!
      </h2>
      <p style="font-size: 14px; color: #6b7684; margin: 0 0 22px 0; line-height: 1.5; word-break: keep-all;">
        티켓 오픈 시각을 놓치지 않고 원하는 좌석을 예매하실 수 있도록 미리 알려드립니다.
      </p>
      ${cardsHtml}
      <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #f2f4f6; font-size: 12px; color: #8b95a1; line-height: 1.6;">
        알림 키워드를 관리하거나 설정을 변경하시려면 <a href="${manageUrl}" style="color: #3182f6; font-weight: 600; text-decoration: underline;">알림 키워드 관리하기</a>를 눌러주세요.
      </div>
    </div>
  `;

  if (!resend) {
    const used = incrementBatchQuota();
    incrementDailyEmailSent(1);
    console.log(
      `[EmailService - DRY RUN] Ticket open alert to ${email} (${matchedItems.length} concerts, quota ${used}/${MAX_BATCH_EMAILS_PER_DAY})`
    );
    return { ok: true, dryRun: true };
  }

  const { data, error } = await resend.emails.send({
    from: getFromEmail(),
    to: [email],
    subject,
    html,
  });

  if (error) {
    throw new Error(error.message || "Resend 티켓 오픈 알림 발송 실패");
  }

  const used = incrementBatchQuota();
  incrementDailyEmailSent(1);
  console.log(
    `[EmailService] Sent ticket open alert to ${email} (${matchedItems.length} concerts, quota ${used}/${MAX_BATCH_EMAILS_PER_DAY})`
  );

  return { ok: true, id: data?.id };
}
