import { useEffect, useState } from "react";
import { Bell, Download, LifeBuoy, Mail, Shield, Trash2 } from "lucide-react";
import { useAuth, type AuthSession } from "../../lib/auth";
import { apiFetch } from "../../lib/authClient";
import { navigateTo } from "../../lib/router";
import type { UserJourneyState } from "../../types";
import { Seo } from "../system/Seo";

interface QuotaInfo {
  dailyUsed: number;
  dailyLimit: number;
  remaining: number;
  isGuest: boolean;
  features?: Record<"cueCard" | "mock" | "resume" | "positionAnalyze", { used: number; limit: number; remaining: number }>;
}

const QUOTA_FEATURE_LABELS: Array<{ key: keyof NonNullable<QuotaInfo["features"]>; label: string }> = [
  { key: "cueCard", label: "提词卡" },
  { key: "mock", label: "模拟面试" },
  { key: "resume", label: "简历 AI" },
  { key: "positionAnalyze", label: "岗位分析" },
];

function getQuotaSummary(quota: QuotaInfo) {
  const featureItems = QUOTA_FEATURE_LABELS
    .map((item) => {
      const value = quota.features?.[item.key];
      return value ? { label: item.label, remaining: value.remaining, limit: value.limit } : null;
    })
    .filter((item): item is { label: string; remaining: number; limit: number } => Boolean(item));

  if (featureItems.length === 0) {
    return {
      remaining: quota.remaining,
      limit: quota.dailyLimit,
      label: "今日 AI 剩余",
    };
  }

  return featureItems.reduce((current, next) => {
    const currentRatio = current.limit > 0 ? current.remaining / current.limit : 0;
    const nextRatio = next.limit > 0 ? next.remaining / next.limit : 0;
    return nextRatio < currentRatio ? next : current;
  });
}

type AccountMessage = {
  tone: "success" | "error";
  text: string;
};

type DraftState = {
  email: string;
  displayName: string;
  feedbackContact: string;
  prefs: {
    marketing: boolean;
    product: boolean;
    security: boolean;
  };
};

