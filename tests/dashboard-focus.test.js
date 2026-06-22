const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createPromptFocusGuard,
  setFrameFocusShielded
} = require("../dashboard-focus");

function createFakeWindow() {
  const callbacks = [];
  return {
    requestAnimationFrame(callback) {
      callbacks.push(callback);
      return callbacks.length;
    },
    setTimeout(callback) {
      callbacks.push(callback);
      return callbacks.length;
    },
    flush() {
      while (callbacks.length > 0) {
        callbacks.shift()();
      }
    }
  };
}

function createFakeClock(start = 0) {
  let current = start;
  return {
    now() {
      return current;
    },
    advance(ms) {
      current += ms;
    }
  };
}

function createFakeElement(name, documentRef) {
  return {
    name,
    attributes: new Map(),
    dataset: {},
    style: {},
    focusCalls: [],
    getAttribute(attribute) {
      return this.attributes.has(attribute) ? this.attributes.get(attribute) : null;
    },
    hasAttribute(attribute) {
      return this.attributes.has(attribute);
    },
    removeAttribute(attribute) {
      this.attributes.delete(attribute);
    },
    setAttribute(attribute, value) {
      this.attributes.set(attribute, String(value));
    },
    focus(options) {
      this.focusCalls.push(options);
      documentRef.activeElement = this;
    }
  };
}

test("restores prompt focus after a panel action steals focus", () => {
  const documentRef = { activeElement: null, body: {}, documentElement: {} };
  const windowRef = createFakeWindow();
  const promptEl = createFakeElement("prompt", documentRef);
  const refreshButton = createFakeElement("refresh", documentRef);
  const iframe = createFakeElement("iframe", documentRef);
  const guard = createPromptFocusGuard({
    promptEl,
    documentRef,
    windowRef,
    restoreDelaysMs: [0]
  });

  documentRef.activeElement = promptEl;
  assert.equal(guard.captureIfPromptFocused({ allowedActiveElements: [refreshButton] }), true);
  documentRef.activeElement = iframe;

  assert.equal(guard.scheduleRestore({ allowedActiveElements: [iframe] }), true);
  windowRef.flush();

  assert.equal(documentRef.activeElement, promptEl);
  assert.deepEqual(promptEl.focusCalls, [{ preventScroll: true }]);
});

test("does not restore prompt focus when the prompt was not focused before the action", () => {
  const documentRef = { activeElement: null, body: {}, documentElement: {} };
  const windowRef = createFakeWindow();
  const promptEl = createFakeElement("prompt", documentRef);
  const refreshButton = createFakeElement("refresh", documentRef);
  const iframe = createFakeElement("iframe", documentRef);
  const guard = createPromptFocusGuard({
    promptEl,
    documentRef,
    windowRef,
    restoreDelaysMs: [0]
  });

  documentRef.activeElement = refreshButton;
  assert.equal(guard.captureIfPromptFocused({ allowedActiveElements: [refreshButton] }), false);
  documentRef.activeElement = iframe;

  assert.equal(guard.scheduleRestore({ allowedActiveElements: [iframe] }), false);
  windowRef.flush();

  assert.equal(documentRef.activeElement, iframe);
  assert.equal(promptEl.focusCalls.length, 0);
});

test("shields a frame from focus while preserving restorable attributes", () => {
  const documentRef = { activeElement: null, body: {}, documentElement: {} };
  const iframe = createFakeElement("iframe", documentRef);
  iframe.setAttribute("tabindex", "0");

  setFrameFocusShielded(iframe, true);

  assert.equal(iframe.inert, true);
  assert.equal(iframe.getAttribute("tabindex"), "-1");
  assert.equal(iframe.dataset.multiAiPreviousTabindex, "0");
  assert.equal(iframe.dataset.multiAiHadPreviousTabindex, "true");
  assert.equal(iframe.dataset.multiAiFocusShielded, "true");

  setFrameFocusShielded(iframe, false);

  assert.equal(iframe.inert, false);
  assert.equal(iframe.getAttribute("tabindex"), "0");
  assert.equal(Object.hasOwn(iframe.dataset, "multiAiPreviousTabindex"), false);
  assert.equal(Object.hasOwn(iframe.dataset, "multiAiHadPreviousTabindex"), false);
  assert.equal(Object.hasOwn(iframe.dataset, "multiAiFocusShielded"), false);
});

