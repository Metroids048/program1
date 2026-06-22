# AI 求职台项目交付规则

本项目是面试准备产品，不是后台仪表盘。任何 UI、语音交互、模拟面试、简历优化相关改动都必须先按产品主线和竞品截图做减法，再写代码。

## 必用技能

- UI/视觉重构在一定程度上使用并遵守：
  - `image-to-code`
  - `minimalist-ui`
  - `high-end-visual-design`
  - 若当前 Codex 会话未暴露这些 skill，则退化映射到已确认可用的同类 skill：
    - `figma2code`
    - `design-taste-frontend`
    - `ui-ux-pro-max`
    - `ckm-ui-styling`
- AI 产品流程、实时助手、模拟面试必须使用并遵守：
  - 优先 `ai-product-competitor-delivery`
  - 若当前会话未暴露该 skill，则退化映射到：
    - `competitor-analysis`
    - `pm-competitor-deconstructor`
    - `ai-prompt-engineering`
- **任务开始前**：若需求模糊，须 `requirement-clarifier` + 锁定主改动类型/版本目标（见 `.github/agent/memory/RULES.md`）。
- 说明：
  - 本项目允许存在“磁盘上已安装 skill”和“当前 Codex 会话实际暴露 skill”不完全一致的情况。
  - agent 必须先以“当前会话可见 skill 列表”为准，再按本节映射关系选用等价 skill，不能只因为本机目录里有文件就假设本轮可调用。
- **浏览器验收按工具分流（硬门禁）**：
  - **Cursor**：本地页面验收使用 Browser / Playwright MCP 检查 `http://127.0.0.1:5173/`，但禁止通过脚本自动弹出浏览器或体验入口页。
  - **Codex Desktop**：**禁止**调用 Browser / IAB / Chrome / Computer Use 插件、`control-in-app-browser`、`frontend-testing-debugging` 的浏览器路径、`node_repl` 的 `setupBrowserRuntime` / `agent.browsers` / `browser.tabs`、`Start-Process` 打开浏览器、或任何内置 Browser 面板。Windows 上 IAB 会导致 Codex 闪退。
  - **Codex 替代验收**：`npm run verify`、Vitest、Fastify inject 接口链路、真实样本导入脚本、代码审查；不得因缺 Browser 而伪造 UI 已验收。

## UTF-8 与中文文件（硬门禁）

与全局 `windows-utf8-chinese-files.mdc` 同级；编码场景优先于一般 Shell 写法。

- 所有文件读写默认 **UTF-8**；修改时不得改变原有编码、换行与无关内容。
- PowerShell 读中文前：`chcp 65001`，并设置 `[Console]::OutputEncoding` 与 `$OutputEncoding` 为 UTF8；读用 `Get-Content -Raw -Encoding UTF8`。
- **禁止** PowerShell here-string 管道、重定向、`Set-Content`、`Out-File` 写入含中文源码、JSON 或文档。
- **禁止** `sed`/`awk` 处理含中文；用 Python/Node.js 并显式 UTF-8。
- **写源码**：只用 **apply_patch**（禁止 PowerShell 字符串写 `.ts/.tsx/.md/.css`）。
- 不要为了修编码而整文件重写、全文件格式化或无关替换。
- 含中文路径或 `$变量`：用 `powershell -File scripts\xxx.ps1`，禁止 `rtk powershell -Command` 内联。

## 编码规则

- 不新增无关依赖，不做无关重构。
- 本项目 UI 使用浅色、克制、竞品式产品界面。避免堆字、卡片套卡片、首屏塞满诊断信息。
- Markdown 报告、PRD、复盘、方案文档必须使用干净的简体中文，避免乱码、装饰性符号堆砌和空泛 AI 套话。

## UI 交付闸口

交付前必须检查：

- `1280x720` 首页首屏：只保留主标题、对话输入、岗位卡、主要 CTA、最小右侧上下文。
- `1280x720` 模拟面试间：顶部状态栏、面试对话、底部语音控制、当前题词卡可见，无大面积无意义空白。
- `390px` 移动端：导航、按钮、卡片、题词卡、输入框不重叠、不横向溢出。
- 控制台无 error。

## 语音与 AI 交付闸口

- Web Speech 转写必须区分 `interim`、`final`、`editable` 文本。
- 停止听取不得清空已识别文本；只有用户点击清空/重录才清空。
- 实时助手必须支持手动确认和自动生成两种模式。
- 模拟面试追问、下一题、评价优先走后端模型；后端不可用时必须明确显示本地练习模式。
- local fallback 不能伪装成模型成功。

## 浏览器验收规则

- 禁止通过启动脚本自动 `Start-Process` 打开 `http://127.0.0.1:5173/`。
- 禁止因服务就绪自动弹出浏览器窗口、体验入口页或额外标签页。
- **Cursor**：浏览器验收只允许手动打开新标签页，或通过受控 Browser / Playwright MCP 在新页面中检查，不得打断用户当前工作窗口。
- **Codex Desktop**：完全禁止内置 Browser / IAB / Chrome / Computer Use 与相关 skill；已在 `~/.codex/config.toml` 关闭对应插件。UI 渲染层问题改在 Cursor 或人工浏览器验收。
- 如果需要给出访问入口，只在终端或文档中输出本地地址与日志位置。

## 验证命令

交付前必须运行：

```bash
npm run verify
```

并完成 Browser 冒烟路径（**仅 Cursor 或人工浏览器**；Codex 不得执行）：

1. 首页 JD 卡与配置入口。
2. 实时助手：输入或语音模拟文本，停止后文本保留，编辑后生成题词卡。
3. 模拟面试：回答一题，生成模型/本地追问，结束后保存报告。

Codex 会话交付时，以 `npm run verify` + 接口链路回归代替上述 Browser 冒烟，并在交付说明中标注「Codex 无渲染层验收」。
