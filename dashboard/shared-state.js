/* global PROVIDERS, PROVIDER_BY_ID */
/**
 * Shared state namespace for dashboard modules.
 * Loaded before transcript.js and grid-resizer.js so they can access
 * shared state via globalThis.MultiAI.getState().
 */
(() => {
  "use strict";

  // ── I18N Data ────────────────────────────────────────────────────

  const I18N_DATA = {
    "zh-CN": {
      topbarSubtitle: "",
      settings: "设置",
      composerLabel: "提示词",
      composerPlaceholder: "Enter 发送，Shift+Enter换行",
      sendAll: "发送",
      settingsTitle: "选择 AI",
      settingsSubtitle: "选择要显示的 AI 分屏",
      cancel: "取消",
      confirm: "确认",
      refresh: "刷新",
      newTab: "新标签页",
      close: "关闭",
      switch: "切换 AI",
      add: "添加 AI",
      shortcutPrefix: "快捷键",
      langBtn: "En",
      transcriptTitle: "会话记录",
      transcriptRefresh: "刷新",
      transcriptStatusTitle: "实时状态",
      transcriptTimelineTitle: "合并时间线",
      transcriptRawTitle: "Provider 原始记录"
    },
    "en-US": {
      topbarSubtitle: "",
      settings: "Settings",
      composerLabel: "Prompt",
      composerPlaceholder: "Enter to send, Shift+Enter for new line",
      sendAll: "Send",
      settingsTitle: "Select AI",
      settingsSubtitle: "Select AI panels to display",
      cancel: "Cancel",
      confirm: "Confirm",
      refresh: "Refresh",
      newTab: "New Tab",
      close: "Close",
      switch: "Switch AI",
      add: "Add AI",
      shortcutPrefix: "Shortcut",
      langBtn: "中",
      transcriptTitle: "Session Records",
      transcriptRefresh: "Refresh",
      transcriptStatusTitle: "Live Status",
      transcriptTimelineTitle: "Merged Timeline",
      transcriptRawTitle: "Provider Raw Records"
    }
  };

  // ── Constants ────────────────────────────────────────────────────

  const LIVE_STATUS_META = {
    idle: {
      short: { "zh-CN": "空闲", "en-US": "Idle" },
      long: { "zh-CN": "空闲", "en-US": "Idle" }
    },
    responding: {
      short: { "zh-CN": "响应中", "en-US": "Live" },
      long: { "zh-CN": "响应中", "en-US": "Responding" }
    },
    completed: {
      short: { "zh-CN": "完成", "en-US": "Done" },
      long: { "zh-CN": "已完成", "en-US": "Completed" }
    },
    failed: {
      short: { "zh-CN": "失败", "en-US": "Failed" },
      long: { "zh-CN": "失败", "en-US": "Failed" }
    },
    interrupted: {
      short: { "zh-CN": "中断", "en-US": "Stopped" },
      long: { "zh-CN": "已中断", "en-US": "Interrupted" }
    }
  };

  // ── Shared state (mutable, populated by dashboard.js) ────────────

  const state = {
    // Read-only constants
    liveStatusMeta: LIVE_STATUS_META,
    I18N_DATA: I18N_DATA,

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
    },
    get currentLang() {
      return localStorage.getItem("multi-ai-lang") || "zh-CN";
    }
  };

  // Expose globally
  globalThis.MultiAI = state;
})();
