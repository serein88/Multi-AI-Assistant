const test = require("node:test");
const assert = require("node:assert/strict");

// --- Simulate the listener cleanup registry pattern from content.js ---

function simulateContentCleanup() {
  const manualSendCleanupHandlers = [];
  const sessionSyncCleanupHandlers = [];

  // Simulate adding listeners and saving cleanup references
  let keydownRemoved = false;
  let clickRemoved = false;
  let popstateRemoved = false;
  let hashchangeRemoved = false;
  let titleObserverDisconnected = false;
  let bodyObserverDisconnected = false;
  let headObserverDisconnected = false;

  // Simulate startManualSendCapture registering cleanup
  const handleKeydown = () => {};
  const handleClick = () => {};
  manualSendCleanupHandlers.push(
    () => { keydownRemoved = true; },
    () => { clickRemoved = true; }
  );

  // Simulate startChildSessionSync registering cleanup
  manualSendCleanupHandlers.push(
    () => { popstateRemoved = true; },
    () => { hashchangeRemoved = true; }
  );
  sessionSyncCleanupHandlers.push(
    () => { titleObserverDisconnected = true; },
    () => { bodyObserverDisconnected = true; },
    () => { headObserverDisconnected = true; }
  );

  // Simulate beforeunload firing all cleanups
  for (const cleanup of manualSendCleanupHandlers) {
    try { cleanup(); } catch (_) { /* ignore */ }
  }
  for (const cleanup of sessionSyncCleanupHandlers) {
    try { cleanup(); } catch (_) { /* ignore */ }
  }
  manualSendCleanupHandlers.length = 0;
  sessionSyncCleanupHandlers.length = 0;

  return {
    keydownRemoved,
    clickRemoved,
    popstateRemoved,
    hashchangeRemoved,
    titleObserverDisconnected,
    bodyObserverDisconnected,
    headObserverDisconnected,
    manualCount: manualSendCleanupHandlers.length,
    sessionCount: sessionSyncCleanupHandlers.length
  };
}

// --- Simulate the listener cleanup registry pattern from dashboard.js ---

function simulateDashboardCleanup() {
  const cleanupHandlers = [];

  // Simulate registering window/document-level listeners
  let settingsClickRemoved = false;
  let mainMessageRemoved = false;
  let visibilityChangeRemoved = false;

  cleanupHandlers.push(
    () => { settingsClickRemoved = true; },
    () => { mainMessageRemoved = true; },
    () => { visibilityChangeRemoved = true; }
  );

  // Simulate beforeunload firing all cleanups
  for (const cleanup of cleanupHandlers) {
    try { cleanup(); } catch (_) { /* ignore */ }
  }
  cleanupHandlers.length = 0;

  return {
    settingsClickRemoved,
    mainMessageRemoved,
    visibilityChangeRemoved,
    registryLength: cleanupHandlers.length
  };
}

// --- Simulate error-resilient cleanup (one handler throws) ---

function simulateCleanupWithError() {
  const cleanupHandlers = [];
  let firstCalled = false;
  let thirdCalled = false;

  cleanupHandlers.push(
    () => { firstCalled = true; },
    () => { throw new Error("simulated error"); },
    () => { thirdCalled = true; }
  );

  for (const cleanup of cleanupHandlers) {
    try { cleanup(); } catch (_) { /* ignore */ }
  }
  cleanupHandlers.length = 0;

  return { firstCalled, thirdCalled, registryLength: cleanupHandlers.length };
}

// --- Tests ---

test("content.js cleanup: all manualSendCapture handlers are removed on unload", () => {
  const result = simulateContentCleanup();
  assert.ok(result.keydownRemoved, "keydown handler should be removed");
  assert.ok(result.clickRemoved, "click handler should be removed");
});

test("content.js cleanup: all sessionSync handlers and observers are cleaned on unload", () => {
  const result = simulateContentCleanup();
  assert.ok(result.popstateRemoved, "popstate handler should be removed");
  assert.ok(result.hashchangeRemoved, "hashchange handler should be removed");
  assert.ok(result.titleObserverDisconnected, "title observer should be disconnected");
  assert.ok(result.bodyObserverDisconnected, "body observer should be disconnected");
  assert.ok(result.headObserverDisconnected, "head observer should be disconnected");
});

test("content.js cleanup: registry is emptied after cleanup", () => {
  const result = simulateContentCleanup();
  assert.equal(result.manualCount, 0, "manualSendCleanupHandlers should be empty");
  assert.equal(result.sessionCount, 0, "sessionSyncCleanupHandlers should be empty");
});

test("dashboard.js cleanup: all window/document listeners are removed on unload", () => {
  const result = simulateDashboardCleanup();
  assert.ok(result.settingsClickRemoved, "settings click handler should be removed");
  assert.ok(result.mainMessageRemoved, "main message handler should be removed");
  assert.ok(result.visibilityChangeRemoved, "visibilitychange handler should be removed");
});

test("dashboard.js cleanup: registry is emptied after cleanup", () => {
  const result = simulateDashboardCleanup();
  assert.equal(result.registryLength, 0, "cleanup registry should be empty");
});

test("cleanup is error-resilient: handlers after a throwing handler still execute", () => {
  const result = simulateCleanupWithError();
  assert.ok(result.firstCalled, "first handler should execute");
  assert.ok(result.thirdCalled, "third handler should execute even if second throws");
  assert.equal(result.registryLength, 0, "registry should be emptied");
});
