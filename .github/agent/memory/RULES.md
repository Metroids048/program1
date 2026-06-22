# Execution Rules — program1-main

> 与全局 `workflow-gate`、`ai-delivery-anti-patterns` 叠加；冲突时 repo `AGENTS.md` 优先。

## 模糊输入 → 必须提问（硬门禁）

以下情况**禁止直接改代码**，须先澄清或输出 Mini-Spec + 待确认：

- 「优化 UI」「对标竞品」「整体改一下」「看着办」但未说明改哪一层
- 同时动产品定位、页面结构、视觉、AI/数据
- 未说明本轮哪些页面/数据/测试不动

**必问清单：** 主改动类型（四选一）· 版本目标（四选一）· 不动清单 · 验收方式 · 页面验收卡（涉及 UI 时）

用户明确「直接做 / 就改这一处」且范围一句话说清 → 可 Tier B 快路径。

## 每轮只允许一类主改动

- 产品主线 / IA / UI 视觉 / AI·数据闭环 — **四选一**
- 禁止：改视觉时顺手改 IA；补 AI 时顺手重做首页信息架构

## 硬约束

- Tier A：未过架构/接口 approval 不得 Write/Edit 实现文件
- 改页面必须同步：共享样式、文案、状态逻辑、测试断言
- 必须写数据 owner 与接口契约（见 `DESIGN.md`）
- P5 自检 → P6 verify；无 fresh 证据不得 claim done

## 产品专属禁止

- 删弱 JD 工作台、问题库等上下文底座
- 提词卡输出完整逐字稿
- 模拟面试做成纯文本表单（须语音/追问体验）
- local fallback 伪装模型成功
- 启动脚本自动打开浏览器

## 验证

- 先 E2E 用户故事（见 `project-memory.md` 7 步）
- 再 `AGENTS.md` UI/语音闸口
- 最后 `npm run verify`
