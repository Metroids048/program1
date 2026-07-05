import { safeJsonParse } from "../utils";

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiProvider {
  model: string;
  chatJson<T>(
    messages: AiMessage[],
    fallback: T,
    options?: { temperature?: number; signal?: AbortSignal; schemaHint?: string },
  ): Promise<{ data: T; status: "success" | "fallback"; raw: string }>;
}

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT_MS = Number(process.env.DEEPSEEK_TIMEOUT_MS) > 0 ? Number(process.env.DEEPSEEK_TIMEOUT_MS) : 45000;
const DEFAULT_MAX_RETRIES = Number.isFinite(Number(process.env.DEEPSEEK_MAX_RETRIES)) ? Math.max(0, Number(process.env.DEEPSEEK_MAX_RETRIES)) : 1;

export function createProvider(apiKey = process.env.DEEPSEEK_API_KEY ?? "", model = process.env.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL): AiProvider {
  if (!apiKey.trim()) {
    console.warn("[ai] DEEPSEEK_API_KEY 未读取到，当前将使用本地 fallback provider。");
  }
  return apiKey ? new DeepSeekProvider(apiKey, model) : new LocalFallbackProvider();
}

export class LocalFallbackProvider implements AiProvider {
  model = "local-fallback";

  async chatJson<T>(_messages: AiMessage[], fallback: T): Promise<{ data: T; status: "fallback"; raw: string }> {
    return { data: fallback, status: "fallback", raw: "LLM_NOT_CONFIGURED" };
  }
}

export class DeepSeekProvider implements AiProvider {
  constructor(private readonly apiKey: string, readonly model = DEFAULT_DEEPSEEK_MODEL) {}

  async chatJson<T>(
    messages: AiMessage[],
    fallback: T,
    options?: { temperature?: number; signal?: AbortSignal; schemaHint?: string },
  ): Promise<{ data: T; status: "success" | "fallback"; raw: string }> {
    const first = await this.call(messages, options);
    const parsed = extractStructuredJson<T>(first);
    if (parsed) return { data: parsed, status: "success", raw: first };

    const repair = await this.call(
      [
        ...messages,
        { role: "assistant", content: first || "EMPTY_RESPONSE" },
        {
          role: "user",
          content: [
            "上一次输出不是合法 JSON。",
            "请只返回一个合法 JSON，不要解释，不要使用 markdown 代码块。",
            options?.schemaHint ? `Schema hint: ${options.schemaHint}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      { ...options, temperature: 0 },
    );
    const repaired = extractStructuredJson<T>(repair);
    return repaired ? { data: repaired, status: "success", raw: repair } : { data: fallback, status: "fallback", raw: repair || first };
  }

  private async call(messages: AiMessage[], options?: { temperature?: number; signal?: AbortSignal }): Promise<string> {
    const maxAttempts = DEFAULT_MAX_RETRIES + 1;
    let lastError = "";
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      // 外部主动取消（如客户端断开）不重试，直接退出。
      if (options?.signal?.aborted) return "ABORTED";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error("DEEPSEEK_TIMEOUT")), DEFAULT_TIMEOUT_MS);
      const onExternalAbort = () => controller.abort(options?.signal?.reason);
      options?.signal?.addEventListener("abort", onExternalAbort, { once: true });
      try {
        const response = await fetch(DEEPSEEK_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            temperature: options?.temperature ?? 0.35,
            stream: false,
            messages,
          }),
          signal: controller.signal,
        });
        if (response.ok) {
          const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
          return json.choices?.[0]?.message?.content ?? "";
        }
        // 5xx 可重试；4xx 是请求本身问题，不重试。
        lastError = await response.text().catch(() => `HTTP_${response.status}`);
        if (response.status < 500 || attempt === maxAttempts - 1) return lastError;
      } catch (error) {
        // 外部取消：立即返回，不重试。
        if (options?.signal?.aborted) return "ABORTED";
        lastError = String(error);
        if (attempt === maxAttempts - 1) return lastError;
      } finally {
        clearTimeout(timeout);
        options?.signal?.removeEventListener("abort", onExternalAbort);
      }
      // 指数退避后重试。
      await sleep(400 * 2 ** attempt);
    }
    return lastError;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractStructuredJson<T>(text: string): T | null {
  const direct = extractJson<T>(text);
  if (direct) return direct;
  return extractLenientJson<T>(text);
}

function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const objectStart = body.indexOf("{");
  const arrayStart = body.indexOf("[");
  const start = arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart) ? arrayStart : objectStart;
  if (start < 0) return null;
  const closing = body[start] === "[" ? "]" : "}";
  const end = body.lastIndexOf(closing);
  if (end <= start) return null;
  return safeJsonParse<T>(body.slice(start, end + 1));
}

function extractLenientJson<T>(text: string): T | null {
  const body = text
    .replace(/^[\s\S]*?({|\[)/, "$1")
    .replace(/(```|'''|~~~)/g, "")
    .trim();
  if (!body) return null;

  const candidates = [body, trimAfterBalanced(body, "{", "}"), trimAfterBalanced(body, "[", "]")].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const parsed = safeJsonParse<T>(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function trimAfterBalanced(text: string, opening: "{" | "[", closing: "}" | "]"): string | null {
  const start = text.indexOf(opening);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === opening) depth += 1;
    if (char === closing) depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  return null;
}
