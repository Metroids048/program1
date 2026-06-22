import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { InterviewRecord } from "./types";
import { createPosition, createProfile } from "./lib/interviewEngine";
import { serializeAppState } from "./lib/store";
import { saveUiPrefs } from "./lib/store";

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

function mockStateResponse() {
  return {
    profile: createProfile("测试候选人\nAI 产品"),
    positions: [],
    activePositionId: "",
    records: [],
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

afterEach(() => {
  vi.restoreAllMocks();
  lastRecognition = null;
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
  Reflect.deleteProperty(window, "SpeechRecognition");
});

function renderApp(route = "/") {
  window.history.replaceState({}, "", route);
  render(<App />);
}

function setDesktopViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

describe("App", () => {
  it("uses the seven-route navigation without the removed legacy entry", () => {
    renderApp();
    const nav = within(screen.getByLabelText("主导航"));

    ["岗位台", "实时助手", "模拟面试", "JD 解析", "问题库", "简历", "面试记录"].forEach((name) => {
      expect(nav.getByRole("button", { name })).toBeInTheDocument();
    });
    expect(nav.queryByRole("button", { name: "上下文资料" })).not.toBeInTheDocument();
  });

  it("uses the real JD intake home to create a position and enter mock setup", async () => {
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

    expect(main.getByRole("heading", { level: 1, name: "真实 JD intake" })).toBeInTheDocument();
    expect(main.getByLabelText("JD intake 输入")).toBeInTheDocument();
    expect(main.getByText("用户原文")).toBeInTheDocument();
    expect(main.getByText("缺失字段")).toBeInTheDocument();
    expect(main.queryByText("岗位草稿")).not.toBeInTheDocument();

    await user.type(main.getByLabelText("JD intake 输入"), "岗位：高级产品经理\n公司：腾讯\n面试官：业务负责人\n时长：30分钟");
    await user.click(main.getByRole("button", { name: "发送" }));
    await user.click(await screen.findByRole("button", { name: "保存岗位" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /腾讯/ })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "进入模拟配置" }));
    expect(window.location.pathname).toBe("/mock");
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

    await user.type(textarea, "，重点说数据验证");
    await user.click(screen.getByRole("button", { name: /生成提词卡/ }));

    await waitFor(() => expect(screen.getAllByText("提词卡").length).toBeGreaterThan(0));
    expect(screen.getAllByText(/模型/).length).toBeGreaterThan(0);
    expect(screen.getByText("风险提醒")).toBeInTheDocument();
    expect(screen.getByText("追问预测")).toBeInTheDocument();
    expect(screen.getByText("已识别，可继续编辑")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "结束" }));
    expect(screen.getByRole("dialog", { name: "结束实时助手" })).toBeInTheDocument();
  });

  it("auto-generates a live cue card from final speech text", async () => {
    installSpeechRecognitionMock();
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      if (url.includes("/api/copilot/cue-card/stream")) return mockCueCardStream();
      return mockJsonResponse(mockStateWithPosition());
    });

    const user = userEvent.setup();
    renderApp("/live");

    await screen.findByText("问题输入");
    await user.click(screen.getByRole("button", { name: "自动生成" }));
    await user.click(screen.getByRole("button", { name: "开始听取" }));
    emitSpeech("请介绍一个你做过的增长项目", true);
    act(() => lastRecognition?.onend?.());

    await waitFor(() => expect(screen.getByRole("button", { name: "记录到面试资料" })).toBeInTheDocument(), { timeout: 2500 });
  });

  it("uses the mock interview backend path and saves a mock report", async () => {
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

    const startDialog = await screen.findByRole("dialog", { name: "开始模拟面试" });
    await user.click(within(startDialog).getByRole("button", { name: "开始" }));

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

  it("shows local practice mode when the mock backend is unavailable", async () => {
    vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/state")) return mockJsonResponse(mockStateWithPosition());
      return Promise.reject(new Error("offline"));
    });

    const user = userEvent.setup();
    renderApp("/mock");

    const startDialog = await screen.findByRole("dialog", { name: "开始模拟面试" });
    await user.click(within(startDialog).getByRole("button", { name: "开始" }));

    await waitFor(() => expect(screen.getByText("后端未连接，当前为本地练习模式。")).toBeInTheDocument());
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
    expect(within(dialog).getByText("账户与导入导出")).toBeInTheDocument();
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
