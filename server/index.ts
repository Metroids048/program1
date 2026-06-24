import "dotenv/config";
import Fastify, { type FastifyInstance } from "fastify";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createDb, toApiSnapshot } from "./db";
import { createLlmClient } from "./llm";
import type { LlmClient } from "./llm";
import { AiOrchestrator } from "./orchestrator";
import { createSearchTool } from "./search";
import type { AnswerCueCard, AppState, BackendState, InterviewRecord, Position } from "./types";
import { createAuthService } from "./domains/auth/auth.service";
import { registerAuthRoutes } from "./domains/auth/auth.routes";
import { createQuotaService } from "./domains/quota/quota.service";
import type { SessionInfo } from "./domains/auth/types";
import { makeId, nowIso } from "./utils";
import { createInitialAppState, createPosition } from "../src/lib/interviewEngine";
import { createMailService } from "./mail/service";
import { applyRateLimit, requireAuth, setCorsHeaders } from "./security";

declare module "fastify" {
  interface FastifyRequest {
    session?: SessionInfo;
  }
}

const CueCardBody = z.object({
  questionText: z.string().min(1),
  positionId: z.string().optional(),
  source: z.enum(["live", "mock", "questionBank", "manual"]).optional(),
  enableSearch: z.boolean().optional(),
  recentHistory: z.array(z.object({ role: z.enum(["interviewer", "candidate"]), text: z.string() })).optional(),
});

const ReconstructCueCardBody = z.object({
  questionText: z.string().min(1),
  positionId: z.string().optional(),
  feedback: z.string().min(1),
  originalCard: z.record(z.string(), z.unknown()),
});

const AnalyzePositionBody = z.object({
  jobText: z.string().min(1),
  positionId: z.string().optional(),
});

const AnalyzeProfileBody = z.object({
  resumeText: z.string(),
});

const FollowUpBody = z.object({
  positionId: z.string().optional(),
  transcript: z.array(z.object({ role: z.enum(["interviewer", "candidate"]), text: z.string() })),
});

const MockAnswerBody = z.object({
  positionId: z.string().optional(),
  questionId: z.string().optional(),
  answer: z.string().min(1),
  transcript: z.array(z.object({ role: z.enum(["interviewer", "candidate"]), text: z.string() })),
});

const SearchBody = z.object({
  query: z.string().min(1),
});

const IntakeFieldBody = z.object({
  key: z.enum(["company", "role", "interviewer", "difficulty", "duration", "hasJd"]),
  value: z.string(),
  source: z.enum(["raw", "inferred", "confirmed"]).optional(),
});

const IntakeBody = z.object({
  positionId: z.string().optional(),
  rawJdText: z.string().min(1),
  inferredFields: z.array(IntakeFieldBody).optional(),
  confirmedFields: z.array(IntakeFieldBody).optional(),
  messages: z.array(z.object({ role: z.enum(["assistant", "user"]), text: z.string() })).optional(),
});

const ProfileBody = z.object({
  displayName: z.string().optional(),
  resumeText: z.string(),
      evidenceLibrary: z.array(
        z.object({
          id: z.string(),
          type: z.string(),
          title: z.string(),
          detail: z.string(),
          keywords: z.array(z.string()),
          impact: z.string(),
          synthetic: z.boolean().optional(),
        }),
      ),
  highlights: z.array(z.string()),
});

const MaterialsBody = z.object({
  materials: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["project", "upload", "note", "project_file", "question_note", "record_excerpt"]),
      source: z.enum(["manual", "upload", "derived", "mock_backflow", "live_backflow", "record_extract"]),
      title: z.string(),
      detail: z.string(),
      parsedText: z.string().optional(),
      summary: z.string(),
      keywords: z.array(z.string()),
      tags: z.array(z.string()),
      linkedQuestionIds: z.array(z.string()),
      usageScopes: z.array(z.enum(["live", "mock", "resume"])),
      originRecordId: z.string().optional(),
      ragStatus: z.enum(["pending", "indexed", "failed", "local_only"]),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
});

const QuestionsBody = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      category: z.string(),
      question: z.string(),
      reason: z.string(),
      evidenceIds: z.array(z.string()),
      difficulty: z.string(),
      source: z.enum(["diagnosis", "manual", "mock", "material", "cueCard"]),
      priority: z.boolean(),
      notes: z.string(),
      answer: z.string().optional(),
      lastReviewedAt: z.string().optional(),
      cueCardIds: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
    }),
  ),
});

