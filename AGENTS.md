# AGENTS.md - Multi AI Assistant (Browser Extension)

This document provides guidelines for AI coding agents working on this Chrome Extension (Manifest V3) codebase.

## Project Overview

A Chrome extension that enables split-screen viewing of multiple AI chat sites (ChatGPT, Claude, Gemini, Copilot, Kimi, DeepSeek, etc.) and sends the same prompt to all of them simultaneously via a unified input box.

**Stack**: Vanilla JavaScript, Chrome Extension APIs (Manifest V3), CSS Grid
**Platform**: Chrome/Chromium browsers

---

## Build/Lint/Test Commands

This is a browser extension with no build pipeline. Development workflow:

```bash
# No build step required - pure JavaScript extension

# Load extension in Chrome:
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" and select this directory

# Reload extension after changes:
# Click the refresh icon on the extension card in chrome://extensions/

# Debug dashboard UI without extension context:
# Open dashboard-dev.html in browser (uses chrome-shim.js for mocking)
```

### Debugging

- **Dashboard**: Right-click extension icon -> "Inspect popup" or open DevTools on dashboard.html
- **Content Scripts**: In AI panel iframe, right-click -> "Inspect Frame" to see console output
- **Background Script**: chrome://extensions/ -> Click "Service Worker" link on extension card
  - *Note*: "Invalid" status means the Service Worker is inactive (sleeping) to save memory. It wakes up on events.
- **Local Dev**: Use `dashboard-dev.html` with `chrome-shim.js` for UI development without extension context.
- **Unified Logging**: Filter console with `MultiAI` to see logs from all contexts (Dashboard, Content, Background). Content script logs are forwarded to the Dashboard console.
- **Console Noise**: Filter with `-cookie` to hide third-party cookie warnings.

### Development Tools

- `dashboard-dev.html`: A development-only dashboard that mocks Chrome APIs using `chrome-shim.js`. Use this for rapid UI iteration without reloading the extension.
- `chrome-shim.js`: Mocks `chrome.runtime`, `chrome.storage`, and `chrome.tabs` for local development.

---

## Code Style Guidelines

### File Structure

```
/
├── manifest.json        # Extension config: permissions, content scripts, host matching
├── background.js        # Service Worker: tab management, cross-tab messaging
├── dashboard.html/js    # Main UI: grid layout, iframe management, message bus
├── content/content.js   # Injected into AI sites: DOM manipulation, input simulation
├── providers.js         # Provider metadata (id, label, url)
├── rules.json           # Declarative Net Request rules (header modification)
├── popup.html/js        # Extension popup: quick launcher
├── chrome-shim.js       # Development mock for chrome.* APIs
└── dashboard.css        # Main stylesheet
```

### JavaScript Style

1. **No TypeScript/Build Tools**: Pure ES6+ JavaScript, no transpilation
2. **Module Pattern**: Use IIFEs for isolation where needed (see `chrome-shim.js`)
3. **Async/Await**: Prefer async/await over raw Promises for readability
4. **Semicolons**: Required at end of statements
5. **Quotes**: Double quotes for strings
6. **Indentation**: 2 spaces
7. **Line Length**: No strict limit, but keep readable (~100-120 chars)

### Naming Conventions

```javascript
// Constants: UPPER_SNAKE_CASE
const STATE_KEY = "multi-ai-dashboard";
const MAX_PANELS = 50;
const PROVIDER_CONFIGS = { ... };

// Functions: camelCase, verb-prefixed
function getProviderFromHost() { }
function findElement(selectors) { }
async function sendPromptToProvider(providerId, prompt) { }
async function waitForElement(selectors, timeout = 3000) { }

// DOM Elements: suffixed with El or Btn
const promptEl = document.getElementById("prompt");
const sendAllBtn = document.getElementById("sendAll");

// Event Handlers: on-prefixed or handle-prefixed
function onVerticalSplitterMouseDown(event) { }
function handlePanelAction(panelEl, provider, action) { }

// Boolean checks: is/has/can prefixed
function isElementDisabled(el) { }
function hasStreamingIndicator() { }
function isAllSelected() { }
```

### Imports and Dependencies

- **No module bundler**: Scripts are loaded via `<script>` tags in HTML
- **Shared data**: `providers.js` is loaded before `dashboard.js` to provide `PROVIDERS` array
- **Chrome APIs**: Access via `chrome.runtime`, `chrome.storage`, `chrome.tabs`
- **Order matters**: Ensure dependencies are loaded before dependent scripts

### Error Handling

```javascript
// Use try-catch for DOM operations that may fail cross-origin
try {
  iframe.contentWindow.location.reload();
} catch (e) {
  // Cross-origin error fallback
  iframe.src = iframe.src;
}

// Promise chains: always handle rejections
loadPanelsFromStorage()
  .catch(() => undefined)
  .finally(() => { ... });

// Async functions: wrap risky operations
async function trySendPrompt(provider, prompt, retryCount = 0) {
  const maxRetries = 2;
  try {
    // ... operation
  } catch (error) {
    console.error("发送消息失败:", error);
    if (retryCount < maxRetries) {
      return trySendPrompt(provider, prompt, retryCount + 1);
    }
    return false;
  }
}
```

