const RESPONSE_SELECTORS = {
  chatgpt: [
    "[data-message-author-role='assistant'] .markdown",
    "[data-message-author-role='assistant']",
    ".markdown.prose",
    "article[data-message-author-role='assistant']"
  ],
  claude: [
    "[data-testid='bot-message']",
    "[data-testid='conversation-turn'] [data-testid='bot-message']",
    "main .message.assistant",
    "main [class*='bot-message']"
  ],
  gemini: [
    "div.markdown.markdown-main-panel",
    ".markdown.markdown-main-panel",
    "structured-content-container.model-response-text",
    ".model-response-text"
  ],
  copilot: [
    "cib-chat-turn.cib-bot-turn",
    "cib-serp .response-message",
    "[class*='bot-message']",
    "[class*='ai-message']"
  ],
  grok: [
    ".response-content-markdown",
    ".response-content-markdown.markdown",
    "[id^='response-'] .response-content-markdown"
  ],
  kimi: [
    "[class*='assistant']",
    "[data-role='assistant']",
    "[class*='answer']"
  ],
  deepseek: [
    ".ds-markdown"
  ],
  doubao: [
    "[data-role='assistant']",
    "[class*='ai-message']"
  ],
  tongyi: [
    "[data-role='assistant']",
    "[class*='ai-message']"
  ],
  yuanbao: [
    "[data-role='assistant']",
    "[class*='ai-message']"
  ],
  zhipu: [
    "[data-role='assistant']",
    "[class*='ai-message']"
  ],
  you: [
    "[data-testid*='chat-message']",
    "[class*='ai-message']"
  ],
  ima: [
    "[data-testid*='chat-message']",
    "[class*='ai-message']"
  ]
};




function extractLatestResponse(provider) {
  const selectors = RESPONSE_SELECTORS[provider] || RESPONSE_SELECTORS.chatgpt || [];
  const root = document.body || document;
  let latest = "";
  for (const sel of selectors) {
    const nodes = root.querySelectorAll ? Array.from(root.querySelectorAll(sel)) : [];
    // Iterate in reverse to find the last non-thinking response node
    for (let i = nodes.length - 1; i >= 0; i--) {
      const target = nodes[i];
      // Skip nodes that ARE thinking blocks or are INSIDE thinking blocks
      if (TC.shouldIgnoreThinkingNode && TC.shouldIgnoreThinkingNode(provider, target)) {
        continue;
      }
      const text = (TC.extractTextExcludingThinking ? TC.extractTextExcludingThinking(provider, target) : "");
      if (text.trim()) {
        latest = text.trim();
        break;
      }
    }
    if (latest) break;
  }
  return latest;
}

// Inline response-state logic (response-state.js may not be injected due to Chrome caching)
const _inlineResponseState = (function() {
  function normalizeText(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }
  function shouldUseGenericResponseStartSignals(provider) {
    return provider !== "deepseek" && provider !== "grok";
  }
  function getProviderStabilityMs(provider) {
    if (provider === "deepseek") return 1500;
    if (provider === "grok") return 1500;
    return 1200;
  }
  function createResponseStabilityTracker(options = {}) {
    const provider = options.provider || "";
    const baselineText = normalizeText(options.baselineText);
    const baselineResponseCount = Number(options.baselineResponseCount) || 0;
    const stabilityMs = Number(options.stabilityMs) || 1200;
    const requireNewResponse = provider === "deepseek";
    let observedNewResponse = !requireNewResponse;
    let lastStableResponse = "";
    let lastStableResponseAt = 0;
    return {
      check(sample = {}) {
        const text = normalizeText(sample.text);
        const responseCount = Number(sample.responseCount) || 0;
        const now = Number(sample.now) || Date.now();
        const streaming = sample.streaming === true;
        if (!text) return { complete: false, reason: "empty" };
        if (!observedNewResponse) {
          // DeepSeek: only check text change, NOT response count.
          // countResponseNodes() includes .ds-message which appears during the
          // thinking phase (before .ds-markdown is created), causing the gate to
          // open prematurely while the text still reads the previous response.
          if (provider === "deepseek") {
            if (text === baselineText) {
              return { complete: false, reason: "baseline" };
            }
          } else {
            if (text === baselineText && responseCount <= baselineResponseCount) {
              return { complete: false, reason: "baseline" };
            }
          }
          console.log(`[DS-gate] opened: text="${text.substring(0, 50)}" baseline="${baselineText.substring(0, 50)}" count=${responseCount} baseline=${baselineResponseCount}`);
          observedNewResponse = true;
        }
        if (text !== lastStableResponse) {
          lastStableResponse = text;
          lastStableResponseAt = now;
          return { complete: false, reason: "changed" };
        }
        if (lastStableResponseAt > 0 && !streaming) {
          const elapsed = now - lastStableResponseAt;
          if (elapsed >= stabilityMs) {
            return { complete: true, reason: "stable", elapsed };
          }
        }
        return { complete: false, reason: "waiting" };
      }
    };
  }
  return { shouldUseGenericResponseStartSignals, getProviderStabilityMs, createResponseStabilityTracker };
})();

