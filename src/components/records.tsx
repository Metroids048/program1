import { type ChangeEvent, useMemo, useState } from "react";
import { Check, Download, Filter, Timer, Trash2, Upload, Volume2 } from "lucide-react";
import { exportFromServer, importToServer } from "../lib/apiClient";
import { repairText } from "../lib/copy";
import { parseImportedState, serializeAppState } from "../lib/store";
import type { AppState, InterviewRecord, Position } from "../types";
import { AiStatusBadge, EmptyState, MetricCard, MetricGrid } from "./shared";

type RecordsFilterMode = "all" | "live" | "mock";

function formatRecordTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRecordTitle(record: InterviewRecord, positions: Position[]) {
  const position = positions.find((item) => item.id === record.positionId);
  return position ? `${repairText(position.company)} · ${repairText(position.title)}` : repairText(record.title);
}

export function RecordsView({
  records,
  positions,
  activeRecordId,
  onOpen,
  onMock,
  onOpenQuestions,
  onOpenResume,
  onOpenJd,
  onSaveNote,
}: {
  records: InterviewRecord[];
  positions: Position[];
  activeRecordId?: string;
  onOpen: (id: string) => void;
  onMock: () => void;
  onOpenQuestions: () => void;
  onOpenResume: () => void;
  onOpenJd: () => void;
  onSaveNote?: (recordId: string, questionText: string) => void;
}) {
  const [mode, setMode] = useState<RecordsFilterMode>("all");
  const [positionId, setPositionId] = useState("all");

  const filtered = useMemo(
    () =>
      records.filter((record) => {
        if (mode !== "all" && record.mode !== mode) return false;
        if (positionId !== "all" && record.positionId !== positionId) return false;
        return true;
      }),
    [mode, positionId, records],
  );

  const activeRecord = filtered.find((record) => record.id === activeRecordId) ?? filtered[0];
  const activePosition = positions.find((item) => item.id === activeRecord?.positionId);
  const liveRecords = filtered.filter((record) => record.mode === "live");
  const mockRecords = filtered.filter((record) => record.mode === "mock");

  const renderRecord = (record: InterviewRecord) => (
    <button
      key={record.id}
      type="button"
      className={`records-rail-item ${record.mode} ${activeRecord?.id === record.id ? "selected" : ""}`}
      onClick={() => onOpen(record.id)}
    >
      <strong>{getRecordTitle(record, positions)}</strong>
      <span>{formatRecordTime(record.createdAt)} · {record.transcript.filter((item) => item.role === "interviewer").length} 题</span>
    </button>
  );

  return (
    <section className="page page-records desktop-page records-single-page">
      <aside className="records-rail">
        <div className="records-filter-compact">
          <span>
            <Filter size={14} />
            筛选
          </span>
          <select className="input compact-select" aria-label="按模式筛选" value={mode} onChange={(event) => setMode(event.target.value as RecordsFilterMode)}>
            <option value="all">全部</option>
            <option value="live">实时</option>
            <option value="mock">模拟</option>
          </select>
          <select className="input compact-select" aria-label="按岗位筛选" value={positionId} onChange={(event) => setPositionId(event.target.value)}>
            <option value="all">全部岗位</option>
            {positions.map((position) => (
              <option key={position.id} value={position.id}>
                {repairText(position.company)} · {repairText(position.title)}
              </option>
            ))}
          </select>
        </div>

        <section>
          <h2>实时助手记录</h2>
          {liveRecords.length ? liveRecords.map(renderRecord) : <p className="records-rail-empty">暂无记录</p>}
        </section>
        <section>
          <h2>模拟练习记录</h2>
          {mockRecords.length ? mockRecords.map(renderRecord) : <p className="records-rail-empty">暂无记录</p>}
        </section>
      </aside>

      <section className="records-report-pane">
        {activeRecord ? (
          <RecordReportContent record={activeRecord} position={activePosition} onMock={onMock} onOpenQuestions={onOpenQuestions} onOpenResume={onOpenResume} onOpenJd={onOpenJd} onSaveNote={onSaveNote} />
        ) : (
          <div className="records-empty-shell">
            <EmptyState title="还没有面试记录" detail="完成一次实时助手或模拟练习后自动保存。" />
            <button className="button primary" type="button" onClick={onMock}>
              去模拟练习
            </button>
          </div>
        )}
      </section>
    </section>
  );
}

export function RecordReportView({
  record,
  position,
  onMock,
  onOpenQuestions,
  onOpenResume,
  onOpenJd,
  onSaveNote,
}: {
  record?: InterviewRecord;
  position?: Position;
  onMock: () => void;
  onOpenQuestions: () => void;
  onOpenResume: () => void;
  onOpenJd: () => void;
  onSaveNote?: (recordId: string, questionText: string) => void;
}) {
  if (!record) {
    return (
      <section className="page page-record-detail desktop-page">
        <div className="empty-card compact">
          <EmptyState title="还没有可查看的复盘报告" detail="先完成一次实时助手或模拟面试，再回来查看详情。" />
        </div>
      </section>
    );
  }

  return (
    <section className="page page-record-detail desktop-page">
      <RecordReportContent record={record} position={position} onMock={onMock} onOpenQuestions={onOpenQuestions} onOpenResume={onOpenResume} onOpenJd={onOpenJd} onSaveNote={onSaveNote} />
    </section>
  );
}

