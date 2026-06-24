import "dotenv/config";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../server/index";

function assertEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`MISSING_ENV:${name}`);
  }
  return value;
}

async function main() {
  assertEnv("DEEPSEEK_API_KEY");
  process.env.DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";

  const tempDir = mkdtempSync(join(tmpdir(), "ai-success-smoke-"));
  const dbPath = join(tempDir, "smoke.sqlite");
  const app = buildServer({ dbPath });
  try {
    const intake = await app.inject({
      method: "POST",
      url: "/api/positions/intake",
      payload: {
        rawJdText: "公司：测试科技\n岗位：AI 产品经理\n负责面试产品、用户研究、数据分析和 AI 功能落地。",
      },
    });
    if (intake.statusCode !== 200) throw new Error(`INTAKE_FAILED:${intake.statusCode}`);
    const positionId = intake.json().positions[0]?.id as string;

    const profile = await app.inject({
      method: "POST",
      url: "/api/profile",
      payload: {
        displayName: "测试候选人",
        resumeText: "测试候选人\nAI 产品经理\n做过面试助手、增长分析、项目推进。",
        evidenceLibrary: [
          {
            id: "ev-real-1",
            type: "项目",
            title: "面试助手项目",
            detail: "负责题词卡、RAG 召回和模拟面试链路设计。",
            keywords: ["RAG", "题词卡", "AI"],
            impact: "完成 MVP 闭环并支持真实资料导入。",
          },
        ],
        highlights: ["做过 AI 面试助手 MVP"],
      },
    });
    if (profile.statusCode !== 200) throw new Error(`PROFILE_FAILED:${profile.statusCode}`);

    const cueCard = await app.inject({
      method: "POST",
      url: "/api/copilot/cue-card/stream",
      payload: {
        questionText: "请介绍一个你做过的 AI 产品项目。",
        positionId,
        source: "live",
        enableSearch: false,
        recentHistory: [],
      },
    });
    const cueCardMatch = cueCard.body.match(/event: card\s+data: (.+)/);
    const cueCardPayload = cueCardMatch ? JSON.parse(cueCardMatch[1]) : null;

    const session = await app.inject({
      method: "POST",
      url: "/api/mock/session",
      payload: { positionId, config: { stage: "上级", difficulty: "压力面", submitMode: "manual" } },
    });
    if (session.statusCode !== 200) throw new Error(`MOCK_SESSION_FAILED:${session.statusCode}`);
    const sessionBody = session.json();

    const answer = await app.inject({
      method: "POST",
      url: `/api/mock/session/${sessionBody.sessionId}/answer`,
      payload: {
        positionId,
        answer: "我负责面试助手项目，先明确用户在真实面试中的提词需求，再设计 RAG 召回和题词卡生成链路，最后用真实资料回归验证可用性。",
        transcript: [
          { role: "interviewer", text: sessionBody.question },
          { role: "candidate", text: "我负责面试助手项目，做了 RAG 召回和题词卡链路。" },
        ],
      },
    });
    if (answer.statusCode !== 200) throw new Error(`MOCK_ANSWER_FAILED:${answer.statusCode}`);
    const answerBody = answer.json();

    const resumeAi = await app.inject({
      method: "POST",
      url: "/api/resume/ai",
      payload: {
        positionId,
        action: "section",
        sectionId: "projects",
        sectionTitle: "项目经历",
        currentText: "做过一个 AI 面试助手项目。",
        fullResumeText: "项目经历\n做过一个 AI 面试助手项目。",
        userMessage: "请优化这一段项目经历",
      },
    });
    if (resumeAi.statusCode !== 200) throw new Error(`RESUME_AI_FAILED:${resumeAi.statusCode}`);
    const resumeAiBody = resumeAi.json();

    const result = {
      model: process.env.DEEPSEEK_MODEL,
      cueCard: cueCardPayload?.meta?.backendStatus ?? null,
      mockAnswer: answerBody.meta?.backendStatus ?? answerBody.backendStatus ?? null,
      resumeAi: resumeAiBody.meta?.backendStatus ?? null,
    };

    if (result.cueCard !== "success" || result.mockAnswer !== "success" || result.resumeAi !== "success") {
      throw new Error(`SUCCESS_SMOKE_FAILED:${JSON.stringify(result)}`);
    }

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

void main();
