"use strict";

/**
 * Integration tests for content/content.js — trySendPrompt message flow
 *
 * Loads content.js in a VM context with mocked Chrome APIs, provider configs,
 * send handlers, and response detection. Tests the full chain from
 * chrome.runtime.onMessage listener → trySendPrompt → postSendResult / live status.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const sinon = require("sinon");

const CONTENT_JS_PATH = path.join(__dirname, "..", "..", "content", "content.js");
const CONTENT_SOURCE = fs.readFileSync(CONTENT_JS_PATH, "utf8");

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a mock Chrome extension environment and load content.js into it.
 * Returns the context object with all captured listeners and stubs.
 */
function loadContentScript(overrides = {}) {
  const messageListeners = [];

  // Mock chrome API
  const chrome = {
    runtime: {
      getURL: (p) => `chrome-extension://test-id/${p}`,
      onMessage: {
        addListener: (fn) => messageListeners.push(fn),
      },
      sendMessage: sinon.stub().resolves({ ok: true }),
      lastError: null,
    },
  };

  // Mock provider configs
  const providerConfigs = overrides.providerConfigs || {
    ready: true,
    readyPromise: Promise.resolve(true),
    PROVIDER_CONFIGS: {
      deepseek: {
        inputSelectors: ["#ds-input"],
        sendButtonSelectors: ["#ds-send"],
        inputType: "textarea",
      },
      grok: {
        inputSelectors: ["#grok-input"],
        sendButtonSelectors: ["#grok-send"],
        inputType: "textarea",
      },
    },
    HOST_MAP: [{ match: "deepseek", id: "deepseek" }],
    getProviderFromHost: () => "deepseek",
    getProviderConfig: (provider) =>
      providerConfigs.PROVIDER_CONFIGS[provider] || null,
  };

  // Mock send handlers
  const sendHandlers = overrides.sendHandlers || {
    waitForElement: sinon.stub().resolves(null),
    waitForElementDeep: sinon.stub().resolves(null),
    setInputValue: sinon.stub().resolves(true),
    clickSendButton: sinon.stub().returns(true),
    clickSendButtonDeep: sinon.stub().returns(true),
    findElement: sinon.stub().returns(null),
    deepQueryAll: sinon.stub().returns([]),
    isElementVisible: sinon.stub().returns(true),
    isElementDisabled: sinon.stub().returns(false),
    getEditableText: sinon.stub().returns(""),
    getStopSelectors: sinon.stub().returns([]),
    countResponseNodes: sinon.stub().returns(0),
    sendChatGPTMessage: sinon.stub().resolves(true),
    sendCopilotMessage: sinon.stub().resolves(true),
    sendGrokMessage: sinon.stub().resolves(true),
    sendKimiMessage: sinon.stub().resolves(true),
    sendImaMessage: sinon.stub().resolves(true),
    sendTongyiMessage: sinon.stub().resolves(true),
    log: sinon.stub(),
  };

  // Mock response detection
  const responseDetection = overrides.responseDetection || {
    waitForResponseStart: sinon.stub().resolves(true),
    waitForResponseComplete: sinon.stub().resolves({}),
    extractLatestResponse: sinon.stub().returns("mock response"),
  };

  // Mock transcript capture
  const transcriptCapture = overrides.transcriptCapture || {
    setCapturingActiveResponse: sinon.stub(),
    pauseManualTurnObserver: sinon.stub(),
    resumeManualTurnObserver: sinon.stub(),
    startManualSendCapture: sinon.stub(),
    startManualTurnCapture: sinon.stub(),
    shouldIgnoreThinkingNode: sinon.stub().returns(false),
    extractTextExcludingThinking: sinon.stub().callsFake((provider, node) => {
      return node.textContent || "";
    }),
  };

  // Mock session sync
  const sessionSync = overrides.sessionSync || {
    startChildSessionSync: sinon.stub(),
  };

  // DOM mocks
  const mockInput = overrides.mockInput || createMockElement("textarea", "#ds-input");
  const mockSendButton = overrides.mockSendButton || createMockElement("button", "#ds-send");

  const documentOverrides = overrides.document || {};
  const document = {
    readyState: documentOverrides.readyState || "complete",
    body: documentOverrides.body || null,
    querySelector: documentOverrides.querySelector || sinon.stub().callsFake((selector) => {
      if (selector === "#ds-input" || selector === "#grok-input") return mockInput;
      if (selector === "#ds-send" || selector === "#grok-send") return mockSendButton;
      return null;
    }),
    querySelectorAll: documentOverrides.querySelectorAll || sinon.stub().returns([]),
    addEventListener: sinon.stub(),
    createElement: sinon.stub().returns(createMockElement("div")),
  };

  const windowOverrides = overrides.window || {};
  const parentWindow = {
    postMessage: sinon.stub(),
  };
  const windowObj = {
    location: { hostname: "chat.deepseek.com" },
    addEventListener: sinon.stub(),
    removeEventListener: sinon.stub(),
    ...windowOverrides,
  };
  Object.defineProperty(windowObj, "parent", {
    value: parentWindow,
    writable: false,
  });

  const locationObj = {
    hostname: "chat.deepseek.com",
    host: "chat.deepseek.com",
    href: "https://chat.deepseek.com/",
    origin: "https://chat.deepseek.com",
  };

  // Build the VM context
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    Date,
    JSON,
    Math,
    Array,
    Object,
    Set,
    Map,
    URL,
    Error,
    TypeError,
    Boolean,
    String,
    Number,
    RegExp,
    KeyboardEvent: typeof KeyboardEvent !== "undefined" ? KeyboardEvent : createMockKeyboardEvent(),
    InputEvent: typeof InputEvent !== "undefined" ? InputEvent : function InputEvent() {},
    Event: typeof Event !== "undefined" ? Event : function Event() {},
    MutationObserver: createMockMutationObserver(),
    chrome,
    document,
    window: windowObj,
    location: locationObj,
    globalThis: {},
    performance: { now: () => 0 },
    __MAI_ProviderConfigs: providerConfigs,
    __MAI_Send: sendHandlers,
    __MAI_Response: responseDetection,
    __MAI_Transcript: transcriptCapture,
    __MAI_SessionSync: sessionSync,
  });
  context.globalThis = context;

  // Run content.js
  vm.runInContext(CONTENT_SOURCE, context, { filename: "content.js" });

  return {
    context,
    chrome,
    messageListeners,
    providerConfigs,
    sendHandlers,
    responseDetection,
    transcriptCapture,
    sessionSync,
    mockInput,
    mockSendButton,
    parentWindow,
    document,
    windowObj,
  };
}

