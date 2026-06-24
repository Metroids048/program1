# AI 求职台 — 产品需求文档 v2.0

> **项目**：`campus-interview-ai-workbench`（program1-main）
> **定位**：面向应届、实习和校招用户的本地优先 Web MVP
> **主线**：导入/确认简历与 JD → 开启实时面试助手 → 识别问题 → 生成提词卡 → 保存记录 → 复盘改进
> **最后更新**：2026-06-24，基于 `src/` + `server/` 全部源码梳理

---

## 一、产品概述

### 1.1 一句话描述

围绕真实 JD、简历和面试记录，完成从准备到复盘的 AI 面试闭环——不代答、不捕获系统音频、不把本地规则伪装成模型成功。

### 1.2 目标用户

| 用户角色 | 核心场景 |
|---------|---------|
| 应届毕业生 | 校招面试准备，第一份工作面试 |
| 实习生 | 实习面试突击，快速了解岗位要求 |
| 校招求职者 | 多岗位并行准备，记录复盘 |

### 1.3 竞品参考

Final Round AI、LockedIn AI、Interviews.chat、OfferGoose 的实时转写、即时建议、JD/简历个性化、会后反馈闭环。

### 1.4 技术栈

| 层 | 技术 | 备注 |
|---|------|------|
| 前端 | React 19 + TypeScript + Vite 7 | SPA，无 SSR |
| 后端 | Fastify 5 + better-sqlite3 | 本地单用户为主，可选多用户认证 |
| AI 模型 | DeepSeek V4 (flash / pro) | 通过 `server/llm.ts` 统一调用 |
| 搜索引擎 | Tavily / Bing / SerpAPI | 可选，用于联网搜索公司/岗位信息 |
| 样式 | CSS Custom Properties | `src/styles/tokens.css` + `styles.css`（79KB 手写） |
| 语音 | Web Speech API | 浏览器麦克风，不抓系统音频 |
| 验证 | ESLint + Vitest + TypeScript | `npm run verify` = lint + typecheck + test + build |

---

## 二、产品架构

### 2.1 系统分层

```
浏览器 (React SPA :5173)
    │
    ├── Vite proxy → Fastify Server (:8787)
    │     ├── SQLite (.data/ai-job-platform.sqlite)
    │     ├── AI Orchestrator (server/orchestrator.ts, 65KB)
    │     │     ├── Prompt Registry (server/prompts/registry.ts)
    │     │     ├── Skills Registry (server/skills/registry.ts)
    │     │     ├── RAG (server/rag.ts)
    │     │     └── Search Tool (server/search.ts)
    │     ├── Auth Service (server/domains/auth/)
    │     ├── Quota Service (server/domains/quota/)
    │     └── Mail Service (server/mail/)
    │
    └── Local Fallback (src/lib/coach.ts, localStorage)
          └── 后端不可用时降级为本地练习模式
```

### 2.2 前端目录结构

