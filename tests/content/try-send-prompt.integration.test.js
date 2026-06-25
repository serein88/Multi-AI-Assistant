"use strict";

/**
 * Integration tests for content/content.js — trySendPrompt message flow
 *
 * Loads content.js in a VM context with mocked Chrome APIs, provider configs,
 * send handlers, and response detection. Tests the full chain from
 * chrome.runtime.onMessage listener → trySendPrompt → postSendResult / live status.
 */

const { describe, it, beforeEach } = require("node:test");
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
  const sentMessages = [];
  const postMessages = [];
  const liveStatusCalls = [];

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
    querySelector: sinon.stub().callsFake((selector) => {
      if (selector === "#ds-input" || selector === "#grok-input") return mockInput;
      if (selector === "#ds-send" || selector === "#grok-send") return mockSendButton;
      return documentOverrides.querySelector?.(selector) || null;
    }),
    querySelectorAll: sinon.stub().returns([]),
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
    parent: parentWindow,
    ...windowOverrides,
  };
  // Make parent !== window to enable postToDashboard
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
    sentMessages,
    postMessages,
    liveStatusCalls,
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
 * Returns a promise that resolves with the sendResponse value.
 */
function invokeMessageListener(env, message, sender = {}) {
  const listener = env.messageListeners[0];
  assert.ok(listener, "content.js should register a runtime.onMessage listener");

  let responseValue;
  const sendResponse = sinon.stub().callsFake((val) => {
    responseValue = val;
  });

  const keepChannel = listener(message, sender, sendResponse);
  assert.equal(keepChannel, true, "listener should return true to keep channel open");

  // Wait for the async trySendPrompt to complete
  // (config-not-loaded test needs > 5s for CONFIG_READY_TIMEOUT_MS)
  return new Promise((resolve) => {
    setTimeout(() => resolve(responseValue), 200);
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("content.js trySendPrompt integration", () => {
  // ── Config not loaded ──

  it("returns false and posts failed status when configs not loaded", async () => {
    const env = loadContentScript({
      providerConfigs: {
        ready: false,
        readyPromise: Promise.resolve(false), // resolves false immediately
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
    assert.ok(postMsg.called, "should post to dashboard");
    const sendResultCall = postMsg.getCalls().find(
      (c) => c.args[0]?.type === "sendResult"
    );
    assert.ok(sendResultCall, "should post sendResult");
    assert.equal(sendResultCall.args[0].success, false);
    // live status = failed
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
  });

  // ── Generic provider success ──

  it("succeeds for generic provider with textarea + button click", async () => {
    const mockInput = createMockElement("textarea", "ds-input");
    const mockButton = createMockElement("button", "ds-send");

    const env = loadContentScript({
      mockInput,
      mockSendButton: mockButton,
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
        countResponseNodes: sinon.stub().returns(0),
        log: sinon.stub(),
      },
    });

    const response = await invokeMessageListener(env, {
      type: "sendPrompt",
      provider: "deepseek",
      prompt: "test prompt",
    });

    assert.equal(response?.ok, true);

    // sendResult posted with success=true
    const postMsg = env.parentWindow.postMessage;
    const sendResultCall = postMsg.getCalls().find(
      (c) => c.args[0]?.type === "sendResult"
    );
    assert.ok(sendResultCall, "should post sendResult");
    assert.equal(sendResultCall.args[0].success, true);
    assert.equal(sendResultCall.args[0].provider, "deepseek");

    // responseStarted posted
    const startedCall = postMsg.getCalls().find(
      (c) => c.args[0]?.type === "responseStarted"
    );
    assert.ok(startedCall, "should post responseStarted");

    // live status: responding then completed
    const sendMessage = env.chrome.runtime.sendMessage;
    const respondingCall = sendMessage.getCalls().find(
      (c) => c.args[0]?.status === "responding"
    );
    assert.ok(respondingCall, "should send live status 'responding'");

    // Observer paused then resumed
    assert.ok(env.transcriptCapture.setCapturingActiveResponse.calledWith(true));
    assert.ok(env.transcriptCapture.pauseManualTurnObserver.called);
  });

  // ── Input not found → retry → fail ──

  it("retries when input not found, then fails after max retries", async () => {
    const env = loadContentScript({
      sendHandlers: {
        waitForElement: sinon.stub().resolves(null), // never finds input
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

    // waitForElement should be called 3 times (initial + 2 retries)
    assert.equal(env.sendHandlers.waitForElement.callCount, 3);

    // No click should have happened
    assert.equal(env.sendHandlers.clickSendButton.callCount, 0);

    // Failed status sent
    const sendMessage = env.chrome.runtime.sendMessage;
    const failedCall = sendMessage.getCalls().find(
      (c) => c.args[0]?.status === "failed"
    );
    assert.ok(failedCall, "should send live status 'failed'");
  });

  // ── Grok special: no retry, response not detected → interrupted ──

  it("grok: no retry, response start not detected → interrupted", async () => {
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
        waitForResponseStart: sinon.stub().resolves(false), // no response detected
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

    // Should have sent two sendResult: first success=true, then success=false
    const postMsg = env.parentWindow.postMessage;
    const sendResults = postMsg.getCalls().filter(
      (c) => c.args[0]?.type === "sendResult"
    );
    assert.ok(sendResults.length >= 2, `expected ≥2 sendResult, got ${sendResults.length}`);
    assert.equal(sendResults[0].args[0].success, true, "first sendResult should be success");
    assert.equal(sendResults[sendResults.length - 1].args[0].success, false, "last sendResult should be failure");

    // live status = interrupted
    const sendMessage = env.chrome.runtime.sendMessage;
    const interruptedCall = sendMessage.getCalls().find(
      (c) => c.args[0]?.status === "interrupted"
    );
    assert.ok(interruptedCall, "should send live status 'interrupted'");

    // Observer should be resumed after failure
    assert.ok(env.transcriptCapture.setCapturingActiveResponse.calledWith(false));
    assert.ok(env.transcriptCapture.resumeManualTurnObserver.calledWith("grok"));
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
    // The window.addEventListener should have been called with "message"
    const msgListener = env.windowObj.addEventListener.getCalls().find(
      (c) => c.args[0] === "message"
    );
    assert.ok(msgListener, "should register window 'message' listener");
  });
});
