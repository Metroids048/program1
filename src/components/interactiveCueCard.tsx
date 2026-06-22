import { useState, useCallback } from "react";
import type { AnswerCueCard } from "../types";
import type { AiRunMeta } from "../lib/apiClient";
import { Panel, EvidenceTrace } from "./shared";

type FeedbackType = "contradict" | "impatient" | "deep-dive";

const FEEDBACK_OPTIONS: { key: FeedbackType; label: string }[] = [
  { key: "contradict", label: "面试官表现质疑" },
  { key: "impatient", label: "面试官不耐烦" },
  { key: "deep-dive", label: "需要技术深挖" },
];

export function InteractiveCueCard({
  card,
  meta,
  onSaveQuestion,
  onReconstruct,
}: {
  card?: AnswerCueCard;
  meta?: AiRunMeta | null;
  onSaveQuestion: (card: AnswerCueCard) => void;
  onReconstruct: (feedback: FeedbackType, currentCard: AnswerCueCard) => void;
}) {
  const [checkedBullets, setCheckedBullets] = useState<Set<number>>(new Set());
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackType | null>(null);
  const [isReconstructing, setIsReconstructing] = useState(false);

  const toggleBullet = useCallback((index: number) => {
    setCheckedBullets((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleReconstruct = useCallback(
    (feedback: FeedbackType) => {
      if (!card || isReconstructing) return;
      setSelectedFeedback(feedback);
      setIsReconstructing(true);
      onReconstruct(feedback, card);
    },
    [card, isReconstructing, onReconstruct],
  );

  if (!card) {
    return <Panel title="题词卡片"><div className="empty-state" role="status"><strong>等待问题</strong><p>输入、听取或点击题词卡后，这里会给出回答框架、证据和风险提醒。</p></div></Panel>;
  }

  const status = meta?.backendStatus ?? "fallback";

  return (
    <Panel title="题词卡片">
      <article className="cue-card">
        <span>{card.source === "live" ? "实时问题" : "模拟问题"} · {status === "success" ? "模型生成" : "本地练习"}</span>
        <h2>{card.questionText}</h2>
        <p className="opening-line">{card.openingLine}</p>
        {meta?.fallbackReason && <div className="inline-message">{meta.fallbackReason}</div>}
        {status !== "success" ? <div className="inline-message warn">这张卡片当前处于练习模式，回答前请手动核对事实与数字。</div> : null}
        {meta?.evidenceTrace?.length ? <EvidenceTrace trace={meta.evidenceTrace} /> : null}
        <strong>回答策略</strong>
        <p>{card.strategy}</p>
        <strong>要点</strong>
        <ul className="cue-bullets-checkable">
          {card.bullets.map((item, i) => (
            <li key={i} className={`cue-bullet${checkedBullets.has(i) ? " checked" : ""}`} onClick={() => toggleBullet(i)}>
              <span className="cue-checkbox">{checkedBullets.has(i) ? "✓" : ""}</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <strong>风险提醒</strong>
        <ul>{card.risks.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
        <strong>可能追问</strong>
        <ul>{card.followUps.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>

        <div className="cue-feedback-bar">
          <span>调整建议</span>
          <div className="cue-feedback-actions">
            {FEEDBACK_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`button text-button${selectedFeedback === opt.key ? " active" : ""}`}
                onClick={() => handleReconstruct(opt.key)}
                disabled={isReconstructing}
              >
                {isReconstructing && selectedFeedback === opt.key ? "重构中..." : opt.label}
              </button>
            ))}
          </div>
        </div>

        <button className="button secondary" onClick={() => onSaveQuestion(card)}>记录到面试资料</button>
      </article>
    </Panel>
  );
}
