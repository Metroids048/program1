import { FileText, SendHorizonal, Sparkles, Upload } from "lucide-react";
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
  isLoggedIn,
  onRequireLogin,
}: {
  profile: CandidateProfile;
  position?: Position;
  onUpdateResume: (resumeText: string) => void;
  onUpdateEvidence: (items: EvidenceItem[]) => void;
  onSetHighlights: (highlights: string[]) => void;
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
  const [chatMessages, setChatMessages] = useState<ResumeChatMessage[]>([
    {
      id: "resume-chat-1",
      role: "assistant",
      text: "你好，我可以帮你优化简历内容，或按当前岗位做匹配分析。试试点击上方按钮，或直接告诉我你想怎么改。",
    },
  ]);

  const selectedSection = sections.find((section) => section.id === selectedSectionId) ?? sections[0];
  const sectionDrafts = { ...initialDrafts, ...draftOverrides } as Record<ResumeSectionId, string>;
  const selectedDraft = sectionDrafts[selectedSectionId];
  const evidenceKeywords = Array.from(new Set(profile.evidenceLibrary.flatMap((item) => item.keywords ?? []).filter(Boolean))).slice(0, 8);
  const skillKeywords = profile.resume.skills.filter(Boolean).slice(0, 6);

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
      setFileMessage(`已导入 ${file.name}${result.warning ? `，${result.warning}` : ""}，正在同步服务端简历快照。`);
    } catch {
      setFileMessage("导入失败，当前支持 txt / markdown / pdf / docx。");
    } finally {
      event.target.value = "";
    }
  };

  const buildFullResumeText = () => sections.map((section) => `${section.title}\n${sectionDrafts[section.id]}`).join("\n\n");

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
      setSaveMessage(response.meta.fallbackReason ? `已生成亮点，当前为降级结果：${response.meta.fallbackReason}` : "已生成亮点摘要并同步到后端。");
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
    const baseText = action === "section" ? selectedDraft : action === "full" ? sections.map((section) => `${section.title}\n${sectionDrafts[section.id]}`).join("\n\n") : selectedDraft;
    const title = action === "section" ? `优化「${selectedSection.title}」` : action === "full" ? "优化整份简历" : `按岗位「${repairText(position?.title || "当前岗位")}」做匹配分析`;
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
        currentText: `${selectedDraft}\n${text}`,
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
          suggestion: buildResumeSuggestion(selectedSection.title, `${selectedDraft}\n${text}`, profile),
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
      <header className="desktop-page-header">
        <div className="desktop-page-title">
          <span className="page-eyebrow">简历</span>
          <h1>我的简历</h1>
          <p>AI 实时优化你的简历，按岗位做匹配分析</p>
        </div>
        <div className="hero-actions">
          <label className="button secondary file-button">
            <Upload size={16} />
            上传简历
            <input type="file" accept=".txt,.md,.markdown,.pdf,.docx" aria-label="上传简历文件" onChange={onFile} />
          </label>
        </div>
      </header>
      {!isLoggedIn ? (
        <div className="login-banner" role="alert">
          <span>登录后可保存简历并同步数据</span>
          <button className="btn-login-sm" type="button" onClick={onRequireLogin}>
            去登录
          </button>
        </div>
      ) : null}
      {fileMessage ? <div className="inline-message success">{fileMessage}</div> : null}

      <div className="resume-layout focused-resume-layout">
        <section className="surface-card resume-editor-column">
          <div className="surface-card-inner">
            <div className="resume-profile-head">
              <div className="resume-avatar">{(profile.displayName || profile.resume.name || "候").slice(0, 1)}</div>
              <div>
                <strong>{repairText(profile.displayName || profile.resume.name || "候选人")}</strong>
                <p>
                  {repairText(profile.resume.targetRole || "目标岗位待补充")}
                  {position ? ` · 当前岗位：${repairText(position.title)}` : ""}
                </p>
              </div>
            </div>

            {profile.evidenceLibrary.length > 0 ? (
              <section className="evidence-preview">
                <div className="evidence-preview-header">
                  <span className="evidence-preview-title">AI 已识别的经历证据</span>
                  <span className="evidence-count">{profile.evidenceLibrary.length} 条</span>
                </div>
                <div className="evidence-tags">
                  {profile.evidenceLibrary.slice(0, 8).map((item) => <span key={item.id} className="evidence-tag">{repairText(item.title)}</span>)}
                </div>
                {evidenceKeywords.length > 0 || skillKeywords.length > 0 ? (
                  <div className="evidence-keywords">
                    <span className="evidence-kw-label">命中关键词：</span>
                    {[...evidenceKeywords, ...skillKeywords.filter((item) => !evidenceKeywords.includes(item))].slice(0, 10).map((item) => (
                      <span key={item} className="evidence-kw-tag">{repairText(item)}</span>
                    ))}
                  </div>
                ) : null}
                <p className="evidence-hint">这些内容会作为实时助手和模拟面试的证据底座。遗漏的经历可以继续编辑当前模块并保存。</p>
              </section>
            ) : null}

            <div className="section-row-header">
              <div>
                <span className="subtle-label">{selectedSection.label}</span>
                <h2>{selectedSection.title}</h2>
              </div>
              <div className="hero-actions">
                {selectedSectionId === "highlights" ? (
                  <button className="button secondary" type="button" onClick={() => void generateHighlights()} disabled={isGenerating}>
                    AI 生成亮点
                  </button>
                ) : null}
                <button className="button secondary" type="button" onClick={() => void runAction("section")}>
                  优化当前区块
                </button>
                <button
                  className="button primary"
                  type="button"
                  onClick={() => {
                    if (!isLoggedIn) {
                      onRequireLogin();
                      return;
                    }
                    applySectionSave(selectedSectionId, selectedDraft, profile, onUpdateEvidence, onSetHighlights);
                    setSaveMessage(`已保存「${selectedSection.title}」到后端。`);
                  }}
                >
                  保存到后端
                </button>
              </div>
            </div>
            {saveMessage ? <div className="inline-message success">{saveMessage}</div> : null}

            <textarea
              className="input textarea tall"
              value={selectedDraft}
              aria-label={`${selectedSection.title} 编辑`}
              onChange={(event) => setDraftOverrides((current) => ({ ...current, [selectedSectionId]: event.target.value }))}
            />

            <div className="resume-module-summary-list">
              {sections.map((section) => (
                <button key={section.id} type="button" className={selectedSectionId === section.id ? "resume-module-summary active" : "resume-module-summary"} onClick={() => setSelectedSectionId(section.id)}>
                  <strong>{section.title}</strong>
                  <p>{repairText(sectionDrafts[section.id]).slice(0, 60) || "等待补充内容"}</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="surface-card resume-ai-column chat-ai-column">
          <div className="surface-card-inner resume-chat-shell">
            <div className="resume-chat-header">
              <div>
                <span className="subtle-label">AI 助手</span>
                <h2>简历优化</h2>
              </div>
            </div>

            <div className="resume-chat-actions">
              <button
                className="btn-ai-action btn-ai-action--primary"
                type="button"
                onClick={() => {
                  if (!isLoggedIn) {
                    onRequireLogin();
                    return;
                  }
                  applySectionSave(selectedSectionId, selectedDraft, profile, onUpdateEvidence, onSetHighlights);
                  setSaveMessage(`已保存「${selectedSection.title}」到后端。`);
                }}
              >
                保存到后端
              </button>
              <button className="button secondary compact-button" type="button" onClick={() => void runAction("section")}>
                <Sparkles size={14} />
                优化当前区块
              </button>
              <button className="button secondary compact-button" type="button" onClick={() => void runAction("full")}>
                <FileText size={14} />
                优化整份
              </button>
              <button className="button secondary compact-button" type="button" onClick={() => void runAction("match")}>
                <Sparkles size={14} />
                匹配分析
              </button>
            </div>

            <div className="chat-thread resume-chat-thread standard-chat-thread">
              {chatMessages.map((message) => (
                <article key={message.id} className={message.role === "assistant" ? "chat-bubble assistant" : "chat-bubble user"}>
                  <p>{message.text}</p>
                  {message.metaNote ? <div className="inline-message">{message.metaNote}</div> : null}
                  {message.evidenceTrace?.length ? <EvidenceTrace trace={message.evidenceTrace} /> : null}
                  {message.suggestion ? (
                    <div className="suggestion-box">
                      <pre>{message.suggestion}</pre>
                      <button className="button primary" type="button" onClick={() => applySuggestion(message)}>
                        {message.applyTarget === "full" ? "应用到整份编辑区" : "应用到当前区块"}
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>

            <form className="chat-composer resume-chat-composer fixed-composer" onSubmit={(event) => void sendChat(event)}>
              <textarea
                value={chatInput}
                aria-label="简历优化需求"
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="例如：把这段项目经历改得更像产品岗，少空话，多结果。"
              />
              <button className="button primary" type="submit" disabled={!chatInput.trim() || isGenerating}>
                <SendHorizonal size={16} />
                {isGenerating ? "生成中..." : "发送"}
              </button>
            </form>
          </div>
        </aside>
      </div>
    </section>
  );
}
