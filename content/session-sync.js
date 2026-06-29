"use strict";

/**
 * Session Sync Module
 *
 * Extracted from content.js — child session synchronization logic.
 * Syncs provider page URL/title changes to the background service worker
 * so the dashboard can track child session state.
 *
 * Exported via globalThis.__MAI_SessionSync for use by content.js.
 *
 * Depends on:
 *   - chrome.runtime.sendMessage (Chrome extension API)
 */

var __MAI_SessionSync = (function () {
  var SS = globalThis.__MAI_SessionSync || {};

  // ─── Constants ─────────────────────────────────────────────────────────────

  var CHILD_SESSION_SYNC_PROVIDERS = new Set([
    "chatgpt",
    "claude",
    "copilot",
    "deepseek",
    "doubao",
    "gemini",
    "grok",
    "ima",
    "kimi",
    "tongyi",
    "you",
    "yuanbao",
    "zhipu"
  ]);

  var CHILD_SESSION_SYNC_DEBOUNCE_MS = 2000;

  // ─── State ─────────────────────────────────────────────────────────────────

  var childSessionSyncStarted = false;
  var lastSyncedFingerprint = "";
  var _sessionSyncCleanupHandlers = [];

  // ─── Cleanup helpers ───────────────────────────────────────────────────────

  function registerCleanup(registry, handler) {
    if (typeof handler === "function") {
      registry.push(handler);
    }
  }

  function cleanupHandlers(registry) {
    for (var i = 0; i < registry.length; i++) {
      try { registry[i](); } catch (_) { /* ignore */ }
    }
    registry.length = 0;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function createDebouncedSync(fn, delay) {
    var timer = null;
    return function () {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(function () {
        timer = null;
        fn();
      }, delay);
    };
  }

  function sendChildSessionSync(provider) {
    if (!provider || !CHILD_SESSION_SYNC_PROVIDERS.has(provider)) return;
    var url = window.location.href;
    var title = document.title || "";
    var fingerprint = provider + "::" + url + "::" + title;
    var hasFingerprintChanged = fingerprint !== lastSyncedFingerprint;

    if (hasFingerprintChanged) {
      lastSyncedFingerprint = fingerprint;
    }

    var payload = {
      type: "session:sync-child",
      provider: provider,
      url: url,
      title: title,
      lastActiveAt: new Date().toISOString()
    };

    try {
      var msg = (typeof globalThis !== "undefined" && globalThis.__MAI_RuntimeMessaging);
      if (msg && msg.sendRuntimeMessageWithRetry) {
        msg.sendRuntimeMessageWithRetry(payload).catch(function (err) {
          console.warn("[MultiAI Content] sendChildSessionSync (" + provider + "):", err);
        });
      } else if (chrome?.runtime?.sendMessage) {
        var result = chrome.runtime.sendMessage(payload);
        if (result && typeof result.catch === "function") {
          result.catch(function (err) {
            console.warn("[MultiAI Content] sendChildSessionSync (" + provider + "):", err);
          });
        }
      }
    } catch (error) {
      console.warn("[MultiAI Content] Failed to sync child session for " + provider + ":", error);
    }
  }

  // ─── startChildSessionSync ─────────────────────────────────────────────────

  function startChildSessionSync(provider) {
    if (!provider || !CHILD_SESSION_SYNC_PROVIDERS.has(provider)) return;
    if (childSessionSyncStarted) return;
    childSessionSyncStarted = true;

    var debouncedSync = createDebouncedSync(function () {
      sendChildSessionSync(provider);
    }, CHILD_SESSION_SYNC_DEBOUNCE_MS);

    sendChildSessionSync(provider);

    window.addEventListener("popstate", debouncedSync);
    window.addEventListener("hashchange", debouncedSync);

    registerCleanup(_sessionSyncCleanupHandlers,
      function () { window.removeEventListener("popstate", debouncedSync); });
    registerCleanup(_sessionSyncCleanupHandlers,
      function () { window.removeEventListener("hashchange", debouncedSync); });

    var titleObserver = new MutationObserver(function () { debouncedSync(); });
    var bodyObserver = new MutationObserver(function () { debouncedSync(); });
    var headObserver = new MutationObserver(function () {
      var titleEl = document.querySelector("title");
      if (titleEl) {
        titleObserver.observe(titleEl, { childList: true, subtree: true, characterData: true });
      }
    });

    var titleEl = document.querySelector("title");
    if (titleEl) {
      titleObserver.observe(titleEl, { childList: true, subtree: true, characterData: true });
    }

    if (document.head) {
      headObserver.observe(document.head, { childList: true, subtree: true });
    }

    if (document.body) {
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        if (document.body) {
          bodyObserver.observe(document.body, { childList: true, subtree: true });
        }
      }, { once: true });
    }

    registerCleanup(_sessionSyncCleanupHandlers, function () { titleObserver.disconnect(); });
    registerCleanup(_sessionSyncCleanupHandlers, function () { bodyObserver.disconnect(); });
    registerCleanup(_sessionSyncCleanupHandlers, function () { headObserver.disconnect(); });
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  function cleanupAll() {
    cleanupHandlers(_sessionSyncCleanupHandlers);
  }

  // ─── Exports ───────────────────────────────────────────────────────────────

  SS.CHILD_SESSION_SYNC_PROVIDERS = CHILD_SESSION_SYNC_PROVIDERS;
  SS.startChildSessionSync = startChildSessionSync;
  SS.cleanupAll = cleanupAll;

  globalThis.__MAI_SessionSync = SS;
  return SS;
})();
