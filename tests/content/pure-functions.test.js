/**
 * Unit tests for pure functions in content/content.js
 * These tests cover functions that don't depend on DOM or Chrome APIs
 */

const { test } = require("node:test");
const assert = require("node:assert");

// ==================== Mock Data ====================

const HOST_MAP = [
  { match: "openai", id: "chatgpt" },
  { match: "chatgpt", id: "chatgpt" },
  { match: "claude", id: "claude" },
  { match: "gemini", id: "gemini" },
  { match: "copilot", id: "copilot" },
  { match: "grok", id: "grok" },
  { match: "doubao", id: "doubao" },
  { match: "moonshot", id: "kimi" },
  { match: "kimi.com", id: "kimi" },
  { match: "deepseek", id: "deepseek" },
  { match: "tongyi", id: "tongyi" },
  { match: "qianwen", id: "tongyi" },
  { match: "yuanbao", id: "yuanbao" },
  { match: "chatglm", id: "zhipu" },
  { match: "you.com", id: "you" },
  { match: "ima.qq.com", id: "ima" }
];

const THINKING_SELECTORS = {
  deepseek: [
    "[class*='ds-think-content']",
    ".ds-think-content"
  ],
  gemini: [
    "[class*='thinking']",
    "[class*='reasoning']",
    "[data-testid*='thinking']",
    ".thought-content",
    ".thinking-chip"
  ],
  grok: [
    "[class*='thinking']",
    "[class*='reasoning']",
    "[class*='thought']",
    "[data-testid*='thinking']",
    "[class*='think-block']"
  ]
};

// ==================== Function Under Test ====================

/**
 * Extract provider ID from hostname
 * @param {string} host - hostname to check
 * @returns {string|null} - provider ID or null
 */
function getProviderFromHost(host) {
  const found = HOST_MAP.find((entry) => host.includes(entry.match));
  return found ? found.id : null;
}

/**
 * Get stop button selectors for a provider
 * @param {string} provider - provider ID
 * @returns {string[]} - array of CSS selectors
 */
function getStopSelectors(provider) {
  if (provider === "chatgpt") {
    return [
      'button[data-testid="stop-button"]',
      'button[aria-label*="Stop generating"]',
      'button[aria-label*="Stop generating response"]',
      'button[aria-label*="Stop"]',
      'button[aria-label*="停止生成"]',
      'button[aria-label*="停止"]',
      'button[aria-label*="Pause"]',
      'button[aria-label*="暂停"]',
      'button[aria-label*="停止流式传输"]',
      '[data-testid="stop-generating-button"]',
      'button:has(svg rect)',
      'button:has(svg path[d^="M2 2h20v20H2"])',
      'button:has(svg[data-icon="stop"])'
    ];
  }

  if (provider === "grok") {
    return [
      'button[aria-label*="Stop"]',
      'button[aria-label*="停止"]',
      'button[title*="Stop"]',
      'button[title*="停止"]',
      '[data-testid*="stop"]'
    ];
  }

  if (provider === "deepseek") {
    return [];
  }

  if (provider === "gemini") {
    return [
      'button[aria-label*="停止回答"]',
      'button[aria-label*="Stop response"]',
      'button[aria-label*="Stop"]',
      'button[aria-label*="停止"]',
      'button[data-testid*="stop"]'
    ];
  }

  return [
    'button[aria-label*="Stop"]',
    'button[aria-label*="停止"]',
    'button[aria-label*="停止回答"]',
    'button[aria-label*="暂停"]',
    'button[data-testid*="stop"]',
    'button[aria-label*="Pause"]',
    'button[data-testid="stop-button"]',
    'button[title*="Stop"]',
    'button[title*="停止"]',
    'button[title*="暂停"]',
    '.stop-generating',
    '[class*="stop-generating"]',
    '[class*="StopGenerating"]',
    '[data-testid="stop-generating-button"]',
    'button svg rect',
    'button svg path[d^="M2 2h20v20H2"]',
    'div[role="button"][aria-label*="Stop"]',
    'div[role="button"][aria-label*="停止"]'
  ];
}