// Set global for any code that reads it directly
if (typeof globalThis !== "undefined" && !globalThis.MultiAIResponseState) {
  globalThis.MultiAIResponseState = _inlineResponseState;
}

function getResponseStateApi() {
  return globalThis.MultiAIResponseState || _inlineResponseState;
}

function getProviderStabilityMs(provider) {
  return getResponseStateApi().getProviderStabilityMs(provider);
}

function shouldUseGenericResponseStartSignals(provider) {
  return getResponseStateApi().shouldUseGenericResponseStartSignals(provider);
}

function captureResponseBaseline(provider) {
  return {
    text: extractLatestResponse(provider),
    responseCount: countResponseNodes(provider)
  };
}

const PROVIDER_CONFIGS = {
  chatgpt: {
    inputSelectors: [
      "#prompt-textarea",
      "textarea#prompt-textarea",
      "textarea[data-id='root']",
      "textarea[id*='prompt']",
      "textarea[aria-label*='Message']",
      "textarea[aria-label*='消息']",
      "textarea[placeholder*='Message']",
      "textarea[placeholder*='消息']",
      "textarea[placeholder*='Ask']",
      "form textarea",
      "div[contenteditable='true'][role='textbox'][aria-label*='Message']",
      "div[contenteditable='true'][role='textbox'][aria-label*='Prompt']",
      "div[contenteditable='true'][data-testid='textbox']",
      "div[contenteditable='true'][role='textbox']",
      "div[contenteditable='true']",
      "main textarea",
      "textarea"
    ],
    sendButtonSelectors: [
      "button[data-testid='send-button']",
      "button[aria-label*='Send']",
      "button[aria-label*='发送']",
      "button svg[data-icon='paper-plane']",
      "button:has(svg[data-icon='paper-plane'])",
      "button:has(path[d*='M.5 1.163A1'])",
      // "button[type='submit']", // Too generic, causes false positives
      "button[aria-label*='发送消息']",
      "button[aria-label*='发送对话']"
    ],
    inputType: "contenteditable"
  },
  claude: {
    inputSelectors: [
      "div[contenteditable='true'][data-testid='chat-input']",
      "div[contenteditable='true'][data-placeholder]",
      "div[contenteditable='true'][aria-label*='Message']",
      "div[contenteditable='true'][aria-label*='消息']",
      "div[contenteditable='true'][role='textbox']",
      "div[contenteditable='true'][data-placeholder*='Reply']",
      "div[contenteditable='true'][data-placeholder*='回复']",
      "section textarea",
      "div[contenteditable='true']"
    ],
    sendButtonSelectors: [
      "button[aria-label*='Send']",
      "button[data-testid='send-button']",
      "button[aria-label*='发送']",
      "button:has(svg path[d*='M15.854'])",
      "button[type='submit']",
      "button[data-testid='composer-send-button']"
    ],
    inputType: "contenteditable"
  },
  gemini: {
    inputSelectors: [
      "div[contenteditable='true'][role='textbox'][aria-label*='Gemini']",
      "div[contenteditable='true'][role='textbox'][data-placeholder]",
      "textarea[aria-label*='prompt']",
      "textarea[aria-label*='输入']",
      "textarea[placeholder*='Enter']",
      "textarea",
      "div[contenteditable='true']"
    ],
    sendButtonSelectors: [
      "button.send-button[aria-label='发送']",
      "button.send-button[aria-label='Send']",
      "button.send-button",
      "button[aria-label='发送']",
      "button[aria-label='Send']",
      "button[aria-label*='Send']",
      "button[aria-label*='发送']",
      "button:has(svg)",
      "button[type='submit']"
    ],
    inputType: "textarea"
  },
  copilot: {
    inputSelectors: [
      "div[contenteditable='true'][role='textbox']",
      "div[contenteditable='true'][data-testid*='input']",
      "div[contenteditable='true']",
      "textarea[placeholder*='Ask']",
      "textarea[aria-label]",
      "textarea"
    ],
    sendButtonSelectors: [
      "button[aria-label*='Send']",
      "button[aria-label*='发送']",
      "button[aria-label*='Submit']",
      "button[title*='Submit']",
      "button[type='submit']",
      "button[data-testid='send-button']",
      "button[data-testid*='send']"
    ],
    inputType: "contenteditable"
  },
  grok: {
    inputSelectors: [
      "textarea[placeholder*='Ask Grok']",
      "textarea[placeholder*='Ask']",
      "textarea[aria-label*='Ask Grok']",
      "textarea[aria-label*='Ask']",
      "textarea[placeholder*='Chat']",
      "textarea[placeholder*='聊天']",
      "textarea[aria-label*='message']",
      "textarea[aria-label*='Message']",
      "textarea[id*='message']",
      "div[contenteditable='true'][role='textbox']",
      "div[contenteditable='true'][aria-label*='Ask']",
      "div[contenteditable='true'][aria-label*='message']",
      "div[contenteditable='true'][data-testid*='input']",
      "div[contenteditable='true'][data-testid*='composer']",
      "main textarea",
      "textarea",
      "div[contenteditable='true']"
    ],
    sendButtonSelectors: [
      "button[aria-label*='Send message']",
      "button[aria-label*='Send']",
      "button[aria-label*='Submit']",
      "button[aria-label*='提交']",
      "button[aria-label*='发送']",
      "button[title*='Send']",
      "button[title*='Submit']",
      "button[title*='提交']",
      "button[title*='发送']",
      "button[data-testid*='send']",
      "button[type='submit']",
      "div[role='button'][aria-label*='Send']",
      "div[role='button'][aria-label*='Submit']",
      "div[role='button'][aria-label*='提交']"
    ],
    inputType: "contenteditable",
    useShadow: true
  },
  doubao: {
    inputSelectors: [
      "textarea[placeholder*='输入']",
      "textarea",
      "div[contenteditable='true']"
    ],
    sendButtonSelectors: [
      "button[aria-label*='发送']",
      "button[aria-label*='Send']",
      "button[type='submit']"
    ],
    inputType: "textarea"
  },
  kimi: {
    inputSelectors: [
      "div[contenteditable='true'][data-lexical-editor='true']",
      "div.chat-input-editor-container div[contenteditable='true']",
      "div[class*='chat-input-editor-container'] div[contenteditable='true']",
      "div[contenteditable='true'][id*='chat-input']",
      "div[class*='chat-input'] div[contenteditable='true']",
      "div.editor-content[contenteditable='true']",
      "div[contenteditable='true']",
      "textarea[placeholder*='输入']",
      "textarea"
    ],
    sendButtonSelectors: [
      "button[data-testid='send-button']",
      "button[data-testid*='send']",
      "button[aria-label*='发送']",
      "button[aria-label*='Send']",
      "[role='button'][aria-label*='发送']",
      "[role='button'][aria-label*='Send']",
      "button[type='submit']"
    ],
    inputType: "contenteditable"
  },
  ima: {
    inputSelectors: [
      "textarea[placeholder*='输入']",
      "textarea[placeholder*='请']",
      "textarea[aria-label*='输入']",
      "textarea",
      "div[contenteditable='true'][role='textbox']",
      "div[role='textbox'][contenteditable='true']",
      "div[contenteditable='true']"
    ],
    sendButtonSelectors: [
      "button[type='submit']",
      "button[data-testid='send-button']",
      "button[data-testid*='send']",
      "button[aria-label*='发送']",
      "button[aria-label*='Send']",
      "[role='button'][aria-label*='发送']",
      "[role='button'][aria-label*='Send']"
    ],
    inputType: "contenteditable"
  },
  deepseek: {
    inputSelectors: [
      "textarea[placeholder*='输入']",
      "textarea[placeholder*='发送消息']",
      "textarea[placeholder*='DeepSeek']",
      "textarea",
      "div[contenteditable='true']"
    ],
    sendButtonSelectors: [
      "button[aria-label*='发送']",
      "button[aria-label*='Send']",
      "button[type='submit']"
    ],
    inputType: "textarea"
  },
  tongyi: {
    inputSelectors: [
      "textarea[placeholder*='输入']",
      "textarea",
      "div[contenteditable='true']"
    ],
    sendButtonSelectors: [
      "button[aria-label*='发送']",
      "button[aria-label*='Send']",
      "button[type='submit']"
    ],
    inputType: "textarea"
  },
  yuanbao: {
    inputSelectors: [
      "textarea[placeholder*='输入']",
      "textarea",
      "div[contenteditable='true']"
    ],
    sendButtonSelectors: [
      "button[aria-label*='发送']",
      "button[aria-label*='Send']",
      "button[type='submit']"
    ],
    inputType: "textarea"
  },
  zhipu: {
    inputSelectors: [
      "textarea[placeholder*='输入']",
      "textarea",
      "div[contenteditable='true']"
    ],
    sendButtonSelectors: [
      "button[aria-label*='发送']",
      "button[aria-label*='Send']",
      "button[type='submit']"
    ],
    inputType: "textarea"
  },
  you: {
    inputSelectors: [
      "textarea[data-testid='search-input']",
      "textarea[placeholder*='Ask']",
      "textarea[placeholder*='问']",
      "textarea",
      "div[contenteditable='true']"
    ],
    sendButtonSelectors: [
      "button[data-testid='search-button']",
      "button[aria-label*='Send']",
      "button[aria-label*='发送']",
      "button[type='submit']"
    ],
    inputType: "textarea"
  }
};

