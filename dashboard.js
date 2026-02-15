const STATE_KEY = "multi-ai-dashboard";
const MAX_PANELS = typeof DASHBOARD_MAX_PANELS === "number" ? DASHBOARD_MAX_PANELS : 6;
const DASHBOARD_KEY = "multi-ai-dashboard-panels";

const I18N_DATA = {
  "zh-CN": {
    topbarSubtitle: "",
    settings: "设置",
    composerLabel: "提示词",
    composerPlaceholder: "Enter 发送，Shift+Enter换行",
    sendAll: "发送",
    settingsTitle: "选择 AI",
    settingsSubtitle: `最多 ${MAX_PANELS} 个分屏`,
    cancel: "取消",
    confirm: "确认",
    refresh: "刷新",
    newTab: "新标签页",
    close: "关闭",
    switch: "切换 AI",
    add: "添加 AI",
    shortcutPrefix: "快捷键",
    langBtn: "En"
  },
  "en-US": {
    topbarSubtitle: "",
    settings: "Settings",
    composerLabel: "Prompt",
    composerPlaceholder: "Enter to send, Shift+Enter for new line",
    sendAll: "Send",
    settingsTitle: "Select AI",
    settingsSubtitle: `Up to ${MAX_PANELS} panels`,
    cancel: "Cancel",
    confirm: "Confirm",
    refresh: "Refresh",
    newTab: "New Tab",
    close: "Close",
    switch: "Switch AI",
    add: "Add AI",
    shortcutPrefix: "Shortcut",
    langBtn: "中"
  }
};

let currentLang = localStorage.getItem("multi-ai-lang") || "zh-CN";
let I18N = I18N_DATA[currentLang];

const grid = document.getElementById("panelGrid");
const promptEl = document.getElementById("prompt");
const sendAllBtn = document.getElementById("sendAll");
const settingsBtn = document.getElementById("openSettings");
// const chatroomBtn = document.getElementById("openChatroom"); // Removed
const settingsPanel = document.getElementById("settingsPanel");
const pickerList = document.getElementById("pickerList");
const pickerCancel = document.getElementById("pickerCancel");
const pickerConfirm = document.getElementById("pickerConfirm");
const toggleSelectAllBtn = document.getElementById("toggleSelectAll");
const panelTemplate = document.getElementById("panelTemplate");
const colDecBtn = document.getElementById("colDec");
const colIncBtn = document.getElementById("colInc");
const colDisplay = document.getElementById("colDisplay");
const shortcutHint = document.getElementById("shortcutHint");
// const clearGroupChatBtn = document.getElementById("clearGroupChat"); // Removed
const targetChips = document.getElementById("targetChips");
const langToggleBtn = document.getElementById("langToggle"); // New

let activePanels = [];
let pendingPickTarget = null;
let colSizes = [];
let rowSizes = [];
let customGrid = { rows: 0, cols: 0 }; // 0 means auto
let sortedProviderIds = []; // Order of providers in settings
let currentSendTargets = [];
let completedResponses = new Set();
let startedResponses = new Set();
let failedResponses = new Set();
let selectedTargets = [];
let suppressPromptInput = false;

const DEBUG = true; // Set to false in production

function log(msg, ...args) {
  if (DEBUG) {
    console.log(`[MultiAI Dashboard] ${msg}`, ...args);
  }
}

log("Dashboard script loaded");

const IFRAME_BLOCKED_PROVIDERS = new Set([]);
const SEND_TIMEOUT_MS = 15000;
const sendStatusTimers = new Map();
const pendingSends = new Map();
const BADGE_STATUS_CLASSES = ["status-sending", "status-success", "status-error"];

function applyI18n(root) {
  const scope = root || document;
  const elements = Array.from(scope.querySelectorAll("[data-i18n]"));
  elements.forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key || !I18N[key]) return;
    const attr = el.getAttribute("data-i18n-attr");
    if (attr) {
      el.setAttribute(attr, I18N[key]);
    } else {
      el.textContent = I18N[key];
    }
  });
}

function toggleLanguage() {
  currentLang = currentLang === "zh-CN" ? "en-US" : "zh-CN";
  localStorage.setItem("multi-ai-lang", currentLang);
  I18N = I18N_DATA[currentLang];
  applyI18n();
  renderPanels(); // Re-render panels to translate dynamic content
}

