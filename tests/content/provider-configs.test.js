/**
 * Tests for content/provider-configs.js
 *
 * Covers:
 *   - JSON structure validity (all provider keys present, selectors non-empty)
 *   - HOST_MAP completeness (all expected hostname patterns)
 *   - getProviderFromHost() correctness
 *   - Namespace compatibility (__MAI_ProviderConfigs.PROVIDER_CONFIGS accessible)
 *   - Helper functions (getProviderConfig, getProviderConfigs)
 *   - reloadProviderConfigs() updates in-memory config
 */

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const JSON_PATH = path.join(__dirname, "..", "..", "content", "provider-configs.json");
const JS_PATH = path.join(__dirname, "..", "..", "content", "provider-configs.js");

// ── JSON structure tests ─────────────────────────────────────────────────────

describe("provider-configs.json", () => {
  let data;

  beforeEach(() => {
    data = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  });

  it("has providerConfigs and hostMap top-level keys", () => {
    assert.ok(data.providerConfigs, "missing providerConfigs");
    assert.ok(Array.isArray(data.hostMap), "hostMap must be an array");
  });

  const EXPECTED_PROVIDERS = [
    "chatgpt", "claude", "gemini", "copilot", "grok",
    "doubao", "kimi", "ima", "deepseek", "tongyi",
    "yuanbao", "zhipu", "you"
  ];

  for (const provider of EXPECTED_PROVIDERS) {
    it(`[${provider}] has non-empty inputSelectors array`, () => {
      const cfg = data.providerConfigs[provider];
      assert.ok(cfg, `missing config for ${provider}`);
      assert.ok(Array.isArray(cfg.inputSelectors), `${provider}.inputSelectors must be array`);
      assert.ok(cfg.inputSelectors.length > 0, `${provider}.inputSelectors is empty`);
    });

    it(`[${provider}] has non-empty sendButtonSelectors array`, () => {
      const cfg = data.providerConfigs[provider];
      assert.ok(Array.isArray(cfg.sendButtonSelectors), `${provider}.sendButtonSelectors must be array`);
      assert.ok(cfg.sendButtonSelectors.length > 0, `${provider}.sendButtonSelectors is empty`);
    });

    it(`[${provider}] has valid inputType`, () => {
      const cfg = data.providerConfigs[provider];
      assert.ok(
        cfg.inputType === "textarea" || cfg.inputType === "contenteditable",
        `${provider}.inputType must be "textarea" or "contenteditable", got "${cfg.inputType}"`
      );
    });
  }

  it("hostMap has at least one entry per expected provider", () => {
    const mappedIds = new Set(data.hostMap.map((e) => e.id));
    for (const provider of EXPECTED_PROVIDERS) {
      assert.ok(mappedIds.has(provider), `hostMap has no entry for ${provider}`);
    }
  });

  it("hostMap entries have match and id strings", () => {
    for (const entry of data.hostMap) {
      assert.equal(typeof entry.match, "string", "entry.match must be string");
      assert.equal(typeof entry.id, "string", "entry.id must be string");
      assert.ok(entry.match.length > 0, "entry.match must be non-empty");
      assert.ok(entry.id.length > 0, "entry.id must be non-empty");
    }
  });
});

// ── JS module helper tests ───────────────────────────────────────────────────