const HOST_MAP = [
  { match: "openai", id: "chatgpt" },
  { match: "chatgpt", id: "chatgpt" },
  { match: "claude", id: "claude" },
  { match: "gemini", id: "gemini" },
  { match: "copilot", id: "copilot" },
  { match: "grok", id: "grok" },
  { match: "doubao", id: "doubao" },
  { match: "moonshot", id: "kimi" },
  { match: "kimi.com", id: "kimi" },
  { match: "deepseek", id: "deepseek" },
  { match: "tongyi", id: "tongyi" },
  { match: "qianwen", id: "tongyi" },
  { match: "yuanbao", id: "yuanbao" },
  { match: "chatglm", id: "zhipu" },
  { match: "you.com", id: "you" },
  { match: "ima.qq.com", id: "ima" }
];

function getProviderFromHost() {
  const host = location.host;
  const found = HOST_MAP.find((entry) => host.includes(entry.match));
  return found ? found.id : null;
}

const EXTENSION_ORIGIN = new URL(chrome.runtime.getURL("")).origin;

// DEBUG, log, findElement, deepQueryAll, deepFindElement → send-handlers.js

// Destructure functions from send-handlers.js namespace
// Fallback defaults ensure content.js remains functional if send-handlers.js fails to load
const SH = globalThis.__MAI_Send || {};
const RD = globalThis.__MAI_Response || {};
const TC = globalThis.__MAI_Transcript || {};
const {
  findElement, deepQueryAll,
  waitForElement, waitForElementDeep,
  isElementVisible, isElementDisabled, getEditableText,
  setInputValue,
  clickSendButton, clickSendButtonDeep,
  sendChatGPTMessage, sendCopilotMessage, sendGrokMessage,
  sendKimiMessage, sendImaMessage, sendTongyiMessage,
  getStopSelectors, countResponseNodes,
  log = console.log.bind(console, "[MultiAI Content]")
} = SH;

