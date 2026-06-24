import { MessageCircle, Mic, SendHorizontal } from "lucide-react";
import { FormEvent, useState, useRef, useEffect } from "react";
import { repairText } from "../lib/copy";
import { makeId } from "./shared";
import type { ConversationSession, Position, PositionIntakeMessage, PositionIntakeFieldValue } from "../types";

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function ConversationPage({
  session,
  position,
  onGoMock,
}: {
  session: ConversationSession;
  position?: Position;
  onGoMock: () => void;
}) {
  const [messages, setMessages] = useState<PositionIntakeMessage[]>(session.messages);
  const [input, setInput] = useState("");
  const [extractedFields, setExtractedFields] = useState<PositionIntakeFieldValue[]>(session.extractedFields);
  const [jdDraft, setJdDraft] = useState(session.jdDraft);
  const [configDraft, setConfigDraft] = useState(session.configDraft);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    const userMsg: PositionIntakeMessage = {
      id: makeId("msg"),
      role: "user",
      text,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // Simulate AI response — in production this comes from backend
    setTimeout(() => {
      const aiResponse = generateAiResponse(text, extractedFields, jdDraft);
      const aiMsg: PositionIntakeMessage = {
        id: makeId("msg"),
        role: "assistant",
        text: aiResponse.text,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMsg]);

      if (aiResponse.extractedField) {
        setExtractedFields((prev) => {
          const existing = prev.find((f) => f.key === aiResponse.extractedField!.key);
          if (existing) {
            return prev.map((f) => f.key === aiResponse.extractedField!.key ? { ...f, value: aiResponse.extractedField!.value } : f);
          }
          return [...prev, aiResponse.extractedField!];
        });
      }
      if (aiResponse.jdDraftUpdate) {
        setJdDraft(aiResponse.jdDraftUpdate);
      }
      if (aiResponse.configUpdate) {
        setConfigDraft((prev) => ({ ...prev, ...aiResponse.configUpdate }));
      }
    }, 800);
  };

  const fieldSummary = extractedFields.length > 0
    ? extractedFields.map((f) => `${f.label}: ${repairText(f.value)}`).join(" · ")
    : "对话中将逐步提取岗位信息";

  return (
    <section className="page conversation-page">
      {/* Left sidebar — session history */}
      <aside className="conversation-sidebar">
        <div className="conversation-sidebar-header">
          <h2>对话历史</h2>
        </div>
        <div className="conversation-session-list">
          <button type="button" className="conversation-session-item active">
            <MessageCircle size={14} />
            <span>{position ? `${repairText(position.company) || "当前对话"}` : "当前对话"}</span>
          </button>
        </div>
        <div className="conversation-sidebar-footer">
          <p className="conversation-field-summary">{fieldSummary}</p>
        </div>
      </aside>

      {/* Middle — message flow */}
      <div className="conversation-main">
        <div className="conversation-messages">
          {messages.length === 0 ? (
            <div className="conversation-empty">
              <MessageCircle size={32} />
              <h3>开始完善你的岗位</h3>
              <p>告诉我公司名称、岗位名称、面试官角色、难度和时长，我会帮你生成完整 JD。</p>
              <div className="conversation-prompts">
                {["我在面字节跳动的产品经理实习岗，业务负责人面", "帮我分析这份 JD 并提取关键信息", "配置一场 45 分钟的正常难度模拟面试"].map((p) => (
                  <button key={p} type="button" className="prompt-chip" onClick={() => setInput(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`conversation-message ${msg.role}`}>
                <div className="conversation-message-bubble">
                  <p>{msg.text}</p>
                  <span className="conversation-message-time">{formatTime(msg.createdAt)}</span>
                </div>
              </div>
            ))
          )}

          {/* Structured cards inserted into message flow */}
          {jdDraft && messages.length > 0 && (
            <div className="conversation-card jd-draft-card">
              <h4>📋 JD 草稿</h4>
              <p>{repairText(jdDraft).slice(0, 200)}{jdDraft.length > 200 ? "..." : ""}</p>
            </div>
          )}

          {extractedFields.length > 0 && messages.length > 0 && (
            <div className="conversation-card fields-card">
              <h4>🏷️ 岗位画像</h4>
              <div className="fields-grid">
                {extractedFields.map((f) => (
                  <div key={f.key} className="field-chip">
                    <span className="field-label">{f.label}</span>
                    <span className="field-value">{repairText(f.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(configDraft.interviewerRole || configDraft.difficulty) && messages.length > 0 && (
            <div className="conversation-card config-card">
              <h4>⚙️ 面试配置建议</h4>
              <p>面试官: {configDraft.interviewerRole || "待确认"} · 难度: {configDraft.difficulty || "待确认"} · 时长: {configDraft.durationMinutes ? `${configDraft.durationMinutes} 分钟` : "待确认"}</p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom input */}
        <form className="conversation-input-bar" onSubmit={submit}>
          <input
            type="text"
            className="conversation-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入岗位信息，如公司名、岗位名、面试官角色..."
          />
          <button className="button primary capsule-button" type="submit" disabled={!input.trim()}>
            <SendHorizontal size={14} />
          </button>
        </form>

        {/* Bottom actions — only exit to mock */}
        <div className="conversation-actions">
          <button className="button primary" type="button" onClick={onGoMock}>
            <Mic size={14} /> 去模拟面试
          </button>
        </div>
      </div>

      <style>{`
        .conversation-page { display: flex; flex-direction: row; height: calc(100vh - 56px); max-width: 100%; padding: 0; }
        .conversation-sidebar { width: 240px; border-right: 1px solid var(--border); display: flex; flex-direction: column; background: var(--surface); flex-shrink: 0; }
        .conversation-sidebar-header { padding: 16px; border-bottom: 1px solid var(--border); }
        .conversation-sidebar-header h2 { font-size: 14px; margin: 0; }
        .conversation-session-list { flex: 1; overflow-y: auto; padding: 8px; }
        .conversation-session-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: none; background: none; cursor: pointer; border-radius: 6px; font-size: 13px; text-align: left; }
        .conversation-session-item.active { background: var(--primary-bg); color: var(--primary); }
        .conversation-sidebar-footer { padding: 12px; border-top: 1px solid var(--border); }
        .conversation-field-summary { font-size: 11px; color: var(--muted); margin: 0; }
        .conversation-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .conversation-messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        .conversation-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; gap: 12px; color: var(--muted); }
        .conversation-empty h3 { margin: 0; font-size: 18px; color: var(--text); }
        .conversation-prompts { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
        .conversation-message { display: flex; }
        .conversation-message.user { justify-content: flex-end; }
        .conversation-message-bubble { max-width: 70%; padding: 10px 14px; border-radius: 12px; font-size: 14px; line-height: 1.5; }
        .conversation-message.user .conversation-message-bubble { background: var(--primary); color: #fff; border-bottom-right-radius: 4px; }
        .conversation-message.assistant .conversation-message-bubble { background: var(--surface); border: 1px solid var(--border); border-bottom-left-radius: 4px; }
        .conversation-message-time { display: block; font-size: 10px; opacity: 0.6; margin-top: 4px; }
        .conversation-card { margin: 4px 0; padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); }
        .conversation-card h4 { margin: 0 0 6px 0; font-size: 13px; }
        .conversation-card p { margin: 0; font-size: 13px; }
        .jd-draft-card { border-left: 3px solid #1976d2; }
        .fields-card { border-left: 3px solid #388e3c; }
        .config-card { border-left: 3px solid #f57c00; }
        .fields-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
        .field-chip { display: flex; gap: 4px; font-size: 12px; padding: 2px 8px; background: var(--primary-bg); border-radius: 12px; }
        .field-label { font-weight: 600; }
        .field-value { color: var(--text); }
        .conversation-input-bar { display: flex; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--border); }
        .conversation-input { flex: 1; padding: 10px 14px; border: 1px solid var(--border); border-radius: 24px; font-size: 14px; outline: none; }
        .conversation-input:focus { border-color: var(--primary); }
        .conversation-actions { display: flex; gap: 8px; padding: 8px 20px 16px; justify-content: center; }
        .prompt-chip { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 20px; background: var(--surface); cursor: pointer; font-size: 13px; }
        .prompt-chip:hover { border-color: var(--primary); }
        @media (max-width: 760px) {
          .conversation-sidebar { display: none; }
          .conversation-actions { flex-wrap: wrap; }
        }
      `}</style>
    </section>
  );
}

// Simple local AI response simulation
function generateAiResponse(
  userInput: string,
  existingFields: PositionIntakeFieldValue[],
  currentJdDraft: string,
): {
  text: string;
  extractedField?: PositionIntakeFieldValue;
  jdDraftUpdate?: string;
  configUpdate?: Partial<ConversationSession["configDraft"]>;
} {
  const input = userInput.toLowerCase();
  const result: ReturnType<typeof generateAiResponse> = { text: "收到你的信息，让我帮你整理一下。" };

  // Simple keyword extraction
  const companyPatterns: [RegExp, string][] = [
    [/字节|bytedance/, "字节跳动"],
    [/腾讯|tencent/, "腾讯"],
    [/阿里|alibaba/, "阿里巴巴"],
    [/美团|meituan/, "美团"],
    [/百度|baidu/, "百度"],
    [/小红书|xiaohongshu/, "小红书"],
  ];

  for (const [re, name] of companyPatterns) {
    if (re.test(input) && !existingFields.some((f) => f.key === "company")) {
      result.extractedField = { key: "company", label: "公司", value: name, source: "inferred" };
      result.text = `识别到公司: ${name}。请确认是否正确，并继续告诉我岗位名称。`;
      break;
    }
  }

  // Role extraction
  if (/实习|校招|应届|产品|运营|开发|前端|后端|算法|数据|设计|市场/.test(input)) {
    const roleMatch = input.match(/(产品\s*(经理|运营|实习)?|运营|前端|后端|算法|数据|设计|市场)/);
    if (roleMatch && !existingFields.some((f) => f.key === "role")) {
      result.extractedField = { key: "role", label: "岗位", value: roleMatch[0], source: "inferred" };
      result.text = `识别到岗位: ${roleMatch[0]}。接下来请告诉我面试官角色和面试难度。`;
    }
  }

  // Build JD draft from accumulated fields
  const allFields = [...existingFields, ...(result.extractedField ? [result.extractedField] : [])];
  if (allFields.length >= 2 && !currentJdDraft) {
    const company = allFields.find((f) => f.key === "company")?.value ?? "待确认";
    const role = allFields.find((f) => f.key === "role")?.value ?? "待确认";
    result.jdDraftUpdate = `【${company}】${role}岗位面试准备\n\n岗位描述: ${input.slice(0, 100)}\n\n核心要求: 待对话补充`;
  }

  return result;
}