```
src/
├── App.tsx                     # 根组件：全局状态 + 路由编排 + 28 条路由分支
├── App.test.tsx                # 集成测试（21KB）
├── main.tsx                    # 入口
├── types.ts                    # 全部 TS 类型（9.5KB, 40+ 接口/类型）
├── styles.css                  # 全局样式（79KB）
├── styles/tokens.css           # 设计 Token
├── components/
│   ├── appShell.tsx            # 导航壳：侧栏 + 顶栏 + 移动端汉堡菜单
│   ├── shared.tsx              # 共享组件 + 工具函数 + 常量（15KB）
│   ├── home.tsx                # 首页 Dashboard（JD 输入 + 岗位卡 + CTA）
│   ├── jobs.tsx                # 岗位列表页（带抽屉详情）
│   ├── jd.tsx                  # JD 解析工作台
│   ├── conversation.tsx        # 对话式 JD 完善
│   ├── context.tsx             # 上下文资料（JD/资料库/简历 Tab 合一）
│   ├── live.tsx                # 实时助手驾驶舱 + 模拟面试房间（42KB, 最复杂组件）
│   ├── interactiveCueCard.tsx  # 交互式提词卡
│   ├── mock-setup.tsx          # 模拟面试配置页
│   ├── personaSelector.tsx     # 面试官人设选择器
│   ├── questions.tsx           # 资料库（项目资料 + 问题笔记）
│   ├── records.tsx             # 面试记录列表 + 报告详情 + 账户弹窗
│   ├── resume.tsx              # 简历优化工作台
│   ├── auth/                   # 登录/注册/找回密码/邮箱验证/AuthGate
│   ├── account/                # 账户管理页
│   ├── onboarding/             # 新用户引导
│   ├── legal/                  # 法律条款
│   └── system/                 # SEO + ErrorBoundary + 404/500
├── lib/
│   ├── router.ts               # 路由解析（27 条路由）
│   ├── apiClient.ts            # 业务 API 封装（13KB）
│   ├── auth.ts                 # 认证 Hook
│   ├── authClient.ts           # API 客户端（带 auth header）
│   ├── interviewEngine.ts      # 面试引擎（46KB, 最复杂 lib）
│   ├── coach.ts                # 本地降级逻辑
│   ├── store.ts                # 本地缓存（localStorage 持久化）
│   ├── copy.ts                 # 文本修复（10KB）
│   ├── resumeImport.ts         # 简历文件导入（txt/md/pdf/docx）
│   ├── speech.ts               # 语音识别封装
│   ├── speechAnalysis.ts       # 语音指标分析
│   ├── cueCardCache.ts         # 提词卡缓存
│   ├── reportExport.ts         # 报告导出
│   ├── seo.ts                  # SEO 工具
│   ├── text.ts                 # 文本工具
│   └── llm/                    # LLM Provider 抽象
└── data/
    └── sampleInputs.ts         # 示例 JD 数据
```

---

## 三、路由表（27 条路由）

| # | 路由名称 | 路径 | 参数 | 渲染组件 | 说明 |
|---|---------|------|------|---------|------|
| 1 | home | `/` | — | HomeDashboard | 首页：JD 输入 + 岗位卡 |
| 2 | jobs | `/jobs` | — | JobsPage | 岗位列表 |
| 3 | positionDetail | `/jobs/:positionId` | positionId | JobsPage | 岗位详情抽屉 |
| 4 | conversation | `/conversations/:sessionId` | sessionId | ConversationPage | 对话完善 |
| 5 | live | `/live` | — | LiveAssistantDashboard | 实时助手（空状态） |
| 6 | livePosition | `/live/:positionId` | positionId | LiveAssistantDashboard | 实时助手（指定岗位） |
| 7 | mock | `/mock` | — | InterviewRoomView | 模拟面试（空状态） |
| 8 | mockSetup | `/mock/setup/:positionId` | positionId | MockSetupPage | 模拟面试配置 |
| 9 | mockRoom | `/mock/room/:sessionId` | sessionId | InterviewRoomView | 模拟面试房间 |
| 10 | jd | `/jd` | — | JdWorkspace | JD 解析工作台 |
| 11 | questions | `/questions` | — | QuestionsWorkspace | 资料库 |
| 12 | resume | `/resume` | — | ResumeWorkspacePage | 简历优化 |
| 13 | records | `/records` | — | RecordsView | 面试记录列表 |
| 14 | recordDetail | `/records/:recordId` | recordId | RecordsView | 记录详情 |
| 15 | authLogin | `/auth/login` | returnTo? | AuthPage(login) | 登录 |
| 16 | authRegister | `/auth/register` | returnTo? | AuthPage(register) | 注册 |
| 17 | forgotPassword | `/forgot-password` | — | ForgotPasswordPage | 忘记密码 |
| 18 | resetPassword | `/reset-password` | token? | ResetPasswordPage | 重置密码 |
| 19 | verifyEmail | `/verify-email` | token? | VerifyEmailPage | 邮箱验证 |
| 20 | onboarding | `/onboarding` | — | OnboardingPage | 新用户引导 |
| 21 | account | `/account` | — | AccountPage | 账户管理 |
| 22 | legalTerms | `/legal/terms` | — | LegalPage | 服务条款 |
| 23 | legalPrivacy | `/legal/privacy` | — | LegalPage | 隐私政策 |
| 24 | termsOfService | `/terms-of-service` | — | LegalPage | 服务条款（别名） |
| 25 | privacyPolicy | `/privacy-policy` | — | LegalPage | 隐私政策（别名） |
| 26 | notFound | `/404` | — | NotFoundPage | 404 |
| 27 | serverError | `/500` | — | ServerErrorPage | 500 |

