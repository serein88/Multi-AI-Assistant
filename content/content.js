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

const MANUAL_TURN_CAPTURE_PROVIDERS = new Set(["deepseek", "gemini", "grok"]);
const MANUAL_USER_SELECTORS = {
  default: [
    "[data-role='user']",
    "[data-message-author-role='user']",
    "[data-testid='user-message']",
    "[data-testid*='user-message']",
    "[class*='message-user']",
    "[class*='user-message']",
    "[class*='human-message']",
    "[class*='from-user']"
  ],
  deepseek: [
    ".ds-message:not(:has(.ds-markdown))",
    "[class*='message-user']",
    "[data-role='user']",
    "[data-message-author-role='user']"
  ],
  gemini: [
    "div.query-text.gds-body-l",
    "div.query-text",
    "p.query-text-line"
  ],
  grok: [
    "[data-role='user']",
    "[data-message-author-role='user']",
    "[class*='message-user']",
    "[class*='user-message']"
  ]
};
const MANUAL_ASSISTANT_SELECTORS = {
  default: [
    "[data-role='assistant']",
    "[data-message-author-role='assistant']",
    "[data-testid='bot-message']",
    "[data-testid*='assistant-message']",
    "[class*='message-assistant']",
    "[class*='assistant-message']",
    "[class*='bot-message']",
    "[class*='ai-message']"
  ],
  deepseek: [
    ".ds-message:has(.ds-markdown)",
    "[data-role='assistant']",
    "[data-message-author-role='assistant']",
    "[class*='message-assistant']",
    "[class*='assistant-message']"
  ],
  gemini: [
    "div.markdown.markdown-main-panel",
    "structured-content-container.model-response-text",
    ".model-response-text"
  ],
  grok: [
    ".response-content-markdown",
    ".response-content-markdown.markdown",
    "[id^='response-'] .response-content-markdown"
  ]
};

const THINKING_SELECTORS = {
  deepseek: [
    "[class*='ds-think-content']",
    ".ds-think-content"
  ],
  gemini: [
    "[class*='thinking']",
    "[class*='reasoning']",
    "[data-testid*='thinking']",
    ".thought-content",
    ".thinking-chip"
  ],
  grok: [
    "[class*='thinking']",
    "[class*='reasoning']",
    "[class*='thought']",
    "[data-testid*='thinking']",
    "[class*='think-block']"
  ]
};

function shouldIgnoreThinkingNode(provider, node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  const selectors = THINKING_SELECTORS[provider];
  if (!selectors || selectors.length === 0) return false;

  // Check if the node itself matches a thinking selector
  for (const sel of selectors) {
    try {
      if (node.matches(sel)) return true;
    } catch { /* ignore invalid selector */ }
  }

  // Check if the node is inside a thinking block
  for (const sel of selectors) {
    try {
      if (node.closest(sel)) return true;
    } catch { /* ignore invalid selector */ }
  }

  return false;
}

function extractTextExcludingThinking(provider, node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) {
    return node ? (node.textContent || "") : "";
  }
  const selectors = THINKING_SELECTORS[provider];
  if (!selectors || selectors.length === 0) {
    return node.innerText || node.textContent || "";
  }
  const clone = node.cloneNode(true);
  for (const sel of selectors) {
    try {
      clone.querySelectorAll(sel).forEach((el) => el.remove());
    } catch { /* ignore */ }
  }
  return clone.innerText || clone.textContent || "";
}

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
      if (shouldIgnoreThinkingNode(provider, target)) {
        continue;
      }
      const text = extractTextExcludingThinking(provider, target);
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

function findElement(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function deepQueryAll(root, selector) {
  if (!root) return [];
  const results = [];
  try {
    results.push(...root.querySelectorAll(selector));
  } catch {
    // ignore invalid selectors in deep search
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.shadowRoot) {
      results.push(...deepQueryAll(node.shadowRoot, selector));
    }
  }
  return results;
}

function deepFindElement(selectors) {
  const root = document.body || document.documentElement || document;
  for (const selector of selectors) {
    const matches = deepQueryAll(root, selector);
    if (matches.length) return matches[0];
  }
  return null;
}

const EXTENSION_ORIGIN = new URL(chrome.runtime.getURL("")).origin;

const DEBUG = false; // Set to true for development debugging
function log(msg, ...args) {
  if (DEBUG) {
    console.log(`[MultiAI Content] ${msg}`, ...args);
    // Forward log to dashboard for unified debugging
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({
          source: "multi-ai-content",
          type: "log",
          message: msg,
          args: args
        }, "*");
      } catch (e) {
        // ignore cross-origin errors
      }
    }
  }
}

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

let manualTurnCaptureStarted = false;
let manualTurnNodeSnapshot = new WeakMap();
const pendingManualTurnRoots = new Set();
let manualTurnFlushTimer = null;
let manualTurnWarmupUntil = 0;
let manualTurnCapturingActiveResponse = false;
let manualTurnObserver = null;

let manualSendCaptureStarted = false;
const _manualSendCleanupHandlers = [];
const _sessionSyncCleanupHandlers = [];
const _observerCleanupHandlers = [];

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
let lastManualSendProvider = "";
let lastManualSendText = "";
let lastManualSendAt = 0;

function getManualSelectors(map, provider, fallback = []) {
  const scoped = Array.isArray(map?.[provider]) ? map[provider] : [];
  const defaults = Array.isArray(map?.default) ? map.default : fallback;
  return Array.from(new Set([...scoped, ...defaults]));
}

function getManualUserSelectors(provider) {
  return getManualSelectors(MANUAL_USER_SELECTORS, provider);
}

function getManualAssistantSelectors(provider) {
  return Array.from(new Set([
    ...getManualSelectors(MANUAL_ASSISTANT_SELECTORS, provider),
    ...(Array.isArray(RESPONSE_SELECTORS[provider]) ? RESPONSE_SELECTORS[provider] : [])
  ]));
}

function normalizeTurnText(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim();
}

function normalizeProviderTurnText(provider, role, raw) {
  let text = normalizeTurnText(raw);
  if (!text) {
    return "";
  }

  if (provider === "gemini") {
    if (role === "user") {
      text = text.replace(/^(你说|You said)\s*/i, "");
    } else if (role === "assistant") {
      text = text.replace(/^(Gemini 说|Gemini said)\s*/i, "");
    }
  }

  return normalizeTurnText(text);
}

function shouldIgnoreManualTurnNode(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) {
    return true;
  }

  if (node.getAttribute("aria-hidden") === "true" || node.closest("[aria-hidden='true']")) {
    return true;
  }

  const className = typeof node.className === "string" ? node.className : "";
  if (
    /\b(?:cdk-visually-hidden|visually-hidden|screen-reader-[^\s]+)\b/.test(className) ||
    /\bscreen-reader\b/.test(className)
  ) {
    return true;
  }

  return false;
}

function pruneManualTurnNodes(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }

  const unique = Array.from(new Set(nodes)).filter((node) => !shouldIgnoreManualTurnNode(node));
  return unique.filter((node) => !unique.some((other) => (
    other !== node &&
    other.nodeType === Node.ELEMENT_NODE &&
    node.contains(other)
  )));
}

function findRoleFromAttributes(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return "";
  const roleHint = `${node.getAttribute("data-role") || ""} ${node.getAttribute("data-message-author-role") || ""}`.toLowerCase();
  if (roleHint.includes("user") || roleHint.includes("human")) return "user";
  if (roleHint.includes("assistant") || roleHint.includes("bot") || roleHint.includes("model")) return "assistant";
  return "";
}

function elementMatchesAnySelector(node, selectors) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE || !Array.isArray(selectors)) return false;
  for (const selector of selectors) {
    try {
      if (node.matches(selector)) {
        return true;
      }
    } catch {
      // ignore selector mismatch
    }
  }
  return false;
}

