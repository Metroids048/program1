# Task History

## [TASK-2026-06-19-public-mvp-closeout]

- Date: 2026-06-19
- Type: feature
- Summary: 按“公开 MVP 收口整改计划”重构首页真实 JD intake、后端主导数据流、问题库资料底座、简历页标准 AI 对话、桌面侧栏展开记忆，并补齐当前文档体系与项目记忆。
- Files:
  - `src/App.tsx`
  - `src/components/appShell.tsx`
  - `src/components/home.tsx`
  - `src/components/questions.tsx`
  - `src/components/resume.tsx`
  - `src/lib/apiClient.ts`
  - `src/lib/interviewEngine.ts`
  - `src/lib/store.ts`
  - `server/index.ts`
  - `server/orchestrator.ts`
  - `src/styles.css`
  - `README.md`
  - `docs/current/*`
  - `docs/archive/*`
  - `.github/agent/memory/*`
- Notes:
  - 停止把首页当“岗位草稿生成器”
  - 停止把前端本地 `AppState` 当持久化真源
  - 文档口径已统一到“当前真实能力”

## [TASK-2026-06-19-startup-stability-closeout]

- Date: 2026-06-19
- Summary: 完成公开 MVP 本地启动收尾，修复 `一键启动.cmd` 成功即关窗导致的“像闪退”体验，并修复 `scripts/launch-experience.ps1` 在服务已运行时因日志文件占用误报失败的问题；确认本地前端 `http://127.0.0.1:5173/` 与后端健康检查 `http://127.0.0.1:8787/api/health` 可访问。
- Files:
  - `一键启动.cmd`
  - `scripts/launch-experience.ps1`
  - `README.md`
  - `.github/agent/memory/project-memory.md`
  - `.github/agent/memory/decisions-log.md`
- Verified:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\launch-experience.ps1`
  - `http://127.0.0.1:5173/`
  - `http://127.0.0.1:8787/api/health`

## [TASK-2026-06-19-public-mvp-architecture-docs]

- Date: 2026-06-19
- Type: docs
- Summary: 按“公开 MVP 技术架构与功能开发设计方案”补齐开发前文档，新增总体技术架构、接口与数据契约、功能开发设计三份现行文档，并同步更新 README 与项目记忆入口。
- Files:
  - `docs/current/公开MVP总体技术架构方案.md`
  - `docs/current/公开MVP接口与数据契约.md`
  - `docs/current/公开MVP功能开发设计方案.md`
  - `README.md`
  - `.github/agent/memory/project-memory.md`
  - `.github/agent/memory/decisions-log.md`
  - `.github/agent/memory/task-history.md`
- Notes:
  - 当前阶段先完成开发前方案，不直接进入实现
  - 技术方案以单机单用户、本地优先、SQLite FTS5 RAG 为准

## [TASK-2026-06-19-public-mvp-p0-runtime-closure]

- Date: 2026-06-19
- Type: feature
- Summary: 按“公开 MVP 功能闭环实现计划”完成 P0 运行时闭环，实现本地 SQLite FTS5 RAG、统一 AI 元数据、条件搜索、简历页真实后端 AI 对话，并让实时助手、模拟面试、记录回流接入同一套后端能力。
- Files:
  - `server/types.ts`
  - `server/migrations/001_init.sql`
  - `server/db.ts`
  - `server/rag.ts`
  - `server/orchestrator.ts`
  - `server/index.ts`
  - `server/index.test.ts`
  - `src/lib/apiClient.ts`
  - `src/components/shared.tsx`
  - `src/components/resume.tsx`
- Verified:
  - `npm run verify`
- Notes:
  - `verify` 通过，但 `src/components/shared.tsx` 仍保留既有 `react-refresh/only-export-components` warnings，当前未额外重构
  - 文件兜底存储已兼容新增 RAG 结构，避免 SQLite 不可用时直接断链

## [TASK-2026-06-20-skill-visibility-and-plan-audit]

- Date: 2026-06-20
- Type: chore
- Summary: 审计本机已安装 skill、当前 Codex 会话实际暴露 skill、项目 AGENTS 中的 skill 引用与上轮 5 步计划执行记录，修正项目内失效 skill 引用的可见性映射，并补齐上轮计划状态。
- Files:
  - `AGENTS.md`
  - `.github/agent/memory/project-memory.md`
  - `.github/agent/memory/decisions-log.md`
  - `.github/agent/memory/task-history.md`
- Notes:
  - 发现本机磁盘 skill 数量与当前会话暴露 skill 集合存在平台层筛选差异
  - 发现上轮实现已完成，但 `update_plan` 未及时同步为 completed，已补齐

## [TASK-2026-06-20-codex-browser-stability-guard]

- Date: 2026-06-20
- Type: fix
- Summary: 根治 Codex Desktop 在 Windows 上调用 IAB Browser 导致闪退：全局关闭 browser/chrome/computer-use/build-web-apps 插件，清空 browser backends，更新 AGENTS 分流 Cursor/Codex 验收，并新增可重复执行的稳定性守卫脚本。
- Files:
  - `~/.codex/config.toml`
  - `AGENTS.md`
  - `scripts/ensure-codex-browser-stability.py`
  - `scripts/ensure-codex-browser-stability.ps1`
  - `.github/agent/memory/decisions-log.md`
  - `.github/agent/memory/project-memory.md`
- Verified:
  - `npm run verify` PASS
  - `~/.codex/config.toml` 插件 enabled=false 已确认
