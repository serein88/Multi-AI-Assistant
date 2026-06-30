const STATE_KEY = "multi-ai-dashboard";
const MAX_PANELS = typeof DASHBOARD_MAX_PANELS === "number" ? DASHBOARD_MAX_PANELS : 6;
const DASHBOARD_KEY = "multi-ai-dashboard-panels";
const DASHBOARD_SESSION_KEY_PREFIX = "multi-ai-dashboard-session:";
const currentSessionId = new URLSearchParams(window.location.search).get("sessionId") || "";
const dashboardStateKey = currentSessionId ? `${STATE_KEY}:${currentSessionId}` : STATE_KEY;
const dashboardPanelsKey = currentSessionId ? `${DASHBOARD_SESSION_KEY_PREFIX}${currentSessionId}` : DASHBOARD_KEY;
const I18N_DATA = globalThis.MultiAI_I18n?.LOCALES || {};
const ALLOWED_IFRAME_ORIGINS = new Set(
  (typeof PROVIDERS !== "undefined" && Array.isArray(PROVIDERS))
    ? PROVIDERS.map((p) => new URL(p.url).origin)
    : []
);
// Shared cleanup registry for window/document-level listeners.
// Each entry is a no-arg function that removes the corresponding listener.
const _cleanupHandlers = [];
/**
 * Register a cleanup function into the given registry array.
 * @param {Array<Function>} registry - The cleanup registry array
 * @param {Function} cleanup - A no-arg function that performs the cleanup
 */

function registerCleanup(registry, cleanup) {
  registry.push(cleanup);
}
/**
 * Execute all cleanup functions in the registry and empty the array.
 * @param {Array<Function>} registry - The cleanup registry array to drain
 */

function cleanupAll(registry) {
  for (const fn of registry) {
    try { fn(); } catch (_) { /* ignore */ }
  }
  registry.length = 0;
}
let currentLang = globalThis.MultiAI_I18n?.currentLang || "zh-CN";
let I18N = globalThis.MultiAI_I18n?.messages || I18N_DATA[currentLang] || {};
const t = globalThis.MultiAI_I18n?.t || ((k) => k);
const grid = document.getElementById("panelGrid");
const promptEl = document.getElementById("prompt");
const sendAllBtn = document.getElementById("sendAll");
const settingsBtn = document.getElementById("openSettings");
const settingsPanel = document.getElementById("settingsPanel");
const pickerList = document.getElementById("pickerList");
const pickerCancel = document.getElementById("pickerCancel");
const pickerConfirm = document.getElementById("pickerConfirm");
const toggleSelectAllBtn = document.getElementById("toggleSelectAll");
const panelTemplate = document.getElementById("panelTemplate");
const colDecBtn = document.getElementById("colDec");
const colIncBtn = document.getElementById("colInc");
const langToggleBtn = document.getElementById("langToggle");
const dashboardFocusApi = globalThis.MultiAIDashboardFocus || {};
// DOM query caches — rebuilt when renderPanels() / initGridResizers() / buildPicker() run
/** @type {Map<number, HTMLElement>} data-index → .panel element */
let _panelByIndex = new Map();
/** @type {HTMLInputElement[]} picker checkbox elements */
let _pickerCheckboxes = [];
const promptFocusGuard = dashboardFocusApi.createPromptFocusGuard
  ? dashboardFocusApi.createPromptFocusGuard({ promptEl, documentRef: document, windowRef: window })
  : null;
const setFrameFocusShielded = dashboardFocusApi.setFrameFocusShielded || (() => false);
const PANEL_FOCUS_STEAL_GRACE_MS = 5000;
const PROMPT_FRAME_SHIELD_MS = 3000;
const PROMPT_COMPOSITION_SHIELD_MS = 5000;
const loadingPanelFrames = new Set();
const panelFrameLoadTokens = new WeakMap();
let panelFrameLoadSeq = 0;
let promptCompositionActive = false;
let promptFrameShieldUntil = 0;
let promptFrameShieldTimerId = null;
let promptProgrammaticFocusUnblockTimerId = null;
let activePanels = [];
let pendingPickTarget = null;
let colSizes = [];
let rowSizes = [];
let customGrid = { rows: 0, cols: 0 }; // 0 means auto
let sortedProviderIds = []; // Order of providers in settings
let sessionChildUrls = {};
const DEBUG = false; // Set to true for development debugging

