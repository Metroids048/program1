import { useEffect, useMemo, useRef, useState } from "react";
import { BriefcaseBusiness, Mic } from "lucide-react";
import { AppShell, type PrimaryRouteName } from "./components/appShell";
import { HomeDashboard } from "./components/home";
import { DEFAULT_CONFIG, type InterviewConfig, makeId, nowIso } from "./components/shared";
import { useAuth } from "./lib/auth";
import {
  createMockSessionOnServer,
  fetchStateSnapshot,
  saveRecordOnServer,
  updatePositionMaterialsOnServer,
  updatePositionQuestionsOnServer,
  updateProfileOnServer,
  upsertPositionIntakeOnServer,
} from "./lib/apiClient";
import { apiFetch } from "./lib/authClient";
import { repairAppState, repairText } from "./lib/copy";
import { buildInterviewReport, createInitialAppState, saveQuestionFromCueCard, toWorkspace } from "./lib/interviewEngine";
import { navigateTo, parseRoute } from "./lib/router";
import { clearCachedWorkspace, loadServerSnapshotCache, normalizeImportedState, saveServerSnapshotCache } from "./lib/store";
import type {
  AnswerCueCard,
  AppState,
  CandidateProfile,
  ConversationMessage,
  ConversationSession,
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
import { JobsPage } from "./components/jobs";
import { ConversationPage } from "./components/conversation";
import { MockSetupPage } from "./components/mock-setup";
import { AccountModal, RecordsView } from "./components/records";
import { AuthPage } from "./components/auth/AuthPage";
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "./components/auth/RecoveryPages";
import { OnboardingPage } from "./components/onboarding/OnboardingPage";
import { AccountPage } from "./components/account/AccountPage";
import { LegalPage } from "./components/legal/LegalPage";
import { JdWorkspace } from "./components/jd";
import { QuestionsWorkspace } from "./components/questions";
import { ResumeWorkspacePage } from "./components/resume";
import { NotFoundPage, ServerErrorPage } from "./components/system/StatusPages";
import { Seo } from "./components/system/Seo";
import { AuthGateModal } from "./components/auth/AuthGate";

type ServerSnapshot = {
  profile: CandidateProfile;
  positions: Position[];
  activePositionId: string;
  records: InterviewRecord[];
  journeyState?: UserJourneyState;
};

function toAppStateFromSnapshot(snapshot: ServerSnapshot, current?: AppState): AppState {
  const fallback = current ?? createInitialAppState();
  const normalized = normalizeImportedState({
    profile: snapshot.profile ?? fallback.profile,
    positions: Array.isArray(snapshot.positions) ? snapshot.positions : [],
    activePositionId: Array.isArray(snapshot.positions) && snapshot.positions.some((position) => position.id === snapshot.activePositionId)
      ? snapshot.activePositionId
      : (Array.isArray(snapshot.positions) ? snapshot.positions[0]?.id : "") ?? "",
    interviewRecords: Array.isArray(snapshot.records) ? snapshot.records : [],
    activeRecordId:
      current?.interviewRecords.some((record) => (Array.isArray(snapshot.records) ? snapshot.records : []).some((nextRecord) => nextRecord.id === record.id && record.id === current.activeRecordId))
        ? current.activeRecordId
        : (Array.isArray(snapshot.records) ? snapshot.records[0]?.id : "") ?? "",
    aiMode: true,
    journeyState: snapshot.journeyState ?? current?.journeyState ?? "guest",
  });
  return repairAppState(normalized);
}

function replacePosition(items: Position[], nextPosition: Position): Position[] {
  const exists = items.some((item) => item.id === nextPosition.id);
  return exists ? items.map((item) => (item.id === nextPosition.id ? nextPosition : item)) : [nextPosition, ...items];
}

function replaceRecord(items: InterviewRecord[], nextRecord: InterviewRecord): InterviewRecord[] {
  const exists = items.some((item) => item.id === nextRecord.id);
  return exists ? items.map((item) => (item.id === nextRecord.id ? nextRecord : item)) : [nextRecord, ...items];
}

function toConversationSessionFromPosition(position: Position): ConversationSession | null {
  const intake = position.intake;
  if (!intake?.sessionId) return null;
  return {
    id: intake.sessionId,
    linkedPositionId: position.id,
    status: intake.reviewStatus === "confirmed" ? "saved" : "draft",
    messages: intake.messages,
    extractedFields: [...intake.inferredFields, ...intake.confirmedFields],
    jdDraft: position.jobText || intake.rawJdText,
    configDraft: {
      interviewerRole: position.interviewPreferences.interviewerRole,
      difficulty: position.interviewPreferences.difficulty,
      style: position.interviewPreferences.style,
      durationMinutes: 90,
      questionCount: Math.max(3, Math.min(8, position.questions.length || 8)),
    },
    updatedAt: position.updatedAt,
  };
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
  const [snapshotHydrated, setSnapshotHydrated] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [loginGatePath, setLoginGatePath] = useState<string | null>(null);
  const [interviewConfig, setInterviewConfig] = useState<InterviewConfig>(DEFAULT_CONFIG);
  const [pendingMockRoute, setPendingMockRoute] = useState<{
    routeSessionId: string;
    serverSessionId: string;
    positionId: string;
    config: InterviewConfig;
    question: string;
    questionSource?: string;
    conversationHistory: ConversationMessage[];
    backendStatus: "success" | "fallback" | "error";
    fallbackReason?: string;
  } | null>(null);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (authLoading || !snapshotHydrated) return;
    const currentRoute = parseRoute(routePath);
    const publicRoutes = new Set(["home", "jobs", "authLogin", "authRegister", "forgotPassword", "resetPassword", "verifyEmail", "legalTerms", "legalPrivacy", "termsOfService", "privacyPolicy", "notFound", "serverError"]);
    if (isLoggedIn && appState.journeyState === "onboarding" && currentRoute.name !== "onboarding" && !publicRoutes.has(currentRoute.name)) {
      if (redirectedRef.current) return;
      redirectedRef.current = true;
      navigateTo("/onboarding", { replace: true });
      setRoutePath("/onboarding");
      return;
    }
    redirectedRef.current = false;
  }, [isLoggedIn, authLoading, appState.journeyState, routePath, snapshotHydrated]);

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
        setSnapshotHydrated(true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setSnapshotHydrated(true);
      });
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
  const effectiveJourneyState =
    !authLoading &&
    snapshotHydrated &&
    isLoggedIn &&
    appState.journeyState === "guest" &&
    appState.positions.length === 0 &&
    appState.interviewRecords.length === 0 &&
    !appState.profile.resumeText.trim()
      ? "ready"
      : appState.journeyState;
  const conversationSessions = useMemo(
    () =>
      appState.positions
        .map((position) => toConversationSessionFromPosition(position))
        .filter((item): item is ConversationSession => Boolean(item)),
    [appState.positions],
  );
  const activePosition = positions.find((position) => position.id === activePositionId) ?? positions[0];
  const activeWorkspace = activePosition ? toWorkspace(profile, activePosition) : null;
  const route = parseRoute(routePath);
  const activeNav: PrimaryRouteName =
    route.name === "recordDetail" ? "records" :
    route.name === "livePosition" ? "live" :
    route.name === "mockSetup" || route.name === "mockRoom" || route.name === "mock" ? "mock" :
    route.name === "positionDetail" || route.name === "jobs" || route.name === "conversation" ? "home" :
    route.name === "authLogin" || route.name === "authRegister" || route.name === "forgotPassword" || route.name === "resetPassword" || route.name === "verifyEmail" || route.name === "onboarding" || route.name === "legalTerms" || route.name === "legalPrivacy" || route.name === "termsOfService" || route.name === "privacyPolicy" || route.name === "notFound" || route.name === "serverError" ? "home" :
    route.name === "account" ? "account" :
    route.name;
  const routeRecordId = route.name === "recordDetail" ? route.recordId : "";
  const selectedRecordId = routeRecordId || activeRecordId;
  const routePositionId =
    route.name === "livePosition" || route.name === "mockSetup" || route.name === "positionDetail"
      ? route.positionId
      : "";
  const routeConversationId = route.name === "conversation" ? route.sessionId : "";
  const resolvedPosition = routePositionId ? (positions.find((position) => position.id === routePositionId) ?? activePosition) : activePosition;
  const activeConversation = routeConversationId ? conversationSessions.find((session) => session.id === routeConversationId) : undefined;
  const pendingMockSession = route.name === "mockRoom" && pendingMockRoute?.routeSessionId === route.sessionId ? pendingMockRoute : null;

  const openRoute = (path: string, options?: { replace?: boolean }) => {
    navigateTo(path, options);
    if (typeof window === "undefined") {
      setRoutePath(path);
      return;
    }
    setRoutePath(new URL(path, window.location.origin).pathname);
  };

  const requireLoginFor = (path: string) => {
    if (isLoggedIn) {
      openRoute(path);
      return;
    }
    setLoginGatePath(path);
  };

  const patchState = (updater: (current: AppState) => AppState) => {
    setAppState((current) => repairAppState(updater(current)));
  };

  const syncSnapshot = (snapshot: ServerSnapshot) => {
    setAppState((current) => toAppStateFromSnapshot(snapshot, current));
  };

  const selectPosition = (positionId: string) => {
    patchState((current) => ({
      ...current,
      activePositionId: current.positions.some((position) => position.id === positionId) ? positionId : current.activePositionId,
    }));
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

  const addQuestion = (payload: Pick<InterviewQuestion, "question" | "category" | "difficulty"> & { answer?: string; notes?: string; tags?: string[] }) => {
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
      tags: Array.from(new Set(["用户保存", ...(payload.tags ?? []).map((item) => repairText(item)).filter(Boolean)])),
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
    const positionForQuestion = resolvedPosition ?? activePosition;
    if (!positionForQuestion) return;
    const question = saveQuestionFromCueCard(card);
    void updatePositionQuestionsOnServer(positionForQuestion.id, [question, ...positionForQuestion.questions])
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
    const positionForRecord = resolvedPosition ?? activePosition;
    if (!positionForRecord) return;
    const turns = payload.turn
      ? [...positionForRecord.mockTurns.filter((item) => item.questionId !== payload.turn?.questionId), payload.turn]
      : positionForRecord.mockTurns;
    const report = payload.report ?? buildInterviewReport(turns, positionForRecord.questions, positionForRecord.matchReport);
    const baseRecord = payload.serverRecordId ? interviewRecords.find((item) => item.id === payload.serverRecordId) : undefined;
    const record: InterviewRecord = {
      ...(baseRecord ?? {}),
      id: baseRecord?.id ?? makeId("record"),
      positionId: positionForRecord.id,
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
        position.id === positionForRecord.id ? { ...position, mockTurns: turns, report, updatedAt: nowIso() } : position,
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
    openRoute("/records");
  };

  const clearAll = () => {
    clearCachedWorkspace();
    setAppState(repairAppState(createInitialAppState()));
    setPendingMockRoute(null);
    openRoute("/", { replace: true });
    setAccountOpen(false);
  };

  const startMockFromSetup = (config: InterviewConfig) => {
    const positionForMock = resolvedPosition ?? activePosition;
    if (!positionForMock) return;
    selectPosition(positionForMock.id);
    patchState((current) => ({
      ...current,
      positions: current.positions.map((position) =>
        position.id === positionForMock.id
          ? {
              ...position,
              interviewPreferences: {
                ...position.interviewPreferences,
                interviewerRole: config.interviewerRole,
                difficulty: config.difficulty,
                interviewerGender: config.interviewerGender,
                submitMode: config.submitMode,
                style: config.style,
              },
              intake: {
                ...position.intake,
                configuredInterview: true,
              },
              status: position.status === "practiced" ? position.status : "configured",
              updatedAt: nowIso(),
            }
          : position,
      ),
    }));
    void createMockSessionOnServer(positionForMock.id, config as unknown as Record<string, unknown>)
      .then((result) => {
        const routeSessionId = makeId("mock-route");
        setInterviewConfig(config);
        setPendingMockRoute({
          routeSessionId,
          serverSessionId: result.sessionId,
          positionId: positionForMock.id,
          config,
          question: result.question,
          questionSource: result.questionSource,
          conversationHistory: result.conversationHistory ?? [],
          backendStatus: result.backendStatus ?? "fallback",
          fallbackReason: result.meta?.fallbackReason,
        });
        openRoute(`/mock/room/${routeSessionId}`);
      })
      .catch(() => {
        setInterviewConfig(config);
        setPendingMockRoute(null);
        openRoute("/mock");
      });
  };

  const startConfiguredMock = (config = interviewConfig) => {
    setInterviewConfig(config);
    if (activePosition && (activePosition.intake?.configuredInterview || activePosition.status === "configured" || activePosition.status === "practiced")) {
      openRoute(`/mock/room/${activePosition.id}`);
      return;
    }
    openRoute("/mock");
  };

  const positionForRoute = resolvedPosition;
  const workspaceForRoute = positionForRoute ? toWorkspace(profile, positionForRoute) : null;

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
        if (nav === "account") openRoute("/account");
      }}
      onAccount={() => setAccountOpen(true)}
      onFeedback={() => setFeedbackOpen(true)}
    >
      <Seo title="AI 求职台" description="围绕真实 JD、简历和面试记录，完成从准备到复盘的 AI 面试闭环。" />

      {(route.name === "authLogin" || route.name === "authRegister") && (
        <AuthPage mode={route.name === "authLogin" ? "login" : "register"} returnTo={route.returnTo} />
      )}

      {route.name === "forgotPassword" && <ForgotPasswordPage />}

      {route.name === "resetPassword" && <ResetPasswordPage token={route.token} />}

      {route.name === "verifyEmail" && <VerifyEmailPage token={route.token} />}

      {route.name === "onboarding" && <OnboardingPage onComplete={(position) => {
        if (position) {
          patchState((current) => ({
            ...current,
            journeyState: "ready",
            positions: current.positions.some((item) => item.id === position.id) ? current.positions : [position, ...current.positions],
            activePositionId: current.activePositionId || position.id,
          }));
        } else {
          patchState((current) => ({ ...current, journeyState: "ready" }));
        }
      }} />}

      {route.name === "account" && <AccountPage journeyState={effectiveJourneyState} />}

      {route.name === "legalTerms" && <LegalPage type="terms" />}

      {route.name === "legalPrivacy" && <LegalPage type="privacy" />}

      {route.name === "termsOfService" && <LegalPage type="terms" />}

      {route.name === "privacyPolicy" && <LegalPage type="privacy" />}

      {route.name === "notFound" && <NotFoundPage />}

      {route.name === "serverError" && <ServerErrorPage />}

      {route.name === "home" && (
        <HomeDashboard
          positions={positions}
          activePositionId={activePositionId}
          onSubmitJd={createOrUpdatePosition}
          onOpenMock={startConfiguredMock}
          onOpenLive={() => openRoute("/live")}
          onRequireLogin={requireLoginFor}
          isLoggedIn={isLoggedIn}
        />
      )}

      {(route.name === "jobs" || route.name === "positionDetail") && (
        <JobsPage
          positions={positions}
          activePositionId={activePositionId}
          onSubmitJd={createOrUpdatePosition}
          onSelectPosition={selectPosition}
        />
      )}

      {route.name === "conversation" && (
        activeConversation ? (
          <ConversationPage
            session={activeConversation}
            position={positionForRoute}
            onGoMock={() => {
              if (!activeConversation.linkedPositionId) return;
              const linkedPosition = positions.find((position) => position.id === activeConversation.linkedPositionId);
              selectPosition(activeConversation.linkedPositionId);
              openRoute(
                linkedPosition?.intake?.configuredInterview || linkedPosition?.status === "configured" || linkedPosition?.status === "practiced"
                  ? `/mock/room/${activeConversation.linkedPositionId}`
                  : `/mock/setup/${activeConversation.linkedPositionId}`,
              );
            }}
          />
        ) : (
          <section className="page"><div className="empty-card"><div className="empty-card-icon"><BriefcaseBusiness size={20} /></div><h2>岗位对话草稿暂未同步</h2><p>当前对话会话不存在或尚未生成，你可以先回到岗位台继续整理当前岗位。</p><button className="button primary" type="button" onClick={() => openRoute("/jobs")}>回到岗位台</button></div></section>
        )
      )}

      {(route.name === "live" || route.name === "livePosition") && (workspaceForRoute && positionForRoute ? (
        <LiveAssistantDashboard
          workspace={workspaceForRoute}
          profile={profile}
          position={positionForRoute}
          onSaveRecord={saveInterviewRecord}
          onSaveQuestion={addQuestionFromCueCard}
          isLoggedIn={isLoggedIn}
          onRequireLogin={() => requireLoginFor(route.name === "livePosition" ? `/live/${positionForRoute.id}` : "/live")}
        />
      ) : (
        <section className="page"><div className="empty-card"><div className="empty-card-icon"><BriefcaseBusiness size={20} /></div><h2>还没有岗位卡</h2><p>先在首页粘贴 JD 创建岗位，再进入实时助手。</p><button className="button primary" type="button" onClick={() => openRoute("/")}>去岗位台</button></div></section>
      ))}

      {route.name === "mockSetup" && positionForRoute && (
        <MockSetupPage
          position={positionForRoute}
          onStart={startMockFromSetup}
        />
      )}

      {(route.name === "mock" || route.name === "mockRoom") && (workspaceForRoute && positionForRoute ? (
        <InterviewRoomView
          workspace={workspaceForRoute}
          profile={profile}
          position={positionForRoute}
          onSaveRecord={saveInterviewRecord}
          onSaveQuestion={addQuestionFromCueCard}
          config={interviewConfig}
          initialSession={pendingMockSession ? {
            sessionId: pendingMockSession.serverSessionId,
            question: pendingMockSession.question,
            questionSource: pendingMockSession.questionSource,
            conversationHistory: pendingMockSession.conversationHistory,
            backendStatus: pendingMockSession.backendStatus,
            fallbackReason: pendingMockSession.fallbackReason,
          } : undefined}
          skipSetup={route.name === "mockRoom"}
          isLoggedIn={isLoggedIn}
          onRequireLogin={() => requireLoginFor(route.name === "mockRoom" ? `/mock/room/${route.sessionId}` : "/mock")}
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
          isLoggedIn={isLoggedIn}
          onRequireLogin={() => requireLoginFor("/jd")}
        />
      )}

      {route.name === "questions" && (
        <QuestionsWorkspace
          workspace={activeWorkspace}
          position={activePosition}
          onUpdateMaterials={updateMaterials}
          onUpdateQuestion={updateQuestion}
          onAddQuestion={addQuestion}
          isLoggedIn={isLoggedIn}
          onRequireLogin={() => requireLoginFor("/questions")}
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
          isLoggedIn={isLoggedIn}
          onRequireLogin={() => requireLoginFor("/resume")}
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
          onMock={() => {
            if (!isLoggedIn) {
              requireLoginFor("/mock");
              return;
            }
            startConfiguredMock();
          }}
          onOpenQuestions={() => openRoute("/questions")}
          onOpenResume={() => openRoute("/resume")}
          onOpenJd={() => openRoute("/jd")}
        />
      )}

      {loginGatePath ? (
        <AuthGateModal
          returnTo={loginGatePath}
          onClose={() => setLoginGatePath(null)}
        />
      ) : null}

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

      {feedbackOpen && (
        <div className="drawer-backdrop" role="presentation" onClick={() => setFeedbackOpen(false)}>
          <section className="dialog-panel compact-dialog" role="dialog" aria-modal="true" aria-label="提交反馈" onClick={(event) => event.stopPropagation()}>
            <h2>提交反馈</h2>
            <p className="dialog-copy">告诉我们你遇到的问题、想要的功能，或任何让你想离开的卡点。</p>
            <GlobalFeedbackForm onClose={() => setFeedbackOpen(false)} />
          </section>
        </div>
      )}
    </AppShell>
  );
}