### DOM Manipulation Patterns

```javascript
// Selector arrays for fallback (most specific first)
const inputSelectors = [
  "textarea#prompt-textarea",           // Most specific
  "textarea[data-id='root']",
  "div[contenteditable='true']",        // Least specific
  "textarea"
];

// Find first matching element
function findElement(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

// Shadow DOM traversal for complex sites (Copilot)
function deepQueryAll(root, selector) {
  const results = [...root.querySelectorAll(selector)];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    if (walker.currentNode.shadowRoot) {
      results.push(...deepQueryAll(walker.currentNode.shadowRoot, selector));
    }
  }
  return results;
}
```

### Messaging Patterns

```javascript
// Dashboard -> Content Script (via postMessage for iframes)
iframe.contentWindow.postMessage({
  source: "multi-ai",
  type: "sendPrompt",
  provider: providerId,
  prompt
}, "*");

// Content Script -> Dashboard (response)
window.parent.postMessage({
  source: "multi-ai-content",
  type: "responseStarted",
  provider: provider
}, "*");

// Background Script messaging (chrome.runtime)
chrome.runtime.sendMessage({ type: "openProviderTab", provider: id });

// Message listener with async response
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "sendPrompt") {
    trySendPrompt(provider, prompt)
      .then((ok) => sendResponse({ ok }))
      .catch(() => sendResponse({ ok: false }));
    return true; // Required for async sendResponse
  }
});
```

### Adding a New AI Provider

1. **`providers.js`**: Add to `PROVIDERS` array
   ```javascript
   { id: "newai", label: "New AI", url: "https://newai.com/" }
   ```

2. **`manifest.json`**: Add to `host_permissions` and `content_scripts.matches`.
   *   **Important**: Include `www.` subdomain explicitly (e.g., `https://www.newai.com/*`) and wildcard if needed (`https://*.newai.com/*`).

3. **`content/content.js`**: Add to `HOST_MAP` and `PROVIDER_CONFIGS`
   ```javascript
   // HOST_MAP
   { match: "newai.com", id: "newai" }
   
   // PROVIDER_CONFIGS
   newai: {
     inputSelectors: ["textarea", "div[contenteditable='true']"],
     sendButtonSelectors: ["button[type='submit']"],
     inputType: "textarea"  // or "contenteditable"
   }
   ```

4. **`rules.json`**: Add DNR rule if site blocks iframes
   *   **Note**: Some sites (like `a.claude.ai` or `yuanbao.tencent.com`) need specific rules.
   ```json
   {
     "id": 99,
     "priority": 1,
     "action": {
       "type": "modifyHeaders",
       "responseHeaders": [
         { "header": "x-frame-options", "operation": "remove" },
         { "header": "content-security-policy", "operation": "remove" }
       ]
     },
     "condition": {
       "urlFilter": "newai.com",
       "resourceTypes": ["sub_frame"]
     }
   }
   ```

### Common Pitfalls

1. **Cross-origin iframes**: Cannot access `contentDocument` - use `postMessage`
2. **Content script timing**: Wait for `DOMContentLoaded` before querying DOM
3. **React/Vue inputs**: Use native value setter and dispatch `input` events
4. **Shadow DOM**: Some sites (Copilot) require deep traversal
5. **Contenteditable**: Use `execCommand('insertText')` for proper event firing
6. **Scroll jumping**: Always use `focus({ preventScroll: true })`

### Comments and Logging

```javascript
// Use Chinese or English comments consistently within a file
// 跨域错误，重新加载iframe

// Debug logging with prefix
// Set DEBUG = true in file header
function log(msg, ...args) {
  if (DEBUG) {
    // Standardized Prefixes:
    // Dashboard: [MultiAI Dashboard]
    // Content:   [MultiAI Content] (Forwarded to Dashboard as [Via Iframe] [MultiAI Content])
    // Background:[MultiAI Background]
    console.log(`[MultiAI Context] ${msg}`, ...args);
  }
}
```

---

---


## Project Status Summary

### Progress

- **UI Refactor (Jan 2026)**:
  - **Layout**: Column widths auto-reset to equal distribution on load; row heights persisted.
  - **Interaction**: Settings modals (global & panel) close on click-outside (focus loss).
  - **Panel Header**: Added "Open in New Tab" icon; updated Settings icon (vertical ellipsis); removed "Switch/Add AI" buttons.
  - **I18N**: Added English/Chinese language toggle (persisted).
  - **Visuals**: Unified rounded button styles in settings; removed Group Chat entry point.
  - **Latest Polish (Late Jan)**:
    - **Headers**: Unified panel header height (32px) with overflow protection; moved shortcut badges (e.g., `@1`) next to titles.
    - **Separators**: Added semi-transparent gray dividers between panels.
    - **Floating UI**: Repositioned "Target Chips" to float above the footer with glassmorphism; moved Status Message to top-center with slide animation.
    - **Alignment**: Vertically centered the "Send" button; improved input placeholder text.
    - **Fixes**: "Open in New Tab" now correctly opens the current specific conversation URL (deep link) via message passing.

