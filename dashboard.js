const STATE_KEY = "multi-ai-dashboard";
const MAX_PANELS = 50;
const DASHBOARD_KEY = "multi-ai-dashboard-panels";

const I18N = {
  topbarSubtitle: "",
  settings: "Settings",
  composerLabel: "",
  composerPlaceholder: "",
  sendAll: "Send",
  settingsTitle: "Select AI",
  settingsSubtitle: "Up to 16 panels",
  cancel: "Cancel",
  confirm: "Confirm",
  refresh: "Refresh",
  newTab: "Open in New Tab",
  close: "Close",
  switch: "Switch AI",
  add: "Add AI",
  shortcutPrefix: ""
};

const grid = document.getElementById("panelGrid");
const promptEl = document.getElementById("prompt");
const sendAllBtn = document.getElementById("sendAll");
const settingsBtn = document.getElementById("openSettings");
const chatroomBtn = document.getElementById("openChatroom");
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
const clearGroupChatBtn = document.getElementById("clearGroupChat");

let activePanels = [];
let pendingPickTarget = null;
let colSizes = [];
let rowSizes = [];
let customGrid = { rows: 0, cols: 0 }; // 0 means auto
let sortedProviderIds = []; // Order of providers in settings
let currentSendTargets = [];
let completedResponses = new Set();

const IFRAME_BLOCKED_PROVIDERS = new Set([]);
const SEND_TIMEOUT_MS = 15000;
const sendStatusTimers = new Map();
const pendingSends = new Map();

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
  if (text && (promptEl.value || "").trim().startsWith("@")) {
    shortcutHint.textContent = text;
    shortcutHint.style.display = "block";
  } else {
    shortcutHint.textContent = "";
    shortcutHint.style.display = "none";
  }
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


function animateDOMMove(parent, moveFunction) {
  const children = Array.from(parent.children);
  const positions = new Map(children.map(c => [c, c.getBoundingClientRect()]));

  moveFunction();

  requestAnimationFrame(() => {
    children.forEach(child => {
      const oldPos = positions.get(child);
      const newPos = child.getBoundingClientRect();
      if (!oldPos) return;

      const dx = oldPos.left - newPos.left;
      const dy = oldPos.top - newPos.top;

      if (dx !== 0 || dy !== 0) {
        child.style.transform = `translate(${dx}px, ${dy}px)`;
        child.style.transition = 'none';

        requestAnimationFrame(() => {
          child.style.transition = 'transform 0.3s cubic-bezier(0.2, 0, 0.2, 1)';
          child.style.transform = '';
        });
      }
    });
  });
}

function updateSendButtonState() {
  const { target } = parseTargetPrompt(promptEl.value || "");
  if (target) {
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
    title.textContent = provider.label;

    const badge = node.querySelector(".panel-badge");
    badge.textContent = `@${index + 1}`;

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
    header.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      const isOpen = panelEl.classList.contains("menu-open");
      document.querySelectorAll(".panel.menu-open").forEach((p) => {
        if (p !== panelEl) {
          p.classList.remove("menu-open");
        }
      });
      panelEl.classList.toggle("menu-open", !isOpen);
    });

    const menu = node.querySelector(".panel-menu");
    menu.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      event.stopPropagation();
      handlePanelAction(panelEl, provider, button.dataset.action);
      panelEl.classList.remove("menu-open");
    });

    document.addEventListener("click", (event) => {
      if (!panelEl.contains(event.target)) {
        panelEl.classList.remove("menu-open");
      }
    });

    applyPanelI18n(node);
    grid.appendChild(node);
  });

  applyGridLayout();
  updateShortcutHint();
}

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
    chrome.runtime.sendMessage({ type: "openProviderTab", provider: provider.id });
    return;
  }

  if (action === "close") {
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
    return { prompt: trimmed, target: null };
  }

  const match = trimmed.match(/^@(\d+)[\s:：]+/);
  if (!match) return { prompt: trimmed, target: null };

  const index = Number(match[1]);
  if (!Number.isFinite(index) || index < 1 || index > activePanels.length) {
    return { prompt: trimmed, target: null };
  }

  return {
    prompt: trimmed.slice(match[0].length),
    target: activePanels[index - 1]
  };
}

function getPanelIframe(providerId) {
  const index = activePanels.indexOf(providerId);
  if (index < 0) return null;
  const panel = grid.querySelector(`.panel[data-index='${index}']`);
  if (!panel) return null;
  return panel.querySelector("iframe");
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

  const { prompt, target } = parseTargetPrompt(text);
  if (!prompt) {
    showMessage("Please enter a valid prompt", "warning");
    return;
  }

  currentSendTargets = target ? [target] : [...activePanels];
  completedResponses = new Set();

  sendAllBtn.disabled = true;
  sendAllBtn.textContent = "Sending...";

  try {
    if (target) {
      await sendPromptToProvider(target, prompt);
      showMessage(`Sent to ${PROVIDER_BY_ID[target]?.label || target}`, "success");
    } else {
      const promises = activePanels.map((providerId) =>
        sendPromptToProvider(providerId, prompt)
      );
      await Promise.all(promises);
      showMessage(`Sent to ${activePanels.length} assistants`, "success");
    }

    promptEl.value = "";
  } catch (error) {
    console.error("Send failed", error);
    showMessage("Send failed. Try again.", "error");
  } finally {
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

  if (data.type === "sendResult") {
    resolvePendingSend(data.provider, data.success);
    return;
  }

  if (data.type === "responseComplete") {
    completedResponses.add(data.provider);
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

sendAllBtn.addEventListener("click", sendPrompt);
settingsBtn.addEventListener("click", () => openSettings(activePanels, null));
if (chatroomBtn) {
  chatroomBtn.addEventListener("click", () => {
    const url = chrome?.runtime?.getURL ? chrome.runtime.getURL("chatroom.html") : "chatroom.html";
    window.open(url, "_blank");
  });
}




promptEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendPrompt();
  }
});

promptEl.addEventListener("input", () => {
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













