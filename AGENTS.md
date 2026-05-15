# AGENTS.md - Multi AI Assistant Vibe Coding 规范

## 1. 项目目标与用途

`Multi AI Assistant` 是一个 Chrome Manifest V3 扩展，核心用途是：

- 在一个 Dashboard 中分屏打开多个 AI 网站（如 ChatGPT、Claude、Gemini、Grok 等）。
- 通过统一输入框，将同一条提示词分发给多个 AI。
- 为后续模式（如群聊模式）提供可扩展的任务化开发流程。

技术栈与边界：

- 纯前端：Vanilla JavaScript + Chrome Extension APIs + CSS。
- 无构建工具，无后端服务。
- 重点在稳定迭代与可回滚提交，而不是一次性大改。

---

## 2. 三个流程文件与职责

项目根目录维护以下文件，统一管理开发流程：

1. `AGENTS.md`
- 定义项目目标、开发规范、可复用经验。
- 作为所有开发轮次必须遵循的总规则。

2. `task.md`
- 维护任务池、优先级、状态流转。
- 每轮只允许领取并推进一个任务。

3. `progress.md`
- 记录每轮任务摘要、验证证据、风险与下一步。
- 用于后期复盘与经验沉淀。

---

## 3. 标准开发步骤（必须执行）

1. 领取一个任务
- 从 `task.md` 的“待进行”列表中按优先级领取。
- 或按用户明确指定的任务领取。
- 领取后立即将该任务状态改为“进行中”。

2. 开始编码
- 仅修改与当前任务相关的文件，保持最小改动。
- 发现新问题不得插队；将问题写入 `task.md`（新增待进行）或 `progress.md`（备注）。

3. 测试验证
- 必须给出可复现的测试步骤。
- 必须提供关键日志、命令输出或可观察结果作为证据。

4. 更新任务状态
- 成功：`进行中 -> 待确认`（用户确认后才能改为`完成`）。
- 失败：`进行中 -> 失败`，并记录原因、阻塞点、下一步建议。
- 将本轮摘要追加写入 `progress.md`。

5. 提交代码
- 每一小步提交都应可回滚。
- 提交备注必须包含任务名（或任务 ID + 任务名）。

---

## 4. 强约束（硬性）

- 一轮只做一个任务。
- 没有验证证据，不得标记“完成”。
- 每轮结束必须更新 `progress.md` 和 `task.md`。

---



## 9. 任务数据源（2026-05 迁移）

- 任务数据源已从 `task.md` 迁移至 `tasks.json`（JSON 格式）。
- 任务看板 UI：`task-board.html`，通过浏览器打开后可查看、编辑、新增任务。
- Agent 通过标准文件操作读写 `tasks.json`，与人类操作同一个文件。
- `task.md` 保留为只读参考，不再作为主数据源。

### Agent 读写 tasks.json 示例

**读取任务：**
```bash
node -e "const d=JSON.parse(require('fs').readFileSync('tasks.json','utf8'));console.log(d.tasks.filter(t=>!t.archived).map(t=>t.id+' '+t.status+' '+t.name).join('\n'))"
```

**修改任务状态：**
```bash
node -e "const f='tasks.json';const d=JSON.parse(require('fs').readFileSync(f,'utf8'));d.tasks.find(t=>t.id==='T-xxx').status='完成';require('fs').writeFileSync(f,JSON.stringify(d,null,2))"
```

**新增任务：**
```bash
node -e "const f='tasks.json';const d=JSON.parse(require('fs').readFileSync(f,'utf8'));d.tasks.push({id:'T-20260515-XXX',name:'任务名',category:'feat',priority:'P1',status:'待进行',criteria:'',notes:'',createdAt:'2026-05-15',archived:false});require('fs').writeFileSync(f,JSON.stringify(d,null,2))"
```

## 5. 任务状态定义

`task.md` 中仅允许以下 5 种状态：

- `待进行`：待领取，默认按优先级排序。
- `进行中`：当前轮次正在处理。
- `待确认`：已完成开发与自测，等待用户确认。
- `完成`：用户确认通过。
- `失败`：本轮无法完成，已写明阻塞与建议。

