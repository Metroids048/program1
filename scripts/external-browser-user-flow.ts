import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, expect, type Browser, type Page } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const backendPort = Number(process.env.E2E_BACKEND_PORT ?? 18787);
const frontendPort = Number(process.env.E2E_FRONTEND_PORT ?? 15173);
const backendUrl = `http://127.0.0.1:${backendPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const headed = process.argv.includes("--headed") || process.env.E2E_HEADLESS === "0";
const artifactsDir = resolve(root, "web", "artifacts", "external-browser-flow");

const children: ChildProcess[] = [];

function startProcess(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const cleanedEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...process.env, ...env })) {
    if (typeof value === "string") cleanedEnv[key] = value;
  }
  const child = spawn(command, args, {
    cwd: root,
    env: cleanedEnv,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  children.push(child);
  child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[external-browser-flow] process exited: ${command} ${args.join(" ")} code=${code}`);
    }
  });
  return child;
}

async function stopChildren() {
  await Promise.all(
    children.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null || child.killed) {
            resolve();
            return;
          }
          const timer = setTimeout(resolve, 1_500);
          child.once("exit", () => {
            clearTimeout(timer);
            resolve();
          });
          child.kill();
        }),
    ),
  );
}

function cleanupTempDir(tempDir: string) {
  try {
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    console.warn(`[external-browser-flow] temp cleanup skipped: ${String(error)}`);
  }
}

async function waitForHttp(url: string, label: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status >= 200 && response.status < 500) return;
      lastError = `status=${response.status}`;
    } catch (error) {
      lastError = String(error);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 750));
  }
  throw new Error(`${label} not ready: ${url} ${lastError}`);
}

async function launchBrowser(): Promise<Browser> {
  const candidates = ["msedge", "chrome"] as const;
  for (const channel of candidates) {
    try {
      return await chromium.launch({ channel, headless: !headed });
    } catch {
      // Try the next locally installed browser before falling back.
    }
  }
  return chromium.launch({ headless: !headed });
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  if (overflow.documentWidth > overflow.viewport + 2 || overflow.bodyWidth > overflow.viewport + 2) {
    throw new Error(`${label} horizontal overflow: ${JSON.stringify(overflow)}`);
  }
}

async function runDesktopFlow(page: Page) {
  const phone = `139${String(Date.now()).slice(-8)}`;
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${frontendUrl}/auth/register?returnTo=${encodeURIComponent("/")}`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("请输入手机号").fill(phone);
  await page.getByPlaceholder("至少 8 位").fill("TestPass123");
  await page.getByPlaceholder("你的称呼").fill("浏览器验收用户");
  await page.getByRole("button", { name: /注册并开始使用/ }).click();
  await expect(page.getByRole("heading", { name: /告诉 AI 你想面试的岗位/ })).toBeVisible({ timeout: 15_000 });
  await page.goto(`${frontendUrl}/onboarding`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "跳过引导，直接开始" }).click();
  await page.getByRole("button", { name: /进入岗位台/ }).click();
  await expect(page.getByRole("heading", { name: /告诉 AI 你想面试的岗位/ })).toBeVisible({ timeout: 15_000 });

  await page.getByLabel("首页主输入").fill([
    "公司名称：字节跳动 | 岗位名称：AI 产品经理",
    "负责 AI 面试产品从 0 到 1，包括用户研究、需求分析、产品设计、增长实验和数据验证。",
    "要求：3 年以上产品经验，有 AI 或 SaaS 背景优先，熟悉 RAG、LLM 应用和 A/B 测试。",
  ].join("\n"));
  await page.getByRole("button", { name: /发送/ }).click();
  await expect(page.getByText(/字节跳动|AI 产品经理/).first()).toBeVisible({ timeout: 20_000 });
  await assertNoHorizontalOverflow(page, "home 1280x720");

  await page.getByRole("button", { name: /进入实时助手/ }).click();
  await expect(page.getByLabel("实时问题输入")).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("实时问题输入").fill("请介绍一个你做过最有挑战性的 AI 产品项目。");
  await page.getByRole("button", { name: "生成提词卡" }).click();
  await expect(page.getByText(/模型提词卡已生成|已切回本地练习结果|本地练习|回答框架/).first()).toBeVisible({ timeout: 35_000 });
  await assertNoHorizontalOverflow(page, "live 1280x720");
  await page.locator("button", { hasText: "结束" }).first().click();
  await expect(page.getByRole("dialog", { name: "结束实时助手" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "保存并结束" }).click();
  await expect(page.getByText(/面试记录|实时助手记录/).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "会议监听" }).click();
  await expect(page.getByRole("heading", { name: "Windows 音频桥" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/腾讯会议、飞书/)).toBeVisible();
  await expect(page.getByText("dotnet run --project audio-bridge/AudioBridge.csproj")).toBeVisible();
  await assertNoHorizontalOverflow(page, "audio bridge 1280x720");

  await page.getByRole("button", { name: "模拟面试" }).click();
  await expect(page.getByRole("heading", { name: "先选择一个岗位" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /字节跳动|AI 产品经理/ }).first().click();
  await page.getByRole("button", { name: /进入面试房间|保存配置并进入练习/ }).click();
  await expect(page.getByLabel("模拟面试回答")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("模拟面试回答").fill("我负责过 AI 面试助手项目，先通过用户访谈确认卡点，再用 RAG 连接岗位、简历和题库，最终把练习到复盘的路径跑通。上线后用户首次练习完成率提升 32%。");
  await page.getByRole("button", { name: "提交当前回答" }).click();
  await expect(page.getByText(/模型生成|本地练习|题目来源|追问/).first()).toBeVisible({ timeout: 35_000 });
  await assertNoHorizontalOverflow(page, "mock room 1280x720");
  await page.locator("button", { hasText: "结束" }).last().click();
  await expect(page.getByRole("dialog", { name: "结束模拟面试" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "保存并结束" }).click();
  await expect(page.getByText(/面试记录|模拟面试/).first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: join(artifactsDir, "desktop-records-1280x720.png"), fullPage: true });
}

async function runMobileOverflowSmoke(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/live", "/audio-bridge", "/mock", "/records"]) {
    await page.goto(`${frontendUrl}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    await assertNoHorizontalOverflow(page, `${path} 390px`);
  }
  await page.screenshot({ path: join(artifactsDir, "mobile-records-390.png"), fullPage: true });
}

