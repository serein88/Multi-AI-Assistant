const test = require("node:test");
const assert = require("node:assert/strict");

// --- Simulate the origin validation logic from content.js ---

function createContentMessageHandler(EXTENSION_ORIGIN) {
  return function handleMessage(event, allowedSources) {
    // Simulate the two message listeners from content.js
    // Listener 1 (getPageUrl): checks event.source + event.origin
    // Listener 2 (sendPrompt): checks event.origin + data.source
    const checks = [];

    // Listener 1 pattern
    const pass1 = event.origin === EXTENSION_ORIGIN;
    checks.push({ listener: "getPageUrl", originPassed: pass1 });

    // Listener 2 pattern
    const pass2 = event.origin === EXTENSION_ORIGIN;
    checks.push({ listener: "sendPrompt", originPassed: pass2 });

    return checks;
  };
}

// --- Simulate the origin validation logic from dashboard.js ---

function createDashboardAllowedOrigins(providers) {
  return new Set(
    (Array.isArray(providers))
      ? providers.map((p) => new URL(p.url).origin)
      : []
  );
}

function createDashboardMessageHandler(allowedOrigins) {
  return function handleMessage(event) {
    return allowedOrigins.has(event.origin);
  };
}

// --- Tests for content.js origin validation ---

test("content.js: accepts message from chrome-extension:// origin", () => {
  const EXTENSION_ORIGIN = "chrome-extension://abcdef123";
  const handler = createContentMessageHandler(EXTENSION_ORIGIN);

  const event = {
    origin: "chrome-extension://abcdef123",
    source: "parentWindow",
    data: { type: "getPageUrl", provider: "deepseek" }
  };

  const results = handler(event);
  assert.ok(results[0].originPassed, "getPageUrl listener should accept extension origin");
  assert.ok(results[1].originPassed, "sendPrompt listener should accept extension origin");
});

test("content.js: rejects message from malicious website origin", () => {
  const EXTENSION_ORIGIN = "chrome-extension://abcdef123";
  const handler = createContentMessageHandler(EXTENSION_ORIGIN);

  const event = {
    origin: "https://evil.com",
    source: "parentWindow",
    data: { type: "sendPrompt", source: "multi-ai", prompt: "malicious" }
  };

  const results = handler(event);
  assert.ok(!results[0].originPassed, "getPageUrl listener should reject evil.com origin");
  assert.ok(!results[1].originPassed, "sendPrompt listener should reject evil.com origin");
});

test("content.js: rejects message from AI site origin (not extension)", () => {
  const EXTENSION_ORIGIN = "chrome-extension://abcdef123";
  const handler = createContentMessageHandler(EXTENSION_ORIGIN);

  const event = {
    origin: "https://chatgpt.com",
    source: "parentWindow",
    data: { type: "sendPrompt", source: "multi-ai", prompt: "hello" }
  };

  const results = handler(event);
  assert.ok(!results[0].originPassed, "getPageUrl listener should reject chatgpt.com origin");
  assert.ok(!results[1].originPassed, "sendPrompt listener should reject chatgpt.com origin");
});

test("content.js: rejects message with empty origin", () => {
  const EXTENSION_ORIGIN = "chrome-extension://abcdef123";
  const handler = createContentMessageHandler(EXTENSION_ORIGIN);

  const event = {
    origin: "",
    source: "parentWindow",
    data: { type: "sendPrompt", source: "multi-ai" }
  };

  const results = handler(event);
  assert.ok(!results[0].originPassed, "getPageUrl listener should reject empty origin");
  assert.ok(!results[1].originPassed, "sendPrompt listener should reject empty origin");
});

test("content.js: rejects message with null origin", () => {
  const EXTENSION_ORIGIN = "chrome-extension://abcdef123";
  const handler = createContentMessageHandler(EXTENSION_ORIGIN);

  const event = {
    origin: null,
    source: "parentWindow",
    data: { type: "sendPrompt", source: "multi-ai" }
  };

  const results = handler(event);
  assert.ok(!results[0].originPassed, "getPageUrl listener should reject null origin");
  assert.ok(!results[1].originPassed, "sendPrompt listener should reject null origin");
});