describe("provider-configs.js helpers", () => {
  let PC;

  beforeEach(async () => {
    // Clear cached namespace
    delete globalThis.__MAI_ProviderConfigs;

    // Stub chrome.runtime.getURL so the IIFE doesn't error in Node
    globalThis.chrome = {
      runtime: {
        getURL: (p) => "chrome-extension://fake/" + p
      }
    };

    // Stub fetch to return real JSON data
    const jsonData = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
    globalThis.fetch = () => Promise.resolve({ ok: true, json: () => jsonData });

    // Clear require cache so the IIFE re-runs
    delete require.cache[JS_PATH];
    require(JS_PATH);
    PC = globalThis.__MAI_ProviderConfigs;

    // Wait for async load to complete
    await PC.readyPromise;
  });

  it("exposes namespace with expected keys", () => {
    assert.ok(PC, "namespace missing");
    assert.equal(typeof PC.getProviderFromHost, "function");
    assert.equal(typeof PC.getProviderConfigs, "function");
    assert.equal(typeof PC.getProviderConfig, "function");
    assert.equal(typeof PC.reloadProviderConfigs, "function");
    assert.equal(typeof PC.loadProviderConfigs, "function");
    assert.ok(PC.readyPromise instanceof Promise, "readyPromise must be a Promise");
  });

  it("getProviderFromHost returns correct provider for known hosts", () => {
    const cases = [
      ["chat.openai.com", "chatgpt"],
      ["chatgpt.com", "chatgpt"],
      ["claude.ai", "claude"],
      ["www.claude.ai", "claude"],
      ["gemini.google.com", "gemini"],
      ["copilot.microsoft.com", "copilot"],
      ["grok.x.ai", "grok"],
      ["grok.com", "grok"],
      ["www.doubao.com", "doubao"],
      ["kimi.moonshot.cn", "kimi"],
      ["www.kimi.com", "kimi"],
      ["chat.deepseek.com", "deepseek"],
      ["tongyi.aliyun.com", "tongyi"],
      ["www.qianwen.com", "tongyi"],
      ["yuanbao.tencent.com", "yuanbao"],
      ["chatglm.cn", "zhipu"],
      ["you.com", "you"],
      ["ima.qq.com", "ima"],
    ];
    for (const [host, expected] of cases) {
      const result = PC.getProviderFromHost(host);
      assert.equal(result, expected, `host "${host}" → expected "${expected}", got "${result}"`);
    }
  });

  it("getProviderFromHost returns empty string for unknown host", () => {
    assert.equal(PC.getProviderFromHost("random-site.com"), "");
    assert.equal(PC.getProviderFromHost(""), "");
  });

  it("getProviderConfig returns null for unknown/empty provider", () => {
    assert.equal(PC.getProviderConfig("nonexistent"), null);
    assert.equal(PC.getProviderConfig(""), null);
    assert.equal(PC.getProviderConfig(null), null);
  });

  it("getProviderConfig returns config for known provider", () => {
    const cfg = PC.getProviderConfig("chatgpt");
    assert.ok(cfg, "chatgpt config should exist");
    assert.ok(Array.isArray(cfg.inputSelectors), "chatgpt inputSelectors should be array");
    assert.ok(cfg.inputSelectors.length > 0, "chatgpt inputSelectors should be non-empty");
    assert.ok(Array.isArray(cfg.sendButtonSelectors), "chatgpt sendButtonSelectors should be array");
  });

  it("getProviderConfigs returns the full PROVIDER_CONFIGS object", () => {
    const cfgs = PC.getProviderConfigs();
    assert.equal(typeof cfgs, "object");
    assert.ok(cfgs !== null);
    assert.ok(Object.keys(cfgs).length > 0, "should have providers after load");
  });

  it("PROVIDER_CONFIGS is populated after JSON load", () => {
    assert.ok(Object.keys(PC.PROVIDER_CONFIGS).length > 0, "should have providers after load");
  });

  it("HOST_MAP is populated after JSON load", () => {
    assert.ok(PC.HOST_MAP.length > 0, "should have host entries after load");
  });

  it("ready is true after JSON load", () => {
    assert.equal(PC.ready, true);
  });
});

// ── Reload simulation tests ──────────────────────────────────────────────────