- Split-screen dashboard, popup, background, and content scripts are in place for multi-provider prompt fan-out.
- Provider metadata is centralized in `providers.js`, with DNR rules in `rules.json` to enable iframe embedding.
- Messaging flow uses `postMessage` (dashboard <-> iframe) plus `chrome.runtime` (background <-> pages).

### Technical Route

- Manifest V3 extension with a dashboard page that orchestrates CSS Grid iframes for AI sites.
- Content scripts use per-provider selector configs to inject input and detect response state.
- Background service worker handles cross-tab fallbacks for sites that cannot be iframed.

### Pending Skills

- Group Chat Mode isolated UI (`chatroom.html/js/css`) with turn-based sequencing and rolling sync.
- Response extraction strategies per provider to populate the unified timeline reliably.
- Markdown rendering for AI replies and a collapsed debug panel for sync payloads.

## Group Chat Mode (????) - Development Principles

This project will add a SECOND conversation mode called **Group Chat Mode (????)**.
The goal is to simulate a "real" group chat with multiple AIs in one unified timeline, while keeping the existing split-screen mode unchanged.

### Non-Negotiables

- **Isolation**: Group Chat Mode must be fully isolated from split-screen mode (UI + state + storage). No in-page toggle.
- **Separate entry**: Group Chat Mode opens in a new window/tab (recommended: a dedicated extension page like `chatroom.html`).
- **No regressions**: Do not change split-screen behavior unless explicitly required for shared low-risk utilities.
- **Max participants**: Up to 3 AI providers per group chat (context length + stability).
- **Sequential turns**: AI replies are NOT parallel. They speak one-by-one in a predefined order.

### UX Model

- **Single unified timeline** (like WeChat/Slack): messages from User + AI1/AI2/AI3 appear in one scrolling list.
- **Markdown rendering**: try to render AI replies as Markdown for readability.
- **Prompt injection visibility**: show what is being "synced" to an AI, but keep it **collapsed by default** (expand for debugging).

### Turn-Based Conversation Rules

- A "round" is delimited by a user message.
- Turn order is defined before the chat starts:
  - `User -> AI1 -> AI2 -> AI3 -> User` repeating.
- After User speaks:
  - AI1 responds, then AI2, then AI3.
  - When all AIs in this round finish speaking, the chat **pauses** and waits for the next user message.

### Shared Context Illusion (Rolling Sync)

AIs do not naturally share context across sites. The extension must act as the context broker.

- For each AI, track its **last speak index** in the global chat timeline.
- When it becomes AI_k's turn, build a "rolling" context payload containing ALL messages since AI_k last spoke:
  - includes User messages and other AIs' messages.
- Send that payload + a short instruction like "It's your turn to speak" to AI_k.
- This design relies on the AI site retaining its own earlier chat history; we only send the **delta** since last turn.

### Targeted Speaking

- Default is "all participants" for each round (based on the turn order).
- Support `@AI` (or a similar mechanism) to call a specific AI.
  - When calling an AI out-of-order, the same rolling sync rule applies: sync all messages since it last spoke.

### Implementation Boundary / File Ownership

- Group Chat Mode should live in NEW files and not entangle existing dashboard logic:
  - `chatroom.html`, `chatroom.js`, `chatroom.css` (or similar dedicated files)
- Split-screen mode remains in:
  - `dashboard.html`, `dashboard.js`, `dashboard.css`
- Shared logic (if any) must be minimal and stable (avoid large refactors).

### Dev/Debug Requirements

- During development, provide a debug-friendly view showing:
  - the exact rolling sync payload per AI turn,
  - and which provider is currently in turn.
- This debug view must not degrade normal UX (collapsed by default).

### Known Hard Problem: Extracting AI Responses

To display AI messages in the unified timeline, the extension must extract response text from each provider page.
This likely requires extending `content/content.js` with per-provider response selectors/strategies.

- Prefer resilient selectors and fallback strategies.
- Expect provider DOMs to change; keep logic defensive.

## Key Files Reference

| File | Purpose | Lines |
|------|---------|-------|
| `dashboard.js` | Main UI logic, grid system, message handling | ~1200 |
| `content/content.js` | DOM injection, input simulation per provider | ~1350 |
| `background.js` | Service worker, tab management | ~200 |
| `providers.js` | Provider metadata array | ~45 |
| `manifest.json` | Extension configuration | ~90 |
| `rules.json` | Network request header rules | ~290 |

## Grok 发送修复记录 (2026-02-05)

- 发送逻辑迁移为优先使用 `forceSetEditableText`，并用 `findEditableNearSendButton` 锁定真实输入节点。
- 增加轮询等待发送按钮出现（文本输入后才显示的场景），并保留 Enter/表单提交回退。
- 强化按钮筛选规则，排除“附件/语音/侧边栏”等干扰按钮，避免误点。