/**
 * Sync mutable local state to the globalThis.MultiAI namespace.
 *
 * colSizes/rowSizes are NOT synced here — grid-resizer.js owns them
 * as the single source of truth via the namespace. They are only
 * written once, from loadState(), immediately after localStorage restore.
 */
function syncSharedState() {
  const s = globalThis.MultiAI;
  if (!s) return;
  s.activePanels = activePanels;
  s.customGrid = customGrid;
  s.I18N = I18N;
  s.sessionChildUrls = sessionChildUrls;
  s.panelByIndex = _panelByIndex;
}

function log(msg, ...args) {
  if (DEBUG) {
    console.log(`[MultiAI Dashboard] ${msg}`, ...args);
  }
}
log("Dashboard script loaded");

function applyI18n(root) {
  const scope = root || document;
  const elements = Array.from(scope.querySelectorAll("[data-i18n]"));
  elements.forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key || !I18N[key]) return;
    const attr = el.getAttribute("data-i18n-attr");
    if (attr) {
      // Support comma-separated attributes (e.g. "title,aria-label")
      attr.split(",").forEach((a) => {
        el.setAttribute(a.trim(), I18N[key]);
      });
    } else {
      el.textContent = I18N[key];
    }
  });
}

function toggleLanguage() {
  currentLang = currentLang === "zh-CN" ? "en-US" : "zh-CN";
  localStorage.setItem("multi-ai-lang", currentLang);
  I18N = I18N_DATA[currentLang] || {};
  // Update the i18n module so other modules read the new language
  if (globalThis.MultiAI_I18n) {
    globalThis.MultiAI_I18n.currentLang = currentLang;
    globalThis.MultiAI_I18n.messages = I18N;
  }
  syncSharedState();
  applyI18n();
  renderPanels(); // Re-render panels to translate dynamic content
  if (globalThis.MultiAITranscript) globalThis.MultiAITranscript.renderTranscriptPanel();
}

function loadState() {
  const stored = localStorage.getItem(dashboardStateKey);
  // Default sorted order is just the definition order
  sortedProviderIds = PROVIDERS.map(p => p.id);
  if (!stored) return;
  try {
    const state = JSON.parse(stored);
    if (Array.isArray(state.panels)) {
      activePanels = state.panels;
    }
    if (state.grid) {
      customGrid = state.grid;
    }
    if (Array.isArray(state.rowSizes)) {
      rowSizes = state.rowSizes;
    }
    if (Array.isArray(state.colSizes)) {
      colSizes = state.colSizes;
    }
    if (Array.isArray(state.sortedProviderIds)) {
      // Merge stored sort order with any new providers that might have appeared
      const storedSet = new Set(state.sortedProviderIds);
      const newProviders = sortedProviderIds.filter(id => !storedSet.has(id));
      sortedProviderIds = [...state.sortedProviderIds, ...newProviders];
    }
  } catch (error) {
    console.warn('[MultiAI Dashboard] loadState: Failed to parse stored state:', error);
    activePanels = [];
  }
  // Write grid sizes to namespace — the ONLY place local colSizes/rowSizes
  // are synced, since grid-resizer.js owns them after this point.
  const s = globalThis.MultiAI;
  if (s) {
    s.colSizes = colSizes;
    s.rowSizes = rowSizes;
  }
}

function saveState() {
  const s = globalThis.MultiAI || {};
  localStorage.setItem(dashboardStateKey, JSON.stringify({
    panels: s.activePanels || activePanels,
    grid: s.customGrid || customGrid,
    rowSizes: s.rowSizes || rowSizes,
    colSizes: s.colSizes || colSizes,
    sortedProviderIds
  }));
}
async function loadPanelsFromStorage() {
  log("Loading panels from storage...");
  const stored = await chrome.storage.local.get(dashboardPanelsKey);
  const value = stored[dashboardPanelsKey];
  if (currentSessionId && value && typeof value === "object" && !Array.isArray(value)) {
    // Layout (activePanels) is managed by localStorage via loadState().
    // Only read childSessionUrls from chrome.storage.local for iframe URL restoration.
    // Do NOT overwrite activePanels here — chrome.storage.local may be stale
    // because panel changes are only saved to localStorage via saveState().
    if (value.childSessionUrls && typeof value.childSessionUrls === "object") {
      sessionChildUrls = { ...value.childSessionUrls };
    }
    // New session: activePanels is empty because localStorage has no record yet.
    // Seed from session data so user-selected providers are respected.
    if (activePanels.length === 0 && Array.isArray(value.panels) && value.panels.length > 0) {
      activePanels = value.panels.slice();
      log("Seeded activePanels from session storage:", activePanels);
    }
    syncSharedState();
    return;
  }
  if (Array.isArray(value) && value.length > 0) {
    activePanels = value;
  }
  syncSharedState();
}

