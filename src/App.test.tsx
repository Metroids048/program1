import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { MockSetupModal } from "./components/live";
import { DEFAULT_CONFIG } from "./components/sharedConfig";
import type { InterviewRecord } from "./types";
import { createPosition, createProfile } from "./lib/interviewEngine";
import { saveServerSnapshotCache, serializeAppState } from "./lib/store";
import { saveUiPrefs } from "./lib/store";

const vadMockState = vi.hoisted(() => ({
  options: [] as Array<{ onSpeechEnd?: () => void }>,
  errored: false,
  start: vi.fn(async () => undefined),
  pause: vi.fn(async () => undefined),
}));

vi.mock("@ricky0123/vad-react", () => ({
  useMicVAD: (options: { onSpeechEnd?: () => void }) => {
    vadMockState.options.push(options);
    return {
      listening: false,
      errored: vadMockState.errored,
      loading: false,
      userSpeaking: false,
      start: vadMockState.start,
      pause: vadMockState.pause,
      toggle: vi.fn(async () => undefined),
    };
  },
}));

let authState: {
  session: { userId: string; phone: string | null; email?: string | null; emailVerifiedAt?: string | null; displayName: string } | null;
  loading: boolean;
  isLoggedIn: boolean;
} = {
  session: { userId: "test-user", phone: "13800138000", displayName: "测试用户" },
  loading: false,
  isLoggedIn: true,
};
let clearAuthMock = vi.fn();
let updateSessionMock = vi.fn();

vi.mock("./lib/auth", () => ({
  useAuth: () => ({
    session: authState.session,
    loading: authState.loading,
    isLoggedIn: authState.isLoggedIn,
    getToken: () => "mock-token",
    setAuth: vi.fn(),
    clearAuth: clearAuthMock,
    updateSession: updateSessionMock,
  }),
}));

type SpeechRecognitionMock = {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

let lastRecognition: SpeechRecognitionMock | null = null;

function installSpeechRecognitionMock() {
  function MockSpeechRecognition() {
    const instance: SpeechRecognitionMock = {
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
      onresult: null,
      onerror: null,
      onend: null,
    };
    instance.stop.mockImplementation(() => instance.onend?.());
    lastRecognition = instance;
    return instance;
  }
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: MockSpeechRecognition });
}

function emitSpeech(text: string, isFinal: boolean) {
  const result = { isFinal, 0: { transcript: text }, length: 1, item: () => ({ transcript: text }) };
  const results = Object.assign([result], { item: () => result });
  act(() => lastRecognition?.onresult?.({ resultIndex: 0, results }));
}

function mockJsonResponse(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
}

function mockTextErrorResponse(text: string, status = 500) {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(text),
    statusText: "Request Failed",
  } as Response);
}

function mockStateResponse() {
  return {
    profile: createProfile("测试候选人\nAI 产品"),
    positions: [],
    activePositionId: "",
    records: [],
    journeyState: "ready",
  };
}

function mockStateWithPosition() {
  const profile = createProfile("测试候选人\nAI 产品\n项目经历\n负责增长分析与产品优化");
  const position = createPosition("岗位：AI 产品经理\n公司：腾讯\n面试官：业务负责人\n时长：30分钟\n岗位职责：负责增长与数据分析", profile);
  return {
    profile,
    positions: [position],
    activePositionId: position.id,
    records: [],
    journeyState: "ready",
  };
}

function mockStateWithRecords() {
  const profile = createProfile("测试候选人\nAI 产品\n项目经历\n负责增长分析与产品优化");
  const positionA = createPosition("岗位：AI 产品经理\n公司：腾讯\n面试官：业务负责人\n时长：30分钟\n岗位职责：负责增长与数据分析", profile);
  const positionB = createPosition("岗位：增长运营\n公司：字节跳动\n面试官：业务负责人\n时长：30分钟\n岗位职责：负责增长与活动分析", profile);
  const now = new Date().toISOString();
  const records: InterviewRecord[] = [
    {
      id: "record-a",
      positionId: positionA.id,
      mode: "mock",
      title: "腾讯 · AI 产品经理",
      createdAt: now,
      transcript: [
        { role: "interviewer", text: "请介绍一个你做过的 AI 项目。" },
        { role: "candidate", text: "我负责过一个面试助手项目。" },
      ],
      cueCards: [],
      questionIds: [],
      speechMetrics: [],
      report: {
        overallScore: 82,
        dimensions: {
          completeness: 80,
          relevance: 84,
          evidenceStrength: 79,
          structure: 83,
          riskControl: 78,
        },
        summary: "回答完整，但证据还能更具体。",
        nextActions: ["补充更可验证的结果数据"],
        source: "local",
      },
      summary: "回答完整，但证据还能更具体。",
    },
    {
      id: "record-b",
      positionId: positionB.id,
      mode: "live",
      title: "字节跳动 · 增长运营",
      createdAt: now,
      transcript: [
        { role: "interviewer", text: "请讲一个增长项目。" },
        { role: "candidate", text: "我做过校园增长活动。" },
      ],
      cueCards: [],
      questionIds: [],
      speechMetrics: [],
      report: {
        overallScore: 76,
        dimensions: {
          completeness: 74,
          relevance: 78,
          evidenceStrength: 72,
          structure: 77,
          riskControl: 75,
        },
        summary: "结论有了，但数据还不够扎实。",
        nextActions: ["补充关键指标和验证过程"],
        source: "local",
      },
      summary: "结论有了，但数据还不够扎实。",
    },
  ];
  return {
    profile,
    positions: [positionA, positionB],
    activePositionId: positionA.id,
    records,
    journeyState: "ready",
  };
}