function postToDashboard(payload) {
  if (!(window.parent && window.parent !== window)) return false;
  try {
    window.parent.postMessage(payload, "*");
    return true;
  } catch (e) {
    return false;
  }
}

function postSendResult(provider, success) {
  return postToDashboard({
    source: "multi-ai-content",
    type: "sendResult",
    provider,
    success: Boolean(success)
  });
}

function sendTranscriptLiveStatus(provider, status, occurredAt = null) {
  if (!provider || !status) return;
  const payload = {
    type: "session:transcript-live-status",
    provider,
    status,
    occurredAt: occurredAt || new Date().toISOString()
  };

  try {
    if (chrome?.runtime?.sendMessage) {
      const result = chrome.runtime.sendMessage(payload);
      if (result && typeof result.catch === "function") {
        result.catch((err) => console.warn(`[MultiAI Content] sendTranscriptLiveStatus (${provider}):`, err));
      }
    }
  } catch (error) {
    console.warn(`[MultiAI Content] Failed to send transcript live-status for ${provider}:`, error);
  }
}

/**
 * Register a cleanup function into the given registry array.
 * The function will be called on page unload to remove listeners or disconnect observers.
 * @param {Array<Function>} registry - The cleanup registry array
 * @param {Function} cleanup - A no-arg function that performs the cleanup
 */
function registerCleanup(registry, cleanup) {
  registry.push(cleanup);
}

/**
 * Execute all cleanup functions in the registry and empty the array.
 * Each cleanup is wrapped in try/catch so one failure does not block the rest.
 * @param {Array<Function>} registry - The cleanup registry array to drain
 */
function cleanupAll(registry) {
  for (const fn of registry) {
    try { fn(); } catch (_) { /* ignore */ }
  }
  registry.length = 0;
}




function sendTranscriptProviderTurn(provider, role, content, occurredAt = null, extra = null) {
  if (!provider || !role || !content) return;

  const payload = {
    type: "session:transcript-provider-turn",
    provider,
    role,
    content,
    occurredAt: occurredAt || new Date().toISOString()
  };
  if (extra && typeof extra === "object") {
    Object.assign(payload, extra);
  }

  try {
    if (chrome?.runtime?.sendMessage) {
      const result = chrome.runtime.sendMessage(payload);
      if (result && typeof result.catch === "function") {
        result.catch((err) => console.warn(`[MultiAI Content] sendTranscriptProviderTurn (${provider}/${role}):`, err));
      }
    }
  } catch (error) {
    console.warn(`[MultiAI Content] Failed to send transcript turn for ${provider} (${role}):`, error);
  }
}




