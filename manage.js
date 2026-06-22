const createSessionButton = document.getElementById("createSession");
const loadSessionsButton = document.getElementById("loadSessions");
const confirmRestoreButton = document.getElementById("confirmRestore");
const closeRestorePanelButton = document.getElementById("closeRestorePanel");
const backgroundModeInput = document.getElementById("backgroundMode");
const emptyStateEl = document.getElementById("emptyState");
const sessionListEl = document.getElementById("sessionList");
const welcomeStateEl = document.getElementById("welcomeState");
const restorePanelEl = document.getElementById("restorePanel");
const restoreTitleEl = document.getElementById("restoreTitle");
const restoreSummaryEl = document.getElementById("restoreSummary");
const statusEl = document.getElementById("status");
const providerPickerBtn = document.getElementById("providerPickerBtn");
const providerDropdown = document.getElementById("providerDropdown");
const providerListEl = document.getElementById("providerList");
const providerSelectAllBtn = document.getElementById("providerSelectAll");
const providerDeselectAllBtn = document.getElementById("providerDeselectAll");

let sessionCache = [];
let selectedSessionId = null;
let pendingAction = false;
var selectedProviderIds = [];

function setStatus(text) {
  statusEl.textContent = text || "";
}

function setPendingState(isPending) {
  pendingAction = isPending;
  createSessionButton.disabled = isPending;
  loadSessionsButton.disabled = isPending;
  confirmRestoreButton.disabled = isPending || !selectedSessionId;
  closeRestorePanelButton.disabled = isPending;
}

function formatTimestamp(value) {
  if (!value) return "未知时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

// --- Provider picker ---

function buildProviderPicker() {
  providerListEl.replaceChildren();

  PROVIDERS.forEach(function (p) {
    var row = document.createElement("label");
    row.className = "provider-row";

    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = p.id;
    checkbox.checked = selectedProviderIds.indexOf(p.id) >= 0;
    checkbox.addEventListener("change", function () {
      var idx = selectedProviderIds.indexOf(p.id);
      if (checkbox.checked && idx < 0) {
        selectedProviderIds.push(p.id);
      } else if (!checkbox.checked && idx >= 0) {
        selectedProviderIds.splice(idx, 1);
      }
      updatePickerLabel();
    });

    var img = document.createElement("img");
    img.className = "provider-favicon";
    img.src = FaviconCache.getFaviconSrc(p.id);
    img.alt = p.id;
    img.width = 18;
    img.height = 18;
    img.loading = "lazy";
    img.onerror = function () { this.style.display = "none"; };

    var label = document.createElement("span");
    label.className = "provider-label";
    label.textContent = p.label;

    row.append(checkbox, img, label);
    providerListEl.appendChild(row);
  });
}

function updatePickerLabel() {
  providerPickerBtn.textContent = selectedProviderIds.length + " 个 AI ▾";
}

function syncPickerCheckboxes() {
  var checkboxes = providerListEl.querySelectorAll("input[type=\"checkbox\"]");
  checkboxes.forEach(function (cb) {
    cb.checked = selectedProviderIds.indexOf(cb.value) >= 0;
  });
  updatePickerLabel();
}

function toggleDropdown(forceOpen) {
  var isOpen = typeof forceOpen === "boolean" ? forceOpen : providerDropdown.classList.contains("hidden");
  if (isOpen) {
    providerDropdown.classList.remove("hidden");
    providerPickerBtn.setAttribute("aria-expanded", "true");
  } else {
    providerDropdown.classList.add("hidden");
    providerPickerBtn.setAttribute("aria-expanded", "false");
  }
}

function setSelectedProviders(ids) {
  var validIds = [];
  var knownIds = PROVIDERS.map(function (p) { return p.id; });
  (ids || []).forEach(function (id) {
    if (knownIds.indexOf(id) >= 0) {
      validIds.push(id);
    }
  });
  selectedProviderIds = validIds;
  syncPickerCheckboxes();
}

// --- Session helpers ---

function formatSessionSummary(session) {
  return {
    id: session.sessionId,
    title: session.name || session.sessionId,
    providers: session.providers || [],
    favicons: (session.providers || []).map(function (p) { return { id: p, src: FaviconCache.getFaviconSrc(p) }; }),
    children: Object.values(session.childSessions || {}).map(function (child) {
      return {
        provider: child.provider,
        title: child.title || child.provider,
        recoverable: Boolean(child.recoverable),
        lastActiveAt: formatTimestamp(child.lastActiveAt)
      };
    })
  };
}

async function sendRuntimeMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response || !response.ok) {
    throw new Error(response?.error || "unknown-runtime-error");
  }
  return response.result;
}

