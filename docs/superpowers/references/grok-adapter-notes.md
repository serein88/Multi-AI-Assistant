# Grok 适配经验（2026-02）

## 发送成功判定

- 不要只看"点击成功"，要看强信号：`Stop` 出现 / 输入框清空 / 流式标记 / 响应节点增长。
- 对易波动站点（如 Grok）要有降级兜底：`sendResult:true` 后若 `responseStarted` 超时，回补 `sendResult:false`。
- 统一发送按钮的 `Sending...` 建议按"派发完成"释放，不阻塞在"响应开始"事件上。

## 验证与调试

- 验证扩展改动前先热重载（如 `chrome.runtime.reload()`），避免用旧脚本误判结果。
- Playwright 调试扩展页优先"先开普通页再 `window.open(chrome-extension://...)`"，并固定记录控制台日志作为证据。
