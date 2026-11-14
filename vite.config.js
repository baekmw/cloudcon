import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { kopisPlugin } from "./server/plugin.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const apiKey = env.KOPIS_API_KEY || "";

  return {
    plugins: [react(), tailwindcss(), kopisPlugin(apiKey)],
    server: {
      host: true,
      port: 5173,
      allowedHosts: true,
    },
    define: {
      "process.env.KOPIS_API_KEY": JSON.stringify(apiKey),
    },
  };
});
