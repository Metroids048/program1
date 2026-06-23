import { ArrowRight, MessageCircle, PlayCircle, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";
import { repairText } from "../lib/copy";
import { loadDraftState, saveDraftState } from "../lib/store";
import type { Position } from "../types";
import { QuotaBadge, type InterviewConfig } from "./shared";

function minimalPositionStatus(position: Position) {
  if (position.report.overallScore > 0 || position.mockTurns.length > 0) return "已有练习";
  if (position.intake.reviewStatus === "confirmed") return "待进入练习";
  return "待确认 intake";
}

export function HomeDashboard({
  positions,
  activePositionId,
  onSubmitJd,
  onOpenMock,
  onOpenLive,
  onRequireLogin,
  isLoggedIn,
}: {
  positions: Position[];
  activePositionId: string;
  onSubmitJd: (
    jobText: string,
    options?: {
      positionId?: string;
      confirmedFields?: Array<{ key: string; value: string; source?: string }>;
      messages?: Array<{ role: "assistant" | "user"; text: string }>;
    },
  ) => void;
  onOpenMock: (config?: InterviewConfig) => void;
  onOpenLive: () => void;
  onRequireLogin: (path: string) => void;
  isLoggedIn: boolean;
}) {
  const activePosition = positions.find((item) => item.id === activePositionId) ?? positions[0];
  const [input, setInput] = useState(() => loadDraftState().homeInput ?? "");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    if (!isLoggedIn) {
      onRequireLogin("/");
      return;
    }
    const previousMessages = activePosition?.intake.messages?.map((message) => ({ role: message.role, text: message.text })) ?? [];
    const nextMessages = [...previousMessages, { role: "user" as const, text }];
    onSubmitJd(text, { positionId: activePosition?.id, messages: nextMessages });
    saveDraftState({ ...loadDraftState(), homeInput: "" });
    setInput("");
  };

  const updateInput = (value: string) => {
    setInput(value);
    saveDraftState({ ...loadDraftState(), homeInput: value });
  };

  const gatedOpenLive = () => {
    if (!isLoggedIn) {
      onRequireLogin("/live");
      return;
    }
    onOpenLive();
  };

  const gatedOpenMock = () => {
    if (!isLoggedIn) {
      onRequireLogin("/mock");
      return;
    }
    onOpenMock({
      interviewerRole: "上级",
      difficulty: "正常",
      interviewerGender: "女",
      submitMode: "manual",
      style: "gentle",
    });
  };

  const activePositionSummary = activePosition
    ? `${repairText(activePosition.company) || "公司待确认"} · ${repairText(activePosition.title) || "岗位待确认"}`
    : "还没有岗位卡";

  return (
    <section className="page page-home desktop-page">
      <div className="home-stage home-stage-product">
        <header className="home-hero home-hero-product">
          <div className="home-hero-topline">
            <span className="page-eyebrow">面试准备</span>
            <QuotaBadge />
          </div>
          <h1>把岗位或问题放进来，马上开始准备</h1>
          <p>先看内容，再点开始。你可以直接输入 JD、面试问题或岗位背景，保存后继续进入实时助手、模拟面试、问题库、简历和记录。</p>
        </header>

        <div className="home-product-shell">
          <section className="surface-card home-hero-input-card">
            <div className="surface-card-inner">
              <div className="section-row-header">
                <div>
                  <span className="subtle-label">主输入区</span>
                  <h2>大对话框首页</h2>
                  <p>把岗位 JD、面试问题或补充背景贴进来，首页只做承接，不再堆满诊断面板。</p>
                </div>
              </div>

              <form className="home-intake-box home-intake-box-product" onSubmit={submit}>
                <textarea
                  id="home-intake-product"
                  value={input}
                  aria-label="首页主输入"
                  onChange={(event) => updateInput(event.target.value)}
                  placeholder="例如：粘贴真实 JD，或写“明天下午腾讯一面，产品运营岗，业务负责人面，45 分钟”。"
                />
                <div className="home-intake-actions">
                  <button className="button primary capsule-button home-send-button" type="submit" disabled={!input.trim()}>
                    保存当前岗位
                    <ArrowRight size={14} />
                  </button>
                </div>
              </form>

              <div className="home-suggestion-grid home-suggestion-grid-product">
                {[
                  "我有一场 AI 产品运营实习面试，帮我先整理岗位重点",
                  "这是增长运营 JD，后面我想直接进入模拟面试",
                  "我先贴一个面试问题，之后想生成提词卡",
                ].map((prompt) => (
                  <button key={prompt} type="button" className="prompt-chip suggestion-chip" onClick={() => updateInput(prompt)}>
                    <MessageCircle size={16} />
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="surface-card home-hero-side-card">
            <div className="surface-card-inner">
              <div className="section-row-header">
                <div>
                  <span className="subtle-label">当前岗位</span>
                  <h2>{activePositionSummary}</h2>
                  <p>首页只保留最小上下文。更细的 JD 分析、题库、简历优化和记录复盘，继续放到各自页面里。</p>
                </div>
              </div>

              <article className="home-mini-status-card">
                <span>准备状态</span>
                <strong>{activePosition ? minimalPositionStatus(activePosition) : "等待创建岗位"}</strong>
                <p>{activePosition?.intake.rawJdText ? `${repairText(activePosition.intake.rawJdText).slice(0, 96)}...` : "保存一个岗位后，这里会显示当前岗位摘要。"} </p>
              </article>

              <div className="home-card-actions hero-actions-column">
                <button className="button primary" type="button" onClick={gatedOpenLive}>
                  <Sparkles size={16} />
                  进入实时助手
                </button>
                <button className="button secondary" type="button" onClick={gatedOpenMock}>
                  <PlayCircle size={16} />
                  进入模拟面试
                </button>
              </div>

              {!isLoggedIn ? <p className="home-guest-hint">页面可以先看；点击进入、生成或保存时会引导你登录。</p> : null}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