function collectMatchingElements(root, selectors) {
  if (!root || root.nodeType !== Node.ELEMENT_NODE || !Array.isArray(selectors) || selectors.length === 0) {
    return [];
  }

  const nodes = [];
  if (elementMatchesAnySelector(root, selectors)) {
    nodes.push(root);
  }

  for (const selector of selectors) {
    try {
      const matches = root.querySelectorAll(selector);
      if (matches && matches.length > 0) {
        nodes.push(...matches);
      }
    } catch {
      // ignore selector mismatch
    }
  }

  return Array.from(new Set(nodes));
}

function detectManualTurnRole(provider, node, userSelectors, assistantSelectors) {
  const fromAttr = findRoleFromAttributes(node);
  if (fromAttr) {
    return fromAttr;
  }
  if (elementMatchesAnySelector(node, userSelectors)) {
    return "user";
  }
  if (elementMatchesAnySelector(node, assistantSelectors)) {
    return "assistant";
  }
  return "";
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

function isCapturingActiveResponse() {
  return manualTurnCapturingActiveResponse;
}

function pauseManualTurnObserver() {
  if (manualTurnObserver) {
    manualTurnObserver.disconnect();
  }
  if (manualTurnFlushTimer) {
    clearTimeout(manualTurnFlushTimer);
    manualTurnFlushTimer = null;
  }
  pendingManualTurnRoots.clear();
}

function resumeManualTurnObserver(provider) {
  if (manualTurnObserver && document.body) {
    manualTurnObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
}

function setCapturingActiveResponse(active) {
  manualTurnCapturingActiveResponse = active;
}

function rememberTurnNodeSnapshot(provider, node, role, content, options = {}) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const normalized = normalizeProviderTurnText(provider, role, content);
  if (!normalized) {
    return;
  }

  const previous = manualTurnNodeSnapshot.get(node);
  if (previous && previous.role === role && previous.content === normalized) {
    return;
  }

  manualTurnNodeSnapshot.set(node, { role, content: normalized });
  if (options.captureOnly) {
    return;
  }

  // During active response capture, the waitForResponseComplete path sends the
  // final turn. Suppress intermediate streaming chunks from the MutationObserver.
  if (role === "assistant" && isCapturingActiveResponse()) {
    return;
  }

  sendTranscriptProviderTurn(provider, role, normalized, new Date().toISOString());
}

function scanManualTurnRoots(provider, roots, options = {}) {
  if (!provider || !MANUAL_TURN_CAPTURE_PROVIDERS.has(provider) || !document.body) {
    return;
  }

  const userSelectors = getManualUserSelectors(provider);
  const assistantSelectors = getManualAssistantSelectors(provider);
  const candidates = new Map();

  roots.forEach((root) => {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
    collectMatchingElements(root, userSelectors).forEach((node) => candidates.set(node, "user"));
    collectMatchingElements(root, assistantSelectors).forEach((node) => {
      if (!candidates.has(node)) {
        candidates.set(node, "assistant");
      }
    });
  });

  const orderedNodes = pruneManualTurnNodes(Array.from(candidates.keys()));
  orderedNodes.forEach((node) => {
    // Skip thinking/reasoning content blocks
    if (shouldIgnoreThinkingNode(provider, node)) {
      return;
    }
    const fallbackRole = candidates.get(node);
    const role = detectManualTurnRole(provider, node, userSelectors, assistantSelectors) || fallbackRole;
    if (role !== "user" && role !== "assistant") {
      return;
    }
    const text = normalizeProviderTurnText(provider, role, extractTextExcludingThinking(provider, node));
    if (!text) {
      return;
    }
    rememberTurnNodeSnapshot(provider, node, role, text, options);
  });
}

function enqueueManualTurnRoot(provider, root) {
  if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
  // Walk up to find the nearest message container so querySelectorAll can match
  // deep selectors like ".ds-message:has(.ds-markdown)". Without this, mutation
  // targets are often deeply nested text spans that contain no matching children.
  const MESSAGE_CONTAINER_SELECTORS = [".ds-message", ".response-content-markdown", "[data-message-author-role]"];
  let container = root;
  for (const sel of MESSAGE_CONTAINER_SELECTORS) {
    try {
      const found = root.closest(sel);
      if (found) { container = found; break; }
    } catch { /* ignore */ }
  }
  pendingManualTurnRoots.add(container);
  if (manualTurnFlushTimer) return;

  manualTurnFlushTimer = setTimeout(() => {
    manualTurnFlushTimer = null;
    const roots = Array.from(pendingManualTurnRoots);
    pendingManualTurnRoots.clear();
    const captureOnly = Date.now() < manualTurnWarmupUntil;
    scanManualTurnRoots(provider, roots, captureOnly ? { captureOnly: true } : undefined);
  }, 120);
}

function startManualTurnCapture(provider) {
  if (!provider || !MANUAL_TURN_CAPTURE_PROVIDERS.has(provider)) return;
  if (manualTurnCaptureStarted) return;
  if (!document.body) return;
  manualTurnCaptureStarted = true;
  manualTurnNodeSnapshot = new WeakMap();
  manualTurnWarmupUntil = Date.now() + 2500;

  scanManualTurnRoots(provider, [document.body], { captureOnly: true });

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        if (mutation.target?.parentElement) {
          enqueueManualTurnRoot(provider, mutation.target.parentElement);
        }
        continue;
      }

      if (mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE) {
        enqueueManualTurnRoot(provider, mutation.target);
      }

      if (!mutation.addedNodes || mutation.addedNodes.length === 0) {
        continue;
      }

      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          enqueueManualTurnRoot(provider, node);
        } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
          enqueueManualTurnRoot(provider, node.parentElement);
        }
      });
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  manualTurnObserver = observer;

  registerCleanup(_observerCleanupHandlers, () => {
    observer.disconnect();
    if (manualTurnObserver === observer) {
      manualTurnObserver = null;
    }
  });
}

function isManualSendSuppressed(provider, prompt) {
  if (!provider || !prompt) {
    return false;
  }

  if (provider !== lastManualSendProvider) {
    return false;
  }

  if (prompt !== lastManualSendText) {
    return false;
  }

  return Date.now() - lastManualSendAt < 1200;
}

function rememberManualSend(provider, prompt) {
  lastManualSendProvider = provider;
  lastManualSendText = prompt;
  lastManualSendAt = Date.now();
}

function isEditableElement(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return true;
  return el.isContentEditable === true || el.getAttribute("contenteditable") === "true";
}

function findClosestEditableTarget(start) {
  if (!start || start.nodeType !== Node.ELEMENT_NODE) return null;
  if (isEditableElement(start)) return start;
  return start.closest("textarea, input, [contenteditable='true'], [role='textbox']");
}

function extractPromptFromEditable(el) {
  if (!el) return "";
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    return typeof el.value === "string" ? el.value : "";
  }
  return getEditableText(el) || el.innerText || el.textContent || "";
}

function isEditableCleared(el) {
  try {
    const text = normalizeTurnText(extractPromptFromEditable(el));
    return text.length === 0;
  } catch (error) {
    console.warn('[MultiAI Content] isEditableCleared: Failed to extract text from editable element:', error);
    return false;
  }
}

function getManualSendButtonSelectors(provider) {
  const selectors = Array.isArray(PROVIDER_CONFIGS?.[provider]?.sendButtonSelectors)
    ? PROVIDER_CONFIGS[provider].sendButtonSelectors
    : [];

  // Some configs intentionally include broad fallbacks for automation (e.g. `button:has(svg)`).
  // For manual user send detection we must keep it conservative to avoid false positives.
  return selectors.filter((sel) => sel && sel !== "button:has(svg)");
}

function findAncestorMatchingAnySelector(node, selectors, maxDepth = 6) {
  let current = node;
  let depth = 0;
  while (current && depth <= maxDepth) {
    if (elementMatchesAnySelector(current, selectors)) {
      return current;
    }
    current = current.parentElement;
    depth += 1;
  }
  return null;
}