**公开路由**（无需登录）：home, jobs, authLogin, authRegister, forgotPassword, resetPassword, verifyEmail, legalTerms, legalPrivacy, termsOfService, privacyPolicy, notFound, serverError

**导航映射**（路由 → AppShell 侧栏高亮）：
- home → "首页"
- live / livePosition → "实时助手"
- mock / mockSetup / mockRoom → "模拟面试"
- jd → "JD 解析"
- questions → "资料库"
- resume → "简历优化"
- records / recordDetail → "面试记录"
- auth* / onboarding / legal* / 404 / 500 / account → "首页"

---

## 四、功能模块详细说明

### 4.1 首页 Dashboard（`/`）

**组件**：`HomeDashboard` (home.tsx, 7KB)

用户进入后的第一屏。核心设计原则：**首屏只保留主标题、对话输入、岗位卡、主要 CTA**（1280x720 分辨率下）。

- **JD 输入区**：textarea + 快捷提示按钮（3 个预设场景）
- **岗位摘要卡**：显示当前岗位状态（待确认 intake / 待进入练习 / 已有练习）
- **核心 CTA**：实时助手（主按钮）、模拟面试、上下文资料入口
- **状态显示**：QuotaBadge（用量配额）

**关键交互**：
1. 输入 JD 文本 → 保存 → `upsertPositionIntakeOnServer` → 跳转对话完善
2. 点击"实时助手" → `/live`
3. 点击"模拟面试" → 创建 mock session → `/mock/room/:sessionId`

### 4.2 实时助手驾驶舱（`/live`、`/live/:positionId`）

**组件**：`LiveAssistantDashboard` (live.tsx, 42KB — 最复杂组件)

面试中的实时 AI 辅助面板。核心能力：听取/输入面试官问题 → 生成提词卡。

**功能**：
- **语音输入**：Web Speech API 转写，区分 interim / final / editable 文本
- **手动输入**：文字输入面试官问题
- **提词卡自动生成**：检测到新问题 → 500ms 延迟 → 本地提词卡 → SSE 流式获取服务端卡片替换
- **提词卡结构**：策略(strategy) + 开场句(openingLine) + 要点(bullets) + 证据引用(evidenceIds) + 风险提醒(risks) + 追问预测(followUps)
- **辅助面板切换**：提词卡 / 证据库 / 问题库 / 逐字稿（helperPanelState）
- **语音指标**：字数、时长、语速、填充词（SpeechMetrics）
- **模型状态标记**：`模型生成` 或 `本地练习`，后端状态透明

**关键状态**：
- `backendStatus: "connected" | "fallback" | "disconnected"`
- 停止听取不丢失已识别文本（只有用户点清空才清空）

### 4.3 模拟面试（`/mock`、`/mock/setup/:positionId`、`/mock/room/:sessionId`）

**组件**：`MockSetupPage` + `InterviewRoomView`

**配置页**：
- 面试官角色：HR / 上级 / CTO / CEO / 业务负责人
- 难度：正常 / 压力面 / 地狱面
- 风格：gentle / strict / pressure
- 面试官性别：女 / 男
- 提交模式：manual / auto