// --- Tests for dashboard.js origin validation ---

const MOCK_PROVIDERS = [
  { id: "chatgpt", url: "https://chatgpt.com/" },
  { id: "claude", url: "https://claude.ai/" },
  { id: "grok", url: "https://grok.com/" },
  { id: "gemini", url: "https://gemini.google.com/" },
  { id: "copilot", url: "https://copilot.microsoft.com/" },
  { id: "doubao", url: "https://www.doubao.com/" },
  { id: "kimi", url: "https://www.kimi.com/" },
  { id: "deepseek", url: "https://chat.deepseek.com/" },
  { id: "tongyi", url: "https://www.qianwen.com/" },
  { id: "yuanbao", url: "https://yuanbao.tencent.com/" },
  { id: "zhipu", url: "https://chatglm.cn/" },
  { id: "you", url: "https://you.com/" },
  { id: "ima", url: "https://ima.qq.com/" }
];

test("dashboard.js: ALLOWED_IFRAME_ORIGINS contains all 13 provider origins", () => {
  const origins = createDashboardAllowedOrigins(MOCK_PROVIDERS);
  assert.equal(origins.size, 13);
  assert.ok(origins.has("https://chatgpt.com"));
  assert.ok(origins.has("https://claude.ai"));
  assert.ok(origins.has("https://grok.com"));
  assert.ok(origins.has("https://gemini.google.com"));
  assert.ok(origins.has("https://copilot.microsoft.com"));
  assert.ok(origins.has("https://www.doubao.com"));
  assert.ok(origins.has("https://www.kimi.com"));
  assert.ok(origins.has("https://chat.deepseek.com"));
  assert.ok(origins.has("https://www.qianwen.com"));
  assert.ok(origins.has("https://yuanbao.tencent.com"));
  assert.ok(origins.has("https://chatglm.cn"));
  assert.ok(origins.has("https://you.com"));
  assert.ok(origins.has("https://ima.qq.com"));
});

test("dashboard.js: accepts message from known AI site origin", () => {
  const origins = createDashboardAllowedOrigins(MOCK_PROVIDERS);
  const handler = createDashboardMessageHandler(origins);

  assert.ok(handler({ origin: "https://chatgpt.com" }));
  assert.ok(handler({ origin: "https://claude.ai" }));
  assert.ok(handler({ origin: "https://chat.deepseek.com" }));
});

test("dashboard.js: rejects message from unknown origin", () => {
  const origins = createDashboardAllowedOrigins(MOCK_PROVIDERS);
  const handler = createDashboardMessageHandler(origins);

  assert.ok(!handler({ origin: "https://evil.com" }));
  assert.ok(!handler({ origin: "https://malicious-site.com" }));
  assert.ok(!handler({ origin: "" }));
});

test("dashboard.js: rejects message from chrome-extension:// origin", () => {
  const origins = createDashboardAllowedOrigins(MOCK_PROVIDERS);
  const handler = createDashboardMessageHandler(origins);

  // Extension origin is NOT in the allowed iframe origins
  assert.ok(!handler({ origin: "chrome-extension://abcdef123" }));
});

test("dashboard.js: rejects message from similar but wrong domain", () => {
  const origins = createDashboardAllowedOrigins(MOCK_PROVIDERS);
  const handler = createDashboardMessageHandler(origins);

  assert.ok(!handler({ origin: "https://chatgpt.evil.com" }));
  assert.ok(!handler({ origin: "https://notchatgpt.com" }));
  assert.ok(!handler({ origin: "https://claude.ai.evil.com" }));
});

test("dashboard.js: handles empty providers list gracefully", () => {
  const origins = createDashboardAllowedOrigins([]);
  const handler = createDashboardMessageHandler(origins);

  assert.equal(origins.size, 0);
  assert.ok(!handler({ origin: "https://chatgpt.com" }));
});

test("dashboard.js: handles undefined providers list gracefully", () => {
  const origins = createDashboardAllowedOrigins(undefined);
  const handler = createDashboardMessageHandler(origins);

  assert.equal(origins.size, 0);
  assert.ok(!handler({ origin: "https://chatgpt.com" }));
});
