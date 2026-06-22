import { useState } from "react";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";
import { navigateTo } from "../../lib/router";

interface Step {
  key: string;
  title: string;
  field: string;
  placeholder?: string;
  options?: string[];
}

const STEPS: Step[] = [
  { key: "targetRole", title: "目标岗位", field: "targetRole", placeholder: "例如：产品经理、前端工程师..." },
  { key: "city", title: "目标城市", field: "city", placeholder: "例如：北京、上海、远程...", options: ["北京", "上海", "深圳", "杭州", "广州", "成都", "远程"] },
  { key: "experience", title: "工作经验", field: "experience", options: ["应届生", "1-3 年", "3-5 年", "5-10 年", "10 年以上"] },
  { key: "stage", title: "求职阶段", field: "stage", options: ["正在投递", "准备面试", "已有 Offer", "观望中"] },
  { key: "resume", title: "简历导入", field: "resumeText", placeholder: "粘贴简历文字或点击下方上传（支持 .docx / .pdf）" },
];

export function OnboardingPage() {
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const step = STEPS[stepIndex];
  if (!step) return null;

  const setValue = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const next = () => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((prev) => prev + 1);
    } else {
      void submitOnboarding();
    }
  };

  const prev = () => {
    if (stepIndex > 0) setStepIndex((prev) => prev - 1);
  };

  const submitOnboarding = async () => {
    try {
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
    } catch {
      // Best effort
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="onboarding-page">
        <div className="onboarding-card onboarding-done">
          <div className="onboarding-done-icon">
            <Check size={32} />
          </div>
          <h2 className="onboarding-done-title">准备就绪</h2>
          <p className="onboarding-done-text">
            现在可以创建你的第一个岗位，开始面试练习。
          </p>
          <button type="button" className="onboarding-done-btn" onClick={() => navigateTo("/", { replace: true })}>
            进入岗位台
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  const selectedOptions = step.options || [];
  const currentValue = values[step.key] || "";

  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        <div className="onboarding-progress">
          {STEPS.map((_, index) => (
            <div key={index} className={`onboarding-dot ${index <= stepIndex ? "active" : ""}`} />
          ))}
        </div>

        <h1 className="onboarding-step-title">{step.title}</h1>

        {selectedOptions.length > 0 ? (
          <div className="onboarding-options">
            {selectedOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`onboarding-option ${currentValue === opt ? "selected" : ""}`}
                onClick={() => setValue(step.key, currentValue === opt ? "" : opt)}
              >
                {opt}
                {currentValue === opt && <Check size={14} />}
              </button>
            ))}
          </div>
        ) : (
          <div className="onboarding-input-wrap">
            <textarea
              className="onboarding-textarea"
              placeholder={step.placeholder || ""}
              rows={step.key === "resumeText" ? 8 : 2}
              value={currentValue}
              onChange={(e) => setValue(step.key, e.target.value)}
            />
          </div>
        )}

        <div className="onboarding-actions">
          {stepIndex > 0 && (
            <button type="button" className="onboarding-btn secondary" onClick={prev}>
              <ArrowLeft size={16} />
              上一步
            </button>
          )}
          <button type="button" className="onboarding-btn primary" onClick={next}>
            {stepIndex < STEPS.length - 1 ? "下一步" : "开始使用"}
            <ArrowRight size={16} />
          </button>
        </div>

        <button type="button" className="onboarding-skip" onClick={() => setDone(true)}>
          跳过引导，直接开始
        </button>
      </div>
    </div>
  );
}
