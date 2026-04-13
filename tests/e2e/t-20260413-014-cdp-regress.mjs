import { chromium } from "playwright";

const CDP_URL = process.env.CDP_URL || "http://127.0.0.1:9222";
const EXTENSION_ID = process.env.EXTENSION_ID || "hcflhfnjaaihifgfnmobkdlcklifeflg";

const SETTLE_MS = Number(process.env.SETTLE_MS || 8000);

const PROVIDERS = ["deepseek", "gemini"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(promise, ms, label) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout: ${label || ms}`)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function waitFor(fn, { timeoutMs = 30000, intervalMs = 300 } = {}) {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() - start > timeoutMs) {
      throw new Error("timeout: waitFor");
    }
    await sleep(intervalMs);
  }
}

async function sendRuntimeMessage(page, message) {
  const response = await page.evaluate((msg) => {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(msg, (response) => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message || String(error)));
          else resolve(response);
        });
      } catch (err) {
        reject(err);
      }
    });
  }, message);

  if (response && typeof response === "object" && "ok" in response) {
    if (response.ok) {
      return response.result;
    }
    throw new Error(response.error || "runtime-message-failed");
  }

  return response;
}

function pickProviderStatus(session, provider) {
  const status = session?.transcript?.providers?.[provider]?.status || null;
  const turns = session?.transcript?.providers?.[provider]?.turns || [];
  return { status, turnsCount: turns.length, lastTurn: turns[turns.length - 1] || null };
}

async function waitForDashboardPage(context, sessionId, { timeoutMs = 20000 } = {}) {
  const expectedPrefix = `chrome-extension://${EXTENSION_ID}/dashboard.html`;
  return waitFor(() => {
    const pages = context.pages();
    return pages.find((page) => {
      const url = page.url();
      return url.startsWith(expectedPrefix) && url.includes(`sessionId=${sessionId}`);
    });
  }, { timeoutMs, intervalMs: 250 });
}

async function waitForProvidersTerminal(page, sessionId, { timeoutMs = 180000 } = {}) {
  const startedAt = Date.now();
  for (;;) {
    const session = await sendRuntimeMessage(page, { type: "session:get", sessionId });
    const snapshot = {};

    for (const provider of PROVIDERS) {
      const info = pickProviderStatus(session, provider);
      snapshot[provider] = info;
    }

    return { session, snapshot };
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`timeout: waitForProvidersTerminal ${JSON.stringify(snapshot)}`);
    }
    await sleep(1000);
  }
}

async function frameForProvider(page, provider) {
  const hostByProvider = {
    deepseek: "chat.deepseek.com",
    gemini: "gemini.google.com"
  };
  const host = hostByProvider[provider];
  if (!host) throw new Error(`unknown provider: ${provider}`);

  const inputHintsByProvider = {
    deepseek: ["textarea", "div[contenteditable='true']"],
    gemini: ["div[contenteditable='true'][role='textbox']", "textarea", "div[contenteditable='true']"]
  };
  const inputHints = inputHintsByProvider[provider] || ["textarea", "div[contenteditable='true']"];

  return waitFor(async () => {
    const frames = page.frames().filter((frame) => frame.url().includes(host));
    if (frames.length === 0) return null;

    for (const frame of frames) {
      for (const sel of inputHints) {
        try {
          const count = await frame.locator(sel).count();
          if (count > 0) {
            return frame;
          }
        } catch {
          // ignore
        }
      }
    }

    return null;
  }, { timeoutMs: 45000, intervalMs: 250 });
}

async function snapshotSession(page, sessionId, label) {
  const session = await sendRuntimeMessage(page, { type: "session:get", sessionId });
  const snapshot = {};
  for (const provider of PROVIDERS) {
    snapshot[provider] = pickProviderStatus(session, provider);
  }

  return { label, sessionId, snapshot };
}

function diffCounts(before, after) {
  const diffs = {};
  for (const provider of PROVIDERS) {
    diffs[provider] = {
      before: before.snapshot[provider].turnsCount,
      after: after.snapshot[provider].turnsCount,
      delta: after.snapshot[provider].turnsCount - before.snapshot[provider].turnsCount
    };
  }
  return diffs;
}