async function main() {
  mkdirSync(artifactsDir, { recursive: true });
  const tempDir = mkdtempSync(join(tmpdir(), "ai-job-external-browser-"));
  const dbPath = join(tempDir, "browser-flow.sqlite");

  startProcess(node, ["node_modules/tsx/dist/cli.mjs", "server/index.ts"], {
    AI_JOB_DB_PATH: dbPath,
    SERVER_PORT: String(backendPort),
    HOST: "127.0.0.1",
    APP_CORS_ORIGIN: frontendUrl,
  });
  startProcess(node, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(frontendPort), "--configLoader", "runner"], {
    API_PROXY_TARGET: backendUrl,
  });

  let browser: Browser | undefined;
  const browserErrors: string[] = [];
  try {
    await waitForHttp(`${backendUrl}/api/health`, "backend");
    await waitForHttp(frontendUrl, "frontend");
    browser = await launchBrowser();
    const context = await browser.newContext({ locale: "zh-CN" });
    const page = await context.newPage();
    const ignoredResourcePatterns = ["/favicon.ico", "/robots.txt", "silero_vad", "/vad/", "/onnx/", "ort-wasm"];
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (text.includes("silero_vad") || text.includes("/vad/")) return;
      // "Failed to load resource" 404 由 response 监听更精确地记录与过滤，避免无 URL 的重复误报。
      if (text.includes("Failed to load resource")) return;
      browserErrors.push(text);
    });
    page.on("pageerror", (error) => {
      const text = error.message;
      if (text.includes("silero_vad") || text.includes("/vad/")) return;
      browserErrors.push(text);
    });
    page.on("response", (response) => {
      if (response.status() !== 404) return;
      const url = response.url();
      if (ignoredResourcePatterns.some((pattern) => url.includes(pattern))) return;
      browserErrors.push(`404: ${url}`);
    });

    await runDesktopFlow(page);
    await runMobileOverflowSmoke(page);

    if (browserErrors.length) {
      throw new Error(`browser console errors:\n${browserErrors.join("\n")}`);
    }
    console.log(JSON.stringify({
      status: "pass",
      mode: headed ? "headed external browser" : "headless external browser",
      frontendUrl,
      backendUrl,
      artifactsDir,
    }, null, 2));
  } finally {
    if (browser) await browser.close();
    await stopChildren();
    cleanupTempDir(tempDir);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
