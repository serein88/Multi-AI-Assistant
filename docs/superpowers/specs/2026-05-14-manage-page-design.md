# Manage Page 设计文档

> 日期：2026-05-14
> 替代 popup.html，点击扩展图标在新标签页中打开管理页

## 背景

当前 `popup.html` 是一个 340px 宽的弹窗页面，用于新建/恢复会话。由于 MV3 manifest 配置了 `default_popup`，`chrome.action.onClicked` 从未触发。

目标：用一个全屏新标签页（`manage.html`）替代 popup，采用左右分栏布局，提供更好的会话管理体验。

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `manage.html` | 管理页 HTML |
| 新建 | `manage.css` | 全屏响应式样式 |
| 新建 | `manage.js` | 会话管理逻辑（从 popup.js 移植） |
| 修改 | `manifest.json` | 移除 `default_popup`，添加 `manage.html` 到 `web_accessible_resources` |
| 修改 | `background.js` | `action.onClicked` 改为打开 `manage.html` |
| 保留 | `popup.html` / `popup.css` / `popup.js` | 暂不删除，后续清理 |

## 页面布局

顶部栏：左侧扩展名称，右侧「后台创建」开关 + 「新建会话」按钮。
左侧导航（~260px）：历史会话列表，垂直排列可滚动。
右侧内容区：默认引导文案，选中会话后显示子会话详情 + 恢复按钮。

## 交互流程

1. 点击扩展图标 -> 新标签打开 manage.html，自动加载历史会话列表
2. 点击「新建会话」：发送 session:create -> 成功后跳转 dashboard.html
3. 左侧选中历史会话：右侧显示子会话详情
4. 点击「恢复会话」：发送 session:restore -> 成功后跳转 dashboard.html

## background.js 改动

action.onClicked 改为打开 manage.html（而非 dashboard.html）。

## manifest.json 改动

移除 default_popup 字段；将 manage.html、manage.css、manage.js 加入 web_accessible_resources。

## 视觉风格

复用 popup 配色：暖纸色背景 #f3f0e8、卡片 #fffdf7、边框 #dfd6c7。
左侧导航背景略深 #eae5db，选中项 #fffdf7 + 左边框 #1f3c35。
按钮风格与 popup 一致（圆角 10px、深绿主按钮 #1f3c35）。

## 响应式断点

>= 1024px: 左右分栏，左侧 260px
768px - 1023px: 左右分栏，左侧 200px
< 768px: 上下堆叠，左侧变顶部导航栏

## 不在范围内

popup 文件的删除（后续清理任务）。
dashboard.html 的全屏适配（dashboard 已是全屏页）。
会话删除功能（可选增强，不阻塞主流程）。

## 验收标准

1. 点击扩展图标 -> 新标签打开管理页，无 popup 弹出
2. 管理页加载后自动显示历史会话列表
3. 点击「新建会话」-> 创建成功 -> 跳转到 dashboard
4. 选中历史会话 -> 右侧显示详情 -> 点击「恢复会话」-> 跳转到 dashboard
5. 响应式：窄屏下布局不破碎
6. node --check manage.js 通过
7. 现有测试不受影响：node --test tests/session/*.test.js 全部通过
