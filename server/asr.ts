import { createHash, createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import WebSocket from "ws";

type AsrEvent =
  | { type: "ready"; provider: "xfyun" }
  | { type: "interim"; text: string }
  | { type: "final"; text: string }
  | { type: "error"; code: "ASR_NOT_CONFIGURED" | "ASR_CONNECT_FAILED" | "ASR_UPSTREAM_ERROR"; message: string }
  | { type: "done" };

interface XfyunPayload {
  action?: "started" | "result" | "error";
  code?: string;
  data?: string;
  desc?: string;
}

export function registerXfyunAsrRoute(app: FastifyInstance): void {
  app.get("/api/asr/xfyun/stream", { websocket: true }, (socket) => {
    const config = getXfyunConfig();
    const send = (event: AsrEvent) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
    };

    if (!config) {
      send({ type: "error", code: "ASR_NOT_CONFIGURED", message: "讯飞实时语音转写未配置，已回退到浏览器语音或文字输入。" });
      socket.close();
      return;
    }

    const upstream = new WebSocket(buildXfyunUrl(config));
    let upstreamReady = false;

    upstream.on("open", () => {
      upstreamReady = true;
    });

    upstream.on("message", (raw) => {
      const parsed = safeJsonParse<XfyunPayload>(raw.toString());
      if (!parsed) return;
      if (parsed.action === "started") {
        send({ type: "ready", provider: "xfyun" });
        return;
      }
      if (parsed.action === "error" || (parsed.code && parsed.code !== "0")) {
        send({ type: "error", code: "ASR_UPSTREAM_ERROR", message: parsed.desc || `讯飞转写失败：${parsed.code ?? "UNKNOWN"}` });
        return;
      }
      if (parsed.action === "result" && parsed.data) {
        const result = parseXfyunResult(parsed.data);
        if (!result.text) return;
        send({ type: result.final ? "final" : "interim", text: result.text });
      }
    });

    upstream.on("error", () => {
      send({ type: "error", code: "ASR_CONNECT_FAILED", message: "讯飞实时语音转写连接失败，已回退到浏览器语音或文字输入。" });
    });

    upstream.on("close", () => {
      send({ type: "done" });
      socket.close();
    });

    socket.on("message", (message, isBinary) => {
      if (upstream.readyState !== WebSocket.OPEN) return;
      if (!isBinary) {
        const text = message.toString();
        const control = safeJsonParse<{ end?: boolean }>(text);
        if (control?.end) upstream.send(JSON.stringify({ end: true }));
        return;
      }
      upstream.send(message);
    });

    socket.on("close", () => {
      if (upstreamReady && upstream.readyState === WebSocket.OPEN) upstream.send(JSON.stringify({ end: true }));
      upstream.close();
    });
  });
}

function getXfyunConfig():
  | { appId: string; apiKey: string; endpoint: string; language?: string }
  | null {
  if ((process.env.ASR_PROVIDER ?? "xfyun").trim().toLowerCase() !== "xfyun") return null;
  const appId = process.env.XFYUN_RTASR_APP_ID?.trim();
  const apiKey = process.env.XFYUN_RTASR_API_KEY?.trim();
  if (!appId || !apiKey) return null;
  return {
    appId,
    apiKey,
    endpoint: process.env.XFYUN_RTASR_ENDPOINT?.trim() || "wss://rtasr.xfyun.cn/v1/ws",
    language: process.env.XFYUN_RTASR_LANG?.trim() || "cn",
  };
}

function buildXfyunUrl(config: { appId: string; apiKey: string; endpoint: string; language?: string }): string {
  const ts = Math.floor(Date.now() / 1000).toString();
  const md5 = createHash("md5").update(`${config.appId}${ts}`).digest("hex");
  const signa = createHmac("sha1", config.apiKey).update(md5).digest("base64");
  const url = new URL(config.endpoint);
  url.searchParams.set("appid", config.appId);
  url.searchParams.set("ts", ts);
  url.searchParams.set("signa", signa);
  if (config.language) url.searchParams.set("lang", config.language);
  return url.toString();
}

function parseXfyunResult(data: string): { text: string; final: boolean } {
  const parsed = safeJsonParse<{
    cn?: { st?: { type?: string; rt?: Array<{ ws?: Array<{ cw?: Array<{ w?: string }> }> }> } };
  }>(data);
  const st = parsed?.cn?.st;
  const text =
    st?.rt
      ?.flatMap((item) => item.ws ?? [])
      .flatMap((item) => item.cw ?? [])
      .map((item) => item.w ?? "")
      .join("")
      .trim() ?? "";
  return { text, final: st?.type === "0" };
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
