# Project Memory — 辅助面试 / AI 求职台

Last updated: 2026-06-20

## Project

- **Name**: 辅助面试（AI 求职台）
- **Path**: C:\Users\Windows11\Desktop\辅助面试
- **定位**: 面试准备产品，不是后台仪表盘，不是功能入口拼盘

## 当前版本目标

- **版本阶段**: 公开 MVP
- **信息架构**: 保留当前多页面结构，不合并页面

## 当前产品主线

1. 用户粘贴真实 JD 或补充岗位信息
2. 首页完成 intake 审核：原文、推断、缺失字段
3. 当前岗位资料底座沉淀：项目资料、上传资料、用户问题
4. 模拟面试预演
5. 实时助手在面试中生成提词卡
6. 保存记录与报告
7. 回到问题库和简历继续复盘

## 当前关键约束

- 首页不能再伪造完整 JD 草稿
- 服务端是业务主数据真源
- 本地 fallback 不能伪装成模型成功
- 桌面侧栏首次默认展开，且不因进入实时助手自动收起
- 问题库重点是用户保存问题与项目资料
- 简历页右侧必须是正常 AI 对话框
- **Codex Desktop 禁止 IAB/Browser/Computer Use**（Windows 会闪退）；Codex 只做 `npm run verify` 与接口链路验收，渲染层 UI 在 Cursor 或人工浏览器验收（见 ADR-P009）

## Skill 机制现状

- 当前机器本地安装的 Cursor/Codex 相关 skill 目录远多于单次 Codex 会话实际暴露给模型的 skill 列表。
- 项目 `AGENTS.md` 中部分历史 skill 名是“磁盘存在但本会话不一定暴露”的引用，例如：
  - `ai-product-competitor-delivery`
- 当前执行原则：
  - 先以“本次会话顶部 Skills 列表”作为真实可调用集合
  - 若项目文档引用的 skill 不在会话列表内，则按 `AGENTS.md` 中的等价映射退化到当前可见 skill
- 这不是本地磁盘读取失败，而是“Skill 安装集合”与“当前会话注入集合”之间存在平台层筛选差异

## 当前运行时能力

- 后端已落地本地 SQLite FTS5 RAG v1：
  - `documents`
  - `document_chunks`
  - `retrieval_runs`
- RAG 已接入这些写入触发：
  - 岗位 intake / JD 更新
  - 简历与证据更新
  - 岗位资料更新
  - 岗位问题更新
  - 记录保存
- 实时助手 `/api/copilot/cue-card/stream` 已接入：
  - 本地占位
  - RAG 召回
  - 条件搜索
  - DeepSeek / fallback 结构化输出
  - SSE `stage/delta/card/done/error`
- 模拟面试首题、追问、报告已接入统一 RAG + 模型编排
- 简历页右侧 AI 对话已改为真实后端接口 `/api/resume/ai`
- 当前仍为单机单用户实现，但表结构与类型层已预留 runtime 扩展位

## 数据 owner

| 数据 | Owner | 说明 |
|------|-------|------|
| 岗位 intake | 服务端 | 持久化真实原文、确认字段、推断字段 |
| 简历与证据 | 服务端 | 前端可编辑，但以后端快照为准 |
| 当前岗位资料 | 服务端 | 项目资料、上传资料都绑定岗位 |
| 当前岗位问题 | 服务端 | 用户保存问题与高优先级问题 |
| 面试记录 | 服务端 | transcript / cue card / report |
| 临时输入与 UI 偏好 | 前端 | 仅 `drafts` / `uiPrefs` / `serverSnapshotCache` |

## 当前文档入口

- `docs/current/当前版本真实能力清单.md`
- `docs/current/当前信息架构与页面职责.md`
- `docs/current/当前数据owner与持久化说明.md`
- `docs/current/公开MVP总体技术架构方案.md`
- `docs/current/公开MVP接口与数据契约.md`
- `docs/current/公开MVP功能开发设计方案.md`

## 验证标准

- `npm run verify`
- 手动本地检查：
  - 首页 intake
  - 问题库资料与问题保存
  - 简历 AI 对话
  - 记录保存与回显