**面试房间**：
- 后端 `POST /api/mock/session` 创建会话 → 返回首个问题
- 用户回答 → `POST /api/mock/session/:id/answer` → AI 决策（followup 追问 / next 下一题）
- 每轮即时反馈（score + feedback）
- 实时提词卡辅助
- 面试结束 → 生成 InterviewReport（5 维度评分）→ 保存 InterviewRecord

### 4.4 JD 解析工作台（`/jd`）

**组件**：`JdWorkspace` (jd.tsx, 8.8KB)

独立的 JD 分析和岗位配置页面。
- JD 原文编辑 + AI 解析（JobAnalysis：title/company/responsibilities/hardSkills/softSkills/hiddenSignals/keywords）
- 人岗匹配报告（MatchReport：score/gaps/rewriteSuggestions）
- 岗位面试配置

### 4.5 上下文资料（context.tsx）

**组件**：`ContextWorkspace` — JD + 资料库 + 简历三 Tab 合一

这是实时助手的"弹药库"，不是独立工作台：
- **Tab 1: JD 与岗位卡** — JD 解析结果 + 岗位配置
- **Tab 2: 资料库** — 项目资料（PositionMaterial）+ 问题笔记（InterviewQuestion）
- **Tab 3: 简历证据** — 简历分区编辑 + AI 优化 + 文件导入

### 4.6 资料库（`/questions`）

**组件**：`QuestionsWorkspace` (questions.tsx, 20KB)

- **项目资料**：上传 txt/md/pdf/docx → 解析为 PositionMaterial → 标记使用范围(live/mock/resume)
- **问题笔记**：手动添加面试问题，分类/难度/标签/笔记
- **RAG 上下文**：所有资料自动进入实时助手和模拟面试的 AI prompt 上下文
- **概览面板**：资料统计 + 最近更新时间 + 影响模块标签

### 4.7 简历优化（`/resume`）

**组件**：`ResumeWorkspacePage` (resume.tsx, 23KB)

- **分区编辑**：简历按 highlights/projects/experience/skills/education 分区
- **AI 优化**：`POST /api/copilot/resume/ai` — 支持 section/full/match 三种 action
- **文件导入**：txt/md/pdf/docx（mammoth + pdfjs-dist）
- **亮点生成**：`POST /api/profile/highlights` — 自动提取简历亮点
- **降级**：后端不可用时使用 `coach.ts` 本地算法

### 4.8 对话完善（`/conversations/:sessionId`）

**组件**：`ConversationPage` (conversation.tsx, 13.7KB)

AI 对话式交互完善岗位信息。
- 消息列表（用户 + AI 助手）
- 自动字段提取：company / role / interviewer / difficulty / duration / hasJd
- JD 草稿实时更新
- 配置草稿预览

### 4.9 面试记录（`/records`、`/records/:recordId`）

**组件**：`RecordsView` (records.tsx, 18.8KB)

- **记录列表**：live 和 mock 两种模式的历史记录
- **记录详情**：逐字稿 + 提词卡 + 语音指标 + 面试报告
- **报告维度**（5 维评分）：completeness / relevance / evidenceStrength / structure / riskControl
- **后续行动**：LifecycleTask 列表
- **账户管理弹窗**：导入/导出/重命名/清除数据

### 4.10 用户认证系统

**路由**：`/auth/login`、`/auth/register`、`/forgot-password`、`/reset-password`、`/verify-email`

**后端**：`server/domains/auth/`（auth.service.ts 16KB + auth.routes.ts 6KB）
- JWT 认证（jsonwebtoken）
- 邮箱验证流程
- 密码重置流程
- 游客模式：未登录可使用基本功能，登录后合并游客数据（`POST /api/auth/merge-guest`）
- AuthGate 弹窗：访问需登录功能时弹出

### 4.11 配额系统

**后端**：`server/domains/quota/quota.service.ts`
- `GET /api/quota` — 查询配额信息
- 按操作类型计费：position-analyze、cue-card、cue-card-reconstruct 等
- 按用户 + 岗位数动态调整配额

