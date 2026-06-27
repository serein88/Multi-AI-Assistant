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

function captureResponseBaseline(provider) {
  return {
    text: extractLatestResponse(provider),
    responseCount: countResponseNodes(provider)
  };
}


// Destructure functions from send-handlers.js namespace
// Fallback defaults ensure content.js remains functional if send-handlers.js fails to load
const SH = globalThis.__MAI_Send || {};
const RD = globalThis.__MAI_Response || {};
const TC = globalThis.__MAI_Transcript || {};
const PC = globalThis.__MAI_ProviderConfigs || {};
const SS = globalThis.__MAI_SessionSync || {};

// ── Provider config readiness ────────────────────────────────────────────────
// JSON is loaded async by provider-configs.js; all config-dependent paths must
// call ensureConfigsReady() before reading PROVIDER_CONFIGS or HOST_MAP.

const CONFIG_READY_TIMEOUT_MS = (globalThis.MultiAIContentConstants || {}).CONFIG_READY_TIMEOUT_MS || 5000;

function ensureConfigsReady(timeoutMs = CONFIG_READY_TIMEOUT_MS) {
  if (PC.ready) return Promise.resolve(true);
  if (!PC.readyPromise) return Promise.resolve(false);

  return Promise.race([
    PC.readyPromise,
    new Promise((resolve) => {
      setTimeout(() => resolve(false), timeoutMs);
    })
  ]).then((loaded) => {
    if (!loaded) {
      console.warn("[MultiAI Content] Provider configs not ready after " + timeoutMs + "ms — commands may fail");
    }
    return loaded;
  });
}
const EXTENSION_ORIGIN = new URL(chrome.runtime.getURL("")).origin;
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




const _miscCleanupHandlers = [];


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

  // Wait for async JSON load before reading config
  const configsLoaded = await ensureConfigsReady();
  if (!configsLoaded) {
    console.error(`[MultiAI Content] Provider configs not loaded — cannot send to ${provider}`);
    postSendResult(provider, false);
    sendTranscriptLiveStatus(provider, "failed");
    return false;
  }

  const config = PC.getProviderConfig ? PC.getProviderConfig(provider) : (PC.PROVIDER_CONFIGS ? PC.PROVIDER_CONFIGS[provider] : null);
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
      setTimeout(resolve, (globalThis.MultiAIContentConstants || {}).DOM_READY_SETTLE_MS || 2000); // Max wait 2s
    });
  }

  const input = config.useShadow
    ? await waitForElementDeep(config.inputSelectors, (globalThis.MultiAIContentConstants || {}).SEND_INPUT_WAIT_TIMEOUT_MS || 3000)
    : await waitForElement(config.inputSelectors, (globalThis.MultiAIContentConstants || {}).SEND_INPUT_WAIT_TIMEOUT_MS || 3000);
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

  const provider = message.provider || (typeof PC.getProviderFromHost === "function" ? PC.getProviderFromHost() : "");
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

  const provider = data.provider || (typeof PC.getProviderFromHost === "function" ? PC.getProviderFromHost() : "");
  const prompt = typeof data.prompt === "string" ? data.prompt : "";
  trySendPrompt(provider, prompt).catch((err) => console.warn(`[MultiAI Content] trySendPrompt (${provider}):`, err));
});

function initializeCustomFixes() {
  const provider = (typeof PC.getProviderFromHost === "function" ? PC.getProviderFromHost() : "");

  (typeof SS.startChildSessionSync === "function" ? SS.startChildSessionSync(provider) : undefined);
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
    const verificationIntervalId = setInterval(attemptVerification, (globalThis.MultiAIContentConstants || {}).CLOUDFLARE_VERIFY_INTERVAL_MS || 2000);

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
  document.addEventListener("DOMContentLoaded", () => {
    ensureConfigsReady().then((ok) => {
      if (!ok) {
        console.warn("[MultiAI Content] Skip custom fixes: provider configs not loaded");
        return;
      }
      initializeCustomFixes();
    });
  });
} else {
  ensureConfigsReady().then((ok) => {
    if (!ok) {
      console.warn("[MultiAI Content] Skip custom fixes: provider configs not loaded");
      return;
    }
    initializeCustomFixes();
  });
}

// Cleanup event listeners and observers on page unload to prevent memory leaks
window.addEventListener("beforeunload", () => {
  if (TC.cleanupAll) TC.cleanupAll();
  if (typeof SS.cleanupAll === "function") SS.cleanupAll();
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

globalThis.__MAI_Content = {
  sendTranscriptProviderTurn: sendTranscriptProviderTurn,
  sendTranscriptLiveStatus: sendTranscriptLiveStatus,
  extractLatestResponse: extractLatestResponse,
  captureResponseBaseline: captureResponseBaseline,
  isEditableCleared: isEditableCleared
};
