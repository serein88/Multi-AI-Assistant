# Extension Session Layer MVP Design

> Status: Draft approved for planning

## 1. Goal

Build an extension-owned session layer that treats **one browser window as one managed session** and treats each provider webpage conversation inside that window as a **child session**.

The purpose of this phase is to make the extension the only trusted session manager before adding CLI execution or response extraction.

## 2. Product Positioning

This phase should be treated as:

- an **extension-side session ledger**
- a **window lifecycle manager**
- a **history and restore foundation** for later automation

This phase should not be treated as:

- a CLI implementation phase
- a provider history scraping phase
- a response extraction phase

## 3. Chosen Direction

### Chosen architecture

**Extension-owned session ledger**, with recovery based on provider conversation URLs.

### Why this direction

Compared with extending the current CLI work first:

- it gives the project a stable middle layer
- it avoids coupling CLI commands directly to volatile webpages
- it creates a reusable session model for both manual and future CLI workflows

Compared with implementing provider-native history browsing now:

- it keeps MVP complexity controlled
- it avoids premature per-provider history UI adaptation
- it still supports practical recovery by reopening known conversation URLs

## 4. Core Definitions

- **Session**: one browser window created and managed by the extension
- **Child session**: one provider webpage conversation bound inside a managed session
- **Restore**: reopening a saved child-session URL in a managed session window
- **Background mode**: create a real browser window without focusing it

## 5. MVP Scope

### Supported providers in MVP

- DeepSeek
- Gemini
- Grok

### Required capabilities

- create a new managed session window
- create a new managed session window in background mode
- persist session history in the extension
- persist child-session metadata for supported providers
- display session history and child-session summaries
- restore a saved session after user confirmation

### Explicit non-goals in this phase

- no CLI implementation
- no current-turn output extraction
- no provider-native history list browsing
- no arbitrary selection from provider-native past conversations
- no support beyond DeepSeek, Gemini, and Grok

## 6. State Model

The extension must own the session state. Runtime browser IDs are bindings, not durable identity.

### Session fields

- `sessionId`
- `name`
- `windowId`
- `status`
- `mode`
- `createdAt`
- `lastActiveAt`
- `providers`
- `childSessions`

### Child-session fields

- `provider`
- `tabId`
- `url`
- `title`
- `lastActiveAt`
- `recoverable`

Representative shape:

```json
{
  "sessionId": "sess_20260412_xxx",
  "name": "Session 2026-04-12 14:30",
  "windowId": 123,
  "status": "active",
  "mode": "foreground",
  "createdAt": "2026-04-12T14:30:00Z",
  "lastActiveAt": "2026-04-12T14:45:00Z",
  "providers": ["deepseek", "gemini", "grok"],
  "childSessions": {
    "deepseek": {
      "provider": "deepseek",
      "tabId": 456,
      "url": "https://chat.deepseek.com/a/chat/some-id",
      "title": "DeepSeek - xxx",
      "lastActiveAt": "2026-04-12T14:44:10Z",
      "recoverable": true
    }
  }
}
```

## 7. Key Constraints

1. `windowId` and `tabId` are runtime bindings only.
2. Durable recovery anchor is `provider + url`.
3. `title` and `lastActiveAt` are for user confirmation and history display, not restore identity.
4. A child session is not recoverable unless `recoverable=true`.
5. Session restoration must show saved child-session metadata before reopening URLs.

## 8. Internal Architecture

### 8.1 `SessionRegistry`

Responsibilities:

- persist sessions in `chrome.storage.local`
- create and update session records
- read session history
- update child-session metadata
- archive or mark failed sessions

### 8.2 `SessionWindowManager`

Responsibilities:

- create managed windows
- create managed windows in background mode
- restore a session into a new or reused window
- bind runtime `windowId` and `tabId` to the session ledger

### 8.3 `SessionSyncBridge`

Responsibilities:

