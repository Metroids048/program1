import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { BookOpenCheck, Check, ClipboardList, GraduationCap, RefreshCw, Target, UserRound } from "lucide-react";
import type { AiRunMeta } from "../lib/apiClient";
import { generateHighlightsLocal } from "../lib/coach";
import { prioritizeEvidenceForJob } from "../lib/interviewEngine";
import type {
  AnswerCueCard,
  CandidateProfile,
  EvidenceType,
  InterviewDifficulty,
  InterviewPreferences,
  InterviewStyle,
  InterviewSubmitMode,
  InterviewerRole,
  Position,
  ResumeAnalysis,
  WorkspaceState,
} from "../types";
import { QuotaBadge } from "./shared/QuotaBadge";

export type PersonaKey = InterviewStyle;

export type InterviewConfig = {
  interviewerRole: InterviewerRole;
  difficulty: InterviewDifficulty;
  interviewerGender: "女" | "男";
  submitMode: InterviewSubmitMode;
  style: PersonaKey;
};

export type PersonaDefinition = {
  id: PersonaKey;
  label: string;
  description: string;
  avatar: string;
};

export const PERSONAS: PersonaDefinition[] = [
  { id: "gentle", label: "温和鼓励型", description: "先给肯定和结构建议，适合建立表达信心。", avatar: "温" },
  { id: "strict", label: "专业严格型", description: "更关注逻辑、证据和表达漏洞。", avatar: "严" },
  { id: "pressure", label: "压力测试型", description: "追问更尖锐，适合高压模拟。", avatar: "压" },
];

export type SpeechCaptureState = "idle" | "listening" | "paused" | "finalizing" | "ready" | "generating" | "error";
export type RealtimeSubmitMode = InterviewSubmitMode;
export type RecognizedDraft = { interimText: string; finalText: string; editableText: string; lastFinalAt: number };
export type ChatMessage = { id: string; role: "assistant" | "user"; text: string };
export type ResumeSectionId = "basic" | "education" | "highlights" | "work" | "projects" | "skills" | "risks";
export type ResumeChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  sectionId?: ResumeSectionId;
  suggestion?: string;
  applyTarget?: "section" | "full";
  evidenceTrace?: Array<{ id: string; title: string; reason: string; synthetic?: boolean }>;
  metaNote?: string;
};
export type AiStatusKind = "success" | "fallback" | "generating";

export const DEFAULT_CONFIG: InterviewConfig = {
  interviewerRole: "上级",
  difficulty: "压力面",
  interviewerGender: "女",
  submitMode: "manual",
  style: "gentle",
};

export function configFromPreferences(preferences?: Partial<InterviewPreferences>): InterviewConfig {
  return {
    interviewerRole: preferences?.interviewerRole ?? DEFAULT_CONFIG.interviewerRole,
    difficulty: preferences?.difficulty ?? DEFAULT_CONFIG.difficulty,
    interviewerGender: preferences?.interviewerGender ?? DEFAULT_CONFIG.interviewerGender,
    submitMode: preferences?.submitMode ?? DEFAULT_CONFIG.submitMode,
    style: preferences?.style ?? DEFAULT_CONFIG.style,
  };
}

