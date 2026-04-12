const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildManagedDashboardUrl,
  createWindowManager,
  normalizeWindowCreatePayload,
  normalizeRestorePlan
} = require("../../session/window-manager.js");

test("buildManagedDashboardUrl appends sessionId to dashboard url", () => {
  const url = buildManagedDashboardUrl({
    baseUrl: "chrome-extension://example/dashboard.html",
    sessionId: "sess_123"
  });

  assert.equal(url, "chrome-extension://example/dashboard.html?sessionId=sess_123");
});

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

test("createManagedSessionWindow forwards urls and focused truthy values", async () => {
  const calls = [];
  const chromeApi = {
    windows: {
      async create(payload) {
        calls.push(payload);
        return { id: 501 };
      }
    }
  };

  const manager = createWindowManager({ chromeApi });
  const urls = ["https://chat.deepseek.com/", "https://gemini.google.com/"];
  const result = await manager.createManagedSessionWindow({
    urls,
    focused: "yes"
  });

  assert.equal(result.id, 501);
  assert.deepEqual(calls[0].url, urls);
  assert.equal(calls[0].focused, true);
});

test("normalizeWindowCreatePayload coerces focused and defaults urls", () => {
  const payload = normalizeWindowCreatePayload({ focused: 1 });
  assert.deepEqual(payload.url, []);
  assert.equal(payload.focused, true);
});

test("normalizeRestorePlan selects recoverable child urls and clears tabIds", () => {
  const session = {
    sessionId: "sess_restore",
    childSessions: {
      deepseek: { provider: "deepseek", url: "https://chat.deepseek.com/a/1", recoverable: true, tabId: 10 },
      gemini: { provider: "gemini", url: "", recoverable: true, tabId: 11 },
      grok: { provider: "grok", url: "https://grok.com/", recoverable: false, tabId: 12 }
    }
  };

  const plan = normalizeRestorePlan(session);

  assert.deepEqual(plan.urls, ["https://chat.deepseek.com/a/1"]);
  assert.equal(plan.clearedChildSessions.deepseek.tabId, null);
  assert.equal(plan.clearedChildSessions.gemini.tabId, null);
  assert.equal(plan.clearedChildSessions.grok.tabId, null);
});

test("normalizeRestorePlan returns restored children without stale tabIds", () => {
  const session = {
    sessionId: "sess_restore",
    childSessions: {
      deepseek: { provider: "deepseek", url: "https://chat.deepseek.com/a/1", recoverable: true, tabId: 10 }
    }
  };

  const plan = normalizeRestorePlan(session);

  assert.equal(plan.restored.length, 1);
  assert.equal(plan.restored[0].tabId, null);
});
