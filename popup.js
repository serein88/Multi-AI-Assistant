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

function setStatus(text) {
  statusEl.textContent = text || "";
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
  restoreSummaryEl.innerHTML = "";
}

function renderRestorePanel(session) {
  const summary = formatSessionSummary(session);
  const childrenHtml = summary.children.map((child) => `
    <div class="child-row">
      <div>
        <div class="child-provider">${child.provider}</div>
        <div class="child-title">${child.title}</div>
      </div>
      <div class="child-meta">
        <span class="badge ${child.recoverable ? "ok" : "muted"}">${child.recoverable ? "可恢复" : "不可恢复"}</span>
        <span>${child.lastActiveAt}</span>
      </div>
    </div>
  `).join("");

  restoreSummaryEl.innerHTML = `
    <div class="summary-head">
      <div class="summary-title">${summary.title}</div>
      <div class="summary-subtitle">${summary.subtitle}</div>
    </div>
    <div class="summary-children">${childrenHtml || '<div class="empty small">没有子会话记录。</div>'}</div>
  `;
  restorePanelEl.classList.remove("hidden");
}

function renderSessionList(sessions) {
  sessionListEl.innerHTML = "";
  emptyStateEl.classList.toggle("hidden", sessions.length > 0);

  sessions.forEach((session) => {
    const summary = formatSessionSummary(session);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "session-item";
    card.innerHTML = `
      <div class="session-title">${summary.title}</div>
      <div class="session-subtitle">${summary.subtitle}</div>
      <div class="session-children">${summary.children.map((child) => `
        <span class="badge ${child.recoverable ? "ok" : "muted"}">${child.provider}</span>
      `).join("")}</div>
    `;
    card.addEventListener("click", () => {
      selectedSessionId = summary.id;
      renderRestorePanel(session);
    });
    sessionListEl.appendChild(card);
  });
}

async function loadSessions() {
  setStatus("正在读取历史会话...");
  const sessions = await sendRuntimeMessage({ type: "session:list" });
  sessionCache = Array.isArray(sessions) ? sessions : [];
  renderSessionList(sessionCache);
  setStatus(sessionCache.length > 0 ? "已加载历史会话。" : "还没有已保存会话。");
}

async function createSession() {
  setStatus("正在创建会话...");
  const mode = backgroundModeInput.checked ? "background" : "foreground";
  const result = await sendRuntimeMessage({ type: "session:create", mode });
  setStatus(`会话已创建：${result.session?.name || result.session?.sessionId || "unknown"}`);
  await loadSessions();
}

async function restoreSession() {
  if (!selectedSessionId) {
    setStatus("请先选择要恢复的会话。");
    return;
  }

  setStatus("正在恢复会话...");
  const result = await sendRuntimeMessage({
    type: "session:restore",
    sessionId: selectedSessionId
  });

  const restoredCount = Array.isArray(result.restored) ? result.restored.length : 0;
  setStatus(restoredCount > 0 ? `已恢复 ${restoredCount} 个子会话。` : "该会话没有可恢复的子会话。");
  hideRestorePanel();
  await loadSessions();
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