const _sessionSyncCleanupHandlers = [];
const _miscCleanupHandlers = [];

const CHILD_SESSION_SYNC_PROVIDERS = new Set([
  "chatgpt",
  "claude",
  "copilot",
  "deepseek",
  "doubao",
  "gemini",
  "grok",
  "ima",
  "kimi",
  "tongyi",
  "you",
  "yuanbao",
  "zhipu"
]);
const CHILD_SESSION_SYNC_DEBOUNCE_MS = 2000;
let childSessionSyncStarted = false;
let lastSyncedFingerprint = "";

function createDebouncedSync(fn, delay) {
  let timer = null;
  return () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, delay);
  };
}

function sendChildSessionSync(provider) {
  if (!provider || !CHILD_SESSION_SYNC_PROVIDERS.has(provider)) return;
  const url = window.location.href;
  const title = document.title || "";
  const fingerprint = `${provider}::${url}::${title}`;
  const hasFingerprintChanged = fingerprint !== lastSyncedFingerprint;

  if (hasFingerprintChanged) {
    lastSyncedFingerprint = fingerprint;
  }

  const payload = {
    type: "session:sync-child",
    provider,
    url,
    title,
    lastActiveAt: new Date().toISOString()
  };

  try {
    if (chrome?.runtime?.sendMessage) {
      const result = chrome.runtime.sendMessage(payload);
      if (result && typeof result.catch === "function") {
        result.catch((err) => console.warn(`[MultiAI Content] sendChildSessionSync (${provider}):`, err));
      }
    }
  } catch (error) {
    console.warn(`[MultiAI Content] Failed to sync child session for ${provider}:`, error);
  }
}

function startChildSessionSync(provider) {
  if (!provider || !CHILD_SESSION_SYNC_PROVIDERS.has(provider)) return;
  if (childSessionSyncStarted) return;
  childSessionSyncStarted = true;

  const debouncedSync = createDebouncedSync(() => sendChildSessionSync(provider), CHILD_SESSION_SYNC_DEBOUNCE_MS);

  sendChildSessionSync(provider);

  window.addEventListener("popstate", debouncedSync);
  window.addEventListener("hashchange", debouncedSync);

  registerCleanup(_sessionSyncCleanupHandlers,
    () => window.removeEventListener("popstate", debouncedSync));
  registerCleanup(_sessionSyncCleanupHandlers,
    () => window.removeEventListener("hashchange", debouncedSync));

  const titleObserver = new MutationObserver(() => debouncedSync());
  const bodyObserver = new MutationObserver(() => debouncedSync());
  const headObserver = new MutationObserver(() => {
    const titleEl = document.querySelector("title");
    if (titleEl) {
      titleObserver.observe(titleEl, { childList: true, subtree: true, characterData: true });
    }
  });

  const titleEl = document.querySelector("title");
  if (titleEl) {
    titleObserver.observe(titleEl, { childList: true, subtree: true, characterData: true });
  }

  if (document.head) {
    headObserver.observe(document.head, { childList: true, subtree: true });
  }

  if (document.body) {
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      if (document.body) {
        bodyObserver.observe(document.body, { childList: true, subtree: true });
      }
    }, { once: true });
  }

  registerCleanup(_sessionSyncCleanupHandlers, () => titleObserver.disconnect());
  registerCleanup(_sessionSyncCleanupHandlers, () => bodyObserver.disconnect());
  registerCleanup(_sessionSyncCleanupHandlers, () => headObserver.disconnect());
}

log(`Content script loaded for ${window.location.hostname}`);

// waitForElement, findElementDeep, waitForElementDeep → send-handlers.js

// Listen for messages from dashboard
window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  if (event.origin !== EXTENSION_ORIGIN) return;

  const data = event.data || {};
  if (data.type === "getPageUrl") {
    window.parent.postMessage({
      source: "multi-ai-content",
      type: "pageUrl",
      provider: data.provider,
      url: window.location.href
    }, "*");
  }
});

// setInputValue, forceSetEditableText, clickSendButton, clickSendButtonDeep,
// isElementDisabled, isElementVisible, normalizeEditableInput, findEditableNearSendButton,
// findSendButtonNearInput, clickLikeHuman, clickOnce, dispatchEnterKey,
// sendChatGPTMessage, sendCopilotMessage, sendGrokMessage, sendKimiMessage,
// sendImaMessage, sendTongyiMessage, setKimiEditableText → send-handlers.js
// getStopSelectors, countResponseNodes → send-handlers.js