function loadState() {
  const stored = localStorage.getItem(STATE_KEY);

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
  } catch {
    activePanels = [];
  }
}

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify({
    panels: activePanels,
    grid: customGrid,
    rowSizes,
    colSizes,
    sortedProviderIds
  }));
}

async function loadPanelsFromStorage() {
  log("Loading panels from storage...");
  const stored = await chrome.storage.local.get(DASHBOARD_KEY);
  const panels = stored[DASHBOARD_KEY];
  if (Array.isArray(panels) && panels.length > 0) {
    activePanels = panels;
  }
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
  return Array.from(pickerList.querySelectorAll("input[type='checkbox']"))
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function setPickerSelection(checked) {
  pickerList.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = checked;
  });
}

function isAllSelected() {
  const inputs = Array.from(pickerList.querySelectorAll("input[type='checkbox']"));
  return inputs.length > 0 && inputs.every((input) => input.checked);
}

function getColumnCount() {
  if (customGrid.cols > 0) return customGrid.cols;

  const n = activePanels.length;
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return 4;
}

function getRowCount(colCount) {
  // Always calculate needed rows based on content
  const neededRows = Math.ceil(activePanels.length / Math.max(colCount, 1));
  return Math.max(neededRows, 1);
}

function syncGridInputs() {
  const colCount = getColumnCount();
  if (colDisplay) {
    colDisplay.textContent = customGrid.cols > 0 ? customGrid.cols : "Auto";
  }
}

function applyGridLayout(resetSizes = false) {
  const colCount = getColumnCount();
  const rowCount = getRowCount(colCount);

  grid.classList.remove("cols-1", "cols-2", "cols-3", "cols-4", "cols-5", "cols-6");
  grid.classList.add(`cols-${Math.min(Math.max(colCount, 1), 6)}`);

  if (resetSizes || colSizes.length !== colCount) {
    const equal = 100 / Math.max(colCount, 1);
    colSizes = new Array(colCount).fill(equal);
  }
  grid.style.gridTemplateColumns = colSizes.length
    ? colSizes.map((v) => `${v}%`).join(" ")
    : "";

  if (rowCount <= 1) {
    rowSizes = [];
    grid.style.gridTemplateRows = "";
  } else {
    if (resetSizes || rowSizes.length !== rowCount) {
      const oldSizes = rowSizes || [];
      const newSizes = [];
      // Inherit height from previous row or default to 400
      for (let i = 0; i < rowCount; i++) {
        if (i < oldSizes.length) {
          newSizes[i] = oldSizes[i];
        } else {
          newSizes[i] = i > 0 ? newSizes[i - 1] : 400;
        }
      }
      rowSizes = newSizes;
    }
    grid.style.gridTemplateRows = rowSizes.map((px) => `${px}px`).join(" ");
  }

  syncGridInputs();
  initGridResizers();
}

function updateShortcutHint() {
  if (!shortcutHint) return;
  const labels = activePanels.map((id, index) => {
    const provider = PROVIDER_BY_ID[id];
    const name = provider ? provider.label : id;
    return `@${index + 1} ${name}`;
  });
  const text = labels.join(" / ");
  if (text && (promptEl.value || "").includes("@")) {
    shortcutHint.textContent = text;
    shortcutHint.style.display = "block";
  } else {
    shortcutHint.textContent = "";
    shortcutHint.style.display = "none";
  }
}