---

## 6. 拆分与排期规则

- 复杂任务必须拆成可验证的子任务，每个子任务可独立验收。
- 默认按优先级推进；用户可临时指定优先任务。
- 若任务超出单轮可控范围，先交付最小可验证子任务，再推进下一轮。

---

## 7. 测试与证据规范

每轮在 `progress.md` 至少记录以下内容：

- 任务 ID 与任务名。
- 变更文件清单。
- 可复现步骤（1,2,3...）。
- 关键证据（日志片段、命令结果、页面可观察现象）。
- 风险与后续建议。

未提供上述证据时，任务状态最多只能到 `进行中`，不能到 `待确认/完成`。

---

## 8. 可复用经验（持续补充）

以下内容可在后续迭代中复用并逐步扩展：

- Provider 适配流程：`providers.js` + `manifest.json` + `content/content.js` + `rules.json` 同步更新。
- Dashboard 调试流程：扩展页 DevTools + iframe frame DevTools + Service Worker 日志。
- 发送链路排查路径：`dashboard postMessage -> content trySendPrompt -> sendResult/responseStarted/responseComplete`。
- 低风险提交策略：优先小步、单任务、可回滚的提交单元。

### Grok 适配经验（2026-02）：

- 发送成功判定不要只看“点击成功”，要看强信号：`Stop` 出现 / 输入框清空 / 流式标记 / 响应节点增长。
- 对易波动站点（如 Grok）要有降级兜底：`sendResult:true` 后若 `responseStarted` 超时，回补 `sendResult:false`。
- 统一发送按钮的 `Sending...` 建议按“派发完成”释放，不阻塞在“响应开始”事件上。
- 验证扩展改动前先热重载（如 `chrome.runtime.reload()`），避免用旧脚本误判结果。
- Playwright 调试扩展页优先“先开普通页再 `window.open(chrome-extension://...)`”，并固定记录控制台日志作为证据。

### Chrome 调试连接规范（2026-02）：

- 未来默认使用”连接用户已打开的 Chrome 调试窗口”方式调试，不新开独立浏览器实例。
- 标准连接方式：优先通过 CDP 端口 `127.0.0.1:9222`（`chromium.connectOverCDP`）接管现有会话。
- 连接后优先复用现有扩展页标签（如 `chrome-extension://<extension-id>/dashboard.html`）做调试与验证。

### 转录抓取经验（2026-05）：

- **核心原则**：回答状态识别成”已完成”之后抓取一次回答内容（Gemini 模式正确）。不要在流式输出过程中持续抓取中间碎片。
- **完成检测主信号 — 发送/停止按钮状态**：发送消息后，发送按钮被替换为停止按钮；回答完成后，停止按钮消失、发送按钮恢复。`waitForResponseComplete` 使用”停止按钮消失 + 发送按钮恢复”作为所有 provider 的主信号，文本稳定性仅作兜底。
- **MutationObserver 属性监听**：`waitForResponseComplete` 的 observer 需要监听 `attributes: true, attributeFilter: ['disabled', 'class', 'aria-label', 'data-testid']`，使按钮状态变化可被实时检测。
- **thinking 内容过滤**：`extractLatestResponse` 必须检查 `shouldIgnoreThinkingNode`，并使用 `extractTextExcludingThinking` 克隆节点后移除 thinking 元素再提取文本。反向迭代优先取最新回答。
- **MutationObserver 干扰**：统一发送期间必须暂停 MutationObserver（`pauseManualTurnObserver`），避免 observer 捕获到流式中间态 DOM 变化导致重复 turn。发送完成后再恢复 observer。
- **选择器收窄原则**：Provider 的 `sendButtonSelectors` 必须精确匹配发送控件，避免宽泛选择器（如 `div[role='button'].ds-icon-button`）误命中侧边栏等非发送控件。
- **窗口管理**：会话创建/恢复应使用 `chrome.tabs.create`（当前窗口新建标签）而非 `chrome.windows.create`（弹出新窗口）。

