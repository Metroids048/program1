import { useState } from "react";
import { BriefcaseBusiness, ArrowRight } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { navigateTo } from "../../lib/router";
import { migrateGuestDataToServer } from "../../lib/store";

type Mode = "login" | "register";

export function AuthPage({ mode: initialMode }: { mode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuth();

  const startCountdown = () => {
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const sendSms = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) { setError("请输入有效的手机号"); return; }
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/auth/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) { setError("发送失败，请稍后再试"); return; }
      startCountdown();
    } catch {
      setError("网络错误，请检查连接");
    } finally {
      setSending(false);
    }
  };

  const submit = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) { setError("请输入有效的手机号"); return; }
    if (!smsCode || smsCode.length !== 6) { setError("请输入6位验证码"); return; }

    setError("");
    setLoading(true);
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body: Record<string, string> = { phone, smsCode };
      if (mode === "register" && displayName.trim()) body.displayName = displayName.trim();

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "PHONE_ALREADY_REGISTERED") setError("该手机号已注册，请直接登录");
        else if (data.error === "SMS_CODE_INVALID") setError("验证码错误或已过期");
        else if (data.error === "INVALID_CREDENTIALS") setError("账号或验证码错误");
        else setError(data.error || "操作失败");
        return;
      }

      // Save session
      setAuth(data.user, data.tokens);

      // Migrate guest data
      if (data.tokens?.accessToken) {
        void migrateGuestDataToServer(data.tokens.accessToken);
      }

      // Navigate to onboarding or home
      navigateTo("/onboarding", { replace: true });
    } catch {
      setError("网络错误，请检查连接");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-logo" aria-hidden="true">
            <BriefcaseBusiness size={24} />
          </span>
          <h1 className="auth-title">AI 求职台</h1>
          <p className="auth-subtitle">
            {mode === "register" ? "创建账户，开始面试准备" : "登录以同步你的练习数据"}
          </p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => switchMode("login")}
          >
            登录
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === "register" ? "active" : ""}`}
            onClick={() => switchMode("register")}
          >
            注册
          </button>
        </div>

        <div className="auth-form">
          <label className="auth-field">
            <span className="auth-label">手机号</span>
            <input
              className="auth-input"
              type="tel"
              maxLength={11}
              placeholder="请输入手机号"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setError(""); }}
            />
          </label>

          <label className="auth-field">
            <span className="auth-label">验证码</span>
            <div className="auth-sms-row">
              <input
                className="auth-input"
                type="text"
                maxLength={6}
                placeholder="6位验证码"
                value={smsCode}
                onChange={(e) => { setSmsCode(e.target.value); setError(""); }}
              />
              <button
                type="button"
                className="auth-sms-btn"
                disabled={countdown > 0 || sending}
                onClick={sendSms}
              >
                {countdown > 0 ? `${countdown}s` : sending ? "发送中" : "获取验证码"}
              </button>
            </div>
          </label>

          {mode === "register" && (
            <label className="auth-field">
              <span className="auth-label">昵称 <span className="auth-optional">(选填)</span></span>
              <input
                className="auth-input"
                type="text"
                maxLength={32}
                placeholder="你的称呼"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
          )}

          {error && <p className="auth-error">{error}</p>}

          <button
            type="button"
            className="auth-submit"
            disabled={loading}
            onClick={submit}
          >
            {loading ? "处理中..." : mode === "register" ? "注册并开始使用" : "登录"}
            {!loading && <ArrowRight size={16} />}
          </button>

          <p className="auth-footer-text">
            游客模式可体验 3 次 AI 调用
            <button type="button" className="auth-link" onClick={() => navigateTo("/", { replace: true })}>
              直接进入首页
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
