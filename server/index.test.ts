import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalFallbackProvider } from "./ai/provider";
import { buildServer } from "./index";

const tempDirs: string[] = [];

function testDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "ai-job-server-"));
  tempDirs.push(dir);
  return join(dir, "test.sqlite");
}

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe("local backend API", () => {
  it("analyzes a JD and returns persisted position context", async () => {
    const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
    const response = await app.inject({
      method: "POST",
      url: "/api/positions/analyze",
      payload: { jobText: "公司：测试科技\n岗位：AI 产品运营\n负责用户访谈、SQL 数据分析和增长复盘。" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.positions[0].questions.length).toBeGreaterThan(0);
    expect(body.activePositionId).toBeTruthy();
    await app.close();
  });

  it("streams cue-card stages and a final card with local fallback when AI is not configured", async () => {
    const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
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
    await app.close();
  });

  it("keeps search explicit when provider credentials are missing", async () => {
    const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
    const response = await app.inject({
      method: "POST",
      url: "/api/search",
      payload: { query: "Final Round AI interview copilot" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().results[0].provider).toBe("disabled");
    await app.close();
  });

  it("drives mock answers through the backend session and returns local practice metadata", async () => {
    const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
    const sessionResponse = await app.inject({
      method: "POST",
      url: "/api/mock/session",
      payload: { config: { stage: "上级", difficulty: "压力面", submitMode: "manual" } },
    });
    const session = sessionResponse.json();

    const answerResponse = await app.inject({
      method: "POST",
      url: `/api/mock/session/${session.sessionId}/answer`,
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
    await app.close();
  });

  it("keeps mock records consistent across state, records, export and service restart in file fallback mode", async () => {
    const dbPath = testDbPath();
    const app = buildServer({ dbPath, llmClient: new LocalFallbackProvider() });

    const sessionResponse = await app.inject({
      method: "POST",
      url: "/api/mock/session",
      payload: { config: { stage: "上级", difficulty: "压力面", submitMode: "manual" } },
    });
    const session = sessionResponse.json();

    const answerResponse = await app.inject({
      method: "POST",
      url: `/api/mock/session/${session.sessionId}/answer`,
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

    const stateResponse = await app.inject({ method: "GET", url: "/api/state" });
    const recordsResponse = await app.inject({ method: "GET", url: "/api/records" });
    const exportResponse = await app.inject({ method: "POST", url: "/api/export" });

    expect(stateResponse.json().records).toHaveLength(1);
    expect(recordsResponse.json().records).toHaveLength(1);
    expect(exportResponse.json().interviewRecords).toHaveLength(1);
    expect(stateResponse.json().records[0].id).toBe(recordId);
    expect(recordsResponse.json().records[0].id).toBe(recordId);
    expect(exportResponse.json().interviewRecords[0].id).toBe(recordId);

    await app.close();

    const restarted = buildServer({ dbPath, llmClient: new LocalFallbackProvider() });
    const restartedState = await restarted.inject({ method: "GET", url: "/api/state" });
    const restartedExport = await restarted.inject({ method: "POST", url: "/api/export" });

    expect(restartedState.json().records).toHaveLength(1);
    expect(restartedExport.json().interviewRecords).toHaveLength(1);
    expect(restartedState.json().records[0].id).toBe(recordId);
    expect(restartedExport.json().interviewRecords[0].id).toBe(recordId);

    await restarted.close();
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
    const intake = await app.inject({
      method: "POST",
      url: "/api/positions/intake",
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
    };

    const response = await app.inject({
      method: "POST",
      url: "/api/import",
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
    const response = await app.inject({
      method: "POST",
      url: "/api/import",
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

  describe("auth API", () => {
    it("sends SMS code and returns mock code in dev", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/sms/send",
        payload: { phone: "13800138000" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.mockCode).toBe("666666");
      await app.close();
    });

    it("registers a new user with valid SMS code", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });

      // Step 1: Send SMS
      await app.inject({
        method: "POST",
        url: "/api/auth/sms/send",
        payload: { phone: "13800138001" },
      });

      // Step 2: Register
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138001", smsCode: "666666", displayName: "测试用户" },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.user.phone).toBe("13800138001");
      expect(body.user.displayName).toBe("测试用户");
      expect(body.tokens.accessToken).toBeTruthy();
      await app.close();
    });

    it("rejects registration with wrong SMS code", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });

      await app.inject({
        method: "POST",
        url: "/api/auth/sms/send",
        payload: { phone: "13800138002" },
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138002", smsCode: "000000" },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it("rejects duplicate phone registration", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });

      await app.inject({ method: "POST", url: "/api/auth/sms/send", payload: { phone: "13800138003" } });
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138003", smsCode: "666666" },
      });

      // Second SMS + registration attempt
      await app.inject({ method: "POST", url: "/api/auth/sms/send", payload: { phone: "13800138003" } });
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138003", smsCode: "666666" },
      });

      expect(response.statusCode).toBe(409);
      await app.close();
    });

    it("logs in with SMS code", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });

      // Register first
      await app.inject({ method: "POST", url: "/api/auth/sms/send", payload: { phone: "13800138004" } });
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138004", smsCode: "666666" },
      });

      // Send SMS again for login
      await app.inject({ method: "POST", url: "/api/auth/sms/send", payload: { phone: "13800138004" } });
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { phone: "13800138004", smsCode: "666666" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.user.phone).toBe("13800138004");
      expect(body.tokens.accessToken).toBeTruthy();
      await app.close();
    });

    it("rejects login with wrong credentials", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { phone: "13900000000", smsCode: "000000" },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it("returns session for valid token", async () => {
      const app = buildServer({ dbPath: testDbPath(), llmClient: new LocalFallbackProvider() });

      await app.inject({ method: "POST", url: "/api/auth/sms/send", payload: { phone: "13800138005" } });
      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138005", smsCode: "666666", displayName: "会话测试" },
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

      await app.inject({ method: "POST", url: "/api/auth/sms/send", payload: { phone: "13800138006" } });
      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138006", smsCode: "666666" },
      });
      const token = reg.json().tokens.accessToken;

      // Logout
      await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { authorization: `Bearer ${token}` },
      });

      // Session should be invalid
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

      // Register
      await app.inject({ method: "POST", url: "/api/auth/sms/send", payload: { phone: "13800138007" } });
      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138007", smsCode: "666666", displayName: "合并测试" },
      });
      const token = reg.json().tokens.accessToken;

      // Merge guest data
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

      // Verify merged state
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

      // Guest quota
      const guestQuota = await app.inject({ method: "GET", url: "/api/quota" });
      expect(guestQuota.statusCode).toBe(200);
      expect(guestQuota.json().isGuest).toBe(true);
      expect(guestQuota.json().dailyLimit).toBe(3);

      // Register and check user quota
      await app.inject({ method: "POST", url: "/api/auth/sms/send", payload: { phone: "13800138008" } });
      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { phone: "13800138008", smsCode: "666666" },
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
  });
});