/**
 * Check if a node's class or selector matches thinking patterns
 * This is a simplified version for testing (no DOM dependencies)
 * @param {string} provider - provider ID
 * @param {Object} mockNode - mock node with className property
 * @returns {boolean}
 */
function shouldIgnoreThinkingNodeSimplified(provider, mockNode) {
  if (!mockNode) return false;
  const selectors = THINKING_SELECTORS[provider];
  if (!selectors || selectors.length === 0) return false;

  const className = mockNode.className || "";

  // Check if className contains any thinking-related keywords
  for (const sel of selectors) {
    // Extract keyword from selector patterns like:
    // "[class*='thinking']" -> "thinking"
    // ".thinking-chip" -> "thinking-chip"
    // "[data-testid*='thinking']" -> "thinking"
    let keyword = sel;

    // Handle attribute selectors like [class*='thinking']
    const attrMatch = sel.match(/\[class\*=['"]([^'"]+)['"]\]/);
    if (attrMatch) {
      keyword = attrMatch[1];
    } else {
      // Handle class selectors like .thinking-chip
      keyword = sel.replace(/^\./, "");
    }

    if (className.toLowerCase().includes(keyword.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Normalize whitespace in text
 * @param {string} raw - raw text input
 * @returns {string} - normalized text
 */
function normalizeTurnText(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Normalize turn text with provider-specific prefixes removed
 * @param {string} provider - provider ID
 * @param {string} role - "user" or "assistant"
 * @param {string} raw - raw text input
 * @returns {string} - normalized text
 */
function normalizeProviderTurnText(provider, role, raw) {
  let text = normalizeTurnText(raw);
  if (!text) {
    return "";
  }

  if (provider === "gemini") {
    if (role === "user") {
      text = text.replace(/^(你说|You said)\s*/i, "");
    } else if (role === "assistant") {
      text = text.replace(/^(Gemini 说|Gemini said)\s*/i, "");
    }
  }

  return normalizeTurnText(text);
}

/**
 * Check if a mock node should be ignored in manual turn capture
 * @param {Object} mockNode - mock node object
 * @returns {boolean}
 */
function shouldIgnoreManualTurnNodeSimplified(mockNode) {
  if (!mockNode) {
    return true;
  }

  if (mockNode.ariaHidden === "true") {
    return true;
  }

  const className = mockNode.className || "";
  if (
    /\b(?:cdk-visually-hidden|visually-hidden|screen-reader-[^\s]+)\b/.test(className) ||
    /\bscreen-reader\b/.test(className)
  ) {
    return true;
  }

  return false;
}

// ==================== Test Suites ====================

test("getProviderFromHost", async (t) => {
  await t.test("should identify ChatGPT from openai.com", () => {
    assert.strictEqual(getProviderFromHost("openai.com"), "chatgpt");
  });

  await t.test("should identify ChatGPT from chatgpt.com", () => {
    assert.strictEqual(getProviderFromHost("chat.openai.com"), "chatgpt");
  });

  await t.test("should identify Claude from claude.ai", () => {
    assert.strictEqual(getProviderFromHost("claude.ai"), "claude");
  });

  await t.test("should identify Gemini", () => {
    assert.strictEqual(getProviderFromHost("gemini.google.com"), "gemini");
  });

  await t.test("should identify DeepSeek", () => {
    assert.strictEqual(getProviderFromHost("chat.deepseek.com"), "deepseek");
  });

  await t.test("should identify Grok", () => {
    assert.strictEqual(getProviderFromHost("grok.x.ai"), "grok");
  });

  await t.test("should identify Kimi from moonshot", () => {
    assert.strictEqual(getProviderFromHost("kimi.moonshot.cn"), "kimi");
  });

  await t.test("should identify Kimi from kimi.com", () => {
    assert.strictEqual(getProviderFromHost("kimi.com"), "kimi");
  });

  await t.test("should identify Tongyi from qianwen", () => {
    assert.strictEqual(getProviderFromHost("qianwen.aliyun.com"), "tongyi");
  });

  await t.test("should return null for unknown host", () => {
    assert.strictEqual(getProviderFromHost("unknown-ai.com"), null);
  });
});

test("getStopSelectors", async (t) => {
  await t.test("should return ChatGPT-specific selectors", () => {
    const selectors = getStopSelectors("chatgpt");
    assert.ok(Array.isArray(selectors));
    assert.ok(selectors.length > 0);
    assert.ok(selectors.includes('button[data-testid="stop-button"]'));
    assert.ok(selectors.some(s => s.includes("Stop generating")));
  });

  await t.test("should return empty array for DeepSeek", () => {
    const selectors = getStopSelectors("deepseek");
    assert.ok(Array.isArray(selectors));
    assert.strictEqual(selectors.length, 0);
  });

  await t.test("should return Gemini-specific selectors with bilingual support", () => {
    const selectors = getStopSelectors("gemini");
    assert.ok(Array.isArray(selectors));
    assert.ok(selectors.some(s => s.includes("停止回答")));
    assert.ok(selectors.some(s => s.includes("Stop response")));
  });

  await t.test("should return Grok-specific selectors", () => {
    const selectors = getStopSelectors("grok");
    assert.ok(Array.isArray(selectors));
    assert.ok(selectors.some(s => s.includes("Stop")));
    assert.ok(selectors.some(s => s.includes("停止")));
  });

  await t.test("should return generic selectors for unknown provider", () => {
    const selectors = getStopSelectors("unknown");
    assert.ok(Array.isArray(selectors));
    assert.ok(selectors.length > 0);
    assert.ok(selectors.some(s => s.includes("Stop")));
  });
});

test("shouldIgnoreThinkingNodeSimplified", async (t) => {
  await t.test("should return false for null node", () => {
    assert.strictEqual(shouldIgnoreThinkingNodeSimplified("deepseek", null), false);
  });

  await t.test("should return false for provider without thinking selectors", () => {
    const mockNode = { className: "some-class" };
    assert.strictEqual(shouldIgnoreThinkingNodeSimplified("chatgpt", mockNode), false);
  });

  await t.test("should detect DeepSeek thinking content", () => {
    const mockNode = { className: "ds-think-content" };
    assert.strictEqual(shouldIgnoreThinkingNodeSimplified("deepseek", mockNode), true);
  });

  await t.test("should detect Gemini thinking chip", () => {
    const mockNode = { className: "thinking-chip" };
    assert.strictEqual(shouldIgnoreThinkingNodeSimplified("gemini", mockNode), true);
  });

  await t.test("should detect Grok reasoning block", () => {
    const mockNode = { className: "thinking-content" };
    assert.strictEqual(shouldIgnoreThinkingNodeSimplified("grok", mockNode), true);
  });

  await t.test("should not detect non-thinking content", () => {
    const mockNode = { className: "normal-content" };
    assert.strictEqual(shouldIgnoreThinkingNodeSimplified("deepseek", mockNode), false);
  });
});

test("normalizeTurnText", async (t) => {
  await t.test("should collapse multiple spaces", () => {
    assert.strictEqual(normalizeTurnText("hello   world"), "hello world");
  });

  await t.test("should trim leading and trailing whitespace", () => {
    assert.strictEqual(normalizeTurnText("  hello world  "), "hello world");
  });

  await t.test("should normalize newlines to spaces", () => {
    assert.strictEqual(normalizeTurnText("hello\n\nworld"), "hello world");
  });

  await t.test("should handle mixed whitespace", () => {
    assert.strictEqual(normalizeTurnText("hello\t\n  world\r\n!"), "hello world !");
  });

  await t.test("should return empty string for non-string input", () => {
    assert.strictEqual(normalizeTurnText(null), "");
    assert.strictEqual(normalizeTurnText(undefined), "");
    assert.strictEqual(normalizeTurnText(123), "");
  });

  await t.test("should handle empty string", () => {
    assert.strictEqual(normalizeTurnText(""), "");
  });

  await t.test("should handle whitespace-only string", () => {
    assert.strictEqual(normalizeTurnText("   \n\t  "), "");
  });
});

test("normalizeProviderTurnText", async (t) => {
  await t.test("should remove 'You said' prefix for Gemini user turns", () => {
    assert.strictEqual(
      normalizeProviderTurnText("gemini", "user", "You said hello world"),
      "hello world"
    );
  });

  await t.test("should remove '你说' prefix for Gemini user turns (Chinese)", () => {
    assert.strictEqual(
      normalizeProviderTurnText("gemini", "user", "你说 你好世界"),
      "你好世界"
    );
  });

  await t.test("should remove 'Gemini said' prefix for Gemini assistant turns", () => {
    assert.strictEqual(
      normalizeProviderTurnText("gemini", "assistant", "Gemini said Hello!"),
      "Hello!"
    );
  });

  await t.test("should remove 'Gemini 说' prefix for Gemini assistant turns (Chinese)", () => {
    assert.strictEqual(
      normalizeProviderTurnText("gemini", "assistant", "Gemini 说 你好！"),
      "你好！"
    );
  });

  await t.test("should not remove prefix for other providers", () => {
    assert.strictEqual(
      normalizeProviderTurnText("chatgpt", "user", "You said hello"),
      "You said hello"
    );
  });

  await t.test("should normalize whitespace after prefix removal", () => {
    assert.strictEqual(
      normalizeProviderTurnText("gemini", "user", "You said   hello   world"),
      "hello world"
    );
  });

  await t.test("should return empty string for empty input", () => {
    assert.strictEqual(normalizeProviderTurnText("gemini", "user", ""), "");
  });

  await t.test("should handle prefix-only input", () => {
    assert.strictEqual(normalizeProviderTurnText("gemini", "user", "You said"), "");
  });
});

test("shouldIgnoreManualTurnNodeSimplified", async (t) => {
  await t.test("should return true for null node", () => {
    assert.strictEqual(shouldIgnoreManualTurnNodeSimplified(null), true);
  });

  await t.test("should return true for undefined node", () => {
    assert.strictEqual(shouldIgnoreManualTurnNodeSimplified(undefined), true);
  });

  await t.test("should return true for aria-hidden node", () => {
    const mockNode = { ariaHidden: "true", className: "" };
    assert.strictEqual(shouldIgnoreManualTurnNodeSimplified(mockNode), true);
  });

  await t.test("should detect visually-hidden class", () => {
    const mockNode = { className: "visually-hidden" };
    assert.strictEqual(shouldIgnoreManualTurnNodeSimplified(mockNode), true);
  });

  await t.test("should detect cdk-visually-hidden class", () => {
    const mockNode = { className: "cdk-visually-hidden" };
    assert.strictEqual(shouldIgnoreManualTurnNodeSimplified(mockNode), true);
  });

  await t.test("should detect screen-reader class", () => {
    const mockNode = { className: "screen-reader-only" };
    assert.strictEqual(shouldIgnoreManualTurnNodeSimplified(mockNode), true);
  });

  await t.test("should not ignore normal visible nodes", () => {
    const mockNode = { className: "message-content" };
    assert.strictEqual(shouldIgnoreManualTurnNodeSimplified(mockNode), false);
  });

  await t.test("should not ignore nodes with empty className", () => {
    const mockNode = { className: "" };
    assert.strictEqual(shouldIgnoreManualTurnNodeSimplified(mockNode), false);
  });
});
