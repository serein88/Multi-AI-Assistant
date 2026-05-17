# 回答状态检测审查（2026-05-17）

## 检查范围

DeepSeek、Gemini、Grok 三个 provider 的"回答状态"检测逻辑，涉及：
- `waitForResponseStart` — 响应开始检测
- `waitForResponseComplete` — 响应完成检测
- `hasStreamingIndicator` — 流式指示器检测
- `getStopSelectors` — 停止按钮选择器
- `countResponseNodes` — 响应节点计数
- `extractLatestResponse` — 最新回答提取

## 可优化问题与方案

### #1 DeepSeek 补充 stop selectors（T-20260517-001）

**问题**：`getStopSelectors("deepseek")` 走通用路径，无 DeepSeek 专属分支。代码注释称 "DeepSeek: no stop button" 与事实不符——DeepSeek 流式输出时有停止按钮。这导致 `waitForResponseStart` 的 Step 1 停止按钮信号和 `waitForResponseComplete` 的 Step 2 通用停止按钮跟踪均失效。

**方案**：给 `getStopSelectors("deepseek")` 补充 DeepSeek 专属选择器（如 `button[aria-label*="停止"]`、`[class*="stop-generating"]` 等）。更新 `waitForResponseComplete` 中 DeepSeek 注释，纠正 "no stop button" 说法。

**文件**：`content/content.js`

### #2 Gemini 完成检测优化（T-20260517-002）

**问题**：
1. `isGeminiStopVisible()` 硬编码中文 `"停止回答"`，英文 locale 下完全失效，完成检测退化到 1.2s 文本稳定性（太短）。
2. `isGeminiSendVisible()` 用精确匹配 `aria-label="发送"/"Send"`，与项目其他选择器的 `*=` 包含匹配风格不一致，易漏匹配。
3. `getStopSelectors` 无 Gemini 专属分支，`waitForResponseStart` 的停止按钮信号依赖通用选择器。

**方案**：
1. `isGeminiStopVisible()` 增加英文 stop 按钮匹配（`button[aria-label*="Stop"]`）。
2. `isGeminiSendVisible()` 改为 `*=` 包含匹配。
3. 给 `getStopSelectors("gemini")` 加 Gemini 专属选择器。

**文件**：`content/content.js`

### #3 Grok 专属完成路径 + 清理无效调用（T-20260517-003）

**问题**：
1. `waitForResponseComplete` 无 Grok 专属逻辑，与 Gemini 的精细处理形成对比。
2. `sendGrokMessage` 内 `waitForGrokSendSignal` 调用 `hasStreamingIndicator("grok")` 永远返回 false（通用选择器不匹配 Grok DOM），是无效调用。

**方案**：
1. 在 `waitForResponseComplete` 的 Step 1 补 Grok 专属分支：复用 `getStopSelectors("grok")` + 发送按钮恢复检测。
2. 去除 `waitForGrokSendSignal` 中无效的 `hasStreamingIndicator("grok")` 调用。

**文件**：`content/content.js`

## 不改动项

| 项 | 原因 |
|---|---|
| `hasStreamingIndicator` 对 DeepSeek 返回 false | `.ds-think-content` 永久存在于 DOM，不能作为流式标志，硬编码 false 是正确的 |
| `hasStreamingIndicator` 对 Gemini/Grok 走通用选择器 | 三个 provider 目前都没有可靠的流式 class 可用 |
| Gemini 完成检测的双路径（Step 1 专属 + Step 2 通用）冲突 | Step 2 只在 Step 1 未覆盖时才生效，作为兜底无害 |