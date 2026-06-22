const START_PAGE = "dashboard.html";
const DEBUG = false; // Set to true for development debugging

try {
  importScripts(
    "providers.js",
    "session/session-constants.js",
    "session/session-model.js",
    "session/session-registry.js",
    "session/provider-session-bindings.js",
    "session/transcript-store.js",
    "session/window-manager.js"
  );
} catch (error) {
  console.error("[MultiAI Background] Failed to import session modules", error);
}

function log(msg, ...args) {
  if (DEBUG) {
    console.log(`[MultiAI Background] ${msg}`, ...args);
  }
}

const SESSION_CONSTANTS = globalThis.MultiAISessionConstants || {};
const SESSION_MODEL = globalThis.MultiAISessionModel || {};
const SESSION_REGISTRY = globalThis.MultiAISessionRegistry || {};
const SESSION_BINDINGS = globalThis.MultiAISessionProviderBindings || {};
const SESSION_TRANSCRIPT_STORE = globalThis.MultiAISessionTranscriptStore || {};
const SESSION_WINDOW_MANAGER = globalThis.MultiAISessionWindowManager || {};
const buildManagedDashboardUrl = SESSION_WINDOW_MANAGER.buildManagedDashboardUrl;
const normalizeRestorePlan = SESSION_WINDOW_MANAGER.normalizeRestorePlan;
const DASHBOARD_SESSION_KEY_PREFIX = "multi-ai-dashboard-session:";
const DEFAULT_TAB_COMPLETE_TIMEOUT_MS = 30000;
const ensureSessionTranscript = SESSION_TRANSCRIPT_STORE.ensureSessionTranscript;
const applyProviderLiveStatus = SESSION_TRANSCRIPT_STORE.applyProviderLiveStatus;
const appendUserTurn = SESSION_TRANSCRIPT_STORE.appendUserTurn;
const appendProviderTurn = SESSION_TRANSCRIPT_STORE.appendProviderTurn;

const PROVIDERS_BY_ID =
  typeof PROVIDER_BY_ID !== "undefined" && PROVIDER_BY_ID
    ? PROVIDER_BY_ID
    : (typeof PROVIDERS !== "undefined" && Array.isArray(PROVIDERS)
      ? PROVIDERS.reduce((acc, provider) => {
          acc[provider.id] = provider;
          return acc;
        }, {})
      : {});

const sessionRegistry = SESSION_REGISTRY.createSessionRegistry
  ? SESSION_REGISTRY.createSessionRegistry({ storage: chrome.storage.local })
  : null;
const sessionWindowManager = SESSION_WINDOW_MANAGER.createWindowManager
  ? SESSION_WINDOW_MANAGER.createWindowManager({ chromeApi: chrome })
  : null;

function getSessionProviderIds() {
  if (Array.isArray(SESSION_BINDINGS.SESSION_PROVIDER_IDS) && SESSION_BINDINGS.SESSION_PROVIDER_IDS.length > 0) {
    return SESSION_BINDINGS.SESSION_PROVIDER_IDS.slice();
  }
  if (Array.isArray(globalThis.SESSION_PROVIDER_IDS) && globalThis.SESSION_PROVIDER_IDS.length > 0) {
    return globalThis.SESSION_PROVIDER_IDS.slice();
  }
  return ["deepseek", "gemini", "grok"];
}

function generateSessionId(now) {
  const dateToken = String(now).slice(0, 10).replace(/-/g, "");
  const randomToken = Math.random().toString(36).slice(2, 8);
  return `sess_${dateToken}_${randomToken}`;
}

function getDashboardSessionStorageKey(sessionId) {
  return `${DASHBOARD_SESSION_KEY_PREFIX}${sessionId}`;
}

