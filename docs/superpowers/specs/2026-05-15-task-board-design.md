---
title: Task Board 设计文档
date: 2026-05-15
status: approved
---

# Task Board 设计文档

## 目标

将 `task.md` 改造为 HTML 看板 + JSON 数据源的方案，让人类和 Agent 都能方便地读写任务。

## 决策摘要

| 决策点 | 选择 |
|---|---|
| 数据源 | JSON 文件（`tasks.json`） |
| UI 交互 | 表格 + 下拉框修改状态 |
| Agent 读写 | 直接读写 JSON 文件，无锁 |
| 归档策略 | 留在 JSON 中，`archived` 字段标记，看板默认隐藏 |
| 同步机制 | File System Access API 直接读写本地文件 |
| 数据字段 | ID、任务名、分类标签、优先级、状态、验收标准、备注、创建日期 |

## 文件结构

```
项目根目录/
├── tasks.json          # 数据源（Agent + 人类共同读写）
├── task-board.html     # 看板 UI（单文件，内嵌 CSS/JS，无外部依赖）
└── progress.md         # 保留，记录每轮任务摘要
```

## `tasks.json` 数据结构

```json
{
  "version": 1,
  "tasks": [
    {
      "id": "T-20260515-003",
      "name": "修复管理页恢复/新建会话后按钮永久禁用及重复打开窗口",
      "category": "fix",
      "priority": "P1",
      "status": "完成",
      "criteria": "恢复/新建会话后管理页保持可用且不重复打开窗口",
      "notes": "2026-05-15 用户确认修复成功",
      "createdAt": "2026-05-15",
      "archived": false
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | 任务 ID，如 `T-20260515-003` |
| `name` | string | 是 | 任务名称 |
| `category` | string | 否 | 分类标签：`feat` / `fix` / `design` / `test` / `refactor` / `docs` |
| `priority` | string | 否 | 优先级：`P0` / `P1` / `P2` |
| `status` | string | 是 | 状态：`待进行` / `进行中` / `待确认` / `完成` / `失败` |
| `criteria` | string | 否 | 验收标准 |
| `notes` | string | 否 | 备注 |
| `createdAt` | string | 否 | 创建日期，ISO 格式 `YYYY-MM-DD` |
| `archived` | boolean | 否 | 是否归档，默认 `false` |

## Agent 读写协议

Agent 通过标准文件操作读写 `tasks.json`：

- **读取**：`Get-Content tasks.json -Raw` → `JSON.parse`
- **新增任务**：解析 → 追加 task 对象 → `JSON.stringify` 写回
- **修改状态**：解析 → 找到目标 task → 改 `status` 字段 → 写回
- **归档**：将 completed/failed 的 task 的 `archived` 设为 `true`

示例（Node 一行命令）：

```bash
node -e "const f='tasks.json';const d=JSON.parse(require('fs').readFileSync(f,'utf8'));d.tasks.find(t=>t.id==='T-20260515-003').status='完成';require('fs').writeFileSync(f,JSON.stringify(d,null,2))"
```

## HTML 看板 UI

### 布局

单页面，上下结构：

1. **顶部操作栏**：新增任务按钮 + 筛选下拉（按状态/分类/优先级）+ 打开文件按钮 + 保存按钮
2. **主表格区**：每行一个任务，列依次为：
   - ID（只读）
   - 任务名（可展开详情行显示验收标准和备注）
   - 分类标签（彩色 badge）
   - 优先级（下拉切换）
   - 状态（下拉切换：待进行 / 进行中 / 待确认 / 完成 / 失败）
   - 操作按钮（编辑、归档）
3. **底部折叠区**：`archived=true` 的任务，默认折叠，点击"显示归档"展开

### 文件读写

使用 Chrome File System Access API：

1. 页面加载时点击"打开文件"，选择 `tasks.json`，浏览器获得读写权限
2. 所有编辑操作反映到页面内存
3. 点击"保存"按钮 → 直接写回同一个 `tasks.json` 文件

Chrome 会记住文件权限，刷新后仍可直接保存到原文件。

### 新增任务

点击"新增任务"按钮展开表单，填写任务名（必填）、分类、优先级、验收标准、备注。ID 自动生成（`T-YYYYMMDD-NNN`），创建日期自动填入，状态默认 `待进行`。

## 迁移计划

1. 从当前 `task.md` 解析任务数据，生成 `tasks.json` 初始文件
2. `task-board.html` 完成后，`task.md` 保留为只读参考，不再作为主数据源
3. `AGENTS.md` 中更新任务流程说明，Agent 改为读写 `tasks.json`

## 验收标准

1. 人类可在浏览器中打开 `task-board.html`，加载 `tasks.json`，查看所有任务
2. 可通过下拉框切换任务状态，可新增任务，可编辑任务详情
3. 点击保存按钮可将修改写回 `tasks.json` 文件
4. Agent 可通过 `node -e` 命令直接读写 `tasks.json`
5. 归档任务默认隐藏，可展开查看
6. 筛选功能可按状态/分类/优先级过滤任务