function buildPicker(selected) {
  pickerList.innerHTML = "";
  const selectedSet = new Set(selected);
  // Use sortedProviderIds to determine order, falling back to definition order if missing
  const order = sortedProviderIds.length > 0 ? sortedProviderIds : PROVIDERS.map(p => p.id);
  // Filter out any IDs that might no longer exist in PROVIDERS (cleanup)
  const validOrder = order.filter(id => PROVIDER_BY_ID[id]);
  // Append any new providers that aren't in the sorted list yet
  const validSet = new Set(validOrder);
  PROVIDERS.forEach(p => {
    if (!validSet.has(p.id)) {
      validOrder.push(p.id);
    }
  });
  // Update the global state to match this canonical list
  sortedProviderIds = validOrder;
  validOrder.forEach((id) => {
    const provider = PROVIDER_BY_ID[id];
    const item = document.createElement("label");
    item.className = "picker-item";
    item.draggable = true;
    item.dataset.providerId = provider.id;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = provider.id;
    checkbox.checked = selectedSet.has(provider.id);
    checkbox.id = `picker-${provider.id}`;
    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "::";
    const name = document.createElement("span");
    name.textContent = provider.label;
    item.appendChild(handle);
    item.appendChild(checkbox);
    item.appendChild(name);
    pickerList.appendChild(item);
    attachPickerDnD(item);
  });
  _pickerCheckboxes = Array.from(pickerList.querySelectorAll("input[type='checkbox']"));
}
let draggingPickerItem = null;

function animateDOMMove(parent, moveFunction) {
  const children = Array.from(parent.children);
  const positions = new Map(children.map(c => [c, c.getBoundingClientRect()]));
  moveFunction();
  // Force layout calculation
  // void parent.offsetWidth;
  requestAnimationFrame(() => {
    children.forEach(child => {
      const oldPos = positions.get(child);
      const newPos = child.getBoundingClientRect();
      if (!oldPos) return;
      const dx = oldPos.left - newPos.left;
      const dy = oldPos.top - newPos.top;
      if (dx !== 0 || dy !== 0) {
        // Invert the move
        child.style.transform = `translate(${dx}px, ${dy}px)`;
        child.style.transition = 'none';
        requestAnimationFrame(() => {
          // Remove inversion to animate to new position
          child.style.transition = 'transform 0.3s cubic-bezier(0.2, 0, 0.2, 1)';
          child.style.transform = '';
        });
      }
    });
  });
}

function attachPickerDnD(item) {
  item.addEventListener("dragstart", (event) => {
    draggingPickerItem = item;
    item.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    // Set a transparent image or similar if we want to hide the ghost,
    // but default ghost is fine.
  });
  item.addEventListener("dragend", () => {
    item.classList.remove("dragging");
    draggingPickerItem = null;
    // Save new order
    sortedProviderIds = Array.from(pickerList.children).map(el => el.dataset.providerId);
    saveState();
  });
  item.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (!draggingPickerItem || draggingPickerItem === item) return;
    const rect = item.getBoundingClientRect();
    const next = (event.clientY - rect.top) / (rect.height) > 0.5;
    const parent = item.parentNode;
    // Debounce or check if move is actually needed to avoid thrashing?
    // With FLIP, thrashing is handled by the animation system mostly, but we should be careful.
    // Check if we are already in the right spot
    if (next && item.nextSibling === draggingPickerItem) return;
    if (!next && item.previousSibling === draggingPickerItem) return;
    animateDOMMove(pickerList, () => {
      if (next) {
        parent.insertBefore(draggingPickerItem, item.nextSibling);
      } else {
        parent.insertBefore(draggingPickerItem, item);
      }
    });
  });
}

function openSettings(selected, targetIndex) {
  pendingPickTarget = targetIndex;
  buildPicker(selected);
  settingsPanel.hidden = false;
  document.body.classList.add("settings-open");
}

function closeSettings() {
  settingsPanel.hidden = true;
  pendingPickTarget = null;
  document.body.classList.remove("settings-open");
}