function createMockElement(tag, id) {
  const el = {
    tagName: tag.toUpperCase(),
    id: id?.replace("#", "") || "",
    className: "",
    value: "",
    textContent: "",
    innerHTML: "",
    disabled: false,
    focus: sinon.stub(),
    click: sinon.stub(),
    dispatchEvent: sinon.stub(),
    getAttribute: sinon.stub(),
    setAttribute: sinon.stub(),
    addEventListener: sinon.stub(),
    removeEventListener: sinon.stub(),
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 30 }),
    style: {},
  };
  return el;
}

function createMockKeyboardEvent() {
  return function KeyboardEvent(type, init) {
    this.type = type;
    this.key = init?.key;
    this.code = init?.code;
    this.keyCode = init?.keyCode;
    this.bubbles = init?.bubbles;
  };
}

function createMockMutationObserver() {
  return function MutationObserver() {
    return { observe: sinon.stub(), disconnect: sinon.stub(), takeRecords: () => [] };
  };
}

/**
 * Invoke the chrome.runtime.onMessage listener captured from content.js.
 * Resolves when sendResponse is called (up to timeoutMs).
 */
function invokeMessageListener(env, message, sender = {}, { timeoutMs = 2000 } = {}) {
  const listener = env.messageListeners[0];
  assert.ok(listener, "content.js should register a runtime.onMessage listener");

  return new Promise((resolve, reject) => {
    let settled = false;
    const sendResponse = sinon.stub().callsFake((val) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    });

    const keepChannel = listener(message, sender, sendResponse);
    assert.equal(keepChannel, true, "listener should return true to keep channel open");

    // Timeout fallback
    setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`sendResponse timeout after ${timeoutMs}ms for message type: ${message.type}`));
      }
    }, timeoutMs);
  });
}

