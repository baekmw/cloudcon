import crypto from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import { createKopis } from "./kopis.js";
import {
  getConcertProgram,
  getAllProgramsCache,
  updateConcertProgramCache,
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

    return res.status(200).json({
      ok: true,
      today,
      todayVisitors,
      totalVisitors,
      totalSubscribers,
      verifiedSubscribers,
      todayEmailSent,
      dailyEmailLimit: 100,
      topSearches,
      topKeywords,
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
      .map(([email, sub]) => ({
        email,
        verified: Boolean(sub?.verified),
        keywords: Array.isArray(sub?.keywords) ? sub.keywords : [],
        notifiedCount: Array.isArray(sub?.notifiedIds) ? sub.notifiedIds.length : 0,
        createdAt: sub?.createdAt || "",
      }))
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
