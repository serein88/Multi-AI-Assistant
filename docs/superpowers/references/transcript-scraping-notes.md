# 转录抓取经验（2026-05）

## 核心原则

回答状态识别成"已完成"之后抓取一次回答内容（Gemini 模式正确）。不要在流式输出过程中持续抓取中间碎片。

## 完成检测主信号 — 发送/停止按钮状态

- 发送消息后，发送按钮被替换为停止按钮；回答完成后，停止按钮消失、发送按钮恢复。
- `waitForResponseComplete` 使用"停止按钮消失 + 发送按钮恢复"作为所有 provider 的主信号，文本稳定性仅作兜底。

## MutationObserver 属性监听

- `waitForResponseComplete` 的 observer 需要监听 `attributes: true, attributeFilter: ['disabled', 'class', 'aria-label', 'data-testid']`，使按钮状态变化可被实时检测。

## thinking 内容过滤

- `extractLatestResponse` 必须检查 `shouldIgnoreThinkingNode`，并使用 `extractTextExcludingThinking` 克隆节点后移除 thinking 元素再提取文本。
- 反向迭代优先取最新回答。

## MutationObserver 干扰

- 统一发送期间必须暂停 MutationObserver（`pauseManualTurnObserver`），避免 observer 捕获到流式中间态 DOM 变化导致重复 turn。发送完成后再恢复 observer。

## 选择器收窄原则

- Provider 的 `sendButtonSelectors` 必须精确匹配发送控件，避免宽泛选择器（如 `div[role='button'].ds-icon-button`）误命中侧边栏等非发送控件。