function RecordReportContent({
  record,
  position,
  onMock,
  onOpenQuestions,
  onOpenResume,
  onOpenJd,
  onSaveNote,
}: {
  record: InterviewRecord;
  position?: Position;
  onMock: () => void;
  onOpenQuestions: () => void;
  onOpenResume: () => void;
  onOpenJd: () => void;
  onSaveNote?: (recordId: string, questionText: string) => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const pace = record.speechMetrics[0]?.charsPerMinute ?? 0;
  const fillers = record.speechMetrics.reduce((sum, item) => sum + item.fillerCount, 0);
  const interviewerTurns = record.transcript.filter((item) => item.role === "interviewer");
  const improvementPoints = record.report.improvementPoints?.length ? record.report.improvementPoints : record.report.nextActions;
  const evidenceCount = new Set(record.cueCards.flatMap((card) => card.evidenceIds)).size;
  const hitRate = record.cueCards.length ? `${Math.round((evidenceCount / Math.max(1, record.cueCards.length)) * 100)}%` : "--";

  return (
    <>
      <header className="desktop-page-header record-report-header">
        <div className="desktop-page-title">
          <span className="page-eyebrow">{record.mode === "live" ? "实时助手" : "模拟练习"} · {formatRecordTime(record.createdAt)}</span>
          <h1>{position ? `${repairText(position.company)} · ${repairText(position.title)}` : repairText(record.title)}</h1>
        </div>
        <div className="record-report-actions">
          <AiStatusBadge status={record.aiMeta?.backendStatus === "success" || record.report.source === "model" ? "success" : "fallback"} />
          <button className="button secondary compact-button" type="button" onClick={onMock}>
            再练一次
          </button>
        </div>
      </header>

      <MetricGrid
        items={[
          { label: "处理题数", value: String(interviewerTurns.length) },
          { label: "平均语速", value: pace ? `${pace}` : "--" },
          { label: "证据命中率", value: hitRate, tone: "green" },
          { label: "追问次数", value: String(Math.max(0, interviewerTurns.length - 1)) },
        ]}
      />

      {position && position.materials.length > 0 ? (
        <section className="surface-card record-hit-materials">
          <div className="surface-card-inner">
            <div className="section-row-header">
              <div>
                <span className="subtle-label">资料命中</span>
                <h2>本次面试涉及的知识资产</h2>
                <p>这些项目资料和笔记在面试中被引用或关联。</p>
              </div>
            </div>
            <div className="material-card-grid">
              {position.materials.slice(0, 4).map((m) => (
                <article key={m.id} className="material-card">
                  <h3>{m.title}</h3>
                  <p>{m.summary.slice(0, 80)}</p>
                  {m.usageScopes && m.usageScopes.length > 0 ? (
                    <div className="material-keywords">
                      {m.usageScopes.map((s) => (
                        <span key={s}>{s === "live" ? "实时助手" : s === "mock" ? "模拟面试" : "简历优化"}</span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="record-report-grid">
        <section className="surface-card">
          <div className="surface-card-inner">
            <div className="section-row-header">
              <div>
                <span className="subtle-label">题目回顾</span>
                <h2>本次面试时间轴</h2>
              </div>
            </div>
            <div className="record-timeline">
              {interviewerTurns.map((message, index) => (
                <details key={`${message.text}-${index}`} className="timeline-item">
                  <summary>
                    <span>#{index + 1}</span>
                    <strong>{repairText(message.text).slice(0, 28)}</strong>
                    <small>{record.cueCards[index] ? "提词卡已用" : "未生成卡"}</small>
                  </summary>
                  <p>{repairText(record.transcript[index * 2 + 1]?.text ?? "暂无候选人回答记录。")}</p>
                  {record.cueCards[index] ? <small>{repairText(record.cueCards[index].openingLine)}</small> : null}
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="surface-card">
          <div className="surface-card-inner">
            <div className="section-row-header">
              <div>
                <span className="subtle-label">改进建议</span>
                <h2>下一步练习重点</h2>
              </div>
            </div>
            <div className="summary-copy">
              <p>{repairText(record.summary)}</p>
              <ul className="simple-list">
                {improvementPoints.slice(0, showMore ? improvementPoints.length : 3).map((item, index) => (
                  <li key={`${item}-${index}`}>
                    <Check size={14} />
                    {repairText(item)}
                  </li>
                ))}
              </ul>
              {improvementPoints.length > 3 ? (
                <button className="button ghost compact-button" type="button" onClick={() => setShowMore((current) => !current)}>
                  {showMore ? "收起改进点" : "展开改进点"}
                </button>
              ) : null}
              <div className="record-next-actions">
                {onSaveNote ? (
                  <button
                    className="button primary compact-button"
                    type="button"
                    onClick={() => {
                      const firstQuestion = interviewerTurns[0];
                      if (firstQuestion) onSaveNote(record.id, firstQuestion.text);
                    }}
                  >
                    一键沉淀为问题笔记
                  </button>
                ) : null}
                <button className="button secondary compact-button" type="button" onClick={onOpenQuestions}>
                  去资料库沉淀问题
                </button>
                <button className="button secondary compact-button" type="button" onClick={onOpenResume}>
                  去简历补证据
                </button>
                <button className="button secondary compact-button" type="button" onClick={onOpenJd}>
                  去 JD 分析看差距
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="surface-card record-pace-card">
          <div className="surface-card-inner">
            <div className="section-row-header">
              <div>
                <span className="subtle-label">表达指标</span>
                <h2>节奏与填充词</h2>
              </div>
            </div>
            <div className="metrics-grid compact">
              <MetricCard label="平均语速" value={String(pace)} suffix="字 / 分钟" detail="根据本次转写文本估算。" icon={Timer} />
              <MetricCard label="口头填充词" value={String(fillers)} suffix="次" detail="统计“嗯”“啊”“那个”等口头填充。" icon={Volume2} />
            </div>
          </div>
        </section>

        <section className="surface-card transcript-panel">
          <button className="transcript-toggle" type="button" onClick={() => setShowTranscript((current) => !current)}>
            {showTranscript ? "收起完整 Transcript" : "查看完整 Transcript ›"}
          </button>
          {showTranscript ? (
            <div className="surface-card-inner">
              <h2>Transcript</h2>
              <div className="record-transcript-list">
                {record.transcript.map((message, index) => (
                  <article key={`${message.role}-${index}`} className={`record-transcript-item ${message.role}`}>
                    <span>{message.role === "interviewer" ? "面试官" : "候选人"}</span>
                    <p>{repairText(message.text)}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <span className="transcript-label">Transcript</span>
          )}
        </section>
      </div>
    </>
  );
}

export function AccountModal({
  state,
  onClose,
  onImport,
  onRename,
  onClear,
}: {
  state: AppState;
  onClose: () => void;
  onImport: (next: AppState) => void;
  onRename: (name: string) => void;
  onClear: () => void;
}) {
  const [message, setMessage] = useState<{ tone: "success" | "error" | "warn"; text: string } | null>(null);

  const exportData = async () => {
    let exported = serializeAppState(state);
    try {
      exported = JSON.stringify(await exportFromServer(), null, 2);
    } catch {
      // Keep local fallback.
    }
    const blob = new Blob([exported], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "interview-workbench-backup.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setMessage({ tone: "success", text: "已导出全部数据。" });
  };

  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = parseImportedState(await file.text());
      try {
        const result = await importToServer(imported);
        onImport(result.state);
        if (result.status === "partial") {
          setMessage({ tone: "warn", text: result.warnings[0] ? `已导入备份，但有调整：${result.warnings[0]}` : "已导入备份，但部分当前指针已自动修正。" });
        } else {
          setMessage({ tone: "success", text: "已导入备份，且服务端状态同步成功。" });
        }
      } catch {
        setMessage({ tone: "error", text: "导入失败：服务端未完成同步，已取消本地覆盖。" });
      }
    } catch {
      setMessage({ tone: "error", text: "导入失败：不是有效的备份 JSON。" });
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="drawer-panel narrow" role="dialog" aria-modal="true" aria-label="账户与数据" onClick={(event) => event.stopPropagation()}>
        <header className="drawer-header">
          <div>
            <span className="page-eyebrow">账户面板</span>
            <h2>账户与导入导出</h2>
          </div>
          <button className="button ghost" type="button" onClick={onClose}>
            关闭
          </button>
        </header>

        <label className="field-label" htmlFor="display-name">显示名称</label>
        <input
          id="display-name"
          className="input"
          defaultValue={repairText(state.profile.displayName)}
          onBlur={(event) => onRename(event.target.value.trim() || "候选人")}
        />

        <div className="account-stats">
          <article><span>岗位</span><strong>{state.positions.length}</strong></article>
          <article><span>记录</span><strong>{state.interviewRecords.length}</strong></article>
          <article><span>证据</span><strong>{state.profile.evidenceLibrary.length}</strong></article>
        </div>

        <div className="drawer-actions stacked">
          <button className="button secondary" type="button" onClick={exportData}>
            <Download size={16} />
            导出数据
          </button>
          <label className="button secondary file-button">
            <Upload size={16} />
            导入备份
            <input type="file" accept=".json,application/json" aria-label="导入备份文件" onChange={importData} />
          </label>
          <button className="button danger" type="button" onClick={onClear}>
            <Trash2 size={16} />
            清除本地数据
          </button>
        </div>

        {message ? <div className={message.tone === "error" ? "inline-message error" : message.tone === "warn" ? "inline-message warn" : "inline-message success"}>{message.text}</div> : null}
      </aside>
    </div>
  );
}
