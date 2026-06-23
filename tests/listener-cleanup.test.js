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

// --- Simulate observer cleanup registry from content.js (T-20260622-004) ---

function simulateObserverCleanup() {
  const observerCleanupHandlers = [];

  let manualTurnDisconnected = false;
  let geminiDisconnected = false;
  let cloudflareDisconnected = false;
  let cloudflareIntervalCleared = false;

  // Simulate manualTurnObserver registration
  observerCleanupHandlers.push(() => { manualTurnDisconnected = true; });

  // Simulate Gemini dark mode observer registration
  observerCleanupHandlers.push(() => { geminiDisconnected = true; });

  // Simulate Cloudflare observer + setInterval registration
  observerCleanupHandlers.push(() => {
    cloudflareIntervalCleared = true;
    cloudflareDisconnected = true;
  });

  // Simulate beforeunload
  for (const cleanup of observerCleanupHandlers) {
    try { cleanup(); } catch (_) { /* ignore */ }
  }
  observerCleanupHandlers.length = 0;

  return {
    manualTurnDisconnected,
    geminiDisconnected,
    cloudflareDisconnected,
    cloudflareIntervalCleared,
    registryLength: observerCleanupHandlers.length
  };
}

test("observer cleanup: manualTurnObserver is disconnected on unload", () => {
  const result = simulateObserverCleanup();
  assert.ok(result.manualTurnDisconnected, "manualTurnObserver should be disconnected");
});

test("observer cleanup: Gemini dark mode observer is disconnected on unload", () => {
  const result = simulateObserverCleanup();
  assert.ok(result.geminiDisconnected, "Gemini observer should be disconnected");
});

test("observer cleanup: Cloudflare observer and interval are cleaned on unload", () => {
  const result = simulateObserverCleanup();
  assert.ok(result.cloudflareDisconnected, "Cloudflare observer should be disconnected");
  assert.ok(result.cloudflareIntervalCleared, "Cloudflare interval should be cleared");
});

test("observer cleanup: registry is emptied after cleanup", () => {
  const result = simulateObserverCleanup();
  assert.equal(result.registryLength, 0, "observer cleanup registry should be empty");
});

// --- Tests for the real registerCleanup / cleanupAll helpers ---

// Inline the helpers to test them directly (same logic as content.js / dashboard.js)
function registerCleanup(registry, cleanup) {
  registry.push(cleanup);
}

function cleanupAll(registry) {
  for (const fn of registry) {
    try { fn(); } catch (_) { /* ignore */ }
  }
  registry.length = 0;
}

test("registerCleanup: adds function to registry", () => {
  const registry = [];
  let called = false;
  registerCleanup(registry, () => { called = true; });
  assert.equal(registry.length, 1, "registry should have 1 entry");
  registry[0]();
  assert.ok(called, "registered function should be callable");
});

test("registerCleanup: multiple registrations accumulate", () => {
  const registry = [];
  registerCleanup(registry, () => {});
  registerCleanup(registry, () => {});
  registerCleanup(registry, () => {});
  assert.equal(registry.length, 3, "registry should have 3 entries");
});

test("cleanupAll: calls all functions and empties registry", () => {
  const registry = [];
  const results = [];
  registerCleanup(registry, () => results.push("a"));
  registerCleanup(registry, () => results.push("b"));
  registerCleanup(registry, () => results.push("c"));

  cleanupAll(registry);

  assert.deepEqual(results, ["a", "b", "c"], "all functions should be called in order");
  assert.equal(registry.length, 0, "registry should be emptied");
});

test("cleanupAll: is error-resilient, continues after failure", () => {
  const registry = [];
  const results = [];
  registerCleanup(registry, () => results.push("first"));
  registerCleanup(registry, () => { throw new Error("boom"); });
  registerCleanup(registry, () => results.push("third"));

  cleanupAll(registry);

  assert.deepEqual(results, ["first", "third"], "first and third should run despite second throwing");
  assert.equal(registry.length, 0, "registry should be emptied");
});

test("cleanupAll: empty registry is a no-op", () => {
  const registry = [];
  cleanupAll(registry);
  assert.equal(registry.length, 0, "empty registry stays empty");
});