function buildDashboardSessionPayload(session) {
  const childSessionUrls = {};
  for (const [provider, child] of Object.entries(session?.childSessions || {})) {
    if (child?.recoverable && child?.url) {
      childSessionUrls[provider] = child.url;
    }
  }

  return {
    sessionId: session?.sessionId || "",
    panels: Array.isArray(session?.providers) ? session.providers.slice() : [],
    childSessionUrls,
    updatedAt: session?.lastActiveAt || session?.createdAt || new Date().toISOString()
  };
}

async function persistDashboardSessionState(session) {
  if (!session?.sessionId) {
    return;
  }
  const key = getDashboardSessionStorageKey(session.sessionId);
  await chrome.storage.local.set({
    [key]: buildDashboardSessionPayload(session)
  });
}

function sanitizeChildSessionRecord(provider, child) {
  const existing = child || {};
  const ignored =
    typeof SESSION_BINDINGS.shouldIgnoreChildSessionUrl === "function" &&
    SESSION_BINDINGS.shouldIgnoreChildSessionUrl(provider, existing.url);

  if (ignored) {
    return {
      ...existing,
      provider,
      tabId: typeof existing.tabId === "number" ? existing.tabId : null,
      url: "",
      title: typeof existing.title === "string" && existing.title.length > 0 ? existing.title : provider,
      lastActiveAt: existing.lastActiveAt || null,
      recoverable: false
    };
  }

  if (typeof SESSION_BINDINGS.normalizeChildSessionBinding === "function") {
    const normalized = SESSION_BINDINGS.normalizeChildSessionBinding({
      provider,
      url: existing.url,
      title: existing.title,
      tabId: existing.tabId,
      now: existing.lastActiveAt
    });

    return {
      ...existing,
      ...normalized,
      provider,
      lastActiveAt: existing.lastActiveAt || normalized.lastActiveAt || null
    };
  }

  return {
    ...existing,
    provider
  };
}

async function sanitizeSessionIfNeeded(session) {
  if (!session?.sessionId || !session.childSessions || typeof session.childSessions !== "object") {
    return session;
  }

  let childSessionsChanged = false;
  const nextChildSessions = {};

  for (const provider of session.providers || Object.keys(session.childSessions)) {
    const currentChild = session.childSessions?.[provider];
    const sanitizedChild = sanitizeChildSessionRecord(provider, currentChild);
    nextChildSessions[provider] = sanitizedChild;

    if (JSON.stringify(currentChild || {}) !== JSON.stringify(sanitizedChild || {})) {
      childSessionsChanged = true;
    }
  }

  const baseSession = childSessionsChanged ? { ...session, childSessions: nextChildSessions } : session;
  const transcriptEnsured = ensureSessionTranscript(baseSession);
  const transcriptChanged = transcriptEnsured !== baseSession;

  if (!childSessionsChanged && !transcriptChanged) {
    return session;
  }

  const updated = await sessionRegistry.updateSession(session.sessionId, (record) => {
    const nextRecord = { ...record };
    if (childSessionsChanged) {
      nextRecord.childSessions = nextChildSessions;
    }
    if (transcriptChanged) {
      nextRecord.transcript = transcriptEnsured.transcript;
    }
    return nextRecord;
  });
  await persistDashboardSessionState(updated);
  return updated;
}

