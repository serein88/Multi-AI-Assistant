const test = require("node:test");
const assert = require("node:assert/strict");
const providersModule = require("../../providers.js");
const {
  normalizeChildSessionBinding,
  isSessionProviderSupported,
  shouldIgnoreChildSessionUrl
} = require("../../session/provider-session-bindings.js");

const SUPPORTED_SESSION_PROVIDERS = [
  { provider: "deepseek", url: "https://chat.deepseek.com/app?session=123" },
  { provider: "gemini", url: "https://gemini.google.com/chat/flow" },
  { provider: "grok", url: "https://www.grok.com/ai" },
  { provider: "grok", url: "https://grok.com/ai" }
];

test("normalizeChildSessionBinding marks each supported provider url as recoverable", () => {
  SUPPORTED_SESSION_PROVIDERS.forEach(({ provider, url }) => {
    const binding = normalizeChildSessionBinding({
      provider,
      url,
      title: `${provider} title`,
      tabId: 42,
      now: "2026-04-12T12:00:00.000Z"
    });

    assert.equal(binding.provider, provider);
    assert.equal(binding.url, url);
    assert.equal(binding.recoverable, true, `expected ${provider} to be recoverable`);
  });
});

test("normalizeChildSessionBinding marks login urls as non-recoverable", () => {
  const binding = normalizeChildSessionBinding({
    provider: "grok",
    url: "https://grok.com/login?next=/app",
    title: "Grok Login"
  });

  assert.equal(binding.recoverable, false);
});

test("normalizeChildSessionBinding marks challenge urls as non-recoverable", () => {
  const binding = normalizeChildSessionBinding({
    provider: "deepseek",
    url: "https://chat.deepseek.com/room#challenge",
    title: "DeepSeek Challenge"
  });

  assert.equal(binding.recoverable, false);
});

test("normalizeChildSessionBinding treats empty urls as non-recoverable", () => {
  const binding = normalizeChildSessionBinding({
    provider: "gemini",
    url: "",
    title: "Gemini Empty"
  });

  assert.equal(binding.recoverable, false);
});

test("shouldIgnoreChildSessionUrl rejects Gemini internal frame urls", () => {
  assert.equal(
    shouldIgnoreChildSessionUrl("gemini", "https://gemini.google.com/_/bscframe"),
    true
  );
  assert.equal(
    shouldIgnoreChildSessionUrl("gemini", "https://gemini.google.com/app"),
    false
  );
});

test("normalizeChildSessionBinding marks Gemini internal frame urls as non-recoverable", () => {
  const binding = normalizeChildSessionBinding({
    provider: "gemini",
    url: "https://gemini.google.com/_/bscframe",
    title: "Gemini Internal Frame",
    tabId: 9
  });

  assert.equal(binding.recoverable, false);
});

test("normalizeChildSessionBinding normalizes fallback title and tabId", () => {
  const binding = normalizeChildSessionBinding({
    provider: "grok",
    url: "https://www.grok.com/app",
    tabId: "invalid",
    title: ""
  });

  assert.equal(binding.tabId, null);
  assert.equal(binding.title, "grok");
});

test("normalizeChildSessionBinding rejects mismatched provider and url domains", () => {
  const binding = normalizeChildSessionBinding({
    provider: "gemini",
    url: "https://chat.deepseek.com/app?session=wrong",
    title: "Wrong Domain",
    tabId: 3
  });

  assert.equal(binding.recoverable, false);
});

test("isSessionProviderSupported rejects unsupported providers", () => {
  assert.equal(isSessionProviderSupported("chatgpt"), false);
});

test("providers.js exports the session provider allowlist", () => {
  assert.deepEqual(providersModule.SESSION_PROVIDER_IDS, [
    "deepseek",
    "gemini",
    "grok"
  ]);
});