function GlobalFeedbackForm({ onClose }: { onClose: () => void }) {
  const { session } = useAuth();
  const [category, setCategory] = useState("other");
  const [contact, setContact] = useState(session?.email ?? "");
  const [content, setContent] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");

  const submit = async () => {
    if (!content.trim()) return;
    setState("saving");
    try {
      const res = await apiFetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, contact: contact.trim() || undefined, content: content.trim() }),
      });
      if (!res.ok) throw new Error("FAILED");
      setState("success");
      setTimeout(() => {
        onClose();
      }, 400);
    } catch {
      setState("error");
    }
  };

  return (
    <div className="drawer-form">
      <label className="auth-field">
        <span className="auth-label">反馈分类</span>
        <select className="account-select" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="bug">Bug 报告</option>
          <option value="ai_quality">AI 质量</option>
          <option value="feature">功能建议</option>
          <option value="other">其他</option>
        </select>
      </label>
      <label className="auth-field">
        <span className="auth-label">联系邮箱</span>
        <input className="auth-input" type="email" value={contact} onChange={(event) => setContact(event.target.value)} placeholder="方便回访时联系你" />
      </label>
      <label className="auth-field">
        <span className="auth-label">问题描述</span>
        <textarea className="account-textarea" rows={5} value={content} onChange={(event) => setContent(event.target.value)} placeholder="遇到了什么问题？你期望看到什么行为？" />
      </label>
      {state === "success" ? <p className="auth-success">反馈已发送，谢谢你帮我们把产品做得更好。</p> : null}
      {state === "error" ? <p className="auth-error">提交失败，请稍后重试。</p> : null}
      <div className="drawer-actions">
        <button type="button" className="button secondary" onClick={onClose}>取消</button>
        <button type="button" className="button primary" onClick={submit} disabled={state === "saving" || !content.trim()}>
          {state === "saving" ? "提交中..." : "提交反馈"}
        </button>
      </div>
    </div>
  );
}