### 4.12 其他页面

| 页面 | 组件 | 路由 |
|------|------|------|
| 新用户引导 | OnboardingPage | `/onboarding` |
| 账户管理 | AccountPage | `/account` |
| 法律条款 | LegalPage | `/legal/terms`、`/legal/privacy` |
| 404 | NotFoundPage | `/404` |
| 500 | ServerErrorPage | `/500` |
| SEO | Seo 组件 | 所有页面（title="AI 求职台"） |
| 错误边界 | ErrorBoundary | 包裹所有页面 |

---

## 五、数据模型

### 5.1 核心实体

```typescript
// 全局应用状态
AppState {
  profile: CandidateProfile      // 用户档案
  positions: Position[]          // 岗位列表（多岗位并行）
  activePositionId: string       // 当前激活岗位
  interviewRecords: InterviewRecord[]  // 面试记录
  activeRecordId: string         // 当前查看记录
  aiMode: boolean                // AI 模式开关
  journeyState: UserJourneyState // 用户旅程状态机
}

// 用户旅程状态机
UserJourneyState: "guest" → "onboarding" → "ready" → "preparing" → "interviewing" → "reviewing" → "returning"

// 岗位（核心聚合根）
Position {
  id, title, company, jobText, status      // 基础信息
  job: JobAnalysis                          // AI 解析
  matchReport: MatchReport                  // 人岗匹配
  questions: InterviewQuestion[]            // 面试题库
  materials: PositionMaterial[]             // 项目资料
  intake: PositionIntakeState               // 对话完善
  interviewPreferences: InterviewPreferences // 面试偏好
  analysisContext: PositionAnalysisContext   // 分析上下文
  mockTurns: MockTurn[]                     // 模拟面试轮次
  report: InterviewReport                   // 面试报告
}

// 提词卡（核心产品对象）
AnswerCueCard {
  id, questionText, createdAt, source
  strategy: string        // 策略建议
  openingLine: string     // 开场话术
  bullets: string[]       // 要点列表
  evidenceIds: string[]   // 引用证据 ID
  risks: string[]         // 风险提醒
  followUps: string[]     // 追问预测
}

// 面试记录
InterviewRecord {
  mode: "live" | "mock"
  transcript: MockMessage[]         // 对话逐字稿
  cueCards: AnswerCueCard[]         // 提词卡
  speechMetrics: SpeechMetrics[]    // 语音指标
  report: InterviewReport           // 面试报告
  aiMeta: InterviewAiMeta           // AI 状态元信息
}
```

### 5.2 数据库表（SQLite，12 张业务表 + 认证表）

| 表名 | 用途 | 迁移文件 |
|------|------|---------|
| `app_state` | 用户全局状态 JSON | 001_init.sql |
| `cue_cards` | 提词卡 JSON | 001_init.sql |
| `interview_records` | 面试记录 JSON | 001_init.sql |
| `search_results` | 搜索结果缓存 | 001_init.sql |
| `prompt_runs` | AI Prompt 运行日志 | 001_init.sql |
| `mock_sessions` | 模拟面试会话 | 001_init.sql |
| `cue_card_cache` | 提词卡缓存（去重） | 001_init.sql |
| `documents` | RAG 文档 | 001_init.sql |
| `document_chunks` | RAG 文档分块 | 001_init.sql |
| `document_chunks_fts` | 全文搜索索引（FTS5） | 001_init.sql |
| `retrieval_runs` | RAG 检索日志 | 001_init.sql |
| `conversation_sessions` | 对话完善会话 | 007_conversations.sql |
| `interview_sessions` | 面试会话持久化 | 007_conversations.sql |
| `users` / `sessions` / `verification_codes` | 认证系统 | 002-006_auth |
| `quota_records` | 配额记录 | 004_quota.sql |
| `feedback_tickets` | 用户反馈 | 005_growth_feedback.sql |
| `audit_events` | 审计日志 | scattered |

---

