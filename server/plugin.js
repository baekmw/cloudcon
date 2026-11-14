import express from "express";
import { createApiRouter } from "./apiRouter.js";
import { startBatchCron } from "./batchCron.js";
import { initDataStorage } from "./storage.js";

export function kopisPlugin(serviceKey) {
  let app = null;

  const attach = (server) => {
    if (!app) {
      initDataStorage();
      app = express();
      app.set("trust proxy", 1);

      const { router, kopisApi } = createApiRouter(serviceKey);
      app.use("/api", router);

      startBatchCron(kopisApi);
    }

    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith("/api/")) return next();
      app(req, res, next);
    });
  };

  return {
    name: "kopis-api",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