function readPickerSelection() {
  return _pickerCheckboxes
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function setPickerSelection(checked) {
  _pickerCheckboxes.forEach((input) => {
    input.checked = checked;
  });
}

function isAllSelected() {
  return _pickerCheckboxes.length > 0 && _pickerCheckboxes.every((input) => input.checked);
}
if (colDecBtn && colIncBtn) {
  colDecBtn.addEventListener("click", () => {
    let current = customGrid.cols || (globalThis.MultiAIGridResizer?.getColumnCount?.() || 1);
    if (current > 1) {
      customGrid.cols = current - 1;
      saveState();
      if (globalThis.MultiAIGridResizer) globalThis.MultiAIGridResizer.applyGridLayout(true);
    }
  });
  colIncBtn.addEventListener("click", () => {
    let current = customGrid.cols || (globalThis.MultiAIGridResizer?.getColumnCount?.() || 1);
    if (current < 6) {
      customGrid.cols = current + 1;
      saveState();
      if (globalThis.MultiAIGridResizer) globalThis.MultiAIGridResizer.applyGridLayout(true);
    }
  });
}
if (langToggleBtn) {
  langToggleBtn.addEventListener("click", toggleLanguage);
}

function applyPanelI18n(panelRoot) {
  const buttons = panelRoot.querySelectorAll("[data-i18n]");
  buttons.forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key || !I18N[key]) return;
    el.textContent = I18N[key];
  });
}

function attachPromptFocusRestore(iframe) {
  if (!iframe || !promptFocusGuard) {
    return;
  }
  iframe.addEventListener("focus", () => {
    restorePromptIfLoadingFrameFocused(iframe);
  });
  iframe.addEventListener("load", () => {
    promptFocusGuard.scheduleRestore({ allowedActiveElements: [iframe] });
    keepPanelFrameInFocusStealWindow(iframe);
  });
}

function markPanelFrameLoading(iframe) {
  if (!iframe) {
    return;
  }
  const token = ++panelFrameLoadSeq;
  loadingPanelFrames.add(iframe);
  panelFrameLoadTokens.set(iframe, token);
  applyFrameFocusShield(iframe);
  // Start focus guard to prevent iframe from stealing focus during loading
  if (typeof startFocusGuard === "function" && loadingPanelFrames.size > 0) {
    startFocusGuard();
  }
}

function keepPanelFrameInFocusStealWindow(iframe) {
  if (!iframe) {
    return;
  }
  markPanelFrameLoading(iframe);
  const token = panelFrameLoadTokens.get(iframe);
  window.setTimeout(() => {
    if (panelFrameLoadTokens.get(iframe) !== token) {
      return;
    }
    loadingPanelFrames.delete(iframe);
    panelFrameLoadTokens.delete(iframe);
    setFrameFocusShielded(iframe, false);
  }, PANEL_FOCUS_STEAL_GRACE_MS);
}

function restorePromptIfLoadingFrameFocused(iframe) {
  if (!iframe || !promptFocusGuard || !loadingPanelFrames.has(iframe)) {
    return;
  }
  promptFocusGuard.restoreIfFocusMovedToIframe({ allowedActiveElements: [iframe] });
}

function cleanupDetachedLoadingPanelFrames() {
  for (const iframe of Array.from(loadingPanelFrames)) {
    if (!document.contains(iframe)) {
      loadingPanelFrames.delete(iframe);
      panelFrameLoadTokens.delete(iframe);
      setFrameFocusShielded(iframe, false);
    }
  }
}

function applyFrameFocusShield(iframe) {
  if (!iframe || !loadingPanelFrames.has(iframe)) {
    return;
  }
  // Always shield loading iframes - they should never steal focus while loading
  setFrameFocusShielded(iframe, true);
}

function applyFrameFocusShields() {
  cleanupDetachedLoadingPanelFrames();
  loadingPanelFrames.forEach((iframe) => {
    applyFrameFocusShield(iframe);
  });
}

function scheduleFrameShieldRelease() {
  if (promptFrameShieldTimerId) {
    clearTimeout(promptFrameShieldTimerId);
    promptFrameShieldTimerId = null;
  }
  if (promptCompositionActive) {
    return;
  }
  const remainingMs = promptFrameShieldUntil - Date.now();
  if (remainingMs <= 0) {
    applyFrameFocusShields();
    return;
  }
  promptFrameShieldTimerId = setTimeout(() => {
    promptFrameShieldTimerId = null;
    applyFrameFocusShields();
  }, remainingMs + 20);
}

function refreshPromptFrameShield(durationMs = PROMPT_FRAME_SHIELD_MS) {
  promptFrameShieldUntil = Math.max(promptFrameShieldUntil, Date.now() + durationMs);
  applyFrameFocusShields();
  scheduleFrameShieldRelease();
}