async function handleSessionCreate(message) {
  if (!sessionRegistry || !sessionWindowManager || !SESSION_MODEL.createSessionRecord || !ensureSessionTranscript) {
    throw new Error("session-modules-unavailable");
  }

  const providers = Array.isArray(message?.providers)
    ? message.providers.filter(p => PROVIDER_BY_ID[p])
    : getSessionProviderIds();
  if (providers.length === 0) {
    throw new Error("no-providers-selected");
  }
  const now = new Date().toISOString();
  const sessionId = generateSessionId(now);
  const mode = message?.mode === "background"
    ? "background"
    : (SESSION_CONSTANTS.SESSION_MODE_FOREGROUND || "foreground");

  const session = SESSION_MODEL.createSessionRecord({
    sessionId,
    providers,
    mode,
    now
  });

  const sessionWithTranscript = ensureSessionTranscript(session, now);

  await sessionRegistry.saveSession(sessionWithTranscript);
  await persistDashboardSessionState(sessionWithTranscript);

  const dashboardUrl = buildManagedDashboardUrl
    ? buildManagedDashboardUrl({
        baseUrl: chrome.runtime.getURL(START_PAGE),
        sessionId
      })
    : chrome.runtime.getURL(START_PAGE);
  const focused = mode !== "background";
  const windowResult = await sessionWindowManager.createManagedSessionWindow({
    urls: [dashboardUrl],
    focused
  });
  const windowId = typeof windowResult?.id === "number" ? windowResult.id : null;

  const updated = await sessionRegistry.updateSession(sessionId, (record) => ({
    ...record,
    windowId,
    lastActiveAt: now
  }));
  await persistDashboardSessionState(updated);

  return { session: updated, windowId };
}

async function handleSessionList() {
  if (!sessionRegistry) {
    throw new Error("session-registry-unavailable");
  }
  const sessions = await sessionRegistry.listSessions();
  const sanitized = [];
  for (const session of sessions) {
    sanitized.push(await sanitizeSessionIfNeeded(session));
  }
  return sanitized;
}

async function handleSessionGet(sessionId) {
  if (!sessionRegistry) {
    throw new Error("session-registry-unavailable");
  }
  const session = await sessionRegistry.getSession(sessionId);
  return sanitizeSessionIfNeeded(session);
}

async function handleSessionRestore(sessionId) {
  if (!sessionRegistry || !sessionWindowManager) {
    throw new Error("session-modules-unavailable");
  }

  let session = await sessionRegistry.getSession(sessionId);
  if (!session) {
    throw new Error("session-not-found");
  }
  session = await sanitizeSessionIfNeeded(session);

  const restorePlan = normalizeRestorePlan ? normalizeRestorePlan(session) : null;
  const recoverableChildren = restorePlan ? restorePlan.restored : [];
  const childSessions = restorePlan ? restorePlan.clearedChildSessions : session.childSessions;

  const cleared = await sessionRegistry.updateSession(session.sessionId, (record) => ({
    ...record,
    childSessions
  }));
  await persistDashboardSessionState(cleared);

  const dashboardUrl = buildManagedDashboardUrl
    ? buildManagedDashboardUrl({
        baseUrl: chrome.runtime.getURL(START_PAGE),
        sessionId: session.sessionId
      })
    : chrome.runtime.getURL(START_PAGE);
  const focused = session.mode !== "background";
  const windowResult = await sessionWindowManager.createManagedSessionWindow({
    urls: [dashboardUrl],
    focused
  });
  const windowId = typeof windowResult?.id === "number" ? windowResult.id : null;
  const now = new Date().toISOString();

  const updated = await sessionRegistry.updateSession(session.sessionId, (record) => ({
    ...record,
    windowId,
    lastActiveAt: now
  }));
  await persistDashboardSessionState(updated);

  return { session: updated, windowId, restored: recoverableChildren };
}

/**
 * Find session by sender context (windowId first, then sessionId from URL)
 * @param {chrome.runtime.MessageSender} sender
 * @param {Array} sessions - List of session records
 * @returns {Object|null} - Session record or null
 */
function findSessionForSender(sender, sessions) {
  const windowId = sender?.tab?.windowId;
  if (typeof windowId !== "number") {
    return null;
  }

  // First try to find by windowId
  let session = sessions.find((record) => record.windowId === windowId);
  if (session) {
    return session;
  }

  // Fall back to finding by sessionId from sender URL
  const senderUrl = sender?.tab?.url || "";
  const sessionIdMatch = senderUrl.match(/[?&]sessionId=([^&]+)/);
  if (sessionIdMatch) {
    const sessionId = decodeURIComponent(sessionIdMatch[1]);
    session = sessions.find((record) => record.sessionId === sessionId);
  }

  return session || null;
}

