"use strict";

/**
 * Extension Test Harness
 *
 * Connects to a running Chrome instance via CDP (preferred) or launches
 * a new one with the extension loaded. Provides helpers for E2E test flows.
 *
 * Environment variables:
 *   CHROME_CDP_URL  — CDP endpoint to connect to (default: http://127.0.0.1:9222)
 *   CHROME_NO_CONNECT — set to "1" to skip CDP connection and always launch
 */

import puppeteer from "puppeteer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const LAUNCH_TIMEOUT_MS = 30_000;
const SW_READY_TIMEOUT_MS = 20_000;
const PAGE_NAV_TIMEOUT_MS = 15_000;

/**
 * Connect to a running Chrome or launch a fresh one, and return a harness.
 */
export async function launchExtension() {
  const cdpUrl = process.env.CHROME_CDP_URL || "http://127.0.0.1:9222";
  const skipConnect = process.env.CHROME_NO_CONNECT === "1";

  let browser;
  let launched = false;
  let userDataDir = null;

  if (!skipConnect) {
    try {
      browser = await puppeteer.connect({
        browserURL: cdpUrl,
        defaultViewport: null,
      });
    } catch {
      // CDP not available — fall through to launch
    }
  }

  if (!browser) {
    userDataDir = fs.mkdtempSync(path.join(ROOT_DIR, ".tmp-chrome-profile-"));
    browser = await puppeteer.launch({
      headless: false,
      args: [
        `--disable-extensions-except=${ROOT_DIR}`,
        `--load-extension=${ROOT_DIR}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-component-extensions-with-background-pages",
        "--disable-features=Translate",
        "--disable-background-networking",
        "--disable-sync",
        "--metrics-recording-only",
        "--disable-default-apps",
        "--mute-audio",
      ],
      userDataDir,
      defaultViewport: { width: 1280, height: 800 },
      timeout: LAUNCH_TIMEOUT_MS,
    });
    launched = true;
  }

  const { extensionId, serviceWorkerTarget } = await findServiceWorker(browser, launched);
  // Open a dedicated control page for sending runtime messages
  const controlPage = await openControlPage(browser, extensionId);

  return {
    browser,
    extensionId,
    serviceWorkerTarget,
    controlPage,
    launched,
    userDataDir,

    /** Send a chrome.runtime.sendMessage from the control page and return the response. */
    async sendRuntimeMessage(message) {
      const response = await controlPage.evaluate(async (msg) => {
        return new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(msg, (res) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(res);
            }
          });
        });
      }, message);
      return response;
    },

    /** Open an extension page by relative path. */
    async openExtensionPage(relativePath, options = {}) {
      const url = `chrome-extension://${extensionId}/${relativePath}`;
      const page = await browser.newPage();
      await page.goto(url, {
        waitUntil: options.waitUntil || "domcontentloaded",
        timeout: options.timeout || PAGE_NAV_TIMEOUT_MS,
      });
      return page;
    },

    /** Wait for a dashboard page for a specific sessionId. */
    async waitForDashboardPage(sessionId, { timeoutMs = PAGE_NAV_TIMEOUT_MS } = {}) {
      const pattern = `dashboard.html`;
      const sessionCheck = (url) =>
        url.includes(pattern) &&
        url.includes(`chrome-extension://${extensionId}/`) &&
        url.includes(`sessionId=${sessionId}`);

      // Check existing pages first
      for (const page of await browser.pages()) {
        if (sessionCheck(page.url())) return page;
      }

      // Wait for a new page
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          browser.off("targetcreated", handler);
          reject(new Error(`timeout: no dashboard page for sessionId=${sessionId} in ${timeoutMs}ms`));
        }, timeoutMs);

        const handler = async (target) => {
          if (target.type() !== "page") return;
          try {
            const page = await target.page();
            if (!page) return;
            await new Promise((r) => setTimeout(r, 500));
            if (sessionCheck(page.url())) {
              clearTimeout(timer);
              browser.off("targetcreated", handler);
              resolve(page);
            }
          } catch {
            // page() can throw if target is destroyed
          }
        };

        browser.on("targetcreated", handler);
      });
    },

    /** Wait for a page whose URL matches the predicate. */
    async waitForPage(urlMatch, { timeoutMs = PAGE_NAV_TIMEOUT_MS } = {}) {
      const pred = typeof urlMatch === "string"
        ? (url) => url.includes(urlMatch)
        : (url) => urlMatch.test(url);

      // Check existing pages first
      for (const page of await browser.pages()) {
        if (pred(page.url())) return page;
      }

      // Wait for a new page
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          browser.off("targetcreated", handler);
          reject(new Error(`timeout: no page matching "${urlMatch}" in ${timeoutMs}ms`));
        }, timeoutMs);

        const handler = async (target) => {
          if (target.type() !== "page") return;
          try {
            const page = await target.page();
            if (!page) return;
            // Give the URL a moment to settle
            await new Promise((r) => setTimeout(r, 500));
            if (pred(page.url())) {
              clearTimeout(timer);
              browser.off("targetcreated", handler);
              resolve(page);
            }
          } catch {
            // page() can throw if target is destroyed
          }
        };

        browser.on("targetcreated", handler);
      });
    },

    /** Get all open page URLs (for debugging). */
    async getPageUrls() {
      return (await browser.pages()).map((p) => p.url());
    },

    /** Close browser and clean up temp profile. Only shuts down if we launched it. */
    async close() {
      try { await controlPage.close(); } catch { /* ignore */ }
      if (launched) {
        try { await browser.close(); } catch { /* ignore */ }
        if (userDataDir) {
          try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
      } else {
        // Just disconnect — don't close the user's browser
        browser.disconnect();
      }
    },
  };
}

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Find the extension's service worker target.
 * When connecting to an existing Chrome, the SW may be dormant; wake it first.
 */
