import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import { createApiRouter } from "./apiRouter.js";
import { startBatchCron } from "./batchCron.js";
import { initDataStorage } from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");
const port = Number(process.env.PORT || 4000);
const serviceKey = process.env.KOPIS_API_KEY || "";

// 서버 부팅 시 data 디렉터리 및 subscribers.json, programs_cache.json 자동 초기화
initDataStorage();

const app = express();
app.set("trust proxy", 1);

app.use(cookieParser());
app.use(express.json());

// Mount Express API Router (/api/subscribe, /api/verify, /api/my-keywords, /api/disconnect, /api/concerts, ...)
const { router, kopisApi } = createApiRouter(serviceKey);
app.use("/api", router);

// Top-level /unsubscribe direct link support
app.get("/unsubscribe", (req, res) => {
  const queryStr = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  return res.redirect(302, `/api/alerts/unsubscribe-direct${queryStr}`);
});

// Dynamic XML Sitemap for Google Search indexing
app.get("/sitemap.xml", async (req, res) => {
  const baseUrl = (process.env.APP_BASE_URL || "https://cloudcon.app").replace(/\/+$/, "");
  const today = new Date().toISOString().slice(0, 10);
  let concertUrls = "";

  try {
    const listRes = await kopisApi.concerts(false);
    const concerts = listRes?.concerts || [];
    for (const c of concerts.slice(0, 500)) {
      if (!c?.id) continue;
      concertUrls += `
  <url>
    <loc>${baseUrl}/concerts/${encodeURIComponent(c.id)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
    }
  } catch {
    // ignore if KOPIS cache not warmed yet
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/tickets</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.95</priority>
  </url>
  <url>
    <loc>${baseUrl}/explore</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/alerts</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>${concertUrls}
</urlset>`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  return res.status(200).send(xml);
});

// Serve static frontend files in production
if (fs.existsSync(distDir)) {
  app.use(
    express.static(distDir, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".webmanifest")) {
          res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
        }
        if (filePath.endsWith("sw.js")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Service-Worker-Allowed", "/");
        }
      },
    })
  );
}

// SPA Fallback
app.use((req, res) => {
  const indexHtml = path.join(distDir, "index.html");
  if (fs.existsSync(indexHtml)) {
    return res.sendFile(indexHtml);
  }
  return res.status(404).send("Build not found. Run `npm run build` first.");
});

// Start 09:00 / 18:00 KST Batch & Email Queue Scheduler
startBatchCron(kopisApi);

app.listen(port, "0.0.0.0", () => {
  console.log(`[cloudcon Express] Server listening on http://0.0.0.0:${port}`);
});