function setPromptProgrammaticFocusBlocked(blocked) {
  if (promptProgrammaticFocusUnblockTimerId) {
    clearTimeout(promptProgrammaticFocusUnblockTimerId);
    promptProgrammaticFocusUnblockTimerId = null;
  }
  if (promptFocusGuard && promptFocusGuard.setProgrammaticFocusBlocked) {
    promptFocusGuard.setProgrammaticFocusBlocked(blocked);
  }
}

function renderPanels() {
  if (promptFocusGuard) {
    promptFocusGuard.captureIfPromptFocused();
  }
  grid.innerHTML = "";
  activePanels.forEach((panel, index) => {
    const provider = PROVIDER_BY_ID[panel];
    if (!provider) return;
    const node = panelTemplate.content.cloneNode(true);
    const panelEl = node.querySelector(".panel");
    panelEl.dataset.index = String(index);
    panelEl.dataset.providerId = provider.id;
    const title = node.querySelector(".panel-title");
    title.innerHTML = ""; // Clear existing
    const legacyBadge = node.querySelector(".panel-header > .panel-badge");
    if (legacyBadge) {
      legacyBadge.remove();
    }
    // Icon
    const icon = document.createElement("img");
    icon.src = FaviconCache.getFaviconSrc(provider.id);
    icon.onerror = () => { icon.style.display = "none"; }; // Hide if fails
    title.appendChild(icon);
    // Label
    const label = document.createElement("span");
    label.textContent = provider.label;
    title.appendChild(label);
    // Badge (Shortcut Index) - moved to title
    const badge = document.createElement("span");
    badge.className = "panel-badge";
    badge.textContent = `@${index + 1}`;
    title.appendChild(badge);
    const iframe = node.querySelector(".panel-frame");
    const panelBody = node.querySelector(".panel-body");
    if (globalThis.MultiAISend?.IFRAME_BLOCKED_PROVIDERS?.has(provider.id)) {
      iframe.src = "about:blank";
      const blocked = document.createElement("div");
      blocked.className = "panel-blocked";
      blocked.textContent = t("panelBlocked");
      blocked.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "openProviderTab", provider: provider.id });
      });
      panelBody.appendChild(blocked);
    } else {
      attachPromptFocusRestore(iframe);
      markPanelFrameLoading(iframe);
      iframe.src = sessionChildUrls[provider.id] || provider.url;
    }
    const header = node.querySelector(".panel-header");
    let actions = node.querySelector(".panel-header-actions");
    if (!actions && header) {
      actions = document.createElement("div");
      actions.className = "panel-header-actions";
      header.appendChild(actions);
    }
    const liveStatus = document.createElement("span");
    liveStatus.className = "panel-live-status";
    liveStatus.dataset.providerId = provider.id;
    liveStatus.dataset.status = "idle";
    liveStatus.textContent = globalThis.MultiAITranscript?.getLocalizedStatusText?.("idle", "short") || t("statusIdleShort");
    actions.appendChild(liveStatus);
    // Helper to create action button
    const createActionBtn = (title, svgPath, actionName) => {
        const btn = document.createElement("button");
        btn.className = "header-action-btn";
        btn.title = title;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>`;
        btn.addEventListener("pointerdown", () => {
            if (promptFocusGuard) {
                promptFocusGuard.captureIfPromptFocused({ allowedActiveElements: [btn] });
            }
        });
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            handlePanelAction(panelEl, provider, actionName, btn);
        });
        return btn;
    };
    // 1. Open in New Tab
    actions.appendChild(createActionBtn(
        I18N.newTab,
        `<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>`,
        "newtab"
    ));
    // 2. Refresh
    actions.appendChild(createActionBtn(
        I18N.refresh,
        `<path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>`,
        "refresh"
    ));
    // 3. Close
    actions.appendChild(createActionBtn(
        I18N.close,
        `<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>`,
        "close"
    ));
    applyPanelI18n(node);
    grid.appendChild(node);
  });
  // Rebuild panel index cache (panels are now in DOM)
  _panelByIndex.clear();
  for (const el of grid.querySelectorAll(".panel")) {
    _panelByIndex.set(Number(el.dataset.index), el);
  }
  if (globalThis.MultiAIGridResizer) globalThis.MultiAIGridResizer.applyGridLayout();
  if (globalThis.MultiAISend) globalThis.MultiAISend.updateShortcutHint();
  if (globalThis.MultiAITranscript) globalThis.MultiAITranscript.syncPanelLiveStatuses();
}
// Global click listener for Settings Modal
const _settingsClickHandler = (event) => {
    if (!settingsPanel.hidden) {
        // Close if clicking outside the settings card and not on the toggle button
        if (!settingsPanel.contains(event.target) &&
            event.target !== settingsBtn &&
            !settingsBtn.contains(event.target)) {
            closeSettings();
        }
    }
};
document.addEventListener("click", _settingsClickHandler);
registerCleanup(_cleanupHandlers, () => document.removeEventListener("click", _settingsClickHandler));

function handlePanelAction(panelEl, provider, action, actionButton = null) {
  const index = Number(panelEl.dataset.index);
  if (Number.isNaN(index)) return;
  if (action === "refresh") {
    const iframe = panelEl.querySelector("iframe");
    if (promptFocusGuard) {
      promptFocusGuard.scheduleRestore({ allowedActiveElements: [actionButton, iframe] });
    }
    markPanelFrameLoading(iframe);
    if (iframe && iframe.contentWindow) {
      try {
        iframe.contentWindow.location.reload();
      } catch (e) {
        iframe.src = iframe.src; // eslint-disable-line no-self-assign -- cross-origin iframe reload fallback
      }
    }
    return;
  }
  if (action === "newtab") {
    // Try to get current URL from iframe content script
    const iframe = panelEl.querySelector("iframe");
    if (iframe && iframe.contentWindow) {
      // Set a timeout fallback
      let resolved = false;
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          chrome.runtime.sendMessage({ type: "openProviderTab", provider: provider.id });
        }
      }, 500);
      // Listen for one-time response
      const listener = (event) => {
        if (!ALLOWED_IFRAME_ORIGINS.has(event.origin)) return;
        const data = event.data || {};
        if (data.source === "multi-ai-content" && data.type === "pageUrl" && data.provider === provider.id) {
          // Verify event.source matches the provider's iframe
          const panelIframe = globalThis.MultiAISend?.getPanelIframe?.(provider.id);
          if (!panelIframe || event.source !== panelIframe.contentWindow) return;
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            window.removeEventListener("message", listener);
            const targetUrl = data.url || provider.url;
            window.open(targetUrl, "_blank");
          }
        }
      };
      window.addEventListener("message", listener);
      // Request URL
      iframe.contentWindow.postMessage({
        source: "multi-ai",
        type: "getPageUrl",
        provider: provider.id
      }, "*");
    } else {
      chrome.runtime.sendMessage({ type: "openProviderTab", provider: provider.id });
    }
    return;
  }
  if (action === "close") {
    const timerId = globalThis.MultiAISend?.sendStatusTimers?.get(provider.id);
    if (timerId) {
      clearTimeout(timerId);
      globalThis.MultiAISend?.sendStatusTimers?.delete(provider.id);
    }
    activePanels.splice(index, 1);
    saveState();
    renderPanels();
    return;
  }
  if (action === "switch") {
    openSettings([provider.id], index);
    return;
  }
  if (action === "add") {
    openSettings(activePanels, null);
  }
}

function showMessage(text, type = "info") {
  // Create or update status message
  let messageEl = document.getElementById("statusMessage");
  if (!messageEl) {
    messageEl = document.createElement("div");
    messageEl.id = "statusMessage";
    messageEl.className = "status-message";
    document.querySelector(".composer").appendChild(messageEl);
  }
  messageEl.textContent = text;
  messageEl.className = `status-message status-${type}`;
  messageEl.style.display = "block";
  setTimeout(() => {
    messageEl.style.display = "none";
  }, 3000);
}
const _mainMessageHandler = (event) => {
  if (!ALLOWED_IFRAME_ORIGINS.has(event.origin)) return;
  const data = event.data || {};
  if (data.source !== "multi-ai-content") return;
  // Verify event.source matches the claimed provider's iframe to prevent
  // spoofing from same-origin but different iframes.
  const providerId = data.provider;
  if (providerId) {
    const iframe = globalThis.MultiAISend?.getPanelIframe?.(providerId);
    if (!iframe || event.source !== iframe.contentWindow) return;
  }
  // Handle forwarded logs for unified debugging
  if (data.type === "log") {
    if (DEBUG) {
      console.log(`[Via Iframe] [MultiAI Content] ${data.message}`, ...(data.args || []));
    }
    return;
  }
  log(`Received message from ${data.provider}: ${data.type}`, data);
  const send = globalThis.MultiAISend;
  if (data.type === "sendResult") {
    if (DEBUG) {
      console.log(`[MultiAI Dashboard] Send result for ${data.provider}: ${data.success ? "SUCCESS" : "FAILED"}`);
    }
    if (send) send.resolvePendingSend(data.provider, data.success);
    if (globalThis.MultiAITranscript) globalThis.MultiAITranscript.scheduleTranscriptRefresh(250);
    if (data.success === false) {
      if (send) send.failedResponses.add(data.provider);
      if (send) send.setPanelBadgeStatus(data.provider, "error");
    } else {
      if (send) send.startedResponses.add(data.provider);
      if (send) send.setPanelBadgeStatus(data.provider, "success");
    }
    if (send) send.updateSendingState();
    return;
  }
  if (data.type === "responseStarted") {
    if (DEBUG) {
      console.log(`[MultiAI Dashboard] Response started for ${data.provider}`);
    }
    if (globalThis.MultiAITranscript) globalThis.MultiAITranscript.scheduleTranscriptRefresh(250);
    if (send) send.startedResponses.add(data.provider);
    if (send) send.setPanelBadgeStatus(data.provider, "success");
    if (send) send.updateSendingState();
    return;
  }
  if (data.type === "responseComplete") {
    if (globalThis.MultiAITranscript) globalThis.MultiAITranscript.scheduleTranscriptRefresh(250);
    if (send) send.completedResponses.add(data.provider);
    if (send) send.startedResponses.add(data.provider);
    if (send) send.setPanelBadgeStatus(data.provider, "success");
    if (send) send.updateSendingState();
  }
};
window.addEventListener("message", _mainMessageHandler);
registerCleanup(_cleanupHandlers, () => window.removeEventListener("message", _mainMessageHandler));

function ensureDefaultPanels() {
  if (activePanels.length === 0) {
    activePanels = ["chatgpt", "claude"];
  }
}

function enforceMaxPanels(list) {
  return list.slice(0, MAX_PANELS);
}
applyI18n();
// Initialize transcript scaffold (creates workspace and transcript panel)
if (globalThis.MultiAITranscript) {
  globalThis.MultiAITranscript.ensureTranscriptScaffold();
}
// Populate shared namespace with callbacks and mutable state
if (globalThis.MultiAI) {
  globalThis.MultiAI.log = log;
  globalThis.MultiAI.showMessage = showMessage;
  globalThis.MultiAI.saveState = saveState;
}
syncSharedState();

function notePromptInteraction() {
  if (promptFocusGuard) {
    promptFocusGuard.notePromptInteraction();
  }
  refreshPromptFrameShield();
}
promptEl.addEventListener("focus", notePromptInteraction);
promptEl.addEventListener("pointerdown", notePromptInteraction);
promptEl.addEventListener("keydown", notePromptInteraction);
promptEl.addEventListener("input", notePromptInteraction);
promptEl.addEventListener("compositionstart", () => {
  promptCompositionActive = true;
  setPromptProgrammaticFocusBlocked(true);
  notePromptInteraction();
});
promptEl.addEventListener("compositionend", () => {
  promptCompositionActive = false;
  notePromptInteraction();
  refreshPromptFrameShield(PROMPT_COMPOSITION_SHIELD_MS);
  promptProgrammaticFocusUnblockTimerId = setTimeout(() => {
    promptProgrammaticFocusUnblockTimerId = null;
    setPromptProgrammaticFocusBlocked(false);
  }, 80);
});
// Aggressive focus guard: use requestAnimationFrame (~16ms) to prevent iframe focus stealing.
// Cross-origin iframes can steal focus via JS (window.focus), which breaks IME composition.
// inert/tabindex only blocks user-initiated focus, not programmatic focus from iframe content.
// rAF is fast enough that IME composition state is preserved.
// Auto-stops after 30s to avoid unnecessary resource usage.
let focusGuardRafId = null;
let focusGuardActive = false;
let focusGuardTimeoutId = null;
const FOCUS_GUARD_MAX_MS = 30000;

function startFocusGuard() {
  if (focusGuardActive) return;
  focusGuardActive = true;
  const startedAt = Date.now();
  const tick = () => {
    if (!focusGuardActive || loadingPanelFrames.size === 0) {
      stopFocusGuard();
      return;
    }
    // Auto-stop after 30s
    if (Date.now() - startedAt > FOCUS_GUARD_MAX_MS) {
      stopFocusGuard();
      return;
    }
    const active = document.activeElement;
    if (active && active.tagName === "IFRAME" && loadingPanelFrames.has(active)) {
      if (promptEl && typeof promptEl.focus === "function") {
        promptEl.focus({ preventScroll: true });
      }
    }
    focusGuardRafId = window.requestAnimationFrame(tick);
  };
  focusGuardRafId = window.requestAnimationFrame(tick);
}

function stopFocusGuard() {
  focusGuardActive = false;
  if (focusGuardRafId) {
    window.cancelAnimationFrame(focusGuardRafId);
    focusGuardRafId = null;
  }
  if (focusGuardTimeoutId) {
    window.clearTimeout(focusGuardTimeoutId);
    focusGuardTimeoutId = null;
  }
}
  // Auto-resize textarea
  promptEl.addEventListener("input", () => {
    promptEl.style.height = "auto";
    promptEl.style.height = Math.min(promptEl.scrollHeight, 100) + "px"; // 100px is approx 3.5 lines (24px * 3.5 + padding)
  });
  sendAllBtn.addEventListener("click", () => { if (globalThis.MultiAISend) globalThis.MultiAISend.sendPrompt(); });
settingsBtn.addEventListener("click", () => openSettings(activePanels, null));
promptEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (globalThis.MultiAISend) globalThis.MultiAISend.sendPrompt();
    return;
  }
  if (event.key === "Backspace" && !promptEl.value && (globalThis.MultiAISend?.selectedTargets?.length || 0) > 0) {
    if (globalThis.MultiAISend) {
      globalThis.MultiAISend.selectedTargets = globalThis.MultiAISend.selectedTargets.slice(0, -1);
      globalThis.MultiAISend.renderTargetChips();
      globalThis.MultiAISend.updateSendButtonState();
    }
  }
});
promptEl.addEventListener("input", () => {
  if (globalThis.MultiAISend) {
    globalThis.MultiAISend.syncTargetsFromPrompt();
    globalThis.MultiAISend.updateSendButtonState();
  }
});
pickerCancel.addEventListener("click", closeSettings);
if (toggleSelectAllBtn) {
  toggleSelectAllBtn.addEventListener("click", () => {
    setPickerSelection(!isAllSelected());
  });
}
pickerConfirm.addEventListener("click", () => {
  const selection = enforceMaxPanels(readPickerSelection());
  if (selection.length === 0) {
    closeSettings();
    return;
  }
  if (pendingPickTarget !== null && pendingPickTarget >= 0) {
    const replacement = selection[0] || activePanels[pendingPickTarget];
    activePanels[pendingPickTarget] = replacement;
    saveState();
    renderPanels();
  } else {
    activePanels = selection;
    syncSharedState();
    saveState();
    renderPanels();
  }
  closeSettings();
});
window.addEventListener("beforeunload", () => {
  stopFocusGuard();
  if (globalThis.MultiAITranscript) globalThis.MultiAITranscript.cleanupTranscript();
  if (promptFrameShieldTimerId) {
    clearTimeout(promptFrameShieldTimerId);
  }
  if (promptProgrammaticFocusUnblockTimerId) {
    clearTimeout(promptProgrammaticFocusUnblockTimerId);
  }
  cleanupAll(_cleanupHandlers);
  saveState();
});
// Initialize transcript dock, view mode button, and refresh button
if (globalThis.MultiAITranscript) {
  globalThis.MultiAITranscript.initTranscriptDock();
}
const _visibilityChangeHandler = () => {
  if (!document.hidden) {
    if (globalThis.MultiAITranscript) globalThis.MultiAITranscript.scheduleTranscriptRefresh(0);
  }
};
document.addEventListener("visibilitychange", _visibilityChangeHandler);
registerCleanup(_cleanupHandlers, () => document.removeEventListener("visibilitychange", _visibilityChangeHandler));
loadState();
syncSharedState();
loadPanelsFromStorage()
  .catch((err) => console.warn("[MultiAI Dashboard] loadPanelsFromStorage:", err))
  .finally(() => {
    ensureDefaultPanels();
    activePanels = normalizeProviders(activePanels, MAX_PANELS);
    syncSharedState();
    // Render panels immediately — don't block on favicon preload
    if (promptFocusGuard) {
      promptFocusGuard.focusPrompt();
      promptFocusGuard.captureIfPromptFocused();
    }
    renderPanels();
    if (globalThis.MultiAITranscript) globalThis.MultiAITranscript.startTranscriptPolling();
    // Preload favicons in background (non-blocking)
    FaviconCache.preloadFavicons(activePanels).catch(function (err) {
      console.warn("[MultiAI Dashboard] preloadFavicons:", err);
    });
  });
