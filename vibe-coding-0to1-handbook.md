# Vibe Coding 0→1 完整作战手册

> **核心认知**：Vibe Coding 的本质问题不是 AI 工具不够强，而是**人与 AI 之间缺少一层「翻译」**。大多数踩坑都源于：模糊输入 → 精准执行 = 精准跑偏。本手册的核心就是在你和 AI 工具之间建立一套结构化协作体系。

---

## 目录

1. [根因诊断：你的6个痛点从哪来](#一根因诊断)
2. [最核心的解法：R2T 需求澄清层](#二r2t-需求澄清层--最重要的一层)
   1. [2.5 Agent 配置总览](#二五-agent-配置总览)
3. [完整 0→1 开发流程（7个阶段）](#三完整-0→1-开发流程)
4. [AI 工具最佳使用实践](#四ai-工具最佳使用实践)
   1. [4.0 每次对话的强制流程](#四零每次对话的强制流程)
   2. [4.5 工具调用约束](#四五工具调用约束)
5. [UI / 前端专项流程](#五ui--前端专项流程)
6. [功能开发与测试验证](#六功能开发与测试验证)
7. [上线部署 Checklist](#七上线部署-checklist)
8. [AI API 集成与生产管理](#八ai-api-集成与生产管理)
9. [模板库](#九模板库)
10. [持续改进机制](#十持续改进机制)
   1. [10.3 返工复盘分类](#一零三返工复盘分类)

---

## 一、根因诊断

在解决问题之前，先诊断每个坑的真正原因：

| 你描述的坑 | 表面现象 | 根本原因 |
|-----------|---------|---------|
| Skills 难以被调用 | AI 不知道用哪个能力 | 上下文注入不足，没有显式告知项目结构和技术规范 |
| 做出来和想的差太远 | 需求理解偏差 | 缺少「需求澄清层」，自然语言直接喂给 Agent |
| UI 不协调，改了又坏 | 视觉系统碎片化 | 没有设计 Token 系统，每次让 AI 自由发挥 |
| 功能跑不通、bug 多 | 开发颗粒度太粗 | 任务粒度太大，缺乏增量验证机制 |
| 本地好用，上线各种问题 | 环境差异、工程化不足 | 缺少生产环境 Checklist 和监控体系 |
| AI API 集成问题多 | 外部依赖不可控 | 缺少 API 层抽象、限流、降级和监控设计 |

**一句话总结**：所有问题的共同根源是**缺乏结构**。Vibe Coding 不是"随便说说让 AI 做"，而是"用结构化方式驱动 AI 做对的事"。

---

## 二、R2T 需求澄清层 ——最重要的一层

### 2.1 是什么

**R2T（Requirement to Task）层**是你和 AI Agent 之间的一个**强制性转换环节**，它的工作是：

```
你的模糊想法
    ↓
[R2T 层：结构化处理]
    ↓
精准的、Agent可执行的任务规范
    ↓
AI Agent 执行
```

**没有 R2T 层的结果**：
> "帮我做一个用户登录功能" → AI 做出一个与你设想完全不同的实现

**有 R2T 层的结果**：
> 同样的输入，经过 R2T 层处理后变成：4 个明确的子任务 + 技术约束 + 验收标准 + 参考当前代码结构

---

### 2.2 R2T 层的工作机制（5步）

**Step 1：意图提取**

把你的自然语言分解成三个维度：
- **WHAT**：要做什么功能/效果
- **WHY**：为什么要做，解决什么问题
- **WHO**：谁在用，用在哪个场景

**Step 2：缺口识别（最关键）**

系统性地检查以下维度是否有信息缺失：

```
□ 用户是谁？（新用户/老用户/管理员/访客）
□ 入口在哪里？（从哪个页面触发）
□ 成功状态是什么？（用户看到什么就算做好了）
□ 失败状态怎么处理？（报错/跳转/提示）
□ 与哪些现有功能有关联？
□ 数据从哪来，存到哪里？
□ 有没有权限控制？
□ 移动端/PC端都要支持吗？
□ 有没有性能要求？
□ 有没有参考设计稿或竞品？
```

缺什么信息，就**用假设填充并明确标注**，不要让 AI 自己猜。

**Step 3：假设文档化**

```markdown
## 本次任务的假设（需确认）
- [ ] 假设用户已登录（若未登录，跳转登录页）
- [ ] 假设手机号为主要登录方式（非邮箱）
- [ ] 假设暂不需要第三方登录（微信/Google）
- [ ] 假设验证码有效期为 5 分钟
```

**Step 4：任务原子化**

把一个大需求拆成**每个不超过2小时**的原子任务：

```markdown
## 拆分后的任务列表
Task-001: 创建登录页面 UI 组件（仅静态，无逻辑）
Task-002: 接入手机号验证码发送 API
Task-003: 实现验证码校验和 Token 生成逻辑
Task-004: 实现登录态持久化（localStorage + 刷新保持）
Task-005: 实现登录后跳转逻辑
Task-006: 处理各类错误状态的 UI 反馈
```

**Step 5：上下文注入**

每个任务在发给 Agent 之前，必须附带：

```markdown
## 上下文
- 当前使用技术栈：Next.js 14 + TypeScript + Tailwind + Prisma + PostgreSQL
- UI 组件库：shadcn/ui（已有 Button/Input/Card 组件）
- 认证方案：JWT，Token 存 localStorage，过期时间 7 天
- API 风格：RESTful，统一返回格式 {code, data, message}
- 现有相关文件：
  - /app/api/auth/route.ts（已有骨架）
  - /lib/db.ts（数据库连接已配置）
  - /components/ui/（UI 组件位置）
- 代码规范：TypeScript 严格模式，函数式组件，hooks 封装逻辑
```

---

### 2.3 R2T 提示词模板

每次启动一个新功能前，把以下模板填好再发给 Agent：

```markdown
# 功能需求规范 v1.0

## 功能名称
[功能名]

## 一句话描述
[用一句话说清楚这个功能做什么，解决什么问题]

## 用户故事
作为 [用户类型]，
当我 [触发场景] 时，
我想要 [期望行为]，
以便 [达成目标]。

## 验收标准（AC）
- AC1: [具体可验证的条件]
- AC2: [具体可验证的条件]
- AC3: [具体可验证的条件]

## 技术上下文
- 技术栈：[填写]
- 相关文件：[填写已有的相关代码路径]
- 接口依赖：[填写需要调用的 API]
- 数据模型：[填写相关数据结构]

## 设计约束
- 必须复用组件：[组件名]
- 不允许修改：[文件/模块名]
- 样式要求：[具体描述或参考]

## 明确不包含的内容（Out of Scope）
- 不需要做 [X]（下期迭代）
- 不考虑 [Y] 场景

## 假设（Assumptions）
- 假设：[X]（若不成立请先告知）

## 任务拆解
- [ ] Task-1: [具体到文件级别的操作]
- [ ] Task-2: [具体到文件级别的操作]
- [ ] Task-3: [具体到文件级别的操作]

## 完成后的自检清单
- [ ] 本地运行无报错
- [ ] 覆盖了所有 AC
- [ ] 无 console.error/警告
- [ ] 移动端显示正常
```

---

### 2.4 把 R2T 层做成 AI 工具

你可以把 R2T 层本身用 AI 自动化。建立一个「需求精准化 GPT」：

**System Prompt：**
```
你是一个专业的产品需求分析师。用户会给你一段模糊的功能描述，你需要：
1. 提取核心意图（WHAT/WHY/WHO）
2. 列出所有信息缺口，用假设填充并标注
3. 输出标准化的功能需求规范（包含用户故事、AC、任务拆解）
4. 输出技术任务列表，每个任务不超过2小时工作量
5. 明确指出哪些内容在本次 Out of Scope

输出格式严格遵循 Markdown 结构，不要问我问题，先基于最合理的假设输出，最后列出你做的假设让我确认。
```

这样你只需要口语化描述需求，AI 帮你自动转换成 Agent 可执行的精准任务规范。

---

### 2.5 Agent 配置总览

不要把规则散在聊天记录里。把它分成“全局 → 项目 → 任务”三层，才会稳定生效。

| 层级 | 放哪里 | 负责什么 | 何时生效 |
|------|--------|----------|----------|
| 全局层 | `~/.claude/AGENTS.md`、`~/.codex/AGENTS.md`、`.cursor/rules/*.mdc`、`~/.ai-workspace/memory/*.md` | 所有项目通用的行为规范、验证习惯、禁区 | 每次新会话都应读取 |
| 项目层 | 仓库根 `AGENTS.md`、`.github/agent/memory/*.md`、必要时 `CLAUDE.md` shim | 当前项目的产品主线、架构、数据 owner、验收口径 | 进入项目后读取 |
| 任务层 | 本轮任务卡 / R2T 输出 / 任务拆解 | 本次做什么、不做什么、怎么验收 | 每次任务开始前生成 |

**关于 `codex.md`**

- 不要把它当成独立的魔法入口。
- 在 Codex 里，真正负责自动生效的是 `~/.codex/AGENTS.md` + 项目 `AGENTS.md` + 记忆文件。
- 如果你想保留一个叫 `codex.md` 的文件，把它当成“人读的运行手册副本”或从 `AGENTS.md` 生成的镜像，不要让规则只存在于聊天里。
- `~/.codex/config.toml` 只放模型、MCP、路径这类工具配置，不放行为规范。
- 如果工具需要 `CLAUDE.md`，就让它只做 `@AGENTS.md` 转发。

**自动生效顺序**

1. 先读全局规则和全局记忆。
2. 再读项目 `AGENTS.md` 和项目记忆。
3. 再判断本轮任务类型与主改动层。
4. 模糊就先问，不能脑补。
5. 通过任务卡后再进入执行和验证。
6. 结果必须回写任务历史和决策记录。

**最小落地要求**

- 每个项目至少要有一份 `AGENTS.md`。
- 每个需要长期协作的项目都要有项目记忆。
- 每轮任务都要有一张任务卡，至少写清主改动类型、版本目标、不动清单、验收卡和风险。

---

## 三、完整 0→1 开发流程

### Phase 0：项目启动（1-2天）

**目标**：在写第一行代码前，把所有「决策成本最高」的问题决策完。

#### 0.1 核心文档创建（必须完成再开始）

创建 `/docs/` 目录，建立以下文档：

**`/docs/PRD.md`** — 产品需求文档
```markdown
# [产品名] PRD

## 产品定位
- 目标用户：
- 核心价值主张：
- 主要竞品：

## 核心功能列表（MVP）
| 功能 | 优先级 | 说明 |
|-----|--------|-----|
| P0  |        |     |

## 用户旅程（关键路径）
[描述用户从进入到完成核心任务的完整路径]

## 数据模型（核心实体）
[User, Post, Order... 列出核心实体和关系]
```

**`/docs/TECH-STACK.md`** — 技术选型文档（这个文档是 Skills 调用的关键）
```markdown
# 技术栈文档

## 前端
- 框架：Next.js 14 (App Router)
- 语言：TypeScript（严格模式）
- 样式：Tailwind CSS + shadcn/ui
- 状态管理：Zustand
- 表单：react-hook-form + zod

## 后端
- API：Next.js API Routes / tRPC
- 数据库：PostgreSQL
- ORM：Prisma
- 认证：NextAuth.js / Clerk
- 文件存储：Cloudflare R2

## AI 能力
- 模型：Claude claude-sonnet-4-6 (主力) / GPT-4o (备用)
- SDK：Anthropic SDK
- 流式输出：Vercel AI SDK

## 部署
- 托管：Vercel
- 数据库：Supabase / PlanetScale
- 监控：Sentry + Vercel Analytics

## 代码规范
- ESLint + Prettier 配置（粘贴具体规则）
- 命名规范：组件 PascalCase，函数 camelCase，常量 SCREAMING_SNAKE
- 文件结构规范：[描述]
```

**`/docs/DESIGN-SYSTEM.md`** — 设计系统文档（解决 UI 不协调问题的核心）
```markdown
# 设计 Token 系统

## 色彩系统
- Primary: #[hex]（主色，用于按钮、链接、重点强调）
- Secondary: #[hex]（辅助色）
- Background: #[hex]（页面背景）
- Surface: #[hex]（卡片/组件背景）
- Border: #[hex]（边框颜色）
- Text-Primary: #[hex]（主文字）
- Text-Secondary: #[hex]（次要文字）
- Success: #[hex]
- Warning: #[hex]
- Error: #[hex]

## 字体系统
- Display: [字体名] [字号] [字重]（大标题）
- Heading: [字体名] [字号] [字重]（页面标题）
- Body: [字体名] [字号] [字重]（正文）
- Caption: [字体名] [字号] [字重]（辅助文字）

## 间距系统
- xs: 4px | sm: 8px | md: 16px | lg: 24px | xl: 32px | 2xl: 48px

## 圆角系统
- sm: 4px | md: 8px | lg: 12px | xl: 16px | full: 9999px

## 阴影系统
- sm/md/lg（定义具体值）

## 组件规范
- Button：4种变体（primary/secondary/ghost/destructive），3种尺寸
- Input：默认/focus/error/disabled 状态
- Card：内边距 24px，圆角 12px，边框 1px
```

**`/docs/ARCHITECTURE.md`** — 架构文档
```markdown
# 项目架构

## 目录结构
/app              # Next.js App Router
  /(auth)         # 认证相关页面组
  /(dashboard)    # 主功能页面组
  /api            # API Routes
/components
  /ui             # 基础 UI 组件（shadcn）
  /features       # 业务功能组件
  /layouts        # 布局组件
/lib
  /db.ts          # 数据库连接
  /auth.ts        # 认证配置
  /utils.ts       # 工具函数
  /api/           # API 调用封装
/hooks            # 自定义 Hooks
/types            # TypeScript 类型定义
/docs             # 项目文档

## API 设计规范
- 统一返回格式：{ success, data, error, message }
- 错误码规范：[定义]
- 认证方式：Bearer Token

## 数据流
[描述数据从 UI → API → DB 的流向]
```

#### 0.2 初始 .cursorrules / CLAUDE.md 文件

在项目根目录创建 `CLAUDE.md`（Claude Code 会自动读取）和 `.cursorrules`（Cursor 读取）：

```markdown
# CLAUDE.md / .cursorrules

## 项目说明
这是一个 [产品描述]，面向 [用户群体]。

## 强制技术规范
- 所有新文件必须使用 TypeScript，启用严格模式
- 禁止使用 any 类型，用 unknown + 类型守卫替代
- 所有 UI 组件从 /components/ui/ 引入，禁止内联大量样式
- 颜色只能使用 /docs/DESIGN-SYSTEM.md 中定义的 Token
- API 调用必须统一走 /lib/api/ 下的封装函数

## 代码风格
- 函数式组件 + Hooks，禁止 Class Component
- 异步用 async/await，禁止 .then().catch() 链式调用
- 错误处理：try/catch + 统一 toast 提示
- 注释：只注释 WHY，不注释 WHAT

## 禁止事项
- 禁止在组件内直接写 fetch，必须通过 hooks 或 lib/api
- 禁止在页面组件写业务逻辑，抽取到 hooks
- 禁止硬编码字符串，用常量文件管理

## 每次完成任务后必须
1. 检查 TypeScript 是否有报错（tsc --noEmit）
2. 确认新增文件是否符合目录结构规范
3. 确认没有引入新的 any 类型
4. 告诉我你修改了哪些文件，做了什么
```

---

### Phase 1：设计系统搭建（1-2天）

**目标**：在写任何业务组件前，先把视觉基础建好。这是解决「UI 不协调」问题的根本。

#### 1.1 设计 Token 落地

把 `/docs/DESIGN-SYSTEM.md` 转化为代码：

```typescript
// /lib/design-tokens.ts
export const tokens = {
  colors: {
    primary: '#3B82F6',
    // ... 完整 token
  }
}
```

```css
/* /app/globals.css */
:root {
  --color-primary: #3B82F6;
  --color-bg: #FFFFFF;
  /* ... 完整 token */
}
```

**给 Agent 的指令模板**：
> 根据以下设计 Token 文档（贴上 DESIGN-SYSTEM.md 内容），在 globals.css 中添加 CSS 变量，在 tailwind.config.ts 中扩展主题，确保所有 Token 可以通过 Tailwind 类名使用。

#### 1.2 基础组件库验证

搭建完 Token 后，用一个「设计预览页」验证：

```
/app/design-preview/page.tsx
```

这个页面展示所有基础元素：颜色块、字体层级、按钮状态、表单组件等。**每次修改设计 Token 后，必须回到这个页面确认没有破坏性变化。**

---

### Phase 2：骨架搭建（1-2天）

**目标**：搭建项目的基础骨架，验证整体跑通，但不包含任何业务逻辑。

**Checklist**：
- [ ] 路由结构创建完毕（所有页面有空白占位）
- [ ] 导航/布局组件完成
- [ ] 认证流程跑通（登录→跳转→退出）
- [ ] 数据库连接验证
- [ ] 基础 API 结构建立

---

### Phase 3：功能开发（主要阶段）

**每个功能的开发流程**（严格遵循，不要跳步）：

```
需求输入
  ↓
R2T 层处理（生成标准化任务规范）
  ↓
UI 先行：只做静态页面，不接数据
  ↓
视觉验收：确认 UI 符合预期
  ↓
数据接入：接 API，接真实数据
  ↓
逻辑验收：功能跑通验证
  ↓
异常处理：处理所有错误状态
  ↓
自检 Checklist
  ↓
下一个功能
```

**关键原则**：
1. **UI 先行，逻辑后接**：先把界面做对，再接数据。不要同时做
2. **一次只改一件事**：不要在一个 commit 里同时改样式 + 逻辑
3. **每个 Task 完成后立即验收**：不要攒着一起验收

---

### Phase 4：集成测试

见「功能开发与测试验证」章节。

---

### Phase 5：上线前准备

见「上线部署 Checklist」章节。

---

### Phase 6：上线监控

见「AI API 集成与生产管理」章节。

---

## 四、AI 工具最佳使用实践

### 4.1 Cursor 使用规范

**提高 Skills 调用率的方法**：

1. **显式引用文件**：在 Prompt 中直接 `@TECH-STACK.md @DESIGN-SYSTEM.md`
2. **上下文窗口管理**：长对话容易失去上下文，超过 20 轮要开新对话并附上关键上下文
3. **用 Composer 而非 Chat**：多文件修改任务用 Cursor Composer，单文件问答用 Chat
4. **每次任务前说明限制**：「只修改 X 文件，不要动 Y 文件」

**Prompt 写法对比**：

❌ 差的写法：
> 帮我做一个用户管理页面

✅ 好的写法：
> 在 /app/(dashboard)/users/page.tsx 创建用户管理页面。
> - 复用 @components/ui/DataTable 组件显示用户列表
> - 数据从 /lib/api/users.ts 的 getUsers() 函数获取（已有）
> - 按照 @docs/DESIGN-SYSTEM.md 的设计规范
> - 支持按用户名搜索（前端过滤即可，下期再做服务端搜索）
> - 不需要做增删改，只做展示

---

### 4.0 每次对话的强制流程

不管你是用 Codex、Cursor 还是 Claude Code，每次新对话都按这个顺序走：

1. 先读全局记忆、项目 `AGENTS.md`、项目记忆。
2. 再判断任务属于修复、UI、IA、产品主线还是 AI·数据。
3. 再判断是否是 0→1 或跨层改动；如果是，先出方案，不直接开写。
4. 再补任务卡：主改动类型、版本目标、不动清单、验收卡、数据 owner、风险点。
5. 再拆成可以独立验证的子任务。
6. 再执行；每个子任务完成后立刻验收。
7. 结束前回写任务历史、决策和项目事实。

**触发提问的信号**

- 改 UI、优化一下、对标竞品、整体做一下。
- 同时要改页面、数据、流程、视觉。
- 没写不动清单、验收标准、数据 owner。
- 用户说“直接做”，但本轮实际上是 0→1、新页面、新模块、跨文件流。

---

### 4.2 Claude Code 使用规范

Claude Code 会自动读取项目根目录的 `CLAUDE.md`，这是最有效的 Skills 注入方式。

**CLAUDE.md 维护规则**：
- 项目有重大技术决策时，立即更新 CLAUDE.md
- 发现 Claude Code 反复犯同一个错误，把正确做法写进 CLAUDE.md 的「禁止事项」

**适合 Claude Code 的任务类型**：
- 多文件重构（它的多文件编辑能力强）
- 写测试（测试代码套路固定，AI 做得很好）
- 代码库级别的搜索和修改
- 执行批量操作（文件重命名、批量格式化等）

---

### 4.3 Codex（OpenAI Codex）使用规范

**适合 Codex 的任务类型**：
- 算法实现（数学逻辑类）
- 独立的工具函数
- 类型定义生成
- API 集成代码

**关键注意**：Codex 对上下文的保持能力相对弱，每次任务要重新注入完整上下文。

---

### 4.4 工具组合策略

```
需求复杂度低 + 单文件 → Cursor Chat
需求复杂度高 + 多文件 → Claude Code
算法/逻辑密集型 → Codex
快速原型/设计稿还原 → Cursor Composer
重构/测试 → Claude Code
```

---

### 4.5 工具调用约束

| 场景 | 处理方式 |
|------|----------|
| 单文件 typo、文案修正、明确的一处 bug | 可以直接做，先最小修改再验证 |
| 新页面、新模块、新流程、新状态键、跨文件流 | 先出方案，再拆任务卡，再执行 |
| 模糊需求、对标竞品、整体优化、同时改多层 | 先提问，锁定主改动类型、版本目标、不动清单、验收方式 |
| 删除、迁移、卸载、清配置、改全局行为 | 先说明影响，得到确认后才做 |

**任务卡最低字段**

- 主改动类型
- 版本目标
- 不动清单
- 页面验收卡
- 数据 owner
- 风险点

**拆解原则**

- 一张任务卡只对应一个主改动层。
- 超过 2 小时的任务必须继续拆。
- 每个子任务必须能单独验证。
- 任务结束时必须能回答：改了什么、没改什么、怎么验收。

---

## 五、UI / 前端专项流程

### 5.1 「设计锁」机制

每次开始新的 UI 开发前，在 Prompt 里锁定设计约束：

```markdown
## 设计约束（不可修改，AI 必须遵守）
- 主色：#3B82F6（只能用这个，不要自己换颜色）
- 圆角：统一使用 rounded-lg（12px）
- 间距：严格按照 Tailwind 的 4/8/12/16/24/32/48px 体系
- 字体：heading 用 text-2xl font-semibold，body 用 text-sm text-gray-600
- 不要添加任何我没有要求的动画效果
- 禁止使用内联 style=""，全部用 Tailwind 类名
```

### 5.2 UI 开发的正确顺序

```
1. Mobile 优先：先做 375px 宽度下的效果
2. 向上适配：再做 1280px 宽度
3. 交互状态：hover / focus / loading / error / empty
4. 内容边界：文字过长、列表为空、图片加载失败
```

### 5.3 UI 变更的「一改一验」原则

每次只改一个视觉属性，验证后再改下一个：

❌ 错误做法：
> 帮我改一下按钮颜色，同时把间距也调大一点，字体也换成粗体，再加一个阴影

✅ 正确做法：
> 只改按钮的背景色为 `bg-blue-600`，其他不动

### 5.4 建立视觉回归基线

在做重要的设计变更前，截图保存当前状态：

```bash
# 在项目里保存 UI 基线截图
/docs/ui-baselines/
  login-page-v1.png
  dashboard-v1.png
  ...
```

当 AI 改坏了某个部分，你有图为证，可以直接说：
> 你把这里改坏了，对比这张截图，把 [具体元素] 恢复成原来的样子

### 5.5 常见 UI 问题的精准指令

| 问题 | 给 AI 的精准指令 |
|------|----------------|
| 样式不一致 | "检查所有按钮是否使用统一的 btn-primary 类名，不一致的统一修改" |
| 响应式坏了 | "只检查 /components/X.tsx 在 640px 以下的布局，其他不动" |
| 颜色用错了 | "全局搜索所有硬编码的颜色值（非 Tailwind 类名），替换为对应 token" |
| 间距不统一 | "检查并统一 Y 组件内的所有 padding/margin，使用 8/16/24px 体系" |

---

## 六、功能开发与测试验证

### 6.1 功能开发的「最小可验证单元」原则

**每次只让 AI 做一件可以独立验证的事**：

❌ 太大的任务（1个任务，AI 容易出错）：
> 做一个完整的电商下单流程，包括商品选择、数量修改、优惠码、地址选择、支付

✅ 正确拆分（6个可独立验证的任务）：
```
Task-1: 商品列表展示（静态数据即可）
Task-2: 商品选择和数量修改逻辑
Task-3: 购物车数据结构和状态管理
Task-4: 优惠码校验 API 和 UI
Task-5: 地址选择组件
Task-6: 订单提交 API 调用和结果展示
```

### 6.2 功能验证三步法

每个任务完成后，用这三步验证：

**Step 1：Happy Path（正常路径）**
按照最正常的操作流程走一遍，确认主要功能可用。

**Step 2：Edge Cases（边界情况）**
```markdown
□ 输入为空时怎么处理
□ 输入超长字符串（1000个字）
□ 网络断开时
□ 数据为空时（列表0条）
□ 数据量极大时（列表1000条）
□ 用户连续快速点击按钮
□ 同一账号多 tab 打开
```

**Step 3：错误状态**
```markdown
□ API 返回错误码时，有合适的提示
□ 网络超时有处理
□ 401/403 有对应跳转
□ 500 错误有友好提示（不是白屏）
```

### 6.3 用「用户视角」跑通全流程

**每完成一个核心用户旅程，做一次端到端走查**：

创建 `/docs/user-journeys.md`：
```markdown
# 用户旅程测试清单

## 旅程1：新用户注册到完成第一个核心操作
1. 打开首页（未登录）→ 看到什么
2. 点击注册 → 填写信息 → 提交
3. 收到验证邮件 → 点击确认
4. 引导页 → 设置基本信息
5. 进入主界面 → 完成第一个操作
6. 退出 → 再次登录 → 确认数据保留

每个步骤标注：✅ 正常 / ❌ 有问题（描述问题）
```

### 6.4 Bug 精准定位指令

发现 bug 时，不要直接说"有个 bug"，用这个格式：

```markdown
## Bug 报告

**现象**：[描述看到的错误现象，截图优先]
**期望**：[应该是什么样的]
**复现步骤**：
1. [第一步]
2. [第二步]
3. [看到报错]

**环境**：[浏览器/设备/账号类型]
**Console 报错**：[粘贴完整错误信息]
**相关文件**：[猜测问题在哪个文件]

**请只修改与这个 bug 直接相关的代码，不要做其他优化。**
```

---

## 七、上线部署 Checklist

### 7.1 代码质量关（上线前必过）

```markdown
## 代码质量检查
□ TypeScript 无报错：npm run type-check
□ ESLint 无 error：npm run lint
□ 所有 TODO 注释已处理或记录到 backlog
□ 无 console.log（只保留 console.error）
□ 无硬编码的 API URL / 密钥 / 测试账号
□ 所有环境变量已迁移到 .env.example
□ package.json 中无未使用的依赖
```

### 7.2 安全关

```markdown
## 安全检查
□ 所有 API 路由有认证校验
□ 用户只能访问自己的数据（鉴权，不只是认证）
□ 所有用户输入有服务端校验（不只是前端）
□ SQL 查询用 ORM（防 SQL 注入）
□ 文件上传有类型和大小限制
□ Rate Limiting 已配置（防滥用）
□ CORS 已正确配置（不是 * ）
□ 敏感数据（密码/Token）不在响应体里明文返回
```

### 7.3 性能关

```markdown
## 性能检查
□ Lighthouse 评分 > 85（跑一次）
□ 图片已压缩/使用 next/image
□ 首屏没有不必要的大依赖（Bundle Analyzer）
□ 数据库查询有索引（检查慢查询）
□ API 响应时间 < 500ms（P99）
□ 分页：列表接口不能返回全量数据
```

### 7.4 稳定性关

```markdown
## 稳定性检查
□ 错误监控已接入（Sentry）
□ 关键操作有日志记录
□ 数据库已设置备份策略
□ 环境变量在目标环境全部配置完成
□ 健康检查接口 /api/health 可用
□ 数据库连接池配置合理（连接数上限）
```

### 7.5 上线后的前 24 小时观察清单

```markdown
## 上线后监控
□ 错误率 < 0.1%（监控 Sentry）
□ API P99 响应时间 < 1s
□ 数据库 CPU < 70%
□ 核心功能人工走查一遍
□ 第一批真实用户操作路径监控
□ 检查服务器日志有无异常
```

---

## 八、AI API 集成与生产管理

这是你最头疼的部分。核心策略是：**不要让 Agent 工具直接面对复杂的生产环境，要建一层「AI API 网关层」**。

### 8.1 AI API 网关层设计

```typescript
// /lib/ai/gateway.ts — 所有 AI 调用必须走这里

interface AIRequestConfig {
  model: string;
  maxTokens: number;
  timeout: number;
  retries: number;
  fallback?: string; // 主模型失败时的备用模型
  userId?: string;   // 用于用量追踪和 Rate Limiting
}

export async function callAI(
  prompt: string,
  config: AIRequestConfig
): Promise<AIResponse> {
  // 1. Rate Limiting 检查（按用户/按功能）
  await checkRateLimit(config.userId, config.model);
  
  // 2. 请求日志记录（发送前）
  const requestId = logAIRequest({ prompt, config });
  
  // 3. 带超时和重试的 API 调用
  try {
    const result = await callWithRetry(prompt, config);
    
    // 4. 响应日志记录（包含耗时、Token 用量）
    logAIResponse(requestId, result);
    
    return result;
    
  } catch (error) {
    // 5. 降级处理
    if (config.fallback) {
      return callAI(prompt, { ...config, model: config.fallback });
    }
    
    // 6. 错误上报
    reportError(requestId, error);
    throw error;
  }
}
```

### 8.2 Rate Limiting 方案

```typescript
// /lib/ai/rate-limit.ts

// 用 Upstash Redis 做分布式限流
const rateLimits = {
  // 免费用户：每天 20 次 AI 调用
  free: { requests: 20, window: '24h' },
  // 付费用户：每小时 100 次
  pro: { requests: 100, window: '1h' },
  // 全局保护：防止单个 IP 的 DDoS
  global: { requests: 1000, window: '1h' },
};
```

### 8.3 流式输出的正确实现（C 端体验关键）

```typescript
// /app/api/ai/stream/route.ts

export async function POST(req: Request) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const aiStream = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          stream: true,
          // ... 其他参数
        });
        
        for await (const chunk of aiStream) {
          if (chunk.type === 'content_block_delta') {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
            );
          }
        }
        
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
        
      } catch (error) {
        // 流式接口的错误处理
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: '生成失败' })}\n\n`)
        );
        controller.close();
      }
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
```

### 8.4 AI 功能的监控仪表盘

建立一个内部监控页面 `/app/(admin)/ai-monitor/page.tsx`，展示：

```markdown
## 需要实时监控的指标

### 用量类
- 今日 API 调用次数（按模型）
- 今日 Token 消耗（输入 + 输出）
- 今日 AI 功能费用估算
- 各功能调用占比

### 健康类
- API 平均响应时间（P50 / P95 / P99）
- 错误率（成功 vs 失败）
- 超时次数

### 业务类
- 用户 AI 使用分布（哪些用户用得多）
- 哪些 Prompt 失败率最高
- 用户满意度（如果有反馈机制）
```

### 8.5 成本控制策略

```markdown
## AI API 成本控制

1. Prompt 缓存：相同输入 + 相同 System Prompt → 缓存 24 小时
2. 模型分级：
   - 轻量任务（分类/判断）→ claude-haiku（便宜 20 倍）
   - 中等任务（摘要/改写）→ claude-sonnet
   - 复杂任务（创作/分析）→ claude-opus
3. 输出长度控制：设置合理的 max_tokens，避免超长输出
4. 批处理：非实时任务攒批处理（用 Batch API）
5. 预算告警：设置日/月费用上限，超出时降级或拦截
```

### 8.6 常见 AI API 问题的处理方案

| 问题 | 解决方案 |
|------|---------|
| API 超时 | 设 30s 超时 + 重试 2 次 + 用户提示"稍后重试" |
| Rate Limit（API 层） | 指数退避重试，最多 3 次 |
| 输出质量差 | A/B 测试不同 Prompt，用数据决策 |
| 内容被过滤 | 捕获 content_filter 错误，给友好提示 |
| 高并发 | 请求队列 + 限流，拒绝多余请求而非超时等待 |
| 费用突增 | 实时费用监控 + 自动熔断 |

---

## 九、模板库

### 模板A：功能开发启动 Prompt

```
我要开发 [功能名称]。

## 上下文
- 项目技术栈：[复制 TECH-STACK.md 关键部分]
- 当前相关文件：[列出相关文件路径]
- 设计规范参考：[复制 DESIGN-SYSTEM.md 关键 Token]

## 任务描述
[填写 R2T 层处理后的标准化需求]

## 完成标准
- [ ] [具体可验证的条件1]
- [ ] [具体可验证的条件2]

## 注意事项
- 不要修改 [文件A] 和 [文件B]
- 新组件放在 /components/features/[功能目录]/ 下
- 颜色只用设计 Token，不要自创

请先告诉我你的实现计划（不要直接写代码），我确认后再开始。
```

---

### 模板B：Bug 修复 Prompt

```
发现一个 bug，请帮我定位和修复。

## 问题描述
[截图 / 文字描述]

## 复现步骤
1. 
2. 
3. 

## 期望行为
[应该是什么样的]

## 实际行为
[实际是什么样的]

## Console 报错
[粘贴完整错误信息和堆栈]

## 可能涉及的文件
[猜测在哪个文件，可以不填]

## 约束
- 只修改与这个 bug 直接相关的代码
- 不要顺手做其他优化
- 修改完告诉我改了哪些行
```

---

### 模板C：UI 调整 Prompt

```
需要调整 UI，请严格按照以下要求修改。

## 修改范围
文件：[明确到具体文件和组件]

## 修改内容（每条独立，不要合并处理）
1. [具体修改1：把 X 从 A 改为 B]
2. [具体修改2：把 Y 从 C 改为 D]

## 设计约束
- 不能改变组件的结构/布局
- 颜色必须使用 [具体 Token 名]
- 不要添加任何未要求的效果

## 验收
改完后截图告诉我，我来确认。
```

---

### 模板D：上线前自检 Checklist（可复制为 PR 描述）

```markdown
## 上线前自检 Checklist

### 功能
- [ ] Happy Path 测试通过
- [ ] 边界情况处理完毕
- [ ] 错误状态有友好提示

### 代码质量
- [ ] TypeScript 无报错
- [ ] ESLint 无 error
- [ ] 无 console.log

### 安全
- [ ] 所有接口有权限校验
- [ ] 用户输入有服务端校验

### 性能
- [ ] 列表接口有分页
- [ ] 图片已优化

### 环境
- [ ] 环境变量在生产环境已配置
- [ ] 数据库 Migration 已执行

### 上线后
- [ ] 监控已就绪
- [ ] 人工走查计划已安排
```

---

### 模板E：复杂任务任务卡

```markdown
# 任务卡 v1.0

## 任务信息
- 主改动类型：产品主线 / IA / UI 视觉 / AI·数据（四选一）
- 版本目标：原型 / 灰度内测 / 公开 MVP / 商用版（四选一）
- 目标一句话：
- 本轮不动清单：

## 现状与约束
- 相关页面/路由：
- 相关数据 owner：
- 依赖/前置条件：
- 风险点：

## 验收卡
- 必须有：
- 禁止有：
- 主 CTA：
- 下一步：

## 拆解任务
- [ ] Task-1:
- [ ] Task-2:
- [ ] Task-3:

## 验证
- [ ] 本地/单元/集成验证命令
- [ ] 浏览器/截图验收
- [ ] 验证证据记录
```

一张任务卡只处理一个主改动层；如果内容超过两小时，就继续拆成下一张任务卡。

---

## 十、持续改进机制

### 10.1 每个项目迭代后复盘

每个功能上线后，更新以下文件：

1. **`/docs/GOTCHAS.md`** — 踩过的坑记录

```markdown
# 踩坑记录

## [日期] [问题描述]
- 现象：
- 根因：
- 解决方案：
- 预防措施（已加入 CLAUDE.md / .cursorrules）：
```

2. **更新 CLAUDE.md** — 把每次踩坑的解决方案固化成 AI 的约束规则

3. **更新 R2T 模板** — 发现哪类需求经常被误解，就在模板里加对应的「缺口识别」项

### 10.2 每周质量回顾

```markdown
□ 本周发现了哪些 AI 工具的使用规律（什么 Prompt 更有效）
□ 哪些类型的任务 AI 经常做错 → 改进任务拆解方式
□ 是否有新的踩坑 → 更新 GOTCHAS.md 和 CLAUDE.md
□ 设计系统是否有需要补充的 Token
```

---

### 10.3 返工复盘分类

每次返工都先判断属于哪一类，再决定怎么修。

| 类别 | 典型症状 | 根因 | 修复动作 |
|------|----------|------|----------|
| 需求未锁定 | 这次做出来和你想的不一致 | 只说“想要什么”，没说“这轮不改什么” | 回到任务卡，补主改动类型、版本目标、不动清单和验收卡 |
| 层级混改 | 一次改了 UI、流程、数据和文案 | 没有只改一层的约束 | 拆成单层任务，先锁定主改动类型 |
| 验证缺失 | 说完成了，但实际没跑通 | 只改代码，没做 fresh verify | 强制跑验证命令和浏览器检查，再记录证据 |
| 配置未加载 | 规则写了但还是反复跑偏 | 全局/项目规则没有真正进入对话 | 先检查 `AGENTS.md`、记忆文件和会话上下文是否已读入 |
| 上下文漂移 | 聊天越长越偏，越改越散 | 长对话丢失约束 | 开新会话，带任务卡和当前状态快照重新开始 |

**复盘原则**

- 连续两次偏航，就不要继续硬改，先重新写任务卡。
- 如果同类问题反复出现，优先改规则和模板，而不是只修单次结果。
- 任何“看起来差不多”的结果，如果没过验收，都不能算完成。

---

> **最后的核心原则**：
>
> Vibe Coding 的本质是**把你的意图精准传递给 AI**。
> 工具越强，对「输入质量」的要求越高，而不是越低。
> 
> 你在 R2T 层和文档体系上花的每 1 小时，
> 可以节省后续 5 小时的返工和调试时间。
> 
> **结构化输入 → 结构化执行 → 结构化验证**，这就是 Vibe Coding 能做好产品的公式。