## 六、API 端点（~30 个）

### 6.1 状态与健康

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查（searchProvider + model） |
| GET | `/api/state` | 获取用户全局状态快照 |

### 6.2 认证（server/domains/auth/）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/logout` | 登出 |
| POST | `/api/auth/send-verification` | 发送验证码 |
| POST | `/api/auth/verify-email` | 验证邮箱 |
| POST | `/api/auth/forgot-password` | 忘记密码 |
| POST | `/api/auth/reset-password` | 重置密码 |
| POST | `/api/auth/merge-guest` | 游客数据合并到登录账户 |

### 6.3 岗位与 Profile

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/positions/intake` | 创建/更新岗位 intake |
| POST | `/api/positions/analyze` | AI 解析 JD（消耗配额） |
| GET | `/api/positions/:id/context` | 获取岗位上下文（profile+position+questions+evidence） |
| POST | `/api/positions/:id/materials` | 更新岗位资料 |
| POST | `/api/positions/:id/questions` | 更新岗位问题库 |
| POST | `/api/profile` | 更新用户档案 |
| POST | `/api/profile/analyze` | AI 解析简历 |
| POST | `/api/profile/highlights` | 生成简历亮点 |

### 6.4 AI Copilot

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/copilot/cue-card/stream` | SSE 流式生成提词卡 |
| POST | `/api/copilot/cue-card/reconstruct` | SSE 流式重构提词卡（基于反馈） |
| POST | `/api/copilot/follow-up` | AI 面试追问/下一题 |
| POST | `/api/copilot/resume/ai` | AI 简历优化（section/full/match） |

### 6.5 模拟面试

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/mock/session` | 创建模拟面试会话 |
| POST | `/api/mock/session/:id/answer` | 提交回答，获取 AI 响应 |

### 6.6 记录与数据

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/records` | 保存面试记录 |
| GET | `/api/records` | 获取面试记录列表 |
| GET | `/api/records/:id` | 获取单条记录 |
| POST | `/api/search` | 联网搜索 |
| POST | `/api/data/export` | 导出用户数据 |
| POST | `/api/data/delete-request` | 删除用户数据 |

### 6.7 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/onboarding` | 完成引导 |
| POST | `/api/feedback` | 提交反馈 |
| GET | `/api/quota` | 查询配额 |
| GET | `/api/mail/outbox` | 开发环境邮件查阅 |

---

## 七、用户旅程（关键路径）

### 7.1 首次用户完整旅程

```
1. 进入 /（首页）
   → 看到面试准备标题 + JD 输入框 + 快捷提示

2. 粘贴 JD 文本 → 点击"保存当前岗位"
   → 未登录 → AuthGate 弹窗 → 登录/注册
   → 已登录 → 创建 Position → AI 解析 JD

3. 可选：完善上下文
   → /jd（JD 解析工作台）→ 确认解析结果
   → /resume（简历优化）→ 上传简历
   → /questions（资料库）→ 补充项目资料

4. 点击"实时助手" → /live
   → 面试官提问 → 语音/文字输入
   → 自动生成提词卡（策略+话术+要点+证据+风险+追问）
   → 回答后查看语音指标

5. 或点击"模拟面试" → /mock/room/:sessionId
   → AI 扮演面试官提问
   → 回答 → AI 评分 + 反馈
   → 面试结束 → 生成 5 维度报告 → 保存记录

6. 查看 /records
   → 复盘逐字稿、提词卡、报告
   → 看到后续行动建议（LifecycleTask）
```

### 7.2 老用户回归

```
1. 进入 / → 看到已有岗位卡（含状态：待确认/待练习/已有练习）
2. 直接进入实时助手或模拟面试
3. 查看 /records 复盘之前的表现
```

---

## 八、验收标准

### 8.1 功能 AC

