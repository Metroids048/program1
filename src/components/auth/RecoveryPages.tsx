import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, MailCheck } from "lucide-react";
import { navigateTo } from "../../lib/router";
import { useAuth } from "../../lib/auth";
import { Seo } from "../system/Seo";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "发送失败，请稍后重试");
        return;
      }
      setMessage("如果该邮箱已验证，我们已经发送了重置链接。");
    } catch {
      setError("网络异常，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-page">
      <Seo title="忘记密码 | AI 求职台" description="通过已验证邮箱重置你的 AI 求职台密码。" />
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-logo" aria-hidden="true">
            <MailCheck size={24} />
          </span>
          <h1 className="auth-title">找回密码</h1>
          <p className="auth-subtitle">输入已验证邮箱，我们会发送一封带有效期的重置邮件。使用手机号注册的用户，请先在账户设置中验证邮箱以启用找回。</p>
        </div>
        <div className="auth-form">
          <label className="auth-field">
            <span className="auth-label">邮箱</span>
            <input className="auth-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          {message ? <p className="auth-success">{message}</p> : null}
          <button type="button" className="auth-submit" disabled={loading || !email.trim()} onClick={submit}>
            {loading ? "发送中..." : "发送重置邮件"}
            {!loading ? <ArrowRight size={16} /> : null}
          </button>
          <button type="button" className="auth-inline-link" onClick={() => navigateTo("/auth/login")}>
            <ArrowLeft size={14} />
            返回登录
          </button>
        </div>
      </div>
    </section>
  );
}

export function ResetPasswordPage({ token }: { token?: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const invalidToken = !token;

  const submit = async () => {
    if (password.length < 8) {
      setError("密码至少 8 位");
      return;
    }
    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "重置失败，请重新申请");
        return;
      }
      setMessage("密码已更新，即将跳转登录页...");
      window.setTimeout(() => navigateTo("/auth/login"), 1500);
    } catch {
      setError("网络异常，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-page">
      <Seo title="重置密码 | AI 求职台" description="设置新的账号密码，恢复你的 AI 求职台账户访问。" />
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-logo" aria-hidden="true">
            <CheckCircle2 size={24} />
          </span>
          <h1 className="auth-title">重置密码</h1>
          <p className="auth-subtitle">链接有效期为 1 小时，过期后请重新申请。</p>
        </div>
        <div className="auth-form">
          {invalidToken ? <p className="auth-error">当前链接无效，请重新发起找回密码。</p> : null}
          <label className="auth-field">
            <span className="auth-label">新密码</span>
            <input className="auth-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位，建议包含大小写与数字" />
          </label>
          <label className="auth-field">
            <span className="auth-label">确认密码</span>
            <input className="auth-input" type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="再次输入新密码" />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          {message ? <p className="auth-success">{message}</p> : null}
          <button type="button" className="auth-submit" disabled={loading || invalidToken} onClick={submit}>
            {loading ? "提交中..." : "确认重置"}
            {!loading ? <ArrowRight size={16} /> : null}
          </button>
          <button type="button" className="auth-inline-link" onClick={() => navigateTo("/auth/login")}>
            <ArrowLeft size={14} />
            返回登录
          </button>
        </div>
      </div>
    </section>
  );
}

export function VerifyEmailPage({ token }: { token?: string }) {
  const { session, updateSession } = useAuth();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const canVerify = useMemo(() => Boolean(token), [token]);

  const verify = async () => {
    if (!token) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/auth/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "验证失败，请重新发送验证邮件");
        return;
      }
      if (session) {
        updateSession({
          ...session,
          email: data.user?.email ?? session.email,
          emailVerifiedAt: data.user?.emailVerifiedAt ?? new Date().toISOString(),
          notificationPrefs: data.user?.notificationPrefs ?? session.notificationPrefs,
        });
      }
      setStatus("success");
      setMessage("邮箱验证成功，现在可以使用找回密码和通知能力了。");
    } catch {
      setStatus("error");
      setMessage("网络异常，请稍后重试");
    }
  };

  return (
    <section className="auth-page">
      <Seo title="验证邮箱 | AI 求职台" description="验证邮箱以启用密码找回、安全通知和账户完整能力。" />
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-logo" aria-hidden="true">
            <MailCheck size={24} />
          </span>
          <h1 className="auth-title">验证邮箱</h1>
          <p className="auth-subtitle">验证后可启用找回密码、邮件通知和更完整的账户保护。</p>
        </div>
        <div className="auth-form">
          {!canVerify ? <p className="auth-error">当前验证链接无效，请返回账户页重新发送。</p> : null}
          {message ? <p className={status === "success" ? "auth-success" : "auth-error"}>{message}</p> : null}
          <button type="button" className="auth-submit" disabled={!canVerify || status === "loading" || status === "success"} onClick={verify}>
            {status === "loading" ? "验证中..." : status === "success" ? "已验证" : "开始验证"}
            {status !== "loading" && status !== "success" ? <ArrowRight size={16} /> : null}
          </button>
          <button type="button" className="auth-inline-link" onClick={() => navigateTo(session ? "/account" : "/auth/login")}>
            <ArrowLeft size={14} />
            {session ? "返回账户设置" : "返回登录"}
          </button>
        </div>
      </div>
    </section>
  );
}
