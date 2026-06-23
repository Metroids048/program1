import { useState } from "react";
import { BriefcaseBusiness, ArrowRight } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { navigateTo } from "../../lib/router";
import { migrateGuestDataToServer } from "../../lib/store";
import { Seo } from "../system/Seo";

type Mode = "login" | "register";

export function AuthPage({ mode: initialMode, returnTo }: { mode: Mode; returnTo?: string }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuth();
  const resolvedReturnTo = returnTo || "/";

  const submit = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) { setError("请输入有效的手机号"); return; }
    if (!password || password.length < 8) { setError("请输入至少 8 位密码"); return; }

    setError("");
    setLoading(true);
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body: Record<string, string | boolean> = { phone, password };
      if (mode === "register") {
        if (!consentAccepted) {
          setError("请先同意用户协议与隐私政策");
          return;
        }
        if (displayName.trim()) body.displayName = displayName.trim();
        Object.assign(body, { consentAccepted });
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "PHONE_ALREADY_REGISTERED") setError("该手机号已注册，请直接登录");
        else if (data.error === "CONSENT_REQUIRED") setError("请先同意用户协议与隐私政策");
        else if (data.error === "INVALID_CREDENTIALS") setError("手机号或密码错误");
        else setError(data.error || "操作失败");
        return;
      }

      // Save session
      setAuth(data.user, data.tokens);

      // Migrate guest data
      if (data.tokens?.accessToken) {
        void migrateGuestDataToServer(data.tokens.accessToken);
      }

      navigateTo(resolvedReturnTo, { replace: true });
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
      <Seo
        title={mode === "register" ? "注册 | AI 求职台" : "登录 | AI 求职台"}
        description={mode === "register" ? "创建 AI 求职台账户，开始面试准备。" : "登录 AI 求职台，同步你的岗位、简历和练习记录。"}
      />
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-logo" aria-hidden="true">
            <BriefcaseBusiness size={24} />
          </span>
          <h1 className="auth-title">AI 求职台</h1>
          <p className="auth-subtitle">
            {mode === "register" ? "创建账户后即可继续当前操作" : "登录后继续你的面试准备与记录保存"}
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
            <span className="auth-label">密码</span>
            <input
              className="auth-input"
              type="password"
              placeholder="至少 8 位"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
            />
          </label>

          {mode === "register" && (
            <>
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

              <label className="auth-checkbox">
                <input type="checkbox" checked={consentAccepted} onChange={(e) => setConsentAccepted(e.target.checked)} />
                <span>
                  我已阅读并同意
                  <button type="button" className="auth-link inline" onClick={() => navigateTo("/terms-of-service")}>用户协议</button>
                  和
                  <button type="button" className="auth-link inline" onClick={() => navigateTo("/privacy-policy")}>隐私政策</button>
                </span>
              </label>
            </>
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
            登录后继续原操作
            <button type="button" className="auth-link" onClick={() => navigateTo(resolvedReturnTo, { replace: true })}>
              直接进入首页
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
