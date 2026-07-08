import { useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, Mic } from "lucide-react";
import { AppShell, type PrimaryRouteName } from "./components/appShell";
import { HomeDashboard, AuthLandingPage, MockPositionListPage, MockSetupPage, PositionConversationPage, PositionDetailPage } from "./components/positions";
import { DEFAULT_CONFIG, type InterviewConfig, makeId, nowIso } from "./components/shared";
import { useAuth } from "./lib/auth";
import {
  completeMockSessionOnServer,
  deletePositionOnServer,
  fetchStateSnapshot,
  getLatestMockSessionOnServer,
  saveRecordOnServer,
  updatePositionMaterialsOnServer,
  updatePositionPreferencesOnServer,
  updatePositionQuestionsOnServer,
  updateProfileOnServer,
  upsertPositionIntakeOnServer,
} from "./lib/apiClient";
import { apiFetch } from "./lib/authClient";
import { repairAppState, repairText } from "./lib/copy";
import { buildInterviewReport, createInitialAppState, saveQuestionFromCueCard, toWorkspace } from "./lib/interviewEngine";
import { describeRequestError } from "./lib/requestError";
import { navigateTo, parseRoute } from "./lib/router";
import { clearCachedWorkspace, loadServerSnapshotCache, saveServerSnapshotCache } from "./lib/store";
import { notify } from "./lib/toast";
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
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "./components/auth/RecoveryPages";
import { OnboardingPage } from "./components/onboarding/OnboardingPage";
import { JdWorkspace } from "./components/jd";
import { QuestionsWorkspace } from "./components/questions";
import { ResumeWorkspacePage } from "./components/resume";
import { NotFoundPage, ServerErrorPage } from "./components/system/StatusPages";
import { LegalPage } from "./components/legal/LegalPage";
import { ToastHost } from "./components/system/ToastHost";
import { Seo } from "./components/system/Seo";
import { AuthGateModal } from "./components/auth/AuthGate";

type ServerSnapshot = {
  profile: CandidateProfile;
  positions: Position[];
  activePositionId: string;
  records: InterviewRecord[];
  journeyState?: UserJourneyState;
};