function recordManualSend(provider, prompt) {
  const normalized = normalizeProviderTurnText(provider, "user", prompt);
  if (!normalized) return;

  if (isManualSendSuppressed(provider, normalized)) {
    return;
  }
  rememberManualSend(provider, normalized);

  // Only start DOM-based turn capture when a *real user action* happens.
  // This avoids restore/load re-ingestion while still making manual-chat capture robust.
  startManualTurnCapture(provider);
  // Pause MutationObserver entirely during response capture to prevent interference.
  // Only the waitForResponseComplete path will send the final turn.
  setCapturingActiveResponse(true);
  pauseManualTurnObserver();
  const responseBaseline = captureResponseBaseline(provider);

  const inputEl = arguments.length >= 3 ? arguments[2] : null;
  const occurredAt = new Date().toISOString();

  const finishCapture = () => {
    setCapturingActiveResponse(false);
    resumeManualTurnObserver(provider);
  };

  const startResponseFlow = (assumeStarted = false) => {
    sendTranscriptProviderTurn(provider, "user", normalized, occurredAt);

    const startedPromise = assumeStarted ? Promise.resolve(true) : waitForResponseStart(provider, responseBaseline);

    // Best-effort: detect answering state and capture the final assistant text for manual sends too.
    startedPromise.then((started) => {
      if (!started) {
        finishCapture();
        sendTranscriptLiveStatus(provider, "interrupted", new Date().toISOString());
        return;
      }

      sendTranscriptLiveStatus(provider, "responding", new Date().toISOString());

      waitForResponseComplete(provider, responseBaseline).then(() => {
        const latest = extractLatestResponse(provider);
        if (latest) {
          sendTranscriptProviderTurn(provider, "assistant", latest, new Date().toISOString(), {
            status: "completed"
          });
        }
        finishCapture();
        sendTranscriptLiveStatus(provider, "completed", new Date().toISOString());
      });
    });
  };

  // Delay until after the UI has applied the send. This prevents false positives when the user
  // presses Enter but the message is not actually sent (e.g. blocked by overlays).
  setTimeout(() => {
    if (inputEl && !isEditableCleared(inputEl)) {
      // Fallback: input did not clear, so confirm by observing response start.
      waitForResponseStart(provider, responseBaseline).then((started) => {
        if (!started) {
          finishCapture();
          return;
        }
        startResponseFlow(true);
      });
      return;
    }

    startResponseFlow(false);
  }, 900);
}

function startManualSendCapture(provider) {
  if (!provider || !MANUAL_TURN_CAPTURE_PROVIDERS.has(provider)) return;
  if (manualSendCaptureStarted) return;
  if (!document.body) return;
  manualSendCaptureStarted = true;

  const handleKeydown = (event) => {
    if (!event || !event.isTrusted) return;
    if (event.defaultPrevented) return;

    const key = event.key || "";
    if (key !== "Enter") return;
    if (event.shiftKey) return;

    const target = findClosestEditableTarget(event.target);
    if (!target) return;
    const prompt = extractPromptFromEditable(target);
    if (!prompt || !String(prompt).trim()) return;

    recordManualSend(provider, prompt, target);
  };

  const handleClick = (event) => {
    if (!event || !event.isTrusted) return;
    if (!event.target || event.target.nodeType !== Node.ELEMENT_NODE) return;

    const selectors = getManualSendButtonSelectors(provider);
    if (selectors.length === 0) return;
    const matched = findAncestorMatchingAnySelector(event.target, selectors);
    if (!matched) return;

    const active = findClosestEditableTarget(document.activeElement) ||
      findClosestEditableTarget(document.querySelector("textarea, [contenteditable='true'], [role='textbox']")) ||
      findClosestEditableTarget(findElement(PROVIDER_CONFIGS[provider]?.inputSelectors || []));
    if (!active) return;

    const prompt = extractPromptFromEditable(active);
    if (!prompt || !String(prompt).trim()) return;

    recordManualSend(provider, prompt, active);
  };

  document.addEventListener("keydown", handleKeydown, true);
  document.addEventListener("click", handleClick, true);

  registerCleanup(_manualSendCleanupHandlers,
    () => document.removeEventListener("keydown", handleKeydown, true));
  registerCleanup(_manualSendCleanupHandlers,
    () => document.removeEventListener("click", handleClick, true));
}

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

function waitForElement(selectors, timeout = 3000) {
  return new Promise((resolve) => {
    const start = Date.now();

    const check = () => {
      const found = findElement(selectors);
      if (found) return resolve(found);
      if (Date.now() - start > timeout) return resolve(null);
      requestAnimationFrame(check);
    };

    check();
  });
}

function findElementDeep(selectors) {
  for (const selector of selectors) {
    const direct = document.querySelector(selector);
    if (direct) return direct;
    const deep = deepQueryAll(document.body, selector);
    if (deep.length > 0) return deep[0];
  }
  return null;
}

function waitForElementDeep(selectors, timeout = 3000) {
  return new Promise((resolve) => {
    const start = Date.now();

    const check = () => {
      const found = findElementDeep(selectors);
      if (found) return resolve(found);
      if (Date.now() - start > timeout) return resolve(null);
      requestAnimationFrame(check);
    };

    check();
  });
}

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

function setInputValue(el, value) {
  if (!el) return false;

  try {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      el.focus({ preventScroll: true });
      el.select();
      el.setSelectionRange(0, el.value.length);
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event("keydown", { bubbles: true, cancelable: true, key: "Delete" }));

      return new Promise((resolve) => {
        setTimeout(() => {
          try {
            el.value = value;
            el.focus({ preventScroll: true });

            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement?.prototype || window.HTMLInputElement?.prototype,
              "value"
            )?.set;

            if (nativeInputValueSetter) {
              nativeInputValueSetter.call(el, value);
            }

            const inputEvent = new Event("input", { bubbles: true, cancelable: true });
            const changeEvent = new Event("change", { bubbles: true, cancelable: true });

            el.dispatchEvent(inputEvent);
            el.dispatchEvent(changeEvent);

            const reactInputEvent = new Event("input", { bubbles: true, cancelable: true });
            Object.defineProperty(reactInputEvent, "target", { value: el, enumerable: true });
            el.dispatchEvent(reactInputEvent);

            el.setSelectionRange(value.length, value.length);
            resolve(true);
          } catch (error) {
            console.error("设置输入值失败", error);
            resolve(false);
          }
        }, 10); // Reduced delay
      });
    }

    if (el.isContentEditable) {
      el.focus({ preventScroll: true });
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("delete", false);
      el.textContent = "";

      return new Promise((resolve) => {
        setTimeout(() => {
          try {
            // Try execCommand first (best for preserving newlines as editor expects)
            const insertSuccess = document.execCommand("insertText", false, value);

            if (!insertSuccess) {
              // Fallback: replace newlines with <br> and set innerHTML
              // This handles sites that don't support insertText but use contenteditable
              el.innerHTML = value.replace(/\r\n/g, "\n").replace(/\n/g, "<br>");
            }

            const newRange = document.createRange();
            const newSel = window.getSelection();
            newRange.selectNodeContents(el);
            newRange.collapse(false);
            newSel.removeAllRanges();
            newSel.addRange(newRange);

            el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
            el.dispatchEvent(new Event("textInput", { bubbles: true, cancelable: true }));
            el.dispatchEvent(new Event("keyup", { bubbles: true, cancelable: true }));

            resolve(true);
          } catch (error) {
            console.error("设置 contenteditable 值失败", error);
            resolve(false);
          }
        }, 10); // Reduced delay
      });
    }
  } catch (error) {
    console.error("设置输入值失败", error);
    return Promise.resolve(false);
  }

  return Promise.resolve(false);
}

function clickSendButton(selectors) {
  const button = findElement(selectors);
  if (!button || isElementDisabled(button) || !isElementVisible(button)) return false;

  try {
    // Scroll removed to prevent window jumping
    // if (button.offsetParent === null) {
    //   button.scrollIntoView({ behavior: "smooth", block: "center" });
    //   setTimeout(() => button.click(), 100);
    // } else {
    button.click();
    // }
    return true;
  } catch (error) {
    console.error("点击发送按钮失败", error);
    try {
      const mouseEvent = new MouseEvent("click", {
        view: window,
        bubbles: true,
        cancelable: true
      });
      button.dispatchEvent(mouseEvent);
      return true;
    } catch (e) {
      return false;
    }
  }
}