describe("provider-configs.js reload", () => {
  let PC;
  let fetchCount;

  beforeEach(async () => {
    delete globalThis.__MAI_ProviderConfigs;

    globalThis.chrome = {
      runtime: {
        getURL: (p) => "chrome-extension://fake/" + p
      }
    };

    // First call: empty config; second call (reload): real data
    fetchCount = 0;
    globalThis.fetch = () => {
      fetchCount++;
      if (fetchCount === 1) {
        return Promise.resolve({ ok: true, json: () => ({ providerConfigs: {}, hostMap: [] }) });
      }
      return Promise.resolve({
        ok: true,
        json: () => ({
          providerConfigs: { chatgpt: { inputSelectors: ["#x"], sendButtonSelectors: ["#y"], inputType: "textarea" } },
          hostMap: [{ match: "openai", id: "chatgpt" }]
        })
      });
    };

    delete require.cache[JS_PATH];
    require(JS_PATH);
    PC = globalThis.__MAI_ProviderConfigs;

    // Wait for initial load
    await PC.readyPromise;
  });

  it("reloadProviderConfigs updates in-memory config", async () => {
    // Wait for initial load
    await PC.readyPromise;
    assert.equal(PC.ready, true);
    assert.deepEqual(PC.PROVIDER_CONFIGS, {});

    // Reload with new data
    const ok = await PC.reloadProviderConfigs();
    assert.equal(ok, true);
    assert.ok(PC.PROVIDER_CONFIGS.chatgpt, "chatgpt should exist after reload");
    assert.deepEqual(PC.PROVIDER_CONFIGS.chatgpt.inputSelectors, ["#x"]);
    assert.deepEqual(PC.HOST_MAP, [{ match: "openai", id: "chatgpt" }]);
  });

  it("readyPromise resolves true on successful load", async () => {
    const result = await PC.readyPromise;
    assert.equal(result, true);
    assert.equal(PC.ready, true);
  });
});

// ── Failure handling tests ───────────────────────────────────────────────────

describe("provider-configs.js failure handling", () => {
  beforeEach(() => {
    delete globalThis.__MAI_ProviderConfigs;

    globalThis.chrome = {
      runtime: {
        getURL: (p) => "chrome-extension://fake/" + p
      }
    };
  });

  it("readyPromise resolves false on fetch failure", async () => {
    globalThis.fetch = () => Promise.reject(new Error("Network error"));

    delete require.cache[JS_PATH];
    require(JS_PATH);
    const PC = globalThis.__MAI_ProviderConfigs;

    const result = await PC.readyPromise;
    assert.equal(result, false);
    assert.equal(PC.ready, false);
    // Config stays empty — no silent fallback
    assert.deepEqual(PC.PROVIDER_CONFIGS, {});
  });

  it("readyPromise resolves false on HTTP error", async () => {
    globalThis.fetch = () => Promise.resolve({ ok: false, status: 404 });

    delete require.cache[JS_PATH];
    require(JS_PATH);
    const PC = globalThis.__MAI_ProviderConfigs;

    const result = await PC.readyPromise;
    assert.equal(result, false);
    assert.deepEqual(PC.PROVIDER_CONFIGS, {});
  });

  it("readyPromise resolves false when chrome.runtime unavailable", async () => {
    delete globalThis.chrome;

    delete require.cache[JS_PATH];
    require(JS_PATH);
    const PC = globalThis.__MAI_ProviderConfigs;

    const result = await PC.readyPromise;
    assert.equal(result, false);
    assert.deepEqual(PC.PROVIDER_CONFIGS, {});
  });
});

// ── JSON ↔ JS parity ────────────────────────────────────────────────────────

describe("JSON ↔ JS host matching parity", () => {
  let jsonPC;

  beforeEach(() => {
    jsonPC = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  });

  it("every hostMap match string targets a provider in providerConfigs", () => {
    for (const entry of jsonPC.hostMap) {
      assert.ok(
        jsonPC.providerConfigs[entry.id],
        `hostMap entry "${entry.match}" references unknown provider "${entry.id}"`
      );
    }
  });

  it("every providerConfig key has a hostMap entry pointing to it", () => {
    const mappedIds = new Set(jsonPC.hostMap.map((e) => e.id));
    for (const key of Object.keys(jsonPC.providerConfigs)) {
      assert.ok(mappedIds.has(key), `provider "${key}" has no hostMap entry`);
    }
  });
});