async function trySendPrompt(provider, prompt, retryCount = 0) {
  const maxRetries = provider === "grok" ? 0 : 2;
  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    console.error(`未找到配置 ${provider}`);
    postSendResult(provider, false);
    sendTranscriptLiveStatus(provider, "failed");
    return false;
  }

  // 快速检查页面状态，不必死等 load
  if (document.readyState === "loading") {
    await new Promise((resolve) => {
      window.addEventListener("DOMContentLoaded", resolve, { once: true });
      setTimeout(resolve, 2000); // Max wait 2s
    });
  }

  const input = config.useShadow
    ? await waitForElementDeep(config.inputSelectors, 3000)
    : await waitForElement(config.inputSelectors, 3000);
  if (!input) {
    console.error(`找不到输入框: ${provider}`);
    if (retryCount < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 50));
      return trySendPrompt(provider, prompt, retryCount + 1);
    }
    postSendResult(provider, false);
    sendTranscriptLiveStatus(provider, "failed");
    return false;
  }

  await new Promise(resolve => setTimeout(resolve, 10));

  let sendOk = false;

  // Pause MutationObserver entirely during send + response capture.
  // This prevents the observer from capturing streaming chunks during the send
  // process (especially important for Grok which has its own response detection).
  if (TC.setCapturingActiveResponse) TC.setCapturingActiveResponse(true);
  if (TC.pauseManualTurnObserver) TC.pauseManualTurnObserver();
  const responseBaseline = captureResponseBaseline(provider);

  // Special handlers for complex editors
  if (provider === "chatgpt") {
    sendOk = await sendChatGPTMessage(input, prompt, config);
  } else if (provider === "copilot") {
    sendOk = await sendCopilotMessage(input, prompt, config);
  } else if (provider === "grok") {
    sendOk = await sendGrokMessage(input, prompt, config);
  } else if (provider === "kimi") {
    sendOk = await sendKimiMessage(input, prompt, config);
  } else if (provider === "ima") {
    sendOk = await sendImaMessage(input, prompt, config);
  } else if (provider === "tongyi") {
    sendOk = await sendTongyiMessage(input, prompt, config);
  } else {
    // Generic handler
    const setOk = await setInputValue(input, prompt);
    if (!setOk) {
      console.error(`设置输入值失败 ${provider}`);
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 50));
        return trySendPrompt(provider, prompt, retryCount + 1);
      }
      if (TC.setCapturingActiveResponse) TC.setCapturingActiveResponse(false);
      if (TC.resumeManualTurnObserver) TC.resumeManualTurnObserver(provider);
      postSendResult(provider, false);
      sendTranscriptLiveStatus(provider, "failed");
      return false;
    }

    await new Promise(resolve => setTimeout(resolve, 10));

    // For DeepSeek, the Enter key is more reliable than button click because
    // the send button selector may match sidebar toggle buttons.
    // For other providers, try button click first, then Enter as fallback.
    if (provider === "deepseek") {
      try {
        input.focus({ preventScroll: true });
        const baseEventInit = {
          bubbles: true,
          cancelable: true,
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13
        };

        ["keydown", "keypress", "keyup"].forEach((type) => {
          try {
            const evt = new KeyboardEvent(type, baseEventInit);
            input.dispatchEvent(evt);
          } catch (e) {
            // ignore
          }
        });

        sendOk = true;
      } catch (error) {
        console.error("发送 Enter 事件失败:", error);
        // Fall back to button click
        sendOk = config.useShadow
          ? clickSendButtonDeep(config.sendButtonSelectors)
          : clickSendButton(config.sendButtonSelectors);
      }
    } else {
      sendOk = config.useShadow
        ? clickSendButtonDeep(config.sendButtonSelectors)
        : clickSendButton(config.sendButtonSelectors);

      if (!sendOk && input) {
        try {
          input.focus({ preventScroll: true });
          const baseEventInit = {
            bubbles: true,
            cancelable: true,
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13
          };

          const targets = [input];
          ["keydown", "keypress", "keyup"].forEach((type) => {
            targets.forEach((t) => {
              try {
                const evt = new KeyboardEvent(type, baseEventInit);
                t.dispatchEvent(evt);
              } catch (e) {
                // ignore
              }
            });
          });

          sendOk = true;
        } catch (error) {
          console.error("发送 Enter 事件失败:", error);
        }
      }
    }
  }

  if (window.parent && window.parent !== window) {
    log(`[Content] Sending sendResult to Dashboard for ${provider}: success=${sendOk}`);
    const posted = postSendResult(provider, sendOk);
    if (!posted) {
      console.error(`[Content] Failed to postMessage: sendResult`);
    }
    if (!sendOk) {
      if (TC.setCapturingActiveResponse) TC.setCapturingActiveResponse(false);
      if (TC.resumeManualTurnObserver) TC.resumeManualTurnObserver(provider);
      sendTranscriptLiveStatus(provider, "failed");
    }

    const responseStarted = sendOk ? await (RD.waitForResponseStart ? RD.waitForResponseStart(provider, responseBaseline) : Promise.resolve(false)) : false;
    log(`[Content] Response start detection for ${provider}: ${responseStarted ? "DETECTED" : "NOT DETECTED (or timed out)"}`);

    if (provider === "grok" && sendOk && !responseStarted) {
      log("[Content] Grok response start not detected, downgrade sendResult to failed");
      if (TC.setCapturingActiveResponse) TC.setCapturingActiveResponse(false);
      if (TC.resumeManualTurnObserver) TC.resumeManualTurnObserver(provider);
      sendTranscriptLiveStatus(provider, "interrupted");
      sendOk = false;
      postSendResult(provider, false);
      return sendOk;
    }

    if (responseStarted) {
      sendTranscriptLiveStatus(provider, "responding");
      postToDashboard({
        source: "multi-ai-content",
        type: "responseStarted",
        provider: provider
      });

      (RD.waitForResponseComplete ? RD.waitForResponseComplete(provider, responseBaseline) : Promise.resolve({})).then(() => {
        // Send final turn BEFORE resuming observer to prevent duplicates
        const latest = extractLatestResponse(provider);
        if (latest) {
          sendTranscriptProviderTurn(provider, "assistant", latest, new Date().toISOString(), {
            status: "completed"
          });
        }
        postToDashboard({
          source: "multi-ai-content",
          type: "responseComplete",
          provider: provider,
          text: latest
        });
        sendTranscriptLiveStatus(provider, "completed");
        if (TC.setCapturingActiveResponse) TC.setCapturingActiveResponse(false);
        if (TC.resumeManualTurnObserver) TC.resumeManualTurnObserver(provider);
      });
    } else if (sendOk) {
      if (TC.setCapturingActiveResponse) TC.setCapturingActiveResponse(false);
      if (TC.resumeManualTurnObserver) TC.resumeManualTurnObserver(provider);
      sendTranscriptLiveStatus(provider, "interrupted");
    }
  }

  return sendOk;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "sendPrompt" && message.type !== "sendPromptChatroom") {
    return undefined;
  }

  const provider = message.provider || getProviderFromHost();
  const prompt = typeof message.prompt === "string" ? message.prompt : "";

  trySendPrompt(provider, prompt)
    .then((ok) => sendResponse({ ok }))
    .catch((err) => {
      console.warn(`[MultiAI Content] trySendPrompt (${provider}):`, err);
      sendResponse({ ok: false });
    });
  return true;
});

