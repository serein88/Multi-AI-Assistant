"use strict";

var C_TC = (typeof globalThis !== "undefined" && globalThis.MultiAIContentConstants) || {};

/**
 * Transcript Capture Module
 *
 * Extracted from content.js — manual turn capture (MutationObserver-based) and
 * manual send capture (keydown/click-based), along with all their helper functions.
 *
 * Exported via globalThis.__MAI_Transcript for use by content.js.
 *
 * Depends on:
 *   - content/send-handlers.js (__MAI_Send: registerCleanup, findElement, deepQueryAll, log, isElementVisible)
 *   - content/response-detection.js (__MAI_Response: waitForResponseStart, waitForResponseComplete)
 *   - content.js globals accessed lazily:
 *       globalThis.__MAI_ProviderConfigs — PROVIDER_CONFIGS
 *       globalThis.__MAI_ResponseSelectors — { messageSelector, roleAttr }
 *       globalThis.__MAI_Content — { sendTranscriptProviderTurn, sendTranscriptLiveStatus,
 *                                     extractLatestResponse, captureResponseBaseline, isEditableCleared }
 */

var __MAI_Transcript = (function () {
  var TC = globalThis.__MAI_Transcript || {};
  var SH = globalThis.__MAI_Send || {};
  var findElement = SH.findElement;

  // ─── Provider config accessor (handles namespace or flat layout) ─────────

  function getProviderConfigs() {
    var ns = globalThis.__MAI_ProviderConfigs || {};
    return ns.PROVIDER_CONFIGS || ns;
  }

  // ─── Cleanup helpers (local implementation, same as content.js) ────────────

  function registerCleanup(registry, handler) {
    if (typeof handler === "function") {
      registry.push(handler);
    }
  }

  function cleanupHandlers(registry) {
    for (var i = 0; i < registry.length; i++) {
      try { registry[i](); } catch (_) { /* ignore */ }
    }
    registry.length = 0;
  }

  // ─── Selector Constants (extracted from content.js) ─────────────────────────

  var MANUAL_USER_SELECTORS = {
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

  var MANUAL_ASSISTANT_SELECTORS = {
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

  var THINKING_SELECTORS = {
    deepseek: [
      "[class*='ds-think-content']",
      ".ds-think-content"
    ],
    gemini: [
      "[class*='thinking']",
      "[class*='reasoning']",
      "[data-testid*='thinking']",
      ".thought-content",
    ]
  };

  function getManualSelectors(map, provider, fallback) {
    fallback = fallback || [];
    var scoped = Array.isArray(map?.[provider]) ? map[provider] : [];
    var defaults = Array.isArray(map?.default) ? map.default : fallback;
    return Array.from(new Set([].concat(scoped, defaults)));
  }

  // ─── State ─────────────────────────────────────────────────────────────────

  var MANUAL_TURN_CAPTURE_PROVIDERS = new Set([
    "deepseek", "doubao", "hunyuan", "yuanbao", "zhipu", "chatglm", "ima", "kimi", "tongyi", "baidu"
  ]);

  var manualTurnCaptureStarted = false;
  var manualSendCaptureStarted = false;
  var manualSendOriginalPrompt = null;
  var manualTurnObserver = null;
  var manualTurnFlushTimer = null;
  var pendingManualTurnRoots = new Set();
  var manualTurnNodeSnapshot = new WeakMap();
  var manualTurnWarmupUntil = 0;
  var manualTurnCapturingActiveResponse = false;

  var lastManualSendProvider = null;
  var lastManualSendText = null;
  var lastManualSendAt = 0;

  var _manualSendCleanupHandlers = [];
  var _observerCleanupHandlers = [];

  // ─── Helper: Should Ignore Thinking Node ───────────────────────────────────

  function shouldIgnoreThinkingNode(provider, node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    var selectors = THINKING_SELECTORS[provider];
    if (!selectors || !selectors.length) return false;
    try {
      if (node.matches(selectors.join(","))) return true;
      if (node.querySelector(selectors.join(","))) return true;
    } catch { /* ignore */ }
    return false;
  }

  // ─── Helper: Extract Text Excluding Thinking ───────────────────────────────

  function extractTextExcludingThinking(provider, node) {
    if (!node) return "";
    var selectors = THINKING_SELECTORS[provider];
    var clone = node.cloneNode(true);
    if (selectors && selectors.length) {
      try {
        clone.querySelectorAll(selectors.join(",")).forEach(function (el) { el.remove(); });
      } catch { /* ignore */ }
    }
    return (clone.textContent || "").trim();
  }

  // ─── Manual Turn Helpers ───────────────────────────────────────────────────

  function getManualUserSelectors(provider) {
    return getManualSelectors(MANUAL_USER_SELECTORS, provider);
  }

  function getManualAssistantSelectors(provider) {
    // eslint-disable-next-line no-undef
    var RD = (typeof RESPONSE_SELECTORS !== "undefined" ? RESPONSE_SELECTORS : globalThis.__MAI_ResponseSelectors) || {};
    return Array.from(new Set([].concat(
      getManualSelectors(MANUAL_ASSISTANT_SELECTORS, provider),
      Array.isArray(RD[provider]) ? RD[provider] : []
    )));
  }

  function normalizeProviderTurnText(provider, role, raw) {
    if (!raw) return "";
    // eslint-disable-next-line no-misleading-character-class
    var text = String(raw).replace(/\u00A0/g, " ").replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
    text = text.replace(/\s+/g, " ").trim();
    if (!text) return "";

    if (provider === "gemini") {
      if (role === "user") {
        text = text.replace(/^(\u8BF4|You said)\s*/i, "");
      } else if (role === "assistant") {
        text = text.replace(/^(Gemini \u8BF4|Gemini said)\s*/i, "");
      }
    }

    var cfgs = getProviderConfigs();
    var cfg = cfgs[provider];
    if (cfg && typeof cfg.scrubTurnText === "function") {
      text = cfg.scrubTurnText(role, text);
    }
    return text.replace(/\s+/g, " ").trim();
  }

  function pruneManualTurnNodes(nodes) {
    const dominated = new Set();
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (a.contains(b)) dominated.add(j);
        else if (b.contains(a)) dominated.add(i);
      }
    }
    return nodes.filter((_, idx) => !dominated.has(idx));
  }

  function collectMatchingElements(root, selectors) {
    const out = [];
    selectors.forEach((selector) => {
      try {
        root.querySelectorAll(selector).forEach((el) => {
          if (!out.includes(el)) out.push(el);
        });
      } catch { /* ignore */ }
    });
    return out;
  }

  function detectManualTurnRole(provider, node, userSelectors, assistantSelectors) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
    if (assistantSelectors.some((selector) => { try { return node.matches(selector); } catch { return false; } })) return "assistant";
    if (userSelectors.some((selector) => { try { return node.matches(selector); } catch { return false; } })) return "user";
    return null;
  }

  // ─── Manual Turn State Predicates ──────────────────────────────────────────

  function isManualSendMode() {
    return manualSendCaptureStarted && !!manualSendOriginalPrompt;
  }

  function isManualTurnSendMode() {
    return isManualSendMode();
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

  // ─── Manual Turn Core ──────────────────────────────────────────────────────

  function rememberTurnNodeSnapshot(provider, node, role, content, options = {}) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

    const normalized = normalizeProviderTurnText(provider, role, content);
    if (!normalized) return;

    const previous = manualTurnNodeSnapshot.get(node);
    if (previous && previous.role === role && previous.content === normalized) return;

    manualTurnNodeSnapshot.set(node, { role, content: normalized });
    if (options.captureOnly) return;

    // During active response capture, the waitForResponseComplete path sends the
    // final turn. Suppress intermediate streaming chunks from the MutationObserver.
    if (role === "assistant" && isCapturingActiveResponse()) return;

    // Lazy access: content.js must expose these via globalThis.__MAI_Content
    var MC = globalThis.__MAI_Content || {};
    if (MC.sendTranscriptProviderTurn) {
      MC.sendTranscriptProviderTurn(provider, role, normalized, new Date().toISOString());
    }
  }

  function scanManualTurnRoots(provider, roots, options = {}) {
    if (!provider || !MANUAL_TURN_CAPTURE_PROVIDERS.has(provider) || !document.body) return;

    const userSelectors = getManualUserSelectors(provider);
    const assistantSelectors = getManualAssistantSelectors(provider);
    const candidates = new Map();

    roots.forEach((root) => {
      if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
      collectMatchingElements(root, userSelectors).forEach((node) => candidates.set(node, "user"));
      collectMatchingElements(root, assistantSelectors).forEach((node) => {
        if (!candidates.has(node)) candidates.set(node, "assistant");
      });
    });

    const orderedNodes = pruneManualTurnNodes(Array.from(candidates.keys()));
    orderedNodes.forEach((node) => {
      if (shouldIgnoreThinkingNode(provider, node)) return;
      const fallbackRole = candidates.get(node);
      const role = detectManualTurnRole(provider, node, userSelectors, assistantSelectors) || fallbackRole;
      if (role !== "user" && role !== "assistant") return;
      const text = normalizeProviderTurnText(provider, role, extractTextExcludingThinking(provider, node));
      if (!text) return;
      rememberTurnNodeSnapshot(provider, node, role, text, options);
    });
  }

  function enqueueManualTurnRoot(provider, root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
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

  // ─── startManualTurnCapture ────────────────────────────────────────────────

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

        if (!mutation.addedNodes || mutation.addedNodes.length === 0) continue;

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
      if (manualTurnObserver === observer) manualTurnObserver = null;
    });
  }

  // ─── Manual Send Helpers ───────────────────────────────────────────────────

  function isManualSendSuppressed(provider, prompt) {
    if (!provider || !prompt) return false;
    if (provider !== lastManualSendProvider) return false;
    if (prompt !== lastManualSendText) return false;
    return Date.now() - lastManualSendAt < (C_TC.MANUAL_SEND_CAPTURE_WINDOW_MS || 1200);
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
    if (!start) return null;
    if (isEditableElement(start)) return start;
    const t = start.closest?.("textarea, [contenteditable='true'], [role='textbox']");
    return t || null;
  }

  function extractPromptFromEditable(el) {
    if (!el) return "";
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el.value || "";
    return el.innerText || el.textContent || "";
  }

  function getManualSendButtonSelectors(provider) {
    var cfgs = getProviderConfigs();
    var selectors = Array.isArray(cfgs?.[provider]?.sendButtonSelectors)
      ? cfgs[provider].sendButtonSelectors
      : [];
    // Some configs intentionally include broad fallbacks for automation (e.g. `button:has(svg)`).
    // For manual user send detection we must keep it conservative to avoid false positives.
    return selectors.filter(function (sel) { return sel && sel !== "button:has(svg)"; });
  }

  function findAncestorMatchingAnySelector(node, selectors, maxDepth = 6) {
    if (!node || !selectors || !selectors.length) return null;
    let current = node;
    let depth = 0;
    while (current && current !== document.documentElement && depth < maxDepth) {
      if (selectors.some((selector) => { try { return current.matches(selector); } catch { return false; } })) return current;
      current = current.parentElement;
      depth++;
    }
    return null;
  }

  // ─── recordManualSend ──────────────────────────────────────────────────────

  function recordManualSend(provider, prompt) {
    const normalized = normalizeProviderTurnText(provider, "user", prompt);
    if (!normalized) return;

    if (isManualSendSuppressed(provider, normalized)) return;
    rememberManualSend(provider, normalized);

    startManualTurnCapture(provider);
    setCapturingActiveResponse(true);
    pauseManualTurnObserver();

    // Lazy access to content.js helpers
    var MC = globalThis.__MAI_Content || {};
    var RD = globalThis.__MAI_Response || {};
    var captureResponseBaseline = MC.captureResponseBaseline;
    var sendTranscriptProviderTurn = MC.sendTranscriptProviderTurn;
    var sendTranscriptLiveStatus = MC.sendTranscriptLiveStatus;
    var extractLatestResponse = MC.extractLatestResponse;
    var isEditableCleared = MC.isEditableCleared;
    var waitForResponseStart = RD.waitForResponseStart;
    var waitForResponseComplete = RD.waitForResponseComplete;

    var responseBaseline = captureResponseBaseline ? captureResponseBaseline(provider) : null;

    const inputEl = arguments.length >= 3 ? arguments[2] : null;
    const occurredAt = new Date().toISOString();

    const finishCapture = () => {
      setCapturingActiveResponse(false);
      resumeManualTurnObserver(provider);
    };

    const startResponseFlow = (assumeStarted = false) => {
      if (sendTranscriptProviderTurn) sendTranscriptProviderTurn(provider, "user", normalized, occurredAt);

      const startedPromise = assumeStarted || !waitForResponseStart
        ? Promise.resolve(true)
        : waitForResponseStart(provider, responseBaseline);

      startedPromise.then((started) => {
        if (!started) {
          finishCapture();
          if (sendTranscriptLiveStatus) sendTranscriptLiveStatus(provider, "interrupted", new Date().toISOString());
          return;
        }

        if (sendTranscriptLiveStatus) sendTranscriptLiveStatus(provider, "responding", new Date().toISOString());

        if (waitForResponseComplete) {
          waitForResponseComplete(provider, responseBaseline).then(() => {
            const latest = extractLatestResponse ? extractLatestResponse(provider) : null;
            if (latest && sendTranscriptProviderTurn) {
              sendTranscriptProviderTurn(provider, "assistant", latest, new Date().toISOString(), { status: "completed" });
            }
            finishCapture();
            if (sendTranscriptLiveStatus) sendTranscriptLiveStatus(provider, "completed", new Date().toISOString());
          });
        } else {
          finishCapture();
        }
      });
    };

    setTimeout(() => {
      if (inputEl && isEditableCleared && !isEditableCleared(inputEl)) {
        if (waitForResponseStart) {
          waitForResponseStart(provider, responseBaseline).then((started) => {
            if (!started) { finishCapture(); return; }
            startResponseFlow(true);
          });
        } else {
          startResponseFlow(false);
        }
        return;
      }

      startResponseFlow(false);
    }, C_TC.MANUAL_TURN_OBSERVER_RESTART_DELAY_MS || 300);
  }

  // ─── startManualSendCapture ────────────────────────────────────────────────

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

      // eslint-disable-next-line no-undef
      var cfgs = getProviderConfigs();
      const cfg = cfgs[provider];
      const active = findClosestEditableTarget(document.activeElement) ||
        findClosestEditableTarget(document.querySelector("textarea, [contenteditable='true'], [role='textbox']")) ||
        findClosestEditableTarget(findElement(cfg?.inputSelectors || []));
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

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  function cleanupAll() {
    cleanupHandlers(_manualSendCleanupHandlers);
    cleanupHandlers(_observerCleanupHandlers);
    manualTurnCaptureStarted = false;
    manualSendCaptureStarted = false;
    manualSendOriginalPrompt = null;
  }

  // ─── Exports ───────────────────────────────────────────────────────────────

  TC.MANUAL_TURN_CAPTURE_PROVIDERS = MANUAL_TURN_CAPTURE_PROVIDERS;
  TC.shouldIgnoreThinkingNode = shouldIgnoreThinkingNode;
  TC.extractTextExcludingThinking = extractTextExcludingThinking;
  TC.isManualSendMode = isManualSendMode;
  TC.isManualTurnSendMode = isManualTurnSendMode;
  TC.isCapturingActiveResponse = isCapturingActiveResponse;
  TC.pauseManualTurnObserver = pauseManualTurnObserver;
  TC.resumeManualTurnObserver = resumeManualTurnObserver;
  TC.setCapturingActiveResponse = setCapturingActiveResponse;
  TC.startManualTurnCapture = startManualTurnCapture;
  TC.startManualSendCapture = startManualSendCapture;
  TC.cleanupAll = cleanupAll;

  globalThis.__MAI_Transcript = TC;
  return TC;
})();
