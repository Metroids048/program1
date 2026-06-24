import { ArrowRight, Mic } from "lucide-react";
import { useState } from "react";
import { repairText } from "../lib/copy";
import type { Position } from "../types";
import { DEFAULT_CONFIG, PERSONAS, type InterviewConfig, type PersonaKey } from "./shared";

function inferQuestionCount(position: Position): number {
  return Math.max(3, Math.min(8, position.questions.length || 5));
}

export function MockSetupPage({
  position,
  onStart,
}: {
  position: Position;
  onStart: (config: InterviewConfig) => void;
}) {
  const questionCount = inferQuestionCount(position);
  const estimatedMinutes = Math.max(10, questionCount * 3);
  const [config, setConfig] = useState<InterviewConfig>({
    ...DEFAULT_CONFIG,
    interviewerRole: position.interviewPreferences?.interviewerRole ?? DEFAULT_CONFIG.interviewerRole,
    difficulty: position.interviewPreferences?.difficulty ?? DEFAULT_CONFIG.difficulty,
    style: (position.interviewPreferences?.style as PersonaKey) ?? DEFAULT_CONFIG.style,
    interviewerGender: position.interviewPreferences?.interviewerGender ?? DEFAULT_CONFIG.interviewerGender,
    submitMode: position.interviewPreferences?.submitMode ?? DEFAULT_CONFIG.submitMode,
  });

  return (
    <section className="page mock-setup-page">
      <div className="mock-setup-container">
        <header className="mock-setup-header">
          <span className="page-eyebrow">模拟面试</span>
          <h1>确认面试配置</h1>
          <p>进入面试房间前，确认岗位信息和面试参数。</p>
        </header>

        <div className="mock-setup-grid">
          {/* JD Summary Card */}
          <div className="surface-card setup-card">
            <div className="surface-card-inner">
              <h2>📋 岗位摘要</h2>
              <div className="setup-field">
                <span className="setup-label">公司</span>
                <strong>{repairText(position.company) || "待确认"}</strong>
              </div>
              <div className="setup-field">
                <span className="setup-label">岗位</span>
                <strong>{repairText(position.title) || "待确认"}</strong>
              </div>
              {position.jobText ? (
                <div className="setup-field">
                  <span className="setup-label">JD 原文</span>
                  <p className="jd-excerpt">{repairText(position.jobText).slice(0, 200)}{position.jobText.length > 200 ? "..." : ""}</p>
                </div>
              ) : null}
              {position.questions.length > 0 ? (
                <div className="setup-field">
                  <span className="setup-label">已准备题目</span>
                  <strong>{position.questions.length} 题</strong>
                </div>
              ) : null}
            </div>
          </div>

          {/* Config Card */}
          <div className="surface-card setup-card">
            <div className="surface-card-inner">
              <h2>⚙️ 面试参数</h2>

              <div className="setup-field">
                <span className="setup-label">面试官角色</span>
                <select
                  className="setup-select"
                  value={config.interviewerRole}
                  onChange={(e) => setConfig((c) => ({ ...c, interviewerRole: e.target.value as InterviewConfig["interviewerRole"] }))}
                >
                  <option value="HR">HR 面</option>
                  <option value="上级">上级</option>
                  <option value="CTO">技术面</option>
                  <option value="CEO">业务面</option>
                  <option value="业务负责人">业务负责人</option>
                </select>
              </div>

              <div className="setup-field">
                <span className="setup-label">面试难度</span>
                <select
                  className="setup-select"
                  value={config.difficulty}
                  onChange={(e) => setConfig((c) => ({ ...c, difficulty: e.target.value as InterviewConfig["difficulty"] }))}
                >
                  <option value="正常">正常</option>
                  <option value="压力面">压力面</option>
                  <option value="地狱面">地狱面</option>
                </select>
              </div>

              <div className="setup-field">
                <span className="setup-label">面试风格</span>
                <div className="persona-options">
                  {PERSONAS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`persona-option ${config.style === p.id ? "active" : ""}`}
                      onClick={() => setConfig((c) => ({ ...c, style: p.id }))}
                    >
                      <span className="persona-avatar">{p.avatar}</span>
                      <div>
                        <strong>{p.label}</strong>
                        <small>{p.description}</small>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="setup-field">
                <span className="setup-label">预计题数</span>
                <input
                  className="setup-input"
                  type="text"
                  value={`${questionCount} 题`}
                  readOnly
                />
              </div>

              <div className="setup-field">
                <span className="setup-label">预计时长</span>
                <input
                  className="setup-input"
                  type="text"
                  value={`${estimatedMinutes} 分钟`}
                  readOnly
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mock-setup-actions">
          <button className="button primary large-button" type="button" onClick={() => onStart(config)}>
            <Mic size={18} />
            进入面试房间
            <ArrowRight size={16} />
          </button>
          <p className="setup-hint">进入后将由 AI 面试官根据你的岗位和配置进行模拟面试，题词卡会自动生成。</p>
        </div>
      </div>

      <style>{`
        .mock-setup-page { display: flex; justify-content: center; padding: 40px 20px; }
        .mock-setup-container { max-width: 720px; width: 100%; display: flex; flex-direction: column; gap: 24px; }
        .mock-setup-header { text-align: center; }
        .mock-setup-header h1 { margin: 8px 0 4px; font-size: 24px; }
        .mock-setup-header p { color: var(--muted); margin: 0; }
        .mock-setup-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .setup-card h2 { font-size: 16px; margin: 0 0 16px 0; }
        .setup-field { margin-bottom: 14px; }
        .setup-label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
        .setup-field strong { font-size: 15px; }
        .jd-excerpt { font-size: 13px; color: var(--text); margin: 4px 0 0; line-height: 1.5; }
        .setup-select, .setup-input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; background: var(--surface); }
        .persona-options { display: flex; flex-direction: column; gap: 8px; }
        .persona-option { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 2px solid var(--border); border-radius: 8px; background: var(--surface); cursor: pointer; text-align: left; width: 100%; }
        .persona-option.active { border-color: var(--primary); background: var(--primary-bg); }
        .persona-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--primary); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; flex-shrink: 0; }
        .persona-option strong { font-size: 14px; display: block; }
        .persona-option small { font-size: 12px; color: var(--muted); }
        .mock-setup-actions { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 20px 0; }
        .large-button { padding: 14px 32px; font-size: 16px; display: flex; align-items: center; gap: 8px; }
        .setup-hint { font-size: 13px; color: var(--muted); text-align: center; }
        @media (max-width: 600px) {
          .mock-setup-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  );
}
