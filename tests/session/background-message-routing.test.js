"use strict";

/**
 * Integration tests for background.mjs — chrome.runtime.onMessage routing
 *
 * Dynamically imports background.mjs with a mock chrome API to verify
 * that each message type is routed to the correct handler and returns
 * the expected response shape.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import sinon from "sinon";

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a mock chrome API for the background service worker.
 * Returns { chrome, messageListener, storage, tabs } for assertions.
 */
function createMockChrome() {
  const messageListeners = [];
  const storage = {};

  const tabs = {
    created: [],
    query: sinon.stub().resolves([]),
    create: sinon.stub().callsFake(async (opts) => {
      const tab = { id: Date.now() + Math.floor(Math.random() * 1000), url: opts?.url, status: "complete" };
      tabs.created.push(tab);
      return tab;
    }),
    sendMessage: sinon.stub().resolves({ ok: true }),
    onUpdated: {
      addListener: sinon.stub(),
      removeListener: sinon.stub(),
    },
  };

  const windows = {
    getCurrent: sinon.stub().resolves({ id: 999 }),
  };

  const scripting = {
    executeScript: sinon.stub().resolves([{ result: { ok: true, method: "button" } }]),
  };

  const chrome = {
    action: {
      onClicked: { addListener: sinon.stub() },
    },
    runtime: {
      onMessage: {
        addListener: (fn) => messageListeners.push(fn),
      },
      getURL: (p) => `chrome-extension://test-bg-id/${p}`,
      lastError: null,
    },
    storage: {
      local: {
        get: sinon.stub().callsFake(async (key) => {
          if (typeof key === "string") return { [key]: storage[key] || null };
          return {};
        }),
        set: sinon.stub().callsFake(async (obj) => {
          Object.assign(storage, obj);
        }),
      },
    },
    tabs,
    windows,
    scripting,
  };

  return { chrome, messageListeners, storage, tabs, windows, scripting };
}

/**
 * Import background.mjs with a fresh mock chrome. Uses cache-busting to
 * ensure a clean module evaluation each time.
 */
async function importBackground(mockChrome) {
  // Set up globals before import
  globalThis.chrome = mockChrome;

  // Cache-bust: each test gets a fresh module evaluation
  const url = new URL(`../../background.mjs?test=${Date.now()}${Math.random()}`, import.meta.url).href;
  const mod = await import(url);
  return mod;
}

/**
 * Call the registered onMessage listener and return the sendResponse value.
 */
