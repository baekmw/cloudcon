import crypto from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import { createKopis } from "./kopis.js";
import {
  getConcertProgram,
  getAllProgramsCache,
  updateConcertProgramCache,
  reextractEmptyTitlePrograms,
} from "./programExtractor.js";
import {
  getKstDateString,
  loadAnalytics,
  loadSubscribers,
  recordDailyVisit,
  recordSearchQuery,
  saveAnalytics,
  saveSubscribers,
} from "./storage.js";
import { getBatchQuotaState, sendVerificationEmail } from "./emailService.js";
import { getBatchRunningStatus, runBatchJob } from "./batchCron.js";
import { fetchNolUpcomingClassical } from "./nolCrawler.js";
import { fetchYes24Classical } from "./yes24Crawler.js";

const COOKIE_NAME = "manageToken";
const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

const ADMIN_COOKIE_NAME = "adminSession";
const ADMIN_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getExpectedAdminCookieValue() {
  const adminPassword = String(process.env.ADMIN_PASSWORD || "").trim();
  if (!adminPassword) return null;
  return crypto
    .createHmac("sha256", "cloudcon-admin-auth-v1")
    .update(adminPassword)
    .digest("hex");
}

function requireAdmin(req, res, next) {
  const expected = getExpectedAdminCookieValue();
  const actual = String(req.cookies?.[ADMIN_COOKIE_NAME] || "").trim();

  if (!expected || !actual || actual !== expected) {
    return res.status(401).json({
      ok: false,
      error: "관리자 인증이 필요합니다.",
    });
  }
  return next();
}