/**
 * Normalize timestamp from message (occurredAt -> timestamp -> now)
 * @param {Object} message
 * @returns {string} - ISO timestamp
 */
function normalizeOccurredAt(message) {
  if (typeof message?.occurredAt === "string" && message.occurredAt) {
    return message.occurredAt;
  }
  if (typeof message?.timestamp === "string" && message.timestamp) {
    return message.timestamp;
  }
  return new Date().toISOString();
}

async function handleSessionSyncChild(message, sender) {
  log("Received session:sync-child payload", message);

  if (!sessionRegistry || !SESSION_MODEL.updateChildSessionRecord || !SESSION_BINDINGS.normalizeChildSessionBinding) {
    throw new Error("session-modules-unavailable");
  }

  const provider = message?.provider;
  const isSupported =
    typeof SESSION_BINDINGS.isSessionProviderSupported === "function"
      ? SESSION_BINDINGS.isSessionProviderSupported(provider)
      : getSessionProviderIds().includes(provider);
  if (!isSupported) {
    return { ok: false, reason: "unsupported-provider" };
  }

  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  if (typeof tabId !== "number" || typeof windowId !== "number") {
    return { ok: false, reason: "missing-tab-context" };
  }

  const sessions = await sessionRegistry.listSessions();
  const session = findSessionForSender(sender, sessions);
  if (!session) {
    return { ok: false, reason: "session-not-found" };
  }

  if (!session.childSessions || !Object.prototype.hasOwnProperty.call(session.childSessions, provider)) {
    return { ok: false, reason: "provider-not-in-session" };
  }

  const now = typeof message?.lastActiveAt === "string" ? message.lastActiveAt : new Date().toISOString();
  if (
    typeof SESSION_BINDINGS.shouldIgnoreChildSessionUrl === "function" &&
    SESSION_BINDINGS.shouldIgnoreChildSessionUrl(provider, message?.url)
  ) {
    return { ok: true, ignored: true, reason: "internal-provider-url" };
  }
  const normalized = SESSION_BINDINGS.normalizeChildSessionBinding({
    provider,
    url: message?.url,
    title: message?.title,
    tabId,
    now
  });

  const updated = await sessionRegistry.updateSession(session.sessionId, (record) =>
    SESSION_MODEL.updateChildSessionRecord(record, provider, normalized)
  );
  await persistDashboardSessionState(updated);

  return { ok: true, sessionId: updated.sessionId, child: updated.childSessions?.[provider] };
}

async function handleSessionTranscriptLiveStatus(message, sender) {
  log("Received session:transcript-live-status payload", message);

  if (!sessionRegistry || typeof applyProviderLiveStatus !== "function") {
    throw new Error("session-modules-unavailable");
  }

  const provider = message?.provider;
  const isSupported =
    typeof SESSION_BINDINGS.isSessionProviderSupported === "function"
      ? SESSION_BINDINGS.isSessionProviderSupported(provider)
      : getSessionProviderIds().includes(provider);
  if (!isSupported) {
    return { ok: false, reason: "unsupported-provider" };
  }

  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  if (typeof tabId !== "number" || typeof windowId !== "number") {
    return { ok: false, reason: "missing-tab-context" };
  }

  const sessions = await sessionRegistry.listSessions();
  const session = findSessionForSender(sender, sessions);
  if (!session) {
    return { ok: false, reason: "session-not-found" };
  }

  if (!session.childSessions || !Object.prototype.hasOwnProperty.call(session.childSessions, provider)) {
    return { ok: false, reason: "provider-not-in-session" };
  }

  const occurredAt = normalizeOccurredAt(message);
  const updated = await sessionRegistry.updateSession(session.sessionId, (record) =>
    applyProviderLiveStatus(record, {
      provider,
      status: message?.status,
      occurredAt
    })
  );
  await persistDashboardSessionState(updated);

  const providerState = updated?.transcript?.providers?.[provider] || null;
  return {
    ok: true,
    sessionId: updated.sessionId,
    provider,
    status: providerState?.status || "idle",
    providerState
  };
}

