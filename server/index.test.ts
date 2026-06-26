import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { LocalFallbackProvider } from "./ai/provider";
import { buildServer } from "./index";
import { resetRateLimits } from "./security";

const tempDirs: string[] = [];
const apps: FastifyInstance[] = [];

function testDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "ai-job-server-"));
  tempDirs.push(dir);
  return join(dir, "test.sqlite");
}

afterEach(async () => {
  await Promise.allSettled(apps.splice(0).map((app) => app.close()));
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  resetRateLimits();
});

function testApp(dbPath = testDbPath()): FastifyInstance {
  const app = buildServer({ dbPath, llmClient: new LocalFallbackProvider() });
  apps.push(app);
  return app;
}

async function registerAndLogin(app: FastifyInstance, phone: string, displayName?: string): Promise<{ token: string; userId: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: displayName ? { phone, password: "Password123", displayName } : { phone, password: "Password123" },
  });
  const body = response.json();
  return {
    token: body.tokens.accessToken as string,
    userId: body.user.id as string,
  };
}

async function closeTestApp(app: FastifyInstance): Promise<void> {
  const index = apps.indexOf(app);
  if (index >= 0) apps.splice(index, 1);
  await app.close();
}

describe("local backend API", () => {
  it("analyzes a JD and returns persisted position context", async () => {
    const app = testApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/positions/analyze",
      payload: { jobText: "公司：测试科技\n岗位：AI 产品运营\n负责用户访谈、SQL 数据分析和增长复盘。" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.positions[0].questions.length).toBeGreaterThan(0);
    expect(body.activePositionId).toBeTruthy();
  });

  it("streams cue-card stages and a final card with local fallback when AI is not configured", async () => {
    const app = testApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/copilot/cue-card/stream",
      payload: { questionText: "请介绍一个最能证明你适合岗位的项目", source: "live", enableSearch: false },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("event: stage");
    expect(response.body).toContain("event: delta");
    expect(response.body).toContain("event: card");
    expect(response.body).toContain("openingLine");
  });

  it("keeps search explicit when provider credentials are missing", async () => {
    const app = testApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/search",
      payload: { query: "Final Round AI interview copilot" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().results[0].provider).toBe("disabled");
  });

  it("drives mock answers through the backend session and returns local practice metadata", async () => {
    const app = testApp();
    const { token } = await registerAndLogin(app, "13800138100", "Mock 用户");
    const sessionResponse = await app.inject({
      method: "POST",
      url: "/api/mock/session",
      headers: { authorization: `Bearer ${token}` },
      payload: { config: { stage: "上级", difficulty: "压力面", submitMode: "manual" } },
    });
    const session = sessionResponse.json();

    const answerResponse = await app.inject({
      method: "POST",
      url: `/api/mock/session/${session.sessionId}/answer`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        answer: "我负责过一个校园增长项目，先做用户访谈，再用 SQL 分析转化漏斗，最后把首单转化率从 12% 提升到 19%。",
        transcript: [
          { role: "interviewer", text: session.question },
          { role: "candidate", text: "我负责过一个校园增长项目，首单转化率从 12% 提升到 19%。" },
        ],
      },
    });

    expect(answerResponse.statusCode).toBe(200);
    const body = answerResponse.json();
    expect(body.backendStatus).toBe("fallback");
    expect(body.decision.type).toMatch(/followup|next/);
    expect(body.conversationHistory.length).toBeGreaterThanOrEqual(3);
    expect(body.record.report.structuredDimensions.length).toBeGreaterThan(0);
    expect(body.record.questionResults[0].answer).toContain("12%");
  });

  it("keeps mock records consistent across state, records, export and service restart in file fallback mode", async () => {
    const dbPath = testDbPath();
    const app = testApp(dbPath);
    const { token } = await registerAndLogin(app, "13800138101", "持久化用户");

    const sessionResponse = await app.inject({
      method: "POST",
      url: "/api/mock/session",
      headers: { authorization: `Bearer ${token}` },
      payload: { config: { stage: "上级", difficulty: "压力面", submitMode: "manual" } },
    });
    const session = sessionResponse.json();

    const answerResponse = await app.inject({
      method: "POST",
      url: `/api/mock/session/${session.sessionId}/answer`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        answer: "我负责一个增长项目，通过漏斗分析和补贴实验，把首单转化率从 12% 提升到 19%。",
        transcript: [
          { role: "interviewer", text: session.question },
          { role: "candidate", text: "我负责一个增长项目，通过漏斗分析和补贴实验，把首单转化率从 12% 提升到 19%。" },
        ],
      },
    });

    expect(answerResponse.statusCode).toBe(200);
    const recordId = answerResponse.json().record.id as string;

    const authHeaders = { authorization: `Bearer ${token}` };
    const stateResponse = await app.inject({ method: "GET", url: "/api/state", headers: authHeaders });
    const recordsResponse = await app.inject({ method: "GET", url: "/api/records", headers: authHeaders });
    const exportResponse = await app.inject({ method: "POST", url: "/api/export", headers: authHeaders });

    expect(stateResponse.json().records).toHaveLength(1);
    expect(recordsResponse.json().records).toHaveLength(1);
    expect(exportResponse.json().interviewRecords).toHaveLength(1);
    expect(stateResponse.json().records[0].id).toBe(recordId);
    expect(recordsResponse.json().records[0].id).toBe(recordId);
    expect(exportResponse.json().interviewRecords[0].id).toBe(recordId);

    await closeTestApp(app);

    const restarted = testApp(dbPath);
    const restartedState = await restarted.inject({ method: "GET", url: "/api/state", headers: authHeaders });
    const restartedExport = await restarted.inject({ method: "POST", url: "/api/export", headers: authHeaders });

    expect(restartedState.json().records).toHaveLength(1);
    expect(restartedExport.json().interviewRecords).toHaveLength(1);
    expect(restartedState.json().records[0].id).toBe(recordId);
    expect(restartedExport.json().interviewRecords[0].id).toBe(recordId);

  });

  it("returns a safe blank state for guests without exposing persisted user data", async () => {
    const app = testApp();
    const { token } = await registerAndLogin(app, "13800138104", "游客隔离用户");

    await app.inject({
      method: "POST",
      url: "/api/positions/intake",
      headers: { authorization: `Bearer ${token}` },
      payload: { rawJdText: "公司：测试科技\n岗位：产品经理\n负责增长分析与面试准备。" },
    });

    const guestState = await app.inject({ method: "GET", url: "/api/state" });
    expect(guestState.statusCode).toBe(200);
    expect(guestState.json().journeyState).toBe("guest");
    expect(Array.isArray(guestState.json().records)).toBe(true);
    expect(guestState.json().records).toHaveLength(0);

    const userState = await app.inject({
      method: "GET",
      url: "/api/state",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(userState.json().positions.length).toBeGreaterThan(0);
  });

  it("isolates records and mock sessions between different authenticated users", async () => {
    const app = testApp();
    const userA = await registerAndLogin(app, "13800138105", "用户A");
    const userB = await registerAndLogin(app, "13800138106", "用户B");

    const intakeA = await app.inject({
      method: "POST",
      url: "/api/positions/intake",
      headers: { authorization: `Bearer ${userA.token}` },
      payload: { rawJdText: "公司：A公司\n岗位：产品经理\n负责增长。" },
    });
    const positionIdA = intakeA.json().positions[0].id as string;

    const mockA = await app.inject({
      method: "POST",
      url: "/api/mock/session",
      headers: { authorization: `Bearer ${userA.token}` },
      payload: { positionId: positionIdA, config: { stage: "上级", difficulty: "正常", submitMode: "manual" } },
    });
    const sessionIdA = mockA.json().sessionId as string;

    const answerA = await app.inject({
      method: "POST",
      url: `/api/mock/session/${sessionIdA}/answer`,
      headers: { authorization: `Bearer ${userA.token}` },
      payload: {
        positionId: positionIdA,
        answer: "我负责增长项目，通过漏斗分析把转化率从 12% 提升到 19%。",
        transcript: [
          { role: "interviewer", text: mockA.json().question as string },
          { role: "candidate", text: "我负责增长项目，通过漏斗分析把转化率从 12% 提升到 19%。" },
        ],
      },
    });
    expect(answerA.statusCode).toBe(200);
    const recordIdA = answerA.json().record.id as string;

    const recordsA = await app.inject({ method: "GET", url: "/api/records", headers: { authorization: `Bearer ${userA.token}` } });
    const recordsB = await app.inject({ method: "GET", url: "/api/records", headers: { authorization: `Bearer ${userB.token}` } });
    expect(recordsA.json().records).toHaveLength(1);
    expect(recordsB.json().records).toHaveLength(0);

    const recordB = await app.inject({
      method: "GET",
      url: `/api/records/${recordIdA}`,
      headers: { authorization: `Bearer ${userB.token}` },
    });
    expect(recordB.statusCode).toBe(404);

    const sessionB = await app.inject({
      method: "GET",
      url: `/api/positions/${positionIdA}/mock-session`,
      headers: { authorization: `Bearer ${userB.token}` },
    });
    expect(sessionB.statusCode).toBe(404);
  });

  it("indexes materials and questions into RAG, and resume AI returns evidence trace", async () => {
    const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
    const intake = await app.inject({
      method: "POST",
      url: "/api/positions/intake",
      payload: { rawJdText: "公司：北极星科技\n岗位：AI 产品经理\n负责面试产品、RAG、增长分析。" },
    });
    const positionId = intake.json().positions[0].id as string;

    await app.inject({
      method: "POST",
      url: `/api/positions/${positionId}/materials`,
      payload: {
        materials: [
          {
            id: "material-1",
            kind: "project",
            source: "manual",
            title: "RAG 面试助手项目",
            detail: "我负责把本地项目资料、简历和 JD 做 FTS 检索召回，用于实时提词卡。",
            summary: "项目资料：RAG + 实时助手",
            keywords: ["RAG", "FTS5", "提词卡"],
            tags: ["重点项目"],
            linkedQuestionIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    });

    await app.inject({
      method: "POST",
      url: `/api/positions/${positionId}/questions`,
      payload: {
        questions: [
          {
            id: "question-1",
            category: "项目深挖",
            question: "你怎么做 RAG 召回排序？",
            reason: "用户手动保存问题",
            evidenceIds: [],
            difficulty: "中等",
            source: "manual",
            priority: true,
            notes: "重点题",
            cueCardIds: [],
            tags: ["用户保存"],
          },
        ],
      },
    });

    const resumeAi = await app.inject({
      method: "POST",
      url: "/api/resume/ai",
      payload: {
        positionId,
        action: "match",
        sectionId: "projects",
        sectionTitle: "项目经历",
        currentText: "做过一个实时面试助手。",
        fullResumeText: "项目经历\n做过一个实时面试助手。",
        userMessage: "请按岗位做匹配分析",
      },
    });

    expect(resumeAi.statusCode).toBe(200);
    const body = resumeAi.json();
    expect(body.suggestion).toContain("项目经历");
    expect(Array.isArray(body.evidenceTrace)).toBe(true);
    expect(body.meta.backendStatus).toBe("fallback");
    await app.close();
  });

  it("returns structured import results and warnings when active pointers are invalid", async () => {
    const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
    const { token } = await registerAndLogin(app, "13800138102", "导入用户");
    const intake = await app.inject({
      method: "POST",
      url: "/api/positions/intake",
      headers: { authorization: `Bearer ${token}` },
      payload: { rawJdText: "公司：北极星科技\n岗位：AI 产品经理\n负责面试产品、RAG、增长分析。" },
    });
    const snapshot = intake.json();
    const stateToImport = {
      profile: snapshot.profile,
      positions: snapshot.positions,
      activePositionId: "missing-position",
      interviewRecords: [],
      activeRecordId: "missing-record",
      aiMode: true,
      journeyState: "ready" as const,
    };

    const response = await app.inject({
      method: "POST",
      url: "/api/import",
      headers: { authorization: `Bearer ${token}` },
      payload: stateToImport,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("partial");
    expect(body.state.activePositionId).toBe(snapshot.positions[0].id);
    expect(body.warnings.length).toBeGreaterThan(0);
    await app.close();
  });

  it("rejects invalid import payloads with a 400 response", async () => {
    const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
    const { token } = await registerAndLogin(app, "13800138103", "错误导入用户");
    const response = await app.inject({
      method: "POST",
      url: "/api/import",
      headers: { authorization: `Bearer ${token}` },
      payload: { foo: "bar" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("INVALID_IMPORT");
    await app.close();
  });

  it("returns structured full-resume fallback blocks that the frontend can map back into sections", async () => {
    const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
    const intake = await app.inject({
      method: "POST",
      url: "/api/positions/intake",
      payload: { rawJdText: "公司：北极星科技\n岗位：AI 产品经理\n负责面试产品、RAG、增长分析。" },
    });
    const positionId = intake.json().positions[0].id as string;

    const resumeAi = await app.inject({
      method: "POST",
      url: "/api/resume/ai",
      payload: {
        positionId,
        action: "full",
        sectionId: "highlights",
        sectionTitle: "亮点摘要",
        currentText: "项目经历\n做过一个实时面试助手。",
        fullResumeText: "亮点摘要\n原亮点\n\n项目经历\n做过一个实时面试助手。",
        userMessage: "请优化整份简历",
      },
    });

    expect(resumeAi.statusCode).toBe(200);
    const body = resumeAi.json();
    expect(body.applyTarget).toBe("full");
    expect(body.suggestion).toContain("亮点摘要");
    expect(body.suggestion).toContain("项目经历");
    expect(body.suggestion).toContain("技能与工具");
    expect(body.suggestion).toContain("待补强");
    expect(body.meta.backendStatus).toBe("fallback");
    await app.close();
  });

  it("persists interview preferences on the current position", async () => {
    const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
    const { token } = await registerAndLogin(app, "13800138107", "偏好设置用户");
    const intake = await app.inject({
      method: "POST",
      url: "/api/positions/intake",
      headers: { authorization: `Bearer ${token}` },
      payload: { rawJdText: "公司：北极星科技\n岗位：AI 产品经理\n负责面试产品、RAG、增长分析。" },
    });
    const positionId = intake.json().positions[0].id as string;

    const response = await app.inject({
      method: "POST",
      url: `/api/positions/${positionId}/preferences`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        interviewerRole: "业务负责人",
        difficulty: "压力面",
        interviewerGender: "男",
        submitMode: "auto",
        style: "pressure",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.position.interviewPreferences).toMatchObject({
      interviewerRole: "业务负责人",
      difficulty: "压力面",
      interviewerGender: "男",
      submitMode: "auto",
      style: "pressure",
    });
    expect(body.position.intake.configuredInterview).toBe(true);
    await app.close();
  });

  it("returns the latest active mock session, completes it, and stops restoring it afterward", async () => {
    const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
    const { token } = await registerAndLogin(app, "13800138108", "恢复会话用户");
    const intake = await app.inject({
      method: "POST",
      url: "/api/positions/intake",
      headers: { authorization: `Bearer ${token}` },
      payload: { rawJdText: "公司：北极星科技\n岗位：AI 产品经理\n负责面试产品、RAG、增长分析。" },
    });
    const positionId = intake.json().positions[0].id as string;

    const sessionResponse = await app.inject({
      method: "POST",
      url: "/api/mock/session",
      headers: { authorization: `Bearer ${token}` },
      payload: { positionId, config: { stage: "上级", difficulty: "压力面", submitMode: "manual" } },
    });
    const sessionId = sessionResponse.json().sessionId as string;

    const latest = await app.inject({
      method: "GET",
      url: `/api/positions/${positionId}/mock-session`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(latest.statusCode).toBe(200);
    expect(latest.json().session.id).toBe(sessionId);
    expect(latest.json().session.completedAt).toBeUndefined();

    const complete = await app.inject({
      method: "POST",
      url: `/api/mock/session/${sessionId}/complete`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.json().ok).toBe(true);

    const afterComplete = await app.inject({
      method: "GET",
      url: `/api/positions/${positionId}/mock-session`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(afterComplete.statusCode).toBe(404);
    expect(afterComplete.json().error).toBe("MOCK_SESSION_NOT_FOUND");
    await app.close();
  });

  it("deletes a position and cascades its records, materials, questions and mock sessions", async () => {
    const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
    const { token } = await registerAndLogin(app, "13800138109", "删除岗位用户");
    const intake = await app.inject({
      method: "POST",
      url: "/api/positions/intake",
      headers: { authorization: `Bearer ${token}` },
      payload: { rawJdText: "公司：北极星科技\n岗位：AI 产品经理\n负责面试产品、RAG、增长分析。" },
    });
    const snapshot = intake.json();
    const positionId = snapshot.positions[0].id as string;

    await app.inject({
      method: "POST",
      url: `/api/positions/${positionId}/materials`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        materials: [
          {
            id: "material-1",
            kind: "upload",
            source: "upload",
            title: "项目资料",
            detail: "一份真实项目资料",
            summary: "一份真实项目资料",
            keywords: ["项目"],
            tags: ["上传资料"],
            linkedQuestionIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    });

    await app.inject({
      method: "POST",
      url: `/api/positions/${positionId}/questions`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        questions: [
          {
            id: "question-1",
            category: "项目深挖",
            question: "你怎么做 RAG 召回？",
            reason: "用户手动保存问题",
            evidenceIds: [],
            difficulty: "中等",
            source: "manual",
            priority: true,
            notes: "重点题",
            answer: "",
            cueCardIds: [],
            tags: ["用户保存"],
          },
        ],
      },
    });

    const sessionResponse = await app.inject({
      method: "POST",
      url: "/api/mock/session",
      headers: { authorization: `Bearer ${token}` },
      payload: { positionId, config: { stage: "上级", difficulty: "正常", submitMode: "manual" } },
    });
    const sessionBody = sessionResponse.json();

    const answerResponse = await app.inject({
      method: "POST",
      url: `/api/mock/session/${sessionBody.sessionId}/answer`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        positionId,
        answer: "我负责一套面试助手项目，做了 RAG 检索和回归验证。",
        transcript: [
          { role: "interviewer", text: sessionBody.question },
          { role: "candidate", text: "我负责一套面试助手项目，做了 RAG 检索和回归验证。" },
        ],
      },
    });
    expect(answerResponse.statusCode).toBe(200);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/positions/${positionId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleteResponse.statusCode).toBe(200);

    const state = deleteResponse.json();
    expect(state.positions.some((position: { id: string }) => position.id === positionId)).toBe(false);
    expect(state.records.some((record: { positionId: string }) => record.positionId === positionId)).toBe(false);

    const records = await app.inject({ method: "GET", url: "/api/records", headers: { authorization: `Bearer ${token}` } });
    expect(records.json().records.some((record: { positionId: string }) => record.positionId === positionId)).toBe(false);

    const context = await app.inject({ method: "GET", url: `/api/positions/${positionId}/context`, headers: { authorization: `Bearer ${token}` } });
    expect(context.statusCode).toBe(404);

    const latestMockSession = await app.inject({ method: "GET", url: `/api/positions/${positionId}/mock-session`, headers: { authorization: `Bearer ${token}` } });
    expect(latestMockSession.statusCode).toBe(404);
    await app.close();
  });

  describe("auth API", () => {
    it("registers a new user with phone and password", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138001", password: "Password123", displayName: "测试用户" },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.user.phone).toBe("13800138001");
      expect(body.user.displayName).toBe("测试用户");
      expect(body.tokens.accessToken).toBeTruthy();
      await app.close();
    });

    it("registers without requiring consent", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138002", password: "Password123" },
      });

      expect(response.statusCode).toBe(201);
      await app.close();
    });

    it("rejects duplicate phone registration", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138003", password: "Password123" },
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138003", password: "Password123" },
      });

      expect(response.statusCode).toBe(409);
      await app.close();
    });

    it("logs in with phone and password", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138004", password: "Password123" },
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { phone: "13800138004", password: "Password123" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.user.phone).toBe("13800138004");
      expect(body.tokens.accessToken).toBeTruthy();
      await app.close();
    });

    it("rejects login with wrong password", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138005", password: "Password123" },
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { phone: "13800138005", password: "WrongPassword123" },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it("returns session for valid token", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138006", password: "Password123", displayName: "会话测试" },
      });
      const token = reg.json().tokens.accessToken;

      const response = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.userId).toBeTruthy();
      expect(body.displayName).toBe("会话测试");
      await app.close();
    });

    it("rejects session with invalid token", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
      const response = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: "Bearer invalid-token" },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it("logout invalidates session", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138007", password: "Password123" },
      });
      const token = reg.json().tokens.accessToken;

      await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { authorization: `Bearer ${token}` },
      });

      const session = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(session.statusCode).toBe(401);
      await app.close();
    });

    it("merges guest data after registration", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138008", password: "Password123", displayName: "合并测试" },
      });
      const token = reg.json().tokens.accessToken;

      const merge = await app.inject({
        method: "POST",
        url: "/api/auth/merge-guest",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          profile: { displayName: "游客", resumeText: "简历内容", resume: {}, evidenceLibrary: [], highlights: [] },
          positions: [{ id: "guest-pos-1", title: "测试岗", company: "测试公司", jobText: "测试JD" }],
          records: [{ id: "guest-rec-1", positionId: "guest-pos-1", mode: "mock", title: "测试记录" }],
        },
      });

      expect(merge.statusCode).toBe(200);
      expect(merge.json().mergedPositions).toBe(1);
      expect(merge.json().mergedRecords).toBe(1);

      const state = await app.inject({
        method: "GET",
        url: "/api/state",
        headers: { authorization: `Bearer ${token}` },
      });
      const body = state.json();
      expect(body.positions.some((p: { id: string }) => p.id === "guest-pos-1")).toBe(true);

      await app.close();
    });

    it("returns quota info for guest and authenticated user", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });

      const guestQuota = await app.inject({ method: "GET", url: "/api/quota" });
      expect(guestQuota.statusCode).toBe(200);
      expect(guestQuota.json().isGuest).toBe(true);
      expect(guestQuota.json().dailyLimit).toBe(3);

      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138009", password: "Password123" },
      });
      const token = reg.json().tokens.accessToken;

      const userQuota = await app.inject({
        method: "GET",
        url: "/api/quota",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(userQuota.statusCode).toBe(200);
      expect(userQuota.json().isGuest).toBe(false);
      expect(userQuota.json().dailyLimit).toBe(10);

      await app.close();
    });

    it("sends verification email, verifies token, and exposes updated session state", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138020", password: "Password123" },
      });
      expect(reg.statusCode).toBe(201);
      const token = reg.json().tokens.accessToken as string;

      const profileUpdate = await app.inject({
        method: "POST",
        url: "/api/account/profile",
        headers: { authorization: `Bearer ${token}` },
        payload: { email: "verify@example.com" },
      });
      expect(profileUpdate.statusCode).toBe(200);

      const outbox = await app.inject({
        method: "GET",
        url: "/api/mail/outbox",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(outbox.statusCode).toBe(200);
      const verifyMail = outbox.json().items.find((item: { template: string }) => item.template === "verifyEmail");
      expect(verifyMail).toBeTruthy();
      const verifyUrl = String(verifyMail.variables.verifyUrl);
      const verifyToken = new URL(verifyUrl).searchParams.get("token");
      expect(verifyToken).toBeTruthy();

      const verifyRes = await app.inject({
        method: "POST",
        url: "/api/auth/email/verify",
        payload: { token: verifyToken },
      });
      expect(verifyRes.statusCode).toBe(200);

      const session = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(session.statusCode).toBe(200);
      expect(session.json().emailVerifiedAt).toBeTruthy();
      await app.close();
    });

    it("sends password reset email and resets password successfully", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138021", password: "OldPassword123" },
      });
      const authToken = reg.json().tokens.accessToken as string;

      const profileUpdate = await app.inject({
        method: "POST",
        url: "/api/account/profile",
        headers: { authorization: `Bearer ${authToken}` },
        payload: { email: "reset@example.com" },
      });
      expect(profileUpdate.statusCode).toBe(200);

      const initialOutbox = await app.inject({
        method: "GET",
        url: "/api/mail/outbox",
        headers: { authorization: `Bearer ${authToken}` },
      });
      const verifyMail = initialOutbox.json().items.find((item: { template: string }) => item.template === "verifyEmail");
      const verifyToken = new URL(String(verifyMail.variables.verifyUrl)).searchParams.get("token");
      await app.inject({
        method: "POST",
        url: "/api/auth/email/verify",
        payload: { token: verifyToken },
      });

      const forgot = await app.inject({
        method: "POST",
        url: "/api/auth/password/forgot",
        payload: { email: "reset@example.com" },
      });
      expect(forgot.statusCode).toBe(200);

      const outbox = await app.inject({
        method: "GET",
        url: "/api/mail/outbox",
        headers: { authorization: `Bearer ${authToken}` },
      });
      const resetMail = outbox.json().items.find((item: { template: string }) => item.template === "resetPassword");
      expect(resetMail).toBeTruthy();
      const resetToken = new URL(String(resetMail.variables.resetUrl)).searchParams.get("token");
      expect(resetToken).toBeTruthy();

      const reset = await app.inject({
        method: "POST",
        url: "/api/auth/password/reset",
        payload: { token: resetToken, password: "NewPassword456" },
      });
      expect(reset.statusCode).toBe(200);

      const login = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { phone: "13800138021", password: "NewPassword456" },
      });
      expect(login.statusCode).toBe(200);
      await app.close();
    });

    it("deletes account with DELETE confirmation and invalidates session", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138022", password: "Password123" },
      });
      const token = reg.json().tokens.accessToken as string;

      const deletion = await app.inject({
        method: "DELETE",
        url: "/api/user",
        headers: { authorization: `Bearer ${token}` },
        payload: { confirmationText: "DELETE" },
      });
      expect(deletion.statusCode).toBe(200);

      const session = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(session.statusCode).toBe(401);
      await app.close();
    });
  });

  describe("onboarding", () => {
    it("onboarding sets journeyState to ready and creates default position", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138010", password: "Password123", displayName: "测试用户" },
      });
      const token = reg.json().tokens.accessToken;

      const onboardRes = await app.inject({
        method: "POST",
        url: "/api/onboarding",
        headers: { authorization: `Bearer ${token}` },
        payload: { targetRole: "AI 产品经理", city: "北京", experience: "3-5 年", stage: "准备面试" },
      });
      expect(onboardRes.statusCode).toBe(200);
      const body = onboardRes.json();
      expect(body.ok).toBe(true);
      expect(body.position).toBeTruthy();
      expect(body.position.title).toBe("AI 产品经理");
      expect(body.nextStep).toMatch(/intake_jd|import_resume|start_mock/);

      const state = await app.inject({
        method: "GET",
        url: "/api/state",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(state.json().journeyState).toBe("ready");
      expect(state.json().positions.length).toBe(1);

      await app.close();
    });
    it("record save keeps ready journey state", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138012", password: "Password123" },
      });
      const token = reg.json().tokens.accessToken;

      await app.inject({
        method: "POST",
        url: "/api/onboarding",
        headers: { authorization: `Bearer ${token}` },
        payload: { targetRole: "测试岗位" },
      });

      const state = await app.inject({
        method: "GET",
        url: "/api/state",
        headers: { authorization: `Bearer ${token}` },
      });
      const positionId = state.json().positions[0].id;

      const recordRes = await app.inject({
        method: "POST",
        url: "/api/records",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          id: "test-record-1",
          positionId,
          mode: "mock",
          title: "首次模拟面试",
          transcript: [{ role: "interviewer", text: "请做自我介绍" }, { role: "candidate", text: "我是测试候选人" }],
          cueCards: [],
          questionIds: [],
          speechMetrics: [],
          report: {
            overallScore: 75,
            dimensions: { completeness: 70, relevance: 80, evidenceStrength: 60, structure: 75, riskControl: 70 },
            summary: "测试报告",
            nextActions: ["复习项目深挖题"],
            source: "local",
          },
          summary: "测试记录",
          createdAt: new Date().toISOString(),
        },
      });
      expect(recordRes.statusCode).toBe(200);

      const finalState = await app.inject({
        method: "GET",
        url: "/api/state",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(finalState.json().journeyState).toBe("ready");

      await app.close();
    });
  });
});