function findSubscriberByToken(subscribers, token) {
  if (!token || typeof token !== "string") return null;
  const cleanToken = token.trim();
  if (!cleanToken) return null;

  for (const [email, sub] of Object.entries(subscribers)) {
    if (sub && sub.manageToken === cleanToken) {
      return { email, subscriber: sub };
    }
  }
  return null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function createApiRouter(serviceKey) {
  const router = express.Router();
  const api = createKopis(serviceKey);

  router.use(cookieParser());
  router.use(express.json({ limit: "2mb" }));

  // No-cache header for API responses
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  // =========================================================================
  // 공개 트래킹 API (/api/track/visit, /api/track/search)
  // =========================================================================

  /**
   * 중복 없는 방문자 집계 (POST /api/track/visit)
   * SHA-256(req.ip + req.headers['user-agent'] + KST_오늘날짜)
   */
  router.post("/track/visit", (req, res) => {
    try {
      const forwarded = String(req.headers["x-forwarded-for"] || "")
        .split(",")[0]
        .trim();
      const ip = forwarded || req.ip || req.socket?.remoteAddress || "unknown";
      const ua = String(req.headers["user-agent"] || "unknown");

      const result = recordDailyVisit(ip, ua);
      return res.status(200).json({ ok: true, ...result });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /**
   * 검색어 집계 (POST /api/track/search)
   * 빈 문자열 및 1글자 이하 제외, 앞뒤 공백 제거 후 searchCounts[query] 1 증가
   */
  router.post("/track/search", (req, res) => {
    try {
      const query = String(req.body?.query || "").trim();
      if (query.length <= 1) {
        return res.status(200).json({ ok: true, skipped: true });
      }
      const result = recordSearchQuery(query);
      return res.status(200).json({ ok: true, ...result });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // =========================================================================
  // 관리자 인증 및 어드민 API (/api/admin/*)
  // =========================================================================

  /**
   * 관리자 로그인 (POST /api/admin/login)
   * .env의 ADMIN_PASSWORD와 대조 후 HttpOnly, SameSite=Lax 쿠키 발급
   */
  router.post("/admin/login", (req, res) => {
    const inputPassword = String(req.body?.password || "").trim();
    const adminPassword = String(process.env.ADMIN_PASSWORD || "").trim();

    if (!adminPassword) {
      return res.status(500).json({
        ok: false,
        error: "서버에 ADMIN_PASSWORD가 설정되어 있지 않습니다.",
      });
    }

    if (!inputPassword || inputPassword !== adminPassword) {
      return res.status(401).json({
        ok: false,
        error: "비밀번호가 올바르지 않습니다.",
      });
    }

    const tokenValue = getExpectedAdminCookieValue();
    const isSecure =
      process.env.NODE_ENV === "production" ||
      req.secure ||
      req.headers["x-forwarded-proto"] === "https";

    res.cookie(ADMIN_COOKIE_NAME, tokenValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      maxAge: ADMIN_COOKIE_MAX_AGE_MS,
      path: "/",
    });

    return res.status(200).json({ ok: true });
  });

  /**
   * 관리자 로그아웃 (POST /api/admin/logout)
   */
  router.post("/admin/logout", (req, res) => {
    res.clearCookie(ADMIN_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    return res.status(200).json({ ok: true });
  });

  // 이하 모든 /api/admin/* 라우트는 requireAdmin 미들웨어로 보호
  router.use("/admin", requireAdmin);

  /**
   * 관리자 대시보드 통계 조회 (GET /api/admin/dashboard)
   */
  router.get("/admin/dashboard", (req, res) => {
    const today = getKstDateString();
    const analytics = loadAnalytics();
    const subscribers = loadSubscribers();

    // 기존 email_quota.json의 오늘 배치 발송 건수와 동기화 보장
    const quotaState = getBatchQuotaState();
    const recordedSent = Number(analytics.dailyEmailSent[today] || 0);
    const syncedSent = Math.max(recordedSent, Number(quotaState.batchSent || 0));
    if (syncedSent !== recordedSent) {
      analytics.dailyEmailSent[today] = syncedSent;
      saveAnalytics(analytics);
    }

    // 1. 오늘 방문자 수(UV) 및 누적 방문자 수(일별 UV 합산)
    const todayVisitors = Array.isArray(analytics.dailyVisitors[today])
      ? analytics.dailyVisitors[today].length
      : 0;
    const totalVisitors = Object.values(analytics.dailyVisitors || {}).reduce(
      (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
      0
    );

    // 2. 전체 구독자 수 및 인증 완료(verified: true) 구독자 수
    const subEntries = Object.entries(subscribers);
    const totalSubscribers = subEntries.length;
    const verifiedSubscribers = subEntries.filter(
      ([, sub]) => sub && sub.verified === true
    ).length;

    // 3. 오늘 Resend 메일 발송 건수 (일일 한도 100통 표시용)
    const todayEmailSent = Number(analytics.dailyEmailSent[today] || 0);

    // 4. 검색어 순위 Top 10
    const topSearches = Object.entries(analytics.searchCounts || {})
      .map(([keyword, count]) => ({
        keyword,
        count: Number(count || 0),
      }))
      .filter((item) => item.keyword && item.count > 0)
      .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword, "ko"))
      .slice(0, 10);

    // 5. 등록 키워드 순위 Top 10 (subscribers.json의 모든 구독자 keywords 합산·집계)
    const keywordMap = new Map();
    for (const [, sub] of subEntries) {
      if (!sub || !Array.isArray(sub.keywords)) continue;
      for (const rawKw of sub.keywords) {
        const kw = String(rawKw || "").trim();
        if (!kw) continue;
        keywordMap.set(kw, (keywordMap.get(kw) || 0) + 1);
      }
    }
    const topKeywords = [...keywordMap.entries()]
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword, "ko"))
      .slice(0, 10);

    // 6. 공연예정 프로그램 캐시 진행률 통계
    const cache = getAllProgramsCache();
    const totalCachedCount = Object.keys(cache).length;

    return res.status(200).json({
      ok: true,
      today,
      todayVisitors,
      totalVisitors,
      totalSubscribers,
      verifiedSubscribers,
      todayEmailSent,
      dailyEmailLimit: 100,
      visitors: {
        todayUv: todayVisitors,
        cumulativeUv: totalVisitors,
      },
      subscribers: {
        total: totalSubscribers,
        verified: verifiedSubscribers,
      },
      emails: {
        todaySent: todayEmailSent,
        dailyLimit: 100,
      },
      totalCachedPrograms: totalCachedCount,
      topSearches,
      topKeywords,
      topSubscriberKeywords: topKeywords,
      batchLogs: analytics.batchLogs || [],
      isBatchRunning: getBatchRunningStatus(),
    });
  });

  /**
   * 수동 배치 즉시 실행 (POST /api/admin/run-batch)
   * 중복 동시 실행 방지 Lock 플래그 적용
   */
  router.post("/admin/run-batch", async (req, res) => {
    if (getBatchRunningStatus()) {
      return res.status(409).json({
        ok: false,
        alreadyRunning: true,
        error: "이미 배치 작업이 실행 중입니다. 완료될 때까지 기다려 주세요.",
      });
    }

    const result = await runBatchJob(api, { trigger: "manual" });
    if (result.skipped) {
      return res.status(409).json({
        ok: false,
        alreadyRunning: true,
        error: "이미 배치 작업이 실행 중입니다.",
      });
    }
    if (!result.ok) {
      return res.status(500).json({
        ok: false,
        error: result.error || "배치 실행 중 오류가 발생했습니다.",
        log: result.log,
      });
    }

    return res.status(200).json({
      ok: true,
      newConcerts: result.newConcerts,
      emailsSent: result.emailsSent,
      log: result.log,
    });
  });

  /**
   * 구독자 목록 조회 (GET /api/admin/subscribers)
   */
  router.get("/admin/subscribers", (req, res) => {
    const subscribers = loadSubscribers();
    const list = Object.entries(subscribers)
      .map(([email, sub]) => {
        const batchCount = Array.isArray(sub?.notifiedIds) ? sub.notifiedIds.length : 0;
        const verifyCount = Number(sub?.verificationCount ?? (sub?.verified ? 1 : 0));
        const totalSent = Number(sub?.totalEmailsSent) || (batchCount + verifyCount);

        return {
          email,
          verified: Boolean(sub?.verified),
          keywords: Array.isArray(sub?.keywords) ? sub.keywords : [],
          notifiedCount: totalSent,
          notifiedConcerts: sub?.notifiedIds || [],
          verificationCount: verifyCount,
          totalEmailsSent: totalSent,
          createdAt: sub?.createdAt || "",
          lastEmailSentAt: sub?.lastEmailSentAt || sub?.createdAt || "",
        };
      })
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    return res.status(200).json({ ok: true, subscribers: list });
  });

  /**
   * 구독자 삭제 (DELETE /api/admin/subscribers/:email)
   */
  router.delete("/admin/subscribers/:email", (req, res) => {
    const targetEmail = decodeURIComponent(req.params.email || "")
      .trim()
      .toLowerCase();
    const subscribers = loadSubscribers();

    const matchedKey = Object.keys(subscribers).find(
      (k) => k.toLowerCase() === targetEmail
    );
    if (!matchedKey) {
      return res
        .status(404)
        .json({ ok: false, error: "해당 구독자를 찾을 수 없습니다." });
    }

    delete subscribers[matchedKey];
    saveSubscribers(subscribers);

    return res.status(200).json({ ok: true, deletedEmail: matchedKey });
  });

  /**
   * 구독자 강제 인증 토글 (PATCH /api/admin/subscribers/:email/verify)
   */
  router.patch("/admin/subscribers/:email/verify", (req, res) => {
    const targetEmail = decodeURIComponent(req.params.email || "")
      .trim()
      .toLowerCase();
    const subscribers = loadSubscribers();

    const matchedKey = Object.keys(subscribers).find(
      (k) => k.toLowerCase() === targetEmail
    );
    if (!matchedKey) {
      return res
        .status(404)
        .json({ ok: false, error: "해당 구독자를 찾을 수 없습니다." });
    }

    const sub = subscribers[matchedKey];
    const nextVerified =
      typeof req.body?.verified === "boolean" ? req.body.verified : !sub.verified;
    sub.verified = nextVerified;
    subscribers[matchedKey] = sub;
    saveSubscribers(subscribers);

    return res.status(200).json({
      ok: true,
      email: matchedKey,
      verified: sub.verified,
    });
  });

  /**
   * 공연 AI 프로그램 캐시 전체 조회 (GET /api/admin/cache)
   */
  router.get("/admin/cache", async (req, res) => {
    const cache = getAllProgramsCache();
    let concertMap = new Map();

    try {
      const listRes = await api.concerts(false);
      for (const c of listRes?.concerts || []) {
        concertMap.set(c.id, c);
      }
    } catch {
      // KOPIS 캐시 미로드 시에도 programs_cache.json 자체는 정상 반환
    }

    const items = Object.entries(cache).map(([concertId, programs]) => {
      const meta = concertMap.get(concertId);
      return {
        concertId,
        title: meta?.title || `(KOPIS 목록 외 공연 · ${concertId})`,
        venue: meta?.venue || "",
        from: meta?.from || "",
        to: meta?.to || "",
        state: meta?.state || "",
        poster: meta?.poster || "",
        programs: Array.isArray(programs) ? programs : [],
      };
    });

    return res.status(200).json({
      ok: true,
      totalCached: items.length,
      items,
      cache,
    });
  });

  /**
   * 특정 공연 AI 프로그램 캐시 수동 수정·저장 (PUT /api/admin/cache/:concertId)
   */
  router.put("/admin/cache/:concertId", (req, res) => {
    const concertId = decodeURIComponent(req.params.concertId || "").trim();
    if (!concertId) {
      return res
        .status(400)
        .json({ ok: false, error: "공연 ID가 필요합니다." });
    }

    let programs = req.body?.programs;
    if (typeof req.body?.rawJson === "string") {
      try {
        programs = JSON.parse(req.body.rawJson);
      } catch (err) {
        return res.status(400).json({
          ok: false,
          error: `JSON 형식이 올바르지 않습니다: ${err.message}`,
        });
      }
    }

    if (!Array.isArray(programs)) {
      return res.status(400).json({
        ok: false,
        error: "프로그램 데이터는 배열(Array) 형식이어야 합니다.",
      });
    }

    const saved = updateConcertProgramCache(concertId, programs);

    // KOPIS 인메모리 공연 목록 캐시에도 즉시 반영
    api
      .concerts(false)
      .then((listRes) => {
        const found = (listRes?.concerts || []).find((c) => c.id === concertId);
        if (found) {
          found.programs = saved;
          found.programSource = "cache";
        }
      })
      .catch(() => {});

    return res.status(200).json({
      ok: true,
      concertId,
      programs: saved,
    });
  });

  /**
   * 곡명이 빈 문자열("")인 AI 캐시 공연들을 다중 세부 이미지로 재분석·재추출 (POST /api/admin/reextract-empty)
   * 15 RPM 한도를 엄격 준수하며 백그라운드로 순차 실행
   */
  router.post("/admin/reextract-empty", async (req, res) => {
    // 비동기로 시작하고 즉시 응답 반환
    reextractEmptyTitlePrograms(api, process.env.GEMINI_API_KEY)
      .then((result) => {
        console.log("[Reextract Result]:", result);
      })
      .catch((err) => {
        console.error("[Reextract Error]:", err);
      });

    return res.status(200).json({
      ok: true,
      message:
        "곡명 누락 공연에 대한 다중 세부 이미지 AI 재분석을 시작했습니다. (15 RPM 준수)",
    });
  });

  /**
   * NOL 티켓오픈 일정 크롤러 수동 실행 (POST /api/admin/crawl-nol)
   */
  router.post("/admin/crawl-nol", async (req, res) => {
    try {
      const items = await fetchNolUpcomingClassical();
      // force reload cache so list includes new upcoming tickets
      await api.concerts(true);
      return res.status(200).json({
        ok: true,
        count: items.length,
        message: `놀유니버스 클래식 티켓오픈 공연 ${items.length}건 수집 및 동기화 완료`,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /**
   * YES24 티켓 및 티켓오픈 일정 크롤러 수동 실행 (POST /api/admin/crawl-yes24)
   */
  router.post("/admin/crawl-yes24", async (req, res) => {
    try {
      const items = await fetchYes24Classical();
      // force reload cache so list includes new upcoming tickets
      await api.concerts(true);
      return res.status(200).json({
        ok: true,
        count: items.length,
        message: `YES24 클래식 공연 ${items.length}건 수집 및 동기화 완료`,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // =========================================================================
  // 구독자 알림 API (/api/subscribe, /api/verify, /api/my-keywords, /api/disconnect)
  // =========================================================================

  /**
   * 1. POST /api/subscribe
   */
  router.post("/subscribe", async (req, res) => {
    try {
      const email = String(req.body?.email || "")
        .trim()
        .toLowerCase();
      const keyword = String(req.body?.keyword || "").trim();
      const sendMagicLink = Boolean(req.body?.sendMagicLink);

      if (!email || !isValidEmail(email)) {
        return res
          .status(400)
          .json({ ok: false, error: "올바른 이메일 주소를 입력해 주세요." });
      }
      if (!keyword && !sendMagicLink) {
        return res
          .status(400)
          .json({ ok: false, error: "알림 받을 키워드를 입력해 주세요." });
      }

      const subscribers = loadSubscribers();
      const existing = subscribers[email];

      // 신규 이메일인 경우
      if (!existing) {
        const manageToken = crypto.randomBytes(24).toString("hex");
        subscribers[email] = {
          manageToken,
          verified: false,
          keywords: keyword ? [keyword] : [],
          notifiedIds: [],
          verificationCount: 1,
          totalEmailsSent: 1,
          lastEmailSentAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };

        // Atomic Write (subscribers.json.tmp -> subscribers.json)
        saveSubscribers(subscribers);

        await sendVerificationEmail(email, manageToken, keyword);

        return res.status(200).json({
          ok: true,
          status: "verification_sent",
          verified: false,
          message:
            "이메일로 인증 링크를 보냈습니다. 링크를 클릭하면 알림이 시작됩니다.",
        });
      }

      // 기존 이메일인 경우
      if (!existing.manageToken) {
        existing.manageToken = crypto.randomBytes(24).toString("hex");
      }
      if (!Array.isArray(existing.keywords)) {
        existing.keywords = [];
      }
      if (!Array.isArray(existing.notifiedIds)) {
        existing.notifiedIds = [];
      }

      if (keyword && !existing.keywords.includes(keyword)) {
        existing.keywords.push(keyword);
      }

      subscribers[email] = existing;
      // Atomic Write
      saveSubscribers(subscribers);

      // 미인증 상태이거나 기기 연결 링크 발송을 명시 요청한 경우 인증 메일 발송
      if (!existing.verified || sendMagicLink) {
        await sendVerificationEmail(email, existing.manageToken, keyword);
        existing.verificationCount = Number(existing.verificationCount || 0) + 1;
        existing.totalEmailsSent = Number(existing.totalEmailsSent || 0) + 1;
        existing.lastEmailSentAt = new Date().toISOString();
        subscribers[email] = existing;
        saveSubscribers(subscribers);

        return res.status(200).json({
          ok: true,
          status: "verification_sent",
          verified: false,
          message:
            "이메일로 인증 링크를 보냈습니다. 링크를 클릭하면 알림이 시작됩니다.",
        });
      }

      // 이미 verified: true 인 경우 바로 추가 완료 응답
      return res.status(200).json({
        ok: true,
        status: "added",
        verified: true,
        email,
        keywords: existing.keywords,
        message: `'${keyword}' 알림 키워드가 추가되었습니다.`,
      });
    } catch (error) {
      console.error("[API /subscribe] Error:", error);
      return res.status(500).json({
        ok: false,
        error: error.message || "알림 구독 처리 중 오류가 발생했습니다.",
      });
    }
  });

  /**
   * 2. GET /api/verify
   */
  router.get("/verify", (req, res) => {
    const token = String(req.query.token || "").trim();
    if (!token) {
      return res.redirect(302, "/alerts?verify=invalid");
    }

    const subscribers = loadSubscribers();
    const found = findSubscriberByToken(subscribers, token);
    if (!found) {
      return res.redirect(302, "/alerts?verify=invalid");
    }

    const { email, subscriber } = found;
    subscriber.verified = true;
    subscribers[email] = subscriber;

    // Atomic Write
    saveSubscribers(subscribers);

    const isSecure =
      process.env.NODE_ENV === "production" ||
      req.secure ||
      req.headers["x-forwarded-proto"] === "https";

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      maxAge: COOKIE_MAX_AGE_MS,
      path: "/",
    });

    return res.redirect(302, "/alerts");
  });

  /**
   * 3. GET /api/my-keywords
   */
  router.get("/my-keywords", (req, res) => {
    const token = req.cookies?.[COOKIE_NAME];
    const subscribers = loadSubscribers();
    const found = findSubscriberByToken(subscribers, token);

    if (!found || !found.subscriber.verified) {
      return res.status(401).json({
        ok: false,
        error: "이메일 인증 정보가 없습니다.",
      });
    }

    return res.status(200).json({
      ok: true,
      email: found.email,
      keywords: Array.isArray(found.subscriber.keywords)
        ? found.subscriber.keywords
        : [],
    });
  });

  /**
   * 4. POST /api/my-keywords
   */
  router.post("/my-keywords", (req, res) => {
    const token = req.cookies?.[COOKIE_NAME];
    const subscribers = loadSubscribers();
    const found = findSubscriberByToken(subscribers, token);

    if (!found || !found.subscriber.verified) {
      return res.status(401).json({
        ok: false,
        error: "이메일 인증 정보가 없습니다.",
      });
    }

    const keyword = String(req.body?.keyword || "").trim();
    if (!keyword) {
      return res.status(400).json({
        ok: false,
        error: "추가할 키워드를 입력해 주세요.",
      });
    }

    const { email, subscriber } = found;
    if (!Array.isArray(subscriber.keywords)) {
      subscriber.keywords = [];
    }
    if (!subscriber.keywords.includes(keyword)) {
      subscriber.keywords.push(keyword);
      subscribers[email] = subscriber;
      // Atomic Write
      saveSubscribers(subscribers);
    }

    return res.status(200).json({
      ok: true,
      email,
      keywords: subscriber.keywords,
    });
  });

  /**
   * 5. DELETE /api/my-keywords
   */
  router.delete("/my-keywords", (req, res) => {
    const token = req.cookies?.[COOKIE_NAME];
    const subscribers = loadSubscribers();
    const found = findSubscriberByToken(subscribers, token);

    if (!found || !found.subscriber.verified) {
      return res.status(401).json({
        ok: false,
        error: "이메일 인증 정보가 없습니다.",
      });
    }

    const keyword = String(
      req.body?.keyword ?? req.query?.keyword ?? ""
    ).trim();
    if (!keyword) {
      return res.status(400).json({
        ok: false,
        error: "삭제할 키워드를 지정해 주세요.",
      });
    }

    const { email, subscriber } = found;
    subscriber.keywords = (subscriber.keywords || []).filter(
      (k) => k !== keyword
    );
    subscribers[email] = subscriber;

    // Atomic Write
    saveSubscribers(subscribers);

    return res.status(200).json({
      ok: true,
      email,
      keywords: subscriber.keywords,
    });
  });

  /**
   * 6. POST /api/disconnect
   */
  router.post("/disconnect", (req, res) => {
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    return res.status(200).json({ ok: true });
  });

  /**
   * 7. DELETE /api/alerts/unsubscribe & POST /api/alerts/unsubscribe
   * 서버에서 구독자의 이메일 및 모든 등록 키워드 영구 완전 삭제
   */
  const handleUnsubscribeAll = (req, res) => {
    const token = req.cookies?.[COOKIE_NAME] || req.body?.token;
    const subscribers = loadSubscribers();
    let found = findSubscriberByToken(subscribers, token);

    if (!found) {
      const reqEmail = String(req.body?.email || req.query?.email || "").trim().toLowerCase();
      if (reqEmail && subscribers[reqEmail] && (!token || subscribers[reqEmail].manageToken === token)) {
        found = { email: reqEmail, subscriber: subscribers[reqEmail] };
      }
    }

    if (!found) {
      return res.status(401).json({
        ok: false,
        error: "인증 정보가 유효하지 않습니다. 다시 로그인하거나 인증 메일 링크를 확인해 주세요.",
      });
    }

    const { email } = found;
    delete subscribers[email];
    saveSubscribers(subscribers);

    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });

    console.log(`[Subscribers] Completely deleted subscriber ${email} and all registered keywords.`);

    return res.status(200).json({
      ok: true,
      deletedEmail: email,
      message: "이메일과 모든 등록 키워드가 서버에서 완전히 삭제되었습니다.",
    });
  };

  router.delete("/alerts/unsubscribe", handleUnsubscribeAll);
  router.post("/alerts/unsubscribe", handleUnsubscribeAll);
  router.delete("/unsubscribe", handleUnsubscribeAll);
  router.post("/unsubscribe", handleUnsubscribeAll);

  /**
   * 8. GET /api/alerts/unsubscribe-direct & GET /api/unsubscribe
   * 이메일 내 원클릭 수신 거부 링크를 통한 즉시 데이터 완전 삭제 및 브라우저 안내 페이지 렌더링
   */
  const handleDirectUnsubscribe = (req, res) => {
    const token = String(req.query?.token || req.cookies?.[COOKIE_NAME] || "").trim();
    const subscribers = loadSubscribers();
    let found = token ? findSubscriberByToken(subscribers, token) : null;

    if (!found) {
      const reqEmail = String(req.query?.email || "").trim().toLowerCase();
      if (reqEmail && subscribers[reqEmail] && (!token || subscribers[reqEmail].manageToken === token)) {
        found = { email: reqEmail, subscriber: subscribers[reqEmail] };
      }
    }

    const escapeHtml = (str) =>
      String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    if (!found) {
      return res.status(200).send(`
        <!DOCTYPE html>
        <html lang="ko">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>알림 수신 거부 - cloudcon</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Apple SD Gothic Neo', sans-serif; background: #f9fafb; margin: 0; padding: 32px 16px; display: flex; justify-content: center; align-items: center; min-height: 80vh; color: #191f28; }
            .card { background: #fff; border: 1px solid #e5e8eb; border-radius: 20px; padding: 40px 28px; max-width: 460px; width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.04); }
            .icon-box { width: 56px; height: 56px; border-radius: 50%; background: #e8f3ff; color: #3182f6; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto; font-size: 26px; font-weight: 800; }
            h1 { font-size: 21px; font-weight: 800; margin: 0 0 12px 0; line-height: 1.4; }
            p { font-size: 14.5px; color: #4e5968; line-height: 1.6; margin: 0 0 28px 0; word-break: keep-all; }
            .btn { display: block; width: 100%; background: #3182f6; color: #fff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 20px; border-radius: 12px; }
            .btn:hover { background: #1b64da; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon-box">i</div>
            <h1>이미 처리되었거나 유효하지 않은 링크입니다</h1>
            <p>해당 이메일의 알림은 이미 수신 거부(삭제) 처리되었거나 유효기간이 만료되었습니다.<br/><br/>더 이상 알림 메일이 발송되지 않으니 안심하셔도 됩니다.</p>
            <a href="/" class="btn">클라우드콘 홈으로 이동</a>
          </div>
        </body>
        </html>
      `);
    }

    const { email } = found;
    delete subscribers[email];
    saveSubscribers(subscribers);

    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });

    console.log(`[Subscribers] Direct unsubscribe via email link: deleted subscriber ${email}.`);

    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>수신 거부 완료 - cloudcon</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Apple SD Gothic Neo', sans-serif; background: #f9fafb; margin: 0; padding: 32px 16px; display: flex; justify-content: center; align-items: center; min-height: 80vh; color: #191f28; }
          .card { background: #fff; border: 1px solid #e5e8eb; border-radius: 20px; padding: 40px 28px; max-width: 460px; width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.04); }
          .icon-box { width: 56px; height: 56px; border-radius: 50%; background: #e8faf3; color: #03b26c; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto; font-size: 26px; font-weight: 800; }
          .badge { display: inline-block; background: #f2f4f6; color: #333d4b; font-size: 13px; font-weight: 700; padding: 5px 12px; border-radius: 8px; margin-bottom: 14px; word-break: break-all; }
          h1 { font-size: 21px; font-weight: 800; margin: 0 0 12px 0; line-height: 1.4; }
          p { font-size: 14.5px; color: #4e5968; line-height: 1.6; margin: 0 0 28px 0; word-break: keep-all; }
          .btn { display: block; width: 100%; background: #3182f6; color: #fff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 20px; border-radius: 12px; }
          .btn:hover { background: #1b64da; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon-box">✓</div>
          <div class="badge">${escapeHtml(email)}</div>
          <h1>알림 수신 거부 처리가 완료되었습니다</h1>
          <p>
            등록되어 있던 이메일과 모든 알림 키워드가 서버에서 안전하게 영구 삭제되었습니다.<br/><br/>
            앞으로 어떠한 공연 알림 메일도 발송되지 않습니다. 그동안 클라우드콘을 이용해 주셔서 감사합니다.
          </p>
          <a href="/" class="btn">클라우드콘 홈으로 이동</a>
        </div>
      </body>
      </html>
    `);
  };

  router.get("/alerts/unsubscribe-direct", handleDirectUnsubscribe);
  router.get("/unsubscribe", handleDirectUnsubscribe);

  // =========================================================================
  // 기존 KOPIS 공연 조회 및 AI 프로그램 추출 API 엔드포인트
  // =========================================================================

  router.all("/concerts/:id/program", async (req, res) => {
    const concertId = decodeURIComponent(req.params.id);
    try {
      const detail = await api.concert(concertId);
      const body = req.body || {};
      const forceAI = req.query.force === "1" || Boolean(body.forceAI);
      const apiKey = body.apiKey || req.query.key || "";
      const result = await getConcertProgram(detail.concert, {
        forceAI,
        apiKey,
      });
      return res.status(200).json({ ok: true, concertId, ...result });
    } catch (error) {
      return res.status(error.status || 500).json({
        ok: false,
        error: error.message,
        programs: [],
      });
    }
  });

  router.get("/status", async (req, res) => {
    return res.status(200).json(await api.status());
  });

  /**
   * 클래식 공연 티켓 오픈 일정 목록 조회 (GET /api/ticket-opens)
   * NOL 및 KOPIS 연동 티켓 오픈 일정 (오픈일시 오름차순 정렬)
   */
  router.get("/ticket-opens", async (req, res) => {
    try {
      const ticketOpens = await api.ticketOpens();
      const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const todayStr = now.toISOString().slice(0, 10);

      const enriched = ticketOpens.map((concert) => {
        const openAt = concert.ticketOpen?.openAt || "";
        let dDay = null;
        let dDayLabel = "";
        let openAtFormatted = openAt;
        let isToday = false;
        let isTomorrow = false;
        let isPast = false;

        if (openAt) {
          try {
            const openDate = new Date(openAt);
            const openDateStr = openAt.slice(0, 10);
            const diffTime =
              new Date(openDateStr).getTime() - new Date(todayStr).getTime();
            dDay = Math.round(diffTime / (1000 * 60 * 60 * 24));

            const days = ["일", "월", "화", "수", "목", "금", "토"];
            const dayName = days[openDate.getDay()];
            const hh = String(openDate.getHours()).padStart(2, "0");
            const mm = String(openDate.getMinutes()).padStart(2, "0");
            openAtFormatted = `${openDate.getFullYear()}.${String(
              openDate.getMonth() + 1
            ).padStart(2, "0")}.${String(openDate.getDate()).padStart(
              2,
              "0"
            )}(${dayName}) ${hh}:${mm}`;

            if (dDay < 0) {
              isPast = true;
              dDayLabel = "오픈 완료";
            } else if (dDay === 0) {
              isToday = true;
              dDayLabel = `오늘 ${hh}:${mm} 오픈`;
            } else if (dDay === 1) {
              isTomorrow = true;
              dDayLabel = `내일 ${hh}:${mm} 오픈`;
            } else {
              dDayLabel = `D-${dDay}`;
            }
          } catch {
            dDayLabel = "오픈 예정";
          }
        }

        return {
          ...concert,
          ticketOpen: {
            ...concert.ticketOpen,
            dDay,
            dDayLabel,
            openAtFormatted,
            isToday,
            isTomorrow,
            isPast,
          },
        };
      });

      return res.status(200).json({
        ok: true,
        count: enriched.length,
        ticketOpens: enriched,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error.message,
        ticketOpens: [],
      });
    }
  });

  router.get("/concerts", async (req, res) => {
    try {
      const result = await api.concerts(req.query.refresh === "1");
      return res.status(200).json(result);
    } catch (error) {
      return res.status(502).json({
        configured: true,
        concerts: [],
        error: error.message,
      });
    }
  });

  router.get("/matches", async (req, res) => {
    try {
      const result = await api.matches(req.query.kind, req.query.q);
      return res.status(200).json(result);
    } catch (error) {
      return res.status(error.status || 502).json({
        error: error.message,
        matches: [],
        complete: true,
      });
    }
  });

  router.get("/concerts/:id", async (req, res) => {
    try {
      const concertId = decodeURIComponent(req.params.id);
      const concertRes = await api.concert(concertId);
      const cache = getAllProgramsCache();
      const cachedPrograms = cache[concertId];

      if (cachedPrograms) {
        return res.status(200).json({
          configured: true,
          concert: {
            ...concertRes.concert,
            programs: cachedPrograms,
            programPending: false,
            programSource: "cache",
          },
        });
      }

      const isUpcoming = concertRes.concert.state === "공연예정";
      return res.status(200).json({
        configured: true,
        concert: {
          ...concertRes.concert,
          programs: null,
          programPending: isUpcoming,
          programSource: "pending",
        },
      });
    } catch (error) {
      return res.status(error.status || 502).json({ error: error.message });
    }
  });

  router.use((req, res) => {
    return res.status(404).json({ error: "없는 API입니다." });
  });

  return { router, kopisApi: api };
}