async function handleSessionTranscriptUserTurn(message, sender) {
  log("Received session:transcript-user-turn payload", message);

  if (!sessionRegistry || typeof appendUserTurn !== "function") {
    throw new Error("session-modules-unavailable");
  }

  const sessionId = typeof message?.sessionId === "string" ? message.sessionId.trim() : "";
  if (!sessionId) {
    return { ok: false, reason: "missing-session-id" };
  }

  const prompt =
    typeof message?.prompt === "string"
      ? message.prompt
      : (typeof message?.content === "string" ? message.content : "");
  if (!prompt || prompt.trim().length === 0) {
    return { ok: false, reason: "missing-prompt" };
  }

  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  if (typeof tabId !== "number" || typeof windowId !== "number") {
    return { ok: false, reason: "missing-tab-context" };
  }

  const session = await sessionRegistry.getSession(sessionId);
  if (!session) {
    return { ok: false, reason: "session-not-found" };
  }
  if (session.windowId !== windowId) {
    return { ok: false, reason: "session-window-mismatch" };
  }

  const requestedProviders = Array.isArray(message?.providers) ? message.providers : [];
  const providers = Array.from(new Set(
    requestedProviders.filter((provider) => typeof provider === "string" && provider.length > 0)
  )).filter((provider) => {
    const supported =
      typeof SESSION_BINDINGS.isSessionProviderSupported === "function"
        ? SESSION_BINDINGS.isSessionProviderSupported(provider)
        : getSessionProviderIds().includes(provider);
    const inSession =
      session.childSessions &&
      Object.prototype.hasOwnProperty.call(session.childSessions, provider);
    return supported && inSession;
  });
  if (providers.length === 0) {
    return { ok: false, reason: "no-target-providers" };
  }

  const occurredAt =
    typeof message?.occurredAt === "string" && message.occurredAt
      ? message.occurredAt
      : (typeof message?.timestamp === "string" && message.timestamp
        ? message.timestamp
        : new Date().toISOString());
  const updated = await sessionRegistry.updateSession(session.sessionId, (record) =>
    appendUserTurn(record, {
      providers,
      prompt,
      occurredAt
    })
  );
  await persistDashboardSessionState(updated);

  return {
    ok: true,
    sessionId: updated.sessionId,
    providers,
    occurredAt
  };
}

async function handleSessionTranscriptProviderTurn(message, sender) {
  log("Received session:transcript-provider-turn payload", message);

  if (
    !sessionRegistry ||
    typeof appendProviderTurn !== "function" ||
    typeof applyProviderLiveStatus !== "function"
  ) {
    throw new Error("session-modules-unavailable");
  }

  const provider = message?.provider;
  const isSupported =
    typeof SESSION_BINDINGS.isSessionProviderSupported === "function"
      ? SESSION_BINDINGS.isSessionProviderSupported(provider)
      : getSessionProviderIds().includes(provider);
  if (!isSupported) {
    return { ok: false, reason: "unsupported-provider" };
  }

  const role = typeof message?.role === "string" ? message.role : "";
  if (role !== "user" && role !== "assistant") {
    return { ok: false, reason: "invalid-role" };
  }

  const content =
    typeof message?.content === "string"
      ? message.content.trim()
      : (typeof message?.text === "string" ? message.text.trim() : "");
  if (!content) {
    return { ok: false, reason: "missing-content" };
  }

  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  if (typeof tabId !== "number" || typeof windowId !== "number") {
    return { ok: false, reason: "missing-tab-context" };
  }

  const sessions = await sessionRegistry.listSessions();
  const session = findSessionForSender(sender, sessions);
  if (!session) {
    return { ok: false, reason: "session-not-found" };
  }

  if (!session.childSessions || !Object.prototype.hasOwnProperty.call(session.childSessions, provider)) {
    return { ok: false, reason: "provider-not-in-session" };
  }

  const occurredAt = normalizeOccurredAt(message);
  const terminalStatus =
    role === "assistant" &&
    (message?.status === "completed" || message?.status === "failed" || message?.status === "interrupted")
      ? message.status
      : "";
  const updated = await sessionRegistry.updateSession(session.sessionId, (record) =>
    {
      let nextRecord = appendProviderTurn(record, {
        provider,
        role,
        content,
        occurredAt
      });
      if (terminalStatus) {
        nextRecord = applyProviderLiveStatus(nextRecord, {
          provider,
          status: terminalStatus,
          occurredAt
        });
      }
      return nextRecord;
    }
  );
  await persistDashboardSessionState(updated);

  return {
    ok: true,
    sessionId: updated.sessionId,
    provider,
    role,
    occurredAt
  };
}