export function preferencesFromConfig(config: InterviewConfig): InterviewPreferences {
  return {
    interviewerRole: config.interviewerRole,
    difficulty: config.difficulty,
    interviewerGender: config.interviewerGender,
    submitMode: config.submitMode,
    style: config.style,
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.max(0, totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function buildOverlapInsights(workspace: WorkspaceState): Array<{ skill: string; evidenceTitle: string; reason: string }> {
  const signals = [...workspace.job.hardSkills, ...workspace.job.softSkills, ...workspace.job.keywords.slice(0, 8)];
  const insights = signals
    .map((signal) => {
      const evidence = workspace.resume.evidence.find(
        (item) =>
          item.keywords.some((keyword) => keyword.toLowerCase().includes(signal.toLowerCase()) || signal.toLowerCase().includes(keyword.toLowerCase())) ||
          item.detail.toLowerCase().includes(signal.toLowerCase()),
      );
      if (!evidence) return null;
      return {
        skill: signal,
        evidenceTitle: evidence.title,
        reason: `JD 提到「${signal}」，可以优先用「${evidence.title}」这段经历来作答。`,
      };
    })
    .filter(Boolean) as Array<{ skill: string; evidenceTitle: string; reason: string }>;

  return insights.length > 0
    ? insights.slice(0, 5)
    : workspace.resume.evidence.slice(0, 3).map((item) => ({ skill: "岗位相关经历", evidenceTitle: item.title, reason: item.impact }));
}

export function ContextStack({ profile, position }: { profile: CandidateProfile; position: Position }) {
  const evidence = prioritizeEvidenceForJob(profile.resume, position.job, profile.evidenceLibrary);
  const displayedEvidence = evidence.slice(0, 3);

  return (
    <div className="context-stack">
      <article>
        <span>当前岗位</span>
        <strong>{position.title}</strong>
        <p>
          {position.company} · 匹配度 {position.matchReport.score}/100
        </p>
      </article>
      {displayedEvidence.map((item) => (
        <article key={item.id}>
          <span>{item.type}</span>
          <strong>{item.title}</strong>
          <p>{item.detail}</p>
        </article>
      ))}
    </div>
  );
}

export function CueCardPanel({ card, meta, onSaveQuestion }: { card?: AnswerCueCard; meta?: AiRunMeta | null; onSaveQuestion: (card: AnswerCueCard) => void }) {
  if (!card) {
    return (
      <Panel title="提词卡" className="cue-panel">
        <EmptyState title="等待问题" detail="输入问题、语音转写或点击生成后，这里会给出开场句、核心点、证据和风险提醒。" />
      </Panel>
    );
  }

  const status = meta?.backendStatus ?? "fallback";
  const evidence = meta?.evidenceTrace?.length
    ? meta.evidenceTrace.map((item) => item.title)
    : card.evidenceIds.length
      ? card.evidenceIds
      : ["暂无显式证据命中，回答时请主动补充真实项目数据。"];

  return (
    <Panel title="提词卡" className="cue-panel">
      <article className="cue-card">
        <header className="cue-card-head">
          <div>
            <span className="cue-card-kicker">{card.source === "live" ? "实时问题" : "模拟问题"}</span>
            <h2>{card.questionText}</h2>
          </div>
          <AiStatusBadge status={status === "success" ? "success" : "fallback"} />
        </header>
        {meta?.fallbackReason ? <div className="inline-message">{meta.fallbackReason}</div> : null}
        {status !== "success" ? <div className="inline-message warn">当前为练习模式结果，请只引用你能确认的真实经历与数据。</div> : null}
        {meta?.evidenceTrace?.length ? <EvidenceTrace trace={meta.evidenceTrace} /> : null}

        <div className="cue-section-grid">
          <section className="cue-section cue-section-wide">
            <span>回答框架</span>
            <strong>{card.strategy || "STAR 法：背景、动作、结果、复盘"}</strong>
          </section>
          <section className="cue-section cue-section-wide">
            <span>开场句</span>
            <p className="opening-line">{card.openingLine}</p>
          </section>
          <section className="cue-section">
            <span>要点</span>
            <ul>{card.bullets.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
          </section>
          <section className="cue-section">
            <span>可引用证据</span>
            <ul>{evidence.slice(0, 3).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
          </section>
          <section className="cue-section risk">
            <span>风险提醒</span>
            <ul>{card.risks.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
          </section>
          <section className="cue-section follow">
            <span>追问预测</span>
            <ul>{card.followUps.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
          </section>
        </div>

        <footer className="cue-card-actions">
          <button className="button secondary compact-button" type="button" onClick={() => onSaveQuestion(card)}>
            记录到面试资料
          </button>
        </footer>
      </article>
    </Panel>
  );
}

export function AiStatusBadge({ status }: { status: AiStatusKind }) {
  const label = status === "success" ? "模型生成" : status === "generating" ? "生成中..." : "本地练习";
  return (
    <span className={`ai-status-badge ${status}`} aria-label={`AI 状态：${label}`}>
      <span aria-hidden="true" />
      {label}
    </span>
  );
}

export function EvidenceTrace({ trace }: { trace: Array<{ id: string; title: string; reason: string; synthetic?: boolean }> }) {
  return (
    <section className="evidence-trace">
      <strong>证据命中</strong>
      <div className="trace-list">
        {trace.map((item) => (
          <article key={item.id}>
            <span>{item.synthetic ? `${item.title} · 练习推断` : item.title}</span>
            <p>{item.reason}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function buildResumeSections(profile: CandidateProfile): Array<{ id: ResumeSectionId; label: string; title: string; content: string; icon: LucideIcon }> {
  const evidenceByType = (type: EvidenceType) =>
    profile.evidenceLibrary.filter((item) => item.type === type).map((item) => `${item.title}\n${item.detail}\n${item.impact}`).join("\n\n");

  return [
    { id: "basic", label: "基本信息", title: profile.displayName || profile.resume.name || "候选人", content: `${profile.resume.name}\n${profile.resume.targetRole}\n${profile.resume.summary}`, icon: UserRound },
    {
      id: "education",
      label: "教育经历",
      title: "教育经历",
      content: evidenceByType("教育") || profile.resumeText.split(/\n/).filter((line) => /大学|本科|硕士|GPA|教育/.test(line)).join("\n"),
      icon: GraduationCap,
    },
    {
      id: "highlights",
      label: "亮点摘要",
      title: "亮点摘要",
      content: profile.highlights.length ? profile.highlights.join("\n") : generateHighlightsLocal(profile).join("\n"),
      icon: Check,
    },
    {
      id: "work",
      label: "工作经历",
      title: "工作经历",
      content: evidenceByType("实习") || profile.evidenceLibrary.slice(0, 2).map((item) => `${item.title}\n${item.detail}`).join("\n\n"),
      icon: ClipboardList,
    },
    {
      id: "projects",
      label: "项目经历",
      title: "项目经历",
      content: evidenceByType("项目") || profile.evidenceLibrary.map((item) => `${item.title}\n${item.detail}`).join("\n\n"),
      icon: Target,
    },
    { id: "skills", label: "技能", title: "技能与工具", content: profile.resume.skills.join("、"), icon: BookOpenCheck },
    { id: "risks", label: "待补强", title: "待补强", content: profile.resume.risks.join("\n"), icon: RefreshCw },
  ];
}

export function sectionsToDrafts(sections: Array<{ id: ResumeSectionId; content: string }>): Record<ResumeSectionId, string> {
  return sections.reduce(
    (acc, section) => ({ ...acc, [section.id]: section.content }),
    { basic: "", education: "", highlights: "", work: "", projects: "", skills: "", risks: "" },
  );
}

export function resolveEvidenceType(sectionId: ResumeSectionId): EvidenceType {
  if (sectionId === "education") return "教育";
  if (sectionId === "skills") return "技能";
  if (sectionId === "work") return "实习";
  return "项目";
}

export function buildResumeSuggestion(title: string, content: string, profile: CandidateProfile): string {
  const metrics = profile.resume.metrics.slice(0, 3).join("、") || "可验证指标";
  const skills = profile.resume.skills.slice(0, 5).join("、") || "岗位核心能力";
  const clean = content.replace(/\s+/g, " ").trim();
  return [
    `${title}优化版：`,
    `1. 先给一句结论，明确你具备 ${skills} 相关能力。`,
    `2. 再补真实动作：${clean.slice(0, 180) || profile.evidenceLibrary[0]?.detail || "补充一段最相关经历"}。`,
    `3. 最后用 ${metrics} 这类指标说明结果，避免只有职责没有产出。`,
  ].join("\n");
}

export function MetricCard({ label, value, suffix, detail, icon: Icon }: { label: string; value: string; suffix?: string; detail?: string; icon?: LucideIcon }) {
  return (
    <article className="metric-card">
      {Icon ? <Icon size={16} /> : null}
      <span>{label}</span>
      <div>
        <strong>{value}</strong>
        {suffix ? <small>{suffix}</small> : null}
      </div>
      {detail ? <p>{detail}</p> : null}
    </article>
  );
}

export function MetricGrid({ items }: { items: Array<{ label: string; value: string; tone?: "green" | "default" }> }) {
  return (
    <div className="metrics-grid compact">
      {items.map((item) => (
        <article key={item.label} className={item.tone === "green" ? "metric-card metric-green" : "metric-card"}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </article>
      ))}
    </div>
  );
}

export function QuestionCard({ category, question, intent, evidence }: { category: string; question: string; intent: string; evidence?: string }) {
  return (
    <article className="question-card">
      <span className="question-card-tag">{category}</span>
      <h2>{question}</h2>
      <p>{intent}</p>
      {evidence ? <small>{evidence}</small> : null}
    </article>
  );
}

export function Panel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`.trim()}>
      <header>
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state" role="status">
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

export function EditorHeader({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="section-header">
      <div className="header-icon">
        <Icon size={20} />
      </div>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? <div className="section-action">{action}</div> : null}
    </div>
  );
}

export function profileSummary(resume: ResumeAnalysis) {
  return `${resume.targetRole} · ${resume.skills.slice(0, 5).join(" / ")}`;
}

export { QuotaBadge };
