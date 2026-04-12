# Extension Session Layer MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an extension-owned session ledger that lets the browser action popup create and restore managed window sessions for DeepSeek, Gemini, and Grok.

**Architecture:** The implementation adds a focused `session/` feature slice for session state, storage, provider child-session binding, and window orchestration. `background.js` becomes the integration point for Chrome APIs, `popup.html/js` becomes the lightweight session menu, and `content/content.js` reports URL/title metadata back to the extension for durable restore.

**Tech Stack:** Chrome Extension Manifest V3, vanilla JavaScript, Chrome `tabs/windows/storage` APIs, Node built-in test runner for pure modules, manual extension smoke tests in Chrome.

---

## File Structure

### New files

- `session/session-constants.js`
  - Shared storage keys, status values, provider allowlist, and message types for the session layer.
- `session/session-model.js`
  - Pure constructors and update helpers for session and child-session records.
- `session/session-registry.js`
  - Storage-facing session ledger functions with injected `chrome.storage.local` adapter.
- `session/provider-session-bindings.js`
  - Provider-specific URL/title normalization and recoverability checks for DeepSeek, Gemini, and Grok.
- `session/window-manager.js`
  - Window and tab orchestration helpers with injected `chrome.windows` and `chrome.tabs`.
- `tests/session/session-model.test.js`
  - Unit tests for session record creation and child-session updates.
- `tests/session/session-registry.test.js`
  - Unit tests for storage persistence and history ordering.
- `tests/session/provider-session-bindings.test.js`
  - Unit tests for provider URL normalization and recoverability checks.
- `tests/session/window-manager.test.js`
  - Unit tests for managed-window orchestration with mocked Chrome APIs.

### Modified files

- `manifest.json`
  - Point browser action to `popup.html` so icon click opens the session menu.
- `popup.html`
  - Replace current multi-open controls with `新建会话` and `恢复对话` entry flows.
- `popup.js`
  - Wire popup actions to background session commands and render restore lists/confirmation.
- `popup.css`
  - Style the compact session menu and restore list.
- `background.js`
  - Import session modules and expose runtime message handlers for create/list/restore/session-sync.
- `providers.js`
  - Export a session-provider allowlist or helper for `deepseek`, `gemini`, `grok`.
- `content/content.js`
  - Report provider URL/title/activity metadata to the background session layer.
- `task.md`
  - Track implementation task state.
- `progress.md`
  - Record verification evidence during execution.

## Execution Notes

- Work must start on branch `feature/extension-session-layer-mvp`.
- Keep CLI runtime work out of this branch.
- Favor pure modules plus injected Chrome adapters so Node tests cover business logic.
- Use exact-path staging for each commit because this repo may contain unrelated changes.

### Task 1: Start the Branch and Build the Session Domain Layer

**Files:**
- Create: `session/session-constants.js`
- Create: `session/session-model.js`
- Test: `tests/session/session-model.test.js`

- [ ] **Step 1: Create the branch before touching feature code**

Run:

```bash
git checkout -b feature/extension-session-layer-mvp
```

Expected: shell prints `Switched to a new branch 'feature/extension-session-layer-mvp'`

- [ ] **Step 2: Write the failing session-model test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSessionRecord,
  updateChildSessionRecord
} = require("../../session/session-model.js");

test("createSessionRecord creates a recoverable session shell", () => {
  const session = createSessionRecord({
    sessionId: "sess_1",
    providers: ["deepseek", "gemini", "grok"],
    mode: "foreground",
    now: "2026-04-12T10:00:00.000Z"
  });

  assert.equal(session.sessionId, "sess_1");
  assert.equal(session.status, "active");
  assert.equal(session.providers.length, 3);
  assert.equal(session.childSessions.deepseek.recoverable, false);
});

