import { FileText, PenLine, SendHorizonal, Sparkles, Upload, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { repairText } from "../lib/copy";
import { generateProfileHighlightsOnServer, runResumeAiOnServer } from "../lib/apiClient";
import { generateHighlightsLocal } from "../lib/coach";
import { loadDraftState, saveDraftState } from "../lib/store";
import { importResumeFile } from "../lib/resumeImport";
import type { CandidateProfile, EvidenceItem, Position } from "../types";
import { buildResumeSections, buildResumeSuggestion, EvidenceTrace, makeId, resolveEvidenceType, sectionsToDrafts, type ResumeChatMessage, type ResumeSectionId } from "./shared";

type ResumeAction = "section" | "full" | "match";

function applySectionSave(sectionId: ResumeSectionId, text: string, profile: CandidateProfile, onUpdateEvidence: (items: EvidenceItem[]) => void, onSetHighlights: (highlights: string[]) => void) {
  if (sectionId === "highlights") {
    onSetHighlights(
      text
        .split(/\n+/)
        .map((item) => item.replace(/^[-\d.\s]+/, "").trim())
        .filter(Boolean)
        .slice(0, 6),
    );
    return;
  }

  onUpdateEvidence([
    {
      id: makeId("ev-custom"),
      type: resolveEvidenceType(sectionId),
      title: text.split(/\n/)[0] || "简历补充素材",
      detail: text,
      keywords: [],
      impact: "来自简历编辑区的人工补充证据",
    },
    ...profile.evidenceLibrary,
  ]);
}

function normalizeResumeSuggestion(text: string): string {
  return repairText(text).trim();
}

function isStructuredFullResumeSuggestion(text: string, sections: Array<{ id: ResumeSectionId; title: string }>): boolean {
  const normalized = normalizeResumeSuggestion(text);
  if (!normalized) return false;
  return sections.some((section) => normalized.includes(section.title));
}

function parseFullResumeSuggestion(text: string, sections: Array<{ id: ResumeSectionId; title: string }>): Partial<Record<ResumeSectionId, string>> {
  const normalized = normalizeResumeSuggestion(text);
  if (!normalized) return {};

  const titles = sections
    .map((section) => ({ id: section.id, title: section.title }))
    .sort((a, b) => b.title.length - a.title.length);

  const markers = titles
    .map((section) => {
      const index = normalized.indexOf(section.title);
      return index >= 0 ? { ...section, index } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a!.index - b!.index) as Array<{ id: ResumeSectionId; title: string; index: number }>;

  if (markers.length === 0) return {};

  const next: Partial<Record<ResumeSectionId, string>> = {};
  markers.forEach((marker, index) => {
    const start = marker.index + marker.title.length;
    const end = markers[index + 1]?.index ?? normalized.length;
    const block = normalized
      .slice(start, end)
      .replace(/^[\s:：-]+/, "")
      .trim();
    if (block) next[marker.id] = block;
  });

  return next;
}

export function applyFullResumeSuggestionToDrafts(
  suggestion: string,
  sections: Array<{ id: ResumeSectionId; title: string }>,
  currentDrafts: Record<ResumeSectionId, string>,
): Partial<Record<ResumeSectionId, string>> {
  const parsed = parseFullResumeSuggestion(suggestion, sections);
  if (Object.keys(parsed).length > 0) return parsed;
  if (isStructuredFullResumeSuggestion(suggestion, sections)) return {};
  return {
    ...currentDrafts,
    highlights: normalizeResumeSuggestion(suggestion),
  };
}

export function ResumeWorkspacePage({
  profile,
  position,
  onUpdateResume,
  onUpdateEvidence,
  onSetHighlights,
  onOpenJd,
  isLoggedIn,
  onRequireLogin,
}: {
  profile: CandidateProfile;
  position?: Position;
  onUpdateResume: (resumeText: string) => void;
  onUpdateEvidence: (items: EvidenceItem[]) => void;
  onSetHighlights: (highlights: string[]) => void;
  onOpenJd: () => void;
  isLoggedIn: boolean;
  onRequireLogin: () => void;
}) {
  const sections = useMemo(() => buildResumeSections(profile), [profile]);
  const [selectedSectionId, setSelectedSectionId] = useState<ResumeSectionId>("highlights");
  const initialDrafts = useMemo(() => sectionsToDrafts(sections), [sections]);
  const [draftOverrides, setDraftOverrides] = useState<Partial<Record<ResumeSectionId, string>>>({});
  const [chatInput, setChatInput] = useState(() => loadDraftState().resumeChatInput ?? "");
  const [fileMessage, setFileMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<ResumeSectionId | null>(null);
  const [chatMessages, setChatMessages] = useState<ResumeChatMessage[]>([
    {
      id: "resume-chat-1",
      role: "assistant",
      text: "上传简历后，我可以帮你逐模块优化、整份润色，或按岗位做匹配分析。建议结果可一键应用。",
    },
  ]);

  const selectedSection = sections.find((section) => section.id === selectedSectionId) ?? sections[0];
  const sectionDrafts = { ...initialDrafts, ...draftOverrides } as Record<ResumeSectionId, string>;
  const selectedDraft = sectionDrafts[selectedSectionId];

  useEffect(() => {
    saveDraftState({ ...loadDraftState(), resumeChatInput: chatInput });
  }, [chatInput]);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isLoggedIn) {
      onRequireLogin();
      event.target.value = "";
      return;
    }
    try {
      const result = await importResumeFile(file);
      onUpdateResume(result.text);
      setFileMessage("已导入 " + file.name + (result.warning ? "，" + result.warning : "") + "，正在同步服务端简历快照。");
    } catch {
      setFileMessage("导入失败，当前支持 txt / markdown / pdf / docx。");
    } finally {
      event.target.value = "";
    }
  };

  const buildFullResumeText = () => sections.map((section) => section.title + "\n" + sectionDrafts[section.id]).join("\n\n");

  const generateHighlights = async () => {
    if (!isLoggedIn) {
      onRequireLogin();
      return;
    }
    setIsGenerating(true);
    try {
      const response = await generateProfileHighlightsOnServer({
        resumeText: buildFullResumeText(),
        displayName: profile.displayName,
        positionId: position?.id,
      });
      onSetHighlights(response.highlights);
      setDraftOverrides((current) => ({ ...current, highlights: response.highlights.join("\n") }));
      setSelectedSectionId("highlights");
      setSaveMessage(response.meta.fallbackReason ? "已生成亮点，当前为降级结果：" + response.meta.fallbackReason : "已生成亮点摘要并同步到后端。");
    } catch {
      const fallback = generateHighlightsLocal(profile);
      onSetHighlights(fallback);
      setDraftOverrides((current) => ({ ...current, highlights: fallback.join("\n") }));
      setSelectedSectionId("highlights");
      setSaveMessage("后端暂时不可用，已回退为本地亮点摘要。");
    } finally {
      setIsGenerating(false);
    }
  };

  const runAction = async (action: ResumeAction) => {
    if (!isLoggedIn) {
      onRequireLogin();
      return;
    }
    const baseText = action === "section" ? selectedDraft : action === "full" ? sections.map((section) => section.title + "\n" + sectionDrafts[section.id]).join("\n\n") : selectedDraft;
    const title = action === "section" ? "优化「" + selectedSection.title + "」" : action === "full" ? "优化整份简历" : "按岗位「" + repairText(position?.title || "当前岗位") + "」做匹配分析";
    setChatMessages((current) => [
      ...current,
      { id: makeId("resume-user"), role: "user", text: title },
    ]);
    setIsGenerating(true);
    try {
      const response = await runResumeAiOnServer({
        positionId: position?.id,
        action,
        sectionId: selectedSectionId,
        sectionTitle: selectedSection.title,
        currentText: baseText,
        fullResumeText: buildFullResumeText(),
      });
      setChatMessages((current) => [
        ...current,
        {
          id: makeId("resume-ai"),
          role: "assistant",
          text: response.reply,
          sectionId: response.applyTarget === "section" ? selectedSectionId : undefined,
          suggestion: response.suggestion,
          applyTarget: response.applyTarget,
          evidenceTrace: response.evidenceTrace,
          metaNote: response.meta.fallbackReason || "",
        },
      ]);
    } catch {
      setChatMessages((current) => [
        ...current,
        {
          id: makeId("resume-ai"),
          role: "assistant",
          text: "后端暂时没返回结果，我先保留本地练习模式建议，至少不会让你卡住。",
          sectionId: selectedSectionId,
          suggestion: buildResumeSuggestion(action === "full" ? "整份简历" : selectedSection.title, baseText, profile),
          applyTarget: action === "full" ? "full" : "section",
          metaNote: "本地练习模式",
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const sendChat = async (event: FormEvent) => {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    if (!isLoggedIn) {
      onRequireLogin();
      return;
    }
    setChatMessages((current) => [
      ...current,
      { id: makeId("resume-user"), role: "user", text },
    ]);
    setIsGenerating(true);
    try {
      const response = await runResumeAiOnServer({
        positionId: position?.id,
        action: "section",
        sectionId: selectedSectionId,
        sectionTitle: selectedSection.title,
        currentText: selectedDraft + "\n" + text,
        fullResumeText: buildFullResumeText(),
        userMessage: text,
      });
      setChatMessages((current) => [
        ...current,
        {
          id: makeId("resume-ai"),
          role: "assistant",
          text: response.reply,
          sectionId: response.applyTarget === "section" ? selectedSectionId : undefined,
          suggestion: response.suggestion,
          applyTarget: response.applyTarget,
          evidenceTrace: response.evidenceTrace,
          metaNote: response.meta.fallbackReason || "",
        },
      ]);
      setChatInput("");
      saveDraftState({ ...loadDraftState(), resumeChatInput: "" });
    } catch {
      setChatMessages((current) => [
        ...current,
        {
          id: makeId("resume-ai"),
          role: "assistant",
          text: "后端暂时没返回结果，我先给你一版本地练习模式建议。",
          sectionId: selectedSectionId,
          suggestion: buildResumeSuggestion(selectedSection.title, selectedDraft + "\n" + text, profile),
          applyTarget: "section",
          metaNote: "本地练习模式",
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const applySuggestion = (message: ResumeChatMessage) => {
    if (!message.suggestion) return;
    if (message.applyTarget === "full") {
      const nextDrafts = applyFullResumeSuggestionToDrafts(message.suggestion, sections, sectionDrafts);
      setDraftOverrides((current) => ({ ...current, ...nextDrafts }));
      return;
    }
    if (!message.sectionId) return;
    const sectionId = message.sectionId;
    setSelectedSectionId(sectionId);
    setDraftOverrides((current) => ({ ...current, [sectionId]: message.suggestion! }));
  };

  return (
    <section className="page page-resume desktop-page">
      {/* Header: title left, upload + JD button right */}
      <header className="desktop-page-header">
        <div className="desktop-page-title">
          <span className="page-eyebrow">简历</span>
          <h1>简历优化</h1>
        </div>
        <div className="hero-actions">
          {position ? (
            <button className="button secondary compact-button" type="button" onClick={onOpenJd}>
              JD 分析
            </button>
          ) : null}
          <label className="button secondary compact-button resume-upload-btn">
            <Upload size={14} />
            上传
            <input type="file" accept=".txt,.md,.markdown,.pdf,.docx" aria-label="上传简历文件" onChange={onFile} />
          </label>
        </div>
      </header>

      {fileMessage ? <div className="inline-message success">{fileMessage}</div> : null}
      {saveMessage ? <div className="inline-message success">{saveMessage}</div> : null}

      {/* Main two-column layout */}
      <div className="resume-main-layout">
        {/* Left: ALL resume sections displayed as cards */}
        <div className="resume-content-area">
          {/* Profile head */}
          <div className="resume-profile-head">
            <div className="resume-avatar">{(profile.displayName || profile.resume.name || "候").slice(0, 1)}</div>
            <div>
              <strong>{repairText(profile.displayName || profile.resume.name || "候选人")}</strong>
              <p>
                {repairText(profile.resume.targetRole || "目标岗位待补充")}
                {position ? " · " + repairText(position.title) : ""}
              </p>
            </div>
          </div>

          {/* All section cards — always visible */}
          <div className="resume-section-cards">
            {sections.map((section) => {
              const isEditing = editingSectionId === section.id;
              const content = sectionDrafts[section.id];
              const hasContent = content?.trim().length > 0;

              return (
                <article key={section.id} className={"resume-section-card" + (isEditing ? " editing" : "")}>
                  <header className="resume-section-card-header">
                    <div>
                      <span className="subtle-label">{section.label}</span>
                      <h2>{section.title}</h2>
                    </div>
                    <div className="hero-actions">
                      {section.id === "highlights" ? (
                        <button className="button secondary compact-button" type="button" onClick={() => void generateHighlights()} disabled={isGenerating}>
                          <Sparkles size={12} />
                          AI 生成
                        </button>
                      ) : null}
                      {isEditing ? (
                        <>
                          <button className="button secondary compact-button" type="button" onClick={() => setEditingSectionId(null)}>
                            <X size={12} />
                            取消
                          </button>
                          <button className="button primary compact-button" type="button" onClick={() => {
                            applySectionSave(section.id, sectionDrafts[section.id], profile, onUpdateEvidence, onSetHighlights);
                            setSaveMessage("已保存「" + section.title + "」。");
                            setEditingSectionId(null);
                          }}>
                            保存
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="button secondary compact-button" type="button" onClick={() => setEditingSectionId(section.id)}>
                            <PenLine size={12} />
                            编辑
                          </button>
                          <button className="button secondary compact-button" type="button" onClick={() => {
                            setSelectedSectionId(section.id);
                            void runAction("section");
                          }} disabled={isGenerating}>
                            <Sparkles size={12} />
                            优化
                          </button>
                        </>
                      )}
                    </div>
                  </header>

                  {isEditing ? (
                    <textarea
                      className="input textarea tall"
                      value={sectionDrafts[section.id]}
                      aria-label={section.title + " 编辑"}
                      onChange={(event) => setDraftOverrides((current) => ({ ...current, [section.id]: event.target.value }))}
                    />
                  ) : (
                    <div className="resume-section-preview">
                      {hasContent ? (
                        <pre>{content}</pre>
                      ) : (
                        <p className="resume-section-empty">暂无内容，上传简历自动填充或点击编辑手动填写。</p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {/* Quick actions at bottom */}
          <div className="resume-quick-actions">
            <button className="button secondary compact-button" type="button" onClick={() => void runAction("full")} disabled={isGenerating}>
              <FileText size={14} />
              优化整份简历
            </button>
            {position ? (
              <button className="button secondary compact-button" type="button" onClick={() => void runAction("match")} disabled={isGenerating}>
                <Sparkles size={14} />
                岗位匹配分析
              </button>
            ) : null}
          </div>
        </div>

        {/* Right: AI chat panel */}
        <aside className={"surface-card resume-ai-panel" + (aiPanelOpen ? " open" : "")}>
          <div className="surface-card-inner resume-ai-panel-inner">
            <div className="resume-ai-panel-header">
              <div>
                <span className="subtle-label">AI 对话</span>
                <h2>简历优化</h2>
              </div>
              <button
                className="mini-link resume-ai-close-desktop"
                type="button"
                onClick={() => setAiPanelOpen(false)}
                aria-label="关闭 AI 面板"
              >
                <X size={14} />
              </button>
            </div>

            <div className="chat-thread resume-chat-thread">
              {chatMessages.map((message) => (
                <article key={message.id} className={message.role === "assistant" ? "chat-bubble assistant" : "chat-bubble user"}>
                  <p>{message.text}</p>
                  {message.metaNote ? <div className="inline-message">{message.metaNote}</div> : null}
                  {message.evidenceTrace?.length ? <EvidenceTrace trace={message.evidenceTrace} /> : null}
                  {message.suggestion ? (
                    <div className="suggestion-box">
                      <pre>{message.suggestion}</pre>
                      <button className="button primary compact-button" type="button" onClick={() => applySuggestion(message)}>
                        {message.applyTarget === "full" ? "应用到整份简历" : "应用"}
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>

            <form className="chat-composer resume-chat-composer" onSubmit={(event) => void sendChat(event)}>
              <textarea
                value={chatInput}
                aria-label="简历优化需求"
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="描述你想如何优化简历..."
                rows={2}
              />
              <button className="button primary" type="submit" disabled={!chatInput.trim() || isGenerating}>
                <SendHorizonal size={16} />
              </button>
            </form>
          </div>
        </aside>
      </div>

      {/* Mobile AI drawer */}
      <div className={"resume-ai-drawer-backdrop" + (aiPanelOpen ? " open" : "")} role="presentation" onClick={() => setAiPanelOpen(false)}>
        <aside
          className={"resume-ai-drawer" + (aiPanelOpen ? " open" : "")}
          role="dialog"
          aria-modal="true"
          aria-label="AI 简历优化对话"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="resume-ai-panel-header">
            <div>
              <span className="subtle-label">AI 对话</span>
              <h2>简历优化</h2>
            </div>
            <button className="mini-link" type="button" onClick={() => setAiPanelOpen(false)}>关闭</button>
          </div>
          <div className="chat-thread resume-chat-thread" style={{ maxHeight: "30dvh" }}>
            {chatMessages.map((message) => (
              <article key={message.id} className={message.role === "assistant" ? "chat-bubble assistant" : "chat-bubble user"}>
                <p>{message.text}</p>
                {message.metaNote ? <div className="inline-message">{message.metaNote}</div> : null}
                {message.suggestion ? (
                  <div className="suggestion-box">
                    <pre>{message.suggestion}</pre>
                    <button className="button primary compact-button" type="button" onClick={() => applySuggestion(message)}>
                      {message.applyTarget === "full" ? "应用到整份简历" : "应用"}
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
          <form className="chat-composer" onSubmit={(event) => void sendChat(event)}>
            <textarea
              value={chatInput}
              aria-label="简历优化需求"
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="描述你想如何优化简历..."
              rows={2}
            />
            <button className="button primary" type="submit" disabled={!chatInput.trim() || isGenerating}>
              <SendHorizonal size={16} />
            </button>
          </form>
        </aside>
      </div>

      {/* Mobile FAB for AI */}
      <button
        className="button primary resume-ai-toggle-mobile"
        type="button"
        onClick={() => setAiPanelOpen((v) => !v)}
        aria-label={aiPanelOpen ? "收起 AI 对话" : "打开 AI 对话"}
      >
        <Sparkles size={16} />
        {aiPanelOpen ? "收起" : "AI 优化"}
      </button>
    </section>
  );
}