export function AccountPage({ journeyState }: { journeyState?: UserJourneyState }) {
  const { session, isLoggedIn, clearAuth, updateSession } = useAuth();
  const draftKey = session?.userId ?? "guest";
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    void apiFetch("/api/quota")
      .then((res) => res.json())
      .then((data) => setQuota(data as QuotaInfo))
      .catch(() => undefined);
  }, [isLoggedIn]);

  if (!isLoggedIn || !session) {
    return (
      <section className="page account-page">
        <Seo title="账户中心 | AI 求职台" description="管理你的账号、通知与数据。" />
        <div className="account-card">
          <h1 className="account-title">账户</h1>
          <p className="account-hint">{isLoggedIn ? "正在同步账户信息..." : "请先登录以管理账户"}</p>
          <button type="button" className="account-btn" onClick={() => navigateTo("/auth/login")}>
            {isLoggedIn ? "返回首页" : "去登录"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <AccountWorkspace
      key={draftKey}
      journeyState={journeyState}
      quota={quota}
      session={session}
      clearAuth={clearAuth}
      updateSession={updateSession}
    />
  );
}

function AccountWorkspace({
  journeyState,
  quota,
  session,
  clearAuth,
  updateSession,
}: {
  journeyState?: UserJourneyState;
  quota: QuotaInfo | null;
  session: AuthSession;
  clearAuth: () => void;
  updateSession: (next: AuthSession | null) => void;
}) {
  const JOURNEY_LABELS: Record<UserJourneyState, string> = {
    guest: "访客",
    onboarding: "首次设置中",
    ready: "准备就绪",
    preparing: "面试准备中",
    interviewing: "面试练习中",
    reviewing: "复盘回顾中",
    returning: "复访用户",
  };

  const [message, setMessage] = useState<AccountMessage | null>(null);
  const [draft, setDraft] = useState<DraftState>({
    email: session.email ?? "",
    displayName: session.displayName ?? "",
    feedbackContact: session.email ?? "",
    prefs: {
      marketing: session.notificationPrefs?.marketing ?? true,
      product: session.notificationPrefs?.product ?? true,
      security: true,
    },
  });
  const [feedback, setFeedback] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState("other");
  const [exporting, setExporting] = useState(false);
  const [password, setPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [sendingVerify, setSendingVerify] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const pushMessage = (tone: "success" | "error", text: string) => setMessage({ tone, text });

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await apiFetch("/api/data/export", { method: "POST" });
      if (!res.ok) throw new Error("EXPORT_FAILED");
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
      pushMessage("success", "数据已导出");
    } catch {
      pushMessage("error", "导出失败，请稍后再试");
    } finally {
      setExporting(false);
    }
  };

  const submitFeedback = async () => {
    if (!feedback.trim()) return;
    try {
      const res = await apiFetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: feedbackCategory, content: feedback.trim(), contact: draft.feedbackContact.trim() || undefined }),
      });
      if (!res.ok) throw new Error("FEEDBACK_FAILED");
      setFeedback("");
      pushMessage("success", "反馈已提交，我们会尽快查看。");
    } catch {
      pushMessage("error", "反馈提交失败，请稍后重试");
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await apiFetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: draft.displayName.trim() || undefined,
          email: draft.email.trim() || undefined,
          password: password.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushMessage("error", data.error ?? "保存失败，请稍后再试");
        return;
      }
      const nextUser = data.user as Partial<AuthSession>;
      updateSession({
        ...session,
        displayName: nextUser.displayName ?? draft.displayName,
        email: nextUser.email ?? draft.email,
        emailVerifiedAt: nextUser.emailVerifiedAt ?? null,
        notificationPrefs: nextUser.notificationPrefs ?? session.notificationPrefs,
      });
      setPassword("");
      pushMessage("success", draft.email.trim() && draft.email.trim() !== session.email ? "账户信息已保存，验证邮件已重新发送。" : "账户信息已保存。");
    } catch {
      pushMessage("error", "网络异常，请稍后再试");
    } finally {
      setSavingProfile(false);
    }
  };

  const resendVerification = async () => {
    setSendingVerify(true);
    try {
      const res = await apiFetch("/api/auth/email/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: draft.email.trim() || undefined, displayName: draft.displayName.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushMessage("error", data.error ?? "发送失败，请稍后再试");
        return;
      }
      pushMessage("success", "验证邮件已发送，请检查你的收件箱。");
    } catch {
      pushMessage("error", "网络异常，请稍后再试");
    } finally {
      setSendingVerify(false);
    }
  };

  const saveNotificationPrefs = async () => {
    setSavingPrefs(true);
    try {
      const res = await apiFetch("/api/account/notification-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketing: draft.prefs.marketing, product: draft.prefs.product }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushMessage("error", data.error ?? "保存失败，请稍后重试");
        return;
      }
      updateSession({ ...session, notificationPrefs: data.notificationPrefs ?? draft.prefs });
      pushMessage("success", "通知偏好已保存。");
    } catch {
      pushMessage("error", "网络异常，请稍后重试");
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleDeleteData = async () => {
    if (!window.confirm("确认清空业务数据？岗位、面试记录、简历等内容将被永久删除，且无法恢复。")) return;
    try {
      const res = await apiFetch("/api/data/delete-request", { method: "POST" });
      if (!res.ok) throw new Error("DELETE_FAILED");
      pushMessage("success", "已清空你的业务数据。");
    } catch {
      pushMessage("error", "删除失败，请稍后再试");
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteText !== "DELETE") {
      pushMessage("error", "请输入 DELETE 以确认删除账号。");
      return;
    }
    setDeleting(true);
    try {
      const res = await apiFetch("/api/user", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationText: deleteText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushMessage("error", data.error ?? "删除失败，请稍后再试");
        return;
      }
      clearAuth();
      navigateTo("/auth/login", { replace: true });
    } catch {
      pushMessage("error", "网络异常，请稍后再试");
    } finally {
      setDeleting(false);
    }
  };

  const emailVerified = Boolean(session.emailVerifiedAt);
  const quotaSummary = quota ? getQuotaSummary(quota) : null;

  return (
    <section className="page account-page">
      <Seo title="账户中心 | AI 求职台" description="管理邮箱、通知偏好、反馈与账号安全。" />
      <h1 className="account-title">账户中心</h1>

      {message ? (
        <div className={`account-message ${message.tone === "error" ? "error" : ""}`}>
          {message.text}
          <button type="button" className="account-link" onClick={() => setMessage(null)}>关闭</button>
        </div>
      ) : null}

      <div className="account-grid">
        <div className="account-card">
          <h2 className="account-card-title">账户信息</h2>
          <label className="account-form-field">
            <span>昵称</span>
            <input className="account-input" value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} maxLength={32} />
          </label>
          <label className="account-form-field">
            <span>手机号</span>
            <input className="account-input" value={session.phone ? `${session.phone.slice(0, 3)}****${session.phone.slice(7)}` : "未绑定"} disabled />
          </label>
          <label className="account-form-field">
            <span>邮箱</span>
            <input className="account-input" type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" />
          </label>
          <label className="account-form-field">
            <span>新密码</span>
            <input className="account-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="不修改可留空，至少 8 位" />
          </label>
          <div className="account-inline-meta">
            <span className={`account-status-badge ${emailVerified ? "ok" : "warn"}`}>
              <Mail size={12} />
              {emailVerified ? "邮箱已验证" : session.email ? "邮箱未验证" : "未绑定邮箱"}
            </span>
            <span className="account-status-badge">
              <Shield size={12} />
              {JOURNEY_LABELS[journeyState || "guest"]}
            </span>
          </div>
          <div className="account-actions">
            <button type="button" className="account-btn" onClick={saveProfile} disabled={savingProfile}>
              {savingProfile ? "保存中..." : "保存账户信息"}
            </button>
            <button type="button" className="account-btn" onClick={resendVerification} disabled={sendingVerify || !draft.email.trim()}>
              {sendingVerify ? "发送中..." : "重新发送验证邮件"}
            </button>
          </div>
          <p className="account-card-hint">未验证邮箱不会阻止你练习，但会影响找回密码和安全通知。</p>
        </div>

        {quota ? (
          <div className="account-card">
            <h2 className="account-card-title">使用额度</h2>
            {quotaSummary ? (
              <div className="account-quota-big">
                <span className="account-quota-num">{quotaSummary.remaining}</span>
                <span className="account-quota-label">
                  {quota.features ? `${quotaSummary.label}剩余 / ${quotaSummary.limit} 次/天` : `${quotaSummary.label} / ${quotaSummary.limit} 次/天`}
                </span>
              </div>
            ) : null}
            {quota.features ? (
              <div className="account-quota-grid">
                {QUOTA_FEATURE_LABELS.map((item) => {
                  const value = quota.features?.[item.key];
                  if (!value) return null;
                  return (
                    <div className="account-quota-feature" key={item.key}>
                      <span>{item.label}</span>
                      <strong>{value.remaining}</strong>
                      <small>剩余 / {value.limit}</small>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <p className="account-card-hint">每日 0 点重置，当前仍是公开 MVP 免费额度。</p>
          </div>
        ) : null}

        <div className="account-card">
          <h2 className="account-card-title">通知设置</h2>
          <label className="account-checkbox-row">
            <input type="checkbox" checked={draft.prefs.product} onChange={(event) => setDraft((current) => ({ ...current, prefs: { ...current.prefs, product: event.target.checked } }))} />
            <span>
              <Bell size={14} />
              接收产品更新与提醒邮件
            </span>
          </label>
          <label className="account-checkbox-row">
            <input type="checkbox" checked={draft.prefs.marketing} onChange={(event) => setDraft((current) => ({ ...current, prefs: { ...current.prefs, marketing: event.target.checked } }))} />
            <span>
              <Bell size={14} />
              接收活动与欢迎类邮件
            </span>
          </label>
          <label className="account-checkbox-row disabled">
            <input type="checkbox" checked readOnly />
            <span>
              <Shield size={14} />
              安全通知默认开启，无法关闭
            </span>
          </label>
          <button type="button" className="account-btn" onClick={saveNotificationPrefs} disabled={savingPrefs}>
            {savingPrefs ? "保存中..." : "保存通知偏好"}
          </button>
        </div>

        <div className="account-card">
          <h2 className="account-card-title">数据与合规</h2>
          <div className="account-actions">
            <button type="button" className="account-btn" onClick={handleExport} disabled={exporting}>
              <Download size={14} />
              {exporting ? "导出中..." : "导出数据"}
            </button>
            <button type="button" className="account-btn" onClick={handleDeleteData}>
              清空业务数据
            </button>
          </div>
          <p className="account-card-hint">当前产品只使用必要 Cookie / 本地存储来保持登录状态和草稿缓存。</p>
          <p className="account-card-hint account-policy-links">
            <button type="button" className="account-link" onClick={() => navigateTo("/terms-of-service")}>用户协议</button>
            <span aria-hidden="true"> · </span>
            <button type="button" className="account-link" onClick={() => navigateTo("/privacy-policy")}>隐私政策</button>
            <span aria-hidden="true"> · </span>
            <button type="button" className="account-link" onClick={() => navigateTo("/help")}>帮助中心</button>
            <span aria-hidden="true"> · </span>
            <button type="button" className="account-link" onClick={() => navigateTo("/about")}>关于我们</button>
          </p>
        </div>

        <div className="account-card">
          <h2 className="account-card-title">反馈与支持</h2>
          <label className="account-form-field">
            <span>反馈分类</span>
            <select className="account-select" value={feedbackCategory} onChange={(event) => setFeedbackCategory(event.target.value)}>
              <option value="bug">Bug 报告</option>
              <option value="ai_quality">AI 质量</option>
              <option value="feature">功能建议</option>
              <option value="other">其他</option>
            </select>
          </label>
          <label className="account-form-field">
            <span>联系邮箱</span>
            <input className="account-input" type="email" value={draft.feedbackContact} onChange={(event) => setDraft((current) => ({ ...current, feedbackContact: event.target.value }))} placeholder="方便我们回访时联系你" />
          </label>
          <textarea
            className="account-textarea"
            rows={4}
            placeholder="请描述你遇到的问题、期待的改进或上下文信息..."
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
          />
          <div className="account-actions">
            <button type="button" className="account-btn" onClick={submitFeedback} disabled={!feedback.trim()}>
              <LifeBuoy size={14} />
              提交反馈
            </button>
            <button type="button" className="account-btn danger outline" onClick={() => { clearAuth(); navigateTo("/", { replace: true }); }}>
              退出登录
            </button>
          </div>
        </div>

        <div className="account-card danger-zone">
          <h2 className="account-card-title">危险操作</h2>
          <p className="account-card-hint">删除账号后，将同时清空会话和业务数据。请输入 `DELETE` 进行确认。</p>
          <label className="account-form-field">
            <span>确认文本</span>
            <input className="account-input danger" value={deleteText} onChange={(event) => setDeleteText(event.target.value)} placeholder="输入 DELETE" />
          </label>
          <button type="button" className="account-btn danger" onClick={handleDeleteAccount} disabled={deleting}>
            <Trash2 size={14} />
            {deleting ? "删除中..." : "删除账号"}
          </button>
        </div>
      </div>
    </section>
  );
}
