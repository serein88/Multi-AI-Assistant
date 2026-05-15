---
title: Task Board 实施计划
date: 2026-05-15
spec: docs/superpowers/specs/2026-05-15-task-board-design.md
status: ready
---

# Task Board 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `task.md` 改造为 HTML 看板 + JSON 数据源，让人类和 Agent 都能方便地读写任务。

**Architecture:** 单文件 `task-board.html`（内嵌 CSS/JS，无外部依赖）通过 File System Access API 读写 `tasks.json`。Agent 通过标准文件操作读写同一个 JSON 文件。

**Tech Stack:** Vanilla HTML/CSS/JS，Chrome File System Access API，无构建工具。

---

## 文件结构

| 文件 | 操作 | 说明 |
|---|---|---|
| `tasks.json` | 创建 | 任务数据源 |
| `task-board.html` | 创建 | 看板 UI（单文件，内嵌 CSS/JS） |
| `task.md` | 修改 | 迁移后保留为只读参考 |
| `AGENTS.md` | 修改 | 更新任务流程说明 |

---

### Task 1: 从 task.md 解析并生成 tasks.json

**Files:**
- Create: `tasks.json`
- Read: `task.md`

- [ ] **Step 1: 解析 task.md 活跃任务表格**

从 `task.md` 的 `## 活跃任务` 表格中提取所有任务行，解析为 JSON 对象。字段映射：
- ID → `id`
- 任务名 → `name`
- 优先级 → `priority`
- 状态 → `status`
- 验收标准 → `criteria`
- 阻塞/备注 → `notes`
- 分类标签从任务名推断（如"修复"→`fix`，"设计"→`design`，"新建"→`feat`）

- [ ] **Step 2: 解析已归档任务和技术债**

从 `## 已归档任务` 和 `## 技术债 Backlog` 表格中提取任务，标记 `archived: true`。

- [ ] **Step 3: 生成 tasks.json**

按设计文档的 JSON 结构写入 `tasks.json`，`version: 1`。

- [ ] **Step 4: 验证 JSON 合法性**

```bash
node -e "const d=JSON.parse(require('fs').readFileSync('tasks.json','utf8'));console.log('tasks:',d.tasks.length,'version:',d.version)"
```

Expected: 输出任务数量和 version。

- [ ] **Step 5: 提交**

```bash
git add tasks.json
git commit -m "feat(T-20260515-004): 从 task.md 解析生成 tasks.json 初始数据"
```

---

### Task 2: 创建 task-board.html 基础框架

**Files:**
- Create: `task-board.html`

- [ ] **Step 1: 创建 HTML 骨架**

创建 `task-board.html`，包含：
- `<head>`：viewport、title、内嵌 `<style>` 块
- `<body>`：顶部操作栏、主表格区、底部归档区
- `<script>`：内嵌 JS 块

- [ ] **Step 2: 实现 File System Access API 读写**

在 JS 中实现：
- `openFile()`：调用 `window.showOpenFilePicker()` 选择 `tasks.json`
- `saveFile()`：调用 `fileHandle.createWritable()` 写回原文件
- 页面加载时尝试自动恢复上次的文件句柄（通过 `indexedDB` 或提示用户重新打开）

- [ ] **Step 3: 实现任务表格渲染**

从 JSON 数据渲染表格，列：ID、任务名、分类标签、优先级、状态、操作。
分类标签用彩色 badge（`feat` 绿色、`fix` 红色、`design` 蓝色等）。

- [ ] **Step 4: 实现状态下拉切换**

每行状态列使用 `<select>`，切换后立即更新内存中的 JSON 数据，标记为"未保存"。

- [ ] **Step 5: 实现筛选功能**

顶部筛选下拉：按状态、分类、优先级过滤。多个筛选条件取交集。

- [ ] **Step 6: 实现归档折叠**

`archived=true` 的任务放在底部折叠区，默认隐藏，点击"显示归档"展开。

- [ ] **Step 7: 实现新增任务**

点击"新增任务"展开表单，填写任务名（必填）、分类、优先级���验收标准、备注。ID 自动生成 `T-YYYYMMDD-NNN`，创建日期自动填入，状态默认 `待进行`。

- [ ] **Step 8: 实现编辑任务**

点击任务行的"编辑"按钮展开详情行，可修改所有字段（除 ID）。

- [ ] **Step 9: 实现保存按钮**

点击保存 → 调用 `saveFile()` 写回 `tasks.json` → 更新保存状态指示器。

- [ ] **Step 10: 用 tasks.json 验证看板功能**

在浏览器中打开 `task-board.html`，加载 `tasks.json`，验证：
1. 所有任务正确显示
2. 下拉切换状态
3. 新增任务
4. 保存写回文件
5. 归档折叠
6. 筛选功能

- [ ] **Step 11: 提交**

```bash
git add task-board.html
git commit -m "feat(T-20260515-004): 创建 task-board.html 看板 UI"
```

---

### Task 3: 更新 AGENTS.md 和 task.md

**Files:**
- Modify: `AGENTS.md`
- Modify: `task.md`

- [ ] **Step 1: 更新 AGENTS.md**

在 `AGENTS.md` 中添加说明：
- Agent 任务读写改为 `tasks.json`
- 状态操作示例（node -e 命令）
- `task.md` 保留为只读参考

- [ ] **Step 2: 更新 task.md**

在 `task.md` 顶部添加说明：数据源已迁移至 `tasks.json`，本文件保留为只读参考。

- [ ] **Step 3: 提交**

```bash
git add AGENTS.md task.md
git commit -m "docs(T-20260515-004): 更新任务流程说明，Agent 改为读写 tasks.json"
```

---

### Task 4: 最终验收

- [ ] **Step 1: 全链路验证**

1. 浏览器打开 `task-board.html`
2. 点击"打开文件"加载 `tasks.json`
3. 切换任务状态
4. 新增任务
5. 点击保存
6. 用 `node -e` 读取 `tasks.json` 验证写入正确
7. 刷新页面，验证数据持久化

- [ ] **Step 2: 标记任务完成**

更新 `tasks.json` 中 T-20260515-004 状态为 `完成`。

```bash
git add tasks.json task.md
git commit -m "task: T-20260515-004 标记完成"
```
