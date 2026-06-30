"use strict";

/**
 * E2E Tests — Session Flows
 *
 * Loads the real Chrome extension via Puppeteer and exercises three
 * critical user flows through the background service worker and dashboard UI.
 *
 * These tests require a real Chrome binary (provided by Puppeteer's bundled
 * Chrome for Testing). They do NOT depend on external AI site availability.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { launchExtension } from "./helpers/extension-harness.mjs";

const TEST_TIMEOUT_MS = 60_000;

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Set the prompt textarea value using the native setter and dispatch input event.
 * Puppeteer's page.type() does not reliably update value for this dashboard's
 * textarea; the native setter is more dependable.
 */
async function setPromptValue(page, text) {
  await page.evaluate((t) => {
    const el = document.getElementById("prompt");
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, "value"
    ).set;
    setter.call(el, t);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("E2E: Session Flows", () => {
  let harness;

  before(async () => {
    harness = await launchExtension();
  });

  after(async () => {
    if (harness) await harness.close();
  });

  // ── Test 1: Create Session ────────────────────────────────────────────

  it("creates a new session and opens dashboard with correct panels", async () => {
    const providers = ["deepseek", "gemini"];
    const response = await harness.sendRuntimeMessage({
      type: "session:create",
      providers,
      mode: "foreground",
    });

    assert.ok(response, "response should not be null");
    assert.equal(response.ok, true, `response.ok should be true: ${JSON.stringify(response)}`);
    assert.ok(response.result, "response.result should exist");

    const { session, windowId } = response.result;
    assert.ok(session.sessionId, "session.sessionId should exist");
    assert.ok(session.sessionId.startsWith("sess_"), `sessionId prefix: ${session.sessionId}`);
    assert.deepEqual(session.providers.slice().sort(), providers.sort());
    assert.equal(typeof windowId, "number", "windowId should be a number");

    const dashboardPage = await harness.waitForDashboardPage(session.sessionId, {
      timeoutMs: 15_000,
    });
    assert.ok(dashboardPage, "dashboard page should open");

    const url = dashboardPage.url();
    assert.ok(url.includes("pages/dashboard.html"), `URL should contain pages/dashboard.html: ${url}`);
    assert.ok(url.includes(`sessionId=${session.sessionId}`), `URL should contain sessionId: ${url}`);

    await dashboardPage.waitForSelector(".panel", { timeout: 10_000 });
    const panelCount = await dashboardPage.$$eval(".panel", (els) => els.length);
    assert.equal(panelCount, providers.length, `expected ${providers.length} panels, got ${panelCount}`);

    await dashboardPage.close();
  }, { timeout: TEST_TIMEOUT_MS });

  // ── Test 2: Unified Send ──────────────────────────────────────────────

  it("sends a prompt to all panels and records transcript user turn", async () => {
    const providers = ["deepseek", "grok"];
    const createRes = await harness.sendRuntimeMessage({
      type: "session:create",
      providers,
      mode: "foreground",
    });
    assert.ok(createRes?.ok, "session:create should succeed");
    const sessionId = createRes.result.session.sessionId;

    const dashboardPage = await harness.waitForDashboardPage(sessionId, {
      timeoutMs: 15_000,
    });
    assert.ok(dashboardPage, "dashboard page should open");
    await dashboardPage.waitForSelector(".panel", { timeout: 10_000 });
    await sleep(1000); // Wait for iframes and send module to initialise

    // Install chrome.runtime.sendMessage interceptor to verify the full chain
    await dashboardPage.evaluate(() => {
      window.__runtimeMsgLog = [];
      const orig = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = function (...args) {
        window.__runtimeMsgLog.push({ type: args[0]?.type, prompt: args[0]?.prompt });
        return orig(...args);
      };
    });

    // Set prompt and trigger send
    const promptText = "Hello from E2E test";
    await setPromptValue(dashboardPage, promptText);
    await dashboardPage.evaluate(async () => {
      await globalThis.MultiAISend.sendPrompt();
    });
    await sleep(1500);

    // ── Verify: session:transcript-user-turn was sent with correct prompt ──
    const msgLog = await dashboardPage.evaluate(() => window.__runtimeMsgLog);
    const userTurnMsg = msgLog.find(
      (m) => m.type === "session:transcript-user-turn" && m.prompt === promptText
    );
    assert.ok(
      userTurnMsg,
      "sendPrompt should trigger session:transcript-user-turn with correct prompt"
    );

    // ── Verify: transcript recorded user turn for each provider via background ──
    const getRes = await harness.sendRuntimeMessage({ type: "session:get", sessionId });
    assert.ok(getRes?.ok, "session:get should succeed");
    const session = getRes.result;
    assert.ok(session.transcript, "session should have transcript");

    for (const provider of providers) {
      const providerState = session.transcript.providers?.[provider];
      assert.ok(providerState, `${provider} should have transcript state`);
      const userTurn = providerState.turns.find((t) => t.role === "user");
      assert.ok(userTurn, `${provider} should have a user turn`);
      assert.equal(userTurn.content, promptText, `${provider} user turn content matches`);
    }

    // ── Verify: send button recovered ──
    const btnDisabled = await dashboardPage.$eval("#sendAll", (el) => el.disabled);
    assert.equal(btnDisabled, false, "send button should be re-enabled after send");

    await dashboardPage.close();
  }, { timeout: TEST_TIMEOUT_MS });

  // ── Test 3: Restore Session ──────────────────────────────────────────

  it("restores a session and reopens dashboard with same sessionId", async () => {
    const providers = ["deepseek", "gemini", "grok"];
    const createRes = await harness.sendRuntimeMessage({
      type: "session:create",
      providers,
      mode: "foreground",
    });
    assert.ok(createRes?.ok, "session:create should succeed");
    const originalSession = createRes.result.session;
    const sessionId = originalSession.sessionId;

    const dashboardPage1 = await harness.waitForDashboardPage(sessionId, {
      timeoutMs: 15_000,
    });
    assert.ok(dashboardPage1, "first dashboard page should open");

    await dashboardPage1.close();
    await sleep(500);

    // Restore
    const restoreRes = await harness.sendRuntimeMessage({
      type: "session:restore",
      sessionId,
    });
    assert.ok(restoreRes?.ok, `session:restore should succeed: ${JSON.stringify(restoreRes)}`);
    assert.ok(restoreRes.result, "restore result should exist");

    const { session: restoredSession, windowId, restored } = restoreRes.result;
    assert.equal(restoredSession.sessionId, sessionId, "sessionId should be preserved");
    assert.equal(typeof windowId, "number", "windowId should be a number");
    assert.ok(Array.isArray(restored), "restored should be an array");

    const dashboardPage2 = await harness.waitForDashboardPage(sessionId, {
      timeoutMs: 15_000,
    });
    assert.ok(dashboardPage2, "restored dashboard page should open");

    const url = dashboardPage2.url();
    assert.ok(url.includes(`sessionId=${sessionId}`), `restored URL should contain sessionId: ${url}`);

    await dashboardPage2.waitForSelector(".panel", { timeout: 10_000 });
    const panelCount = await dashboardPage2.$$eval(".panel", (els) => els.length);
    assert.equal(panelCount, providers.length, `expected ${providers.length} panels, got ${panelCount}`);

    // lastActiveAt should be updated
    const getRes = await harness.sendRuntimeMessage({ type: "session:get", sessionId });
    assert.ok(getRes?.ok, "session:get should succeed");
    const updatedSession = getRes.result;
    assert.ok(
      updatedSession.lastActiveAt >= originalSession.lastActiveAt,
      "lastActiveAt should be updated after restore"
    );

    await dashboardPage2.close();
  }, { timeout: TEST_TIMEOUT_MS });
});