// --- Sidebar session list ---

function renderSessionList(sessions) {
  sessionListEl.replaceChildren();
  emptyStateEl.classList.toggle("hidden", sessions.length > 0);

  sessions.forEach(function (session) {
    const summary = formatSessionSummary(session);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "session-item" + (selectedSessionId === summary.id ? " selected" : "");
    card.disabled = pendingAction;

    const nameEl = document.createElement("div");
    nameEl.className = "session-name";
    nameEl.textContent = summary.title;

    const iconsEl = document.createElement("div");
    iconsEl.className = "session-icons";
    summary.favicons.forEach(function (f) {
      const img = document.createElement("img");
      img.className = "session-favicon";
      img.src = f.src;
      img.alt = f.id;
      img.title = f.id;
      img.width = 16;
      img.height = 16;
      img.loading = "lazy";
      img.onerror = function () { this.style.display = "none"; };
      iconsEl.appendChild(img);
    });

    card.append(nameEl, iconsEl);
    card.addEventListener("click", function () {
      selectedSessionId = summary.id;
      // Update selected visual
      sessionListEl.querySelectorAll(".session-item").forEach(function (el) { el.classList.remove("selected"); });
      card.classList.add("selected");
      renderRestorePanel(session);
    });
    sessionListEl.appendChild(card);
  });
}

// --- Right-side detail panel ---

function hideRestorePanel() {
  selectedSessionId = null;
  restorePanelEl.classList.add("hidden");
  welcomeStateEl.classList.remove("hidden");
  restoreSummaryEl.replaceChildren();
  sessionListEl.querySelectorAll(".session-item").forEach(function (el) { el.classList.remove("selected"); });
  setPendingState(pendingAction);
}

function renderRestorePanel(session) {
  const summary = formatSessionSummary(session);
  welcomeStateEl.classList.add("hidden");
  restorePanelEl.classList.remove("hidden");
  restoreTitleEl.textContent = summary.title;
  restoreSummaryEl.replaceChildren();

  const subtitleEl = document.createElement("div");
  subtitleEl.className = "summary-subtitle";
  subtitleEl.textContent = summary.subtitle;

  const childrenWrap = document.createElement("div");
  childrenWrap.className = "summary-children";

  if (summary.children.length === 0) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "empty";
    emptyEl.textContent = "没有子会话记录。";
    childrenWrap.appendChild(emptyEl);
  } else {
    summary.children.forEach(function (child) {
      const row = document.createElement("div");
      row.className = "child-row";

      const left = document.createElement("div");
      const providerEl = document.createElement("div");
      providerEl.className = "child-provider";
      providerEl.textContent = child.provider;
      const childTitleEl = document.createElement("div");
      childTitleEl.className = "child-title";
      childTitleEl.textContent = child.title;
      left.append(providerEl, childTitleEl);

      const meta = document.createElement("div");
      meta.className = "child-meta";
      const badge = document.createElement("span");
      badge.className = "badge " + (child.recoverable ? "ok" : "muted");
      badge.textContent = child.recoverable ? "可恢复" : "不可恢复";
      const lastActiveEl = document.createElement("span");
      lastActiveEl.textContent = child.lastActiveAt;
      meta.append(badge, lastActiveEl);

      row.append(left, meta);
      childrenWrap.appendChild(row);
    });
  }

  restoreSummaryEl.append(subtitleEl, childrenWrap);
  setPendingState(pendingAction);
}

// --- Actions ---

