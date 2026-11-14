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

// Serve static frontend files in production
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
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
  console.log(`[Cloudcon Express] Server listening on http://0.0.0.0:${port}`);
});