test("removes temporary focus shield attributes when a frame had no previous values", () => {
  const documentRef = { activeElement: null, body: {}, documentElement: {} };
  const iframe = createFakeElement("iframe", documentRef);

  setFrameFocusShielded(iframe, true);
  setFrameFocusShielded(iframe, false);

  assert.equal(iframe.inert, false);
  assert.equal(iframe.hasAttribute("tabindex"), false);
});

test("does not programmatically focus the prompt while focus restoration is blocked", () => {
  const documentRef = { activeElement: null, body: {}, documentElement: {} };
  const windowRef = createFakeWindow();
  const promptEl = createFakeElement("prompt", documentRef);
  const iframe = createFakeElement("iframe", documentRef);
  const guard = createPromptFocusGuard({
    promptEl,
    documentRef,
    windowRef,
    restoreDelaysMs: [0]
  });

  documentRef.activeElement = promptEl;
  guard.captureIfPromptFocused();
  guard.setProgrammaticFocusBlocked(true);
  documentRef.activeElement = iframe;

  assert.equal(guard.scheduleRestore({ allowedActiveElements: [iframe] }), true);
  windowRef.flush();

  assert.equal(documentRef.activeElement, iframe);
  assert.equal(promptEl.focusCalls.length, 0);
});

test("does not steal focus from an unrelated active element", () => {
  const documentRef = { activeElement: null, body: {}, documentElement: {} };
  const windowRef = createFakeWindow();
  const promptEl = createFakeElement("prompt", documentRef);
  const refreshButton = createFakeElement("refresh", documentRef);
  const otherInput = createFakeElement("other-input", documentRef);
  const guard = createPromptFocusGuard({
    promptEl,
    documentRef,
    windowRef,
    restoreDelaysMs: [0]
  });

  documentRef.activeElement = promptEl;
  assert.equal(guard.captureIfPromptFocused({ allowedActiveElements: [refreshButton] }), true);
  documentRef.activeElement = otherInput;

  assert.equal(guard.scheduleRestore(), true);
  windowRef.flush();

  assert.equal(documentRef.activeElement, otherInput);
  assert.equal(promptEl.focusCalls.length, 0);
});

test("restores prompt focus when a loading iframe steals focus after prompt input", () => {
  const documentRef = { activeElement: null, body: {}, documentElement: {} };
  const windowRef = createFakeWindow();
  const clock = createFakeClock();
  const promptEl = createFakeElement("prompt", documentRef);
  const iframe = createFakeElement("iframe", documentRef);
  const guard = createPromptFocusGuard({
    promptEl,
    documentRef,
    windowRef,
    now: clock.now,
    recentPromptMs: 5000,
    restoreDelaysMs: [0]
  });

  documentRef.activeElement = promptEl;
  guard.notePromptInteraction();
  documentRef.activeElement = iframe;

  assert.equal(guard.restoreIfFocusMovedToIframe({ allowedActiveElements: [iframe] }), true);
  windowRef.flush();

  assert.equal(documentRef.activeElement, promptEl);
  assert.deepEqual(promptEl.focusCalls, [{ preventScroll: true }]);
});

test("does not restore iframe focus after the prompt interaction window expires", () => {
  const documentRef = { activeElement: null, body: {}, documentElement: {} };
  const windowRef = createFakeWindow();
  const clock = createFakeClock();
  const promptEl = createFakeElement("prompt", documentRef);
  const iframe = createFakeElement("iframe", documentRef);
  const guard = createPromptFocusGuard({
    promptEl,
    documentRef,
    windowRef,
    now: clock.now,
    recentPromptMs: 5000,
    restoreDelaysMs: [0]
  });

  documentRef.activeElement = promptEl;
  guard.notePromptInteraction();
  clock.advance(5001);
  documentRef.activeElement = iframe;

  assert.equal(guard.restoreIfFocusMovedToIframe({ allowedActiveElements: [iframe] }), false);
  windowRef.flush();

  assert.equal(documentRef.activeElement, iframe);
  assert.equal(promptEl.focusCalls.length, 0);
});