function clickSendButtonDeep(selectors) {
  const button = findElementDeep(selectors);
  if (!button || isElementDisabled(button) || !isElementVisible(button)) return false;
  try {
    button.click();
    return true;
  } catch (error) {
    try {
      const mouseEvent = new MouseEvent("click", {
        view: window,
        bubbles: true,
        cancelable: true
      });
      button.dispatchEvent(mouseEvent);
      return true;
    } catch (e) {
      return false;
    }
  }
}

function isElementDisabled(el) {
  if (!el) return true;
  if (el.disabled === true) return true;
  if (el.getAttribute && el.getAttribute("disabled") !== null) return true;
  if (el.getAttribute && el.getAttribute("aria-disabled") === "true") return true;
  const className = typeof el.className === "string" ? el.className : "";
  if (/\bdisabled\b/i.test(className)) return true;
  if (/\bis-disabled\b/i.test(className)) return true;
  return false;
}

function getEditableText(el) {
  if (!el) return "";
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "INPUT") return el.value || "";
  if (el.isContentEditable) return el.innerText || el.textContent || "";
  return "";
}

function isElementVisible(el) {
  if (!el) return false;
  const rects = el.getClientRects ? el.getClientRects() : null;
  if (rects && rects.length === 0) return false;
  return true;
}

function normalizeEditableInput(el) {
  if (!el) return null;
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "INPUT") return el;
  if (el.isContentEditable) return el;

  const child = el.querySelector?.(
    "textarea, input[type='text'], input:not([type]), div[contenteditable='true'], [role='textbox'][contenteditable='true'], [contenteditable='true']"
  );
  if (child) return child;

  const parent = el.closest?.(
    "textarea, input[type='text'], input:not([type]), div[contenteditable='true'], [role='textbox'][contenteditable='true'], [contenteditable='true']"
  );
  return parent || null;
}

function collectEditableCandidates(selectors, useShadow = false) {
  const candidates = [];
  for (const selector of selectors || []) {
    const items = useShadow ? deepQueryAll(document, selector) : (document.querySelectorAll ? document.querySelectorAll(selector) : []);
    for (const el of items) {
      const normalized = normalizeEditableInput(el);
      if (!normalized) continue;
      if (!isElementVisible(normalized)) continue;
      candidates.push(normalized);
    }
  }
  return candidates;
}

function scoreEditableCandidate(el) {
  if (!el) return 0;
  let score = 0;
  if (el.getAttribute?.("data-lexical-editor") === "true") score += 6;
  if (el.getAttribute?.("role") === "textbox") score += 3;
  if (el.isContentEditable) score += 2;
  const className = typeof el.className === "string" ? el.className : "";
  if (/chat|input|composer|editor/i.test(className)) score += 1;
  return score;
}

function findEditableNearSendButton(input, selectors, sendSelectors, useShadow = false) {
  const normalizedInput = normalizeEditableInput(input);
  const candidates = collectEditableCandidates(selectors, useShadow);
  if (normalizedInput && !candidates.includes(normalizedInput)) {
    candidates.unshift(normalizedInput);
  }

  const sendButton = useShadow ? deepFindElement(sendSelectors) : findElement(sendSelectors);
  if (sendButton) {
    const container = sendButton.closest?.(
      "form, [class*='chat-input'], [class*='chatInput'], [class*='input'], [class*='composer'], [class*='editor'], main"
    );
    if (container) {
      const scoped = candidates.filter((el) => container.contains(el));
      if (scoped.length) {
        return scoped.sort((a, b) => scoreEditableCandidate(b) - scoreEditableCandidate(a))[0];
      }
    }
  }

  if (candidates.length) {
    return candidates.sort((a, b) => scoreEditableCandidate(b) - scoreEditableCandidate(a))[0];
  }

  return normalizedInput;
}

function findSendButtonNearInput(selectors, input) {
  const roots = [];
  const form = input?.closest?.("form");
  const container =
    input?.closest?.("[class*='chat-input']") ||
    input?.closest?.("[class*='chatInput']") ||
    input?.closest?.("[class*='input']") ||
    input?.parentElement;

  if (form) roots.push(form);
  if (container && container !== form) roots.push(container);
  roots.push(document);

  for (const root of roots) {
    for (const selector of selectors || []) {
      const candidates = root.querySelectorAll ? Array.from(root.querySelectorAll(selector)) : [];
      for (const el of candidates) {
        if (!isElementVisible(el)) continue;
        if (isElementDisabled(el)) continue;

        const label = (
          (el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("title"))) ||
          el.textContent ||
          ""
        ).toLowerCase();
        const className = typeof el.className === "string" ? el.className : "";
        const looksSend =
          label.includes("send") ||
          label.includes("submit") ||
          label.includes("提交") ||
          /\bsend\b/i.test(className) ||
          /send-button/i.test(className) ||
          /sendButton/i.test(className) ||
          /send-button-container/i.test(className) ||
          el.getAttribute?.("type") === "submit" ||
          !!el.querySelector?.("svg");

        if (!looksSend) continue;
        return el;
      }
    }
  }
  return null;
}

function clickLikeHuman(el) {
  if (!el) return false;
  try {
    el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, composed: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, composed: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, composed: true, cancelable: true }));
    el.click();
    return true;
  } catch (e) {
    try {
      el.click();
      return true;
    } catch {
      return false;
    }
  }
}

function clickOnce(el) {
  if (!el) return false;
  try {
    el.click();
    return true;
  } catch (e) {
    try {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, cancelable: true }));
      return true;
    } catch {
      return false;
    }
  }
}

async function forceSetEditableText(input, text) {
  const el = normalizeEditableInput(input);
  if (!el) return false;

  const tag = (el.tagName || "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "INPUT") {
    try {
      el.focus({ preventScroll: true });
      const proto =
        tag === "TEXTAREA" ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, "");
      else el.value = "";
      el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "deleteContentBackward" }));

      if (setter) setter.call(el, text);
      else el.value = text;
      el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, composed: true, cancelable: true, inputType: "insertText", data: text }));
      el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: text }));
      el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return true;
    } catch (e) {
      return false;
    }
  }

  if (el.isContentEditable) {
    try {
      el.focus({ preventScroll: true });
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);

      document.execCommand("selectAll", false, null);
      document.execCommand("delete", false, null);

      const beforeDelete = new InputEvent("beforeinput", {
        bubbles: true,
        composed: true,
        cancelable: true,
        inputType: "deleteContentBackward",
        data: null
      });
      el.dispatchEvent(beforeDelete);

      const beforeInsert = new InputEvent("beforeinput", {
        bubbles: true,
        composed: true,
        cancelable: true,
        inputType: "insertText",
        data: text
      });
      el.dispatchEvent(beforeInsert);

      const ok = document.execCommand("insertText", false, text);
      if (!ok) {
        el.textContent = text;
      }

      el.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertText",
          data: text
        })
      );
      el.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertFromPaste",
          data: text
        })
      );
      el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, composed: true, key: "Unidentified" }));
      return true;
    } catch (e) {
      return false;
    }
  }

  return false;
}

function dispatchEnterKey(target) {
  if (!target) return;
  const init = {
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
      target.dispatchEvent(new KeyboardEvent(type, init));
    } catch (e) {
      // ignore
    }
  });
}

