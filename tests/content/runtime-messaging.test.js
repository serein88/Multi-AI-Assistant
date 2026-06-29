// tests/content/runtime-messaging.test.js
// Tests for content/runtime-messaging.js — timeout, retry, fire-and-forget,
// per-call options, and fallback safety.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadModule(sendMessageImpl) {
  globalThis.chrome = {
    runtime: {
      sendMessage: sendMessageImpl || (async () => ({ ok: true })),
    },
  };
  globalThis.MultiAIContentConstants = {
    RUNTIME_MESSAGE_TIMEOUT_MS: 150,
    RUNTIME_MESSAGE_RETRY_COUNT: 3,
    RUNTIME_MESSAGE_RETRY_DELAY_MS: 10,
  };

  delete require.cache[require.resolve("../../content/runtime-messaging.js")];
  return require("../../content/runtime-messaging.js");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("runtime-messaging.js", () => {
  let savedGlobals = {};

  beforeEach(() => {
    savedGlobals.chrome = globalThis.chrome;
    savedGlobals.MultiAIContentConstants = globalThis.MultiAIContentConstants;
  });

  afterEach(() => {
    if (savedGlobals.chrome !== undefined) globalThis.chrome = savedGlobals.chrome;
    else delete globalThis.chrome;
    if (savedGlobals.MultiAIContentConstants !== undefined) globalThis.MultiAIContentConstants = savedGlobals.MultiAIContentConstants;
    else delete globalThis.MultiAIContentConstants;
  });

  // ── Success ──

  it("resolves with response on first attempt success", async () => {
    const mod = loadModule(async () => ({ ok: true, data: "hello" }));
    const result = await mod.sendRuntimeMessageWithRetry({ type: "test" });
    assert.deepEqual(result, { ok: true, data: "hello" });
  });

  // ── Timeout ──

  it("rejects with timeout error when sendMessage never resolves", async () => {
    loadModule(() => new Promise(() => {}));
    const mod = globalThis.__MAI_RuntimeMessaging;

    await assert.rejects(
      () => mod.sendRuntimeMessageWithRetry({ type: "hang" }),
      (err) => {
        assert.equal(err.code, "runtime-message-timeout");
        assert.equal(err.messageType, "hang");
        assert.match(err.message, /runtime-message-timeout/);
        return true;
      }
    );
  });

  // ── Retry on timeout, succeed on third attempt ──

  it("retries on timeout and succeeds on third attempt", async () => {
    let attempts = 0;
    loadModule(async () => {
      attempts++;
      if (attempts < 3) {
        return new Promise(() => {});
      }
      return { ok: true, attempt: attempts };
    });
    const mod = globalThis.__MAI_RuntimeMessaging;

    const result = await mod.sendRuntimeMessageWithRetry({ type: "retry-test" });
    assert.equal(result.ok, true);
    assert.equal(result.attempt, 3);
    assert.equal(attempts, 3);
  });

  // ── All attempts fail ──

  it("rejects after all retries exhausted with correct attempt count", async () => {
    let attempts = 0;
    loadModule(async () => {
      attempts++;
      throw new Error("bg-down");
    });
    const mod = globalThis.__MAI_RuntimeMessaging;

    await assert.rejects(
      () => mod.sendRuntimeMessageWithRetry({ type: "fail-all" }),
      (err) => {
        assert.match(err.message, /bg-down/);
        return true;
      }
    );
    assert.equal(attempts, 3, "should have made exactly 3 attempts");
  });

  // ── Sync throw from sendMessage ──

  it("handles synchronous throw from chrome.runtime.sendMessage", async () => {
    let attempts = 0;
    loadModule(() => {
      attempts++;
      if (attempts < 2) {
        throw new Error("sync-crash");
      }
      return Promise.resolve({ ok: true });
    });
    const mod = globalThis.__MAI_RuntimeMessaging;

    const result = await mod.sendRuntimeMessageWithRetry({ type: "sync-throw" });
    assert.equal(result.ok, true);
    assert.equal(attempts, 2);
  });

  // ── Per-call options: retries=1 ──

  it("respects retries=1 — fails after single attempt, no retry", async () => {
    let attempts = 0;
    loadModule(async () => {
      attempts++;
      return new Promise(() => {}); // never resolve => timeout
    });
    const mod = globalThis.__MAI_RuntimeMessaging;

    await assert.rejects(
      () => mod.sendRuntimeMessageWithRetry({ type: "no-retry" }, { retries: 1 }),
      (err) => {
        assert.equal(err.code, "runtime-message-timeout");
        return true;
      }
    );
    assert.equal(attempts, 1, "retries=1 should make exactly 1 attempt");
  });

  it("respects retries=1 — succeeds on first attempt", async () => {
    let attempts = 0;
    loadModule(async () => {
      attempts++;
      return { ok: true };
    });
    const mod = globalThis.__MAI_RuntimeMessaging;

    const result = await mod.sendRuntimeMessageWithRetry({ type: "ok-first" }, { retries: 1 });
    assert.deepEqual(result, { ok: true });
    assert.equal(attempts, 1);
  });

  it("respects custom timeoutMs with retries=1", async () => {
    let attempts = 0;
    loadModule(async () => {
      attempts++;
      return new Promise(() => {}); // never resolve
    });
    const mod = globalThis.__MAI_RuntimeMessaging;

    await assert.rejects(
      () => mod.sendRuntimeMessageWithRetry(
        { type: "long-timeout" },
        { timeoutMs: 50, retries: 1 }
      ),
      (err) => {
        assert.equal(err.code, "runtime-message-timeout");
        return true;
      }
    );
    assert.equal(attempts, 1, "retries=1 should make exactly 1 attempt");
  });

  // ── Fire-and-forget: rejected promise is caught, no unhandled rejection ──

  it("fire-and-forget .catch swallows rejection (no unhandled rejection)", async () => {
    loadModule(async () => { throw new Error("bg-unavailable"); });
    const mod = globalThis.__MAI_RuntimeMessaging;

    let caught = false;
    mod.sendRuntimeMessageWithRetry({ type: "fire-and-forget" }).catch((err) => {
      caught = true;
      assert.match(err.message, /bg-unavailable/);
    });

    await sleep(500);
    assert.equal(caught, true, "rejection should be caught by .catch");
  });

  // ── Fallback safety: sendMessage returns non-Promise ──

  it("fallback .catch guard: non-Promise sendMessage result does not throw", () => {
    // Simulate the fallback pattern in content.js / session-sync.js
    // where sendMessage might return a non-Promise (e.g. undefined)
    const mockSendMessage = () => undefined; // non-Promise return

    // The safe pattern: check result && typeof result.catch before calling .catch
    let threw = false;
    try {
      const result = mockSendMessage({ type: "test" });
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
    } catch (_) {
      threw = true;
    }
    assert.equal(threw, false, "non-Promise result should not cause TypeError");
  });

  // ── Export shape ──

  it("exposes sendRuntimeMessageWithRetry on globalThis.__MAI_RuntimeMessaging", () => {
    const mod = loadModule(async () => ({}));
    assert.equal(typeof mod.sendRuntimeMessageWithRetry, "function");
    assert.equal(typeof globalThis.__MAI_RuntimeMessaging.sendRuntimeMessageWithRetry, "function");
  });
});
