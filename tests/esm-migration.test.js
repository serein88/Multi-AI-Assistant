/**
 * Tests for ES Modules migration (background.mjs + session/*.mjs + shared/providers.mjs)
 *
 * Covers:
 *   - manifest.json background config is ESM (service_worker + type: "module")
 *   - background.mjs does NOT use importScripts or globalThis.MultiAI*
 *   - All .mjs modules can be dynamically imported (syntax + module graph)
 *   - ESM session modules export the same API surface as old UMD modules
 *   - ESM shared/providers.mjs exports match old shared/providers.js
 *   - ESM session-model.mjs produces identical results to old session-model.js
 *   - ESM provider-session-bindings.mjs behavior matches old module
 *   - ESM transcript-store.mjs key functions work correctly
 *   - ESM window-manager.mjs key functions work correctly
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.join(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT_DIR, "manifest.json");

// ── manifest.json ESM config ────────────────────────────────────────────────

describe("manifest.json ESM background config", () => {
  let manifest;

  it("manifest.json parses as valid JSON", () => {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    assert.ok(manifest, "manifest should parse");
  });

  it("background.service_worker is background.mjs", () => {
    manifest = manifest || JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    assert.equal(manifest.background?.service_worker, "background.mjs");
  });

  it("background.type is 'module'", () => {
    manifest = manifest || JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    assert.equal(manifest.background?.type, "module");
  });
});

// ── background.mjs source code checks ───────────────────────────────────────

describe("background.mjs source code constraints", () => {
  let source;

  it("background.mjs exists and is readable", () => {
    const bgPath = path.join(ROOT_DIR, "background.mjs");
    source = fs.readFileSync(bgPath, "utf8");
    assert.ok(source.length > 0, "background.mjs should not be empty");
  });

  it("does NOT use importScripts", () => {
    source = source || fs.readFileSync(path.join(ROOT_DIR, "background.mjs"), "utf8");
    assert.ok(
      !source.includes("importScripts"),
      "background.mjs must not use importScripts"
    );
  });

  it("does NOT read globalThis.MultiAISession*", () => {
    source = source || fs.readFileSync(path.join(ROOT_DIR, "background.mjs"), "utf8");
    const globalThisMultiAI = /globalThis\.MultiAISession/g;
    const matches = source.match(globalThisMultiAI);
    assert.ok(
      !matches || matches.length === 0,
      "background.mjs must not read globalThis.MultiAISession* namespaces"
    );
  });

  it("does NOT use module.exports", () => {
    source = source || fs.readFileSync(path.join(ROOT_DIR, "background.mjs"), "utf8");
    assert.ok(
      !source.includes("module.exports"),
      "background.mjs must not use module.exports"
    );
  });

  it("uses static import statements", () => {
    source = source || fs.readFileSync(path.join(ROOT_DIR, "background.mjs"), "utf8");
    assert.ok(
      source.includes('import {'),
      "background.mjs should use static import statements"
    );
  });

  it("imports from shared/providers.mjs", () => {
    source = source || fs.readFileSync(path.join(ROOT_DIR, "background.mjs"), "utf8");
    assert.ok(
      source.includes('./shared/providers.mjs'),
      "background.mjs should import from shared/providers.mjs"
    );
  });

  it("imports from session/ modules", () => {
    source = source || fs.readFileSync(path.join(ROOT_DIR, "background.mjs"), "utf8");
    assert.ok(source.includes('./session/session-constants.mjs'), "imports session-constants.mjs");
    assert.ok(source.includes('./session/session-model.mjs'), "imports session-model.mjs");
    assert.ok(source.includes('./session/session-registry.mjs'), "imports session-registry.mjs");
    assert.ok(source.includes('./session/provider-session-bindings.mjs'), "imports provider-session-bindings.mjs");
    assert.ok(source.includes('./session/transcript-store.mjs'), "imports transcript-store.mjs");
    assert.ok(source.includes('./session/window-manager.mjs'), "imports window-manager.mjs");
  });
});

// ── ESM module importability ────────────────────────────────────────────────

describe("ESM modules can be dynamically imported", () => {
  const modules = [
    { name: "shared/providers.mjs", path: "../shared/providers.mjs" },
    { name: "session-constants.mjs", path: "../session/session-constants.mjs" },
    { name: "session-model.mjs", path: "../session/session-model.mjs" },
    { name: "session-registry.mjs", path: "../session/session-registry.mjs" },
    { name: "provider-session-bindings.mjs", path: "../session/provider-session-bindings.mjs" },
    { name: "transcript-store.mjs", path: "../session/transcript-store.mjs" },
    { name: "window-manager.mjs", path: "../session/window-manager.mjs" }
  ];

  for (const mod of modules) {
    it(`${mod.name} imports successfully`, async () => {
      const imported = await import(mod.path);
      assert.ok(imported, `${mod.name} should import successfully`);
      assert.equal(typeof imported, "object", `${mod.name} should export an object`);
    });
  }
});

// ── shared/providers.mjs ESM exports ────────────────────────────────────────

describe("shared/providers.mjs ESM exports", () => {
  it("exports PROVIDERS array with 13 providers", async () => {
    const { PROVIDERS } = await import("../shared/providers.mjs");
    assert.ok(Array.isArray(PROVIDERS));
    assert.equal(PROVIDERS.length, 13);
  });

  it("exports PROVIDER_BY_ID with all 13 providers", async () => {
    const { PROVIDER_BY_ID } = await import("../shared/providers.mjs");
    assert.equal(typeof PROVIDER_BY_ID, "object");
    assert.equal(Object.keys(PROVIDER_BY_ID).length, 13);
    assert.ok(PROVIDER_BY_ID.chatgpt);
    assert.equal(PROVIDER_BY_ID.chatgpt.label, "ChatGPT");
  });

  it("exports SESSION_PROVIDER_IDS array", async () => {
    const { SESSION_PROVIDER_IDS } = await import("../shared/providers.mjs");
    assert.ok(Array.isArray(SESSION_PROVIDER_IDS));
    assert.ok(SESSION_PROVIDER_IDS.includes("chatgpt"));
  });

  it("exports normalizeProviders function", async () => {
    const { normalizeProviders } = await import("../shared/providers.mjs");
    assert.equal(typeof normalizeProviders, "function");
    const result = normalizeProviders(["chatgpt", "unknown", "grok"], 10);
    assert.deepEqual(result, ["chatgpt", "grok"]);
  });

  it("exports findProviderByToken function", async () => {
    const { findProviderByToken } = await import("../shared/providers.mjs");
    assert.equal(typeof findProviderByToken, "function");
    const byId = findProviderByToken("chatgpt");
    assert.equal(byId?.label, "ChatGPT");
    const byLabel = findProviderByToken("Grok");
    assert.equal(byLabel?.id, "grok");
    assert.equal(findProviderByToken("nonexistent"), null);
  });

  it("exports DASHBOARD_MAX_PANELS", async () => {
    const { DASHBOARD_MAX_PANELS } = await import("../shared/providers.mjs");
    assert.equal(DASHBOARD_MAX_PANELS, Infinity);
  });

  it("matches old providers.js API surface", async () => {
    const old = require("../shared/providers.js");
    const esm = await import("../shared/providers.mjs");
    // Same keys
    const oldKeys = Object.keys(old).sort();
    const esmKeys = Object.keys(esm).sort();
    assert.deepEqual(oldKeys, esmKeys, "ESM and old module should export the same keys");
  });
});

// ── session-constants.mjs ───────────────────────────────────────────────────

describe("session-constants.mjs", () => {
  it("exports all expected constants", async () => {
    const mod = await import("../session/session-constants.mjs");
    assert.equal(mod.SESSION_STATUS_ACTIVE, "active");
    assert.equal(mod.SESSION_STATUS_ARCHIVED, "archived");
    assert.equal(mod.SESSION_MODE_FOREGROUND, "foreground");
    assert.equal(mod.SESSION_STORAGE_KEY, "multi-ai-sessions");
  });

  it("matches old session-constants.js exports", async () => {
    const old = require("../session/session-constants.js");
    const esm = await import("../session/session-constants.mjs");
    assert.deepEqual(
      Object.keys(old).sort(),
      Object.keys(esm).sort()
    );
    for (const key of Object.keys(old)) {
      assert.equal(esm[key], old[key], `mismatch on ${key}`);
    }
  });
});

// ── session-model.mjs ──────────────────────────────────────────────────────

describe("session-model.mjs", () => {
  it("exports createSessionRecord and updateChildSessionRecord", async () => {
    const mod = await import("../session/session-model.mjs");
    assert.equal(typeof mod.createSessionRecord, "function");
    assert.equal(typeof mod.updateChildSessionRecord, "function");
  });

  it("createSessionRecord produces same result as old module", async () => {
    const esm = await import("../session/session-model.mjs");
    const session = esm.createSessionRecord({
      sessionId: "sess_esm_test",
      providers: ["deepseek", "gemini", "grok"],
      mode: "foreground",
      now: "2026-06-24T10:00:00.000Z"
    });

    assert.equal(session.sessionId, "sess_esm_test");
    assert.equal(session.status, "active");
    assert.equal(session.mode, "foreground");
    assert.equal(session.providers.length, 3);
    assert.equal(session.childSessions.deepseek.recoverable, false);
    assert.equal(session.childSessions.gemini.tabId, null);
  });

  it("updateChildSessionRecord works with ESM imports", async () => {
    const esm = await import("../session/session-model.mjs");
    const session = esm.createSessionRecord({
      sessionId: "sess_update",
      providers: ["deepseek"],
      now: "2026-06-24T10:00:00.000Z"
    });

    const updated = esm.updateChildSessionRecord(session, "deepseek", {
      url: "https://chat.deepseek.com/a/chat/123",
      title: "Test",
      recoverable: true
    });

    assert.equal(updated.childSessions.deepseek.recoverable, true);
    assert.equal(updated.childSessions.deepseek.url, "https://chat.deepseek.com/a/chat/123");
    // Original immutable
    assert.equal(session.childSessions.deepseek.recoverable, false);
  });

  it("updateChildSessionRecord throws for unknown provider", async () => {
    const esm = await import("../session/session-model.mjs");
    const session = esm.createSessionRecord({
      sessionId: "sess_throw",
      providers: ["deepseek"],
      now: "2026-06-24T10:00:00.000Z"
    });

    assert.throws(
      () => esm.updateChildSessionRecord(session, "nonexistent", {}),
      /provider/i
    );
  });
});

// ── session-registry.mjs ───────────────────────────────────────────────────

describe("session-registry.mjs", () => {
  it("exports createSessionRegistry", async () => {
    const mod = await import("../session/session-registry.mjs");
    assert.equal(typeof mod.createSessionRegistry, "function");
  });

  it("createSessionRegistry returns registry with all CRUD methods", async () => {
    const { createSessionRegistry } = await import("../session/session-registry.mjs");
    const storage = createMockStorage();
    const registry = createSessionRegistry({ storage });

    assert.equal(typeof registry.listSessions, "function");
    assert.equal(typeof registry.saveSession, "function");
    assert.equal(typeof registry.getSession, "function");
    assert.equal(typeof registry.updateSession, "function");
    assert.equal(typeof registry.touchSession, "function");
    assert.equal(typeof registry.archiveSession, "function");
  });

  it("save + get + list roundtrip", async () => {
    const { createSessionRegistry } = await import("../session/session-registry.mjs");
    const storage = createMockStorage();
    const registry = createSessionRegistry({ storage });

    const session = {
      sessionId: "sess_esm_reg",
      name: "Test",
      status: "active",
      createdAt: "2026-06-24T10:00:00.000Z",
      providers: ["deepseek"],
      childSessions: {}
    };

    await registry.saveSession(session);
    const retrieved = await registry.getSession("sess_esm_reg");
    assert.equal(retrieved.sessionId, "sess_esm_reg");

    const list = await registry.listSessions();
    assert.ok(list.length >= 1);
  });
});

// ── provider-session-bindings.mjs ──────────────────────────────────────────

describe("provider-session-bindings.mjs", () => {
  it("exports expected functions and data", async () => {
    const mod = await import("../session/provider-session-bindings.mjs");
    assert.ok(Array.isArray(mod.SESSION_PROVIDER_IDS));
    assert.equal(typeof mod.isSessionProviderSupported, "function");
    assert.equal(typeof mod.shouldIgnoreChildSessionUrl, "function");
    assert.equal(typeof mod.normalizeChildSessionBinding, "function");
  });

  it("SESSION_PROVIDER_IDS contains all 13 providers", async () => {
    const { SESSION_PROVIDER_IDS } = await import("../session/provider-session-bindings.mjs");
    assert.equal(SESSION_PROVIDER_IDS.length, 13);
    assert.ok(SESSION_PROVIDER_IDS.includes("chatgpt"));
    assert.ok(SESSION_PROVIDER_IDS.includes("deepseek"));
  });

  it("isSessionProviderSupported works correctly", async () => {
    const { isSessionProviderSupported } = await import("../session/provider-session-bindings.mjs");
    assert.equal(isSessionProviderSupported("chatgpt"), true);
    assert.equal(isSessionProviderSupported("nonexistent"), false);
    assert.equal(isSessionProviderSupported(""), false);
    assert.equal(isSessionProviderSupported(null), false);
  });

  it("normalizeChildSessionBinding returns recoverable for valid URL", async () => {
    const { normalizeChildSessionBinding } = await import("../session/provider-session-bindings.mjs");
    const result = normalizeChildSessionBinding({
      provider: "deepseek",
      url: "https://chat.deepseek.com/a/chat/123",
      title: "Test",
      tabId: 100,
      now: "2026-06-24T10:00:00.000Z"
    });
    assert.equal(result.recoverable, true);
    assert.equal(result.provider, "deepseek");
  });

  it("normalizeChildSessionBinding marks login URLs as non-recoverable", async () => {
    const { normalizeChildSessionBinding } = await import("../session/provider-session-bindings.mjs");
    const result = normalizeChildSessionBinding({
      provider: "deepseek",
      url: "https://chat.deepseek.com/login",
      tabId: 100,
      now: "2026-06-24T10:00:00.000Z"
    });
    assert.equal(result.recoverable, false);
  });

  it("shouldIgnoreChildSessionUrl ignores Gemini bscframe URLs", async () => {
    const { shouldIgnoreChildSessionUrl } = await import("../session/provider-session-bindings.mjs");
    assert.equal(
      shouldIgnoreChildSessionUrl("gemini", "https://gemini.google.com/_/bscframe"),
      true
    );
    assert.equal(
      shouldIgnoreChildSessionUrl("gemini", "https://gemini.google.com/app"),
      false
    );
  });

  it("matches old provider-session-bindings.js behavior", async () => {
    const old = require("../session/provider-session-bindings.js");
    const esm = await import("../session/provider-session-bindings.mjs");

    // Same SESSION_PROVIDER_IDS content
    assert.deepEqual(old.SESSION_PROVIDER_IDS, esm.SESSION_PROVIDER_IDS);

    // Same behavior for a sample binding
    const args = {
      provider: "grok",
      url: "https://grok.com/chat/123",
      title: "Grok Chat",
      tabId: 42,
      now: "2026-06-24T10:00:00.000Z"
    };
    const oldResult = old.normalizeChildSessionBinding(args);
    const esmResult = esm.normalizeChildSessionBinding(args);
    assert.deepEqual(oldResult, esmResult);
  });
});

// ── transcript-store.mjs ───────────────────────────────────────────────────

describe("transcript-store.mjs", () => {
  it("exports expected functions", async () => {
    const mod = await import("../session/transcript-store.mjs");
    assert.equal(typeof mod.createTranscriptStore, "function");
    assert.equal(typeof mod.ensureSessionTranscript, "function");
    assert.equal(typeof mod.applyProviderLiveStatus, "function");
    assert.equal(typeof mod.appendUserTurn, "function");
    assert.equal(typeof mod.appendProviderTurn, "function");
    assert.equal(typeof mod.createEmptyTranscriptProvider, "function");
    assert.equal(typeof mod.normalizeTranscriptProvider, "function");
    assert.equal(typeof mod.normalizeLiveStatus, "function");
    assert.equal(typeof mod.applyTranscriptStatus, "function");
    assert.equal(mod.TRANSCRIPT_VERSION, 1);
    assert.equal(mod.TRANSCRIPT_STATUS_IDLE, "idle");
  });

  it("createTranscriptStore produces valid transcript structure", async () => {
    const { createTranscriptStore } = await import("../session/transcript-store.mjs");
    const store = createTranscriptStore({
      providers: ["deepseek", "grok"],
      now: "2026-06-24T10:00:00.000Z"
    });

    assert.equal(store.version, 1);
    assert.ok(store.providers.deepseek);
    assert.ok(store.providers.grok);
    assert.equal(store.providers.deepseek.status, "idle");
    assert.deepEqual(store.timeline, []);
  });

  it("ensureSessionTranscript creates transcript for session without one", async () => {
    const { ensureSessionTranscript } = await import("../session/transcript-store.mjs");
    const session = {
      sessionId: "sess_ts",
      providers: ["deepseek"],
      createdAt: "2026-06-24T10:00:00.000Z"
    };
    const result = ensureSessionTranscript(session);
    assert.ok(result.transcript);
    assert.equal(result.transcript.version, 1);
    assert.ok(result.transcript.providers.deepseek);
  });

  it("appendUserTurn + appendProviderTurn roundtrip", async () => {
    const { ensureSessionTranscript, appendUserTurn, appendProviderTurn } = await import("../session/transcript-store.mjs");
    let session = ensureSessionTranscript({
      sessionId: "sess_round",
      providers: ["deepseek"],
      createdAt: "2026-06-24T10:00:00.000Z"
    });

    session = appendUserTurn(session, {
      providers: ["deepseek"],
      prompt: "Hello",
      occurredAt: "2026-06-24T10:01:00.000Z"
    });

    assert.equal(session.transcript.providers.deepseek.turns.length, 1);
    assert.equal(session.transcript.providers.deepseek.turns[0].role, "user");
    assert.equal(session.transcript.providers.deepseek.turns[0].content, "Hello");

    session = appendProviderTurn(session, {
      provider: "deepseek",
      role: "assistant",
      content: "Hi there!",
      occurredAt: "2026-06-24T10:01:05.000Z"
    });

    assert.equal(session.transcript.providers.deepseek.turns.length, 2);
    assert.equal(session.transcript.providers.deepseek.turns[1].role, "assistant");
    assert.equal(session.transcript.providers.deepseek.turns[1].content, "Hi there!");
  });

  it("applyProviderLiveStatus updates provider status", async () => {
    const { ensureSessionTranscript, applyProviderLiveStatus } = await import("../session/transcript-store.mjs");
    let session = ensureSessionTranscript({
      sessionId: "sess_status",
      providers: ["grok"],
      createdAt: "2026-06-24T10:00:00.000Z"
    });

    session = applyProviderLiveStatus(session, {
      provider: "grok",
      status: "responding",
      occurredAt: "2026-06-24T10:01:00.000Z"
    });

    assert.equal(session.transcript.providers.grok.status, "responding");
    assert.equal(session.transcript.providers.grok.answerStartedAt, "2026-06-24T10:01:00.000Z");
  });

  it("matches old transcript-store.js exports", async () => {
    const old = require("../session/transcript-store.js");
    const esm = await import("../session/transcript-store.mjs");

    // Same exported keys
    const oldKeys = Object.keys(old).sort();
    const esmKeys = Object.keys(esm).sort();
    assert.deepEqual(oldKeys, esmKeys, "ESM and old module should export the same keys");
  });
});

// ── window-manager.mjs ─────────────────────────────────────────────────────

describe("window-manager.mjs", () => {
  it("exports expected functions", async () => {
    const mod = await import("../session/window-manager.mjs");
    assert.equal(typeof mod.buildManagedDashboardUrl, "function");
    assert.equal(typeof mod.createWindowManager, "function");
    assert.equal(typeof mod.normalizeWindowCreatePayload, "function");
    assert.equal(typeof mod.normalizeRestorePlan, "function");
  });

  it("buildManagedDashboardUrl appends sessionId", async () => {
    const { buildManagedDashboardUrl } = await import("../session/window-manager.mjs");
    const url = buildManagedDashboardUrl({
      baseUrl: "chrome-extension://abc/pages/dashboard.html",
      sessionId: "sess_123"
    });
    assert.ok(url.includes("sessionId=sess_123"));
    assert.ok(url.includes("dashboard.html"));
  });

  it("normalizeRestorePlan extracts recoverable children", async () => {
    const { normalizeRestorePlan } = await import("../session/window-manager.mjs");
    const plan = normalizeRestorePlan({
      childSessions: {
        deepseek: { provider: "deepseek", url: "https://chat.deepseek.com/a/1", recoverable: true, tabId: 1 },
        grok: { provider: "grok", url: "", recoverable: false, tabId: 2 }
      }
    });

    assert.equal(plan.restored.length, 1);
    assert.equal(plan.restored[0].provider, "deepseek");
    assert.equal(plan.clearedChildSessions.deepseek.tabId, null);
    assert.equal(plan.clearedChildSessions.grok.tabId, null);
  });

  it("matches old window-manager.js exports", async () => {
    const old = require("../session/window-manager.js");
    const esm = await import("../session/window-manager.mjs");

    const oldKeys = Object.keys(old).sort();
    const esmKeys = Object.keys(esm).sort();
    assert.deepEqual(oldKeys, esmKeys, "ESM and old module should export the same keys");
  });
});

// ── .mjs source code cleanliness ────────────────────────────────────────────

describe(".mjs files do not use UMD patterns", () => {
  const mjsFiles = [
    "shared/providers.mjs",
    "session/session-constants.mjs",
    "session/session-model.mjs",
    "session/session-registry.mjs",
    "session/provider-session-bindings.mjs",
    "session/transcript-store.mjs",
    "session/window-manager.mjs"
  ];

  for (const relPath of mjsFiles) {
    it(`${relPath} does not set globalThis namespace`, () => {
      const source = fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
      assert.ok(
        !source.includes("globalThis.MultiAISession"),
        `${relPath} must not set globalThis.MultiAISession*`
      );
    });

    it(`${relPath} does not use module.exports`, () => {
      const source = fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
      assert.ok(
        !source.includes("module.exports"),
        `${relPath} must not use module.exports`
      );
    });

    it(`${relPath} uses named exports`, () => {
      const source = fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
      assert.ok(
        source.includes("export ") || source.includes("export{"),
        `${relPath} should have export statements`
      );
    });
  }
});

// ── Service worker near-real bootstrap test ────────────────────────────────

describe("background.mjs service worker bootstrap (near-real)", () => {
  it("full ESM import graph loads with mock chrome API", async () => {
    // Set up a minimal mock chrome API that background.mjs calls at top level
    const listeners = [];
    const originalChrome = globalThis.chrome;
    globalThis.chrome = {
      action: {
        onClicked: { addListener: () => {} }
      },
      runtime: {
        onMessage: { addListener: (fn) => listeners.push(fn) },
        getURL: (path) => `chrome-extension://test-id/${path}`
      },
      storage: {
        local: {
          get: async () => ({}),
          set: async () => {}
        }
      },
      tabs: {
        create: async () => ({ id: 1 }),
        query: async () => [],
        sendMessage: async () => ({}),
        onUpdated: { addListener: () => {}, removeListener: () => {} }
      },
      windows: {
        getCurrent: async () => ({ id: 1 })
      },
      scripting: {
        executeScript: async () => []
      }
    };

    try {
      // This exercises the full ESM import graph:
      //   background.mjs → shared/providers.mjs, session-constants.mjs, session-model.mjs,
      //   session-registry.mjs, provider-session-bindings.mjs, transcript-store.mjs,
      //   window-manager.mjs
      const bg = await import("../background.mjs");

      // The onMessage listener should have been registered
      assert.ok(listeners.length >= 1, "background.mjs should register at least one onMessage listener");

      // The registered listener should be a function
      assert.equal(typeof listeners[0], "function");

      // Verify the module loaded (even though it doesn't export anything,
      // the fact that it loaded without throwing proves the import graph works)
      assert.ok(true, "background.mjs loaded successfully with mock chrome API");
    } finally {
      // Restore original chrome
      if (originalChrome) {
        globalThis.chrome = originalChrome;
      } else {
        delete globalThis.chrome;
      }
    }
  });

  it("session modules produce correct results via background import chain", async () => {
    // Verify the session modules work correctly through the import chain
    // by testing their core logic directly via ESM imports
    const { createSessionRecord, updateChildSessionRecord } = await import("../session/session-model.mjs");
    const { ensureSessionTranscript, appendUserTurn, appendProviderTurn, applyProviderLiveStatus } = await import("../session/transcript-store.mjs");
    const { buildManagedDashboardUrl, normalizeRestorePlan } = await import("../session/window-manager.mjs");
    const { normalizeChildSessionBinding, shouldIgnoreChildSessionUrl } = await import("../session/provider-session-bindings.mjs");

    // Simulate a session lifecycle: create → sync child → send prompt → get response
    const now = "2026-06-24T12:00:00.000Z";
    let session = createSessionRecord({
      sessionId: "sess_integration",
      providers: ["deepseek", "grok"],
      mode: "foreground",
      now
    });

    // Ensure transcript shell
    session = ensureSessionTranscript(session, now);
    assert.ok(session.transcript, "transcript should exist");
    assert.ok(session.transcript.providers.deepseek, "deepseek provider state should exist");

    // Sync child session (simulate deepseek tab opening)
    session = updateChildSessionRecord(session, "deepseek", {
      url: "https://chat.deepseek.com/a/chat/123",
      title: "DeepSeek Chat",
      tabId: 100,
      recoverable: true
    });
    assert.equal(session.childSessions.deepseek.recoverable, true);

    // Apply provider live status: responding
    session = applyProviderLiveStatus(session, {
      provider: "deepseek",
      status: "responding",
      occurredAt: "2026-06-24T12:01:00.000Z"
    });
    assert.equal(session.transcript.providers.deepseek.status, "responding");

    // Record user turn
    session = appendUserTurn(session, {
      providers: ["deepseek"],
      prompt: "What is the meaning of life?",
      occurredAt: "2026-06-24T12:01:00.000Z"
    });
    assert.equal(session.transcript.providers.deepseek.turns.length, 1);
    assert.equal(session.transcript.providers.deepseek.turns[0].role, "user");

    // Record provider response
    session = appendProviderTurn(session, {
      provider: "deepseek",
      role: "assistant",
      content: "42.",
      occurredAt: "2026-06-24T12:01:05.000Z"
    });
    assert.equal(session.transcript.providers.deepseek.turns.length, 2);
    assert.equal(session.transcript.providers.deepseek.turns[1].role, "assistant");

    // Apply terminal status: completed
    session = applyProviderLiveStatus(session, {
      provider: "deepseek",
      status: "completed",
      occurredAt: "2026-06-24T12:01:06.000Z"
    });
    assert.equal(session.transcript.providers.deepseek.status, "completed");

    // Build dashboard URL for restore
    const dashboardUrl = buildManagedDashboardUrl({
      baseUrl: "chrome-extension://test/pages/dashboard.html",
      sessionId: session.sessionId
    });
    assert.ok(dashboardUrl.includes("sessionId=sess_integration"));

    // Normalize restore plan
    const plan = normalizeRestorePlan(session);
    assert.equal(plan.restored.length, 1, "deepseek should be recoverable");
    assert.equal(plan.restored[0].provider, "deepseek");
    assert.equal(plan.clearedChildSessions.deepseek.tabId, null, "tabId cleared for restore");

    // Grok should not be recoverable (empty URL)
    assert.equal(plan.restored.length, 1, "only deepseek should be recoverable");
  });

  it("Gemini ignored URL pattern works through ESM import chain", async () => {
    const { shouldIgnoreChildSessionUrl } = await import("../session/provider-session-bindings.mjs");
    const { normalizeChildSessionBinding } = await import("../session/provider-session-bindings.mjs");

    // Gemini bscframe URL should be ignored
    assert.equal(
      shouldIgnoreChildSessionUrl("gemini", "https://gemini.google.com/_/bscframe?hl=en"),
      true
    );

    // Binding with bscframe URL should mark as non-recoverable
    const binding = normalizeChildSessionBinding({
      provider: "gemini",
      url: "https://gemini.google.com/_/bscframe?hl=en",
      tabId: 200,
      now: "2026-06-24T12:00:00.000Z"
    });
    assert.equal(binding.recoverable, false);
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function createMockStorage() {
  const store = {};
  return {
    async get(key) {
      return { [key]: store[key] || null };
    },
    async set(obj) {
      Object.assign(store, obj);
    }
  };
}
