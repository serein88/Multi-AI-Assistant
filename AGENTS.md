# AGENTS.md — Multi AI Assistant 开发规范

## 1. 项目目标与技术栈

`Multi AI Assistant` 是一个 Chrome Manifest V3 扩展，核心用途是：

- 在一个 Dashboard 中分屏打开多个 AI 网站（如 ChatGPT、Claude、Gemini、Grok 等）。
- 通过统一输入框，将同一条提示词分发给多个 AI。
- 为后续模式（如群聊模式）提供可扩展的任务化开发流程。

技术栈与边界：

- 纯前端：Vanilla JavaScript + Chrome Extension APIs + CSS。
- 无构建工具，无后端服务。
- 重点在稳定迭代与可回滚提交，而不是一次性大改。

---

## 2. 流程文件与职责

项目根目录维护以下文件，统一管理开发流程：

| 文件 | 职责 |
|---|---|
| `AGENTS.md` | 项目目标、开发规范、可复用经验。所有开发轮次必须遵循。 |
| `tasks.json` | **任务主数据源**。维护任务池、优先级、状态流转。看板 UI：`task-board.html`。 |
| `progress.md` | 每轮任务摘要、验证证据、风险与下一步。用于复盘与经验沉淀。 |
| `task.md` | **只读参考**（已迁移至 `tasks.json`），不再作为主数据源。 |

Agent 通过标准文件操作读写 `tasks.json`，与人类操作同一个文件。

---

## 3. 开发工作流（必须执行）

### 3.1 领取任务

- 从 `tasks.json` 的待进行任务中按优先级领取，或按用户指定领取。
- 领取后立即将该任务状态改为 `进行中`。

### 3.2 编码

- 仅修改与当前任务相关的文件，保持最小改动。
- 发现新问题不得插队；将问题作为新任务写入 `tasks.json` 或在 `progress.md` 备注。

### 3.3 验证

- 必须给出可复现的测试步骤。
- 必须提供关键日志、命令输出或可观察结果作为证据。
- 未提供证据时，任务状态最多只能到 `进行中`。

### 3.4 状态流转

`tasks.json` 中任务仅允许以下状态：

| 状态 | 含义 |
|---|---|
| `待进行` | 待领取，默认按优先级排序。 |
| `进行中` | 当前轮次正在处理。 |
| `待确认` | 已完成开发与自测，等待用户确认。 |
| `完成` | 用户确认通过。 |
| `失败` | 本轮无法完成，已写明阻塞与建议。 |

流转规则：成功时 `进行中 → 待确认`（用户确认后改为 `完成`）；失败时 `进行中 → 失败`，记录原因与下一步。

### 3.5 提交代码

- 每一小步提交都应可回滚。
- 提交备注必须包含任务 ID + 任务名。

### 3.6 进度记录

每轮在 `progress.md` 至少记录：任务 ID 与名称、变更文件清单、可复现步骤、关键证据、风险与后续建议。

---

## 4. 强约束

- 一轮只做一个任务。
- 没有验证证据，不得标记 `完成`。
- 每轮结束必须更新 `progress.md` 和 `tasks.json`。
- 复杂任务必须拆成可验证的子任务。若超出单轮可控范围，先交付最小可验证子任务。

---

## 5. 调试原则

- **不与错误作斗争**：同一错误遇到两次时，停止重试。上网研究 3-5 种可能的修复方案，选择最高效的方案实施。
- **窗口管理**：会话创建/恢复使用 `chrome.tabs.create`（新标签），不用 `chrome.windows.create`（新窗口）。
- **选择器原则**：`sendButtonSelectors` 必须精确匹配发送控件，避免误命中侧边栏等非目标控件。

---

## 6. 可复用经验

高层流程参考：

- **Provider 适配**：`providers.js` + `manifest.json` + `content/content.js` + `rules.json` 同步更新。
- **发送链路排查**：`dashboard postMessage → content trySendPrompt → sendResult/responseStarted/responseComplete`。
- **提交策略**：优先小步、单任务、可回滚的提交单元。

技术细节（独立参考文档）：

- `docs/superpowers/references/grok-adapter-notes.md` — Grok 发送判定与降级兜底。
- `docs/superpowers/references/transcript-scraping-notes.md` — 转录抓取：完成检测、MutationObserver、thinking 过滤。
- `docs/superpowers/references/chrome-debugging-notes.md` — Chrome 调试连接与 Playwright 扩展页调试。
