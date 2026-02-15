const STORAGE_KEY = "multi-ai-state";

const promptEl = document.getElementById("prompt");
const statusEl = document.getElementById("status");
const openSendButton = document.getElementById("openSend");
const openOnlyButton = document.getElementById("openOnly");
const openDashboardButton = document.getElementById("openDashboard");
const providerCheckboxes = Array.from(document.querySelectorAll(".providers input[type='checkbox']"));
const DASHBOARD_KEY = "multi-ai-dashboard-panels";
const MAX_DASHBOARD_PANELS = typeof DASHBOARD_MAX_PANELS === "number" ? DASHBOARD_MAX_PANELS : 6;

function getSelectedProviders() {
  return providerCheckboxes
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.value);
}

function setStatus(text) {
  statusEl.textContent = text;
}

async function loadState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const state = stored[STORAGE_KEY];
  if (!state) return;

  if (typeof state.prompt === "string") {
    promptEl.value = state.prompt;
  }

  if (Array.isArray(state.providers)) {
    providerCheckboxes.forEach((checkbox) => {
      checkbox.checked = state.providers.includes(checkbox.value);
    });
  }
}

async function saveState() {
  const state = {
    prompt: promptEl.value,
    providers: getSelectedProviders()
  };

  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, info) => {
      if (updatedTabId !== tabId) {
        return;
      }
      if (info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function openProviders(autoSend) {
  const providers = getSelectedProviders();
  const prompt = promptEl.value.trim();

  if (providers.length === 0) {
    setStatus("至少选择一个 AI。");
    return;
  }

  if (autoSend && !prompt) {
    setStatus("请输入要发送的内容。");
    return;
  }

  await saveState();

  const results = [];
  for (const providerId of providers) {
    const provider = PROVIDER_BY_ID[providerId];
    if (!provider) continue;
    const tab = await chrome.tabs.create({ url: provider.url, active: false });
    results.push(tab);

    if (autoSend) {
      waitForTabComplete(tab.id).then(() => {
        chrome.tabs.sendMessage(tab.id, {
          type: "sendPrompt",
          provider: providerId,
          prompt
        });
      });
    }
  }

  setStatus(results.length === 0 ? "未打开任何标签。" : (autoSend ? "已打开并尝试发送。" : "已打开标签页。"));
}

async function openDashboard() {
  const providers = getSelectedProviders();
  if (providers.length === 0) {
    setStatus("至少选择一个 AI。");
    return;
  }
  if (providers.length > MAX_DASHBOARD_PANELS) {
    setStatus(`最多选择 ${MAX_DASHBOARD_PANELS} 个 AI 分屏。`);
    return;
  }

  await saveState();
  await chrome.storage.local.set({ [DASHBOARD_KEY]: providers });
  await chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html"), active: true });
  setStatus("已打开分屏界面。");
}

openSendButton.addEventListener("click", () => openProviders(true));
openOnlyButton.addEventListener("click", () => openProviders(false));
openDashboardButton.addEventListener("click", openDashboard);

promptEl.addEventListener("input", () => {
  saveState().catch(() => undefined);
});

providerCheckboxes.forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    saveState().catch(() => undefined);
  });
});

loadState().catch(() => undefined);

