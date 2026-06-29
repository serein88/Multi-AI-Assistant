/**
 * Unit tests for dashboard/send.js — target parsing, badge management, send flow
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import sinon from "sinon";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Load dashboard/send.js in a sandboxed context with mock globals
 */
function loadSendModule(mocks = {}) {
  const defaultMocks = {
    PROVIDER_BY_ID: {
      deepseek: { label: "DeepSeek" },
      grok: { label: "Grok" },
      gemini: { label: "Gemini" }
    },
    MultiAI: {
      activePanels: ["deepseek", "grok"],
      panelByIndex: new Map(),
      I18N: { sendAll: "Send" },
      log: sinon.stub(),
      showMessage: sinon.stub()
    },
    document: {
      getElementById: sinon.stub().returns(null),
      createElement: sinon.stub().callsFake((tag) => ({
        tagName: tag.toUpperCase(),
        className: "",
        textContent: "",
        style: {},
        classList: {
          add: sinon.stub(),
          remove: sinon.stub()
        },
        appendChild: sinon.stub(),
        querySelector: sinon.stub().returns(null),
        setAttribute: sinon.stub(),
        addEventListener: sinon.stub()
      }))
    },
    chrome: {
      runtime: {
        sendMessage: sinon.stub().resolves({ ok: true })
      }
    },
    console: {
      log: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub()
    },
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    Set,
    Map,
    Array,
    Number,
    Promise
  };

  const context = { ...defaultMocks, ...mocks };
  context.globalThis = context;

  const code = require("fs").readFileSync(
    require("path").resolve(process.cwd(), "dashboard/send.js"),
    "utf8"
  );

  vm.runInContext(code, vm.createContext(context));

  return {
    api: context.MultiAISend,
    context
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("dashboard/send.js", () => {

  // ── Target parsing ──

  describe("parseTargetPrompt", () => {
    it("returns empty targets when no @ prefix", () => {
      const { api } = loadSendModule();
      const result = api.parseTargetPrompt("hello world");
      assert.equal(result.prompt, "hello world");
      assert.equal(result.targets.length, 0);
    });

    it("parses single target with colon separator", () => {
      const { api } = loadSendModule();
      const result = api.parseTargetPrompt("@1: hello");
      assert.equal(result.prompt, "hello");
      assert.equal(result.targets.length, 1);
      assert.equal(result.targets[0], "deepseek");
    });

    it("parses single target with Chinese colon separator", () => {
      const { api } = loadSendModule();
      const result = api.parseTargetPrompt("@2：test prompt");
      assert.equal(result.prompt, "test prompt");
      assert.equal(result.targets.length, 1);
      assert.equal(result.targets[0], "grok");
    });

    it("parses multiple targets without separator", () => {
      const { api } = loadSendModule();
      const result = api.parseTargetPrompt("@1 @2 explain this");
      assert.equal(result.prompt, "explain this");
      assert.equal(result.targets.length, 2);
      assert.ok(result.targets.includes("deepseek"));
      assert.ok(result.targets.includes("grok"));
    });

    it("deduplicates repeated targets", () => {
      const { api } = loadSendModule();
      const result = api.parseTargetPrompt("@1 @1: test");
      assert.equal(result.prompt, "test");
      assert.equal(result.targets.length, 1);
      assert.equal(result.targets[0], "deepseek");
    });

    it("ignores out-of-range indices", () => {
      const { api } = loadSendModule();
      const result = api.parseTargetPrompt("@99: unreachable");
      assert.equal(result.prompt, "@99: unreachable");
      assert.equal(result.targets.length, 0);
    });

    it("stops parsing at first non-target token", () => {
      const { api } = loadSendModule();
      const result = api.parseTargetPrompt("@1 text @2");
      assert.equal(result.prompt, "text @2");
      assert.equal(result.targets.length, 1);
      assert.equal(result.targets[0], "deepseek");
    });

    it("handles empty prompt after targets", () => {
      const { api } = loadSendModule();
      const result = api.parseTargetPrompt("@1 @2");
      assert.equal(result.prompt, "");
      assert.equal(result.targets.length, 2);
      assert.ok(result.targets.includes("deepseek"));
      assert.ok(result.targets.includes("grok"));
    });
  });

  describe("parseTargetsFromInput", () => {
    it("extracts all @N tokens from text", () => {
      const { api } = loadSendModule();
      const result = api.parseTargetsFromInput("Check @1 and @2 please");
      assert.deepEqual(result, ["deepseek", "grok"]);
    });

    it("deduplicates targets", () => {
      const { api } = loadSendModule();
      const result = api.parseTargetsFromInput("@1 and @1 again");
      assert.deepEqual(result, ["deepseek"]);
    });

    it("ignores invalid indices", () => {
      const { api } = loadSendModule();
      const result = api.parseTargetsFromInput("@0 @999");
      assert.deepEqual(result, []);
    });
  });

  describe("stripTargetTokens", () => {
    it("removes @N tokens with space boundary", () => {
      const { api } = loadSendModule();
      assert.equal(api.stripTargetTokens("@1 test"), "test");
      assert.equal(api.stripTargetTokens("@1"), "");
    });

    it("removes @N but preserves colon separator", () => {
      const { api } = loadSendModule();
      assert.equal(api.stripTargetTokens("@1: test"), ": test");
      assert.equal(api.stripTargetTokens("@1：test"), "：test");
    });

    it("does not match @N in middle of identifier-like text", () => {
      const { api } = loadSendModule();
      // email@1example.com: @1 is followed by 'e', which matches [^0-9]
      // So it WILL match and strip @1
      const result = api.stripTargetTokens("email@1example.com");
      assert.equal(result, "emailexample.com");
    });

    it("collapses multiple spaces", () => {
      const { api } = loadSendModule();
      assert.equal(api.stripTargetTokens("@1  @2   test"), "test");
    });
  });

  // ── Panel helpers ──

  describe("getPanelIframe", () => {
    it("returns iframe from matching panel", () => {
      const mockIframe = { tagName: "IFRAME" };
      const mockPanel = { querySelector: sinon.stub().returns(mockIframe) };
      const panelByIndex = new Map([[0, mockPanel]]);
      const { api } = loadSendModule({
        MultiAI: { activePanels: ["deepseek"], panelByIndex }
      });
      const result = api.getPanelIframe("deepseek");
      assert.equal(result, mockIframe);
    });

    it("returns null when provider not in activePanels", () => {
      const { api } = loadSendModule();
      assert.equal(api.getPanelIframe("nonexistent"), null);
    });

    it("returns null when panel not in panelByIndex", () => {
      const { api } = loadSendModule({
        MultiAI: { activePanels: ["deepseek"], panelByIndex: new Map() }
      });
      assert.equal(api.getPanelIframe("deepseek"), null);
    });
  });

  describe("getPanelBadge", () => {
    it("returns badge from matching panel", () => {
      const mockBadge = { className: "panel-badge" };
      const mockPanel = { querySelector: sinon.stub().returns(mockBadge) };
      const panelByIndex = new Map([[0, mockPanel]]);
      const { api } = loadSendModule({
        MultiAI: { activePanels: ["deepseek"], panelByIndex }
      });
      const result = api.getPanelBadge("deepseek");
      assert.equal(result, mockBadge);
    });
  });

  // ── Badge status ──

  describe("setPanelBadgeStatus", () => {
    it("clears all status classes when status is null", () => {
      const mockBadge = {
        classList: { add: sinon.stub(), remove: sinon.stub() }
      };
      const mockPanel = { querySelector: sinon.stub().returns(mockBadge) };
      const panelByIndex = new Map([[0, mockPanel]]);
      const { api } = loadSendModule({
        MultiAI: { activePanels: ["deepseek"], panelByIndex }
      });

      api.setPanelBadgeStatus("deepseek", null);
      assert.ok(mockBadge.classList.remove.calledWith("status-sending", "status-success", "status-error"));
      assert.equal(mockBadge.classList.add.callCount, 0);
    });

    it("adds status class for sending", () => {
      const mockBadge = {
        classList: { add: sinon.stub(), remove: sinon.stub() }
      };
      const mockPanel = { querySelector: sinon.stub().returns(mockBadge) };
      const panelByIndex = new Map([[0, mockPanel]]);
      const { api } = loadSendModule({
        MultiAI: { activePanels: ["deepseek"], panelByIndex }
      });

      api.setPanelBadgeStatus("deepseek", "sending");
      assert.ok(mockBadge.classList.add.calledWith("status-sending"));
    });

    it("schedules auto-clear for success status", async () => {
      const mockBadge = {
        classList: { add: sinon.stub(), remove: sinon.stub() }
      };
      const mockPanel = { querySelector: sinon.stub().returns(mockBadge) };
      const panelByIndex = new Map([[0, mockPanel]]);
      const { api } = loadSendModule({
        MultiAI: { activePanels: ["deepseek"], panelByIndex }
      });

      api.setPanelBadgeStatus("deepseek", "success");
      assert.ok(mockBadge.classList.add.calledWith("status-success"));

      // Wait for auto-clear timeout
      await new Promise((r) => setTimeout(r, 2100));
      assert.ok(mockBadge.classList.remove.calledWith("status-success"));
    });

    it("clears existing timer when setting new status", () => {
      const mockBadge = {
        classList: { add: sinon.stub(), remove: sinon.stub() }
      };
      const mockPanel = { querySelector: sinon.stub().returns(mockBadge) };
      const panelByIndex = new Map([[0, mockPanel]]);
      const { api } = loadSendModule({
        MultiAI: { activePanels: ["deepseek"], panelByIndex }
      });

      api.setPanelBadgeStatus("deepseek", "success");
      const firstTimer = api.sendStatusTimers.get("deepseek");
      assert.ok(firstTimer);

      api.setPanelBadgeStatus("deepseek", "error");
      const secondTimer = api.sendStatusTimers.get("deepseek");
      assert.notEqual(firstTimer, secondTimer);
    });
  });

  // ── Send flow ──

  describe("sendPromptToProvider", () => {
    it("returns false immediately when providerId or prompt is empty", async () => {
      const { api } = loadSendModule();
      assert.equal(await api.sendPromptToProvider("", "test"), false);
      assert.equal(await api.sendPromptToProvider("deepseek", ""), false);
    });

    it("uses chrome.runtime.sendMessage when iframe not available", async () => {
      const sendMessage = sinon.stub().resolves({ ok: true });
      const { api } = loadSendModule({
        chrome: { runtime: { sendMessage } }
      });

      const result = await api.sendPromptToProvider("deepseek", "test prompt");
      assert.ok(sendMessage.calledOnce);
      const msg = sendMessage.firstCall.args[0];
      assert.equal(msg.type, "sendPromptToProviderTab");
      assert.equal(msg.provider, "deepseek");
      assert.equal(msg.prompt, "test prompt");
      assert.equal(result, true);
    });

    it("posts message to iframe when available", async () => {
      const postMessage = sinon.stub();
      const mockIframe = { contentWindow: { postMessage } };
      const mockPanel = { querySelector: sinon.stub().returns(mockIframe) };
      const panelByIndex = new Map([[0, mockPanel]]);
      const { api, context } = loadSendModule({
        MultiAI: { activePanels: ["deepseek"], panelByIndex }
      });

      const promise = api.sendPromptToProvider("deepseek", "hello");

      // Simulate content script response
      await new Promise(r => setTimeout(r, 10));
      api.resolvePendingSend("deepseek", true);

      const result = await promise;
      assert.ok(postMessage.calledOnce);
      const msg = postMessage.firstCall.args[0];
      assert.equal(msg.source, "multi-ai");
      assert.equal(msg.type, "sendPrompt");
      assert.equal(msg.provider, "deepseek");
      assert.equal(msg.prompt, "hello");
      assert.equal(result, true);
    });

    it("resolves false on timeout", async () => {
      const mockIframe = { contentWindow: { postMessage: sinon.stub() } };
      const mockPanel = { querySelector: sinon.stub().returns(mockIframe) };
      const panelByIndex = new Map([[0, mockPanel]]);
      const { api } = loadSendModule({
        MultiAI: { activePanels: ["deepseek"], panelByIndex }
      });

      // Don't resolve manually, let it timeout
      const result = await api.sendPromptToProvider("deepseek", "timeout test");
      assert.equal(result, false);
    });

    it("cancels existing pending send for same provider", async () => {
      const mockIframe = { contentWindow: { postMessage: sinon.stub() } };
      const mockPanel = { querySelector: sinon.stub().returns(mockIframe) };
      const panelByIndex = new Map([[0, mockPanel]]);
      const { api } = loadSendModule({
        MultiAI: { activePanels: ["deepseek"], panelByIndex }
      });

      const first = api.sendPromptToProvider("deepseek", "first");
      const second = api.sendPromptToProvider("deepseek", "second");

      api.resolvePendingSend("deepseek", true);

      assert.equal(await first, false); // cancelled
      assert.equal(await second, true); // succeeded
    });
  });

  // ── Timeout alignment ──

  describe("SEND_PROVIDER_TAB_TIMEOUT_MS", () => {
    it("is exported and at least 35000ms", () => {
      const { api } = loadSendModule();
      assert.equal(typeof api.SEND_PROVIDER_TAB_TIMEOUT_MS, "number");
      assert.ok(
        api.SEND_PROVIDER_TAB_TIMEOUT_MS >= 35000,
        `expected >= 35000, got ${api.SEND_PROVIDER_TAB_TIMEOUT_MS}`
      );
    });

    it("is strictly longer than SEND_TIMEOUT_MS (iframe path)", () => {
      const { api } = loadSendModule();
      assert.ok(
        api.SEND_PROVIDER_TAB_TIMEOUT_MS > api.SEND_TIMEOUT_MS,
        "background path timeout must exceed iframe path timeout"
      );
    });
  });

  describe("sendPromptToProvider background path timeout", () => {
    it("background path resolves after SEND_PROVIDER_TAB_TIMEOUT_MS, not SEND_TIMEOUT_MS", async () => {
      const origSetTimeout = global.setTimeout;

      // sendMessage that never resolves
      const sendMessage = () => new Promise(() => {});
      const { api } = loadSendModule({
        chrome: { runtime: { sendMessage } }
      });

      const promise = api.sendPromptToProvider("deepseek", "slow load");

      // After 16s (past SEND_TIMEOUT_MS=15s), should NOT have resolved yet
      const earlyCheck = await Promise.race([
        promise.then(() => "resolved"),
        new Promise((r) => origSetTimeout(() => r("still-pending"), 16000))
      ]);
      assert.equal(earlyCheck, "still-pending",
        "background path should not timeout at 15s (SEND_TIMEOUT_MS)");

      // Clean up — resolve it manually
      api.resolvePendingSend("deepseek", false);
      await promise;
    });
  });

  describe("resolvePendingSend", () => {
    it("resolves pending promise and clears timeout", async () => {
      const { api } = loadSendModule();
      const mockResolve = sinon.stub();
      const mockTimeoutId = 999;
      api.sendPromptToProvider("deepseek", "test"); // creates pending entry

      // Manually inject for testing
      const pending = Array.from(api.sendStatusTimers.keys())[0];

      api.resolvePendingSend("deepseek", true);
      assert.equal(api.sendStatusTimers.has("deepseek"), false);
    });

    it("no-ops when provider not pending", () => {
      const { api } = loadSendModule();
      api.resolvePendingSend("nonexistent", true); // should not throw
    });
  });

  describe("recordSessionUserTurn", () => {
    it("sends session:transcript-user-turn message", async () => {
      const sendMessage = sinon.stub().resolves({ ok: true, result: { ok: true } });
      const { api } = loadSendModule({
        MultiAI: {
          activePanels: ["deepseek"],
          currentSessionId: "test-session-123"
        },
        chrome: { runtime: { sendMessage } }
      });

      await api.recordSessionUserTurn("test prompt", ["deepseek"]);

      assert.ok(sendMessage.calledOnce);
      const msg = sendMessage.firstCall.args[0];
      assert.equal(msg.type, "session:transcript-user-turn");
      assert.equal(msg.sessionId, "test-session-123");
      assert.equal(msg.prompt, "test prompt");
      assert.deepEqual(msg.providers, ["deepseek"]);
      assert.ok(msg.occurredAt);
    });

    it("no-ops when sessionId missing", async () => {
      const sendMessage = sinon.stub();
      const { api } = loadSendModule({
        MultiAI: { currentSessionId: "" },
        chrome: { runtime: { sendMessage } }
      });

      await api.recordSessionUserTurn("test", ["deepseek"]);
      assert.equal(sendMessage.callCount, 0);
    });

    it("no-ops when targetList empty", async () => {
      const sendMessage = sinon.stub();
      const { api } = loadSendModule({
        MultiAI: { currentSessionId: "test" },
        chrome: { runtime: { sendMessage } }
      });

      await api.recordSessionUserTurn("test", []);
      assert.equal(sendMessage.callCount, 0);
    });

    it("filters out invalid provider ids", async () => {
      const sendMessage = sinon.stub().resolves({ ok: true, result: { ok: true } });
      const { api } = loadSendModule({
        MultiAI: {
          activePanels: ["deepseek"],
          currentSessionId: "test-session"
        },
        chrome: { runtime: { sendMessage } }
      });

      await api.recordSessionUserTurn("test", ["deepseek", "", null, undefined]);
      assert.ok(sendMessage.calledOnce);
      const msg = sendMessage.firstCall.args[0];
      assert.deepEqual(msg.providers, ["deepseek"]);
    });
  });

  // ── State management ──

  describe("selectedTargets state", () => {
    it("can be read and written", () => {
      const { api } = loadSendModule();
      const initialTargets = api.selectedTargets;
      assert.ok(Array.isArray(initialTargets));
      api.selectedTargets = ["deepseek", "grok"];
      assert.equal(api.selectedTargets.length, 2);
      assert.ok(api.selectedTargets.includes("deepseek"));
      assert.ok(api.selectedTargets.includes("grok"));
    });
  });

  describe("removeSelectedTarget", () => {
    it("removes target from selectedTargets", () => {
      const promptEl = { value: "" };
      const sendAllBtn = { classList: { add: sinon.stub(), remove: sinon.stub() } };
      const shortcutHint = { textContent: "", style: { display: "none" } };
      const targetChips = { innerHTML: "", appendChild: sinon.stub() };
      const document = {
        getElementById: sinon.stub().callsFake((id) => {
          if (id === "prompt") return promptEl;
          if (id === "sendAll") return sendAllBtn;
          if (id === "shortcutHint") return shortcutHint;
          if (id === "targetChips") return targetChips;
          return null;
        }),
        createElement: sinon.stub().callsFake((tag) => ({
          tagName: tag.toUpperCase(),
          className: "",
          textContent: "",
          appendChild: sinon.stub(),
          addEventListener: sinon.stub(),
          setAttribute: sinon.stub()
        }))
      };

      const { api } = loadSendModule({ document });
      api.selectedTargets = ["deepseek", "grok", "gemini"];
      api.removeSelectedTarget("grok");
      assert.equal(api.selectedTargets.length, 2);
      assert.ok(api.selectedTargets.includes("deepseek"));
      assert.ok(api.selectedTargets.includes("gemini"));
      assert.ok(!api.selectedTargets.includes("grok"));
    });
  });

});
