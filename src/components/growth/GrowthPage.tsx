import { useEffect, useState } from "react";
import { Calendar, Flame, Target, Play, RefreshCw } from "lucide-react";

interface GrowthTask {
  type: string;
  completedAt: string;
}

interface GrowthData {
  tasks: GrowthTask[];
  streak: number;
  recentDays: string[];
}

const TASK_LABELS: Record<string, string> = {
  mock_session: "完成一次模拟面试",
  cue_card: "生成一张提词卡",
  review_questions: "复习 3 道问题",
  resume_optimize: "优化一次简历",
  daily_login: "今日签到",
  import_resume: "导入简历",
  intake_jd: "录入岗位 JD",
};

const TASK_ICONS: Record<string, typeof Target> = {
  mock_session: Play,
  cue_card: Target,
  review_questions: RefreshCw,
  resume_optimize: Target,
  daily_login: Calendar,
  import_resume: Target,
  intake_jd: Target,
};

export function GrowthPage() {
  const [data, setData] = useState<GrowthData>({ tasks: [], streak: 0, recentDays: [] });
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");

  const fetchTasks = () => {
    void fetch("/api/growth/tasks")
      .then((res) => (res.ok ? res.json() : null))
      .then((d: GrowthData | null) => {
        if (d) setData(d);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const todayTasks = data.tasks.filter((t) => {
    const d = new Date(t.completedAt);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });

  const allTaskTypes = ["mock_session", "cue_card", "review_questions", "resume_optimize"];
  const completedTypes = new Set(todayTasks.map((t) => t.type));

  // Last 7 days calendar
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const activeDays = new Set(data.recentDays);

  const generateReview = async () => {
    setGenerating(true);
    setMessage("");
    try {
      const res = await fetch("/api/growth/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "review_questions",
          source: "growth",
          sourceId: "manual",
          title: "从成长页手动生成的复习任务",
        }),
      });
      if (res.ok) {
        setMessage("已生成复习任务，去问题库开始复习吧！");
        fetchTasks();
      }
    } catch {
      setMessage("生成失败，请稍后再试");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="page growth-page">
      <header className="growth-header">
        <h1 className="growth-title">成长</h1>
        <div className="growth-streak">
          <Flame size={20} />
          <span>{data.streak > 0 ? `连续 ${data.streak} 天` : "今天开始吧"}</span>
        </div>
      </header>

      <div className="growth-grid">
        <div className="growth-card">
          <div className="growth-card-header">
            <Calendar size={16} />
            <span>今日任务</span>
          </div>
          <ul className="growth-task-list">
            {allTaskTypes.map((type) => {
              const done = completedTypes.has(type);
              const Icon = TASK_ICONS[type] || Target;
              return (
                <li key={type} className={`growth-task ${done ? "done" : ""}`}>
                  <span className={`growth-task-dot ${done ? "done" : ""}`}>
                    <Icon size={12} />
                  </span>
                  <span className="growth-task-label">{TASK_LABELS[type] || type}</span>
                  {done && <span className="growth-task-check">完成</span>}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="growth-card">
          <div className="growth-card-header">
            <Target size={16} />
            <span>练习日历</span>
          </div>
          <div className="growth-calendar">
            {last7Days.map((day) => {
              const active = activeDays.has(day);
              const isToday = day === new Date().toISOString().slice(0, 10);
              return (
                <div
                  key={day}
                  className={`growth-calendar-day ${active ? "active" : ""} ${isToday ? "today" : ""}`}
                  title={day}
                >
                  <span>{day.slice(5)}</span>
                </div>
              );
            })}
          </div>
          <p className="growth-card-hint">
            坚持每天练习，提升面试表现。连续练习天数越多，你的表达和临场应变会越稳定。
          </p>
        </div>

        <div className="growth-card">
          <div className="growth-card-header">
            <Play size={16} />
            <span>快速动作</span>
          </div>
          <div className="growth-actions">
            <button
              type="button"
              className="growth-action-btn"
              onClick={generateReview}
              disabled={generating}
            >
              <RefreshCw size={14} />
              {generating ? "生成中..." : "生成复习任务"}
            </button>
            <p className="growth-action-hint">
              基于你的最近练习记录，自动生成复习题并加入问题库。
            </p>
          </div>
          {message && <p className="growth-message">{message}</p>}
        </div>
      </div>
    </section>
  );
}
