# Multi AI Assistant (Browser Extension)

**Manifest Version**: V3  

这是一个基于 Chrome Extension Manifest V3 的浏览器扩展，允许用户在**同一个标签页中分屏打开多个 AI 聊天网页**（如 ChatGPT, Claude, Gemini, Kimi, DeepSeek 等），并通过**底部的统一输入框**一键向所有 AI 发送提示词。


## 🌟 核心功能 (Core Features)

### 1. 分屏多开 (Split Screen Grid)
- **多面板支持**：支持同时打开任意数量的 AI 面板（受限于浏览器性能，建议 2-6 个）。
- **智能布局**：
  - **Auto 模式**：根据面板数量自动计算最佳行列数。
  - **手动模式**：支持手动锁定 1-6 列布局，行数自动适配。
  - **拖拽调整**：支持拖拽网格分割线调整面板宽高。
- **可视化排序**：在设置面板中，可以通过**拖拽 (Drag & Drop)** 重新排列 AI 的显示顺序（使用 FLIP 动画技术）。

### 2. 统一发送与交互 (Unified Interaction)
- **一键群发**：在底部输入框输入内容，点击发送（或 Enter），消息会自动分发给所有活跃的 AI 面板。
- **定向发送**：支持使用 `@1`, `@2` 等快捷指令，仅向特定编号的 AI 发送消息。
- **快捷键**：
  - `Enter`：发送消息。
  - `Shift + Enter`：换行。

### 3. 状态监控与反馈 (Status & Feedback)
- **实时状态 Badge**：每个面板左上角显示当前状态。
  - 🟡 **发送中 (Yellow)**：正在尝试注入并点击发送按钮。
  - 🟢 **回答中/已完成 (Green)**：检测到 AI 开始响应（DOM 变动或 Stop 按钮出现）。
  - 🔴 **发送失败 (Red)**：无法找到输入框或发送按钮超时。
- **全局完成通知**：当所有接收指令的 AI 都完成响应时，底部会弹出 **"X 个AI助手回答完毕"** 的 Toast 提示。

### 4. 强大的兼容性 (Compatibility)
- **iframe 嵌入**：通过 `declarativeNetRequest` (DNR) 规则移除部分站点的 `X-Frame-Options` 限制。
- **降级处理**：对于无法 iframe 嵌入的站点（如部分高风控站点），支持**“在新标签页打开”**，并通过后台脚本 (`background.mjs`) 实现跨标签页的消息同步与发送。

---

## 🤖 支持的 AI 模型 (Supported Providers)

详见 `shared/providers.js`，目前支持以下平台：
| ID | Label | URL | 特性备注 |
|----|-------|-----|----------|
| `chatgpt` | ChatGPT | chatgpt.com | 需处理 Enter 键分发，乐观成功策略 |
| `claude` | Claude | claude.ai | |
| `gemini` | Gemini | gemini.google.com | |
| `copilot` | Copilot | copilot.microsoft.com | Shadow DOM 结构 |
| `kimi` | Kimi | kimi.moonshot.cn | Lexical 编辑器 |
| `deepseek` | DeepSeek | chat.deepseek.com | |
| `doubao` | 豆包 | doubao.com | |
| `tongyi` | 通义千问 | qianwen.com | |
| `grok` | Grok | grok.com | |
| `yuanbao` | 元宝 | yuanbao.tencent.com | |
| `zhipu` | 智谱AI | chatglm.cn | |
| `you` | You.com | you.com | |
| `ima` | ima | ima.qq.com | 增强的输入流 |

---

## 🛠 技术架构 (Technical Architecture)

### 1. 文件结构

```text
Multi AI Assistant\
├── manifest.json        # 核心配置：权限、Host 匹配、Content Scripts
├── background.mjs       # Service Worker：管理标签页、跨页消息转发
├── pages/
│   ├── dashboard.html/js/css  # 主界面：Grid 布局、iframe 管理、消息总线
│   └── manage.html/js/css     # 会话管理入口
├── content/
│   └── content.js       # 注入脚本：运行在各 AI 网页内，负责 DOM 操作
├── shared/
│   ├── providers.js/mjs # 数据源：定义所有 AI 的元数据
│   ├── favicon-cache.js # Provider 图标工具
│   └── dashboard-focus.js
├── rules.json           # DNR 规则：网络请求头修改（绕过 iframe 限制）
├── debug/               # 本地调试页面
└── archive/             # 历史参考与旧入口
```

### 2. 核心工作流
1.  **启动**：用户点击扩展图标 -> Background 直接打开 `pages/dashboard.html`。
2.  **渲染**：Dashboard 读取 `chrome.storage` 恢复上次的面板列表和布局配置。
3.  **发送消息**：
    - 用户输入 -> Dashboard `postMessage` 广播 -> iframe 内的 `content.js` 接收。
    - `content.js` 根据当前域名匹配 `PROVIDER_CONFIGS`（在 `content.js` 中定义），找到对应的 Input Selector 和 Submit Button Selector。
    - 模拟用户操作：`focus` -> `execCommand('insertText')` -> `click()` / `dispatchEvent('Enter')`。
4.  **状态回传**：
    - `content.js` 监听 DOM 变化（MutationObserver）判断 AI 是否开始回答。
    - 通过 `postMessage` 回传 `responseStarted` / `responseComplete` 事件给 Dashboard。

### 3. 关键逻辑细节
- **Dashboard Grid System**：
  - 手写了一套基于 CSS Grid 的布局引擎。
  - 支持 `colSizes` (百分比) 和 `rowSizes` (像素) 的混合控制。
  - **FLIP 动画**：在 `pages/dashboard.js` 的 `animateDOMMove` 中实现了流畅的排序动画。
- **Content Script 适配器模式**：
  - `content.js` 内部维护了一个 `HOST_MAP` 和 `PROVIDER_CONFIGS` 表。
  - 针对不同站点（React, Vue, ShadowDOM, Lexical, ProseMirror）有不同的输入注入策略。

---

