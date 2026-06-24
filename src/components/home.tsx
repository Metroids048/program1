import { ArrowRight, MessageCircle, PlayCircle, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";
import { repairText } from "../lib/copy";
import { loadDraftState, saveDraftState } from "../lib/store";
import type { Position } from "../types";
import { QuotaBadge, type InterviewConfig } from "./shared";

function positionStatusTag(position: Position) {
  if (position.report.overallScore > 0 || position.mockTurns.length > 0) return { label: "已练习", tone: "ok" as const };
  if (position.intake.reviewStatus === "confirmed") return { label: "待练习", tone: "warn" as const };
  return { label: "草稿", tone: "pending" as const };
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
    if (!isLoggedIn) { onRequireLogin("/live"); return; }
    onOpenLive();
  };

  const gatedOpenMock = () => {
    if (!isLoggedIn) { onRequireLogin("/mock"); return; }
    onOpenMock({ interviewerRole: "上级", difficulty: "正常", interviewerGender: "女", submitMode: "manual", style: "gentle" });
  };

  return (
    <section className="page page-home desktop-page">
      <header className="home-header-compact">
        <div className="home-header-left">
          <span className="page-eyebrow">面试准备</span>
          <h1>完善岗位，开始准备</h1>
        </div>
        <QuotaBadge />
      </header>

      {/* Position mini cards */}
      {positions.length > 0 ? (
        <div className="home-position-row">
          {positions.slice(0, 6).map((position) => {
            const status = positionStatusTag(position);
            const isActive = position.id === activePositionId;
            return (
              <button
                key={position.id}
                type="button"
                className={"home-position-chip" + (isActive ? " active" : "")}
                onClick={() => {
                  // Selecting a different position — handled by parent
                  if (!isActive && onSubmitJd) {
                    onSubmitJd("", { positionId: position.id });
                  }
                }}
              >
                <span className="home-position-chip-name">
                  {repairText(position.company || "未命名")}
                </span>
                <span className={"home-position-chip-tag " + status.tone}>
                  {status.label}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Main conversation input */}
      <section className="surface-card home-conversation-card">
        <div className="surface-card-inner">
          <form className="home-conversation-form" onSubmit={submit}>
            <textarea
              id="home-intake"
              value={input}
              aria-label="输入岗位信息或JD内容"
              onChange={(event) => updateInput(event.target.value)}
              placeholder="粘贴 JD、描述面试岗位，或直接输入问题开始准备..."
              className="home-conversation-textarea"
            />
            <div className="home-conversation-actions">
              <button className="button primary" type="submit" disabled={!input.trim()}>
                <ArrowRight size={16} />
                开始对话
              </button>
            </div>
          </form>

          <div className="home-suggestions">
            {[
              "我有一场产品运营实习面试，帮我整理岗位重点",
              "这是增长运营 JD，后面直接进入模拟面试",
              "先贴一个面试问题，生成提词卡",
            ].map((prompt) => (
              <button key={prompt} type="button" className="home-suggestion-chip" onClick={() => updateInput(prompt)}>
                <MessageCircle size={14} />
                <span>{prompt}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <div className="home-quick-actions">
        <button className="button secondary" type="button" onClick={gatedOpenLive}>
          <Sparkles size={14} />
          实时助手
        </button>
        <button className="button secondary" type="button" onClick={gatedOpenMock}>
          <PlayCircle size={14} />
          模拟面试
        </button>
      </div>
    </section>
  );
}
