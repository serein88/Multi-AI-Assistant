/**
 * Shared state namespace for dashboard modules.
 * Loaded before transcript.js and grid-resizer.js so they can access
 * shared state via globalThis.MultiAI.getState().
 *
 * Depends on dashboard/i18n.js (loaded before this file).
 */
(() => {
  "use strict";

  // ── Read i18n module (loaded by dashboard/i18n.js before this file) ──

  const _i18n = globalThis.MultiAI_I18n || {};

  // ── Shared state (mutable, populated by dashboard.js) ────────────

  const state = {
    // Read-only constants from i18n module
    get t() { return _i18n.t || ((k) => k); },
    get currentLang() { return _i18n.currentLang || "zh-CN"; },
    get messages() { return _i18n.messages || {}; },

    // Mutable state — populated/updated by dashboard.js
    currentSessionRecord: null,
    activePanels: [],
    panelByIndex: new Map(),
    customGrid: { rows: 0, cols: 0 },
    colSizes: [],
    rowSizes: [],
    panelEls: [],
    vSplitters: [],
    hSplitters: [],

    // Callbacks — set by dashboard.js
    log: () => {},
    showMessage: () => {},
    saveState: () => {},
    syncGridInputs: () => {},

    // Session info (getter — always reads the latest value)
    get currentSessionId() {
      return new URLSearchParams(window.location.search).get("sessionId") || "";
    }
  };

  // Expose globally
  globalThis.MultiAI = state;
})();
