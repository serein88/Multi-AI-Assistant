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
}

function formatTimestamp(value) {
  if (!value) return "未知时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatSessionSummary(session) {
    const PROVIDER_FAVICON = {
      chatgpt: "https://www.google.com/s2/favicons?domain=chatgpt.com&sz=32",
      claude: "https://www.google.com/s2/favicons?domain=claude.ai&sz=32",
      grok: "https://www.google.com/s2/favicons?domain=grok.com&sz=32",
      gemini: "https://www.google.com/s2/favicons?domain=gemini.google.com&sz=32",
      copilot: "https://www.google.com/s2/favicons?domain=copilot.microsoft.com&sz=32",
      doubao: "https://www.google.com/s2/favicons?domain=doubao.com&sz=32",
      kimi: "https://www.google.com/s2/favicons?domain=kimi.com&sz=32",
      deepseek: "https://www.google.com/s2/favicons?domain=deepseek.com&sz=32",
      tongyi: "https://www.google.com/s2/favicons?domain=tongyi.aliyun.com&sz=32",
      yuanbao: "https://www.google.com/s2/favicons?domain=yuanbao.tencent.com&sz=32",
      zhipu: "https://www.google.com/s2/favicons?domain=chatglm.cn&sz=32",
      you: "https://www.google.com/s2/favicons?domain=you.com&sz=32",
      ima: "https://www.google.com/s2/favicons?domain=ima.qq.com&sz=32"
    };
    return {
      id: session.sessionId,
      title: session.name || session.sessionId,
      providers: session.providers || [],
      favicons: (session.providers || []).map((p) => ({ id: p, src: PROVIDER_FAVICON[p] || "" })),
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

// --- Sidebar session list ---

function renderSessionList(sessions) {
  sessionListEl.replaceChildren();
  emptyStateEl.classList.toggle("hidden", sessions.length > 0);

  sessions.forEach((session) => {
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
      summary.favicons.forEach((f) => {
        const img = document.createElement("img");
        img.className = "session-favicon";
        img.src = f.src;
        img.alt = f.id;
        img.title = f.id;
        img.width = 16;
        img.height = 16;
        img.loading = "lazy";
        img.onerror = function() { this.style.display = "none"; };
        iconsEl.appendChild(img);
      });

      card.append(nameEl, iconsEl);
    card.addEventListener("click", () => {
      selectedSessionId = summary.id;
      // Update selected visual
      sessionListEl.querySelectorAll(".session-item").forEach((el) => el.classList.remove("selected"));
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
  sessionListEl.querySelectorAll(".session-item").forEach((el) => el.classList.remove("selected"));
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

  restoreSummaryEl.append(subtitleEl, childrenWrap);
  setPendingState(pendingAction);
}

// --- Actions ---

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
    const sid = result.session?.sessionId || "";
    const name = result.session?.name || sid || "unknown";
    setStatus(`会话已创建：${name}。`);
    setPendingState(false);
    loadSessions({ preserveStatus: true }).catch(() => {});
  } catch (error) {
    setStatus(`创建失败：${error.message}`);
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
    setStatus(restoredCount > 0 ? `已恢复 ${restoredCount} 个子会话。` : "该会话没有可恢复的子会话。");
    setPendingState(false);
    loadSessions({ preserveStatus: true }).catch(() => {});
  } catch (error) {
    setStatus(`恢复失败：${error.message}`);
    setPendingState(false);
  }
}

// --- Event listeners ---

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

// Init
loadSessions().catch((error) => setStatus(`初始化失败：${error.message}`));