function mockCueCardStream(questionText = "请介绍一个你做过的增长项目") {
  const card = {
    id: "card-server",
    questionText,
    createdAt: new Date().toISOString(),
    source: "live",
    strategy: "先给结论，再讲动作和结果。",
    openingLine: "我想从一个增长项目讲起。",
    bullets: ["背景", "动作", "结果"],
    evidenceIds: ["project-growth"],
    risks: ["不要泛泛而谈"],
    followUps: ["你怎么验证效果？"],
  };
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          `event: card\ndata: ${JSON.stringify({
            card,
            promptRun: { status: "success", latencyMs: 874 },
            searchCount: 0,
            meta: { backendStatus: "success", fallbackReason: "", evidenceTrace: [], latencyMs: 874 },
          })}\n\n`,
        ),
      );
      controller.close();
    },
  });
  return Promise.resolve({ ok: true, body: stream } as Response);
}

function mockStagedCueCardStream(questionText = "请介绍一个你做过的增长项目") {
  const card = {
    id: "card-server-staged",
    questionText,
    createdAt: new Date().toISOString(),
    source: "live",
    strategy: "先给结论，再讲动作和结果。",
    openingLine: "我想从一个增长项目讲起。",
    bullets: ["背景", "动作", "结果"],
    evidenceIds: ["project-growth"],
    risks: ["不要泛泛而谈"],
    followUps: ["你怎么验证效果？"],
  };
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`event: stage\ndata: ${JSON.stringify({ label: "检索 JD、简历和问题库", status: "running" })}\n\n`));
      await Promise.resolve();
      controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: "正在结合你的资料生成提词卡。" })}\n\n`));
      await Promise.resolve();
      controller.enqueue(
        encoder.encode(
          `event: card\ndata: ${JSON.stringify({
            card,
            promptRun: { status: "success", latencyMs: 874 },
            searchCount: 0,
            meta: { backendStatus: "success", fallbackReason: "", evidenceTrace: [], latencyMs: 874 },
          })}\n\n`,
        ),
      );
      controller.close();
    },
  });
  return Promise.resolve({ ok: true, body: stream } as Response);
}

function mockCueCardStreamWithHistory(questionText = "请介绍当前增长项目") {
  const now = new Date().toISOString();
  const previousCard = {
    id: "card-history-prev",
    questionText: "上一题：讲讲你做过的增长项目",
    createdAt: now,
    source: "live" as const,
    strategy: "先讲目标，再讲动作。",
    openingLine: "上一题开场句",
    bullets: ["目标", "动作", "结果"],
    evidenceIds: ["project-growth"],
    risks: ["不要只说过程"],
    followUps: ["如何验证？"],
  };
  const currentCard = {
    ...previousCard,
    id: "card-history-current",
    questionText,
    openingLine: "当前题开场句",
  };
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          `event: card\ndata: ${JSON.stringify({
            card: currentCard,
            sessionId: "live-session-history",
            history: [
              {
                id: "turn-prev",
                questionText: previousCard.questionText,
                card: previousCard,
                meta: { backendStatus: "success", fallbackReason: "", evidenceTrace: [], latencyMs: 500 },
                createdAt: now,
              },
              {
                id: "turn-current",
                questionText,
                card: currentCard,
                meta: { backendStatus: "success", fallbackReason: "", evidenceTrace: [], latencyMs: 700 },
                createdAt: now,
              },
            ],
            promptRun: { status: "success", latencyMs: 700 },
            searchCount: 0,
            meta: { backendStatus: "success", fallbackReason: "", evidenceTrace: [], latencyMs: 700 },
          })}\n\n`,
        ),
      );
      controller.close();
    },
  });
  return Promise.resolve({ ok: true, body: stream } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
  vadMockState.options = [];
  vadMockState.errored = false;
  vadMockState.start.mockClear();
  vadMockState.pause.mockClear();
  lastRecognition = null;
  authState = {
    session: { userId: "test-user", phone: "13800138000", displayName: "测试用户" },
    loading: false,
    isLoggedIn: true,
  };
  clearAuthMock = vi.fn();
  updateSessionMock = vi.fn();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
  Reflect.deleteProperty(window, "SpeechRecognition");
});

beforeEach(() => {
  authState = {
    session: { userId: "test-user", phone: "13800138000", displayName: "测试用户" },
    loading: false,
    isLoggedIn: true,
  };
  clearAuthMock = vi.fn();
  updateSessionMock = vi.fn();
});

function renderApp(route = "/") {
  window.history.replaceState({}, "", route);
  render(<App />);
}

function resetDom() {
  document.body.innerHTML = "";
}

function setDesktopViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

describe("App", () => {
  it("uses the seven-route navigation without the removed legacy entry", () => {
    renderApp();
    const nav = within(screen.getByLabelText("主导航"));

    ["首页", "实时助手", "模拟面试"].forEach((name) => {
      expect(nav.getByRole("button", { name })).toBeInTheDocument();
    });
    expect(nav.getByText("资料库")).toBeInTheDocument();
    expect(nav.getByText("资料库").closest("summary")).toHaveAttribute("aria-expanded");
    (nav.getByText("资料库").closest("details") as HTMLDetailsElement).open = true;
    ["JD分析", "问题记录", "我的简历", "面试记录"].forEach((name) => {
      expect(nav.getByRole("button", { name })).toBeInTheDocument();
    });
    expect(nav.queryByRole("button", { name: "上下文资料" })).not.toBeInTheDocument();
  });

  it("creates a position from home without leaving the intake conversation", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateResponse());
      if (url.includes("/api/positions/intake")) {
        const profile = createProfile("测试候选人\nAI 产品");
        const position = createPosition("岗位：高级产品经理\n公司：腾讯\n面试官：业务负责人\n时长：30分钟", profile);
        return mockJsonResponse({
          profile,
          positions: [position],
          activePositionId: position.id,
          records: [],
        });
      }
      return mockJsonResponse(mockStateResponse());
    });

    renderApp();
    const main = within(screen.getByRole("main"));

    expect(main.getByRole("heading", { level: 1, name: "告诉 AI 你想面试的岗位" })).toBeInTheDocument();
    expect(main.getByRole("heading", { level: 2, name: "先放一整段 JD 或面试背景" })).toBeInTheDocument();
    expect(main.getByLabelText("首页主输入")).toBeInTheDocument();
    expect(main.queryByRole("button", { name: /上传 JD/ })).not.toBeInTheDocument();

    await user.type(main.getByLabelText("首页主输入"), "岗位：高级产品经理\n公司：腾讯\n面试官：业务负责人\n时长：30分钟");
    await user.click(main.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(screen.getByRole("heading", { name: "腾讯 · 高级产品经理" })).toBeInTheDocument();
  });

  it("opens the login page from the guest sidebar entry", async () => {
    authState = {
      session: null,
      loading: false,
      isLoggedIn: false,
    };
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateResponse());
      return mockJsonResponse(mockStateResponse());
    });

    const user = userEvent.setup();
    renderApp("/");

    await screen.findByRole("button", { name: "登录后自动保存与同步" });
    await user.click(screen.getByRole("button", { name: "登录后自动保存与同步" }));

    await waitFor(() => expect(window.location.pathname).toBe("/auth/login"));
  });

  it("redirects guests to login when they trigger gated homepage actions", async () => {
    authState = {
      session: null,
      loading: false,
      isLoggedIn: false,
    };
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateResponse());
      return mockJsonResponse(mockStateResponse());
    });

    const user = userEvent.setup();
    renderApp("/");

    expect(await screen.findByRole("heading", { name: "AI 求职台" })).toBeInTheDocument();
    expect(screen.queryByLabelText("首页主输入")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "注册并开始" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "已有账号，登录" }));
    await waitFor(() => expect(window.location.pathname).toBe("/auth/login"));
  });

  it("covers the supporting routes for auth, onboarding, account and status pages", async () => {
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      if (url.includes("/api/auth/password/forgot")) return mockJsonResponse({ ok: true });
      if (url.includes("/api/auth/password/reset")) return mockJsonResponse({ ok: true });
      if (url.includes("/api/auth/email/verify")) return mockJsonResponse({ user: { email: "test@example.com", emailVerifiedAt: new Date().toISOString() } });
      if (url.includes("/api/onboarding")) return mockJsonResponse({ ok: true, nextStep: "intake_jd" });
      if (url.includes("/api/quota")) return mockJsonResponse({ dailyUsed: 1, dailyLimit: 10, remaining: 9, isGuest: false });
      return mockJsonResponse(mockStateWithPosition());
    });

    renderApp("/auth/login");
    expect(await screen.findByRole("heading", { name: "AI 求职台" })).toBeInTheDocument();

    renderApp("/auth/register");
    expect(await screen.findByRole("button", { name: "注册并开始使用" })).toBeInTheDocument();

    renderApp("/forgot-password");
    expect(await screen.findByRole("heading", { name: "内测阶段暂不支持邮件找回" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "去登录" })).toBeInTheDocument();

    renderApp("/reset-password?token=test-token");
    expect(await screen.findByRole("heading", { name: "内测阶段暂不支持邮件重置" })).toBeInTheDocument();

    renderApp("/verify-email?token=test-token");
    expect(await screen.findByRole("heading", { name: "内测阶段暂不支持邮箱验证" })).toBeInTheDocument();

    resetDom();
    renderApp("/onboarding");
    expect(await screen.findByRole("heading", { name: "目标岗位" })).toBeInTheDocument();

    resetDom();
    renderApp("/account");
    expect(await screen.findByRole("dialog", { name: "账户与数据" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");

    resetDom();
    renderApp("/404");
    expect(await screen.findByRole("heading", { name: "这个页面不存在" })).toBeInTheDocument();

    resetDom();
    renderApp("/500");
    expect(await screen.findByRole("heading", { name: "页面暂时出了点问题" })).toBeInTheDocument();
  });

  it("makes legal, about and help pages reachable by URL with a register consent link", async () => {
    vi.spyOn(window, "fetch").mockImplementation(() => mockJsonResponse(mockStateWithPosition()));

    resetDom();
    renderApp("/terms-of-service");
    expect(await screen.findByRole("heading", { name: "用户协议" })).toBeInTheDocument();

    resetDom();
    renderApp("/privacy-policy");
    expect(await screen.findByRole("heading", { name: "隐私政策" })).toBeInTheDocument();

    resetDom();
    renderApp("/about");
    expect(await screen.findByRole("heading", { name: "关于我们" })).toBeInTheDocument();

    resetDom();
    renderApp("/help");
    expect(await screen.findByRole("heading", { name: "帮助中心" })).toBeInTheDocument();

    resetDom();
    renderApp("/auth/register");
    expect(await screen.findByRole("button", { name: "《用户协议》" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "《隐私政策》" })).toBeInTheDocument();
  });

  it("does not merge cached guest positions into a newly registered account", async () => {
    const user = userEvent.setup();
    const guestState = mockStateWithPosition();
    saveServerSnapshotCache({
      profile: guestState.profile,
      positions: guestState.positions,
      activePositionId: guestState.activePositionId,
      interviewRecords: [],
      activeRecordId: "",
      aiMode: true,
      journeyState: "ready",
    });
    const fetchMock = vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/auth/register")) {
        return mockJsonResponse({
          user: { userId: "new-user", phone: "13800139999", displayName: "新用户" },
          tokens: { accessToken: "new-token", expiresAt: new Date(Date.now() + 3600_000).toISOString() },
        });
      }
      if (url.includes("/api/state")) return mockJsonResponse(mockStateResponse());
      return mockJsonResponse({ ok: true });
    });

    renderApp("/auth/register");
    await user.type(screen.getByPlaceholderText("请输入手机号"), "13800139999");
    await user.type(screen.getByPlaceholderText("至少 8 位"), "Password123");
    await user.click(screen.getByRole("button", { name: /注册并开始使用/ }));

    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/auth/merge-guest"))).toBe(false);
  });

  it("puts logout and switch-account actions at the top of the account drawer", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      return mockJsonResponse({ ok: true });
    });

    renderApp("/");
    await user.click(await screen.findByLabelText("测试用户，打开账户与数据"));
    const drawer = await screen.findByRole("dialog", { name: "账户与数据" });

    expect(within(drawer).getByText("当前账号：138****8000")).toBeInTheDocument();
    await user.click(within(drawer).getByRole("button", { name: "切换账号" }));
    expect(clearAuthMock).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/auth/login");

    resetDom();
    clearAuthMock = vi.fn();
    renderApp("/");
    await user.click(await screen.findByLabelText("测试用户，打开账户与数据"));
    await user.click(within(await screen.findByRole("dialog", { name: "账户与数据" })).getByRole("button", { name: "退出登录" }));
    expect(clearAuthMock).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/");
  });

  it("uses the current product routes for position detail, conversation, jd, questions, resume and records pages", async () => {
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      return mockJsonResponse(mockStateWithPosition());
    });

    const snapshot = mockStateWithPosition();
    const positionId = snapshot.activePositionId;

    renderApp(`/positions/${positionId}`);
    expect((await screen.findAllByRole("heading", { name: "腾讯 · AI 产品经理" })).length).toBeGreaterThan(0);
    expect(screen.getByText("JD 与岗位信息")).toBeInTheDocument();

    resetDom();
    renderApp(`/positions/${positionId}/conversation`);
    expect((await screen.findAllByRole("heading", { name: "腾讯 · AI 产品经理" })).length).toBeGreaterThan(0);
    expect(screen.getByText("边聊边保存")).toBeInTheDocument();

    resetDom();
    renderApp("/jd");
    expect(await screen.findByRole("heading", { name: "围绕当前岗位准备重点" })).toBeInTheDocument();

    resetDom();
    renderApp("/questions");
    expect(await screen.findByRole("heading", { name: "当前岗位的问题与资料沉淀" })).toBeInTheDocument();

    resetDom();
    renderApp("/resume");
    expect((await screen.findAllByRole("heading", { name: "我的简历" })).length).toBeGreaterThan(0);

    resetDom();
    renderApp("/records");
    expect(await screen.findByText("还没有面试记录")).toBeInTheDocument();
  });

  it("keeps a shareable record detail URL on direct open and when switching records", async () => {
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithRecords());
      return mockJsonResponse(mockStateWithRecords());
    });

    renderApp("/records/record-a");
    expect(await screen.findByRole("heading", { name: "腾讯 · AI 产品经理" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/records/record-a");

    const rail = document.querySelector(".records-rail");
    const nextRecord = rail ? within(rail as HTMLElement).getByRole("button", { name: /字节跳动 · 增长运营/ }) : null;
    await userEvent.setup().click(nextRecord as HTMLElement);

    await waitFor(() => expect(window.location.pathname).toBe("/records/record-b"));
    expect(screen.getByRole("heading", { name: "字节跳动 · 增长运营" })).toBeInTheDocument();
  });

  it("keeps live speech text after stop, lets the user edit, and generates a cue card", async () => {
    installSpeechRecognitionMock();
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      if (url.includes("/api/copilot/cue-card/stream")) return mockCueCardStream("请介绍一个你做过最有挑战性的产品功能");
      return mockJsonResponse(mockStateWithPosition());
    });

    const user = userEvent.setup();
    renderApp("/live");

    await screen.findByText("问题输入");
    expect(screen.getByRole("button", { name: "手动确认" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "自动生成" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "开始听取" }));
    emitSpeech("请介绍一个", false);
    expect(screen.getByText("请介绍一个")).toBeInTheDocument();
    emitSpeech("请介绍一个你做过最有挑战性的产品功能", true);
    await user.click(screen.getByRole("button", { name: "停止听取" }));

    const textarea = screen.getByLabelText("实时问题输入") as HTMLTextAreaElement;
    expect(textarea.value).toContain("请介绍一个你做过最有挑战性的产品功能");
    expect(screen.queryAllByText("请介绍一个你做过最有挑战性的产品功能").filter((node) => node.tagName.toLowerCase() !== "textarea")).toHaveLength(0);

    await user.type(textarea, "，重点说数据验证");
    await user.click(screen.getByRole("button", { name: /生成提词卡/ }));

    await waitFor(() => expect(screen.getAllByText("提词卡").length).toBeGreaterThan(0));
    expect(screen.getAllByText(/模型/).length).toBeGreaterThan(0);
    expect(screen.getByText("注意")).toBeInTheDocument();
    expect(screen.getByText("追问预测")).toBeInTheDocument();
    expect(screen.getByText("开场句")).toBeInTheDocument();
    expect(screen.getByText("已识别，可继续编辑")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "结束" }));
    expect(screen.getByRole("dialog", { name: "结束实时助手" })).toBeInTheDocument();
  });

  it("shows expandable full live cue-card history returned by the server session", async () => {
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      if (url.includes("/api/copilot/cue-card/stream")) return mockCueCardStreamWithHistory("当前题：怎么证明增长有效");
      return mockJsonResponse(mockStateWithPosition());
    });

    const user = userEvent.setup();
    renderApp("/live");

    await screen.findByText("问题输入");
    await user.type(screen.getByLabelText("实时问题输入"), "当前题：怎么证明增长有效");
    await user.click(screen.getByRole("button", { name: /生成提词卡/ }));

    const historyToggle = await screen.findByText("完整历史提词卡（2）");
    await user.click(historyToggle);

    expect(screen.getByText("上一题：讲讲你做过的增长项目")).toBeInTheDocument();
    expect(screen.getByText("上一题开场句")).toBeInTheDocument();
  });

  it("auto-generates a live cue card from final speech text", async () => {
    installSpeechRecognitionMock();
    const fetchMock = vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      if (url.includes("/api/copilot/cue-card/stream")) return mockStagedCueCardStream();
      return mockJsonResponse(mockStateWithPosition());
    });

    const user = userEvent.setup();
    renderApp("/live");

    await screen.findByText("问题输入");
    await user.click(screen.getByRole("button", { name: "自动生成" }));
    await user.click(screen.getByRole("button", { name: "开始听取" }));
    emitSpeech("请介绍一个你做过的增长项目", true);
    emitSpeech("请介绍一个你做过的增长项目", true);
    act(() => lastRecognition?.onend?.());

    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/copilot/cue-card/stream"))).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "记录到面试资料" })).toBeInTheDocument(), { timeout: 2500 });
    expect(screen.getByText("已识别，可继续编辑")).toBeInTheDocument();
  });

  it("uses VAD speech end to stop live dictation and auto-generate without clearing text", async () => {
    installSpeechRecognitionMock();
    const fetchMock = vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      if (url.includes("/api/copilot/cue-card/stream")) return mockStagedCueCardStream();
      return mockJsonResponse(mockStateWithPosition());
    });

    const user = userEvent.setup();
    renderApp("/live");

    await screen.findByText("问题输入");
    await user.click(screen.getByRole("button", { name: "自动生成" }));
    await user.click(screen.getByRole("button", { name: "开始听取" }));
    emitSpeech("请介绍一个你做过的增长项目", true);

    act(() => vadMockState.options.at(-1)?.onSpeechEnd?.());

    await waitFor(() => expect(screen.getByRole("button", { name: "开始听取" })).toBeInTheDocument());
    expect((screen.getByLabelText("实时问题输入") as HTMLTextAreaElement).value).toContain("请介绍一个你做过的增长项目");
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/copilot/cue-card/stream"))).toHaveLength(1));
  });

  it("shows quota exhaustion as an AI quota message instead of a generic server failure", async () => {
    installSpeechRecognitionMock();
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      if (url.includes("/api/copilot/cue-card/stream")) {
        return mockTextErrorResponse(JSON.stringify({
          error: "QUOTA_EXCEEDED",
          message: "今日提词卡额度已用完，明天 0 点重置。",
          quota: { feature: "cueCard", remaining: 0 },
        }), 429);
      }
      return mockJsonResponse(mockStateWithPosition());
    });

    const user = userEvent.setup();
    renderApp("/live");

    await screen.findByText("问题输入");
    await user.type(screen.getByLabelText("实时问题输入"), "请介绍一个增长项目");
    await user.click(screen.getByRole("button", { name: /生成提词卡/ }));

    await waitFor(() => expect(screen.getAllByText(/今日提词卡额度已用完/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/CUE_CARD_STREAM_FAILED/)).not.toBeInTheDocument();
  });

  it("uses the mock interview flow of position list to setup to room and saves a mock report", async () => {
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      if (url.includes("/api/mock/session") && !url.includes("/answer")) {
        return mockJsonResponse({
          sessionId: "session-test",
          question: "请讲一个你做过的增长项目。",
          backendStatus: "success",
          questionSource: "模型出题",
        });
      }
      if (url.includes("/api/mock/session/session-test/answer")) {
        return new Promise<Response>((resolve) => {
          window.setTimeout(() => {
            void mockJsonResponse({
              backendStatus: "success",
              followUp: "你怎么判断这个增长动作不是短期补贴带来的？",
              record: {
                id: "server-record",
                report: {
                  overallScore: 82,
                  dimensions: {
                    completeness: 80,
                    relevance: 84,
                    evidenceStrength: 79,
                    structure: 83,
                    riskControl: 78,
                  },
                  summary: "回答完整，但证据还能更具体。",
                  nextActions: ["补充更可验证的结果数据"],
                },
              } as InterviewRecord,
              decision: { type: "followup", question: "追问", instantFeedback: "结构清晰，但证据还能更具体。", internalNote: "" },
            }).then(resolve);
          }, 30);
        });
      }
      if (url.includes("/api/copilot/cue-card/stream")) {
        return mockCueCardStream("请讲一个你做过的增长项目。");
      }
      if (url.includes("/api/records")) {
        return mockJsonResponse({ record: { id: "saved-record" }, records: [] });
      }
      return mockJsonResponse(mockStateWithPosition());
    });

    const user = userEvent.setup();
    renderApp("/mock");

    await screen.findByRole("heading", { name: "先选择一个岗位" });
    await user.click(screen.getByRole("button", { name: /腾讯/ }));
    await screen.findByRole("heading", { name: "腾讯 · AI 产品经理" });
    await user.click(screen.getByRole("button", { name: "进入面试房间" }));

    await waitFor(() => expect(screen.getAllByText("请讲一个你做过的增长项目。").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "生成提词卡" }));
    await waitFor(() => expect(screen.getAllByText("提词卡").length).toBeGreaterThan(0));

    await user.type(screen.getByLabelText("模拟面试回答"), "我做过校园二手交易增长项目，负责用户访谈、漏斗分析和优惠策略验证，首单转化从 12% 提升到 19%。");
    await user.click(screen.getByRole("button", { name: "提交当前回答" }));

    await waitFor(() => expect(screen.getAllByText("你怎么判断这个增长动作不是短期补贴带来的？").length).toBeGreaterThan(0));
    expect(screen.getByText("结构清晰，但证据还能更具体。")).toBeInTheDocument();

    await user.type(screen.getByLabelText("模拟面试回答"), "如果重做，我会更早定义北极星指标和样本分层。");
    await user.click(screen.getAllByRole("button", { name: "结束" })[1]);
    const finishDialog = screen.getByRole("dialog", { name: "结束模拟面试" });
    await user.click(within(finishDialog).getByRole("button", { name: "保存并结束" }));

    await waitFor(() => expect(window.location.pathname).toBe("/records"));
  });

  it("keeps mock answer speech text after stop and lets the user edit before submitting", async () => {
    installSpeechRecognitionMock();
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      if (url.includes("/api/mock/session") && !url.includes("/answer")) {
        return mockJsonResponse({
          sessionId: "session-speech",
          question: "请讲一个你做过的增长项目。",
          backendStatus: "success",
          questionSource: "模型出题",
        });
      }
      if (url.includes("/api/mock/session/session-speech/answer")) {
        return mockJsonResponse({
          backendStatus: "fallback",
          followUp: "请补充验证方法。",
          record: {
            id: "server-record",
            report: {
              overallScore: 70,
              dimensions: { completeness: 70, relevance: 70, evidenceStrength: 70, structure: 70, riskControl: 70 },
              summary: "继续补证据。",
              nextActions: ["补充指标"],
            },
          } as InterviewRecord,
          decision: { type: "followup", question: "请补充验证方法。", instantFeedback: "继续补充数据证据。", internalNote: "" },
        });
      }
      return mockJsonResponse(mockStateWithPosition());
    });

    const user = userEvent.setup();
    renderApp("/mock");

    await screen.findByRole("heading", { name: "先选择一个岗位" });
    await user.click(screen.getByRole("button", { name: /腾讯/ }));
    await screen.findByRole("heading", { name: "腾讯 · AI 产品经理" });
    await user.click(screen.getByRole("button", { name: "进入面试房间" }));
    await waitFor(() => expect(screen.getAllByText("请讲一个你做过的增长项目。").length).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: "语音作答" }));
    emitSpeech("我负责校园增长项目", false);
    expect(screen.getAllByText("我负责校园增长项目").length).toBeGreaterThan(0);
    emitSpeech("我负责校园增长项目，首单转化从 12% 到 19%", true);
    await user.click(screen.getByRole("button", { name: "停止" }));

    const textarea = screen.getByLabelText("模拟面试回答") as HTMLTextAreaElement;
    expect(textarea.value).toContain("我负责校园增长项目，首单转化从 12% 到 19%");
    await user.type(textarea, "，并做了分层验证");
    await user.click(screen.getByRole("button", { name: "提交当前回答" }));

    await waitFor(() => expect(screen.getAllByText("请补充验证方法。").length).toBeGreaterThan(0));
  });

  it("uses VAD speech end to stop mock dictation and auto-submit in auto mode", async () => {
    installSpeechRecognitionMock();
    const fetchMock = vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      if (url.includes("/api/mock/session") && !url.includes("/answer")) {
        return mockJsonResponse({
          sessionId: "session-vad-auto",
          question: "请讲一个你做过的增长项目。",
          backendStatus: "success",
          questionSource: "模型出题",
        });
      }
      if (url.includes("/api/mock/session/session-vad-auto/answer")) {
        return mockJsonResponse({
          backendStatus: "success",
          followUp: "你怎么证明增长有效？",
          conversationHistory: [],
          record: {
            id: "server-record",
            report: {
              overallScore: 78,
              dimensions: { completeness: 78, relevance: 78, evidenceStrength: 78, structure: 78, riskControl: 78 },
              summary: "回答结构清楚。",
              nextActions: ["补充更多证据"],
            },
          } as InterviewRecord,
          decision: { type: "followup", question: "你怎么证明增长有效？", instantFeedback: "结构清楚。", internalNote: "" },
        });
      }
      return mockJsonResponse(mockStateWithPosition());
    });

    const user = userEvent.setup();
    renderApp("/mock");

    await screen.findByRole("heading", { name: "先选择一个岗位" });
    await user.click(screen.getByRole("button", { name: /腾讯/ }));
    await screen.findByRole("heading", { name: "腾讯 · AI 产品经理" });
    await user.click(screen.getByText("更多设置"));
    await user.selectOptions(screen.getByLabelText("提交方式"), "auto");
    await user.click(screen.getByRole("button", { name: "进入面试房间" }));
    await waitFor(() => expect(screen.getAllByText("请讲一个你做过的增长项目。").length).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: "语音作答" }));
    emitSpeech("我做过校园增长项目，首单转化提升到 19%", true);
    act(() => vadMockState.options.at(-1)?.onSpeechEnd?.());

    await waitFor(() => expect(screen.getByRole("button", { name: "语音作答" })).toBeInTheDocument());
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/mock/session/session-vad-auto/answer"))).toBe(true));
    expect(screen.getByText("结构清楚。")).toBeInTheDocument();
  });

  it("explains fixed mock interview pacing without fake question count or timer inputs", async () => {
    render(<MockSetupModal config={DEFAULT_CONFIG} onClose={vi.fn()} onStart={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "开始模拟面试" });
    expect(within(dialog).queryByLabelText("题数")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("计时")).not.toBeInTheDocument();
    expect(within(dialog).getByText("本轮共 8 题，建议每题控制在 90 秒内回答。")).toBeInTheDocument();
    expect(within(dialog).getByText("每题反馈为本地规则速评，结束后完整报告优先由模型生成。")).toBeInTheDocument();
  });

  it("shows local practice mode when the mock backend is unavailable", async () => {
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      return Promise.reject(new Error("offline"));
    });

    const user = userEvent.setup();
    renderApp("/mock");

    await screen.findByRole("heading", { name: "先选择一个岗位" });
    await user.click(screen.getByRole("button", { name: /腾讯/ }));
    await screen.findByRole("heading", { name: "腾讯 · AI 产品经理" });
    await user.click(screen.getByRole("button", { name: "进入面试房间" }));

    await waitFor(() => expect(screen.getByText(/当前为本地练习模式/)).toBeInTheDocument());
  });

  it("shows the specific resume AI failure reason instead of only generic local mode copy", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      if (url.includes("/api/resume/ai")) {
        return mockTextErrorResponse(JSON.stringify({ error: "DEEPSEEK_TIMEOUT", message: "模型响应超时" }), 504);
      }
      return mockJsonResponse(mockStateWithPosition());
    });

    renderApp("/resume");
    expect((await screen.findAllByRole("heading", { name: "我的简历" })).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: "优化当前模块" })[0]);

    expect((await screen.findAllByText(/服务端失败：模型响应超时/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/当前先保留本地练习模式建议/)).toBeInTheDocument();
  });

  it("shows a toast when saving a record fails after the interview ends", async () => {
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      if (url.includes("/api/mock/session") && !url.includes("/answer")) {
        return mockJsonResponse({
          sessionId: "session-test",
          question: "请讲一个你做过的增长项目。",
          backendStatus: "success",
          questionSource: "模型出题",
        });
      }
      if (url.includes("/api/mock/session/session-test/answer")) {
        return mockJsonResponse({
          backendStatus: "success",
          followUp: "你怎么判断这个增长动作不是短期补贴带来的？",
          record: {
            id: "server-record",
            report: {
              overallScore: 82,
              dimensions: {
                completeness: 80,
                relevance: 84,
                evidenceStrength: 79,
                structure: 83,
                riskControl: 78,
              },
              summary: "回答完整，但证据还能更具体。",
              nextActions: ["补充更可验证的结果数据"],
            },
          } as InterviewRecord,
          decision: { type: "followup", question: "追问", instantFeedback: "结构清晰，但证据还能更具体。", internalNote: "" },
        });
      }
      if (url.includes("/api/records")) {
        return mockTextErrorResponse(JSON.stringify({ error: "SAVE_FAILED", message: "记录保存失败" }), 500);
      }
      return mockJsonResponse(mockStateWithPosition());
    });

    const user = userEvent.setup();
    renderApp("/mock");

    await screen.findByRole("heading", { name: "先选择一个岗位" });
    await user.click(screen.getByRole("button", { name: /腾讯/ }));
    await screen.findByRole("heading", { name: "腾讯 · AI 产品经理" });
    await user.click(screen.getByRole("button", { name: "进入面试房间" }));

    await waitFor(() => expect(screen.getAllByText("请讲一个你做过的增长项目。").length).toBeGreaterThan(0));
    await user.type(screen.getByLabelText("模拟面试回答"), "我做过校园二手交易增长项目，负责用户访谈、漏斗分析和优惠策略验证，首单转化从 12% 提升到 19%。");
    await user.click(screen.getByRole("button", { name: "提交当前回答" }));
    await waitFor(() => expect(screen.getAllByText("你怎么判断这个增长动作不是短期补贴带来的？").length).toBeGreaterThan(0));

    await user.click(screen.getAllByRole("button", { name: "结束" })[1]);
    const finishDialog = screen.getByRole("dialog", { name: "结束模拟面试" });
    await user.click(within(finishDialog).getByRole("button", { name: "保存并结束" }));

    expect(await screen.findByText(/记录保存失败/)).toBeInTheDocument();
  });

  it("opens account data management from the sidebar entry", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:backup");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state") || url.includes("/api/export")) return mockJsonResponse(mockStateWithPosition());
      return mockJsonResponse(mockStateWithPosition());
    });

    renderApp();
    await user.click(screen.getByRole("button", { name: /打开账户与数据/ }));

    const dialog = screen.getByRole("dialog", { name: "账户与数据" });
    expect(within(dialog).getByRole("heading", { name: "账户与数据" })).toBeInTheDocument();
    await user.click(within(dialog).getByText("更多"));
    await user.click(within(dialog).getByRole("button", { name: /导出数据/ }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:backup");
  });

  it("shows an error when backup import does not complete on the server", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      if (url.includes("/api/import")) return Promise.resolve({ ok: false, text: () => Promise.resolve("IMPORT_FAILED") } as Response);
      return mockJsonResponse(mockStateWithPosition());
    });

    renderApp();
    await user.click(screen.getByRole("button", { name: /打开账户与数据/ }));
    const dialog = screen.getByRole("dialog", { name: "账户与数据" });

    const snapshot = mockStateWithPosition();
    const backupState = {
      profile: snapshot.profile,
      positions: snapshot.positions,
      activePositionId: snapshot.activePositionId,
      interviewRecords: [],
      activeRecordId: "",
      aiMode: true,
      journeyState: "ready" as const,
    };
    const file = new File([serializeAppState(backupState)], "backup.json", { type: "application/json" });
    Object.defineProperty(file, "text", {
      configurable: true,
      value: () => Promise.resolve(serializeAppState(backupState)),
    });
    const input = within(dialog).getByLabelText("导入备份文件");
    await user.upload(input, file);

    await waitFor(() => expect(within(dialog).getByText("导入失败：服务端未完成同步，已取消本地覆盖。")).toBeInTheDocument());
    expect(window.location.pathname).toBe("/");
  });

  it("keeps the desktop sidebar expanded across route changes unless the user collapsed it", async () => {
    const user = userEvent.setup();
    setDesktopViewport(1024);
    saveUiPrefs({ desktopSidebarExpanded: true, desktopSidebarTouched: false });
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      return mockJsonResponse(mockStateWithPosition());
    });

    renderApp("/");
    await screen.findByLabelText("主导航");
    expect(document.querySelector(".shell-sidebar.expanded")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "实时助手" }));
    expect(document.querySelector(".shell-sidebar.expanded")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "收起侧边栏" }));
    expect(document.querySelector(".shell-sidebar.collapsed")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "模拟面试" }));
    expect(document.querySelector(".shell-sidebar.collapsed")).not.toBeNull();
  });

  it("keeps narrow desktop widths on the desktop shell instead of switching to the mobile drawer", async () => {
    setDesktopViewport(820);
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      return mockJsonResponse(mockStateWithPosition());
    });

    renderApp("/live");
    await screen.findByText("问题输入");

    expect(document.querySelector(".shell-sidebar")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "打开导航菜单" })).not.toBeInTheDocument();
    expect(document.querySelector(".desktop-topbar")).not.toBeNull();
  });

  it("shows explicit local practice messaging when speech is unsupported and preserves manual input", async () => {
    Reflect.deleteProperty(window, "SpeechRecognition");
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      if (url.includes("/api/copilot/cue-card/stream")) return mockCueCardStream("请介绍你的项目");
      return mockJsonResponse(mockStateWithPosition());
    });

    const user = userEvent.setup();
    renderApp("/live");

    await screen.findByText("问题输入");
    expect(screen.getByText("当前浏览器不支持语音识别，已自动降级为文本输入。")).toBeInTheDocument();

    const textarea = screen.getByLabelText("实时问题输入");
    await user.type(textarea, "请介绍你的项目");
    await user.click(screen.getByRole("button", { name: /生成提词卡/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: "记录到面试资料" })).toBeInTheDocument());
  });

  it("shows a limited-support speech warning for non-Chrome speech environments", async () => {
    installSpeechRecognitionMock();
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 Firefox/126.0",
    });
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      return mockJsonResponse(mockStateWithPosition());
    });

    renderApp("/live");

    expect(await screen.findByRole("alert")).toHaveTextContent("建议使用 Chrome 或 Edge");
  });

  it("does not choose education as the first mock question for a front-end role when project evidence exists", () => {
    const profile = createProfile(`李明
前端开发实习生

教育背景
某大学 软件工程 本科

项目经历
React 数据看板项目
- 使用 React、TypeScript 和 ECharts 开发运营数据看板，支持筛选、排序和导出
- 优化首屏加载和组件拆分，页面加载时间从 3.2 秒降到 1.4 秒
技能：React、TypeScript、JavaScript、CSS、前端工程化`);
    const position = createPosition(`岗位：前端开发实习生
公司：星河科技
要求：熟悉 React、TypeScript、JavaScript、CSS，有前端项目经验`, profile);

    expect(position.questions[0].question).toContain("React 数据看板项目");
    expect(position.questions[0].question).not.toContain("教育背景");
  });
});