async function findServiceWorker(browser, launched) {
  const deadline = Date.now() + (launched ? SW_READY_TIMEOUT_MS : 15_000);

  // Check existing targets
  for (const target of browser.targets()) {
    if (target.type() === "service_worker" && target.url().includes("/background.mjs")) {
      const extensionId = extractExtensionId(target.url());
      return { extensionId, serviceWorkerTarget: target };
    }
  }

  // Not found — if connecting to existing Chrome, the SW may be dormant.
  // Try to wake it by sending a message from an existing extension page.
  if (!launched) {
    for (const page of await browser.pages()) {
      const url = page.url();
      if (url.includes("chrome-extension://") && url.includes("/manage.html")) {
        try {
          await page.evaluate(() => new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: "session:list" }, resolve);
          }));
        } catch {
          // page may have been closed
        }
        break;
      }
    }
  }

  // Wait for the SW target to appear
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      browser.off("targetcreated", handler);
      reject(new Error("timeout: service worker not found"));
    }, Math.max(0, deadline - Date.now()));

    const handler = (target) => {
      if (target.type() !== "service_worker") return;
      if (!target.url().includes("/background.mjs")) return;
      clearTimeout(timer);
      browser.off("targetcreated", handler);
      resolve({
        extensionId: extractExtensionId(target.url()),
        serviceWorkerTarget: target,
      });
    };

    browser.on("targetcreated", handler);

    // Also re-check in case the target appeared between our initial check and now
    for (const target of browser.targets()) {
      if (target.type() === "service_worker" && target.url().includes("/background.mjs")) {
        clearTimeout(timer);
        browser.off("targetcreated", handler);
        resolve({
          extensionId: extractExtensionId(target.url()),
          serviceWorkerTarget: target,
        });
        return;
      }
    }
  });
}

/**
 * Open manage.html as a hidden control page for sending runtime messages.
 */
async function openControlPage(browser, extensionId) {
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extensionId}/manage.html`, {
    waitUntil: "domcontentloaded",
    timeout: PAGE_NAV_TIMEOUT_MS,
  });
  // Wait for the page's JS to initialize
  await page.waitForFunction(
    () => typeof chrome !== "undefined" && chrome.runtime,
    { timeout: 5_000 }
  );
  return page;
}

/**
 * Extract extension ID from chrome-extension:// URL.
 */
function extractExtensionId(url) {
  const match = url.match(/chrome-extension:\/\/([a-z]{32})\//);
  if (!match) {
    throw new Error(`cannot extract extension ID from: ${url}`);
  }
  return match[1];
}