async function handleTranscriptStatus(message, sender) {
  return handleSessionTranscriptLiveStatus(message, sender);
}

async function findOrCreateProviderTab(providerId) {
  const config = PROVIDERS_BY_ID[providerId];
  if (!config) {
    throw new Error("Unknown provider");
  }

  const urlPattern = `${config.url}*`;
  const existingTabs = await chrome.tabs.query({ url: urlPattern });
  if (existingTabs && existingTabs.length > 0) {
    return existingTabs[0];
  }

  const tab = await chrome.tabs.create({ url: config.url, active: false });
  return tab;
}

async function sendPromptToProviderTab(providerId, prompt, options = {}) {
  const tab = await findOrCreateProviderTab(providerId);
  if (!tab || !tab.id) {
    return false;
  }

  if (tab.status !== "complete") {
    try {
      await waitForTabComplete(tab.id, { timeoutMs: options.tabCompleteTimeoutMs });
    } catch (error) {
      console.warn("[MultiAI Background] waitForTabComplete failed before send", {
        providerId,
        tabId: tab.id,
        error: String(error?.message || error)
      });
      return false;
    }
  }

  return new Promise((resolve) => {
    chrome.tabs
      .sendMessage(tab.id, { type: "sendPrompt", provider: providerId, prompt })
      .then((res) => {
        resolve(Boolean(res && res.ok));
      })
      .catch(() => resolve(false));
  });
}

function waitForTabComplete(tabId, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : DEFAULT_TAB_COMPLETE_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;

    const cleanup = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      chrome.tabs.onUpdated.removeListener(listener);
    };

    const listener = (updatedTabId, info) => {
      if (updatedTabId !== tabId) {
        return;
      }
      if (info.status === "complete") {
        cleanup();
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`tab-complete-timeout:${tabId}:${timeoutMs}`));
    }, timeoutMs);
  });
}

