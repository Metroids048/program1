import { ChevronDown, Clock, FileText, FileUp, FolderKanban, Plus, ScrollText, Sparkles } from "lucide-react";
import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";
import { repairText } from "../lib/copy";
import { importResumeFile } from "../lib/resumeImport";
import { makeId, nowIso } from "./shared";
import type { InterviewQuestion, Position, PositionMaterial, UsageScope, WorkspaceState } from "../types";

function extractKeywords(text: string, limit = 8): string[] {
  const matches = text.match(/[A-Za-z][A-Za-z0-9+#./-]{1,}|[\u4e00-\u9fa5]{2,}/g) ?? [];
  const seen = new Set<string>();
  return matches
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return item.length <= 20;
    })
    .slice(0, limit);
}

function summarize(text: string): string {
  const normalized = repairText(text).replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized;
}

function createMaterial(input: {
  kind: PositionMaterial["kind"];
  source: PositionMaterial["source"];
  title: string;
  detail: string;
  tags?: string[];
  usageScopes?: UsageScope[];
}): PositionMaterial {
  const timestamp = nowIso();
  const detail = repairText(input.detail);
  return {
    id: makeId(`mat-${input.kind}`),
    kind: input.kind,
    source: input.source,
    title: repairText(input.title) || "未命名资料",
    detail,
    summary: summarize(detail),
    keywords: extractKeywords(`${input.title}\n${detail}`),
    tags: input.tags ?? [],
    linkedQuestionIds: [],
    usageScopes: input.usageScopes ?? ["live", "mock", "resume"],
    ragStatus: "local_only",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function sourceLabel(source: InterviewQuestion["source"]): string {
  switch (source) {
    case "manual": return "手动记录";
    case "mock": return "模拟面试回流";
    case "cueCard": return "实时助手回流";
    case "diagnosis": return "JD诊断";
    case "material": return "资料提取";
    case "record_excerpt": return "面试记录提炼";
    default: return source;
  }
}

function usageScopeLabel(scope: UsageScope): string {
  switch (scope) {
    case "live": return "实时助手";
    case "mock": return "模拟面试";
    case "resume": return "简历优化";
  }
}

function formatRelativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "刚刚";
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} 天前`;
    return new Date(iso).toLocaleDateString("zh-CN");
  } catch {
    return "";
  }
}

export function QuestionsWorkspace({
  workspace,
  position,
  onUpdateMaterials,
  onUpdateQuestion,
  onAddQuestion,
  isLoggedIn,
  onRequireLogin,
}: {
  workspace: WorkspaceState | null;
  position: Position | undefined;
  onUpdateMaterials: (materials: PositionMaterial[]) => void;
  onUpdateQuestion: (questionId: string, patch: Partial<InterviewQuestion>) => void;
  onAddQuestion: (question: Pick<InterviewQuestion, "question" | "category" | "difficulty"> & { answer?: string; notes?: string; tags?: string[] }) => void;
  isLoggedIn: boolean;
  onRequireLogin: () => void;
}) {
  const [newQuestion, setNewQuestion] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newTags, setNewTags] = useState("");
  const [category, setCategory] = useState("项目深挖");
  const [expandedQuestionId, setExpandedQuestionId] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [noteFilterTag, setNoteFilterTag] = useState("");

  const materials = useMemo(() => position?.materials ?? [], [position]);
  const projectFiles = materials.filter((item) => item.kind === "project_file" || item.kind === "project" || item.kind === "upload");
  const questionNotes = useMemo(() => workspace?.questions ?? [], [workspace]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    questionNotes.forEach((q) => (q.tags ?? []).forEach((t) => tags.add(t)));
    return Array.from(tags);
  }, [questionNotes]);

  const filteredNotes = noteFilterTag
    ? questionNotes.filter((q) => (q.tags ?? []).includes(noteFilterTag))
    : questionNotes;

  const latestUpdate = useMemo(() => {
    const timestamps = [
      ...materials.map((m) => m.updatedAt),
      ...questionNotes.map((q) => q.lastReviewedAt).filter(Boolean) as string[],
    ];
    if (!timestamps.length) return null;
    return timestamps.sort().reverse()[0];
  }, [materials, questionNotes]);

  const saveMaterial = (material: PositionMaterial) => {
    if (!isLoggedIn) {
      onRequireLogin();
      return;
    }
    onUpdateMaterials([material, ...materials]);
  };

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
      saveMaterial(
        createMaterial({
          kind: "project_file",
          source: "upload",
          title: file.name.replace(/\.[^.]+$/, ""),
          detail: result.text,
          tags: ["上传项目资料"],
          usageScopes: ["live", "mock", "resume"],
        }),
      );
      setUploadMessage(`已解析 ${file.name}，资料将进入实时助手、模拟面试和简历优化上下文。`);
    } catch {
      setUploadMessage("上传失败，当前支持 txt / markdown / pdf / docx。");
    } finally {
      event.target.value = "";
    }
  };

  const submitNote = (event: FormEvent) => {
    event.preventDefault();
    if (!newQuestion.trim()) return;
    if (!isLoggedIn) {
      onRequireLogin();
      return;
    }
    onAddQuestion({
      question: newQuestion.trim(),
      category,
      difficulty: "进阶",
      notes: newNotes.trim(),
      tags: newTags
        .split(/[,，\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
      answer: "",
    });
    setNewQuestion("");
    setNewNotes("");
    setNewTags("");
  };

  const removeMaterial = (materialId: string) => {
    onUpdateMaterials(materials.filter((item) => item.id !== materialId));
  };

  return (
    <section className="page page-questions desktop-page">
      <header className="desktop-page-header">
        <div className="desktop-page-title">
          <span className="page-eyebrow">资料库</span>
          <h1>当前岗位的知识资产</h1>
          <p>项目资料和问题笔记统一进入 RAG 上下文，供实时助手、模拟面试和简历优化共用。</p>
        </div>
      </header>

      {!position ? (
        <div className="empty-card">
          <div className="empty-card-icon">
            <FolderKanban size={20} />
          </div>
          <div>
            <h2>先在首页创建一个岗位</h2>
            <p>面试资料按岗位归档。创建岗位后，这里会显示项目资料和问题笔记。</p>
          </div>
        </div>
      ) : (
        <>
          {/* Overview Section — 资料概览 */}
          <section className="surface-card knowledge-overview">
            <div className="surface-card-inner knowledge-overview-inner">
              <div className="knowledge-overview-stats">
                <div className="knowledge-stat">
                  <span className="knowledge-stat-value">{projectFiles.length}</span>
                  <span className="knowledge-stat-label">项目资料</span>
                </div>
                <div className="knowledge-stat">
                  <span className="knowledge-stat-value">{questionNotes.length}</span>
                  <span className="knowledge-stat-label">问题笔记</span>
                </div>
                {latestUpdate ? (
                  <div className="knowledge-stat">
                    <span className="knowledge-stat-value"><Clock size={14} /></span>
                    <span className="knowledge-stat-label">最近更新 {formatRelativeTime(latestUpdate)}</span>
                  </div>
                ) : null}
              </div>
              <div className="knowledge-overview-scopes">
                <span className="subtle-label">影响模块</span>
                <div className="scope-badges">
                  {(["live", "mock", "resume"] as UsageScope[]).map((scope) => (
                    <span key={scope} className="scope-badge">{usageScopeLabel(scope)}</span>
                  ))}
                </div>
              </div>
              <label className="button primary knowledge-upload-cta">
                <FileUp size={16} />
                上传项目资料
                <input type="file" accept=".txt,.md,.markdown,.pdf,.docx" aria-label="上传项目资料文件" onChange={onFile} />
              </label>
            </div>
          </section>

          {uploadMessage ? <div className="inline-message success">{uploadMessage}</div> : null}

          {/* Project Files Section — 项目资料 */}
          <section className="surface-card">
            <div className="surface-card-inner">
              <div className="section-row-header">
                <div>
                  <span className="subtle-label">项目资料</span>
                  <h2>项目文件与解析</h2>
                  <p>上传 .txt / .md / .pdf / .docx 项目文件，解析后自动进入实时助手、模拟面试和简历优化上下文。</p>
                </div>
                <label className="button secondary file-button">
                  <FileUp size={16} />
                  上传文件
                  <input type="file" accept=".txt,.md,.markdown,.pdf,.docx" aria-label="上传项目资料文件" onChange={onFile} />
                </label>
              </div>

              <div className="material-card-grid">
                {projectFiles.length > 0 ? (
                  projectFiles.map((item) => (
                    <MaterialCard key={item.id} item={item} onRemove={removeMaterial} />
                  ))
                ) : (
                  <div className="empty-card compact">
                    <div className="empty-card-icon"><FileText size={18} /></div>
                    <div>
                      <h2>还没有项目资料</h2>
                      <p>上传项目相关文件，解析后会自动标记适用范围。</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Question Notes Section — 问题笔记 */}
          <section className="surface-card">
            <div className="surface-card-inner">
              <div className="section-row-header">
                <div>
                  <span className="subtle-label">问题笔记</span>
                  <h2>面试笔记流</h2>
                  <p>手动记录、模拟面试回流、实时助手回流或面试记录提炼的问题，按时间排列，支持标签筛选。</p>
                </div>
              </div>

              <form className="question-note-form" onSubmit={submitNote}>
                <div className="question-note-form-row">
                  <select className="input compact-select" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="问题分类">
                    {["行为面", "项目深挖", "专业技能", "岗位动机", "压力题", "英文题"].map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                  <input
                    className="input"
                    value={newTags}
                    onChange={(event) => setNewTags(event.target.value)}
                    placeholder="标签（逗号分隔），如：STAR, 追问, 高频"
                    aria-label="笔记标签"
                  />
                </div>
                <textarea
                  className="input textarea"
                  value={newQuestion}
                  aria-label="问题原文"
                  onChange={(event) => setNewQuestion(event.target.value)}
                  placeholder="问题原文，例如：请详细介绍一段项目经历。"
                />
                <textarea
                  className="input textarea compact"
                  value={newNotes}
                  aria-label="备注与复盘"
                  onChange={(event) => setNewNotes(event.target.value)}
                  placeholder="我的备注 / 复盘 / 追问提醒"
                />
                <button className="button primary" type="submit" disabled={!newQuestion.trim()}>
                  <Plus size={16} />
                  记录笔记
                </button>
              </form>

              {allTags.length > 0 ? (
                <div className="note-tag-filter">
                  <button
                    type="button"
                    className={`tag-chip ${!noteFilterTag ? "active" : ""}`}
                    onClick={() => setNoteFilterTag("")}
                  >
                    全部
                  </button>
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={`tag-chip ${noteFilterTag === tag ? "active" : ""}`}
                      onClick={() => setNoteFilterTag(noteFilterTag === tag ? "" : tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              ) : null}

              {filteredNotes.length > 0 ? (
                <div className="note-feed">
                  {filteredNotes.map((item) => {
                    const expanded = expandedQuestionId === item.id;
                    return (
                      <article key={item.id} className={expanded ? "note-card expanded" : "note-card"}>
                        <button
                          type="button"
                          className="note-card-head"
                          onClick={() => setExpandedQuestionId((current) => (current === item.id ? "" : item.id))}
                        >
                          <div className="note-card-primary">
                            <strong>{repairText(item.question)}</strong>
                            <span className="note-card-meta">
                              <span className="note-source">{sourceLabel(item.source)}</span>
                              <span>{repairText(item.category)}</span>
                              <ChevronDown size={14} />
                            </span>
                          </div>
                          {item.notes ? (
                            <p className="note-card-preview">{repairText(item.notes).slice(0, 80)}{item.notes.length > 80 ? "..." : ""}</p>
                          ) : null}
                          {item.tags && item.tags.length > 0 ? (
                            <div className="note-card-tags">
                              {item.tags.map((tag) => (
                                <span key={tag} className="tag-dot">{tag}</span>
                              ))}
                            </div>
                          ) : null}
                        </button>
                        {expanded ? (
                          <div className="note-card-body">
                            <div className="note-field">
                              <span className="field-label">备注 / 复盘</span>
                              <textarea
                                className="input textarea compact"
                                value={repairText(item.notes)}
                                aria-label={`${item.id} 笔记`}
                                onChange={(event) => {
                                  if (!isLoggedIn) { onRequireLogin(); return; }
                                  onUpdateQuestion(item.id, { notes: event.target.value });
                                }}
                              />
                            </div>
                            <details className="note-answer-details">
                              <summary>参考回答 / 历史版本</summary>
                              <textarea
                                className="input textarea compact"
                                value={repairText(item.answer || "")}
                                aria-label={`${item.id} 参考回答`}
                                onChange={(event) => {
                                  if (!isLoggedIn) { onRequireLogin(); return; }
                                  onUpdateQuestion(item.id, { answer: event.target.value });
                                }}
                              />
                            </details>
                            <div className="note-field">
                              <span className="field-label">标签</span>
                              <input
                                className="input compact"
                                value={(item.tags ?? []).join(", ")}
                                aria-label={`${item.id} 标签`}
                                placeholder="逗号分隔"
                                onChange={(event) => {
                                  if (!isLoggedIn) { onRequireLogin(); return; }
                                  onUpdateQuestion(item.id, { tags: event.target.value.split(/[,，\s]+/).filter(Boolean) });
                                }}
                              />
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-card compact">
                  <div className="empty-card-icon"><ScrollText size={18} /></div>
                  <div>
                    <h2>还没有问题笔记</h2>
                    <p>从真实面试、模拟追问或手动输入开始沉淀笔记。</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </section>
  );
}

function MaterialCard({ item, onRemove }: { item: PositionMaterial; onRemove: (materialId: string) => void }) {
  const Icon = item.kind === "project_file" || item.kind === "project" ? FolderKanban : item.kind === "upload" ? FileText : Sparkles;

  return (
    <article className="material-card">
      <header>
        <span className="material-kind">
          <Icon size={14} />
          {item.kind === "project_file" || item.kind === "project" ? "项目资料" : item.kind === "upload" ? "上传文件" : "笔记"}
        </span>
        <button className="mini-link" type="button" onClick={() => onRemove(item.id)}>
          移除
        </button>
      </header>
      <h3>{repairText(item.title)}</h3>
      <p>{repairText(item.summary)}</p>
      {item.keywords.length > 0 ? (
        <div className="material-keywords">
          {item.keywords.slice(0, 6).map((keyword) => (
            <span key={keyword}>{keyword}</span>
          ))}
        </div>
      ) : null}
      {item.usageScopes && item.usageScopes.length > 0 ? (
        <div className="material-usage">
          <span className="subtle-label">适用范围</span>
          <div className="scope-badges">
            {item.usageScopes.map((scope) => (
              <span key={scope} className="scope-badge">{usageScopeLabel(scope)}</span>
            ))}
          </div>
        </div>
      ) : null}
      {item.ragStatus && item.ragStatus !== "local_only" ? (
        <span className={`rag-status rag-${item.ragStatus}`}>
          {item.ragStatus === "indexed" ? "已索引" : item.ragStatus === "pending" ? "索引中" : "索引失败"}
        </span>
      ) : null}
    </article>
  );
}
