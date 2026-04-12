const createSessionButton = document.getElementById("createSession");
const loadSessionsButton = document.getElementById("loadSessions");
const confirmRestoreButton = document.getElementById("confirmRestore");
const closeRestorePanelButton = document.getElementById("closeRestorePanel");
const backgroundModeInput = document.getElementById("backgroundMode");
const emptyStateEl = document.getElementById("emptyState");
const sessionListEl = document.getElementById("sessionList");
const restorePanelEl = document.getElementById("restorePanel");
const restoreSummaryEl = document.getElementById("restoreSummary");
const statusEl = document.getElementById("status");

let sessionCache = [];
let selectedSessionId = null;
let pendingAction = false;

function setStatus(text) {
  statusEl.textContent = text || "";
}

function setPendingState(isPending) {
  pendingAction = isPending;
  createSessionButton.disabled = isPending;
  loadSessionsButton.disabled = isPending;
  confirmRestoreButton.disabled = isPending || !selectedSessionId;
  closeRestorePanelButton.disabled = isPending;

  sessionListEl.querySelectorAll("button").forEach((button) => {
    button.disabled = isPending;
  });
}

function formatTimestamp(value) {
  if (!value) return "未知时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("zh-CN", {
    hour12: false
  });
}

function formatSessionSummary(session) {
  return {
    id: session.sessionId,
    title: session.name || session.sessionId,
    subtitle: `${(session.providers || []).join(" / ")} · ${formatTimestamp(session.lastActiveAt || session.createdAt)}`,
    children: Object.values(session.childSessions || {}).map((child) => ({
      provider: child.provider,
      title: child.title || child.provider,
      recoverable: Boolean(child.recoverable),
      lastActiveAt: formatTimestamp(child.lastActiveAt)
    }))
  };
}

async function sendRuntimeMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response || !response.ok) {
    throw new Error(response?.error || "unknown-runtime-error");
  }
  return response.result;
}

function hideRestorePanel() {
  selectedSessionId = null;
  restorePanelEl.classList.add("hidden");
  restoreSummaryEl.replaceChildren();
  setPendingState(pendingAction);
}

function renderRestorePanel(session) {
  const summary = formatSessionSummary(session);
  restoreSummaryEl.replaceChildren();

  const summaryHead = document.createElement("div");
  summaryHead.className = "summary-head";

  const titleEl = document.createElement("div");
  titleEl.className = "summary-title";
  titleEl.textContent = summary.title;

  const subtitleEl = document.createElement("div");
  subtitleEl.className = "summary-subtitle";
  subtitleEl.textContent = summary.subtitle;

  summaryHead.append(titleEl, subtitleEl);

  const childrenWrap = document.createElement("div");
  childrenWrap.className = "summary-children";

  if (summary.children.length === 0) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "empty small";
    emptyEl.textContent = "没有子会话记录。";
    childrenWrap.appendChild(emptyEl);
  } else {
    summary.children.forEach((child) => {
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
      badge.className = `badge ${child.recoverable ? "ok" : "muted"}`;
      badge.textContent = child.recoverable ? "可恢复" : "不可恢复";

      const lastActiveEl = document.createElement("span");
      lastActiveEl.textContent = child.lastActiveAt;

      meta.append(badge, lastActiveEl);
      row.append(left, meta);
      childrenWrap.appendChild(row);
    });
  }

  restoreSummaryEl.append(summaryHead, childrenWrap);
  restorePanelEl.classList.remove("hidden");
  setPendingState(pendingAction);
}

function renderSessionList(sessions) {
  sessionListEl.replaceChildren();
  hideRestorePanel();
  emptyStateEl.classList.toggle("hidden", sessions.length > 0);

  sessions.forEach((session) => {
    const summary = formatSessionSummary(session);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "session-item";
    card.disabled = pendingAction;

    const titleEl = document.createElement("div");
    titleEl.className = "session-title";
    titleEl.textContent = summary.title;

    const subtitleEl = document.createElement("div");
    subtitleEl.className = "session-subtitle";
    subtitleEl.textContent = summary.subtitle;

    const childrenEl = document.createElement("div");
    childrenEl.className = "session-children";
    summary.children.forEach((child) => {
      const badge = document.createElement("span");
      badge.className = `badge ${child.recoverable ? "ok" : "muted"}`;
      badge.textContent = child.provider;
      childrenEl.appendChild(badge);
    });

    card.append(titleEl, subtitleEl, childrenEl);
    card.addEventListener("click", () => {
      selectedSessionId = summary.id;
      renderRestorePanel(session);
    });
    sessionListEl.appendChild(card);
  });
}

async function loadSessions(options = {}) {
  const { preserveStatus = false } = options;
  if (!preserveStatus) {
    setStatus("正在读取历史会话...");
  }
  const sessions = await sendRuntimeMessage({ type: "session:list" });
  sessionCache = Array.isArray(sessions) ? sessions : [];
  renderSessionList(sessionCache);
  if (!preserveStatus) {
    setStatus(sessionCache.length > 0 ? "已加载历史会话。" : "还没有已保存会话。");
  }
}

async function createSession() {
  if (pendingAction) return;
  setPendingState(true);
  setStatus("正在创建会话...");
  const mode = backgroundModeInput.checked ? "background" : "foreground";
  try {
    const result = await sendRuntimeMessage({ type: "session:create", mode });
    await loadSessions({ preserveStatus: true });
    setStatus(`会话已创建：${result.session?.name || result.session?.sessionId || "unknown"}`);
  } finally {
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
    hideRestorePanel();
    await loadSessions({ preserveStatus: true });
    setStatus(restoredCount > 0 ? `已恢复 ${restoredCount} 个子会话。` : "该会话没有可恢复的子会话。");
  } finally {
    setPendingState(false);
  }
}

createSessionButton.addEventListener("click", () => {
  createSession().catch((error) => setStatus(`创建失败：${error.message}`));
});

loadSessionsButton.addEventListener("click", () => {
  loadSessions().catch((error) => setStatus(`读取失败：${error.message}`));
});

confirmRestoreButton.addEventListener("click", () => {
  restoreSession().catch((error) => setStatus(`恢复失败：${error.message}`));
});

closeRestorePanelButton.addEventListener("click", hideRestorePanel);

loadSessions().catch((error) => setStatus(`初始化失败：${error.message}`));
