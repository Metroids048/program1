import { useState, useEffect } from "react";
import { Download, Trash2, MessageSquare, Shield } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { navigateTo } from "../../lib/router";

interface QuotaInfo {
  dailyUsed: number;
  dailyLimit: number;
  remaining: number;
  isGuest: boolean;
}

export function AccountPage() {
  const { session, isLoggedIn, clearAuth } = useAuth();
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState("other");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (isLoggedIn) {
      void fetch("/api/quota")
        .then((res) => res.json())
        .then((data) => setQuota(data as QuotaInfo))
        .catch(() => undefined);
    }
  }, [isLoggedIn]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/data/export", { method: "POST" });
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "ai-job-data-export.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("数据已导出");
    } catch {
      setMessage("导出失败");
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("确认删除所有数据？此操作不可恢复。")) return;
    try {
      await fetch("/api/data/delete-request", { method: "POST" });
      clearAuth();
      navigateTo("/", { replace: true });
    } catch {
      setMessage("删除请求失败");
    }
  };

  const submitFeedback = async () => {
    if (!feedback.trim()) return;
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: feedbackCategory, content: feedback }),
      });
      setFeedback("");
      setFeedbackSent(true);
      setTimeout(() => setFeedbackSent(false), 3000);
    } catch {
      setMessage("反馈提交失败");
    }
  };

  if (!isLoggedIn) {
    return (
      <section className="page account-page">
        <div className="account-card">
          <h1 className="account-title">账户</h1>
          <p className="account-hint">请先登录以管理账户</p>
          <button type="button" className="account-btn" onClick={() => navigateTo("/auth/login")}>
            去登录
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="page account-page">
      <h1 className="account-title">账户中心</h1>

      {message && (
        <div className="account-message">
          {message}
          <button type="button" className="account-link" onClick={() => setMessage("")}>关闭</button>
        </div>
      )}

      <div className="account-grid">
        <div className="account-card">
          <h2 className="account-card-title">基本信息</h2>
          <div className="account-info-row">
            <span className="account-info-label">昵称</span>
            <span>{session?.displayName || "未设置"}</span>
          </div>
          <div className="account-info-row">
            <span className="account-info-label">手机号</span>
            <span>{session?.phone ? `${session.phone.slice(0, 3)}****${session.phone.slice(7)}` : "未绑定"}</span>
          </div>
        </div>

        {quota && (
          <div className="account-card">
            <h2 className="account-card-title">使用额度</h2>
            <div className="account-quota-big">
              <span className="account-quota-num">{quota.remaining}</span>
              <span className="account-quota-label">剩余 / {quota.dailyLimit} 次/天</span>
            </div>
            <p className="account-card-hint">每日 0 点重置，当前为内测免费额度</p>
          </div>
        )}

        <div className="account-card">
          <h2 className="account-card-title">数据管理</h2>
          <div className="account-actions">
            <button type="button" className="account-btn" onClick={handleExport} disabled={exporting}>
              <Download size={14} />
              {exporting ? "导出中..." : "导出数据"}
            </button>
            <button type="button" className="account-btn danger" onClick={handleDelete}>
              <Trash2 size={14} />
              删除所有数据
            </button>
          </div>
        </div>

        <div className="account-card">
          <h2 className="account-card-title">问题反馈</h2>
          <div className="account-feedback-row">
            <select className="account-select" value={feedbackCategory} onChange={(e) => setFeedbackCategory(e.target.value)}>
              <option value="bug">Bug 报告</option>
              <option value="ai_quality">AI 质量</option>
              <option value="feature">功能建议</option>
              <option value="other">其他</option>
            </select>
          </div>
          <textarea
            className="account-textarea"
            rows={3}
            placeholder="请描述你的问题或建议..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <button type="button" className="account-btn" onClick={submitFeedback} disabled={!feedback.trim()}>
            <MessageSquare size={14} />
            {feedbackSent ? "已发送" : "提交反馈"}
          </button>
        </div>

        <div className="account-card">
          <h2 className="account-card-title">法律与隐私</h2>
          <div className="account-actions">
            <button type="button" className="account-btn" onClick={() => navigateTo("/legal/terms")}>
              <Shield size={14} />
              用户协议
            </button>
            <button type="button" className="account-btn" onClick={() => navigateTo("/legal/privacy")}>
              <Shield size={14} />
              隐私政策
            </button>
          </div>
          <button type="button" className="account-btn danger outline" style={{ marginTop: "var(--space-sm)" }} onClick={() => { clearAuth(); navigateTo("/", { replace: true }); }}>
            退出登录
          </button>
        </div>
      </div>
    </section>
  );
}