function callMessageListener(messageListeners, message, sender = {}) {
  const listener = messageListeners[0];
  assert.ok(listener, "background.mjs should register onMessage listener");

  let responseValue;
  const sendResponse = sinon.stub().callsFake((val) => {
    responseValue = val;
  });

  const keepChannel = listener(message, sender, sendResponse);
  assert.equal(keepChannel, true, "listener should return true");

  return new Promise((resolve) => {
    setTimeout(() => resolve(responseValue), 100);
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("background.mjs message routing", () => {
  let savedChrome;

  beforeEach(() => {
    savedChrome = globalThis.chrome;
  });

  afterEach(() => {
    if (savedChrome) {
      globalThis.chrome = savedChrome;
    } else {
      delete globalThis.chrome;
    }
  });

  // ── Unknown message ──

  it("returns undefined for unknown message types", async () => {
    const mock = createMockChrome();
    await importBackground(mock.chrome);

    const listener = mock.messageListeners[0];
    const sendResponse = sinon.stub();
    const result = listener({ type: "unknown-type-xyz" }, {}, sendResponse);

    assert.equal(result, undefined, "should return undefined");
    assert.equal(sendResponse.callCount, 0, "should not call sendResponse");
  });

  // ── openDashboard ──

  it("openDashboard creates tab and writes panels to storage", async () => {
    const mock = createMockChrome();
    await importBackground(mock.chrome);

    const response = await callMessageListener(mock.messageListeners, {
      type: "openDashboard",
      panels: ["deepseek", "gemini"],
    });

    assert.equal(response.ok, true);
    assert.ok(mock.tabs.create.called, "should create tab");
    assert.ok(
      mock.tabs.create.firstCall.args[0].url.includes("dashboard.html"),
      "should open dashboard.html"
    );
    // Storage should have the panels
    const setCall = mock.chrome.storage.local.set.getCalls().find(
      (c) => c.args[0]["multi-ai-dashboard-panels"]
    );
    assert.ok(setCall, "should write panels to storage");
    assert.deepEqual(setCall.args[0]["multi-ai-dashboard-panels"], ["deepseek", "gemini"]);
  });

  // ── sendPromptToProviderTab: success with existing tab ──

  it("sendPromptToProviderTab sends to existing completed tab", async () => {
    const mock = createMockChrome();
    mock.tabs.query.resolves([{ id: 42, status: "complete" }]);
    mock.tabs.sendMessage.resolves({ ok: true });
    await importBackground(mock.chrome);

    const response = await callMessageListener(mock.messageListeners, {
      type: "sendPromptToProviderTab",
      provider: "deepseek",
      prompt: "hello world",
    });

    assert.equal(response.ok, true);
    assert.ok(mock.tabs.sendMessage.called, "should send message to tab");
    const sentMsg = mock.tabs.sendMessage.firstCall.args[1];
    assert.equal(sentMsg.type, "sendPrompt");
    assert.equal(sentMsg.provider, "deepseek");
    assert.equal(sentMsg.prompt, "hello world");
  });

  // ── sendPromptToProviderTab: waits for tab complete ──

  it("sendPromptToProviderTab waits for tab complete before sending", async () => {
    const mock = createMockChrome();
    // No existing tabs
    mock.tabs.query.resolves([]);
    // Create returns a loading tab
    mock.tabs.create.resolves({ id: 50, status: "loading" });
    mock.tabs.sendMessage.resolves({ ok: true });
    await importBackground(mock.chrome);

    // Fire the message but don't await yet
    const responsePromise = callMessageListener(mock.messageListeners, {
      type: "sendPromptToProviderTab",
      provider: "deepseek",
      prompt: "test",
    });

    // Simulate tab becoming complete
    await new Promise((r) => setTimeout(r, 50));
    const onUpdatedListener = mock.tabs.onUpdated.addListener.firstCall?.args[0];
    if (onUpdatedListener) {
      onUpdatedListener(50, { status: "complete" });
    }

    const response = await responsePromise;
    assert.equal(response.ok, true);
  });

  // ── executeChatGPTMainWorldSend ──

  it("executeChatGPTMainWorldSend delegates to chrome.scripting.executeScript", async () => {
    const mock = createMockChrome();
    mock.scripting.executeScript.resolves([{ result: { ok: true, method: "button" } }]);
    await importBackground(mock.chrome);

    const sender = { tab: { id: 100 }, frameId: 0 };
    const response = await callMessageListener(
      mock.messageListeners,
      { type: "executeChatGPTMainWorldSend", prompt: "test chatgpt" },
      sender
    );

    assert.equal(response.ok, true);
    assert.equal(response.method, "button");
    assert.ok(mock.scripting.executeScript.called, "should call executeScript");
    const execArgs = mock.scripting.executeScript.firstCall.args[0];
    assert.equal(execArgs.target.tabId, 100);
    assert.deepEqual(execArgs.target.frameIds, [0]);
    assert.equal(execArgs.world, "MAIN");
  });

  // ── session:create ──

  it("session:create returns session and windowId", async () => {
    const mock = createMockChrome();
    await importBackground(mock.chrome);

    const response = await callMessageListener(mock.messageListeners, {
      type: "session:create",
      providers: ["deepseek", "gemini"],
      mode: "foreground",
    });

    assert.equal(response.ok, true);
    assert.ok(response.result, "should have result");
    assert.ok(response.result.session, "should have session");
    assert.ok(response.result.session.sessionId, "should have sessionId");
    assert.deepEqual(response.result.session.providers.sort(), ["deepseek", "gemini"]);
    assert.equal(typeof response.result.windowId, "number");
  });

  // ── session:list ──

  it("session:list returns array of sessions", async () => {
    const mock = createMockChrome();
    await importBackground(mock.chrome);

    // Create a session first
    await callMessageListener(mock.messageListeners, {
      type: "session:create",
      providers: ["deepseek"],
    });

    const response = await callMessageListener(mock.messageListeners, {
      type: "session:list",
    });

    assert.equal(response.ok, true);
    assert.ok(Array.isArray(response.result), "should return array");
    assert.ok(response.result.length >= 1, "should have at least 1 session");
  });

  // ── session:get ──

  it("session:get returns session by id", async () => {
    const mock = createMockChrome();
    await importBackground(mock.chrome);

    const createRes = await callMessageListener(mock.messageListeners, {
      type: "session:create",
      providers: ["grok"],
    });
    const sessionId = createRes.result.session.sessionId;

    const response = await callMessageListener(mock.messageListeners, {
      type: "session:get",
      sessionId,
    });

    assert.equal(response.ok, true);
    assert.equal(response.result.sessionId, sessionId);
  });

  // ── session:restore ──

  it("session:restore reopens dashboard with same sessionId", async () => {
    const mock = createMockChrome();
    await importBackground(mock.chrome);

    const createRes = await callMessageListener(mock.messageListeners, {
      type: "session:create",
      providers: ["deepseek", "grok"],
    });
    const sessionId = createRes.result.session.sessionId;

    const response = await callMessageListener(mock.messageListeners, {
      type: "session:restore",
      sessionId,
    });

    assert.equal(response.ok, true);
    assert.equal(response.result.session.sessionId, sessionId);
    assert.equal(typeof response.result.windowId, "number");
    assert.ok(Array.isArray(response.result.restored), "should have restored array");
  });

  // ── session:transcript-user-turn ──

  it("session:transcript-user-turn writes user turn to transcript", async () => {
    const mock = createMockChrome();
    await importBackground(mock.chrome);

    // Create session with windowId
    const createRes = await callMessageListener(mock.messageListeners, {
      type: "session:create",
      providers: ["deepseek", "gemini"],
    });
    const sessionId = createRes.result.session.sessionId;
    const windowId = createRes.result.windowId;

    // Send user turn from matching window
    const sender = { tab: { id: 10, windowId } };
    const response = await callMessageListener(
      mock.messageListeners,
      {
        type: "session:transcript-user-turn",
        sessionId,
        prompt: "What is life?",
        providers: ["deepseek", "gemini"],
      },
      sender
    );

    assert.equal(response.ok, true);

    // Verify transcript
    const getRes = await callMessageListener(mock.messageListeners, {
      type: "session:get",
      sessionId,
    });
    const transcript = getRes.result.transcript;
    assert.ok(transcript, "session should have transcript");
    assert.ok(transcript.providers.deepseek.turns.length > 0, "deepseek should have turns");
    assert.equal(transcript.providers.deepseek.turns[0].role, "user");
    assert.equal(transcript.providers.deepseek.turns[0].content, "What is life?");
  });

  // ── session:transcript-user-turn: window mismatch ──

  it("session:transcript-user-turn rejects window mismatch", async () => {
    const mock = createMockChrome();
    await importBackground(mock.chrome);

    const createRes = await callMessageListener(mock.messageListeners, {
      type: "session:create",
      providers: ["deepseek"],
    });
    const sessionId = createRes.result.session.sessionId;

    // Send from a DIFFERENT window
    const sender = { tab: { id: 99, windowId: 99999 } };
    const response = await callMessageListener(
      mock.messageListeners,
      {
        type: "session:transcript-user-turn",
        sessionId,
        prompt: "sneaky",
        providers: ["deepseek"],
      },
      sender
    );

    assert.equal(response.result.ok, false);
    assert.equal(response.result.reason, "session-window-mismatch");
  });

  // ── openProviderTab ──

  it("openProviderTab creates tab for known provider", async () => {
    const mock = createMockChrome();
    await importBackground(mock.chrome);

    const response = await callMessageListener(mock.messageListeners, {
      type: "openProviderTab",
      provider: "deepseek",
    });

    assert.equal(response.ok, true);
    assert.ok(response.tabId, "should return tabId");
    assert.ok(mock.tabs.create.called, "should create tab");
  });

  it("openProviderTab fails for unknown provider", async () => {
    const mock = createMockChrome();
    await importBackground(mock.chrome);

    const response = await callMessageListener(mock.messageListeners, {
      type: "openProviderTab",
      provider: "nonexistent",
    });

    assert.equal(response.ok, false);
  });

  // ── openProviders ──

  it("openProviders creates tabs for each provider", async () => {
    const mock = createMockChrome();
    await importBackground(mock.chrome);

    const response = await callMessageListener(mock.messageListeners, {
      type: "openProviders",
      providers: ["deepseek", "grok"],
      prompt: "",
      autoSend: false,
    });

    assert.equal(response.ok, true);
    assert.ok(Array.isArray(response.result), "should return array");
    assert.equal(response.result.length, 2);
  });
});
