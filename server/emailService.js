import path from "node:path";
import { Resend } from "resend";
import "dotenv/config";
import { DATA_DIR, readJsonSafe, writeJsonAtomic } from "./storage.js";

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
    process.env.RESEND_FROM_EMAIL || "Cloudcon 클래식 알림 <noreply@cloudcon.app>"
  ).trim();
}

function getTodayKey() {
  // KST(Asia/Seoul) 기준 날짜 문자열 (YYYY-MM-DD)
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
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
    ? `[Cloudcon] '${keyword}' 공연 알림 시작을 위해 이메일을 인증해 주세요`
    : `[Cloudcon] 클래식 공연 알림 이메일 인증 링크`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Apple SD Gothic Neo', sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #e5e8eb; border-radius: 20px; color: #191f28;">
      <div style="margin-bottom: 20px;">
        <span style="display: inline-block; background-color: #e8f3ff; color: #3182f6; font-weight: 700; font-size: 13px; padding: 6px 12px; border-radius: 999px;">Cloudcon 공연 알림</span>
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
      ? `[Cloudcon] '${firstKeyword}' 관련 새 클래식 공연 소식이 도착했어요`
      : `[Cloudcon] '${firstKeyword}' 외 ${matchedItems.length}건의 새 공연 소식이 도착했어요`;

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

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Apple SD Gothic Neo', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #e5e8eb; border-radius: 20px; color: #191f28;">
      <div style="margin-bottom: 16px;">
        <span style="display: inline-block; background-color: #e8f3ff; color: #3182f6; font-weight: 700; font-size: 13px; padding: 6px 12px; border-radius: 999px;">Cloudcon 신규 공연 알림</span>
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
  console.log(
    `[EmailService] Sent batch alert to ${email} (${matchedItems.length} concerts, quota ${used}/${MAX_BATCH_EMAILS_PER_DAY})`
  );

  return { ok: true, id: data?.id };
}
