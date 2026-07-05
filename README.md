# AI 求职台

面向应届、实习和校招用户的本地优先 Web MVP。当前产品主线收敛为：

**导入/确认简历与 JD → 开启实时面试助手 → 识别问题 → 生成提词卡 → 保存记录 → 复盘改进**

产品参考 Final Round AI、LockedIn AI、Interviews.chat、OfferGoose 的实时转写、即时建议、JD/简历个性化、会后反馈闭环，但不做隐蔽代答、不捕获系统音频、不把本地规则伪装成模型成功。

## 核心体验

- **实时助手驾驶舱**：首页第一动作是听取或输入面试官问题，生成可讲的回答框架，而不是铺满 JD 诊断工作台。
- **上下文资料**：JD 与岗位卡、问题库、简历证据都收进二级区域，作为实时助手和模拟练习的上下文底座。
- **提词卡片**：输出回答策略、开场句、要点、可引用证据、风险提醒和可能追问，不输出自动代答逐字稿。
- **诚实模型状态**：提词卡和模拟追问展示 `模型生成` 或 `本地练习`，后端未连接、模型失败、JSON 不合规时明确标记 fallback 原因。
- **模拟练习**：作为实时助手前的预演模式，题序来自 JD、问题意图和简历证据排序；本地兜底时显示本地练习模式。
- **记录复盘**：实时助手和模拟练习都会保存记录，报告绑定当次 transcript、题词卡、证据命中和表达指标。

## 前端结构

`App.tsx` 只保留全局状态、导航和路由编排；主要页面拆到组件目录：

- `src/components/live.tsx`：实时助手驾驶舱、实时题词卡、模拟面试间。
- `src/components/context.tsx`：上下文资料、简历证据、问题库。
- `src/components/positions.tsx`：首页岗位台、JD 对话收集、岗位卡、面试配置入口。
- `src/components/records.tsx`：记录列表、复盘报告、账户与数据导入导出。
- `src/components/shared.tsx`：共享 UI、配置类型、辅助函数。

## 数据模型

`AppState` 仍是候选人档案加多 JD 容器：

- `profile: CandidateProfile`
- `positions: Position[]`
- `activePositionId: string`
- `interviewRecords: InterviewRecord[]`
- `activeRecordId: string`
- `aiMode: boolean`

关键接口：

- `AnswerCueCard`：一次实时问题或模拟问题生成的提词卡。
- `InterviewRecord.mode`：区分 `live` 实时助手记录和 `mock` 模拟练习记录。
- `AiRunMeta`：包含 `backendStatus`、`fallbackReason`、`evidenceTrace`、`latencyMs`。

## 本地运行

```bash
npm install
npm run dev
```

Vite 开发服务通常是 `http://127.0.0.1:5173/`。

## Local Backend

本地后端负责 SQLite 存储、AI prompt 编排、搜索工具和 SSE 提词卡。

```bash
npm run server
npm run dev
```

默认后端地址是 `http://127.0.0.1:8787`，Vite 会把 `/api/*` 代理到后端。未启动后端时，前端仍会使用本地规则和 localStorage 兜底，并在 UI 标记本地练习模式。

可选环境变量：

```bash
HOST=127.0.0.1
SERVER_PORT=8787
AI_JOB_DB_PATH=.data/ai-job-platform.sqlite
APP_BASE_URL=http://127.0.0.1:5173
APP_CORS_ORIGIN=http://127.0.0.1:5173
JWT_SECRET=replace-with-a-long-random-secret
DEEPSEEK_API_KEY=your_deepseek_key
SEARCH_PROVIDER=tavily # tavily | bing | serpapi
SEARCH_API_KEY=your_search_key
```

生产部署时不要启动 Vite dev server 对外服务。先构建前端，再运行 Fastify 服务返回 `dist` 静态文件与 `/api/*` 接口；容器或云平台可使用 `PORT` 覆盖端口，生产默认监听 `0.0.0.0`。`.env` 和 `.env.*` 不会进入 Docker 构建上下文，密钥应由部署平台以环境变量注入。

主要 API：

- `GET /api/health`
- `GET /api/state`
- `POST /api/profile/analyze`
- `POST /api/positions/analyze`
- `POST /api/copilot/cue-card/stream`
- `POST /api/copilot/follow-up`
- `POST /api/mock/session`
- `POST /api/mock/session/:id/answer`
- `POST /api/records`
- `GET /api/records`
- `GET /api/records/:id`
- `POST /api/search`
- `POST /api/export`
- `POST /api/import`

## AI 与语音边界

语音能力使用浏览器麦克风和 Web Speech API；不捕获桌面系统音频，不抓会议软件系统声。浏览器不支持或授权失败时，实时助手和模拟练习都会降级为文字输入。

Web Speech 转写保留 interim、final、editable 文本分离；停止听取不会清空已识别文本，只有用户点击清空/重录才清空。

## 验证

```bash
npm run verify
```

该命令会依次运行 lint、server typecheck、test 和 build。桌面验收重点看 `http://127.0.0.1:5173/` 的首页实时助手、模拟面试间、记录复盘和上下文资料。