async function executeChatGPTMainWorldSend(sender, prompt) {
  const tabId = sender?.tab?.id;
  if (typeof tabId !== "number") {
    return { ok: false, error: "missing-tab-id" };
  }

  const target = { tabId };
  if (typeof sender.frameId === "number") {
    target.frameIds = [sender.frameId];
  }

  const results = await chrome.scripting.executeScript({
    target,
    world: "MAIN",
    args: [prompt],
    func: async (messageText) => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const findInput = () =>
        document.querySelector("#prompt-textarea") ||
        document.querySelector("div[contenteditable='true'][role='textbox']") ||
        document.querySelector("textarea");
      const findSendButton = () =>
        document.querySelector("button[data-testid='send-button']") ||
        document.querySelector("button[aria-label*='Send']") ||
        document.querySelector("button[aria-label*='发送']") ||
        document.querySelector("button[aria-label*='发送提示']");

      const input = findInput();
      if (!input) {
        return { ok: false, error: "input-not-found" };
      }

      input.focus({ preventScroll: true });

      if (input.isContentEditable) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(input);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);

        try {
          document.execCommand("selectAll", false, null);
          document.execCommand("delete", false, null);
        } catch (error) {
          input.textContent = "";
        }

        try {
          input.dispatchEvent(new InputEvent("beforeinput", {
            bubbles: true,
            composed: true,
            cancelable: true,
            inputType: "insertText",
            data: messageText
          }));
        } catch (error) {
          // ignore event constructor failures
        }

        let inserted = false;
        try {
          inserted = document.execCommand("insertText", false, messageText);
        } catch (error) {
          inserted = false;
        }

        if (!inserted) {
          input.textContent = messageText;
        }

        try {
          input.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            composed: true,
            inputType: "insertText",
            data: messageText
          }));
        } catch (error) {
          input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        }
        input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      } else {
        const proto =
          input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(input, messageText);
        else input.value = messageText;
        input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      }

      await sleep(80);

      for (let attempt = 0; attempt < 20; attempt += 1) {
        const button = findSendButton();
        if (button && !button.disabled) {
          button.click();
          return { ok: true, method: "button" };
        }
        await sleep(50);
      }

      const enterInit = {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        composed: true,
        cancelable: true
      };
      ["keydown", "keypress", "keyup"].forEach((type) => {
        try {
          input.dispatchEvent(new KeyboardEvent(type, enterInit));
        } catch (error) {
          // ignore
        }
      });

      return { ok: true, method: "enter" };
    }
  });

  return results?.[0]?.result || { ok: false, error: "no-result" };
}

async function executeTongyiMainWorldSend(sender, prompt) {
  const tabId = sender?.tab?.id;
  if (typeof tabId !== "number") {
    return { ok: false, error: "missing-tab-id" };
  }

  const target = { tabId };
  if (typeof sender.frameId === "number") {
    target.frameIds = [sender.frameId];
  }

  const results = await chrome.scripting.executeScript({
    target,
    world: "MAIN",
    args: [prompt],
    func: async (messageText) => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const input =
        document.querySelector("div[data-slate-editor='true'][contenteditable='true']") ||
        document.querySelector("div[role='textbox'][data-placeholder][contenteditable='true']") ||
        document.querySelector("div[role='textbox'][contenteditable='true']");
      if (!input) {
        return { ok: false, error: "input-not-found" };
      }

      input.focus({ preventScroll: true });

      try {
        document.execCommand("selectAll", false, null);
        document.execCommand("delete", false, null);
      } catch (error) {
        input.textContent = "";
      }

      try {
        input.dispatchEvent(new InputEvent("beforeinput", {
          bubbles: true,
          composed: true,
          cancelable: true,
          inputType: "insertText",
          data: messageText
        }));
      } catch (error) {
        // ignore
      }

      let inserted = false;
      try {
        inserted = document.execCommand("insertText", false, messageText);
      } catch (error) {
        inserted = false;
      }
      if (!inserted) {
        input.textContent = messageText;
      }

      try {
        input.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertText",
          data: messageText
        }));
      } catch (error) {
        input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      }
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

      await sleep(120);

      const findSendControl = () => {
        const candidates = Array.from(document.querySelectorAll("div, button"));
        return (
          candidates.find((el) => {
            const className = typeof el.className === "string" ? el.className : "";
            return className.includes("operateBtn") && !className.toLowerCase().includes("disabled");
          }) ||
          null
        );
      };

      const control = findSendControl();
      if (control) {
        control.click();
        return { ok: true, method: "button" };
      }

      const enterInit = {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        composed: true,
        cancelable: true
      };
      ["keydown", "keypress", "keyup"].forEach((type) => {
        try {
          input.dispatchEvent(new KeyboardEvent(type, enterInit));
        } catch (error) {
          // ignore
        }
      });

      return { ok: true, method: "enter" };
    }
  });

  return results?.[0]?.result || { ok: false, error: "no-result" };
}