window.addEventListener("message", (event) => {
  if (event.origin !== EXTENSION_ORIGIN) return;
  const data = event.data || {};
  if (data.source !== "multi-ai") return;
  if (data.type !== "sendPrompt" && data.type !== "sendPromptChatroom") return;

  const provider = data.provider || getProviderFromHost();
  const prompt = typeof data.prompt === "string" ? data.prompt : "";
  trySendPrompt(provider, prompt).catch((err) => console.warn(`[MultiAI Content] trySendPrompt (${provider}):`, err));
});

function initializeCustomFixes() {
  const provider = getProviderFromHost();

  startChildSessionSync(provider);
  if (TC.startManualSendCapture) TC.startManualSendCapture(provider);
  // Start MutationObserver early so the warmup period expires before the user sends a message.
  // Without this, the observer only starts on send and all captures within 2.5s are captureOnly.
  if (TC.startManualTurnCapture) TC.startManualTurnCapture(provider);

  if (provider === "gemini") {
    const style = document.createElement("style");
    style.textContent = `
      html, body, * {
        color-scheme: light !important;
        forced-color-adjust: none !important;
      }
      /* 强制亮色主题变量 */
      :root {
        --gcp-primary-color: #1a73e8 !important;
        --google-blue-600: #1a73e8 !important;
        --google-grey-900: #202124 !important;
        --google-grey-800: #3c4043 !important;
        --google-grey-700: #5f6368 !important;
        --google-grey-500: #9aa0a6 !important;
        --google-grey-400: #bdc1c6 !important;
        --google-grey-200: #e8eaed !important;
        --google-grey-100: #f1f3f4 !important;
        --google-grey-50: #f8f9fa !important;
        background-color: #ffffff !important;
      }
      body {
        background-color: #ffffff !important;
        color: #202124 !important;
      }
    `;
    document.head.appendChild(style);

    const observer = new MutationObserver(() => {
      document.querySelectorAll('[class*="dark"], [class*="Dark"]').forEach(el => {
        el.classList.remove(...Array.from(el.classList).filter(c => c.toLowerCase().includes('dark')));
      });
    });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
    registerCleanup(_miscCleanupHandlers, () => observer.disconnect());

  }

  if (provider === "copilot") {
    const style = document.createElement("style");
    style.textContent = `
      /* 尽量显示内容 */
      .cib-serp-main, .cib-message {
        display: block !important;
      }
    `;
    document.head.appendChild(style);
  }

  if (provider === "you") {
    const style = document.createElement("style");
    style.textContent = `
      [data-testid='search-input'] { opacity: 1 !important; visibility: visible !important; }
    `;
    document.head.appendChild(style);
  }

  // Only run the generic verification helper on explicit verification surfaces.
  // Running it inside Grok itself is risky: repeated probing/clicking can interfere
  // with Grok's own bootstrap and trigger the site's global error boundary.
  const isCloudflareChallengeHost =
    location.host === "challenges.cloudflare.com" ||
    location.hostname.endsWith(".challenges.cloudflare.com");
  if (provider === "gemini" || isCloudflareChallengeHost) {
    const attemptVerification = () => {
      const cfSelectors = [
        "input[type='checkbox'][name*='turnstile']",
        "input[type='checkbox'][name*='cf-turnstile']",
        "#challenge-stage input[type='checkbox']",
        "iframe[src*='cloudflare']",
        "div[class*='cb-i']" // sometime cloudflare checkbox container
      ];

      // Deep search for checkbox
      const deepFindCheckbox = (root) => {
        if (!root) return null;
        // Direct check
        for (const sel of cfSelectors) {
          const el = root.querySelector?.(sel);
          if (el) return el;
        }
        // Walker for Shadow DOM
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (node.shadowRoot) {
            const found = deepFindCheckbox(node.shadowRoot);
            if (found) return found;
          }
          // Check if it's a Cloudflare iframe we can't access but might need to focus
          if (node.tagName === 'IFRAME' && (node.src.includes('cloudflare') || node.title.includes('Cloudflare'))) {
            // We can't access cross-origin iframe contents usually, but if it's same origin we might
            try {
              if (node.contentDocument) {
                const found = deepFindCheckbox(node.contentDocument.body);
                if (found) return found;
              }
            } catch (e) { }
          }
        }
        return null;
      };

      const checkbox = deepFindCheckbox(document.body);
      if (checkbox) {
        console.log("[MultiAI] Found verification checkbox, clicking...");
        checkbox.click();
        // Try pointer events too
        const evt = new MouseEvent("click", {
          view: window,
          bubbles: true,
          cancelable: true
        });
        checkbox.dispatchEvent(evt);
      }
    };

    // Check periodically
    const verificationIntervalId = setInterval(attemptVerification, 2000);

    // Also observe mutations
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes.length > 0) attemptVerification();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    registerCleanup(_miscCleanupHandlers, () => {
      clearInterval(verificationIntervalId);
      observer.disconnect();
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeCustomFixes);
} else {
  initializeCustomFixes();
}

