const PROVIDERS = {
  chatgpt: {
    label: "ChatGPT",
    url: "https://chatgpt.com/"
  },
  claude: {
    label: "Claude",
    url: "https://claude.ai/"
  },
  gemini: {
    label: "Gemini",
    url: "https://gemini.google.com/"
  },
  copilot: {
    label: "Copilot",
    url: "https://copilot.microsoft.com/"
  },
  grok: {
    label: "Grok",
    url: "https://grok.com/"
  },
  doubao: {
    label: "����",
    url: "https://www.doubao.com/"
  },
  kimi: {
    label: "Kimi",
    url: "https://kimi.moonshot.cn/"
  },
  deepseek: {
    label: "DeepSeek",
    url: "https://chat.deepseek.com/"
  },
  tongyi: {
    label: "ͨ��ǧ��",
    url: "https://www.qianwen.com/"
  },
  yuanbao: {
    label: "Ԫ��",
    url: "https://yuanbao.tencent.com/"
  },
  zhipu: {
    label: "智谱AI",
    url: "https://chatglm.cn/"
  },
  you: {
    label: "You.com",
    url: "https://you.com/"
  },
  ima: {
    label: "ima",
    url: "https://ima.qq.com/"
  }
};

async function findOrCreateProviderTab(providerId) {
  const config = PROVIDERS[providerId];
  if (!config) {
    throw new Error("Unknown provider");
  }

  const urlPattern = `${config.url}*`;
  const existingTabs = await chrome.tabs.query({ url: urlPattern });
  if (existingTabs && existingTabs.length > 0) {
    return existingTabs[0];
  }

  const tab = await chrome.tabs.create({ url: config.url, active: false });
  return tab;
}

async function sendPromptToProviderTab(providerId, prompt) {
  const tab = await findOrCreateProviderTab(providerId);
  if (!tab || !tab.id) {
    return false;
  }

  if (tab.status !== "complete") {
    await waitForTabComplete(tab.id);
  }

  return new Promise((resolve) => {
    chrome.tabs
      .sendMessage(tab.id, { type: "sendPrompt", provider: providerId, prompt })
      .then((res) => {
        resolve(Boolean(res && res.ok));
      })
      .catch(() => resolve(false));
  });
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

async function openProviders(providers, prompt, autoSend) {
  const openResults = [];

  for (const provider of providers) {
    const config = PROVIDERS[provider];
    if (!config) {
      continue;
    }

    const tab = await chrome.tabs.create({ url: config.url, active: false });
    openResults.push({ provider, tabId: tab.id });

    if (autoSend) {
      waitForTabComplete(tab.id).then(() => {
        chrome.tabs.sendMessage(tab.id, {
          type: "sendPrompt",
          provider,
          prompt
        });
      });
    }
  }

  return openResults;
}

async function openDashboard(panels) {
  const url = chrome.runtime.getURL("dashboard.html");
  const dashboardTab = await chrome.tabs.create({ url, active: true });

  if (!Array.isArray(panels) || panels.length === 0) {
    return dashboardTab;
  }

  const normalized = panels.slice(0, 6);
  chrome.storage.local.set({ "multi-ai-dashboard-panels": normalized });

  return dashboardTab;
}

chrome.action.onClicked.addListener(() => {
  openDashboard([]).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "openProviders") {
    const providers = Array.isArray(message.providers) ? message.providers : [];
    const prompt = typeof message.prompt === "string" ? message.prompt : "";
    const autoSend = Boolean(message.autoSend);

    openProviders(providers, prompt, autoSend)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));

    return true;
  }

  if (message.type === "openDashboard") {
    const panels = Array.isArray(message.panels) ? message.panels : [];
    openDashboard(panels)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "openProviderTab") {
    const provider = PROVIDERS[message.provider];
    if (!provider) {
      sendResponse({ ok: false });
      return true;
    }
    chrome.tabs.create({ url: provider.url, active: true })
      .then((tab) => sendResponse({ ok: true, tabId: tab.id }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "sendPromptToProviderTab") {
    const provider = message.provider;
    const prompt = typeof message.prompt === "string" ? message.prompt : "";
    sendPromptToProviderTab(provider, prompt)
      .then((ok) => sendResponse({ ok }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return undefined;
});
