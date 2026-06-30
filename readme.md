# Multi AI Assistant

Chrome Manifest V3 扩展，用一个 Dashboard 同时打开多个 AI 网站，并通过统一输入框把同一条提示词发送给多个 AI。

当前项目保持纯前端实现：Vanilla JavaScript + Chrome Extension APIs + CSS。没有构建工具，没有后端服务。

## 核心功能

### 多 AI 分屏

- 在同一个 Dashboard 中同时打开多个 AI 面板。
- 支持自动网格布局，也支持手动锁定列数、拖拽调整宽高。
- 支持拖拽排序面板，布局状态会随会话保存。

### 统一发送

- 底部输入框统一发送到所有活跃面板。
- 支持 `@1`、`@2` 等目标语法，只发送给指定面板。
- 支持 iframe 内发送；无法嵌入或需要降级的 provider 可通过后台消息发送到独立标签页。

### 会话与转录

- 支持创建、恢复和管理多 provider 会话。
- 会话数据由 `background.mjs` 和 `session/` 模块维护。
- Dashboard 侧可展示 provider 状态、用户轮次、assistant 回复和聚合时间线。

### 状态反馈

- 每个面板有实时状态 badge：发送中、回答中、完成、失败等。
- content script 会检测输入框、发送按钮、停止按钮、DOM 变化和文本稳定性，用于判断响应开始与完成。
- 全部目标完成后 Dashboard 会给出整体完成反馈。

## 支持的 Providers

Provider 元数据定义在 [shared/providers.js](shared/providers.js)，ESM 版本定义在 [shared/providers.mjs](shared/providers.mjs)。content script 的站点选择器配置定义在 [content/provider-configs.json](content/provider-configs.json)。

| ID | Label | URL | 备注 |
| --- | --- | --- | --- |
| `chatgpt` | ChatGPT | chatgpt.com | 独立发送策略 |
| `claude` | Claude | claude.ai |  |
| `gemini` | Gemini | gemini.google.com |  |
| `copilot` | Copilot | copilot.microsoft.com | Shadow DOM |
| `grok` | Grok | grok.com | 响应检测有 provider 特化 |
| `doubao` | 豆包 | doubao.com |  |
| `kimi` | Kimi | kimi.moonshot.cn / kimi.com | Lexical 编辑器 |
| `ima` | ima | ima.qq.com | 增强输入流 |
| `deepseek` | DeepSeek | chat.deepseek.com |  |
| `tongyi` | 通义千问 | qianwen.com |  |
| `yuanbao` | 元宝 | yuanbao.tencent.com |  |
| `zhipu` | 智谱AI | chatglm.cn |  |
| `you` | You.com | you.com |  |

## 目录结构

```text
Multi AI Assistant/
├── manifest.json              # Chrome 扩展声明、权限、content_scripts、资源暴露
├── background.mjs             # MV3 service worker，负责会话、标签页、跨页消息
├── pages/
│   ├── dashboard.html         # 主 Dashboard 页面
│   ├── dashboard.css
│   ├── dashboard.js
│   ├── manage.html            # 会话管理页面
│   ├── manage.css
│   └── manage.js
├── shared/
│   ├── providers.js           # 浏览器全局版 provider 元数据
│   ├── providers.mjs          # ESM provider 元数据
│   ├── favicon-cache.js       # provider 图标工具
│   └── dashboard-focus.js     # Dashboard 焦点保护工具
├── dashboard/
│   ├── send.js                # Dashboard 统一发送逻辑
│   ├── transcript.js          # 转录展示
│   ├── grid-resizer.js        # 网格拖拽调整
│   ├── shared-state.js        # Dashboard 共享状态
│   └── i18n.js                # 页面国际化
├── content/
│   ├── constants.js           # content script 常量
│   ├── provider-configs.json  # provider DOM 选择器配置
│   ├── provider-configs.js    # 异步加载 provider-configs.json
│   ├── send-handlers.js       # 输入与发送按钮适配
│   ├── response-state.js      # 响应状态阈值与策略
│   ├── response-detection.js  # 响应开始/完成检测
│   ├── transcript-capture.js  # 手动继续聊与 assistant turn 捕获
│   ├── session-sync.js        # provider 标签页与受管会话同步
│   ├── runtime-messaging.js   # chrome.runtime 消息重试封装
│   └── content.js             # content script 编排入口
├── session/                   # 会话模型、注册表、转录存储、窗口恢复
├── tests/                     # 单元、集成、E2E 冒烟测试
├── debug/                     # 本地调试页面
├── archive/                   # 历史入口与参考资料
├── task-board.html            # tasks.json 看板
├── tasks.json                 # 任务主数据源
├── progress.md                # 开发与验证记录
└── AGENTS.md                  # Agent 开发规范
```

## 核心链路

1. 用户点击扩展图标，`background.mjs` 打开 `pages/dashboard.html`。
2. Dashboard 加载 provider 元数据、布局状态和会话状态。
3. 用户输入提示词并发送，`dashboard/send.js` 根据目标面板决定走 iframe `postMessage` 或后台标签页消息。
4. provider 页面中的 content scripts 根据 `content/provider-configs.json` 找到输入框和发送按钮，执行真实页面输入与发送。
5. `content/response-detection.js` 判断响应开始和完成，状态回传 Dashboard 与 background。
6. `session/transcript-store.mjs` 维护每个 provider 的原始 turn 和会话级 timeline。

## 本地开发

安装依赖：

```bash
npm install
```

运行测试：

```bash
npm test
```

运行 E2E 冒烟测试：

```bash
npm run test:e2e
```

运行 lint：

```bash
npm run lint
```

校验 manifest：

```bash
npm run validate
```

## 手动加载扩展

1. 打开 Chrome：`chrome://extensions/`。
2. 开启 Developer mode。
3. 选择 Load unpacked。
4. 选择本项目根目录。
5. 点击扩展图标进入 Dashboard。

## 开发约束

- 一轮只做一个任务，任务状态以 `tasks.json` 为准。
- 每轮结束必须更新 `progress.md` 和 `tasks.json`。
- Provider 适配通常需要同步检查 `shared/providers.*`、`content/provider-configs.json`、`manifest.json` 和 `rules.json`。
- `background.mjs` 是 MV3 service worker 入口，保持在根目录。
- 根目录保持收口：页面入口放 `pages/`，共享脚本放 `shared/`，Dashboard 功能模块放 `dashboard/`。