async function loadSessions(options) {
  options = options || {};
  const preserveStatus = options.preserveStatus;
  if (!preserveStatus) {
    setStatus("正在读取历史会话...");
  }
  const sessions = await sendRuntimeMessage({ type: "session:list" });
  sessionCache = Array.isArray(sessions) ? sessions : [];
  renderSessionList(sessionCache);

  // Initialize selected providers from most recent session
  if (selectedProviderIds.length === 0) {
    var defaultIds = (typeof SESSION_PROVIDER_IDS !== "undefined")
      ? SESSION_PROVIDER_IDS.slice()
      : ["deepseek", "gemini", "grok"];
    if (sessionCache.length > 0 && Array.isArray(sessionCache[0].providers) && sessionCache[0].providers.length > 0) {
      setSelectedProviders(sessionCache[0].providers);
    } else {
      setSelectedProviders(defaultIds);
    }
  }

  if (!preserveStatus) {
    setStatus(sessionCache.length > 0 ? "已加载历史会话。" : "还没有已保存会话。");
  }
}

async function createSession() {
  if (pendingAction) return;
  if (selectedProviderIds.length === 0) {
    setStatus("请至少选择一个 AI。");
    return;
  }
  setPendingState(true);
  setStatus("正在创建会话...");
  const mode = backgroundModeInput.checked ? "background" : "foreground";
  try {
    const result = await sendRuntimeMessage({ type: "session:create", mode: mode, providers: selectedProviderIds.slice() });
    const sid = result.session?.sessionId || "";
    const name = result.session?.name || sid || "unknown";
    setStatus("会话已创建：" + name + "。");
    setPendingState(false);
    loadSessions({ preserveStatus: true }).catch(function () {});
  } catch (error) {
    setStatus("创建失败：" + error.message);
    setPendingState(false);
  }
}

async function restoreSession() {
  if (!selectedSessionId) {
    setStatus("请先选择要恢复的会话。");
    return;
  }
  if (pendingAction) return;
  setPendingState(true);
  setStatus("正在恢复会话...");
  try {
    const result = await sendRuntimeMessage({
      type: "session:restore",
      sessionId: selectedSessionId
    });
    const restoredCount = Array.isArray(result.restored) ? result.restored.length : 0;
    setStatus(restoredCount > 0 ? "已恢复 " + restoredCount + " 个子会话。" : "该会话没有可恢复的子会话。");
    setPendingState(false);
    loadSessions({ preserveStatus: true }).catch(function () {});
  } catch (error) {
    setStatus("恢复失败：" + error.message);
    setPendingState(false);
  }
}

// --- Event listeners ---

createSessionButton.addEventListener("click", function () {
  createSession().catch(function (error) { setStatus("创建失败：" + error.message); });
});

loadSessionsButton.addEventListener("click", function () {
  loadSessions().catch(function (error) { setStatus("读取失败：" + error.message); });
});

confirmRestoreButton.addEventListener("click", function () {
  restoreSession().catch(function (error) { setStatus("恢复失败：" + error.message); });
});

closeRestorePanelButton.addEventListener("click", hideRestorePanel);

// Provider picker events
providerPickerBtn.addEventListener("click", function () {
  toggleDropdown();
});

providerSelectAllBtn.addEventListener("click", function () {
  setSelectedProviders(PROVIDERS.map(function (p) { return p.id; }));
});

providerDeselectAllBtn.addEventListener("click", function () {
  setSelectedProviders([]);
});

document.addEventListener("click", function (e) {
  var picker = document.getElementById("providerPicker");
  if (picker && !picker.contains(e.target)) {
    if (providerDropdown && !providerDropdown.classList.contains("hidden")) {
      toggleDropdown(false);
    }
  }
});

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    if (providerDropdown && !providerDropdown.classList.contains("hidden")) {
      toggleDropdown(false);
    }
  }
});

// Init
FaviconCache.preloadFavicons(PROVIDERS.map(function (p) { return p.id; })).then(function () {
  buildProviderPicker();
  loadSessions().catch(function (error) { setStatus("初始化失败：" + error.message); });
});