async function sendChatGPTMessage(input, prompt, config) {
  try {
    log("ChatGPT: starting send sequence");

    try {
      const mainWorldResult = await chrome.runtime.sendMessage({
        type: "executeChatGPTMainWorldSend",
        prompt
      });
      if (mainWorldResult?.ok) {
        log(`ChatGPT: main world send succeeded via ${mainWorldResult.method || "unknown"}`);
        return true;
      }
      log(`ChatGPT: main world send unavailable, falling back`, mainWorldResult?.error);
    } catch (error) {
      log("ChatGPT: main world send failed, falling back", error);
    }

    input.focus({ preventScroll: true });

    // ChatGPT now uses a ProseMirror editor. Direct DOM writes make the text
    // visible but do not update the editor state, so the send button becomes a
    // false-positive. Reuse the richer editable input path first.
    let setOk = await forceSetEditableText(input, prompt);
    if (!setOk) {
      setOk = await setInputValue(input, prompt);
    }
    if (!setOk) {
      log("ChatGPT: failed to set prompt text");
      return false;
    }

    // 2. Poll for enabled button
    let btn = null;
    let attempts = 0;
    while (attempts < 20) { // 1 second
      btn = findElement(config.sendButtonSelectors);
      if (btn && !btn.disabled) break;
      await new Promise(r => setTimeout(r, 50));
      attempts++;
    }

    if (!btn) {
      log("ChatGPT: button not found or disabled, trying Enter key");
      await new Promise(r => setTimeout(r, 50));
      dispatchEnterKey(input);
      return true;
    }

    log("ChatGPT: clicking button");
    clickOnce(btn);
    return true;

  } catch (e) {
    console.error("ChatGPT send error:", e);
    return false;
  }
}

async function sendCopilotMessage(input, prompt, config) {
  try {
    log("Copilot: starting send sequence");
    input.focus({ preventScroll: true });

    // 1. Set text using execCommand
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, prompt);
    log("Copilot: text inserted");

    // 2. Trigger input events
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

    // Add delay before sending to avoid bot detection
    await new Promise(r => setTimeout(r, 800));

    // Early Enter Key (Optimistic Send)
    log("Copilot: attempting early Enter key");
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      composed: true,
      cancelable: true
    }));

    // Copilot button appears AFTER input. Poll for it.
    log("Copilot: waiting for button to appear...");

    // Selectors for Shadow DOM
    const shadowSelectors = "button[aria-label*='Send'], button[aria-label*='发送'], button[aria-label*='Submit'], button[title*='Submit'], button[icon='Send'], button[title*='Send'], button[title*='发送'], div[role='button'][aria-label*='Send'], div[role='button'][aria-label*='发送'], div[role='button'][aria-label*='Submit']";

    const deepQuery = (root, selector) => {
      if (!root) return null;
      let found = root.querySelector(selector);
      if (found) return found;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.shadowRoot) {
          found = deepQuery(node.shadowRoot, selector);
          if (found) return found;
        }
      }
      return null;
    };

    let btn = null;
    let attempts = 0;
    const maxAttempts = 50; // 50 * 50ms = 2.5 seconds (Reduced polling interval)

    while (attempts < maxAttempts) {
      // 1. Check Light DOM with strict validation
      let lightBtn = findElement(config.sendButtonSelectors);
      if (lightBtn) {
        const label = (lightBtn.getAttribute('aria-label') || lightBtn.getAttribute('title') || lightBtn.textContent || "").toLowerCase();
        const hasIcon = lightBtn.querySelector('svg, i, span[class*="icon"]');
        const isSendLike = label.includes("send") || label.includes("submit") || hasIcon;
        // Double check it's not the mic button or attach button if selectors are loose
        if (isSendLike && !lightBtn.disabled && lightBtn.offsetParent !== null) {
          btn = lightBtn;
          log("Copilot: found valid button in Light DOM");
          break;
        }
      }

      // 2. Check Shadow DOM
      let shadowBtn = deepQuery(document.body, shadowSelectors);
      if (shadowBtn && !shadowBtn.disabled && shadowBtn.offsetParent !== null) {
        btn = shadowBtn;
        log("Copilot: found valid button in Shadow DOM");
        break;
      }

      // Wait and retry
      await new Promise(r => setTimeout(r, 50)); // Reduced to 50ms
      attempts++;

      // Periodically re-trigger input events to wake UI
      if (attempts % 10 === 0) {
        input.focus({ preventScroll: true });
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      }
    }

    if (btn) {
      log("Copilot: attempting click");
      btn.click();
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
      btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
      return true;
    } else {
      log("Copilot: button NOT found after polling");
    }

    return true;
  } catch (e) {
    console.error("Copilot send error:", e);
    return false;
  }
}

async function sendGrokMessage(input, prompt, config) {
  try {
    const editable =
      findEditableNearSendButton(input, config.inputSelectors, config.sendButtonSelectors, config.useShadow) ||
      normalizeEditableInput(input) ||
      input;
    if (!editable) return false;

    editable.focus({ preventScroll: true });

    let setOk = await forceSetEditableText(editable, prompt);
    if (!setOk) {
      setOk = await setInputValue(editable, prompt);
    }
    if (!setOk) return false;

    const hasElementDeep = (selectors, checkVisibility = true) => {
      if (!selectors || selectors.length === 0) return false;
      const root = document.body || document.documentElement || document;
      for (const sel of selectors) {
        const direct = document.querySelector(sel);
        if (direct && (!checkVisibility || isElementVisible(direct))) {
          return true;
        }
        const deepMatches = deepQueryAll(root, sel);
        if (deepMatches.some((el) => !checkVisibility || isElementVisible(el))) {
          return true;
        }
      }
      return false;
    };

    const findGrokSendButton = () => {
      const pool = [];
      const seen = new Set();

      const collect = (el) => {
        if (!el || seen.has(el)) return;
        seen.add(el);
        pool.push(el);
      };

      collect(findSendButtonNearInput(config.sendButtonSelectors, editable));
      collect(config.useShadow ? deepFindElement(config.sendButtonSelectors) : findElement(config.sendButtonSelectors));

      let current = editable;
      for (let i = 0; i < 4; i += 1) {
        current = current?.parentElement;
        if (!current) break;
        const candidates = current.querySelectorAll(
          "button, div[role='button'], [role='button'], a[href='#'], [class*='button'], [class*='btn']"
        );
        candidates.forEach((el) => collect(el));
      }

      let best = null;
      let bestScore = -Infinity;

      for (const el of pool) {
        if (!isElementVisible(el) || isElementDisabled(el)) continue;

        const label = (
          (el.getAttribute?.("aria-label") || "") +
          " " +
          (el.getAttribute?.("title") || "") +
          " " +
          (el.textContent || "")
        ).toLowerCase();
        const className = (typeof el.className === "string" ? el.className : "").toLowerCase();

        let score = 0;
        if (label.includes("send")) score += 20;
        if (label.includes("submit")) score += 16;
        if (label.includes("message")) score += 4;
        if (el.getAttribute?.("type") === "submit") score += 10;
        if (el.querySelector?.("svg")) score += 4;
        if (/send|submit|arrow|composer/.test(className)) score += 5;
        if (/attach|upload|voice|mic|model|menu|history|search|file|image/.test(label)) score -= 25;

        if (score > bestScore) {
          best = el;
          bestScore = score;
        }
      }

      return bestScore >= 12 ? best : null;
    };

    const waitForGrokSendSignal = async (baselineText, baselineStop, baselineCount, timeoutMs = 2500) => {
      const startedAt = Date.now();
      const stopSelectors = getStopSelectors("grok");

      while (Date.now() - startedAt < timeoutMs) {
        const stopNow = hasElementDeep(stopSelectors, false);
        if (stopNow && !baselineStop) {
          return true;
        }

        const textNow = getEditableText(editable).trim();
        if (baselineText && !textNow) {
          return true;
        }

        const currentCount = countResponseNodes("grok");
        if (currentCount > baselineCount) {
          return true;
        }

        await new Promise((r) => setTimeout(r, 80));
      }

      return false;
    };

    const initialText = getEditableText(editable).trim();
    if (!initialText) return false;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const currentText = getEditableText(editable).trim();
      if (!currentText) {
        const refillOk = await forceSetEditableText(editable, prompt);
        if (!refillOk) return false;
      }

      const beforeText = getEditableText(editable).trim();
      if (!beforeText) return false;

      const beforeStop = hasElementDeep(getStopSelectors("grok"), false);
      const beforeCount = countResponseNodes("grok");

      const sendButton = findGrokSendButton();
      if (sendButton && clickLikeHuman(sendButton)) {
        const hasSignal = await waitForGrokSendSignal(beforeText, beforeStop, beforeCount);
        if (hasSignal) return true;
      }

      await new Promise((r) => setTimeout(r, 120));
    }

    const baselineText = getEditableText(editable).trim();
    const baselineStop = hasElementDeep(getStopSelectors("grok"), false);
    const baselineCount = countResponseNodes("grok");

    dispatchEnterKey(editable);
    dispatchEnterKey(editable.closest?.("form"));
    dispatchEnterKey(editable.closest?.("[class*='chat-input']"));
    dispatchEnterKey(document.body);

    return waitForGrokSendSignal(baselineText, baselineStop, baselineCount, 2000);
  } catch (e) {
    console.error("Grok send error:", e);
    return false;
  }
}

