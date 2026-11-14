import crypto from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import { createKopis } from "./kopis.js";
import { getConcertProgram, getAllProgramsCache } from "./programExtractor.js";
import { loadSubscribers, saveSubscribers } from "./storage.js";
import { sendVerificationEmail } from "./emailService.js";

const COOKIE_NAME = "manageToken";
const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

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
  router.use(express.json());

  // No-cache header for API responses
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  /**
   * 1. POST /api/subscribe
   * - { email, keyword } 수신
   * - 신규 이메일: crypto.randomBytes(24).toString('hex')로 manageToken 생성, verified: false 저장 후 Resend로 매직 링크 발송
   * - 기존 이메일: keywords 배열에 중복 없이 추가 저장. 미인증 상태면 인증 메일 재발송, 이미 verified: true면 바로 추가 완료 응답
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
   * - 쿼리의 token으로 구독자 조회 -> verified = true 업데이트 ->
   *   HttpOnly, SameSite=Lax 쿠키에 manageToken 저장 -> 프론트엔드 알림 관리 화면(/alerts)으로 Redirect
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
   * - 쿠키의 manageToken 검증 후 { email, keywords } 반환 (유효하지 않으면 401)
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
   * - 쿠키 인증 기반으로 해당 유저의 keywords 추가 후 Atomic Write
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
   * - 쿠키 인증 기반으로 해당 유저의 keywords 삭제 후 Atomic Write
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
   * - 쿠키 삭제 (res.clearCookie)
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