| # | 条件 | 验证方式 |
|---|------|---------|
| AC1 | 输入 JD → 保存 → AI 解析 → 生成 JobAnalysis | 手动走查 |
| AC2 | 实时助手：输入/语音问题 → 提词卡自动生成（含 6 元素） | 手动走查 |
| AC3 | 停止听取后已识别文本不丢失 | 手动测试 |
| AC4 | 模拟面试：配置 → 创建会话 → 多轮问答 → 评分报告 | 手动走查 |
| AC5 | 简历上传 txt/md/pdf/docx → 正确解析 | 自动化测试 |
| AC6 | 后端不可用时各模块降级为本地练习模式 | 断网测试 |
| AC7 | 登录/注册/找回密码/邮箱验证完整可用 | 手动走查 |
| AC8 | 游客数据 → 登录后合并（merge-guest） | 手动测试 |
| AC9 | 1280x720 首屏：标题 + 输入 + 岗位卡 + CTA 完整可见 | 手动验证 |
| AC10 | 390px 移动端：无横向溢出，按钮不重叠 | 手动验证 |

### 8.2 非功能 AC

| # | 条件 |
|---|------|
| NF1 | TypeScript 严格模式 + 无 any 逃逸 |
| NF2 | `npm run verify` 通过（lint + typecheck + test + build） |
| NF3 | 控制台无 error |
| NF4 | 本地练习模式不伪装成模型成功（明确标记 fallback 原因） |
| NF5 | 不捕获桌面系统音频 |
| NF6 | 不代答（提词卡只给框架，不输出完整逐字稿答案） |

---

## 九、关键约束

### 9.1 产品红线

- **禁止**代答：提词卡只输出回答框架，不输出自动代答逐字稿
- **禁止**伪装模型成功：后端未连接时必须标记本地练习模式
- **禁止**捕获系统音频：只用浏览器麦克风 + Web Speech API
- **禁止**启动脚本自动打开浏览器（Codex 端 IAB 会导致闪退）

### 9.2 技术约束

- 验证命令：`npm run verify`（= lint + typecheck:server + test + build）
- Codex Desktop 禁止 Browser / IAB / Chrome / Computer Use
- 所有文件 UTF-8；PowerShell 写含中文源码用 apply_patch
- 本项目 UI 浅色、克制、竞品式产品界面；禁止卡片套卡片、首屏塞满诊断信息

---

## 十、附录

### 10.1 关键文件大小索引

| 文件 | 大小 | 说明 |
|------|------|------|
| `src/components/live.tsx` | 42KB | 最复杂前端组件 |
| `src/lib/interviewEngine.ts` | 46KB | 最复杂 lib |
| `server/orchestrator.ts` | 65KB | 最复杂后端文件 |
| `server/index.ts` | 29KB | API 路由 + Zod schema |
| `server/db.ts` | 34KB | 数据库操作 |
| `src/styles.css` | 79KB | 手写 CSS（无框架） |
| `src/App.tsx` | 34KB | 全局状态 + 路由 |

### 10.2 环境变量

```bash
SERVER_PORT=8787
AI_JOB_DB_PATH=.data/ai-job-platform.sqlite
DEEPSEEK_API_KEY=your_key
SEARCH_PROVIDER=tavily      # tavily | bing | serpapi
SEARCH_API_KEY=your_key
```

### 10.3 参考资料（项目内）

- `README.md` — 项目总览
- `AGENTS.md` — Agent 交付规则（语音闸口、浏览器验收规则、UTF-8 门禁）
- `.github/agent/memory/RULES.md` — 执行规则（提问门禁、层级约束、功能删除门禁）
- `.github/agent/memory/project-memory.md` — 项目记忆（产品主线、约束、数据 owner）
- `.github/agent/memory/DESIGN.md` — 设计契约
- `全局配置/vibe.md` — Vibe Coding 全流程工程化指南
- `全局配置/产品设计整合优化方案-最终版.md` — 产品设计方案
- `AI功能Prompt设计完整方案.md` — AI Prompt 设计
- `docs/current/` — 公开 MVP 方案文档
- `docs/reports/` — 测试报告