async function main() {
  let browser = null;
  let control = null;
  let dashboard = null;
  let restoredDashboard = null;

  try {
    browser = await withTimeout(chromium.connectOverCDP(CDP_URL), 15000, "connectOverCDP");
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error("No browser context found via CDP");
    }

    {
      const reloader = await context.newPage();
      await withTimeout(
        reloader.goto(`chrome-extension://${EXTENSION_ID}/popup.html`, { waitUntil: "domcontentloaded" }),
        15000,
        "open-popup-reloader"
      );
      // Ensure the service worker/content scripts are from the latest on-disk files.
      await reloader.evaluate(() => chrome.runtime.reload()).catch(() => undefined);
      await reloader.close().catch(() => undefined);
      await sleep(1200);
    }

    control = await context.newPage();
    await withTimeout(
      control.goto(`chrome-extension://${EXTENSION_ID}/popup.html`, { waitUntil: "domcontentloaded" }),
      15000,
      "open-popup"
    );

    const createResult = await withTimeout(
      sendRuntimeMessage(control, { type: "session:create", mode: "foreground" }),
      20000,
      "session:create"
    );

    const sessionId = createResult?.session?.sessionId;
    if (!sessionId) {
      throw new Error(`session:create returned no sessionId: ${JSON.stringify(createResult)}`);
    }

    console.log(`[T-20260413-014] created sessionId=${sessionId}`);

    dashboard = await waitForDashboardPage(context, sessionId, { timeoutMs: 30000 });
    await withTimeout(dashboard.waitForLoadState("domcontentloaded"), 20000, "dashboard-load");

    await waitFor(() => dashboard.locator("iframe.panel-frame").count().then((c) => c >= 3), {
      timeoutMs: 45000,
      intervalMs: 500
    });

    // Wait for provider pages to settle. The regression we care about is:
    // restore/load MUST NOT auto-ingest existing DOM content into transcript.
    for (const provider of PROVIDERS) {
      await frameForProvider(dashboard, provider);
    }
    await sleep(SETTLE_MS);

    const beforeClose = await snapshotSession(dashboard, sessionId, "beforeClose");

    await dashboard.close({ runBeforeUnload: true });
    dashboard = null;
    await sleep(1500);

    console.log("[T-20260413-014] restoring...");
    await withTimeout(sendRuntimeMessage(control, { type: "session:restore", sessionId }), 20000, "session:restore");

    restoredDashboard = await waitForDashboardPage(context, sessionId, { timeoutMs: 40000 });
    await withTimeout(restoredDashboard.waitForLoadState("domcontentloaded"), 20000, "restored-dashboard-load");
    for (const provider of PROVIDERS) {
      await frameForProvider(restoredDashboard, provider);
    }
    await sleep(SETTLE_MS);

    const afterRestore = await snapshotSession(restoredDashboard, sessionId, "afterRestore");

    console.log(
      JSON.stringify({ sessionId, beforeClose, afterRestore, diffs: diffCounts(beforeClose, afterRestore) }, null, 2)
    );

    for (const provider of PROVIDERS) {
      const delta = afterRestore.snapshot[provider].turnsCount - beforeClose.snapshot[provider].turnsCount;
      if (delta !== 0) {
        throw new Error(`restore introduced new turns for ${provider}: delta=${delta}`);
      }
    }

    // Also assert no auto-ingested turns exist at all (welcome/backfill should NOT land in transcript).
    for (const provider of PROVIDERS) {
      if (afterRestore.snapshot[provider].turnsCount !== 0) {
        throw new Error(`unexpected auto-ingested turns for ${provider}: count=${afterRestore.snapshot[provider].turnsCount}`);
      }
    }
  } finally {
    await control?.close().catch(() => undefined);
    await dashboard?.close({ runBeforeUnload: true }).catch(() => undefined);
    await restoredDashboard?.close({ runBeforeUnload: true }).catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error("[T-20260413-014] CDP regression failed:", error);
  process.exitCode = 1;
});