- receive lightweight page metadata from supported provider pages
- normalize `url`, `title`, and activity timestamps
- push updates into `SessionRegistry`

This bridge should not extract answers in this phase.

### 8.4 `SessionUI`

Responsibilities:

- create sessions
- list session history
- show child-session summaries
- show restore confirmation before reopening child-session URLs

For the MVP, the primary entry should be the browser extension icon popup menu. Clicking the extension icon should present at least:

- `新建会话`
- `恢复对话`

The MVP does not require a larger standalone management surface yet. The history UX should stay explicit and extension-owned, but the first interaction can remain a compact popup menu.

### 8.5 `ProviderChildBinding`

Responsibilities:

- map supported providers to their current child-session URL
- report current URL and title when a supported page is active
- keep provider-specific logic small and isolated

## 9. Key Flows

### 9.1 Create a new session

1. User clicks the browser extension icon.
2. The popup menu shows `新建会话` and `恢复对话`.
3. User requests a new managed session.
4. The extension generates `sessionId`.
5. `SessionWindowManager` creates a new window.
6. The extension opens DeepSeek, Gemini, and Grok pages in that window.
7. Supported pages report their current `url` and `title`.
8. `SessionRegistry` updates the child-session records.
9. The session becomes visible in history.

### 9.2 Create a background session

1. User clicks the browser extension icon and chooses `新建会话`.
2. User selects or triggers background mode.
3. The extension creates a real browser window without focusing it.
4. The remaining flow matches foreground creation.
5. The session history should indicate that the session exists even if the user never focused it.

### 9.3 View session history

The MVP history entry starts from the browser extension icon popup menu. When the user chooses `恢复对话`, the extension must show session history with:

- session name
- created time
- last active time
- included providers
- child-session title summaries

### 9.4 Restore a historical session

1. User opens a historical session entry.
2. The extension shows recoverable child sessions and their saved metadata.
3. User confirms restoration.
4. The extension creates or reuses a managed window.
5. For each recoverable child session, the extension reopens the saved URL.
6. Supported pages resync `url` and `title`.
7. Failed child sessions are marked individually without collapsing the full session.

## 10. Failure Model

### Session-level failures

- window creation failure
- extension storage write failure

These failures should block session activation.

### Child-session failures

- provider page open failure
- saved URL no longer resolves to the same conversation
- login state lost
- page metadata not synced

These failures should mark the affected child session, not destroy the whole parent session.

### Recovery semantics

- login loss should be marked as requiring manual intervention
- missing metadata should prevent a child session from being considered fully bound
- restore should be explicit, not silent

## 11. Acceptance Criteria

The phase is complete when all of the following are true:

1. The extension can create a managed foreground session window.
2. The extension can create a managed background session window without focusing it.
3. Clicking the browser extension icon exposes at least `新建会话` and `恢复对话`.
4. Session history is persisted across extension restarts.
5. Session history displays child-session summaries for DeepSeek, Gemini, and Grok.
6. A saved session can be restored after confirmation by reopening saved child-session URLs.
7. DeepSeek, Gemini, and Grok each complete at least one successful cycle of:
   - open current conversation
   - save current conversation URL and title
   - close or detach the runtime binding
   - restore the child session by reopening the saved URL

## 12. Future Evolution Paths

This architecture must leave room for later work:

1. CLI commands that call into the extension session layer
2. current-turn response extraction
3. provider-native history browsing and selection
4. richer child-session health diagnostics
5. broader provider coverage

## 13. Implementation Guardrails

1. Do not mix CLI runtime implementation into this phase.
2. Keep provider-specific logic limited to URL/title binding for DeepSeek, Gemini, and Grok.
3. Keep the session ledger extension-owned and provider-agnostic.
4. Treat restore confirmation as a required UX, not an optional shortcut.
5. Start implementation on a dedicated branch:
   - `feature/extension-session-layer-mvp`