function setKimiEditableText(editable, text) {
  if (!editable) return false;
  try {
    editable.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(editable);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    editable.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertFromPaste",
        data: text
      })
    );

    editable.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return true;
  } catch (e) {
    return false;
  }
}

async function sendKimiMessage(input, prompt, config) {
  try {
    log("Kimi: starting send sequence (v12 - Send Container + Lexical Events)");

    const kimiSendSelectors = [
      ...(config.sendButtonSelectors || []),
      "div.send-button-container",
      "div[class*='send-button-container']",
      "div[class*='send-button']",
      "div[class*='sendButton']",
      "[data-testid*='send']",
      "[data-testid='send']",
      "[role='button'][class*='send']",
      "button"
    ];

    const editable = findEditableNearSendButton(input, config.inputSelectors, kimiSendSelectors, true);
    if (!editable) return false;

    editable.focus({ preventScroll: true });

    const setOk = setKimiEditableText(editable, prompt);
    if (!setOk) return false;

    await new Promise((r) => setTimeout(r, 250));
    const textLen = getEditableText(editable).trim().length;

    const findKimiSendButton = (allowDisabled) => {
      const roots = [];
      const form = editable?.closest?.("form");
      const container =
        editable?.closest?.("[class*='chat-input']") ||
        editable?.closest?.("[class*='chatInput']") ||
        editable?.closest?.("[class*='input']") ||
        editable?.parentElement;

      if (form) roots.push(form);
      if (container && container !== form) roots.push(container);
      roots.push(document);

      for (const root of roots) {
        for (const selector of kimiSendSelectors) {
          const candidates = root.querySelectorAll
            ? Array.from(root.querySelectorAll(selector))
            : [];
          const shadowCandidates = deepQueryAll(root, selector);
          const allCandidates = candidates.length
            ? candidates.concat(shadowCandidates)
            : shadowCandidates;
          for (const el of allCandidates) {
            if (!isElementVisible(el)) continue;
            if (!allowDisabled && isElementDisabled(el)) continue;
            return el;
          }
        }
      }
      return null;
    };

    const fireInputSignals = () => {
      editable.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      editable.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      editable.dispatchEvent(new Event("keyup", { bubbles: true, composed: true }));
    };

    let btn = findKimiSendButton(false);
    if (btn) {
      clickOnce(btn);
      return true;
    }

    const waitStart = Date.now();
    while (Date.now() - waitStart < 1500) {
      fireInputSignals();
      await new Promise((r) => setTimeout(r, 100));
      btn = findKimiSendButton(true);
      const ariaDisabled = btn?.getAttribute?.("aria-disabled") === "true";
      const hardDisabled = btn?.disabled === true || btn?.getAttribute?.("disabled") !== null;
      const classDisabled = (() => {
        const className = typeof btn?.className === "string" ? btn.className : "";
        return /\bdisabled\b/i.test(className) || /\bis-disabled\b/i.test(className);
      })();
      if (btn && (!isElementDisabled(btn) || (ariaDisabled && !hardDisabled) || (classDisabled && textLen > 0))) {
        clickOnce(btn);
        return true;
      }
    }

    dispatchEnterKey(editable);
    dispatchEnterKey(editable.closest?.("form"));
    dispatchEnterKey(editable.closest?.("[class*='chat-input']"));
    dispatchEnterKey(document.body);
    dispatchEnterKey(document);
    return true;
  } catch (e) {
    console.error("Kimi send error:", e);
    return false;
  }
}

async function sendImaMessage(input, prompt, config) {
  try {
    log("Ima: starting send sequence (v3 - Config + Robust Editable)");

    const editable = normalizeEditableInput(input);
    if (!editable) return false;

    editable.focus({ preventScroll: true });

    const setOk = await forceSetEditableText(editable, prompt);
    if (!setOk) return false;

    await new Promise((r) => setTimeout(r, 150));

    const btn = findSendButtonNearInput(config.sendButtonSelectors, editable);
    if (btn) {
      btn.click();
      return true;
    }

    dispatchEnterKey(editable);
    dispatchEnterKey(editable.closest?.("form"));
    dispatchEnterKey(document.body);
    dispatchEnterKey(document);
    return true;
  } catch (e) {
    console.error("Ima send error:", e);
    return false;
  }
}

async function sendTongyiMessage(input, prompt, config) {
  try {
    log("Tongyi: starting send sequence");

    try {
      const mainWorldResult = await chrome.runtime.sendMessage({
        type: "executeTongyiMainWorldSend",
        prompt
      });
      if (mainWorldResult?.ok) {
        log(`Tongyi: main world send succeeded via ${mainWorldResult.method || "unknown"}`);
        return true;
      }
      log("Tongyi: main world send unavailable, falling back", mainWorldResult?.error);
    } catch (error) {
      log("Tongyi: main world send failed, falling back", error);
    }

    const editable = normalizeEditableInput(input);
    if (!editable) return false;

    editable.focus({ preventScroll: true });
    const setOk = await forceSetEditableText(editable, prompt);
    if (!setOk) return false;

    await new Promise((r) => setTimeout(r, 100));

    const btn = findElement([
      "div.operateBtn-ehxNOr",
      "button[type='submit']",
      "button[aria-label*='发送']",
      "button[aria-label*='Send']"
    ]);
    if (btn && !isElementDisabled(btn)) {
      clickOnce(btn);
      return true;
    }

    dispatchEnterKey(editable);
    dispatchEnterKey(document.body);
    dispatchEnterKey(document);
    return true;
  } catch (error) {
    console.error("Tongyi send error:", error);
    return false;
  }
}

function getStopSelectors(provider) {
  if (provider === "chatgpt") {
    return [
      'button[data-testid="stop-button"]',
      'button[aria-label*="Stop generating"]',
      'button[aria-label*="Stop generating response"]',
      'button[aria-label*="Stop"]',
      'button[aria-label*="停止生成"]',
      'button[aria-label*="停止"]',
      'button[aria-label*="Pause"]',
      'button[aria-label*="暂停"]',
      'button[aria-label*="停止流式传输"]',
      '[data-testid="stop-generating-button"]',
      'button:has(svg rect)', 
      'button:has(svg path[d^="M2 2h20v20H2"])',
      'button:has(svg[data-icon="stop"])'
    ];
  }

  if (provider === "grok") {
    // Grok specific: avoid generic SVG selectors to prevent false positives
    return [
      'button[aria-label*="Stop"]',
      'button[aria-label*="停止"]',
      'button[title*="Stop"]',
      'button[title*="停止"]',
      '[data-testid*="stop"]'
    ];
  }

  if (provider === "deepseek") {
    // DeepSeek: NO stop button during normal streaming (verified 2026-05-31 via CDP).
    // Stop button only appears in "continue generation" (interrupted response) scenario.
    // Return empty array — completion detection relies on text stability only.
    return [];
  }

  if (provider === "gemini") {
    // Gemini: stop button uses "停止回答" (zh) or "Stop response" (en) as aria-label.
    return [
      'button[aria-label*="停止回答"]',
      'button[aria-label*="Stop response"]',
      'button[aria-label*="Stop"]',
      'button[aria-label*="停止"]',
      'button[data-testid*="stop"]'
    ];
  }

  return [
    'button[aria-label*="Stop"]',
    'button[aria-label*="停止"]',
    'button[aria-label*="停止回答"]',
    'button[aria-label*="暂停"]',
    'button[data-testid*="stop"]',
    'button[aria-label*="Pause"]',
    'button[data-testid="stop-button"]',
    'button[title*="Stop"]',
    'button[title*="停止"]',
    'button[title*="暂停"]',
    '.stop-generating',
    '[class*="stop-generating"]',
    '[class*="StopGenerating"]',
    '[data-testid="stop-generating-button"]',
    'button svg rect',
    'button svg path[d^="M2 2h20v20H2"]',
    'div[role="button"][aria-label*="Stop"]',
    'div[role="button"][aria-label*="停止"]'
  ];
}