// Cleanup event listeners and observers on page unload to prevent memory leaks
window.addEventListener("beforeunload", () => {
  if (TC.cleanupAll) TC.cleanupAll();
  cleanupAll(_sessionSyncCleanupHandlers);
  cleanupAll(_miscCleanupHandlers);
});

// ─── Expose helpers for transcript-capture.js (lazy access) ────────────────
function isEditableCleared(el) {
  try {
    const raw = el ? (el.tagName === "TEXTAREA" || el.tagName === "INPUT" ? (typeof el.value === "string" ? el.value : "") : (el.innerText || el.textContent || "")) : "";
    const text = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
    return text.length === 0;
  } catch (error) {
    console.warn('[MultiAI Content] isEditableCleared: Failed to extract text from editable element:', error);
    return false;
  }
}

globalThis.__MAI_ResponseSelectors = RESPONSE_SELECTORS;
globalThis.__MAI_ProviderConfigs = typeof PROVIDER_CONFIGS !== "undefined" ? PROVIDER_CONFIGS : {};

globalThis.__MAI_Content = {
  sendTranscriptProviderTurn: sendTranscriptProviderTurn,
  sendTranscriptLiveStatus: sendTranscriptLiveStatus,
  extractLatestResponse: extractLatestResponse,
  captureResponseBaseline: captureResponseBaseline,
  isEditableCleared: isEditableCleared
};
