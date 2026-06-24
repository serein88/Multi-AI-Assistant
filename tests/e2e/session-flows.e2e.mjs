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
 * Replace each provider panel iframe with a srcdoc stub that simulates
 * the content script's postMessage protocol. The stub listens for
 * "sendPrompt" messages and replies with sendResult → responseStarted
 * → responseComplete.
 */
async function stubDashboardIframes(page) {
  await page.evaluate(() => {
    const panels = document.querySelectorAll(".panel");
    for (const panel of panels) {
      const providerId = panel.dataset.providerId;
      const oldIframe = panel.querySelector("iframe");
      if (!oldIframe || !providerId) continue;

      const stub = document.createElement("iframe");
      stub.className = "panel-frame";
      stub.dataset.providerId = providerId;
      stub.dataset.stubbed = "true";
      stub.style.width = "100%";
      stub.style.height = "100%";
      stub.srcdoc = `
        <html><body>
        <script>
        (function() {
          var provider = ${JSON.stringify(providerId)};
          window.addEventListener("message", function(event) {
            var data = event.data;
            if (!data || data.source !== "multi-ai" || data.type !== "sendPrompt") return;
            // sendResult
            window.parent.postMessage({
              source: "multi-ai-content",
              type: "sendResult",
              provider: provider,
              success: true
            }, "*");
            // responseStarted (after small delay)
            setTimeout(function() {
              window.parent.postMessage({
                source: "multi-ai-content",
                type: "responseStarted",
                provider: provider
              }, "*");
            }, 50);
            // responseComplete (after answer delay)
            setTimeout(function() {
              window.parent.postMessage({
                source: "multi-ai-content",
                type: "responseComplete",
                provider: provider
              }, "*");
            }, 200);
          });
        })();
        </script>
        </body></html>
      `;
      oldIframe.replaceWith(stub);
    }
  });
}

/**
 * Wait until a predicate returns truthy, polling at intervalMs.
 */
