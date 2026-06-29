import { afterEach, describe, expect, it, vi } from "vitest";

// A4：验证 DeepSeek 调用的超时与重试行为。
// 通过 resetModules + 动态 import，让每个用例按各自的环境变量重新求值模块顶层常量。
async function loadProvider(env: { timeoutMs?: string; maxRetries?: string }) {
  if (env.timeoutMs !== undefined) process.env.DEEPSEEK_TIMEOUT_MS = env.timeoutMs;
  if (env.maxRetries !== undefined) process.env.DEEPSEEK_MAX_RETRIES = env.maxRetries;
  vi.resetModules();
  return import("./provider");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function chatPayload(content: string) {
  return { choices: [{ message: { content } }] };
}

describe("DeepSeekProvider 超时与重试", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DEEPSEEK_TIMEOUT_MS;
    delete process.env.DEEPSEEK_MAX_RETRIES;
  });

  it("瞬时网络错误后重试一次并成功", async () => {
    const { DeepSeekProvider } = await loadProvider({ timeoutMs: "2000", maxRetries: "1" });
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error("network down");
        return jsonResponse(chatPayload('{"ok":true}'));
      }),
    );

    const provider = new DeepSeekProvider("test-key", "deepseek-chat");
    const result = await provider.chatJson([{ role: "user", content: "hi" }], { ok: false });

    expect(calls).toBe(2);
    expect(result.status).toBe("success");
    expect((result.data as { ok: boolean }).ok).toBe(true);
  });

  it("重试耗尽后降级到 fallback", async () => {
    const { DeepSeekProvider } = await loadProvider({ timeoutMs: "2000", maxRetries: "1" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const fallback = { ok: false, source: "local" };
    const provider = new DeepSeekProvider("test-key", "deepseek-chat");
    const result = await provider.chatJson([{ role: "user", content: "hi" }], fallback);

    expect(result.status).toBe("fallback");
    expect(result.data).toEqual(fallback);
  });

  it("请求超时后中止并降级", async () => {
    const { DeepSeekProvider } = await loadProvider({ timeoutMs: "30", maxRetries: "0" });
    // fetch 永不自行返回，只在 abort 信号触发时 reject，从而走超时分支。
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: unknown, init: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          const signal = init.signal;
          if (signal?.aborted) {
            reject(signal.reason ?? new Error("aborted"));
            return;
          }
          signal?.addEventListener("abort", () => reject(signal.reason ?? new Error("aborted")), { once: true });
        });
      }),
    );

    const fallback = { ok: false };
    const provider = new DeepSeekProvider("test-key", "deepseek-chat");
    const result = await provider.chatJson([{ role: "user", content: "hi" }], fallback);

    expect(result.status).toBe("fallback");
    expect(result.data).toEqual(fallback);
  });
});