test("updateChildSessionRecord stores url title and recoverable flag", () => {
  const session = createSessionRecord({
    sessionId: "sess_2",
    providers: ["deepseek"],
    mode: "background",
    now: "2026-04-12T10:00:00.000Z"
  });

  const updated = updateChildSessionRecord(session, "deepseek", {
    tabId: 200,
    url: "https://chat.deepseek.com/a/chat/demo",
    title: "DeepSeek Demo",
    lastActiveAt: "2026-04-12T10:01:00.000Z",
    recoverable: true
  });

  assert.equal(updated.childSessions.deepseek.url, "https://chat.deepseek.com/a/chat/demo");
  assert.equal(updated.childSessions.deepseek.title, "DeepSeek Demo");
  assert.equal(updated.childSessions.deepseek.recoverable, true);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
node --test tests/session/session-model.test.js
```

Expected: FAIL with module-not-found or missing-export errors for `session/session-model.js`

- [ ] **Step 4: Write the minimal implementation**

```js
const SESSION_STATUS_ACTIVE = "active";
const SESSION_MODE_FOREGROUND = "foreground";

function createEmptyChildSession(provider) {
  return {
    provider,
    tabId: null,
    url: "",
    title: "",
    lastActiveAt: null,
    recoverable: false
  };
}

function createSessionRecord({ sessionId, providers, mode, now }) {
  return {
    sessionId,
    name: `Session ${now}`,
    windowId: null,
    status: SESSION_STATUS_ACTIVE,
    mode: mode || SESSION_MODE_FOREGROUND,
    createdAt: now,
    lastActiveAt: now,
    providers: providers.slice(),
    childSessions: providers.reduce((acc, provider) => {
      acc[provider] = createEmptyChildSession(provider);
      return acc;
    }, {})
  };
}

function updateChildSessionRecord(session, provider, patch) {
  return {
    ...session,
    lastActiveAt: patch.lastActiveAt || session.lastActiveAt,
    childSessions: {
      ...session.childSessions,
      [provider]: {
        ...session.childSessions[provider],
        ...patch,
        provider
      }
    }
  };
}

module.exports = {
  createSessionRecord,
  updateChildSessionRecord
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run:

```bash
node --test tests/session/session-model.test.js
```

Expected: PASS for both tests

- [ ] **Step 6: Commit**

```bash
git add session/session-constants.js session/session-model.js tests/session/session-model.test.js
git commit -m "feat: add extension session domain model"
```

### Task 2: Implement the Session Registry

**Files:**
- Create: `session/session-registry.js`
- Test: `tests/session/session-registry.test.js`

- [ ] **Step 1: Write the failing registry test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createSessionRegistry } = require("../../session/session-registry.js");

test("listSessions returns newest session first", async () => {
  const store = {};
  const storage = {
    async get(key) {
      return { [key]: store[key] };
    },
    async set(payload) {
      Object.assign(store, payload);
    }
  };

  const registry = createSessionRegistry({ storage });

  await registry.saveSession({ sessionId: "sess_old", createdAt: "2026-04-12T10:00:00.000Z" });
  await registry.saveSession({ sessionId: "sess_new", createdAt: "2026-04-12T11:00:00.000Z" });

  const sessions = await registry.listSessions();
  assert.deepEqual(sessions.map((item) => item.sessionId), ["sess_new", "sess_old"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test tests/session/session-registry.test.js
```

Expected: FAIL because `createSessionRegistry` is missing

- [ ] **Step 3: Write the minimal implementation**

```js
const SESSION_STORAGE_KEY = "multi-ai-sessions";

function createSessionRegistry({ storage }) {
  async function loadAll() {
    const result = await storage.get(SESSION_STORAGE_KEY);
    return Array.isArray(result[SESSION_STORAGE_KEY]) ? result[SESSION_STORAGE_KEY] : [];
  }

  async function saveAll(sessions) {
    await storage.set({ [SESSION_STORAGE_KEY]: sessions });
  }

  return {
    async listSessions() {
      const sessions = await loadAll();
      return sessions.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },
    async saveSession(session) {
      const sessions = await loadAll();
      const next = sessions.filter((item) => item.sessionId !== session.sessionId);
      next.push(session);
      await saveAll(next);
      return session;
    }
  };
}

module.exports = {
  createSessionRegistry
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
node --test tests/session/session-registry.test.js
```

Expected: PASS

- [ ] **Step 5: Extend the registry before commit**

Add and test:

- `getSession(sessionId)`
- `updateSession(sessionId, updater)`
- `archiveSession(sessionId)`
- `touchSession(sessionId, timestamp)`

- [ ] **Step 6: Commit**

```bash
git add session/session-registry.js tests/session/session-registry.test.js
git commit -m "feat: add extension session registry"
```

### Task 3: Add Provider Child-Session Binding Rules

**Files:**
- Create: `session/provider-session-bindings.js`
- Modify: `providers.js`
- Test: `tests/session/provider-session-bindings.test.js`

- [ ] **Step 1: Write the failing provider-binding test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeChildSessionBinding,
  isSessionProviderSupported
} = require("../../session/provider-session-bindings.js");

test("normalizeChildSessionBinding marks supported provider url as recoverable", () => {
  const binding = normalizeChildSessionBinding({
    provider: "gemini",
    url: "https://gemini.google.com/app/abc123",
    title: "Gemini - Demo",
    tabId: 99,
    now: "2026-04-12T12:00:00.000Z"
  });

  assert.equal(binding.provider, "gemini");
  assert.equal(binding.recoverable, true);
  assert.equal(binding.title, "Gemini - Demo");
});

test("isSessionProviderSupported rejects unsupported providers", () => {
  assert.equal(isSessionProviderSupported("chatgpt"), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test tests/session/provider-session-bindings.test.js
```

Expected: FAIL because the provider-binding module does not exist yet

- [ ] **Step 3: Write the minimal implementation**

```js
const SESSION_PROVIDER_IDS = ["deepseek", "gemini", "grok"];

function isSessionProviderSupported(provider) {
  return SESSION_PROVIDER_IDS.includes(provider);
}

function normalizeChildSessionBinding({ provider, url, title, tabId, now }) {
  const recoverable = isSessionProviderSupported(provider) && Boolean(url);
  return {
    provider,
    tabId: typeof tabId === "number" ? tabId : null,
    url: url || "",
    title: title || provider,
    lastActiveAt: now || null,
    recoverable
  };
}

module.exports = {
  SESSION_PROVIDER_IDS,
  isSessionProviderSupported,
  normalizeChildSessionBinding
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
node --test tests/session/provider-session-bindings.test.js
```

Expected: PASS

- [ ] **Step 5: Extend implementation before commit**

Add and test provider-specific guards for:

- DeepSeek URL starts with `https://chat.deepseek.com/`
- Gemini URL starts with `https://gemini.google.com/`
- Grok URL starts with `https://grok.com/` or `https://www.grok.com/`
- empty, login, or challenge URLs set `recoverable=false`

- [ ] **Step 6: Commit**

```bash
git add session/provider-session-bindings.js providers.js tests/session/provider-session-bindings.test.js
git commit -m "feat: add provider child-session binding rules"
```

### Task 4: Implement Managed Window Orchestration in the Background

**Files:**
- Create: `session/window-manager.js`
- Modify: `background.js`
- Test: `tests/session/window-manager.test.js`

- [ ] **Step 1: Write the failing window-manager test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createWindowManager } = require("../../session/window-manager.js");

test("createManagedSessionWindow opens a non-focused window in background mode", async () => {
  const calls = [];
  const chromeApi = {
    windows: {
      async create(payload) {
        calls.push(payload);
        return { id: 500 };
      }
    }
  };

  const manager = createWindowManager({ chromeApi });
  const result = await manager.createManagedSessionWindow({
    urls: ["https://chat.deepseek.com/", "https://gemini.google.com/", "https://grok.com/"],
    focused: false
  });

  assert.equal(result.id, 500);
  assert.equal(calls[0].focused, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test tests/session/window-manager.test.js
```

Expected: FAIL because `createWindowManager` is missing

- [ ] **Step 3: Write the minimal implementation**

```js
function createWindowManager({ chromeApi }) {
  return {
    async createManagedSessionWindow({ urls, focused }) {
      return chromeApi.windows.create({
        url: urls,
        focused: Boolean(focused)
      });
    }
  };
}

module.exports = {
  createWindowManager
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
node --test tests/session/window-manager.test.js
```

Expected: PASS

- [ ] **Step 5: Integrate background message handlers**

Add background commands and keep each command narrow:

- `session:create`
- `session:list`
- `session:get`
- `session:restore`
- `session:sync-child`

Implementation notes:

- `background.js` should `importScripts("session/session-constants.js", "session/session-model.js", "session/session-registry.js", "session/provider-session-bindings.js", "session/window-manager.js");`
- `chrome.action.onClicked` should stop forcing dashboard open once `manifest.json` points to `popup.html`
- creation flow should persist the session shell before opening windows
- restore flow should reopen only `recoverable=true` child sessions

- [ ] **Step 6: Smoke the background flow manually**

Manual check in Chrome:

1. Reload unpacked extension
2. Open service worker console
3. Trigger popup action `新建会话`
4. Confirm a new window opens with three provider tabs
5. Confirm background logs a new `sessionId`

- [ ] **Step 7: Commit**

```bash
git add session/window-manager.js background.js tests/session/window-manager.test.js manifest.json
git commit -m "feat: add managed session window orchestration"
```

### Task 5: Replace the Browser Action Popup with the Session Menu

**Files:**
- Modify: `popup.html`
- Modify: `popup.js`
- Modify: `popup.css`

- [ ] **Step 1: Replace the popup markup with the MVP session menu**

Add:

- primary action `新建会话`
- restore entry `恢复对话`
- optional background-mode toggle for create
- hidden restore panel that can render historical sessions and child-session summaries

- [ ] **Step 2: Extract one pure render helper and test it informally before wiring**

Prototype target shape in `popup.js`:

```js
function formatSessionSummary(session) {
  return {
    id: session.sessionId,
    title: session.name,
    subtitle: `${session.providers.join(" / ")} · ${session.lastActiveAt || session.createdAt}`,
    children: Object.values(session.childSessions || {}).map((child) => ({
      provider: child.provider,
      title: child.title || child.provider,
      recoverable: Boolean(child.recoverable)
    }))
  };
}
```

- [ ] **Step 3: Wire popup actions to background session commands**

Flow:

- `新建会话` -> `chrome.runtime.sendMessage({ type: "session:create", mode: background ? "background" : "foreground" })`
- `恢复对话` -> `chrome.runtime.sendMessage({ type: "session:list" })`
- selecting a session -> show child-session summary confirmation
- confirming restore -> `chrome.runtime.sendMessage({ type: "session:restore", sessionId })`

- [ ] **Step 4: Verify popup behavior manually**

Manual check in Chrome:

1. Click the extension icon
2. Confirm only session-centric actions are shown
3. Trigger `恢复对话` after at least one saved session exists
4. Confirm the popup shows child-session titles and provider labels
5. Confirm restore sends exactly one background message

- [ ] **Step 5: Commit**

```bash
git add popup.html popup.js popup.css
git commit -m "feat: add extension session popup menu"
```

### Task 6: Sync Child-Session Metadata from Provider Pages

**Files:**
- Modify: `content/content.js`
- Modify: `background.js`

- [ ] **Step 1: Add a narrow sync payload contract**

Send only:

```js
{
  type: "session:sync-child",
  provider: "deepseek",
  url: window.location.href,
  title: document.title,
  lastActiveAt: new Date().toISOString()
}
```

- [ ] **Step 2: Trigger sync at safe lifecycle points**

Implement sync on:

- initial load after provider detection
- `popstate`
- `hashchange`
- low-frequency debounced mutation/title changes where needed

Do not:

- send assistant output text
- run high-frequency noisy polling

- [ ] **Step 3: Update background session binding logic**

Rules:

- map `tabId` to a current session child if the tab belongs to a managed session
- normalize the provider payload via `normalizeChildSessionBinding`
- update the stored session via `SessionRegistry`
- mark `recoverable=false` when the page is on login/challenge/blank URLs

- [ ] **Step 4: Verify metadata sync manually**

Manual check in Chrome:

1. Create a session
2. In each provider tab, open a conversation
3. Watch the service worker logs for `session:sync-child`
4. Confirm stored session entries now contain URL and title for DeepSeek, Gemini, and Grok
5. Refresh the extension and confirm data persists

- [ ] **Step 5: Commit**

```bash
git add content/content.js background.js
git commit -m "feat: sync child session metadata from provider pages"
```

### Task 7: Implement Restore Confirmation and Final Verification

**Files:**
- Modify: `popup.js`
- Modify: `background.js`
- Modify: `task.md`
- Modify: `progress.md`

- [ ] **Step 1: Finish restore confirmation UX**

Popup requirements:

- list saved sessions
- show each child session's `provider / title / lastActiveAt / recoverable`
- disable or visually mark non-recoverable child sessions
- require explicit user confirmation before calling `session:restore`

- [ ] **Step 2: Verify restore with a provider matrix**

Run this manual matrix:

1. Create a foreground session
2. Open one real conversation in DeepSeek, Gemini, and Grok
3. Confirm each child session syncs a conversation URL and title
4. Close the managed window
5. Open popup -> `恢复对话`
6. Confirm child-session summary is visible before restore
7. Confirm restore reopens the saved URLs in a managed window

Expected:

- sessions remain in storage
- restore opens a real window
- each recoverable provider returns to its saved conversation URL
- failures are recorded per child session without dropping the whole session

- [ ] **Step 3: Run automated tests as a final gate**

Run:

```bash
node --test tests/session/session-model.test.js tests/session/session-registry.test.js tests/session/provider-session-bindings.test.js tests/session/window-manager.test.js
```

Expected: PASS for all session-layer unit tests

- [ ] **Step 4: Record evidence and update task tracking**

Update:

- `task.md`
- `progress.md`

Include:

- changed files
- manual repro steps
- key screenshots or observable results
- command output from the Node tests
- remaining risks for provider-specific URL stability

- [ ] **Step 5: Commit**

```bash
git add popup.js background.js task.md progress.md docs/superpowers/plans/2026-04-12-extension-session-layer-implementation-plan.md
git commit -m "docs: record extension session layer verification and handoff"
```

## Verification Checklist

- `node --test tests/session/session-model.test.js`
- `node --test tests/session/session-registry.test.js`
- `node --test tests/session/provider-session-bindings.test.js`
- `node --test tests/session/window-manager.test.js`
- Manual foreground session creation in Chrome
- Manual background session creation in Chrome
- Manual restore flow in Chrome via extension popup
- Service worker log review for `session:create`, `session:list`, `session:restore`, `session:sync-child`

## Risks to Watch During Execution

- Gemini and Grok may change URLs through SPA navigation without full page reloads, so sync hooks must avoid missing silent route changes.
- A provider page may expose a visible title before the final conversation URL stabilizes; prefer debounced updates over eager writes.
- `chrome.windows.create` behavior can vary by browser focus policy; background mode should be tested on the target Chrome build, not assumed.
- The current popup was previously optional; moving it to the primary browser action entry changes default interaction and must be smoke tested carefully.