function countResponseNodes(provider) {
  const selectors = [
    ...(RESPONSE_SELECTORS[provider] || []),
    '[data-message-author-role="assistant"]',
    '[data-testid*="chat-message"]',
    '.assistant',
    '.message.assistant',
    '.result-streaming',
    '.streaming',
    '.ds-message',
    '[class*="message-assistant"]',
    '[class*="message-ai"]',
    '[data-role="assistant"]'
  ];
  const unique = Array.from(new Set(selectors));
  return unique.reduce((sum, sel) => sum + document.querySelectorAll(sel).length, 0);
}

function hasStreamingIndicator(provider) {
  const base = '.result-streaming, .streaming, [data-testid*="stream"], .ds-loading, [class*="result-streaming"]';
  if (provider === "chatgpt") {
    return !!document.querySelector(`${base}, [data-message-author-role="assistant"] .result-streaming, .result-streaming, .markdown.result-streaming`);
  }
  if (provider === "deepseek") {
    // DeepSeek retains .ds-think-content in DOM permanently for ALL messages —
    // it cannot be used as a streaming indicator at all (always returns true).
    // DeepSeek does have a stop button, but it is not useful as a streaming indicator
    // is text stability: when the response text stops changing for N seconds.
    // So hasStreamingIndicator must return false for DeepSeek to let the
    // waitForResponseComplete code fall through to text stability (Step 3).
    return false;
  }
  return !!document.querySelector(base);
}

async function waitForResponseStart(provider, responseBaseline = null) {
  const timeout = 12000;
  const stopSelectors = getStopSelectors(provider);
  const baselineCount = Number(responseBaseline?.responseCount) || countResponseNodes(provider);
  const baselineText = typeof responseBaseline?.text === "string" ? responseBaseline.text.trim() : extractLatestResponse(provider).trim();
  const sendSelectors = PROVIDER_CONFIGS[provider]?.sendButtonSelectors || [];
  
  log(`Waiting for response start: ${provider}, baseline=${baselineCount}`);

  // Helper for deep check with visibility
  const hasElementDeep = (selectors, checkVisibility = true) => {
    // Fast path: check light DOM first
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        if (!checkVisibility) return true;
        if (isElementVisible(el)) return true;
      }
    }
    // Slow path: deep traversal for Shadow DOM (Copilot etc)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.shadowRoot) {
        for (const sel of selectors) {
          const els = deepQueryAll(node.shadowRoot, sel);
          if (els.some(el => !checkVisibility || isElementVisible(el))) return true;
        }
      }
    }
    return false;
  };

  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
    };

    const check = () => {
      if (settled) return;
      
      // 1. Check Stop Button (Strongest signal)
      // For ChatGPT, we accept even if visibility is tricky, presence is usually enough
      const strictVis = provider !== 'chatgpt'; 
      if (hasElementDeep(stopSelectors, strictVis)) {
        log("Response started: Stop button found");
        cleanup();
        resolve(true);
        return;
      }

      // 2. Check Streaming Indicator
      if (hasStreamingIndicator(provider)) {
        log("Response started: Streaming indicator found");
        cleanup();
        resolve(true);
        return;
      }

      // 3. Check Response Count Increase
      const currentCount = countResponseNodes(provider);
      if (currentCount > baselineCount) {
        log(`Response started: Count increased ${baselineCount} -> ${currentCount}`);
        cleanup();
        resolve(true);
        return;
      }

      const latest = extractLatestResponse(provider).trim();
      if (latest && latest !== baselineText) {
        log("Response started: Latest response text changed");
        cleanup();
        resolve(true);
        return;
      }

      // 4. Check Send Button Disappearance or Disabled (Generic)
      // Only if we have valid send selectors
      if (sendSelectors.length > 0 && shouldUseGenericResponseStartSignals(provider)) {
        // If send button is GONE or DISABLED, we assume started.
        let sendBtnActive = false;
        
        // Check Light DOM
        for (const sel of sendSelectors) {
          const el = document.querySelector(sel);
          if (el && isElementVisible(el)) {
             // It is visible. Is it active?
             const btn = el.closest('button, [role="button"], input') || el;
             
             if (!btn.disabled && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true') {
               sendBtnActive = true;
               break;
             }
          }
        }

        // Check Shadow DOM if not found in Light DOM (for Copilot etc)
        if (!sendBtnActive && (provider === 'copilot' || provider === 'gemini')) {
             // Simple check: if we can't find the send button anymore, it might be gone.
             // But we need to be careful about "loading" states vs "gone".
             // For now, let's stick to Light DOM for generic, and only rely on this if we are sure.
        }

        if (!sendBtnActive) {
          log("Response started: Send button disappeared or disabled");
          cleanup();
          resolve(true);
          return;
        }
      }

      // 5. Check Input Clearance (Generic but powerful)
      // If input was non-empty and now is empty, response likely started
      const inputEl = findElement(PROVIDER_CONFIGS[provider]?.inputSelectors || []);
      if (shouldUseGenericResponseStartSignals(provider) && inputEl) {
        const val = getEditableText(inputEl).trim();
        // We don't have the original prompt here easily, but if it's empty, it's a good sign.
        // But we must be careful not to trigger if it was ALREADY empty (unlikely during sending).
        // Let's assume if we are "waiting for response", we just sent something.
        if (!val) {
           log("Response started: Input cleared");
           cleanup();
           resolve(true);
           return;
        }
      }
    };

    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'class', 'aria-label', 'data-testid'] });

    const timer = setTimeout(() => {
      log("Response wait timed out");
      cleanup();
      resolve(false);
    }, timeout);

    check();
  });
}

