# Extension Transcript Layer MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add transcript capture and answer-state tracking for extension-managed sessions, and expose the captured history inside `dashboard`.

**Architecture:** Keep the extension as the single source of truth. Content scripts observe newly added turns after takeover and report them to `background.js`; the background persists raw child transcripts plus a merged session timeline; `dashboard` reads and renders both views.

**Tech Stack:** Chrome Extension MV3, Vanilla JavaScript, `chrome.storage.local`, Node built-in test runner

---

## File Structure

- Modify: `background.js`
  - Extend session storage model and handle transcript-related runtime messages.
- Modify: `content/content.js`
  - Detect new turns and live answer status for `DeepSeek / Gemini / Grok`.
- Modify: `dashboard.js`
  - Read transcript data and render timeline / child transcript views.
- Modify: `dashboard.html`
  - Add transcript viewing container in the dashboard shell.
- Modify: `dashboard.css`
  - Add minimal layout for transcript panel / drawer and live status badges.
- Create or modify: `tests/session/transcript-store.test.js`
  - Test background-side transcript append/update rules.
- Create or modify: `tests/session/transcript-normalization.test.js`
  - Test turn merging, dedupe and status update rules.
- Modify: `task.md`
  - Track transcript-layer tasks.
- Modify: `progress.md`
  - Record evidence and validation.

---

### Task 1: 定义转录数据结构

**Files:**
- Modify: `background.js`
- Test: `tests/session/transcript-store.test.js`

- [ ] Step 1: 写转录存储的失败测试
- [ ] Step 2: 验证测试失败
- [ ] Step 3: 在 `background.js` 中补会话级 transcript 数据结构
- [ ] Step 4: 让测试通过
- [ ] Step 5: 提交一次小步变更

### Task 2: 打通实时状态消息

**Files:**
- Modify: `background.js`
- Modify: `content/content.js`
- Test: `tests/session/transcript-normalization.test.js`

- [ ] Step 1: 写“开始回答 / 完成回答 / 失败中断”状态流测试
- [ ] Step 2: 验证测试失败
- [ ] Step 3: 在 `content/content.js` 中增加 transcript runtime message 发送
- [ ] Step 4: 在 `background.js` 中处理 live status 更新
- [ ] Step 5: 让测试通过
- [ ] Step 6: 提交一次小步变更

### Task 3: 记录扩展统一发送产生的轮次

**Files:**
- Modify: `background.js`
- Modify: `dashboard.js`
- Test: `tests/session/transcript-store.test.js`

- [ ] Step 1: 写“统一发送后 user turn 入账本”的失败测试
- [ ] Step 2: 验证测试失败
- [ ] Step 3: 在统一发送链路中写入 user turn
- [ ] Step 4: 让测试通过
- [ ] Step 5: 提交一次小步变更

### Task 4: 记录手动继续对话产生的轮次

**Files:**
- Modify: `content/content.js`
- Modify: `background.js`
- Test: `tests/session/transcript-normalization.test.js`

- [ ] Step 1: 写“手动新增 user / assistant turn 能入账本”的失败测试
- [ ] Step 2: 验证测试失败
- [ ] Step 3: 在 provider 页面监听新增轮次
- [ ] Step 4: 做最小去重与 turn 归并
- [ ] Step 5: 让测试通过
- [ ] Step 6: 提交一次小步变更

### Task 5: 维护总时间线

**Files:**
- Modify: `background.js`
- Test: `tests/session/transcript-store.test.js`

- [ ] Step 1: 写“子会话原始记录 + 总时间线同时更新”的失败测试
- [ ] Step 2: 验证测试失败
- [ ] Step 3: 在 background 侧同步维护 timeline
- [ ] Step 4: 让测试通过
- [ ] Step 5: 提交一次小步变更

### Task 6: 在 Dashboard 中显示记录

**Files:**
- Modify: `dashboard.html`
- Modify: `dashboard.js`
- Modify: `dashboard.css`

- [ ] Step 1: 增加 transcript 查看区的骨架结构
- [ ] Step 2: 加总时间线视图
- [ ] Step 3: 加按 provider 查看的原始记录视图
- [ ] Step 4: 加 live status 展示
- [ ] Step 5: 手工验证 UI 可读性
- [ ] Step 6: 提交一次小步变更

### Task 7: 整体回归与收口

**Files:**
- Modify: `task.md`
- Modify: `progress.md`

- [ ] Step 1: 运行 transcript 相关 Node 测试
- [ ] Step 2: 运行 `node --check background.js dashboard.js content/content.js`
- [ ] Step 3: 在 Chrome 中手工验证新建会话、发送、手动继续聊、恢复后查看记录
- [ ] Step 4: 记录验证证据到 `progress.md`
- [ ] Step 5: 更新 `task.md` 状态
- [ ] Step 6: 提交收口变更

---

## Manual Validation Matrix

1. 新建会话，确认 `dashboard` 打开正常。
2. 通过统一发送发出一轮消息，确认：
   - user turn 被记录
   - assistant turn 被记录
   - provider 状态从回答中变成完成
3. 在某个子会话页面手动继续聊一轮，确认也被记录。
4. 在 `dashboard` 中查看：
   - 总时间线
   - 单个 provider 原始记录
5. 恢复该会话，确认记录仍可读。

---

## Validation Commands

```powershell
node --test tests/session/transcript-store.test.js tests/session/transcript-normalization.test.js
node --check background.js
node --check dashboard.js
node --check content/content.js
```
