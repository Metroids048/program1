import { useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, Mic } from "lucide-react";
import { AppShell, type PrimaryRouteName } from "./components/appShell";
import { HomeDashboard } from "./components/home";
import { DEFAULT_CONFIG, type InterviewConfig, makeId, nowIso } from "./components/shared";
import { useAuth } from "./lib/auth";
import {
  fetchStateSnapshot,
  saveRecordOnServer,
  updatePositionMaterialsOnServer,
  updatePositionQuestionsOnServer,
  updateProfileOnServer,
  upsertPositionIntakeOnServer,
} from "./lib/apiClient";
import { repairAppState, repairText } from "./lib/copy";
import { buildInterviewReport, createInitialAppState, saveQuestionFromCueCard, toWorkspace } from "./lib/interviewEngine";
import { navigateTo, parseRoute } from "./lib/router";
import { clearCachedWorkspace, loadServerSnapshotCache, saveServerSnapshotCache } from "./lib/store";
import type {
  AnswerCueCard,
  AppState,
  CandidateProfile,
  ConversationMessage,
  EvidenceItem,
  InterviewAiMeta,
  InterviewQuestion,
  InterviewRecord,
  InterviewReport,
  MockMessage,
  MockTurn,
  Position,
  PositionIntakeFieldKey,
  PositionMaterial,
  SpeechMetrics,
  UserJourneyState,
} from "./types";
import { LiveAssistantDashboard, InterviewRoomView } from "./components/live";
import { AccountModal, RecordsView } from "./components/records";
import { AuthPage } from "./components/auth/AuthPage";
import { OnboardingPage } from "./components/onboarding/OnboardingPage";
import { GrowthPage } from "./components/growth/GrowthPage";
import { AccountPage } from "./components/account/AccountPage";
import { LegalPage } from "./components/legal/LegalPage";
import { JdWorkspace } from "./components/jd";
import { QuestionsWorkspace } from "./components/questions";
import { ResumeWorkspacePage } from "./components/resume";

type ServerSnapshot = {
  profile: CandidateProfile;
  positions: Position[];
  activePositionId: string;
  records: InterviewRecord[];
  journeyState?: UserJourneyState;
};

function toAppStateFromSnapshot(snapshot: ServerSnapshot, current?: AppState): AppState {
  const fallback = current ?? createInitialAppState();
  const positions = Array.isArray(snapshot.positions) ? snapshot.positions : [];
  const records = Array.isArray(snapshot.records) ? snapshot.records : [];
  const next = repairAppState({
    profile: snapshot.profile ?? fallback.profile,
    positions,
    activePositionId: positions.some((position) => position.id === snapshot.activePositionId)
      ? snapshot.activePositionId
      : positions[0]?.id ?? "",
    interviewRecords: records,
    activeRecordId:
      current?.interviewRecords.some((record) => records.some((nextRecord) => nextRecord.id === record.id && record.id === current.activeRecordId))
        ? current.activeRecordId
        : records[0]?.id ?? "",
    aiMode: true,
    journeyState: snapshot.journeyState ?? current?.journeyState ?? "guest",
  });
  return next;
}

function replacePosition(items: Position[], nextPosition: Position): Position[] {
  const exists = items.some((item) => item.id === nextPosition.id);
  return exists ? items.map((item) => (item.id === nextPosition.id ? nextPosition : item)) : [nextPosition, ...items];
}

function replaceRecord(items: InterviewRecord[], nextRecord: InterviewRecord): InterviewRecord[] {
  const exists = items.some((item) => item.id === nextRecord.id);
  return exists ? items.map((item) => (item.id === nextRecord.id ? nextRecord : item)) : [nextRecord, ...items];
}