async function waitFor(predicate, { timeoutMs = 10_000, intervalMs = 300, label = "" } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (e) {
      lastErr = e;
    }
    await sleep(intervalMs);
  }
  throw new Error(`timeout waiting for: ${label || "condition"}` + (lastErr ? ` (${lastErr.message})` : ""));
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

    // Response should be wrapped by sendResponse: { ok: true, result: { session, windowId } }
    assert.ok(response, "response should not be null");
    assert.equal(response.ok, true, `response.ok should be true, got: ${JSON.stringify(response)}`);
    assert.ok(response.result, "response.result should exist");

    const { session, windowId } = response.result;
    assert.ok(session.sessionId, "session.sessionId should exist");
    assert.ok(session.sessionId.startsWith("sess_"), `sessionId should start with "sess_", got: ${session.sessionId}`);
    assert.deepEqual(session.providers.slice().sort(), providers.sort());
    assert.equal(typeof windowId, "number", "windowId should be a number");

    // Wait for the dashboard page to appear
    const dashboardPage = await harness.waitForPage("dashboard.html", {
      timeoutMs: 15_000,
    });
    assert.ok(dashboardPage, "dashboard page should open");

    const url = dashboardPage.url();
    assert.ok(url.includes("dashboard.html"), `URL should contain dashboard.html: ${url}`);
    assert.ok(
      url.includes(`sessionId=${session.sessionId}`),
      `URL should contain sessionId: ${url}`
    );

    // Wait for panels to render
    await dashboardPage.waitForSelector(".panel", { timeout: 10_000 });
    const panelCount = await dashboardPage.$$eval(
      ".panel",
      (els) => els.length
    );
    assert.equal(panelCount, providers.length, `expected ${providers.length} panels, got ${panelCount}`);

    // Clean up: close dashboard page
    await dashboardPage.close();
  }, { timeout: TEST_TIMEOUT_MS });

  // ── Test 2: Unified Send ──────────────────────────────────────────────

  it("sends a prompt to all panels and records transcript user turn", async () => {
    // Create a fresh session
    const providers = ["deepseek", "grok"];
    const createRes = await harness.sendRuntimeMessage({
      type: "session:create",
      providers,
      mode: "foreground",
    });
    assert.ok(createRes?.ok, "session:create should succeed");
    const sessionId = createRes.result.session.sessionId;

    // Get the dashboard page
    const dashboardPage = await harness.waitForPage("dashboard.html", {
      timeoutMs: 15_000,
    });
    assert.ok(dashboardPage, "dashboard page should open");

    // Wait for panels
    await dashboardPage.waitForSelector(".panel", { timeout: 10_000 });

    // Replace iframes with srcdoc stubs to avoid external network dependency
    await stubDashboardIframes(dashboardPage);

    // Wait a tick for stubs to initialize
    await sleep(500);

    // Type prompt
    const promptText = "Hello from E2E test";
    await dashboardPage.waitForSelector("#prompt", { timeout: 5_000 });
    await dashboardPage.type("#prompt", promptText);

    // Click send
    await dashboardPage.click("#sendAll");

    // Wait for all panels to receive sendResult (stub responds in ~50ms)
    await sleep(1500);

    // Verify transcript recorded the user turn via session:get
    const getRes = await harness.sendRuntimeMessage({
      type: "session:get",
      sessionId,
    });
    assert.ok(getRes?.ok, "session:get should succeed");
    const session = getRes.result;
    assert.ok(session.transcript, "session should have transcript");

    // Check that user turns were recorded for both providers
    for (const provider of providers) {
      const providerState = session.transcript.providers?.[provider];
      assert.ok(providerState, `${provider} should have transcript state`);
      assert.ok(
        providerState.turns.length > 0,
        `${provider} should have at least 1 turn`
      );
      const userTurn = providerState.turns.find((t) => t.role === "user");
      assert.ok(userTurn, `${provider} should have a user turn`);
      assert.equal(
        userTurn.content,
        promptText,
        `${provider} user turn content should match prompt`
      );
    }

    await dashboardPage.close();
  }, { timeout: TEST_TIMEOUT_MS });

  // ── Test 3: Restore Session ──────────────────────────────────────────

  it("restores a session and reopens dashboard with same sessionId", async () => {
    // Create a session
    const providers = ["deepseek", "gemini", "grok"];
    const createRes = await harness.sendRuntimeMessage({
      type: "session:create",
      providers,
      mode: "foreground",
    });
    assert.ok(createRes?.ok, "session:create should succeed");
    const originalSession = createRes.result.session;
    const sessionId = originalSession.sessionId;

    // Wait for dashboard
    const dashboardPage1 = await harness.waitForPage("dashboard.html", {
      timeoutMs: 15_000,
    });
    assert.ok(dashboardPage1, "first dashboard page should open");

    // Close dashboard
    await dashboardPage1.close();
    await sleep(500);

    // Restore session
    const restoreRes = await harness.sendRuntimeMessage({
      type: "session:restore",
      sessionId,
    });
    assert.ok(restoreRes?.ok, `session:restore should succeed: ${JSON.stringify(restoreRes)}`);
    assert.ok(restoreRes.result, "restore result should exist");

    const { session: restoredSession, windowId, restored } = restoreRes.result;
    assert.equal(restoredSession.sessionId, sessionId, "sessionId should be preserved");
    assert.equal(typeof windowId, "number", "windowId should be a number");

    // restored array lists recoverable child sessions (their URLs were saved)
    // Since we didn't navigate iframes to real URLs, restored may be empty — that's OK
    assert.ok(Array.isArray(restored), "restored should be an array");

    // New dashboard page should appear
    const dashboardPage2 = await harness.waitForPage("dashboard.html", {
      timeoutMs: 15_000,
    });
    assert.ok(dashboardPage2, "restored dashboard page should open");

    const url = dashboardPage2.url();
    assert.ok(
      url.includes(`sessionId=${sessionId}`),
      `restored URL should contain same sessionId: ${url}`
    );

    // Wait for panels to render
    await dashboardPage2.waitForSelector(".panel", { timeout: 10_000 });
    const panelCount = await dashboardPage2.$$eval(
      ".panel",
      (els) => els.length
    );
    assert.equal(panelCount, providers.length, `expected ${providers.length} panels, got ${panelCount}`);

    // Verify lastActiveAt was updated
    const getRes = await harness.sendRuntimeMessage({
      type: "session:get",
      sessionId,
    });
    assert.ok(getRes?.ok, "session:get should succeed");
    const updatedSession = getRes.result;
    assert.ok(
      updatedSession.lastActiveAt >= originalSession.lastActiveAt,
      "lastActiveAt should be updated after restore"
    );

    await dashboardPage2.close();
  }, { timeout: TEST_TIMEOUT_MS });
});
