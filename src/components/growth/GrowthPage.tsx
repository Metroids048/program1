import { useEffect, useState } from "react";
import { Calendar, Flame, Target } from "lucide-react";

interface GrowthTask {
  type: string;
  completedAt: string;
}

const TASK_LABELS: Record<string, string> = {
  mock_session: "完成一次模拟面试",
  cue_card: "生成一张提词卡",
  review_questions: "复习 3 道问题",
  daily_login: "今日签到",
};

export function GrowthPage() {
  const [tasks, setTasks] = useState<GrowthTask[]>([]);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    void fetch("/api/growth/tasks")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { tasks: GrowthTask[]; streak: number } | null) => {
        if (data) {
          setTasks(data.tasks);
          setStreak(data.streak);
        }
      })
      .catch(() => undefined);
  }, []);

  const todayTasks = tasks.filter((t) => {
    const d = new Date(t.completedAt);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });

  const allTaskTypes = Object.keys(TASK_LABELS);
  const completedTypes = new Set(todayTasks.map((t) => t.type));

  return (
    <section className="page growth-page">
      <header className="growth-header">
        <h1 className="growth-title">成长</h1>
        <div className="growth-streak">
          <Flame size={20} />
          <span>{streak > 0 ? `连续 ${streak} 天` : "今天开始吧"}</span>
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
              return (
                <li key={type} className={`growth-task ${done ? "done" : ""}`}>
                  <span className={`growth-task-dot ${done ? "done" : ""}`} />
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
          <p className="growth-card-hint">
            坚持每天练习，提升面试表现。连续练习天数越多，你的表达和临场应变会越稳定。
          </p>
        </div>
      </div>
    </section>
  );
}