async function openProviders(providers, prompt, autoSend, options = {}) {
  const openResults = [];

  for (const provider of providers) {
    const config = PROVIDERS_BY_ID[provider];
    if (!config) {
      continue;
    }

    const tab = await chrome.tabs.create({ url: config.url, active: false });
    openResults.push({ provider, tabId: tab.id });

    if (autoSend) {
      waitForTabComplete(tab.id, { timeoutMs: options.tabCompleteTimeoutMs }).then(() => {
        chrome.tabs.sendMessage(tab.id, {
          type: "sendPrompt",
          provider,
          prompt
        });
      }).catch((error) => {
        console.warn("[MultiAI Background] waitForTabComplete failed before autoSend", {
          provider,
          tabId: tab.id,
          error: String(error?.message || error)
        });
      });
    }
  }

  return openResults;
}

async function openDashboard(panels) {
  const url = chrome.runtime.getURL("dashboard.html");
  const dashboardTab = await chrome.tabs.create({ url, active: true });

  if (!Array.isArray(panels) || panels.length === 0) {
    return dashboardTab;
  }

  const normalized = panels.slice(0, 6);
  chrome.storage.local.set({ "multi-ai-dashboard-panels": normalized });

  return dashboardTab;
}

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("manage.html"), active: true });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log(`Received message: ${message.type}`, message);

  if (message.type === "openProviders") {
    const providers = Array.isArray(message.providers) ? message.providers : [];
    const prompt = typeof message.prompt === "string" ? message.prompt : "";
    const autoSend = Boolean(message.autoSend);

    openProviders(providers, prompt, autoSend)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));

    return true;
  }

  if (message.type === "openDashboard") {
    const panels = Array.isArray(message.panels) ? message.panels : [];
    openDashboard(panels)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "openProviderTab") {
    const provider = PROVIDERS_BY_ID[message.provider];
    if (!provider) {
      sendResponse({ ok: false });
      return true;
    }
    chrome.tabs.create({ url: provider.url, active: true })
      .then((tab) => sendResponse({ ok: true, tabId: tab.id }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "sendPromptToProviderTab") {
    const provider = message.provider;
    const prompt = typeof message.prompt === "string" ? message.prompt : "";
    sendPromptToProviderTab(provider, prompt)
      .then((ok) => sendResponse({ ok }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "executeChatGPTMainWorldSend") {
    const prompt = typeof message.prompt === "string" ? message.prompt : "";
    executeChatGPTMainWorldSend(sender, prompt)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "executeTongyiMainWorldSend") {
    const prompt = typeof message.prompt === "string" ? message.prompt : "";
    executeTongyiMainWorldSend(sender, prompt)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "session:create") {
    handleSessionCreate(message)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "session:list") {
    handleSessionList()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "session:get") {
    const sessionId = message.sessionId;
    handleSessionGet(sessionId)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "session:restore") {
    const sessionId = message.sessionId;
    handleSessionRestore(sessionId)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "session:sync-child") {
    handleSessionSyncChild(message, sender)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "session:transcript-live-status") {
    handleSessionTranscriptLiveStatus(message, sender)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "session:transcript-user-turn") {
    handleSessionTranscriptUserTurn(message, sender)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "session:transcript-provider-turn") {
    handleSessionTranscriptProviderTurn(message, sender)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "transcript:status") {
    handleTranscriptStatus(message, sender)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return undefined;
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    handleSessionCreate,
    sanitizeSessionIfNeeded,
    handleSessionTranscriptLiveStatus,
    handleSessionTranscriptUserTurn,
    handleSessionTranscriptProviderTurn,
    handleTranscriptStatus,
    waitForTabComplete,
    sendPromptToProviderTab,
    openProviders,
    ensureSessionTranscript,
    createTranscriptStore: SESSION_TRANSCRIPT_STORE.createTranscriptStore,
    createEmptyTranscriptProvider: SESSION_TRANSCRIPT_STORE.createEmptyTranscriptProvider,
    normalizeTranscriptProvider: SESSION_TRANSCRIPT_STORE.normalizeTranscriptProvider,
    applyProviderLiveStatus
  };
}