async function waitForResponseComplete(provider, responseBaseline = null) {
  const timeout = 90000;
  const stopSelectors = getStopSelectors(provider);
  const sendSelectors = PROVIDER_CONFIGS[provider]?.sendButtonSelectors || [];
  let sawStop = false;
  let grokStopWasSeen = false;
  let stopDisappearAt = 0;
  const baseline = responseBaseline || captureResponseBaseline(provider);
  const stabilityMs = getProviderStabilityMs(provider);
  const stabilityTracker = getResponseStateApi().createResponseStabilityTracker({
    provider,
    baselineText: baseline.text || "",
    baselineResponseCount: Number(baseline.responseCount) || 0,
    stabilityMs,
    now: Date.now()
  });

  // Helper for deep check
  const hasElementDeep = (selectors) => {
    for (const sel of selectors) {
      if (document.querySelector(sel)) return true;
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.shadowRoot) {
        for (const sel of selectors) {
          if (deepQueryAll(node.shadowRoot, sel).length > 0) return true;
        }
      }
    }
    return false;
  };

  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      clearInterval(interval);
    };

    // --- Provider-specific helpers (based on real DOM investigation 2026-05-06) ---

    // DeepSeek: no reliable stop button during normal streaming.
    // Primary signal: new assistant response text becoming stable.
    // NOTE: Send button ariaDisabled follows textarea content, NOT response state — useless for completion.

    // Gemini: "停止回答" (Stop response) button appears during response.
    // On completion: stop button disappears, send button returns (ariaDisabled=true because input cleared).
    // NOTE: No position filter — must work inside dashboard iframe (smaller viewport).
    const geminiStopWasSeen = { current: false };
    const isGeminiStopVisible = () => {
      const stopBtns = document.querySelectorAll('button[aria-label*="停止回答"], button[aria-label*="Stop response"]');
      for (const b of stopBtns) {
        const r = b.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return true;
      }
      return false;
    };
    const isGeminiSendVisible = () => {
      const sendBtn = document.querySelector('button.send-button, button[aria-label*="发送"], button[aria-label*="Send"]');
      if (!sendBtn) return false;
      const r = sendBtn.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    const check = () => {
      if (settled) return;

      // === Step 1: Provider-specific detection (based on real DOM) ===

      if (provider === "deepseek") {
        // DeepSeek: has a stop button (detected via getStopSelectors), .ds-think-content lingers permanently in DOM
        // for ALL historical messages (not usable as streaming indicator).
        // Primary signal: text stability (Step 3).
        // Outer 90s timeout serves as the absolute safety net.
        // No provider-specific logic needed here — fall through to Step 3.
      }

      if (provider === "gemini") {
        const gmStopVisible = isGeminiStopVisible();
        if (gmStopVisible) {
          geminiStopWasSeen.current = true;
          log(`[GM] stop visible → still responding`);
          return; // Still responding
        }
        // Stop button gone — if it was seen before, check send button is back
        if (geminiStopWasSeen.current) {
          const sendVis = isGeminiSendVisible();
          if (sendVis) {
            log(`[GM] stop gone + send visible → COMPLETED`);
            cleanup();
            resolve(true);
            return;
          }
          log(`[GM] stop gone but send not visible → wait`);
        }
      }

      if (provider === "grok") {
        // Grok: stop button appears during streaming, send button recovers after completion.
        // Track stop button lifecycle similar to Gemini.
        const grokStopVisible = hasElementDeep(stopSelectors);
        if (grokStopVisible) {
          grokStopWasSeen = true;
          log(`[Grok] stop visible → still responding`);
          return; // Still responding
        }
        // Stop button gone — if it was seen before, check send button is back
        if (grokStopWasSeen && sendSelectors.length > 0) {
          for (const sel of sendSelectors) {
            const el = document.querySelector(sel);
            if (el && isElementVisible(el)) {
              const btn = el.closest('button, [role="button"], input') || el;
              if (!isElementDisabled(btn)) {
                log(`[Grok] stop gone + send enabled → COMPLETED`);
                cleanup();
                resolve(true);
                return;
              }
            }
          }
        }
      }

      // === Step 2: Universal stop button tracking (ChatGPT, etc.) ===
      const stopVisible = hasElementDeep(stopSelectors);
      if (stopVisible) {
        sawStop = true;
        stopDisappearAt = 0;
        log(`[${provider}] stop button visible → still responding`);
        return;
      }

      // Stop just disappeared — record timestamp for grace period
      if (sawStop && stopDisappearAt === 0) {
        stopDisappearAt = Date.now();
        log(`[${provider}] stop just disappeared, grace period started`);
      }

      // Stop disappeared AND send button is back → completed
      if (sawStop && sendSelectors.length > 0) {
        for (const sel of sendSelectors) {
          const el = document.querySelector(sel);
          if (el && isElementVisible(el)) {
            const btn = el.closest('button, [role="button"], input') || el;
            if (!isElementDisabled(btn)) {
              log(`[${provider}] stop gone + send enabled → COMPLETED`);
              cleanup();
              resolve(true);
              return;
            }
          }
        }
      }

      // === Step 3: Fallback — text stability ===
      const latest = extractLatestResponse(provider);
      const normalized = typeof latest === "string" ? latest.trim() : "";
      if (normalized) {
        const currentResponseCount = countResponseNodes(provider);
        const sample = stabilityTracker.check({
          text: normalized,
          responseCount: currentResponseCount,
          streaming: hasStreamingIndicator(provider),
          now: Date.now()
        });
        // Diagnostic logging for DeepSeek gate debugging
        if (provider === "deepseek" && sample.reason !== "stable") {
          log(`[DS] check: reason=${sample.reason} count=${currentResponseCount} text="${normalized.substring(0, 30)}"`);
        }
        if (sample.complete) {
          log(`[${provider}] text stable ${sample.elapsed}ms → COMPLETED (fallback)`);
          cleanup();
          resolve(true);
          return;
        }
      }

      // === Step 4: Grace period fallback ===
      if (
        sawStop &&
        stopDisappearAt > 0 &&
        !stopVisible &&
        !hasStreamingIndicator(provider) &&
        Date.now() - stopDisappearAt >= 3000
      ) {
        cleanup();
        resolve(true);
        return;
      }
    };

    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'class', 'aria-label', 'data-testid']
    });

    const interval = setInterval(check, 500);
    const timer = setTimeout(() => {
      cleanup();
      resolve(true);
    }, timeout);

    check();
  });
}

async function waitForResponseStartLegacy(provider) {
  // Generic waiter for response
  // Returns promise that resolves when it thinks AI started answering
  return new Promise(resolve => {
    // Assume success after a reasonable timeout if we can't detect specifics
    // The user says "after AI starts answering", so we try to detect that.
    // But for many providers, it's hard to know exactly when.
    // We'll look for "stop" buttons or input clearing.

    const start = Date.now();
    const check = () => {
      // 1. Check if input is cleared (strong signal)
      // We can't easily check input value for all types, but let's try
      // Actually, we shouldn't query input again here easily without selector.

      // 2. Check for "Stop" buttons
      // Expanded selectors for GPT/Copilot
      const stopSelectors = [
        'button[aria-label*="Stop"]',
        'button[aria-label*="停止"]',
        'button[data-testid*="stop"]',
        'button[aria-label*="Pause"]', // Sometimes Pause
        // ChatGPT specific
        'button[data-testid="stop-button"]',
        // Copilot specific
        'button[title*="Stop"]',
        'button[title*="停止"]',
        '.stop-generating',
        // Generic icon check (square icon usually)
        'button svg rect',
        'button svg path[d^="M2 2h20v20H2"]' // roughly a square
      ];

      for (const sel of stopSelectors) {
        if (document.querySelector(sel)) {
          resolve(true);
          return;
        }
      }

      // Timeout fallback (5 seconds - assume success if no error by then)
      if (Date.now() - start > 5000) {
        resolve(true);
        return;
      }

      requestAnimationFrame(check);
    };
    check();
  });
}

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
  setCapturingActiveResponse(true);
  pauseManualTurnObserver();
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
      setCapturingActiveResponse(false);
      resumeManualTurnObserver(provider);
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
      setCapturingActiveResponse(false);
      resumeManualTurnObserver(provider);
      sendTranscriptLiveStatus(provider, "failed");
    }

    const responseStarted = sendOk ? await waitForResponseStart(provider, responseBaseline) : false;
    log(`[Content] Response start detection for ${provider}: ${responseStarted ? "DETECTED" : "NOT DETECTED (or timed out)"}`);

    if (provider === "grok" && sendOk && !responseStarted) {
      log("[Content] Grok response start not detected, downgrade sendResult to failed");
      setCapturingActiveResponse(false);
      resumeManualTurnObserver(provider);
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

      waitForResponseComplete(provider, responseBaseline).then(() => {
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
        setCapturingActiveResponse(false);
        resumeManualTurnObserver(provider);
      });
    } else if (sendOk) {
      setCapturingActiveResponse(false);
      resumeManualTurnObserver(provider);
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
  startManualSendCapture(provider);
  // Start MutationObserver early so the warmup period expires before the user sends a message.
  // Without this, the observer only starts on send and all captures within 2.5s are captureOnly.
  startManualTurnCapture(provider);

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
    registerCleanup(_observerCleanupHandlers, () => observer.disconnect());

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

    registerCleanup(_observerCleanupHandlers, () => {
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
  cleanupAll(_manualSendCleanupHandlers);
  cleanupAll(_sessionSyncCleanupHandlers);
  cleanupAll(_observerCleanupHandlers);
});
