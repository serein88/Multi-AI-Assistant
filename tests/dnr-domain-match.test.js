const test = require("node:test");
const assert = require("node:assert/strict");

// --- Load actual rules.json and providers.js ---

const rules = require("../rules.json");

// providers.js is a plain JS file that assigns to global scope; extract PROVIDERS manually.
const PROVIDERS = [
  { id: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com/" },
  { id: "claude", label: "Claude", url: "https://claude.ai/" },
  { id: "grok", label: "Grok", url: "https://grok.com/" },
  { id: "gemini", label: "Gemini", url: "https://gemini.google.com/" },
  { id: "copilot", label: "Copilot", url: "https://copilot.microsoft.com/" },
  { id: "doubao", label: "豆包", url: "https://www.doubao.com/" },
  { id: "kimi", label: "Kimi", url: "https://www.kimi.com/" },
  { id: "deepseek", label: "DeepSeek", url: "https://chat.deepseek.com/" },
  { id: "tongyi", label: "通义千问", url: "https://www.qianwen.com/" },
  { id: "yuanbao", label: "元宝", url: "https://yuanbao.tencent.com/" },
  { id: "zhipu", label: "智谱AI", url: "https://chatglm.cn/" },
  { id: "you", label: "You.com", url: "https://you.com/" },
  { id: "ima", label: "ima", url: "https://ima.qq.com/" }
];

// --- Helpers ---

// Collect all requestDomains arrays from response-header rules (CSP/XFO removal).
function getResponseHeaderDomains() {
  const domains = new Set();
  for (const rule of rules) {
    if (!rule.condition || !rule.condition.requestDomains) continue;
    if (!rule.action || !rule.action.responseHeaders) continue;
    for (const d of rule.condition.requestDomains) {
      domains.add(d);
    }
  }
  return domains;
}

// Check whether a given hostname would match any rule's requestDomains.
// requestDomains matches the domain AND all its subdomains.
function isCoveredByRequestDomains(hostname, domains) {
  let current = hostname;
  while (current) {
    if (domains.has(current)) return true;
    const dot = current.indexOf(".");
    if (dot === -1) break;
    current = current.slice(dot + 1);
  }
  return false;
}

// --- Positive tests: every provider's domain is covered ---

test("DNR: chatgpt.com is covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(isCoveredByRequestDomains("chatgpt.com", domains));
});

test("DNR: claude.ai is covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(isCoveredByRequestDomains("claude.ai", domains));
});

test("DNR: grok.com is covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(isCoveredByRequestDomains("grok.com", domains));
});

test("DNR: gemini.google.com is covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(isCoveredByRequestDomains("gemini.google.com", domains));
});

test("DNR: copilot.microsoft.com is covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(isCoveredByRequestDomains("copilot.microsoft.com", domains));
});

test("DNR: www.doubao.com is covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(isCoveredByRequestDomains("www.doubao.com", domains));
});

test("DNR: www.kimi.com is covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(isCoveredByRequestDomains("www.kimi.com", domains));
});

test("DNR: chat.deepseek.com is covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(isCoveredByRequestDomains("chat.deepseek.com", domains));
});

test("DNR: www.qianwen.com is covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(isCoveredByRequestDomains("www.qianwen.com", domains));
});

test("DNR: yuanbao.tencent.com is covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(isCoveredByRequestDomains("yuanbao.tencent.com", domains));
});

test("DNR: chatglm.cn is covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(isCoveredByRequestDomains("chatglm.cn", domains));
});

test("DNR: you.com is covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(isCoveredByRequestDomains("you.com", domains));
});

test("DNR: ima.qq.com is covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(isCoveredByRequestDomains("ima.qq.com", domains));
});

// --- Auth domain coverage ---

test("DNR: accounts.google.com (Gemini auth) is covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(isCoveredByRequestDomains("accounts.google.com", domains));
});

test("DNR: auth0.openai.com (ChatGPT auth) is covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(isCoveredByRequestDomains("auth0.openai.com", domains));
});

test("DNR: login.live.com (Copilot auth) is covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(isCoveredByRequestDomains("login.live.com", domains));
});

test("DNR: kimi.moonshot.cn (Kimi legacy) is covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(isCoveredByRequestDomains("kimi.moonshot.cn", domains));
});

test("DNR: a.claude.ai (Claude subdomain) is covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(isCoveredByRequestDomains("a.claude.ai", domains));
});

// --- Negative tests: similar but wrong domains should NOT be covered ---

test("DNR: evil-gemini.google.com.example is NOT covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(!isCoveredByRequestDomains("evil-gemini.google.com.example", domains));
});

test("DNR: notyou.com is NOT covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(!isCoveredByRequestDomains("notyou.com", domains));
});

test("DNR: chatgpt.evil.com is NOT covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(!isCoveredByRequestDomains("chatgpt.evil.com", domains));
});

test("DNR: notchatgpt.com is NOT covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(!isCoveredByRequestDomains("notchatgpt.com", domains));
});

test("DNR: claude.ai.evil.com is NOT covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(!isCoveredByRequestDomains("claude.ai.evil.com", domains));
});

test("DNR: fakeima.qq.com is NOT covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(!isCoveredByRequestDomains("fakeima.qq.com", domains));
});

test("DNR: doubao.com.evil.net is NOT covered", () => {
  const domains = getResponseHeaderDomains();
  assert.ok(!isCoveredByRequestDomains("doubao.com.evil.net", domains));
});

// --- Structural tests ---

test("DNR: all rules use requestDomains (no urlFilter remaining)", () => {
  for (const rule of rules) {
    assert.ok(
      !rule.condition || !rule.condition.urlFilter,
      `Rule ID ${rule.id} still uses urlFilter: "${rule.condition?.urlFilter}"`
    );
  }
});

test("DNR: all response-header rules have non-empty requestDomains", () => {
  for (const rule of rules) {
    if (!rule.action || !rule.action.responseHeaders) continue;
    assert.ok(
      Array.isArray(rule.condition?.requestDomains) && rule.condition.requestDomains.length > 0,
      `Rule ID ${rule.id} response-header rule missing requestDomains`
    );
  }
});

test("DNR: every provider hostname has at least one covering CSP rule", () => {
  const domains = getResponseHeaderDomains();
  const missing = [];
  for (const p of PROVIDERS) {
    const hostname = new URL(p.url).hostname;
    if (!isCoveredByRequestDomains(hostname, domains)) {
      missing.push(`${p.id} (${hostname})`);
    }
  }
  assert.deepEqual(missing, [], `Providers missing DNR coverage: ${missing.join(", ")}`);
});
