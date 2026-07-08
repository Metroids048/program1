import { createHash, createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import WebSocket from "ws";

export type AsrEvent =
  | { type: "ready"; provider: "xfyun" }
  | { type: "interim"; text: string }
  | { type: "final"; text: string }
  | { type: "error"; code: "ASR_NOT_CONFIGURED" | "ASR_CONNECT_FAILED" | "ASR_UPSTREAM_ERROR"; message: string }
  | { type: "done" };

export interface XfyunRelay {
  feedAudio(chunk: Buffer): void;
  feedEnd(): void;
  close(): void;
}

interface XfyunPayload {
  action?: "started" | "result" | "error";
  code?: string;
  data?: string;
  desc?: string;
}

// 讯飞上游连接与协议解析：供浏览器麦克风路由和音频桥路由共用，避免重复实现同一份中转逻辑。
export function createXfyunRelay(onEvent: (event: AsrEvent) => void): XfyunRelay | null {
  const config = getXfyunConfig();
  if (!config) {
    onEvent({ type: "error", code: "ASR_NOT_CONFIGURED", message: "讯飞实时语音转写未配置，已回退到浏览器语音或文字输入。" });
    return null;
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
      onEvent({ type: "ready", provider: "xfyun" });
      return;
    }
    if (parsed.action === "error" || (parsed.code && parsed.code !== "0")) {
      onEvent({ type: "error", code: "ASR_UPSTREAM_ERROR", message: parsed.desc || `讯飞转写失败：${parsed.code ?? "UNKNOWN"}` });
      return;
    }
    if (parsed.action === "result" && parsed.data) {
      const result = parseXfyunResult(parsed.data);
      if (!result.text) return;
      onEvent({ type: result.final ? "final" : "interim", text: result.text });
    }
  });

  upstream.on("error", () => {
    onEvent({ type: "error", code: "ASR_CONNECT_FAILED", message: "讯飞实时语音转写连接失败，已回退到浏览器语音或文字输入。" });
  });

  upstream.on("close", () => {
    onEvent({ type: "done" });
  });

  return {
    feedAudio(chunk: Buffer) {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(chunk);
    },
    feedEnd() {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(JSON.stringify({ end: true }));
    },
    close() {
      if (upstreamReady && upstream.readyState === WebSocket.OPEN) upstream.send(JSON.stringify({ end: true }));
      upstream.close();
    },
  };
}

export function registerXfyunAsrRoute(app: FastifyInstance): void {
  app.get("/api/asr/xfyun/stream", { websocket: true }, (socket) => {
    const send = (event: AsrEvent) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
      if (event.type === "done") socket.close();
    };

    const relay = createXfyunRelay(send);
    if (!relay) {
      socket.close();
      return;
    }

    socket.on("message", (message, isBinary) => {
      if (!isBinary) {
        const text = message.toString();
        const control = safeJsonParse<{ end?: boolean }>(text);
        if (control?.end) relay.feedEnd();
        return;
      }
      relay.feedAudio(message as Buffer);
    });

    socket.on("close", () => {
      relay.close();
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
