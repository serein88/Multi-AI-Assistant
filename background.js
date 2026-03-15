const START_PAGE = "dashboard.html";
const DEBUG = true; // Set to false in production

try {
  importScripts("providers.js");
} catch (error) {
  console.error("[MultiAI Background] Failed to import providers.js", error);
}

function log(msg, ...args) {
  if (DEBUG) {
    console.log(`[MultiAI Background] ${msg}`, ...args);
  }
}

const PROVIDERS_BY_ID =
  typeof PROVIDER_BY_ID !== "undefined" && PROVIDER_BY_ID
    ? PROVIDER_BY_ID
    : (typeof PROVIDERS !== "undefined" && Array.isArray(PROVIDERS)
      ? PROVIDERS.reduce((acc, provider) => {
          acc[provider.id] = provider;
          return acc;
        }, {})
      : {});

async function findOrCreateProviderTab(providerId) {
  const config = PROVIDERS_BY_ID[providerId];
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

async function executeChatGPTMainWorldSend(sender, prompt) {
  const tabId = sender?.tab?.id;
  if (typeof tabId !== "number") {
    return { ok: false, error: "missing-tab-id" };
  }

  const target = { tabId };
  if (typeof sender.frameId === "number") {
    target.frameIds = [sender.frameId];
  }

  const results = await chrome.scripting.executeScript({
    target,
    world: "MAIN",
    args: [prompt],
    func: async (messageText) => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const findInput = () =>
        document.querySelector("#prompt-textarea") ||
        document.querySelector("div[contenteditable='true'][role='textbox']") ||
        document.querySelector("textarea");
      const findSendButton = () =>
        document.querySelector("button[data-testid='send-button']") ||
        document.querySelector("button[aria-label*='Send']") ||
        document.querySelector("button[aria-label*='发送']") ||
        document.querySelector("button[aria-label*='发送提示']");

      const input = findInput();
      if (!input) {
        return { ok: false, error: "input-not-found" };
      }

      input.focus({ preventScroll: true });

      if (input.isContentEditable) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(input);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);

        try {
          document.execCommand("selectAll", false, null);
          document.execCommand("delete", false, null);
        } catch (error) {
          input.textContent = "";
        }

        try {
          input.dispatchEvent(new InputEvent("beforeinput", {
            bubbles: true,
            composed: true,
            cancelable: true,
            inputType: "insertText",
            data: messageText
          }));
        } catch (error) {
          // ignore event constructor failures
        }

        let inserted = false;
        try {
          inserted = document.execCommand("insertText", false, messageText);
        } catch (error) {
          inserted = false;
        }

        if (!inserted) {
          input.textContent = messageText;
        }

        try {
          input.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            composed: true,
            inputType: "insertText",
            data: messageText
          }));
        } catch (error) {
          input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        }
        input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      } else {
        const proto =
          input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(input, messageText);
        else input.value = messageText;
        input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      }

      await sleep(80);

      for (let attempt = 0; attempt < 20; attempt += 1) {
        const button = findSendButton();
        if (button && !button.disabled) {
          button.click();
          return { ok: true, method: "button" };
        }
        await sleep(50);
      }

      const enterInit = {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        composed: true,
        cancelable: true
      };
      ["keydown", "keypress", "keyup"].forEach((type) => {
        try {
          input.dispatchEvent(new KeyboardEvent(type, enterInit));
        } catch (error) {
          // ignore
        }
      });

      return { ok: true, method: "enter" };
    }
  });

  return results?.[0]?.result || { ok: false, error: "no-result" };
}

async function executeTongyiMainWorldSend(sender, prompt) {
  const tabId = sender?.tab?.id;
  if (typeof tabId !== "number") {
    return { ok: false, error: "missing-tab-id" };
  }

  const target = { tabId };
  if (typeof sender.frameId === "number") {
    target.frameIds = [sender.frameId];
  }

  const results = await chrome.scripting.executeScript({
    target,
    world: "MAIN",
    args: [prompt],
    func: async (messageText) => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const input =
        document.querySelector("div[data-slate-editor='true'][contenteditable='true']") ||
        document.querySelector("div[role='textbox'][data-placeholder][contenteditable='true']") ||
        document.querySelector("div[role='textbox'][contenteditable='true']");
      if (!input) {
        return { ok: false, error: "input-not-found" };
      }

      input.focus({ preventScroll: true });

      try {
        document.execCommand("selectAll", false, null);
        document.execCommand("delete", false, null);
      } catch (error) {
        input.textContent = "";
      }

      try {
        input.dispatchEvent(new InputEvent("beforeinput", {
          bubbles: true,
          composed: true,
          cancelable: true,
          inputType: "insertText",
          data: messageText
        }));
      } catch (error) {
        // ignore
      }

      let inserted = false;
      try {
        inserted = document.execCommand("insertText", false, messageText);
      } catch (error) {
        inserted = false;
      }
      if (!inserted) {
        input.textContent = messageText;
      }

      try {
        input.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertText",
          data: messageText
        }));
      } catch (error) {
        input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      }
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

      await sleep(120);

      const findSendControl = () => {
        const candidates = Array.from(document.querySelectorAll("div, button"));
        return (
          candidates.find((el) => {
            const className = typeof el.className === "string" ? el.className : "";
            return className.includes("operateBtn") && !className.toLowerCase().includes("disabled");
          }) ||
          null
        );
      };

      const control = findSendControl();
      if (control) {
        control.click();
        return { ok: true, method: "button" };
      }

      const enterInit = {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        composed: true,
        cancelable: true
      };
      ["keydown", "keypress", "keyup"].forEach((type) => {
        try {
          input.dispatchEvent(new KeyboardEvent(type, enterInit));
        } catch (error) {
          // ignore
        }
      });

      return { ok: true, method: "enter" };
    }
  });

  return results?.[0]?.result || { ok: false, error: "no-result" };
}

async function openProviders(providers, prompt, autoSend) {
  const openResults = [];

  for (const provider of providers) {
    const config = PROVIDERS_BY_ID[provider];
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
  log(`Received message: ${message.type}`, message);

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
    const provider = PROVIDERS_BY_ID[message.provider];
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

  if (message.type === "executeChatGPTMainWorldSend") {
    const prompt = typeof message.prompt === "string" ? message.prompt : "";
    executeChatGPTMainWorldSend(sender, prompt)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "executeTongyiMainWorldSend") {
    const prompt = typeof message.prompt === "string" ? message.prompt : "";
    executeTongyiMainWorldSend(sender, prompt)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return undefined;
});
