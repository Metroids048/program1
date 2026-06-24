import { ArrowRight, BriefcaseBusiness, Headphones, MessageCircle, Mic, Trash2, Upload, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { repairText } from "../lib/copy";
import { loadDraftState, saveDraftState } from "../lib/store";
import { navigateTo } from "../lib/router";
import type { Position, PositionStatus } from "../types";
import { QuotaBadge } from "./shared";

function positionStatusLabel(status: PositionStatus): string {
  switch (status) {
    case "draft": return "草稿中";
    case "saved": return "已保存";
    case "configured": return "已配置";
    case "practiced": return "已练习";
    default: return "草稿中";
  }
}

function statusBadgeClass(status: PositionStatus): string {
  switch (status) {
    case "draft": return "badge-draft";
    case "saved": return "badge-saved";
    case "configured": return "badge-configured";
    case "practiced": return "badge-practiced";
    default: return "badge-draft";
  }
}

export function JobsPage({
  positions,
  activePositionId,
  onSubmitJd,
  onSelectPosition,
}: {
  positions: Position[];
  activePositionId: string;
  onSubmitJd: (jobText: string, options?: { positionId?: string }) => void;
  onSelectPosition: (positionId: string) => void;
}) {
  const [input, setInput] = useState(() => loadDraftState().homeInput ?? "");
  const [drawerOpen, setDrawerOpen] = useState<string | null>(null);

  const drawerPosition = drawerOpen ? positions.find((p) => p.id === drawerOpen) : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSubmitJd(text);
    saveDraftState({ ...loadDraftState(), homeInput: "" });
    setInput("");
  };

  const updateInput = (value: string) => {
    setInput(value);
    saveDraftState({ ...loadDraftState(), homeInput: value });
  };

  const openDrawer = (positionId: string) => {
    onSelectPosition(positionId);
    setDrawerOpen(positionId);
  };
  const closeDrawer = () => setDrawerOpen(null);

  return (
    <section className="page page-home desktop-page">
      <div className="home-stage home-stage-product">
        <header className="home-hero home-hero-product">
          <div className="home-hero-topline">
            <span className="page-eyebrow">岗位入口</span>
            <QuotaBadge />
          </div>
          <h1>创建或导入你的面试岗位</h1>
          <p>输入 JD、上传文件或选择示例快速开始。保存后进入对话完善岗位，然后开始模拟面试或实时助手。</p>
        </header>

        <div className="home-product-shell">
          <section className="surface-card home-hero-input-card">
            <div className="surface-card-inner">
              <div className="section-row-header">
                <div>
                  <span className="subtle-label">新建岗位</span>
                  <h2>输入岗位信息</h2>
                  <p>粘贴 JD 原文、写一段岗位描述，或直接输入面试场景。</p>
                </div>
              </div>

              <form className="home-intake-box home-intake-box-product" onSubmit={submit}>
                <textarea
                  id="home-intake-product"
                  value={input}
                  aria-label="岗位信息输入"
                  onChange={(event) => updateInput(event.target.value)}
                  placeholder={'例如：粘贴真实 JD，或写\u201C明天下午腾讯一面，产品运营岗，业务负责人面，45 分钟\u201D。'}
                />
                <div className="home-intake-actions">
                  <label className="button secondary capsule-button" style={{ cursor: "pointer" }}>
                    <Upload size={14} />
                    上传 JD
                    <input type="file" accept=".pdf,.docx,.txt,.md" style={{ display: "none" }} onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const text = reader.result as string;
                        if (text.trim()) onSubmitJd(text.trim());
                      };
                      reader.readAsText(file);
                    }} />
                  </label>
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
                  <span className="subtle-label">已保存岗位</span>
                  <h2>{positions.length > 0 ? `${positions.length} 个岗位` : "还没有岗位卡"}</h2>
                  <p>点击岗位卡查看详情、修改设置或进入面试准备。</p>
                </div>
              </div>

              {positions.length === 0 ? (
                <article className="home-mini-status-card">
                  <span>准备状态</span>
                  <strong>等待创建岗位</strong>
                  <p>输入岗位信息并保存后，这里会显示你的岗位列表。</p>
                </article>
              ) : (
                <div className="position-list">
                  {positions.map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      className={`position-card ${pos.id === activePositionId ? "active" : ""}`}
                      onClick={() => openDrawer(pos.id)}
                    >
                      <div className="position-card-header">
                        <span className="position-card-icon"><BriefcaseBusiness size={16} /></span>
                        <strong>{repairText(pos.company) || "公司待确认"}</strong>
                        <span className={statusBadgeClass(pos.status)}>{positionStatusLabel(pos.status)}</span>
                      </div>
                      <p className="position-card-role">{repairText(pos.title) || "岗位待确认"}</p>
                      {pos.intake.rawJdText ? (
                        <p className="position-card-excerpt">{repairText(pos.intake.rawJdText).slice(0, 80)}...</p>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Position Drawer */}
      {drawerPosition ? (
        <div className="drawer-backdrop" role="presentation" onClick={closeDrawer}>
          <aside className="drawer-panel position-drawer" role="dialog" aria-modal="true" aria-label={`${repairText(drawerPosition.company) || "岗位"} 详情`} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h2>{repairText(drawerPosition.company) || "公司待确认"}</h2>
                <p>{repairText(drawerPosition.title) || "岗位待确认"}</p>
              </div>
              <button className="button icon-only" type="button" onClick={closeDrawer} aria-label="关闭">
                <X size={18} />
              </button>
            </div>

            <div className="drawer-body">
              <PositionDrawerTabs position={drawerPosition} onSelectPosition={onSelectPosition} />
            </div>

            <div className="drawer-actions">
              <button className="button secondary" type="button" onClick={() => {
                onSelectPosition(drawerPosition.id);
                closeDrawer();
                navigateTo(`/live/${drawerPosition.id}`);
              }}>
                <Headphones size={16} /> 实时助手
              </button>
              <button className="button secondary" type="button" onClick={() => {
                onSelectPosition(drawerPosition.id);
                closeDrawer();
                navigateTo(drawerPosition.intake.configuredInterview || drawerPosition.status === "configured" || drawerPosition.status === "practiced" ? `/mock/room/${drawerPosition.id}` : `/mock/setup/${drawerPosition.id}`);
              }}>
                <Mic size={16} /> 模拟面试
              </button>
              {drawerPosition.intake.sessionId ? (
                <button className="button secondary" type="button" onClick={() => {
                  closeDrawer();
                  navigateTo(`/conversations/${drawerPosition.intake.sessionId}`);
                }}>
                  <MessageCircle size={16} /> 继续完善
                </button>
              ) : null}
              <button className="button danger" type="button" onClick={() => {
                closeDrawer();
                // Delete handled by parent; for now just close
              }}>
                <Trash2 size={16} /> 删除岗位
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <style>{`
        .position-list { display: flex; flex-direction: column; gap: 8px; }
        .position-card { display: flex; flex-direction: column; gap: 4px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); cursor: pointer; text-align: left; width: 100%; }
        .position-card:hover { border-color: var(--primary); }
        .position-card.active { border-color: var(--primary); background: var(--primary-bg); }
        .position-card-header { display: flex; align-items: center; gap: 8px; }
        .position-card-icon { color: var(--primary); }
        .position-card-role { font-size: 13px; color: var(--muted); margin: 0; }
        .position-card-excerpt { font-size: 12px; color: var(--muted); margin: 0; }
        .badge-draft { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #f0f0f0; color: #666; }
        .badge-saved { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #e3f2fd; color: #1976d2; }
        .badge-configured { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #e8f5e9; color: #388e3c; }
        .badge-practiced { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #fff3e0; color: #f57c00; }
        .position-drawer { width: 480px; max-width: 90vw; }
        .drawer-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 20px; border-bottom: 1px solid var(--border); }
        .drawer-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
        .drawer-actions { display: flex; gap: 8px; padding: 16px 20px; border-top: 1px solid var(--border); flex-wrap: wrap; }
        .badge { font-size: 11px; padding: 2px 8px; border-radius: 12px; }
        .drawer-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
        .drawer-tab { padding: 8px 16px; font-size: 13px; border: none; background: none; cursor: pointer; border-bottom: 2px solid transparent; color: var(--muted); }
        .drawer-tab.active { color: var(--primary); border-bottom-color: var(--primary); }
      `}</style>
    </section>
  );
}

function PositionDrawerTabs({ position, onSelectPosition }: { position: Position; onSelectPosition: (positionId: string) => void }) {
  const [tab, setTab] = useState<"jd" | "questions" | "resume">("jd");
  const openFullPage = (path: "/jd" | "/questions" | "/resume") => {
    onSelectPosition(position.id);
    navigateTo(path);
  };

  return (
    <div>
      <div className="drawer-tabs">
        <button className={`drawer-tab ${tab === "jd" ? "active" : ""}`} onClick={() => setTab("jd")}>JD 解析</button>
        <button className={`drawer-tab ${tab === "questions" ? "active" : ""}`} onClick={() => setTab("questions")}>资料库</button>
        <button className={`drawer-tab ${tab === "resume" ? "active" : ""}`} onClick={() => setTab("resume")}>简历</button>
      </div>

      {tab === "jd" && (
        <div>
          <h3>JD 原文</h3>
          <p className="jd-preview">{repairText(position.jobText) || "暂无 JD 内容"}</p>
          {position.job && (
            <>
              <h4>分析结果</h4>
              <p>{repairText(position.job.title)} · {repairText(position.job.company)}</p>
            </>
          )}
          <button className="button secondary compact-button" type="button" onClick={() => openFullPage("/jd")}>
            打开完整 JD 页面
          </button>
        </div>
      )}

      {tab === "questions" && (
        <div>
          <h3>资料库</h3>
          {position.questions.length === 0 ? (
            <p className="muted">暂无问题。使用实时助手或模拟面试后，提词卡中的问题会自动保存到这里。</p>
          ) : (
            <ul className="question-list">
              {position.questions.slice(0, 10).map((q) => (
                <li key={q.id}>{repairText(q.question)}</li>
              ))}
            </ul>
          )}
          <button className="button secondary compact-button" type="button" onClick={() => openFullPage("/questions")}>
            进入完整资料库
          </button>
        </div>
      )}

      {tab === "resume" && (
        <div>
          <h3>简历上下文</h3>
          <p>{position.matchReport?.summary || "暂无简历匹配信息"}</p>
          <button className="button secondary compact-button" type="button" onClick={() => openFullPage("/resume")}>
            进入完整简历页
          </button>
        </div>
      )}
    </div>
  );
}
