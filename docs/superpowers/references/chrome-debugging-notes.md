# Chrome 调试连接规范（2026-02）

## 连接方式

- 默认使用"连接用户已打开的 Chrome 调试窗口"方式调试，不新开独立浏览器实例。
- 标准连接方式：优先通过 CDP 端口 `127.0.0.1:9222`（`chromium.connectOverCDP`）接管现有会话。
- 连接后优先复用现有扩展页标签（如 `chrome-extension://<extension-id>/dashboard.html`）做调试与验证。

## 调试流程

- 扩展页 DevTools + iframe frame DevTools + Service Worker 日志三层定位。
- Playwright 调试扩展页：先开普通页再 `window.open(chrome-extension://...)`，固定记录控制台日志作为证据。