export function App() {
  const { isLoggedIn, loading: authLoading } = useAuth();
  const [appState, setAppState] = useState<AppState>(() => {
    const state = repairAppState(loadServerSnapshotCache());
    if (typeof window === "undefined") return state;
    const initialRoute = parseRoute(window.location.pathname);
    return initialRoute.name === "recordDetail" ? repairAppState({ ...state, activeRecordId: initialRoute.recordId }) : state;
  });
  const [routePath, setRoutePath] = useState(() => {
    if (typeof window === "undefined") return "/";
    return parseRoute(window.location.pathname).name === "recordDetail" ? "/records" : window.location.pathname;
  });
  const [accountOpen, setAccountOpen] = useState(false);
  const [interviewConfig, setInterviewConfig] = useState<InterviewConfig>(DEFAULT_CONFIG);
  const redirectedRef = useRef(false);

  // Auth gate: redirect to login if accessing protected route while not logged in
  useEffect(() => {
    if (authLoading) return;
    const currentRoute = parseRoute(routePath);
    const publicRoutes = new Set(["authLogin", "authRegister", "legalTerms", "legalPrivacy"]);
    if (!isLoggedIn && !publicRoutes.has(currentRoute.name)) {
      if (redirectedRef.current) return;
      redirectedRef.current = true;
      navigateTo("/auth/login", { replace: true });
      setRoutePath("/auth/login");
      return;
    }
    // Onboarding gate: if journeyState is onboarding, only allow onboarding and auth/legal
    if (isLoggedIn && appState.journeyState === "onboarding" && currentRoute.name !== "onboarding" && !publicRoutes.has(currentRoute.name)) {
      if (redirectedRef.current) return;
      redirectedRef.current = true;
      navigateTo("/onboarding", { replace: true });
      setRoutePath("/onboarding");
    }
    redirectedRef.current = false;
  }, [isLoggedIn, authLoading, appState.journeyState, routePath]);

  // When user logs in, transition journeyState from guest to onboarding
  useEffect(() => {
    if (!authLoading && isLoggedIn && appState.journeyState === "guest") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAppState((current) => repairAppState({ ...current, journeyState: "onboarding" }));
    }
  }, [isLoggedIn, authLoading, appState.journeyState]);

  useEffect(() => {
    let active = true;
    void fetchStateSnapshot()
      .then((snapshot) => {
        if (!active) return;
        if (!snapshot?.profile || !Array.isArray(snapshot.positions) || !Array.isArray(snapshot.records)) return;
        setAppState((current) => {
          const next = toAppStateFromSnapshot(snapshot, current);
          saveServerSnapshotCache(next);
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    saveServerSnapshotCache(appState);
  }, [appState]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (parseRoute(window.location.pathname).name === "recordDetail") {
      window.history.replaceState({}, "", "/records");
    }
    const onPopState = () => {
      const nextRoute = parseRoute(window.location.pathname);
      if (nextRoute.name === "recordDetail") {
        setAppState((current) => repairAppState({ ...current, activeRecordId: nextRoute.recordId }));
        window.history.replaceState({}, "", "/records");
        setRoutePath("/records");
        return;
      }
      setRoutePath(window.location.pathname);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const { profile, positions, activePositionId, interviewRecords, activeRecordId } = appState;
  const activePosition = positions.find((position) => position.id === activePositionId) ?? positions[0];
  const activeWorkspace = activePosition ? toWorkspace(profile, activePosition) : null;
  const route = parseRoute(routePath);
  const activeNav: PrimaryRouteName =
    route.name === "recordDetail" ? "records" :
    route.name === "authLogin" || route.name === "authRegister" || route.name === "onboarding" || route.name === "legalTerms" || route.name === "legalPrivacy" ? "home" :
    route.name === "growth" ? "growth" :
    route.name === "account" ? "account" :
    route.name;
  const routeRecordId = route.name === "recordDetail" ? route.recordId : "";
  const selectedRecordId = routeRecordId || activeRecordId;

  const openRoute = (path: string, options?: { replace?: boolean }) => {
    navigateTo(path, options);
    setRoutePath(path);
  };

  const patchState = (updater: (current: AppState) => AppState) => {
    setAppState((current) => repairAppState(updater(current)));
  };

  const syncSnapshot = (snapshot: ServerSnapshot) => {
    setAppState((current) => toAppStateFromSnapshot(snapshot, current));
  };

  const createOrUpdatePosition = (jobText: string, options?: { positionId?: string; confirmedFields?: Array<{ key: string; value: string; source?: string }>; messages?: Array<{ role: "assistant" | "user"; text: string }> }) => {
    const trimmed = jobText.trim();
    if (!trimmed) return;
    void upsertPositionIntakeOnServer({
      positionId: options?.positionId,
      rawJdText: trimmed,
      inferredFields: [],
      confirmedFields: (options?.confirmedFields ?? []).map((item) => ({
        key: item.key as PositionIntakeFieldKey,
        value: item.value,
        source: "confirmed",
      })),
      messages: options?.messages,
    })
      .then((snapshot) => syncSnapshot(snapshot))
      .catch(() => undefined);
  };

  const updateProfile = (next: { resumeText: string; evidenceLibrary: EvidenceItem[]; highlights: string[] }) => {
    void updateProfileOnServer(next)
      .then((snapshot) => syncSnapshot(snapshot))
      .catch(() => undefined);
  };

  const renameProfile = (displayName: string) => {
    void updateProfileOnServer({
      displayName,
      resumeText: profile.resumeText,
      evidenceLibrary: profile.evidenceLibrary,
      highlights: profile.highlights,
    })
      .then((snapshot) => syncSnapshot(snapshot))
      .catch(() => {
        patchState((current) => ({ ...current, profile: { ...current.profile, displayName } }));
      });
  };

  const updateResume = (resumeText: string) => {
    const hasExistingResume = profile.resumeText.trim().length > 0;
    void updateProfileOnServer({
      resumeText,
      evidenceLibrary: profile.evidenceLibrary,
      highlights: profile.highlights,
    })
      .then((snapshot) => syncSnapshot(snapshot))
      .catch(() => {
        patchState((current) => ({
          ...current,
          profile: {
            ...current.profile,
            resumeText,
          },
        }));
      });
    // Auto-write growth task on first resume import
    if (!hasExistingResume && resumeText.trim().length > 0) {
      void fetch("/api/growth/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "import_resume",
          source: "resume",
          sourceId: "manual",
          title: "首次导入简历",
        }),
      }).catch(() => undefined);
    }
  };

  const updateEvidence = (items: EvidenceItem[]) => {
    updateProfile({
      resumeText: profile.resumeText,
      evidenceLibrary: items,
      highlights: profile.highlights,
    });
  };

  const updateHighlights = (highlights: string[]) => {
    updateProfile({
      resumeText: profile.resumeText,
      evidenceLibrary: profile.evidenceLibrary,
      highlights,
    });
  };

  const updateQuestion = (questionId: string, patch: Partial<InterviewQuestion>) => {
    if (!activePosition) return;
    const nextQuestions = activePosition.questions.map((question) =>
      question.id === questionId ? { ...question, ...patch, lastReviewedAt: nowIso() } : question,
    );
    void updatePositionQuestionsOnServer(activePosition.id, nextQuestions)
      .then(({ position }) => {
        patchState((current) => ({
          ...current,
          positions: replacePosition(current.positions, position),
        }));
      })
      .catch(() => undefined);
  };

  const addQuestion = (payload: Pick<InterviewQuestion, "question" | "category" | "difficulty"> & { answer?: string; notes?: string }) => {
    if (!activePosition) return;
    const question: InterviewQuestion = {
      id: makeId("q-manual"),
      category: repairText(payload.category),
      question: repairText(payload.question),
      difficulty: repairText(payload.difficulty),
      reason: "用户手动保存的问题，用于当前岗位的资料底座和后续回答上下文。",
      evidenceIds: [],
      source: "manual",
      priority: true,
      notes: repairText(payload.notes),
      answer: repairText(payload.answer),
      cueCardIds: [],
      lastReviewedAt: nowIso(),
      tags: ["用户保存"],
    };
    void updatePositionQuestionsOnServer(activePosition.id, [question, ...activePosition.questions])
      .then(({ position }) => {
        patchState((current) => ({
          ...current,
          positions: replacePosition(current.positions, position),
        }));
      })
      .catch(() => undefined);
  };

  const addQuestionFromCueCard = (card: AnswerCueCard) => {
    if (!activePosition) return;
    const question = saveQuestionFromCueCard(card);
    void updatePositionQuestionsOnServer(activePosition.id, [question, ...activePosition.questions])
      .then(({ position }) => {
        patchState((current) => ({
          ...current,
          positions: replacePosition(current.positions, position),
        }));
      })
      .catch(() => undefined);
  };

  const updateMaterials = (materials: PositionMaterial[]) => {
    if (!activePosition) return;
    void updatePositionMaterialsOnServer(activePosition.id, materials)
      .then(({ position }) => {
        patchState((current) => ({
          ...current,
          positions: replacePosition(current.positions, position),
        }));
      })
      .catch(() => undefined);
  };

  const saveInterviewRecord = (payload: {
    mode: "live" | "mock";
    title: string;
    transcript: MockMessage[];
    cueCards: AnswerCueCard[];
    serverRecordId?: string;
    turn?: MockTurn;
    speechMetrics?: SpeechMetrics[];
    report?: InterviewReport;
    conversationHistory?: ConversationMessage[];
    aiMeta?: InterviewAiMeta;
  }) => {
    if (!activePosition) return;
    const turns = payload.turn
      ? [...activePosition.mockTurns.filter((item) => item.questionId !== payload.turn?.questionId), payload.turn]
      : activePosition.mockTurns;
    const report = payload.report ?? buildInterviewReport(turns, activePosition.questions, activePosition.matchReport);
    const baseRecord = payload.serverRecordId ? interviewRecords.find((item) => item.id === payload.serverRecordId) : undefined;
    const record: InterviewRecord = {
      ...(baseRecord ?? {}),
      id: baseRecord?.id ?? makeId("record"),
      positionId: activePosition.id,
      mode: payload.mode,
      title: payload.title,
      createdAt: baseRecord?.createdAt ?? nowIso(),
      transcript: payload.transcript,
      cueCards: payload.cueCards,
      questionIds: Array.from(new Set(payload.cueCards.flatMap((card) => [card.id, ...card.evidenceIds]))),
      speechMetrics: payload.speechMetrics ?? (payload.turn?.speechMetrics ? [payload.turn.speechMetrics] : []),
      report,
      summary: payload.report?.summary ?? `${payload.mode === "live" ? "实时助手" : "模拟面试"}记录已保存，生成 ${payload.cueCards.length} 张提词卡。`,
      conversationHistory: payload.conversationHistory ?? baseRecord?.conversationHistory,
      aiMeta: payload.aiMeta ?? baseRecord?.aiMeta,
    };

    patchState((current) => ({
      ...current,
      activeRecordId: record.id,
      interviewRecords: replaceRecord(current.interviewRecords, record),
      positions: current.positions.map((position) =>
        position.id === activePosition.id ? { ...position, mockTurns: turns, report, updatedAt: nowIso() } : position,
      ),
    }));

    void saveRecordOnServer(record)
      .then((response) => {
        patchState((current) => ({
          ...current,
          activeRecordId: response.record?.id ?? record.id,
          interviewRecords: Array.isArray(response.records) && response.records.length > 0 ? response.records : current.interviewRecords,
        }));
      })
      .catch(() => undefined);
    // Auto-write growth task
    void fetch("/api/growth/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: payload.mode === "live" ? "cue_card" : "mock_session",
        source: "record",
        sourceId: record.id,
        title: record.title,
      }),
    }).catch(() => undefined);
    openRoute("/records");
  };

  const clearAll = () => {
    clearCachedWorkspace();
    setAppState(repairAppState(createInitialAppState()));
    openRoute("/", { replace: true });
    setAccountOpen(false);
  };

  const startConfiguredMock = (config = interviewConfig) => {
    setInterviewConfig(config);
    openRoute("/mock");
  };

  return (
    <AppShell
      activeNav={activeNav}
      accountName={profile.displayName || "候选人"}
      isLoggedIn={isLoggedIn}
      onNavigate={(nav) => {
        if (nav === "home") openRoute("/");
        if (nav === "live") openRoute("/live");
        if (nav === "mock") openRoute("/mock");
        if (nav === "jd") openRoute("/jd");
        if (nav === "questions") openRoute("/questions");
        if (nav === "resume") openRoute("/resume");
        if (nav === "records") openRoute("/records");
        if (nav === "growth") openRoute("/growth");
        if (nav === "account") openRoute("/account");
      }}
      onAccount={() => setAccountOpen(true)}
    >
      {(route.name === "authLogin" || route.name === "authRegister") && (
        <AuthPage mode={route.name === "authLogin" ? "login" : "register"} />
      )}

      {route.name === "onboarding" && <OnboardingPage onComplete={(position) => {
        if (position) {
          patchState((current) => ({
            ...current,
            journeyState: "ready",
            positions: current.positions.some((p) => p.id === position.id) ? current.positions : [position, ...current.positions],
            activePositionId: current.activePositionId || position.id,
          }));
        } else {
          patchState((current) => ({ ...current, journeyState: "ready" }));
        }
      }} />}

      {route.name === "growth" && <GrowthPage />}

      {route.name === "account" && <AccountPage journeyState={appState.journeyState} />}

      {route.name === "legalTerms" && <LegalPage type="terms" />}

      {route.name === "legalPrivacy" && <LegalPage type="privacy" />}

      {route.name === "home" && (
        <HomeDashboard
          workspace={activeWorkspace}
          positions={positions}
          activePositionId={activePositionId}
          onSubmitJd={createOrUpdatePosition}
          onSelectPosition={(positionId) => patchState((current) => ({ ...current, activePositionId: positionId }))}
          onOpenMock={startConfiguredMock}
        />
      )}

      {route.name === "live" && (activeWorkspace && activePosition ? (
        <LiveAssistantDashboard
          workspace={activeWorkspace}
          profile={profile}
          position={activePosition}
          onSaveRecord={saveInterviewRecord}
          onSaveQuestion={addQuestionFromCueCard}
        />
      ) : (
        <section className="page"><div className="empty-card"><div className="empty-card-icon"><BriefcaseBusiness size={20} /></div><h2>还没有岗位卡</h2><p>先在首页粘贴 JD 创建岗位，再进入实时助手。</p><button className="button primary" type="button" onClick={() => openRoute("/")}>去岗位台</button></div></section>
      ))}

      {route.name === "mock" && (activeWorkspace && activePosition ? (
        <InterviewRoomView
          workspace={activeWorkspace}
          profile={profile}
          position={activePosition}
          onSaveRecord={saveInterviewRecord}
          onSaveQuestion={addQuestionFromCueCard}
          config={interviewConfig}
        />
      ) : (
        <section className="page"><div className="empty-card"><div className="empty-card-icon"><Mic size={20} /></div><h2>还没有岗位卡</h2><p>先在首页粘贴 JD 创建岗位，再进入模拟面试。</p><button className="button primary" type="button" onClick={() => openRoute("/")}>去岗位台</button></div></section>
      ))}

      {route.name === "jd" && (
        <JdWorkspace
          workspace={activeWorkspace}
          profile={profile}
          position={activePosition}
          records={interviewRecords}
          onSubmitJd={createOrUpdatePosition}
          onCreateQuestions={(items) => items.forEach((item) => addQuestion(item))}
        />
      )}

      {route.name === "questions" && (
        <QuestionsWorkspace
          workspace={activeWorkspace}
          position={activePosition}
          onUpdateMaterials={updateMaterials}
          onUpdateQuestion={updateQuestion}
          onAddQuestion={addQuestion}
        />
      )}

      {route.name === "resume" && (
        <ResumeWorkspacePage
          profile={profile}
          position={activePosition}
          onUpdateResume={updateResume}
          onUpdateEvidence={updateEvidence}
          onSetHighlights={updateHighlights}
          onOpenJd={() => openRoute("/jd")}
        />
      )}

      {(route.name === "records" || route.name === "recordDetail") && (
        <RecordsView
          records={interviewRecords}
          positions={positions}
          activeRecordId={selectedRecordId}
          onOpen={(id) => {
            patchState((current) => ({ ...current, activeRecordId: id }));
            openRoute("/records");
          }}
          onMock={() => startConfiguredMock()}
          onOpenQuestions={() => openRoute("/questions")}
          onOpenResume={() => openRoute("/resume")}
          onOpenJd={() => openRoute("/jd")}
        />
      )}

      {accountOpen && (
        <AccountModal
          state={appState}
          onClose={() => setAccountOpen(false)}
          onImport={(next) => {
            setAppState(repairAppState(next));
            setAccountOpen(false);
          }}
          onRename={renameProfile}
          onClear={clearAll}
        />
      )}
    </AppShell>
  );
}