function normalizeRoutePath(pathname: string): string {
  return pathname === "/mock/positions" ? "/mock" : pathname;
}

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
    activeRecordId: records.some((record) => record.id === current?.activeRecordId) ? (current?.activeRecordId ?? "") : records[0]?.id ?? "",
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
  const { session, isLoggedIn, loading: authLoading, clearAuth, updateSession } = useAuth();
  const [appState, setAppState] = useState<AppState>(() => {
    const state = repairAppState(loadServerSnapshotCache());
    if (typeof window === "undefined") return state;
    const initialRoute = parseRoute(window.location.pathname);
    return initialRoute.name === "recordDetail" ? repairAppState({ ...state, activeRecordId: initialRoute.recordId }) : state;
  });
  const [routePath, setRoutePath] = useState(() => {
    if (typeof window === "undefined") return "/";
    const normalized = normalizeRoutePath(window.location.pathname);
    if (normalized !== window.location.pathname) {
      window.history.replaceState({}, "", normalized);
    }
    return normalized;
  });
  const [snapshotHydrated, setSnapshotHydrated] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [loginGatePath, setLoginGatePath] = useState<string | null>(null);
  const [interviewConfig, setInterviewConfig] = useState<InterviewConfig>(DEFAULT_CONFIG);
  const redirectedRef = useRef(false);

  const notifySyncError = (title: string, error: unknown, fallback: string) => {
    const detail = describeRequestError(error, fallback);
    notify(`${title}：${detail}`, "error");
  };

  useEffect(() => {
    if (authLoading || !snapshotHydrated) return;
    const currentRoute = parseRoute(routePath);
    const publicRoutes = new Set(["home", "authLogin", "authRegister", "forgotPassword", "resetPassword", "verifyEmail", "legalTerms", "legalPrivacy", "about", "help", "notFound", "serverError"]);
    if (isLoggedIn && appState.journeyState === "onboarding" && currentRoute.name !== "onboarding" && !publicRoutes.has(currentRoute.name)) {
      if (redirectedRef.current) return;
      redirectedRef.current = true;
      navigateTo("/onboarding", { replace: true });
      setRoutePath("/onboarding");
      return;
    }
    redirectedRef.current = false;
  }, [isLoggedIn, authLoading, appState.journeyState, routePath, snapshotHydrated]);

  // When user logs in, transition journeyState from guest to onboarding
  useEffect(() => {
    if (!authLoading && snapshotHydrated && isLoggedIn && appState.journeyState === "guest" && appState.positions.length === 0 && appState.interviewRecords.length === 0 && !appState.profile.resumeText.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAppState((current) => repairAppState({ ...current, journeyState: "onboarding" }));
    }
  }, [isLoggedIn, authLoading, appState.journeyState, appState.positions.length, appState.interviewRecords.length, appState.profile.resumeText, snapshotHydrated]);

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
      .catch((error) => {
        if (!active) return;
        notifySyncError("同步最新数据失败", error, "当前先展示本地缓存。");
      })
      .finally(() => {
        if (active) setSnapshotHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    saveServerSnapshotCache(appState);
    appStateRef.current = appState;
  }, [appState]);

  const prevLoggedInRef = useRef(isLoggedIn);
  const appStateRef = useRef(appState);

  useEffect(() => {
    if (!prevLoggedInRef.current && isLoggedIn) {
      // 登录成功时，先把游客期间产生的岗位/记录合并到用户账户，再拉取服务端快照。
      // 这样游客在注册前创建的数据不会因登录后被服务端快照覆盖而丢失。
      const guestState = appStateRef.current;
      const hasGuestData = guestState.positions.length > 0 || guestState.interviewRecords.length > 0;
      const mergeStep = hasGuestData
        ? apiFetch("/api/auth/merge-guest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              profile: guestState.profile,
              positions: guestState.positions,
              records: guestState.interviewRecords,
              journeyState: guestState.journeyState,
            }),
          }).catch(() => null)
        : Promise.resolve(null);
      void mergeStep
        .then(() => fetchStateSnapshot())
        .then((snapshot) => {
          if (!snapshot?.profile || !Array.isArray(snapshot.positions) || !Array.isArray(snapshot.records)) return;
          setAppState((current) => {
            const next = toAppStateFromSnapshot(snapshot, current);
            saveServerSnapshotCache(next);
            return next;
          });
        })
        .catch((error) => {
          notifySyncError("同步最新数据失败", error, "当前先展示本地缓存。");
        });
    }
    prevLoggedInRef.current = isLoggedIn;
  }, [isLoggedIn]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onPopState = () => {
      const normalizedPath = normalizeRoutePath(window.location.pathname);
      if (normalizedPath !== window.location.pathname) {
        window.history.replaceState({}, "", normalizedPath);
      }
      const nextRoute = parseRoute(normalizedPath);
      if (nextRoute.name === "recordDetail") {
        setAppState((current) => repairAppState({ ...current, activeRecordId: nextRoute.recordId }));
      }
      setRoutePath(normalizedPath);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const { profile, positions, activePositionId, interviewRecords, activeRecordId } = appState;
  const route = parseRoute(routePath);
  const routePositionId =
    route.name === "positionDetail" || route.name === "positionConversation" || route.name === "mockSetup" || route.name === "mockRoom"
      ? route.positionId
      : activePositionId;
  const activePosition = positions.find((position) => position.id === routePositionId) ?? positions.find((position) => position.id === activePositionId) ?? positions[0];
  const activeWorkspace = activePosition ? toWorkspace(profile, activePosition) : null;
  const activeNav: PrimaryRouteName =
    route.name === "recordDetail" ? "records" :
    route.name === "positionDetail" || route.name === "positionConversation" ? "home" :
    route.name === "mockSetup" || route.name === "mockRoom" || route.name === "mockPositionList" ? "mock" :
    route.name === "authLogin" || route.name === "authRegister" || route.name === "forgotPassword" || route.name === "resetPassword" || route.name === "verifyEmail" || route.name === "onboarding" || route.name === "legalTerms" || route.name === "legalPrivacy" || route.name === "about" || route.name === "help" || route.name === "notFound" || route.name === "serverError" ? "home" :
    route.name === "account" ? "account" :
    route.name;
  const routeRecordId = route.name === "recordDetail" ? route.recordId : "";
  const selectedRecordId = routeRecordId || activeRecordId;

  const openRoute = (path: string, options?: { replace?: boolean }) => {
    navigateTo(path, options);
    if (typeof window === "undefined") {
      setRoutePath(path);
      return;
    }
    setRoutePath(new URL(path, window.location.origin).pathname);
  };

  useEffect(() => {
    if (route.name !== "account") return;
    const timer = window.setTimeout(() => {
      setAccountOpen(true);
      openRoute("/", { replace: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [route.name]);

  // 路由级登录守卫：业务路由未登录直接跳登录页并保留原路径。
  useEffect(() => {
    if (authLoading) return;
    const protectedRouteNames = new Set([
      "live", "mock", "mockPositionList", "mockSetup", "mockRoom",
      "jd", "questions", "resume", "records", "recordDetail",
      "positionDetail", "positionConversation", "onboarding",
    ]);
    if (!isLoggedIn && protectedRouteNames.has(route.name)) {
      navigateTo(`/auth/login?returnTo=${encodeURIComponent(routePath)}`, { replace: true });
    }
  }, [route.name, routePath, isLoggedIn, authLoading]);

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

  const openPositionDetail = (positionId: string) => {
    patchState((current) => ({ ...current, activePositionId: positionId }));
    openRoute(`/positions/${encodeURIComponent(positionId)}`);
  };

  const openPositionConversation = (positionId: string) => {
    patchState((current) => ({ ...current, activePositionId: positionId }));
    openRoute(`/positions/${encodeURIComponent(positionId)}/conversation`);
  };

  const openMockPositionList = () => {
    openRoute("/mock");
  };

  const openMockSetup = (positionId: string, config?: InterviewConfig) => {
    patchState((current) => ({ ...current, activePositionId: positionId }));
    if (config) setInterviewConfig(config);
    openRoute(`/mock/setup/${encodeURIComponent(positionId)}`);
  };

  const openMockRoom = (positionId: string, config?: InterviewConfig) => {
    patchState((current) => ({ ...current, activePositionId: positionId }));
    if (config) setInterviewConfig(config);
    openRoute(`/mock/room/${encodeURIComponent(positionId)}`);
  };

  const createOrUpdatePosition = async (
    jobText: string,
    options?: { positionId?: string; confirmedFields?: Array<{ key: string; value: string; source?: string }>; messages?: Array<{ role: "assistant" | "user"; text: string }> },
  ): Promise<string | null> => {
    const trimmed = jobText.trim();
    if (!trimmed) return null;
    try {
      const snapshot = await upsertPositionIntakeOnServer({
      positionId: options?.positionId,
      rawJdText: trimmed,
      inferredFields: [],
      confirmedFields: (options?.confirmedFields ?? []).map((item) => ({
        key: item.key as PositionIntakeFieldKey,
        value: item.value,
        source: "confirmed",
      })),
      messages: options?.messages,
      });
      syncSnapshot(snapshot);
      return snapshot.activePositionId || snapshot.positions[0]?.id || null;
    } catch (error) {
      notifySyncError("保存岗位信息失败", error, "请稍后重试。");
      return null;
    }
  };

  const updateProfile = (next: { resumeText: string; evidenceLibrary: EvidenceItem[]; highlights: string[] }) => {
    void updateProfileOnServer(next)
      .then((snapshot) => syncSnapshot(snapshot))
      .catch((error) => notifySyncError("同步简历资料失败", error, "请稍后重试。"));
  };

  const renameProfile = (displayName: string) => {
    void updateProfileOnServer({
      displayName,
      resumeText: profile.resumeText,
      evidenceLibrary: profile.evidenceLibrary,
      highlights: profile.highlights,
    })
      .then((snapshot) => syncSnapshot(snapshot))
      .catch((error) => {
        notifySyncError("同步显示名称失败", error, "当前先保留本地修改。");
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
      .catch((error) => {
        notifySyncError("同步简历正文失败", error, "当前先保留本地修改。");
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
      .catch((error) => notifySyncError("保存问题修改失败", error, "请稍后重试。"));
  };

  const addQuestion = (payload: Pick<InterviewQuestion, "question" | "category" | "difficulty"> & { answer?: string; notes?: string; positionId?: string }) => {
    // 支持显式指定目标岗位：复盘沉淀时应沉淀到记录所属岗位，而非依赖当前 activePosition。
    const targetPosition = payload.positionId ? positions.find((item) => item.id === payload.positionId) ?? activePosition : activePosition;
    if (!targetPosition) return;
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
    void updatePositionQuestionsOnServer(targetPosition.id, [question, ...targetPosition.questions])
      .then(({ position }) => {
        patchState((current) => ({
          ...current,
          positions: replacePosition(current.positions, position),
        }));
      })
      .catch((error) => notifySyncError("沉淀问题失败", error, "请稍后重试。"));
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
      .catch((error) => notifySyncError("保存提词卡到问题记录失败", error, "请稍后重试。"));
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
      .catch((error) => notifySyncError("保存资料失败", error, "请稍后重试。"));
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
    const questionResults = payload.turn
      ? (() => {
          const question = activePosition.questions.find((item) => item.id === payload.turn?.questionId);
          return [
            {
              questionId: payload.turn.questionId,
              questionText: question?.question ?? payload.transcript.find((item) => item.role === "interviewer")?.text ?? payload.title,
              answer: payload.turn.answer,
              score: payload.turn.score,
              feedback: payload.turn.feedback,
              evidenceIds: question?.evidenceIds ?? [],
              cueCardIds: payload.cueCards.map((card) => card.id),
              followUp: payload.conversationHistory?.filter((item) => item.role === "interviewer").at(-1)?.text,
            },
          ];
        })()
      : payload.cueCards.map((card, index) => ({
          questionId: card.id,
          questionText: card.questionText,
          answer: payload.transcript.filter((item) => item.role === "candidate")[index]?.text ?? "",
          evidenceIds: card.evidenceIds,
          cueCardIds: [card.id],
        }));
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
      questionResults: questionResults.length ? questionResults : baseRecord?.questionResults,
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
      .catch((error) => {
        // 保存失败：回滚本地乐观更新，避免留下无法同步的幽灵记录。
        // 新建记录直接移除；更新已有记录则恢复为旧版本。
        patchState((current) => ({
          ...current,
          interviewRecords: baseRecord
            ? replaceRecord(current.interviewRecords.filter((item) => item.id !== record.id), baseRecord)
            : current.interviewRecords.filter((item) => item.id !== record.id),
          activeRecordId:
            current.activeRecordId === record.id
              ? baseRecord?.id ?? current.interviewRecords.find((item) => item.id !== record.id)?.id ?? ""
              : current.activeRecordId,
        }));
        notifySyncError("保存面试记录失败", error, "记录未能同步到服务端，已回滚本地，请稍后重试。");
      });
    if (payload.mode === "mock") {
      void getLatestMockSessionOnServer(activePosition.id)
        .then(({ session }) => completeMockSessionOnServer(session.id))
        .catch((error) => notifySyncError("结束模拟会话同步失败", error, "不影响当前记录查看。"));
    }
    openRoute("/records");
  };

  const clearAll = () => {
    clearCachedWorkspace();
    setAppState(repairAppState(createInitialAppState()));
    openRoute("/", { replace: true });
    setAccountOpen(false);
  };

  const deletePosition = async (positionId: string) => {
    const snapshot = await deletePositionOnServer(positionId).catch(() => null);
    if (!snapshot) return;
    syncSnapshot(snapshot);
    openRoute("/", { replace: true });
  };

  const updatePositionPreferences = async (positionId: string, config: InterviewConfig) => {
    setInterviewConfig(config);
    const response = await updatePositionPreferencesOnServer(positionId, {
      interviewerRole: config.interviewerRole,
      difficulty: config.difficulty,
      interviewerGender: config.interviewerGender,
      submitMode: config.submitMode,
      style: config.style,
    }).catch(() => null);
    if (response?.position) {
      patchState((current) => ({
        ...current,
        positions: replacePosition(current.positions, response.position),
      }));
    }
  };

  return (
    <AppShell
      activeNav={activeNav}
      accountName={session?.displayName || profile.displayName || "候选人"}
      isLoggedIn={isLoggedIn}
      onNavigate={(nav) => {
        if (nav === "home") openRoute("/");
        if (nav === "live") openRoute("/live");
        if (nav === "mock") openRoute("/mock");
        if (nav === "jd") openRoute("/jd");
        if (nav === "questions") openRoute("/questions");
        if (nav === "resume") openRoute("/resume");
        if (nav === "records") openRoute("/records");
        if (nav === "authLogin") openRoute("/auth/login");
        if (nav === "authRegister") openRoute("/auth/register");
        if (nav === "account") setAccountOpen(true);
      }}
      onAccount={() => setAccountOpen(true)}
      onFeedback={() => setFeedbackOpen(true)}
    >
      <Seo title="AI 求职台" description="围绕真实 JD、简历和面试记录，完成从准备到复盘的 AI 面试闭环。" />
      <ToastHost />

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
            positions: current.positions.some((p) => p.id === position.id) ? current.positions : [position, ...current.positions],
            activePositionId: current.activePositionId || position.id,
          }));
        } else {
          patchState((current) => ({ ...current, journeyState: "ready" }));
        }
      }} />}

      {route.name === "legalTerms" && <LegalPage type="terms" />}

      {route.name === "legalPrivacy" && <LegalPage type="privacy" />}

      {route.name === "about" && <LegalPage type="about" />}

      {route.name === "help" && <LegalPage type="help" />}

      {route.name === "notFound" && <NotFoundPage />}

      {route.name === "serverError" && <ServerErrorPage />}

      {(route.name === "home" || route.name === "account") && (
        isLoggedIn ? (
          <HomeDashboard
            positions={positions}
            activePositionId={activePositionId}
            onSubmitJd={createOrUpdatePosition}
            onOpenCreatedPosition={openPositionConversation}
            onOpenMockList={openMockPositionList}
            onOpenLive={() => openRoute("/live")}
            onRequireLogin={requireLoginFor}
            isLoggedIn={isLoggedIn}
          />
        ) : route.name === "home" ? (
          <AuthLandingPage
            onLogin={() => openRoute("/auth/login")}
            onRegister={() => openRoute("/auth/register")}
          />
        ) : null
      )}

      {route.name === "positionDetail" && activePosition && (
        <PositionDetailPage
          position={activePosition}
          onContinueConversation={() => openPositionConversation(activePosition.id)}
          onOpenMockSetup={() => openMockSetup(activePosition.id)}
          onDelete={() => {
            const confirmed = window.confirm("删除这个岗位后，该岗位的上传资料、问题资产和关联练习记录都会一起删除。是否继续？");
            if (!confirmed) return;
            void deletePosition(activePosition.id);
          }}
          onBackHome={() => openRoute("/")}
        />
      )}

      {route.name === "positionConversation" && activePosition && (
        <PositionConversationPage
          position={activePosition}
          onSubmitMessage={async (message, options) => {
            await createOrUpdatePosition(message, options);
          }}
          onOpenMockSetup={() => openMockSetup(activePosition.id)}
          onOpenDetail={() => openPositionDetail(activePosition.id)}
        />
      )}

      {route.name === "live" && (activeWorkspace && activePosition ? (
        <LiveAssistantDashboard
          workspace={activeWorkspace}
          profile={profile}
          position={activePosition}
          onSaveRecord={saveInterviewRecord}
          onSaveQuestion={addQuestionFromCueCard}
          isLoggedIn={isLoggedIn}
          onRequireLogin={() => requireLoginFor("/live")}
        />
      ) : (
        <section className="page"><div className="empty-card"><div className="empty-card-icon"><BriefcaseBusiness size={20} /></div><h2>还没有岗位卡</h2><p>先在首页粘贴 JD 创建岗位，再进入实时助手。</p><button className="button primary" type="button" onClick={() => openRoute("/")}>去岗位台</button></div></section>
      ))}

      {(route.name === "mock" || route.name === "mockPositionList") && (
        <MockPositionListPage
          positions={positions}
          onSelectPosition={(positionId) => openMockSetup(positionId)}
        />
      )}

      {route.name === "mockSetup" && activePosition && (
        <MockSetupPage
          position={activePosition}
          initialConfig={interviewConfig}
          onStart={(config) => {
            void updatePositionPreferences(activePosition.id, config).finally(() => {
              openMockRoom(activePosition.id, config);
            });
          }}
        />
      )}

      {route.name === "mockRoom" && (activeWorkspace && activePosition ? (
        <InterviewRoomView
          workspace={activeWorkspace}
          profile={profile}
          position={activePosition}
          onSaveRecord={saveInterviewRecord}
          onSaveQuestion={addQuestionFromCueCard}
          config={interviewConfig}
          isLoggedIn={isLoggedIn}
          onRequireLogin={() => requireLoginFor(`/mock/room/${activePosition.id}`)}
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
          onGoHome={() => openRoute("/")}
        />
      )}

      {route.name === "resume" && (
        <ResumeWorkspacePage
          profile={profile}
          position={activePosition}
          onUpdateResume={updateResume}
          onUpdateEvidence={updateEvidence}
          onSetHighlights={updateHighlights}
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
            openRoute(`/records/${encodeURIComponent(id)}`);
          }}
          onMock={() => {
            if (!isLoggedIn) {
              requireLoginFor("/mock");
              return;
            }
            // 再练一次：直接对当前复盘记录所属岗位开模拟，而非跳岗位列表。
            const currentRecord = interviewRecords.find((item) => item.id === selectedRecordId);
            if (currentRecord?.positionId) {
              openMockSetup(currentRecord.positionId);
            } else {
              openMockPositionList();
            }
          }}
          onOpenQuestions={() => openRoute("/questions")}
          onOpenResume={() => openRoute("/resume")}
          onOpenJd={() => openRoute("/jd")}
          onSaveQuestionNote={({ question, notes }) => {
            const currentRecord = interviewRecords.find((item) => item.id === selectedRecordId);
            addQuestion({
              question,
              category: "复盘沉淀",
              difficulty: "进阶",
              notes,
              positionId: currentRecord?.positionId,
            });
          }}
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
          session={session}
          isLoggedIn={isLoggedIn}
          onClose={() => setAccountOpen(false)}
          onLogout={() => {
            clearAuth();
            setAccountOpen(false);
            openRoute("/", { replace: true });
          }}
          onSwitchAccount={() => {
            clearAuth();
            setAccountOpen(false);
            openRoute("/auth/login", { replace: true });
          }}
          onUpdateSession={updateSession}
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