const ResumeAiBody = z.object({
  positionId: z.string().optional(),
  action: z.enum(["section", "full", "match"]),
  sectionId: z.string().optional(),
  sectionTitle: z.string().optional(),
  currentText: z.string(),
  fullResumeText: z.string(),
  userMessage: z.string().optional(),
});

const ProfileHighlightsBody = z.object({
  resumeText: z.string(),
  displayName: z.string().optional(),
  positionId: z.string().optional(),
});

export function buildServer(options: { dbPath?: string; llmClient?: LlmClient } = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const db = createDb(options.dbPath);
  const orchestrator = new AiOrchestrator(db, options.llmClient ?? createLlmClient(), createSearchTool());
  const mailer = createMailService();
  const auth = createAuthService(db, mailer);
  const quota = createQuotaService(db);
  const corsOrigin = process.env.APP_CORS_ORIGIN ?? process.env.APP_BASE_URL ?? "http://127.0.0.1:5173";

  app.addHook("onRequest", async (_request, reply) => {
    setCorsHeaders(reply);
  });

  app.options("/*", async () => ({ ok: true }));

  // Auth middleware: attach session if token present (optional — guests proceed without)
  app.addHook("onRequest", async (request) => {
    const header = request.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      try {
        request.session = auth.validateSession(header.slice(7));
      } catch {
        // Invalid/expired token — continue as guest
      }
    }
    orchestrator.setUserId(request.session?.userId);
  });

  // Register auth routes
  registerAuthRoutes(app, auth);

  app.get("/api/mail/outbox", async (request, reply) => {
    if (process.env.NODE_ENV === "production") {
      return reply.code(404).send({ error: "NOT_FOUND" });
    }
    requireAuth(request);
    return { items: mailer.listOutbox() };
  });

  // Merge guest data into authenticated user account
  app.post("/api/auth/merge-guest", async (request, reply) => {
    if (!request.session) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }
    const body = request.body as Partial<BackendState>;
    const userState = db.getState(request.session.userId);
    const guestPositions = Array.isArray(body?.positions) ? body.positions : [];
    const guestRecords = Array.isArray(body?.records) ? body.records : [];

    const existingIds = new Set(userState.positions.map((p) => p.id));
    const newPositions = guestPositions.filter((p) => !existingIds.has(p.id));

    const existingRecordIds = new Set(userState.records.map((r) => r.id));
    const newRecords = guestRecords.filter((r) => !existingRecordIds.has(r.id));

    const merged: BackendState = {
      profile: body?.profile ?? userState.profile,
      positions: [...userState.positions, ...newPositions],
      records: [...userState.records, ...newRecords],
      journeyState: userState.journeyState ?? "ready",
    };
    db.saveState(merged, request.session.userId);
    return { ok: true, mergedPositions: newPositions.length, mergedRecords: newRecords.length };
  });

  // Quota helper: call before AI-heavy endpoints
  const requireQuota = (endpoint: string) => {
    const userId = orchestrator["currentUserId"] as string | undefined;
    const state = db.getState(userId);
    return quota.checkAndRecord(userId, endpoint, state.positions.length);
  };

  // Quota info endpoint
  app.get("/api/quota", async (request) => {
    const userId = request.session?.userId;
    const state = db.getState(userId);
    return quota.getQuotaInfo(userId, state.positions.length);
  });

  // Onboarding
  app.post("/api/onboarding", async (request) => {
    if (!request.session) return { ok: true, note: "guest", profile: createInitialAppState().profile, nextStep: "intake_jd" as const };
    const body = request.body as Record<string, unknown>;
    const userId = request.session.userId;
    const state = db.getState(userId);
    const targetRole = (body.targetRole as string) || state.profile.resume.targetRole || "待定岗位";
    const profile = {
      ...state.profile,
      displayName: (body.displayName as string) || state.profile.displayName || "候选人",
      resumeText: (body.resumeText as string) || state.profile.resumeText || "",
    };
    // Generate a default position from targetRole if no positions exist
    let position: Position | undefined;
    if (state.positions.length === 0) {
      const defaultJd = `目标岗位：${targetRole}\n城市：${body.city || "待定"}\n经验：${body.experience || "待定"}\n阶段：${body.stage || "准备面试"}`;
      position = createPosition(defaultJd, profile);
    }
    const nextState: BackendState = {
      ...state,
      profile,
      positions: position ? [position, ...state.positions] : state.positions,
      journeyState: "ready",
    };
    db.saveState(nextState, userId);
    if (db.db) {
      db.db.prepare("insert into audit_events(id, user_id, action, detail, created_at) values (?, ?, ?, ?, ?)")
        .run(makeId("audit"), userId, "onboarding", JSON.stringify(body), nowIso());
    }
    const nextStep = profile.resumeText.trim() ? "intake_jd" as const : "import_resume" as const;
    return { ok: true, profile, position, nextStep };
  });

  // Feedback
  app.post("/api/feedback", async (request) => {
    const body = request.body as { category?: string; content?: string; contact?: string };
    const id = makeId("fb");
    const now = nowIso();
    if (db.db) {
      db.db.prepare("insert into feedback_tickets(id, user_id, category, content, contact, created_at) values (?, ?, ?, ?, ?, ?)")
        .run(id, request.session?.userId ?? null, body.category ?? "other", body.content ?? "", body.contact ?? null, now);
    }
    if (db.db) {
      db.db.prepare("insert into audit_events(id, user_id, action, detail, created_at) values (?, ?, ?, ?, ?)")
        .run(makeId("audit"), request.session?.userId ?? null, "feedback", id, now);
    }
    const supportEmail = process.env.SUPPORT_EMAIL?.trim();
    if (supportEmail) {
      await mailer.sendEmail({
        to: supportEmail,
        subject: "收到新的用户反馈",
        template: "feedbackNotice",
        userId: request.session?.userId ?? null,
        variables: {
          ticketId: id,
          category: body.category ?? "other",
          content: body.content ?? "",
          contact: body.contact ?? "",
        },
      });
    }
    return { ok: true, ticketId: id };
  });

  // Data export
  app.post("/api/data/export", async (request) => {
    const userId = requireAuth(request).userId;
    const state = db.getState(userId);
    const exportData = {
      profile: state.profile,
      positions: state.positions,
      records: state.records,
      exportedAt: nowIso(),
    };
    if (db.db) {
      db.db.prepare("insert into audit_events(id, user_id, action, detail, created_at) values (?, ?, ?, ?, ?)")
        .run(makeId("audit"), userId ?? null, "export", `positions:${state.positions.length},records:${state.records.length}`, nowIso());
    }
    return exportData;
  });

  // Data deletion request
  app.post("/api/data/delete-request", async (request) => {
    const userId = requireAuth(request).userId;
    // Soft delete: clear user state
    const empty: BackendState = { profile: createInitialAppState().profile, positions: [], records: [], journeyState: "guest" };
    db.saveState(empty, userId);
    if (db.db) {
      db.db.prepare("insert into audit_events(id, user_id, action, detail, created_at) values (?, ?, ?, ?, ?)")
        .run(makeId("audit"), userId, "delete_request", "user data cleared", nowIso());
    }
    return { ok: true };
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: "VALIDATION_ERROR",
        message: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
    }
    const statusCode = (error as Error & { statusCode?: number }).statusCode ?? 500;
    if (statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ error: String(error) });
    }
    return reply.code(500).send({ error: "INTERNAL_ERROR", message: String(error) });
  });

  app.get("/api/health", async () => ({
    ok: true,
    searchProvider: orchestrator.searchProvider,
    model: orchestrator.model,
  }));

  app.get("/api/state", async (request) => toApiSnapshot(db.getState(request.session?.userId)));

  app.post("/api/positions/intake", async (request) => {
    const body = IntakeBody.parse(request.body);
    const result = await orchestrator.upsertPositionIntake({
      positionId: body.positionId,
      rawJdText: body.rawJdText,
      confirmedFields: body.confirmedFields,
      messages: body.messages,
    });
    return {
      ...toApiSnapshot(result.state, result.activePositionId),
      intakeAssistant: result.intakeAssistant,
    };
  });

  app.post("/api/profile", async (request) => {
    const body = ProfileBody.parse(request.body);
    return toApiSnapshot(
      orchestrator.updateProfile({
        displayName: body.displayName,
        resumeText: body.resumeText,
        evidenceLibrary: body.evidenceLibrary,
        highlights: body.highlights,
      }),
    );
  });

  app.post("/api/profile/analyze", async (request) => {
    const body = AnalyzeProfileBody.parse(request.body);
    return toApiSnapshot(orchestrator.analyzeProfile(body.resumeText));
  });

  app.post("/api/positions/analyze", async (request) => {
    applyRateLimit(`positions-analyze:${request.session?.userId ?? request.ip}`, 30, 60 * 60 * 1000);
    requireQuota("position-analyze");
    const body = AnalyzePositionBody.parse(request.body);
    return toApiSnapshot(await orchestrator.analyzePosition(body.jobText, body.positionId), body.positionId);
  });

  app.get<{ Params: { id: string } }>("/api/positions/:id/context", async (request, reply) => {
    const state = db.getState(request.session?.userId);
    const position = state.positions.find((item) => item.id === request.params.id);
    if (!position) return reply.code(404).send({ error: "POSITION_NOT_FOUND" });
    return {
      profile: state.profile,
      position,
      questions: position.questions,
      evidence: state.profile.evidenceLibrary,
    };
  });

  app.post<{ Params: { id: string } }>("/api/positions/:id/materials", async (request, reply) => {
    const body = MaterialsBody.parse(request.body);
    try {
      const position = orchestrator.updatePositionMaterials(request.params.id, body.materials);
      return { position };
    } catch (error) {
      if (String(error).includes("POSITION_NOT_FOUND")) {
        return reply.code(404).send({ error: "POSITION_NOT_FOUND" });
      }
      throw error;
    }
  });

  app.post<{ Params: { id: string } }>("/api/positions/:id/questions", async (request, reply) => {
    const body = QuestionsBody.parse(request.body);
    try {
      const position = orchestrator.updatePositionQuestions(request.params.id, body.questions);
      return { position };
    } catch (error) {
      if (String(error).includes("POSITION_NOT_FOUND")) {
        return reply.code(404).send({ error: "POSITION_NOT_FOUND" });
      }
      throw error;
    }
  });

  app.post("/api/copilot/cue-card/stream", async (request, reply) => {
    const quotaInfo = requireQuota("cue-card");
    const parsed = CueCardBody.safeParse(request.body);
    if (!parsed.success) {
      reply.raw.writeHead(400, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": corsOrigin,
      });
      reply.raw.end(JSON.stringify({
        error: "VALIDATION_ERROR",
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      }));
      return;
    }
    const body = parsed.data;
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": corsOrigin,
    });
    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      send("stage", { label: "识别问题", status: "done" });
      send("stage", { label: "检索 JD、简历和问题库", status: "running" });
      send("delta", { text: "已进入本地资料召回..." });
      if (body.enableSearch) send("stage", { label: "联网搜索公司与岗位信息", status: "running" });
      const result = await orchestrator.createCueCard(body);
      send("stage", {
        label: body.enableSearch ? "搜索完成，生成提词卡" : "生成提词卡",
        status: result.promptRun.status,
        searchCount: result.searchResults.length,
      });
      send("delta", { text: result.meta.backendStatus === "success" ? "模型已返回结构化提词卡。" : "模型未就绪，保留本地练习模式结果。" });
      send("card", result);
      send("done", { ok: true, quotaUsed: quotaInfo.dailyUsed, quotaRemaining: quotaInfo.remaining });
    } catch (error) {
      send("error", { message: String(error) });
    } finally {
      reply.raw.end();
    }
  });

  app.post("/api/copilot/cue-card/reconstruct", async (request, reply) => {
    const body = ReconstructCueCardBody.parse(request.body);
    const quotaInfoRc = requireQuota("cue-card-reconstruct");
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": corsOrigin,
    });
    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      send("stage", { label: "解析反馈", status: "done" });
      send("stage", { label: "重构提词卡", status: "running" });
      const result = await orchestrator.reconstructCueCard({
        questionText: body.questionText,
        positionId: body.positionId,
        feedback: body.feedback,
        originalCard: body.originalCard as unknown as AnswerCueCard,
      });
      send("stage", { label: "重构提词卡", status: result.promptRun.status });
      send("card", result);
      send("done", { ok: true, quotaUsed: quotaInfoRc.dailyUsed, quotaRemaining: quotaInfoRc.remaining });
    } catch (error) {
      send("error", { message: String(error) });
    } finally {
      reply.raw.end();
    }
  });

  app.post("/api/copilot/follow-up", async (request) => {
    requireQuota("follow-up");
    const body = FollowUpBody.parse(request.body);
    const result = await orchestrator.createFollowUp(body.transcript, body.positionId);
    return { question: result.question, backendStatus: result.meta.backendStatus, meta: result.meta };
  });

  app.post("/api/mock/session", async (request) => {
    requireQuota("mock-session");
    const body = z.object({ positionId: z.string().optional(), config: z.record(z.string(), z.unknown()).optional() }).parse(request.body ?? {});
    const result = await orchestrator.createMockSession(body.positionId, body.config);
    return {
      sessionId: result.sessionId,
      question: result.question,
      backendStatus: result.meta.backendStatus,
      questionSource: result.questionSource,
      meta: result.meta,
      conversationHistory: result.conversationHistory,
    };
  });

  app.post<{ Params: { id: string } }>("/api/mock/session/:id/answer", async (request, reply) => {
    requireQuota("mock-answer");
    const parsed = MockAnswerBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "VALIDATION_ERROR",
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
    }
    const body = parsed.data;
    const result = await orchestrator.answerMockSession(request.params.id, body.positionId, body.questionId, body.answer, body.transcript);
    return {
      record: result.record,
      followUp: result.followUp,
      decision: result.decision,
      backendStatus: result.meta.backendStatus,
      meta: result.meta,
      conversationHistory: result.conversationHistory,
    };
  });

  app.post("/api/records", async (request) => {
    const record = request.body as InterviewRecord;
    orchestrator.saveInterviewRecord(record);
    return { record, records: db.listRecords() };
  });

  app.post("/api/resume/ai", async (request) => {
    requireQuota("resume-ai");
    const body = ResumeAiBody.parse(request.body);
    return orchestrator.runResumeAi(body);
  });

  app.post("/api/profile/highlights", async (request) => {
    requireQuota("profile-highlights");
    const body = ProfileHighlightsBody.parse(request.body);
    return orchestrator.generateProfileHighlights(body);
  });

  app.post("/api/rag/reindex", async (request) => {
    const state = db.getState(request.session?.userId);
    state.positions.forEach((position) => {
      orchestrator.updatePositionMaterials(position.id, position.materials);
      orchestrator.updatePositionQuestions(position.id, position.questions);
    });
    orchestrator.updateProfile({
      displayName: state.profile.displayName,
      resumeText: state.profile.resumeText,
      evidenceLibrary: state.profile.evidenceLibrary,
      highlights: state.profile.highlights,
    });
    state.records.forEach((record) => orchestrator.saveInterviewRecord(record));
    return { ok: true };
  });

  app.get("/api/records", async () => {
    return { records: db.listRecords() };
  });

  app.get<{ Params: { id: string } }>("/api/records/:id", async (request, reply) => {
    requireAuth(request);
    const record = db.getRecord(request.params.id);
    if (!record) return reply.code(404).send({ error: "RECORD_NOT_FOUND" });
    return { record };
  });

  app.post("/api/search", async (request) => {
    const body = SearchBody.parse(request.body);
    const results = await orchestrator.search(body.query);
    return { results };
  });

  app.post("/api/export", async (request) => {
    const state = db.getState(request.session?.userId);
    return toClientAppState(state, {
      activePositionId: state.positions[0]?.id,
    });
  });

  app.post("/api/import", async (request, reply) => {
    const body = request.body as Partial<AppState>;
    if (!body.profile || !Array.isArray(body.positions)) {
      return reply.code(400).send({ error: "INVALID_IMPORT" });
    }
    const state: BackendState = {
      profile: body.profile,
      positions: body.positions,
      records: Array.isArray(body.interviewRecords) ? body.interviewRecords : [],
      journeyState: "ready",
    };
    db.saveState(state, request.session?.userId);
    state.records.forEach((record) => db.saveRecord(record));
    const nextState = toClientAppState(state, {
      activePositionId: body.activePositionId,
      activeRecordId: body.activeRecordId,
    });
    const warnings: string[] = [];
    if (body.activePositionId && nextState.activePositionId !== body.activePositionId) {
      warnings.push("备份中的当前岗位引用无效，已自动切换到首个岗位。");
    }
    if (body.activeRecordId && nextState.activeRecordId !== body.activeRecordId) {
      warnings.push("备份中的当前记录引用无效，已自动切换到首条记录。");
    }
    return {
      state: nextState,
      status: warnings.length ? "partial" : "success",
      warnings,
    };
  });


  // === Conversation Sessions ===
  const ConversationBody = z.object({
    linkedPositionId: z.string().optional(),
    jdDraft: z.string().optional(),
  });

  app.post("/api/conversations", async (request) => {
    const body = ConversationBody.parse(request.body);
    const id = makeId("conv");
    const now = nowIso();
    if (db.db) {
      db.db.prepare(
        "insert into conversation_sessions (id, linked_position_id, status, messages_json, extracted_fields_json, jd_draft, config_draft_json, updated_at) values (?, ?, 'draft', '[]', '[]', ?, '{}', ?)"
      ).run(id, body.linkedPositionId ?? null, body.jdDraft ?? "", now);
    }
    return { id, status: "draft", updatedAt: now };
  });

  app.get<{ Params: { id: string } }>("/api/conversations/:id", async (request, reply) => {
    if (!db.db) return reply.code(503).send({ error: "DB_UNAVAILABLE" });
    const row = db.db.prepare("select * from conversation_sessions where id = ?").get(request.params.id) as Record<string, unknown> | undefined;
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    return {
      id: row.id,
      linkedPositionId: row.linked_position_id,
      status: row.status,
      messages: JSON.parse(String(row.messages_json ?? "[]")),
      extractedFields: JSON.parse(String(row.extracted_fields_json ?? "[]")),
      jdDraft: row.jd_draft,
      configDraft: JSON.parse(String(row.config_draft_json ?? "{}")),
      updatedAt: row.updated_at,
    };
  });

  const AddMessageBody = z.object({
    role: z.enum(["assistant", "user"]),
    text: z.string().min(1),
  });

  app.post<{ Params: { id: string } }>("/api/conversations/:id/messages", async (request, reply) => {
    if (!db.db) return reply.code(503).send({ error: "DB_UNAVAILABLE" });
    const body = AddMessageBody.parse(request.body);
    const row = db.db.prepare("select messages_json from conversation_sessions where id = ?").get(request.params.id) as Record<string, unknown> | undefined;
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    const messages = JSON.parse(String(row.messages_json ?? "[]"));
    messages.push({ id: makeId("msg"), role: body.role, text: body.text, createdAt: nowIso() });
    db.db.prepare("update conversation_sessions set messages_json = ?, updated_at = ? where id = ?").run(JSON.stringify(messages), nowIso(), request.params.id);
    return { ok: true };
  });

  // === Interview Sessions ===
  app.post("/api/interview-sessions", async (request, reply) => {
    if (!db.db) return reply.code(503).send({ error: "DB_UNAVAILABLE" });
    const body = request.body as { positionId?: string; mode?: string; configSnapshot?: Record<string, unknown> };
    if (!body.positionId) return reply.code(400).send({ error: "MISSING_POSITION_ID" });
    const id = makeId("ivs");
    const now = nowIso();
    db.db.prepare(
      "insert into interview_sessions (id, position_id, mode, config_snapshot_json, helper_panel_state, backend_status, transcript_json, created_at, updated_at) values (?, ?, ?, ?, 'cueCard', 'connected', '[]', ?, ?)"
    ).run(id, body.positionId, body.mode ?? "mock", JSON.stringify(body.configSnapshot ?? {}), now, now);
    return { id, status: "created" };
  });

  app.get<{ Params: { id: string } }>("/api/interview-sessions/:id", async (request, reply) => {
    if (!db.db) return reply.code(503).send({ error: "DB_UNAVAILABLE" });
    const row = db.db.prepare("select * from interview_sessions where id = ?").get(request.params.id) as Record<string, unknown> | undefined;
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    return {
      id: row.id,
      positionId: row.position_id,
      mode: row.mode,
      configSnapshot: JSON.parse(String(row.config_snapshot_json ?? "{}")),
      currentQuestion: null,
      helperPanelState: row.helper_panel_state,
      backendStatus: row.backend_status,
      transcript: JSON.parse(String(row.transcript_json ?? "[]")),
    };
  });
  app.addHook("onClose", async () => {
    db.db?.close();
  });

  return app;
}

function toClientAppState(
  state: BackendState,
  options?: {
    activePositionId?: string;
    activeRecordId?: string;
  },
): AppState {
  const activePositionId =
    state.positions.some((item) => item.id === options?.activePositionId) ? options?.activePositionId ?? "" : state.positions[0]?.id ?? "";
  const activeRecordId =
    state.records.some((item) => item.id === options?.activeRecordId) ? options?.activeRecordId ?? "" : state.records[0]?.id ?? "";
  return {
    profile: state.profile,
    positions: state.positions,
    activePositionId,
    interviewRecords: state.records,
    activeRecordId,
    aiMode: true,
    journeyState: state.journeyState ?? "guest",
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.SERVER_PORT ?? 8787);
  const app = buildServer();
  app.listen({ host: "127.0.0.1", port }).then(() => {
    console.log(`AI job platform server listening on http://127.0.0.1:${port}`);
  });
}