/**
 * Wait for waitForResponseComplete to resolve (used in success path tests).
 * Returns a promise that resolves after the mock response chain completes.
 */
function waitForResponseChain(env) {
  // waitForResponseComplete is called after waitForResponseStart returns true
  // and after responseStarted is posted. The chain resolves in microtasks.
  // We wait for waitForResponseComplete to have been called.
  return new Promise((resolve) => {
    const check = () => {
      if (env.responseDetection.waitForResponseComplete.callCount > 0) {
        resolve();
      } else {
        setTimeout(check, 10);
      }
    };
    setTimeout(check, 50);
    // Safety timeout
    setTimeout(resolve, 3000);
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("content.js trySendPrompt integration", () => {
  // ── Config not loaded ──

  it("returns false and posts failed status when configs not loaded", async () => {
    const env = loadContentScript({
      providerConfigs: {
        ready: false,
        readyPromise: Promise.resolve(false),
        PROVIDER_CONFIGS: {},
        HOST_MAP: [],
        getProviderFromHost: () => "",
        getProviderConfig: () => null,
      },
    });

    const response = await invokeMessageListener(env, {
      type: "sendPrompt",
      provider: "deepseek",
      prompt: "hello",
    });

    assert.equal(response?.ok, false);
    const postMsg = env.parentWindow.postMessage;
    const sendResultCall = postMsg.getCalls().find(
      (c) => c.args[0]?.type === "sendResult"
    );
    assert.ok(sendResultCall, "should post sendResult");
    assert.equal(sendResultCall.args[0].success, false);

    const sendMessage = env.chrome.runtime.sendMessage;
    assert.ok(
      sendMessage.calledWith(
        sinon.match({ type: "session:transcript-live-status", status: "failed" })
      ),
      "should send live status 'failed'"
    );
  });

  // ── Missing provider config ──

  it("returns false when provider config is missing", async () => {
    const env = loadContentScript();

    const response = await invokeMessageListener(env, {
      type: "sendPrompt",
      provider: "nonexistent",
      prompt: "hello",
    });

    assert.equal(response?.ok, false);
    const postMsg = env.parentWindow.postMessage;
    const sendResultCall = postMsg.getCalls().find(
      (c) => c.args[0]?.type === "sendResult"
    );
    assert.ok(sendResultCall, "should post sendResult");
    assert.equal(sendResultCall.args[0].success, false);
    assert.equal(sendResultCall.args[0].provider, "nonexistent");

    const sendMessage = env.chrome.runtime.sendMessage;
    assert.ok(
      sendMessage.calledWith(sinon.match({ status: "failed" })),
      "should send live status 'failed'"
    );
  });

  // ── Generic provider success ──

  it("succeeds for generic provider: sendResult, responseStarted, responseComplete, live status, observer lifecycle", async () => {
    const mockInput = createMockElement("textarea", "ds-input");
    const mockButton = createMockElement("button", "ds-send");
    const mockResponseNode = createMockElement("div", "response");
    mockResponseNode.textContent = "assistant reply";

    const mockBody = {
      querySelectorAll: sinon.stub().callsFake((selector) => {
        if (selector === ".ds-markdown") return [mockResponseNode];
        return [];
      }),
    };

    const env = loadContentScript({
      mockInput,
      mockSendButton: mockButton,
      document: {
        body: mockBody,
        querySelector: sinon.stub().callsFake((selector) => {
          if (selector === "#ds-input") return mockInput;
          if (selector === "#ds-send") return mockButton;
          return null;
        }),
        querySelectorAll: sinon.stub().callsFake((selector) => {
          if (selector === ".ds-markdown") return [mockResponseNode];
          return [];
        }),
      },
      sendHandlers: {
        waitForElement: sinon.stub().callsFake(async (selectors) => {
          if (selectors.includes("#ds-input")) return mockInput;
          return null;
        }),
        waitForElementDeep: sinon.stub().resolves(null),
        setInputValue: sinon.stub().resolves(true),
        clickSendButton: sinon.stub().callsFake(() => {
          mockButton.click();
          return true;
        }),
        clickSendButtonDeep: sinon.stub().returns(true),
        findElement: sinon.stub().returns(null),
        deepQueryAll: sinon.stub().returns([]),
        isElementVisible: sinon.stub().returns(true),
        isElementDisabled: sinon.stub().returns(false),
        getEditableText: sinon.stub().returns(""),
        getStopSelectors: sinon.stub().returns([]),
        countResponseNodes: sinon.stub().returns(1),
        log: sinon.stub(),
      },
      responseDetection: {
        waitForResponseStart: sinon.stub().resolves(true),
        waitForResponseComplete: sinon.stub().callsFake(() => {
          return new Promise((resolve) => setTimeout(() => resolve({}), 50));
        }),
        extractLatestResponse: sinon.stub().returns("assistant reply"),
      },
      transcriptCapture: {
        setCapturingActiveResponse: sinon.stub(),
        pauseManualTurnObserver: sinon.stub(),
        resumeManualTurnObserver: sinon.stub(),
        startManualSendCapture: sinon.stub(),
        startManualTurnCapture: sinon.stub(),
        shouldIgnoreThinkingNode: sinon.stub().returns(false),
        extractTextExcludingThinking: sinon.stub().callsFake((provider, node) => {
          return node.textContent || "";
        }),
      },
    });

    const response = await invokeMessageListener(env, {
      type: "sendPrompt",
      provider: "deepseek",
      prompt: "test prompt",
    });

    assert.equal(response?.ok, true);

    const postMsg = env.parentWindow.postMessage;
    const sendMessage = env.chrome.runtime.sendMessage;

    // ── sendResult success=true ──
    const sendResultCall = postMsg.getCalls().find(
      (c) => c.args[0]?.type === "sendResult"
    );
    assert.ok(sendResultCall, "should post sendResult");
    assert.equal(sendResultCall.args[0].success, true);
    assert.equal(sendResultCall.args[0].provider, "deepseek");

    // ── responseStarted ──
    const startedCall = postMsg.getCalls().find(
      (c) => c.args[0]?.type === "responseStarted"
    );
    assert.ok(startedCall, "should post responseStarted");
    assert.equal(startedCall.args[0].provider, "deepseek");

    // ── Observer pause before send ──
    assert.ok(env.transcriptCapture.setCapturingActiveResponse.calledWith(true),
      "should set capturing active");
    assert.ok(env.transcriptCapture.pauseManualTurnObserver.calledOnce,
      "should pause observer");

    // ── live status: responding ──
    const respondingCall = sendMessage.getCalls().find(
      (c) => c.args[0]?.status === "responding"
    );
    assert.ok(respondingCall, "should send live status 'responding'");

    // ── Wait for responseComplete chain ──
    await waitForResponseChain(env);
    // Extra tick for the .then() after waitForResponseComplete
    await new Promise((r) => setTimeout(r, 100));

    // ── responseComplete posted ──
    const completedCall = postMsg.getCalls().find(
      (c) => c.args[0]?.type === "responseComplete"
    );
    assert.ok(completedCall, "should post responseComplete");

    // ── live status: completed ──
    const completedStatusCall = sendMessage.getCalls().find(
      (c) => c.args[0]?.status === "completed"
    );
    assert.ok(completedStatusCall, "should send live status 'completed'");

    // ── Observer resumed with provider name ──
    assert.ok(
      env.transcriptCapture.resumeManualTurnObserver.calledWith("deepseek"),
      "should resume observer with provider name"
    );

    // ── session:transcript-provider-turn sent ──
    const providerTurnCall = sendMessage.getCalls().find(
      (c) => c.args[0]?.type === "session:transcript-provider-turn"
    );
    assert.ok(providerTurnCall, "should send provider turn to background");
    assert.equal(providerTurnCall.args[0].provider, "deepseek");
    assert.equal(providerTurnCall.args[0].role, "assistant");
    assert.equal(providerTurnCall.args[0].content, "assistant reply");
    assert.equal(providerTurnCall.args[0].status, "completed");
  });

  // ── Input not found → retry → fail ──

  it("retries when input not found, then fails after max retries", async () => {
    const env = loadContentScript({
      sendHandlers: {
        waitForElement: sinon.stub().resolves(null),
        waitForElementDeep: sinon.stub().resolves(null),
        setInputValue: sinon.stub().resolves(true),
        clickSendButton: sinon.stub().returns(true),
        clickSendButtonDeep: sinon.stub().returns(true),
        findElement: sinon.stub().returns(null),
        deepQueryAll: sinon.stub().returns([]),
        isElementVisible: sinon.stub().returns(true),
        isElementDisabled: sinon.stub().returns(false),
        getEditableText: sinon.stub().returns(""),
        getStopSelectors: sinon.stub().returns([]),
        countResponseNodes: sinon.stub().returns(0),
        log: sinon.stub(),
      },
    });

    const response = await invokeMessageListener(env, {
      type: "sendPrompt",
      provider: "deepseek",
      prompt: "test",
    });

    assert.equal(response?.ok, false);
    assert.equal(env.sendHandlers.waitForElement.callCount, 3, "should retry 3x (initial + 2)");
    assert.equal(env.sendHandlers.clickSendButton.callCount, 0, "no click should happen");

    const sendMessage = env.chrome.runtime.sendMessage;
    assert.ok(
      sendMessage.calledWith(sinon.match({ status: "failed" })),
      "should send live status 'failed'"
    );
  });

  // ── Grok: response not detected → interrupted ──

  it("grok: response start not detected → interrupted status + observer resume", async () => {
    const mockInput = createMockElement("textarea", "grok-input");
    const mockButton = createMockElement("button", "grok-send");

    const env = loadContentScript({
      mockInput,
      mockSendButton: mockButton,
      sendHandlers: {
        waitForElement: sinon.stub().callsFake(async (selectors) => {
          if (selectors.includes("#grok-input")) return mockInput;
          return null;
        }),
        waitForElementDeep: sinon.stub().resolves(null),
        setInputValue: sinon.stub().resolves(true),
        clickSendButton: sinon.stub().returns(true),
        clickSendButtonDeep: sinon.stub().returns(true),
        findElement: sinon.stub().returns(null),
        deepQueryAll: sinon.stub().returns([]),
        isElementVisible: sinon.stub().returns(true),
        isElementDisabled: sinon.stub().returns(false),
        getEditableText: sinon.stub().returns(""),
        getStopSelectors: sinon.stub().returns([]),
        countResponseNodes: sinon.stub().returns(0),
        sendGrokMessage: sinon.stub().resolves(true),
        log: sinon.stub(),
      },
      responseDetection: {
        waitForResponseStart: sinon.stub().resolves(false),
        waitForResponseComplete: sinon.stub().resolves({}),
        extractLatestResponse: sinon.stub().returns(""),
      },
    });

    const response = await invokeMessageListener(env, {
      type: "sendPrompt",
      provider: "grok",
      prompt: "test grok",
    });

    assert.equal(response?.ok, false);

    const postMsg = env.parentWindow.postMessage;
    const sendResults = postMsg.getCalls().filter(
      (c) => c.args[0]?.type === "sendResult"
    );
    assert.ok(sendResults.length >= 2, `expected ≥2 sendResult, got ${sendResults.length}`);
    assert.equal(sendResults[0].args[0].success, true, "first: success");
    assert.equal(sendResults[sendResults.length - 1].args[0].success, false, "last: failure");

    const sendMessage = env.chrome.runtime.sendMessage;
    assert.ok(
      sendMessage.calledWith(sinon.match({ status: "interrupted" })),
      "should send live status 'interrupted'"
    );

    assert.ok(
      env.transcriptCapture.setCapturingActiveResponse.calledWith(false),
      "should unset capturing"
    );
    assert.ok(
      env.transcriptCapture.resumeManualTurnObserver.calledWith("grok"),
      "should resume observer with 'grok'"
    );
  });

  // ── Non-sendPrompt messages are ignored ──

  it("ignores messages that are not sendPrompt", () => {
    const env = loadContentScript();
    const listener = env.messageListeners[0];

    const result = listener({ type: "something-else" }, {}, () => {});
    assert.equal(result, undefined, "should return undefined for non-sendPrompt messages");
  });

  // ── Window message entry point ──

  it("registers window message listener for multi-ai sendPrompt", () => {
    const env = loadContentScript();
    const msgListener = env.windowObj.addEventListener.getCalls().find(
      (c) => c.args[0] === "message"
    );
    assert.ok(msgListener, "should register window 'message' listener");
  });
});