function renderTargetChips() {
  if (!targetChips) return;
  targetChips.innerHTML = "";
  selectedTargets.forEach((providerId) => {
    const provider = PROVIDER_BY_ID[providerId];
    const chip = document.createElement("span");
    chip.className = "composer-chip";
    const code = document.createElement("code");
    code.textContent = `@${provider?.label || providerId}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", "Remove");
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      selectedTargets = selectedTargets.filter((id) => id !== providerId);
      renderTargetChips();
      updateSendButtonState();
    });
    chip.appendChild(code);
    chip.appendChild(remove);
    targetChips.appendChild(chip);
  });
}

function parseTargetsFromInput(text) {
  const matches = text.match(/@(\d+)/g) || [];
  const targets = [];
  matches.forEach((token) => {
    const index = Number(token.slice(1));
    if (Number.isFinite(index) && index >= 1 && index <= activePanels.length) {
      targets.push(activePanels[index - 1]);
    }
  });
  return Array.from(new Set(targets));
}

function stripTargetTokens(text) {
  return text.replace(/@(\d+)(?=[\s:：]|$|[^0-9])/g, "").replace(/\s{2,}/g, " ").trimStart();
}

function syncTargetsFromPrompt() {
  if (suppressPromptInput) return;
  const text = promptEl.value || "";
  const targets = parseTargetsFromInput(text);
  if (targets.length === 0) return;
  selectedTargets = Array.from(new Set([...selectedTargets, ...targets]));
  const stripped = stripTargetTokens(text);
  if (stripped !== text) {
    suppressPromptInput = true;
    promptEl.value = stripped;
    suppressPromptInput = false;
  }
  renderTargetChips();
}














if (colDecBtn && colIncBtn) {
  colDecBtn.addEventListener("click", () => {
    let current = customGrid.cols || getColumnCount();
    if (current > 1) {
      customGrid.cols = current - 1;
      saveState();
      applyGridLayout(true);
    }
  });

  colIncBtn.addEventListener("click", () => {
    let current = customGrid.cols || getColumnCount();
    if (current < 6) {
      customGrid.cols = current + 1;
      saveState();
      applyGridLayout(true);
    }
  });
}

if (langToggleBtn) {
  langToggleBtn.addEventListener("click", toggleLanguage);
}


function updateSendButtonState() {
  const { targets } = parseTargetPrompt(promptEl.value || "");
  const hasInlineTargets = targets.length > 0;
  const hasChips = selectedTargets.length > 0;
  if (hasInlineTargets && !hasChips) {
    sendAllBtn.classList.add("composer-send-target");
  } else {
    sendAllBtn.classList.remove("composer-send-target");
  }
  updateShortcutHint();
}

function applyPanelI18n(panelRoot) {
  const buttons = panelRoot.querySelectorAll("[data-i18n]");
  buttons.forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key || !I18N[key]) return;
    el.textContent = I18N[key];
  });
}

function renderPanels() {
  grid.innerHTML = "";

  activePanels.forEach((panel, index) => {
    const provider = PROVIDER_BY_ID[panel];
    if (!provider) return;

    const node = panelTemplate.content.cloneNode(true);
    const panelEl = node.querySelector(".panel");
    panelEl.dataset.index = String(index);

    const title = node.querySelector(".panel-title");
    title.innerHTML = ""; // Clear existing
    
    // Icon
    const icon = document.createElement("img");
    icon.src = `https://www.google.com/s2/favicons?domain=${new URL(provider.url).hostname}&sz=32`;
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
    if (IFRAME_BLOCKED_PROVIDERS.has(provider.id)) {
      iframe.src = "about:blank";
      const blocked = document.createElement("div");
      blocked.className = "panel-blocked";
      blocked.textContent = "This site cannot be embedded. Open in a new tab.";
      blocked.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "openProviderTab", provider: provider.id });
      });
      panelBody.appendChild(blocked);
    } else {
      iframe.src = provider.url;
    }

    const header = node.querySelector(".panel-header");
    const actions = node.querySelector(".panel-header-actions");
    
    // Helper to create action button
    const createActionBtn = (title, svgPath, actionName) => {
        const btn = document.createElement("button");
        btn.className = "header-action-btn";
        btn.title = title;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>`;
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            handlePanelAction(panelEl, provider, actionName);
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

  applyGridLayout();
  updateShortcutHint();
}

// Global click listener for Settings Modal
document.addEventListener("click", (event) => {
    if (!settingsPanel.hidden) {
        // Close if clicking outside the settings card and not on the toggle button
        if (!settingsPanel.contains(event.target) && 
            event.target !== settingsBtn && 
            !settingsBtn.contains(event.target)) {
            closeSettings();
        }
    }
});

function handlePanelAction(panelEl, provider, action) {
  const index = Number(panelEl.dataset.index);
  if (Number.isNaN(index)) return;

  if (action === "refresh") {
    const iframe = panelEl.querySelector("iframe");
    if (iframe && iframe.contentWindow) {
      try {
        iframe.contentWindow.location.reload();
      } catch (e) {
        iframe.src = iframe.src;
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
        const data = event.data || {};
        if (data.source === "multi-ai-content" && data.type === "pageUrl" && data.provider === provider.id) {
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
    const timerId = sendStatusTimers.get(provider.id);
    if (timerId) {
      clearTimeout(timerId);
      sendStatusTimers.delete(provider.id);
    }
    activePanels.splice(index, 1);
    panelEl.remove();
    const panels = Array.from(grid.querySelectorAll(".panel"));
    panels.forEach((panel, idx) => {
      panel.dataset.index = String(idx);
      const badge = panel.querySelector(".panel-badge");
      if (badge) {
        badge.textContent = `@${idx + 1}`;
      }
      const title = panel.querySelector(".panel-title");
      const providerId = activePanels[idx];
      const targetProvider = PROVIDER_BY_ID[providerId];
      if (title && targetProvider) {
        title.textContent = targetProvider.label;
      }
    });
    saveState();
    applyGridLayout();
    updateShortcutHint();
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

function parseTargetPrompt(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("@")) {
    return { prompt: trimmed, targets: [] };
  }

  const targets = [];
  let rest = trimmed;
  while (rest.startsWith("@")) {
    const match = rest.match(/^@(\d+)(?=[\s:：]|$|[^0-9])/);
    if (!match) break;
    const index = Number(match[1]);
    if (Number.isFinite(index) && index >= 1 && index <= activePanels.length) {
      targets.push(activePanels[index - 1]);
    }
    rest = rest.slice(match[0].length);
    if (rest.startsWith(":") || rest.startsWith("：")) {
      rest = rest.slice(1);
    }
    rest = rest.trimStart();
  }

  if (targets.length === 0) {
    return { prompt: trimmed, targets: [] };
  }

  return {
    prompt: rest,
    targets: Array.from(new Set(targets))
  };
}

function getPanelIframe(providerId) {
  const index = activePanels.indexOf(providerId);
  if (index < 0) return null;
  const panel = grid.querySelector(`.panel[data-index='${index}']`);
  if (!panel) return null;
  return panel.querySelector("iframe");
}

function getPanelBadge(providerId) {
  const index = activePanels.indexOf(providerId);
  if (index < 0) return null;
  const panel = grid.querySelector(`.panel[data-index='${index}']`);
  if (!panel) return null;
  return panel.querySelector(".panel-badge");
}

function setPanelBadgeStatus(providerId, status) {
  const badge = getPanelBadge(providerId);
  if (!badge) return;

  const existingTimer = sendStatusTimers.get(providerId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    sendStatusTimers.delete(providerId);
  }

  badge.classList.remove(...BADGE_STATUS_CLASSES);
  if (!status) return;

  const className = `status-${status}`;
  badge.classList.add(className);

  if (status === "success" || status === "error") {
    const timerId = setTimeout(() => {
      const latest = getPanelBadge(providerId);
      if (latest) {
        latest.classList.remove(className);
      }
      sendStatusTimers.delete(providerId);
    }, 2000);
    sendStatusTimers.set(providerId, timerId);
  }
}

function updateSendingState() {
  if (!currentSendTargets.length) return;
  const pending = currentSendTargets.filter((providerId) =>
    !startedResponses.has(providerId) && !failedResponses.has(providerId)
  );
  if (pending.length > 0) return;
  sendAllBtn.disabled = false;
  sendAllBtn.textContent = I18N.sendAll;
  currentSendTargets = [];
}

function resolvePendingSend(providerId, success) {
  const pending = pendingSends.get(providerId);
  if (!pending) return;
  clearTimeout(pending.timeoutId);
  pendingSends.delete(providerId);
  pending.resolve(Boolean(success));
}

function sendPromptToProvider(providerId, prompt) {
  if (!providerId || !prompt) {
    return Promise.resolve(false);
  }

  const iframe = getPanelIframe(providerId);

  return new Promise((resolve) => {
    if (pendingSends.has(providerId)) {
      resolvePendingSend(providerId, false);
    }

    const timeoutId = setTimeout(() => {
      resolvePendingSend(providerId, false);
    }, SEND_TIMEOUT_MS);

    pendingSends.set(providerId, { resolve, timeoutId });

    if (!iframe || !iframe.contentWindow || IFRAME_BLOCKED_PROVIDERS.has(providerId)) {
      chrome.runtime.sendMessage({ type: "sendPromptToProviderTab", provider: providerId, prompt })
        .then((res) => resolvePendingSend(providerId, res && res.ok))
        .catch(() => resolvePendingSend(providerId, false));
      return;
    }

    try {
      iframe.contentWindow.postMessage({
        source: "multi-ai",
        type: "sendPrompt",
        provider: providerId,
        prompt
      }, "*");
    } catch (e) {
      resolvePendingSend(providerId, false);
    }
  });
}

async function sendPrompt() {
  const text = promptEl.value.trim();
  if (!text) {
    showMessage("Please enter a prompt", "warning");
    return;
  }

  if (activePanels.length === 0) {
    showMessage("No active panels", "warning");
    return;
  }

  const { prompt, targets } = parseTargetPrompt(text);
  if (!prompt) {
    showMessage("Please enter a valid prompt", "warning");
    return;
  }

  log(`Preparing to send prompt: "${prompt.substring(0, 20)}..." to ${activePanels.length} panels`);

  const targetList = selectedTargets.length > 0
    ? selectedTargets
    : (targets.length > 0 ? targets : [...activePanels]);
  currentSendTargets = targetList;
  completedResponses = new Set();
  startedResponses = new Set();
  failedResponses = new Set();
  targetList.forEach((providerId) => setPanelBadgeStatus(providerId, "sending"));

  sendAllBtn.disabled = true;
  sendAllBtn.textContent = "Sending...";

  try {
    const promises = targetList.map((providerId) =>
      sendPromptToProvider(providerId, prompt)
    );
    const results = await Promise.all(promises);
    results.forEach((ok, index) => {
      const providerId = targetList[index];
      if (!ok) {
        failedResponses.add(providerId);
        setPanelBadgeStatus(providerId, "error");
      } else {
        setPanelBadgeStatus(providerId, "success");
      }
    });
    // Sending state should reflect dispatch completion, not provider response start.
    currentSendTargets = [];
    sendAllBtn.disabled = false;
    sendAllBtn.textContent = I18N.sendAll;
    if (targetList.length === 1) {
      const targetId = targetList[0];
      showMessage(`Sent to ${PROVIDER_BY_ID[targetId]?.label || targetId}`, "success");
    } else {
      showMessage(`Sent to ${targetList.length} assistants`, "success");
    }

    promptEl.value = "";
    selectedTargets = [];
    renderTargetChips();
  } catch (error) {
    console.error("Send failed", error);
    currentSendTargets.forEach((providerId) => setPanelBadgeStatus(providerId, "error"));
    showMessage("Send failed. Try again.", "error");
  } finally {
    currentSendTargets = [];
    sendAllBtn.disabled = false;
    sendAllBtn.textContent = I18N.sendAll;
  }
}

function initGridResizers() {
  const existing = Array.from(grid.querySelectorAll(".grid-splitter"));
  existing.forEach((el) => el.remove());

  const panels = Array.from(grid.querySelectorAll(".panel"));
  if (panels.length <= 1) {
    colSizes = [];
    rowSizes = [];
    grid.style.gridTemplateColumns = "";
    grid.style.gridTemplateRows = "";
    return;
  }

  const columnCount = getColumnCount();
  const rowCount = getRowCount(columnCount);

  const gridRect = grid.getBoundingClientRect();

  // Initialize Columns (Percentage based)
  if (columnCount > 0) {
    if (colSizes.length !== columnCount) {
      const equal = 100 / columnCount;
      colSizes = new Array(columnCount).fill(equal);
    }
    grid.style.gridTemplateColumns = colSizes.map((v) => `${v}%`).join(" ");

    for (let i = 1; i < columnCount; i += 1) {
      const panel = panels[i - 1]; // This might not be in first row if flow is different
      if (panel) {
        const rect = panel.getBoundingClientRect();
        const splitter = document.createElement("div");
        splitter.className = "grid-splitter grid-splitter-vertical";
        splitter.dataset.index = String(i - 1);
        // Position relative to grid container
        const left = rect.right - gridRect.left;
        const leftPct = (left / gridRect.width) * 100;
        splitter.style.left = `${leftPct}%`;
        splitter.addEventListener("mousedown", onVerticalSplitterMouseDown);
        grid.appendChild(splitter);
      }
    }
  }

  // Initialize Rows (Pixel based)
  if (rowCount > 1) {
    if (rowSizes.length !== rowCount) {
      const heights = [];
      for (let r = 0; r < rowCount; r++) {
        const panelIndex = r * columnCount;
        const panel = panels[panelIndex];
        if (panel) {
          heights.push(panel.getBoundingClientRect().height);
        } else {
          heights.push(320); // Default fallback
        }
      }
      rowSizes = heights;
    }
    grid.style.gridTemplateRows = rowSizes.map((px) => `${px}px`).join(" ");

    // Create Horizontal Splitters
    for (let row = 1; row < rowCount; row += 1) {
      const prevRowIndex = row - 1;
      const panelIndex = prevRowIndex * columnCount; // First panel of previous row
      const panel = panels[panelIndex];

      if (panel) {
        const rect = panel.getBoundingClientRect();
        const splitter = document.createElement("div");
        splitter.className = "grid-splitter grid-splitter-horizontal";
        splitter.dataset.index = String(prevRowIndex);
        splitter.style.top = `${rect.bottom - gridRect.top}px`;
        splitter.addEventListener("mousedown", onHorizontalSplitterMouseDown);
        grid.appendChild(splitter);
      }
    }
  } else {
    grid.style.gridTemplateRows = "";
  }
}

function onVerticalSplitterMouseDown(event) {
  event.preventDefault();
  const splitter = event.currentTarget;
  const index = Number(splitter.dataset.index);
  if (!Number.isFinite(index)) return;

  document.body.classList.add("resizing");
  const gridRect = grid.getBoundingClientRect();
  const startX = event.clientX;
  const startSizes = colSizes.slice();
  const pairTotal = startSizes[index] + startSizes[index + 1];

  function onMove(e) {
    const deltaPx = e.clientX - startX;
    const deltaPercent = (deltaPx / gridRect.width) * 100;
    let left = startSizes[index] + deltaPercent;
    let right = startSizes[index + 1] - deltaPercent;
    const min = 5;
    if (left < min) {
      left = min;
      right = pairTotal - left;
    }
    if (right < min) {
      right = min;
      left = pairTotal - right;
    }
    const newSizes = startSizes.slice();
    newSizes[index] = left;
    newSizes[index + 1] = right;
    colSizes = newSizes;
    grid.style.gridTemplateColumns = colSizes.map((v) => `${v}%`).join(" ");

    // Update splitter visual position? 
    // Ideally we re-run initGridResizers or just update this splitter.
    // But initGridResizers is heavy.
    // For now, let's just rely on grid layout update.
    // But splitter is absolute positioned! It won't move automatically.
    updateSplitterPositions();
  }

  function onUp() {
    document.body.classList.remove("resizing");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    saveState();
    syncGridInputs();
  }

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function onHorizontalSplitterMouseDown(event) {
  event.preventDefault();
  const splitter = event.currentTarget;
  const index = Number(splitter.dataset.index);
  if (!Number.isFinite(index)) return;

  document.body.classList.add("resizing");
  const startY = event.clientY;
  const startHeight = rowSizes[index];

  function onMove(e) {
    const deltaPx = e.clientY - startY;

    // Fix: Divide delta by (index + 1) to account for cumulative height change
    // Because changing row height affects all rows above this splitter
    const adjustedDelta = deltaPx / (index + 1);

    let newHeight = startHeight + adjustedDelta;
    const min = 100; // Min height for a row
    if (newHeight < min) newHeight = min;

    // Linked adjustment: set all rows to the same new height.
    const newSizes = rowSizes.map(() => newHeight);
    rowSizes = newSizes;

    grid.style.gridTemplateRows = rowSizes.map((px) => `${px}px`).join(" ");
    updateSplitterPositions();
  }

  function onUp() {
    document.body.classList.remove("resizing");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    saveState();
    syncGridInputs();
  }

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function updateSplitterPositions() {
  const panels = Array.from(grid.querySelectorAll(".panel"));
  const gridRect = grid.getBoundingClientRect();

  const vSplitters = grid.querySelectorAll(".grid-splitter-vertical");
  vSplitters.forEach(sp => {
    const idx = Number(sp.dataset.index);
    const panel = panels[idx];
    if (panel) {
      const rect = panel.getBoundingClientRect();
      const left = rect.right - gridRect.left;
      const leftPct = (left / gridRect.width) * 100;
      sp.style.left = `${leftPct}%`;
    }
  });

  const hSplitters = grid.querySelectorAll(".grid-splitter-horizontal");
  hSplitters.forEach(sp => {
    const idx = Number(sp.dataset.index);
    const match = grid.className.match(/cols-(\d+)/);
    const cols = customGrid.cols || (match ? Number(match[1]) : 1);
    const panelIndex = idx * cols;
    const panel = panels[panelIndex];
    if (panel) {
      const rect = panel.getBoundingClientRect();
      const top = rect.bottom - gridRect.top;
      sp.style.top = `${top}px`;
    }
  });
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

window.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.source !== "multi-ai-content") return;

  // Handle forwarded logs for unified debugging
  if (data.type === "log") {
    if (DEBUG) {
      console.log(`[Via Iframe] [MultiAI Content] ${data.message}`, ...(data.args || []));
    }
    return;
  }

  log(`Received message from ${data.provider}: ${data.type}`, data);

  if (data.type === "sendResult") {
    if (DEBUG) {
      console.log(`[MultiAI Dashboard] Send result for ${data.provider}: ${data.success ? "SUCCESS" : "FAILED"}`);
    }
    resolvePendingSend(data.provider, data.success);
    if (data.success === false) {
      failedResponses.add(data.provider);
      setPanelBadgeStatus(data.provider, "error");
    } else {
      // Release "Sending..." as soon as dispatch is confirmed, do not wait for responseStarted.
      startedResponses.add(data.provider);
      setPanelBadgeStatus(data.provider, "success");
    }
    updateSendingState();
    return;
  }

  if (data.type === "responseStarted") {
    if (DEBUG) {
      console.log(`[MultiAI Dashboard] Response started for ${data.provider}`);
    }
    startedResponses.add(data.provider);
    setPanelBadgeStatus(data.provider, "success");
    updateSendingState();
    return;
  }

  if (data.type === "responseComplete") {
    completedResponses.add(data.provider);
    startedResponses.add(data.provider);
    setPanelBadgeStatus(data.provider, "success");
    updateSendingState();
  }
});

function ensureDefaultPanels() {
  if (activePanels.length === 0) {
    activePanels = ["chatgpt", "claude"];
  }
}

function enforceMaxPanels(list) {
  return list.slice(0, MAX_PANELS);
}

applyI18n();
  
  // Auto-resize textarea
  promptEl.addEventListener("input", () => {
    promptEl.style.height = "auto";
    promptEl.style.height = Math.min(promptEl.scrollHeight, 100) + "px"; // 100px is approx 3.5 lines (24px * 3.5 + padding)
  });

  sendAllBtn.addEventListener("click", sendPrompt);
settingsBtn.addEventListener("click", () => openSettings(activePanels, null));
// Chatroom button removed





promptEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendPrompt();
    return;
  }

  if (event.key === "Backspace" && !promptEl.value && selectedTargets.length > 0) {
    selectedTargets = selectedTargets.slice(0, -1);
    renderTargetChips();
    updateSendButtonState();
  }
});

promptEl.addEventListener("input", () => {
  syncTargetsFromPrompt();
  updateSendButtonState();
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
    const panel = grid.querySelector(`.panel[data-index='${pendingPickTarget}']`);
    if (panel) {
      const provider = PROVIDER_BY_ID[replacement];
      const title = panel.querySelector(".panel-title");
      const iframe = panel.querySelector("iframe");
      const panelBody = panel.querySelector(".panel-body");
      const existingBlocked = panel.querySelector(".panel-blocked");
      if (provider) {
        if (title) {
          title.textContent = provider.label;
        }
        if (iframe) {
          if (IFRAME_BLOCKED_PROVIDERS.has(provider.id)) {
            iframe.src = "about:blank";
            if (existingBlocked) {
              existingBlocked.remove();
            }
            if (panelBody) {
              const blocked = document.createElement("div");
              blocked.className = "panel-blocked";
              blocked.textContent = "该站点不支持在分屏中打开，点击在新标签中查看";
              blocked.addEventListener("click", () => {
                chrome.runtime.sendMessage({ type: "openProviderTab", provider: provider.id });
              });
              panelBody.appendChild(blocked);
            }
          } else {
            if (existingBlocked) {
              existingBlocked.remove();
            }
            iframe.src = provider.url;
          }
        }
      }
    }
    saveState();
    updateShortcutHint();
  } else {
    activePanels = selection;
    saveState();
    renderPanels();
  }
  closeSettings();
});

window.addEventListener("beforeunload", () => {
  saveState();
});

loadState();
loadPanelsFromStorage()
  .catch(() => undefined)
  .finally(() => {
    ensureDefaultPanels();
    activePanels = normalizeProviders(activePanels, MAX_PANELS);
    renderPanels();
  });













