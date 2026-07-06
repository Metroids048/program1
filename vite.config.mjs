import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8787";

function deepseekProxy() {
  let apiKey = "";

  const handle = async (req, res, next) => {
    if (req.method !== "POST" || !req.url || !req.url.startsWith("/api/llm/chat")) {
      next();
      return;
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (!apiKey) {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: "LLM_NOT_CONFIGURED" }));
      return;
    }
    try {
      let body = "";
      for await (const chunk of req) body += chunk;
      const upstream = await fetch(DEEPSEEK_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body,
      });
      const text = await upstream.text();
      res.statusCode = upstream.status;
      res.end(text);
    } catch (error) {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: "LLM_PROXY_ERROR", message: String(error) }));
    }
  };

  return {
    name: "deepseek-llm-proxy",
    config(_config, { mode }) {
      apiKey = loadEnv(mode, ".", "").DEEPSEEK_API_KEY ?? "";
    },
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}

export default defineConfig({
  base: "/",
  plugins: [react(), deepseekProxy()],
  server: {
    proxy: {
      "/api": {
        target: API_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    testTimeout: 15000,
  },
});
