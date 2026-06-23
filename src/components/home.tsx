import { AlertCircle, ArrowRight, BriefcaseBusiness, CheckCircle2, MessageCircle, Save, Settings2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { repairText } from "../lib/copy";
import { loadDraftState, saveDraftState } from "../lib/store";
import type {
  Position,
  PositionIntakeFieldKey,
  PositionIntakeFieldSource,
  PositionIntakeFieldValue,
  WorkspaceState,
} from "../types";
import type { InterviewConfig } from "./shared";

const FIELD_LABELS: Record<PositionIntakeFieldKey, string> = {
  company: "目标公司",
  role: "岗位名称",
  interviewer: "面试官类型",
  difficulty: "面试难度",
  duration: "面试时长",
  hasJd: "是否已有完整 JD",
};

const SOURCE_LABELS: Record<PositionIntakeFieldSource, string> = {
  raw: "原文",
  inferred: "系统推断",
  confirmed: "用户确认",
};

function toFieldMap(fields: PositionIntakeFieldValue[]) {
  return fields.reduce<Partial<Record<PositionIntakeFieldKey, PositionIntakeFieldValue>>>((acc, field) => {
    acc[field.key] = field;
    return acc;
  }, {});
}

function minimalPositionStatus(position: Position) {
  if (position.report.overallScore > 0 || position.mockTurns.length > 0) return "已有练习";
  if (position.intake.reviewStatus === "confirmed") return "待进入练习";
  return "待确认 intake";
}

export function HomeDashboard({
  positions,
  activePositionId,
  onSubmitJd,
  onSelectPosition,
  onOpenMock,
}: {
  workspace: WorkspaceState | null;
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
  onSelectPosition: (positionId: string) => void;
  onOpenMock: (config?: InterviewConfig) => void;
}) {
  const activePosition = positions.find((item) => item.id === activePositionId) ?? positions[0];
  const [input, setInput] = useState(() => loadDraftState().homeInput ?? "");
  const [confirmedDrafts, setConfirmedDrafts] = useState<Partial<Record<PositionIntakeFieldKey, string>>>(() => {
    const current = activePosition?.intake.confirmedFields ?? [];
    return current.reduce<Partial<Record<PositionIntakeFieldKey, string>>>((acc, field) => {
      acc[field.key] = field.value;
      return acc;
    }, {});
  });

  const orderedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      if (a.id === activePositionId) return -1;
      if (b.id === activePositionId) return 1;
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
  }, [activePositionId, positions]);

  const inferredMap = toFieldMap(activePosition?.intake.inferredFields ?? []);
  const confirmedMap = toFieldMap(activePosition?.intake.confirmedFields ?? []);
  const missingFields = activePosition?.intake.missingFields ?? [];
  const reviewStatus = activePosition?.intake.reviewStatus ?? "empty";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    const previousMessages = activePosition?.intake.messages?.map((message) => ({ role: message.role, text: message.text })) ?? [];
    const nextMessages = [...previousMessages, { role: "user" as const, text }];
    onSubmitJd(text, { positionId: activePosition?.id, messages: nextMessages });
    saveDraftState({ ...loadDraftState(), homeInput: "" });
    setInput("");
  };

  const savePosition = () => {
    const rawJdText = activePosition?.intake.rawJdText?.trim() || input.trim();
    if (!rawJdText) return;
    const confirmedFields = (Object.keys(FIELD_LABELS) as PositionIntakeFieldKey[])
      .map((key) => ({ key, value: repairText(confirmedDrafts[key] ?? confirmedMap[key]?.value ?? "") }))
      .filter((item) => item.value);
    const messages = activePosition?.intake.messages?.map((message) => ({ role: message.role, text: message.text })) ?? [];
    onSubmitJd(rawJdText, {
      positionId: activePosition?.id,
      confirmedFields,
      messages,
    });
  };

  const configureInterview = () => {
    const interviewer = repairText(confirmedDrafts.interviewer ?? confirmedMap.interviewer?.value ?? inferredMap.interviewer?.value ?? "上级");
    const difficulty = repairText(confirmedDrafts.difficulty ?? confirmedMap.difficulty?.value ?? inferredMap.difficulty?.value ?? "正常");
    onOpenMock({
      interviewerRole: interviewer === "HR" || interviewer === "CTO" || interviewer === "CEO" || interviewer === "业务负责人" || interviewer === "上级" ? interviewer : "上级",
      difficulty: difficulty === "地狱面" ? "地狱面" : difficulty === "压力面" ? "压力面" : "正常",
      interviewerGender: "女",
      submitMode: "manual",
      style: difficulty === "压力面" || difficulty === "地狱面" ? "pressure" : "gentle",
    });
  };

  const updateInput = (value: string) => {
    setInput(value);
    saveDraftState({ ...loadDraftState(), homeInput: value });
  };

  return (
    <section className="page page-home desktop-page">
      <div className="home-stage home-stage-lollipop home-intake-stage">
        <header className="home-hero home-hero-lollipop compact-home-hero">
          <span className="page-eyebrow">首页</span>
          <h1>真实 JD intake</h1>
          <p>首页只做真实岗位 intake：保留用户原文、拆出系统推断、标记缺失字段，再确认后进入实时助手或模拟面试。</p>
        </header>

        <div className="home-intake-shell">
          <section className="surface-card home-chat-panel">
            <div className="surface-card-inner">
              <div className="section-row-header">
                <div>
                  <span className="subtle-label">对话输入</span>
                  <h2>粘贴真实 JD 或继续补字段</h2>
                  <p>支持直接贴原始 JD，也支持补充公司、岗位、面试官类型、时长等缺失信息。</p>
                </div>
              </div>

              <div className="home-thread home-thread-wide intake-thread">
                {(activePosition?.intake.messages ?? [
                  {
                    id: "home-intake-assistant",
                    role: "assistant" as const,
                    text: "把真实 JD 或你目前知道的岗位信息贴进来，我会先保留原文，再告诉你系统推断和还缺什么字段。",
                  },
                ]).map((message) => (
                  <article key={message.id} className={message.role === "assistant" ? "chat-bubble assistant" : "chat-bubble user"}>
                    <p>{repairText(message.text)}</p>
                  </article>
                ))}
              </div>

              <form className="home-intake-box home-intake-box-lollipop" onSubmit={submit}>
                <label className="home-intake-label" htmlFor="home-intake">
                  原始 JD / 补充说明
                </label>
                <textarea
                  id="home-intake"
                  value={input}
                  aria-label="JD intake 输入"
                  onChange={(event) => updateInput(event.target.value)}
                  placeholder="例如：把完整 JD 原文粘进来，或补一句“这是腾讯商业分析岗，业务负责人面，45 分钟，还没拿到完整 JD”"
                />
                <div className="home-intake-actions">
                  <button className="button primary capsule-button home-send-button" type="submit" disabled={!input.trim()}>
                    发送
                    <ArrowRight size={14} />
                  </button>
                </div>
              </form>

              {(activePosition?.intake.suggestedPrompts?.length || !activePosition) ? (
                <div className="home-suggestion-grid home-suggestion-grid-lollipop">
                  {(activePosition?.intake.suggestedPrompts?.length
                    ? activePosition.intake.suggestedPrompts
                    : [
                        "这是字节跳动 AI 产品经理 JD，请先保留原文并标记缺失字段",
                        "腾讯增长运营，业务负责人面，45 分钟，还没拿到完整 JD",
                        "我先贴一段真实岗位描述，你告诉我哪些字段需要确认",
                      ]
                  ).map((prompt) => (
                    <button key={prompt} type="button" className="prompt-chip suggestion-chip" onClick={() => updateInput(prompt)}>
                      <MessageCircle size={16} />
                      <span>{prompt}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <section className="surface-card home-review-panel">
            <div className="surface-card-inner">
              <div className="section-row-header">
                <div>
                  <span className="subtle-label">审核卡</span>
                  <h2>原文、推断、缺失字段分开展示</h2>
                  <p>未确认字段仍会标记为系统推断或待确认，不会伪装成真实岗位信息。</p>
                </div>
                <span className={`intake-status-badge ${reviewStatus}`}>{reviewStatus === "confirmed" ? "已确认" : reviewStatus === "review" ? "待确认" : reviewStatus === "draft" ? "草稿中" : "待开始"}</span>
              </div>

              <article className="intake-review-block">
                <header>
                  <strong>用户原文</strong>
                  <span className="source-chip raw">原文</span>
                </header>
                <p className="intake-raw-text">{repairText(activePosition?.intake.rawJdText || "还没有保存原始 JD。把真实岗位描述贴进左侧输入框后，这里会原样保留。")}</p>
              </article>

              <article className="intake-review-block">
                <header>
                  <strong>系统推断 / 用户确认</strong>
                </header>
                <div className="intake-field-list">
                  {(Object.keys(FIELD_LABELS) as PositionIntakeFieldKey[]).map((key) => {
                    const confirmedValue = confirmedDrafts[key] ?? confirmedMap[key]?.value ?? "";
                    const inferredValue = inferredMap[key]?.value ?? "";
                    const shownValue = confirmedValue || inferredValue || "";
                    const source = confirmedValue ? "confirmed" : inferredMap[key]?.source ?? "inferred";
                    return (
                      <label key={key} className="intake-field-row">
                        <span>{FIELD_LABELS[key]}</span>
                        <div className="intake-field-input">
                          <input
                            className="input"
                            value={shownValue}
                            onChange={(event) => setConfirmedDrafts((current) => ({ ...current, [key]: event.target.value }))}
                            placeholder={`补充 ${FIELD_LABELS[key]}`}
                          />
                          <span className={`source-chip ${source}`}>{SOURCE_LABELS[source]}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </article>

              <article className="intake-review-block">
                <header>
                  <strong>缺失字段</strong>
                </header>
                {missingFields.length > 0 ? (
                  <div className="missing-field-list">
                    {missingFields.map((field) => (
                      <span key={field.key} className="missing-field-chip">
                        <AlertCircle size={14} />
                        {field.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="inline-message success">
                    <CheckCircle2 size={14} />
                    当前 intake 已满足公开 MVP 所需的关键字段。
                  </div>
                )}
              </article>

              <div className="home-card-actions review-actions">
                <button className="button secondary compact-button" type="button" onClick={savePosition} disabled={!(activePosition?.intake.rawJdText || input).trim()}>
                  <Save size={14} />
                  保存岗位
                </button>
                <button className="button primary compact-button" type="button" onClick={configureInterview} disabled={!activePosition}>
                  <Settings2 size={14} />
                  进入模拟配置
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {orderedPositions.length > 0 ? (
        <section className="home-position-section home-position-section-wide" aria-label="已保存岗位">
          <div className="home-position-head">
            <div>
              <span className="subtle-label">岗位列表</span>
              <h2>继续当前岗位准备</h2>
            </div>
            <p>只保留最小信息：岗位名、公司、更新时间和准备状态，不再在首页堆诊断结论。</p>
          </div>
          <div className="home-position-list">
            {orderedPositions.map((item) => {
              const active = item.id === activePositionId;
              return (
                <button key={item.id} type="button" className={`position-mini-card ${active ? "active" : "pending"}`} onClick={() => onSelectPosition(item.id)}>
                  <span className="position-mini-main">
                    <strong>
                      {repairText(item.title) || "岗位待确认"} · {repairText(item.company) || "公司待确认"}
                    </strong>
                    <small>
                      {minimalPositionStatus(item)} · {new Date(item.updatedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
                    </small>
                  </span>
                  <span className="position-mini-action">
                    {active ? "继续准备" : "切换岗位"}
                    <BriefcaseBusiness size={14} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="home-position-section home-position-section-wide" aria-label="创建第一个岗位">
          <div className="home-position-head">
            <div>
              <span className="subtle-label">开始准备</span>
              <h2>创建你的第一个岗位</h2>
            </div>
          </div>
          <div className="empty-card">
            <div className="empty-card-icon">
              <BriefcaseBusiness size={20} />
            </div>
            <h2>还没有岗位卡</h2>
            <p>在上方粘贴一个真实 JD，或直接写岗位关键词，系统会帮你分析并生成面试准备资料。</p>
          </div>
        </section>
      )}
    </section>
  );
}
