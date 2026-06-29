// content/send-handlers.js — Provider send handlers and DOM utilities
// Loaded via manifest.json js array BEFORE content.js
// Exposes functions on globalThis.__MAI_Send for content.js to consume
(() => {
  "use strict";
  var C_SH = (typeof globalThis !== "undefined" && globalThis.MultiAIContentConstants) || {};

  // --- Shadow DOM traversal security policy ---
  // Denylist: host attributes matching these patterns are NEVER traversed.
  // Covers password managers, auth/payment widgets, OTP fields, etc.
  var SHADOW_DENY_PATTERNS = [
    /password/i,
    /passkey/i,
    /credential/i,
    /auth[\s_-]?/i,
    /otp/i,
    /payment/i,
    /card[\s_-]?number/i,
    /wallet/i,
    /1password/i,
    /bitwarden/i,
    /lastpass/i,
    /dashlane/i,
    /keeper/i,
    /proton/i,
    /keychain/i,
    /two[\s_-]?factor/i,
    /2fa/i,
    /mfa/i,
    /signin[\s_-]?field/i
  ];

  // Allowlist: host attributes matching these patterns ARE traversed.
  // Covers AI chat input, editors, send controls, and known provider components.
  var SHADOW_ALLOW_PATTERNS = [
    /composer/i,
    /chat[\s_-]?input/i,
    /input[\s_-]?area/i,
    /textbox/i,
    /editor/i,
    /message[\s_-]?input/i,
    /prompt[\s_-]?area/i,
    /send[\s_-]?button/i,
    /send[\s_-]?container/i,
    /send[\s_-]?toolbar/i,
    /composer[\s_-]?toolbar/i,
    /lexical/i,
    /prose[\s_-]?mirror/i,
    /rich[\s_-]?text/i,
    /content[\s_-]?editable/i,
    /grok/i,
    /kimi/i,
    /copilot/i
  ];

  function isSensitiveShadowHost(host) {
    if (!host) return false;
    var tag = (host.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") {
      var type = (host.getAttribute && host.getAttribute("type") || "").toLowerCase();
      if (type === "password" || type === "hidden") return true;
    }
    var attrStr = [
      tag,
      host.id || "",
      typeof host.className === "string" ? host.className : "",
      host.getAttribute && host.getAttribute("data-testid") || "",
      host.getAttribute && host.getAttribute("role") || "",
      host.getAttribute && host.getAttribute("aria-label") || "",
      host.getAttribute && host.getAttribute("name") || ""
    ].join(" ");
    for (var i = 0; i < SHADOW_DENY_PATTERNS.length; i++) {
      if (SHADOW_DENY_PATTERNS[i].test(attrStr)) return true;
    }
    return false;
  }

  function shouldTraverseShadowHost(host) {
    if (!host) return false;
    // Denylist takes absolute priority — sensitive hosts are never traversed.
    if (isSensitiveShadowHost(host)) return false;
    // Allowlist: host must match at least one AI-input-related pattern.
    // This applies to both custom elements and standard HTML elements
    // (e.g. a plain <div class="chat-input-container"> with a shadowRoot).
    var tag = (host.tagName || "").toLowerCase();
    var attrStr = [
      tag,
      host.id || "",
      typeof host.className === "string" ? host.className : "",
      host.getAttribute && host.getAttribute("data-testid") || "",
      host.getAttribute && host.getAttribute("role") || "",
      host.getAttribute && host.getAttribute("aria-label") || "",
      host.getAttribute && host.getAttribute("name") || ""
    ].join(" ");
    for (var i = 0; i < SHADOW_ALLOW_PATTERNS.length; i++) {
      if (SHADOW_ALLOW_PATTERNS[i].test(attrStr)) return true;
    }
    return false;
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
    if (node.shadowRoot && shouldTraverseShadowHost(node)) {
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
function waitForElement(selectors, timeout = (C_SH.ELEMENT_WAIT_TIMEOUT_MS || 3000)) {
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

function waitForElementDeep(selectors, timeout = (C_SH.ELEMENT_WAIT_TIMEOUT_MS || 3000)) {
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
      const mainWorldResult = await (globalThis.__MAI_RuntimeMessaging?.sendRuntimeMessageWithRetry
        ? globalThis.__MAI_RuntimeMessaging.sendRuntimeMessageWithRetry({
            type: "executeChatGPTMainWorldSend",
            prompt
          }, { retries: 1 })
        : chrome.runtime.sendMessage({
            type: "executeChatGPTMainWorldSend",
            prompt
          })
      );
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
    await new Promise(r => setTimeout(r, C_SH.COPILOT_SEND_DELAY_MS || 800));

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
        if (node.shadowRoot && shouldTraverseShadowHost(node)) {
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

    return waitForGrokSendSignal(baselineText, baselineStop, baselineCount, C_SH.GROK_SEND_SIGNAL_TIMEOUT_MS || 2000);
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

    await new Promise((r) => setTimeout(r, C_SH.KIMI_INPUT_SETTLE_MS || 250));
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
    while (Date.now() - waitStart < (C_SH.KIMI_SEND_BUTTON_ENABLE_WAIT_MS || 1500)) {
      fireInputSignals();
      await new Promise((r) => setTimeout(r, C_SH.KIMI_SEND_BUTTON_POLL_MS || 100));
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
      const mainWorldResult = await (globalThis.__MAI_RuntimeMessaging?.sendRuntimeMessageWithRetry
        ? globalThis.__MAI_RuntimeMessaging.sendRuntimeMessageWithRetry({
            type: "executeTongyiMainWorldSend",
            prompt
          }, { retries: 1 })
        : chrome.runtime.sendMessage({
            type: "executeTongyiMainWorldSend",
            prompt
          })
      );
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

    await new Promise((r) => setTimeout(r, C_SH.TONGYI_INPUT_SETTLE_MS || 100));
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

  // --- Response detection helpers (used by sendGrokMessage & content.js) ---

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
      return [
        'button[aria-label*="Stop"]',
        'button[aria-label*="停止"]',
        'button[title*="Stop"]',
        'button[title*="停止"]',
        '[data-testid*="stop"]'
      ];
    }
    if (provider === "deepseek") { return []; }
    if (provider === "gemini") {
      return [
        'button[aria-label*="停止回答"]',
        'button[aria-label*="Stop response"]',
        'button[aria-label*="Stop"]',
        'button[aria-label*="停止"]',
        'button[data-testid*="stop"]'
      ];
    }
    return [
      'button[aria-label*="Stop"]', 'button[aria-label*="停止"]',
      'button[aria-label*="停止回答"]', 'button[aria-label*="暂停"]',
      'button[data-testid*="stop"]', 'button[aria-label*="Pause"]',
      'button[data-testid="stop-button"]', 'button[title*="Stop"]',
      'button[title*="停止"]', 'button[title*="暂停"]',
      '.stop-generating', '[class*="stop-generating"]', '[class*="StopGenerating"]',
      '[data-testid="stop-generating-button"]', 'button svg rect',
      'button svg path[d^="M2 2h20v20H2"]',
      'div[role="button"][aria-label*="Stop"]', 'div[role="button"][aria-label*="停止"]'
    ];
  }

  function countResponseNodes(provider) {
    // eslint-disable-next-line no-undef -- RESPONSE_SELECTORS is defined in content.js (loaded after this file)
    const rs = (typeof RESPONSE_SELECTORS !== "undefined" ? RESPONSE_SELECTORS : globalThis.RESPONSE_SELECTORS) || {};
    const selectors = [
      ...(rs[provider] || []),
      '[data-message-author-role="assistant"]', '[data-testid*="chat-message"]',
      '.assistant', '.message.assistant', '.result-streaming', '.streaming',
      '.ds-message', '[class*="message-assistant"]', '[class*="message-ai"]',
      '[data-role="assistant"]'
    ];
    const unique = Array.from(new Set(selectors));
    return unique.reduce((sum, sel) => sum + document.querySelectorAll(sel).length, 0);
  }

  // --- Export to global namespace ---
  globalThis.__MAI_Send = {
    // DOM query helpers
    findElement,
    findElementDeep,
    deepQueryAll,
    deepFindElement,
    waitForElement,
    waitForElementDeep,
    // Shadow DOM traversal policy
    shouldTraverseShadowHost,
    isSensitiveShadowHost,
    SHADOW_DENY_PATTERNS,
    SHADOW_ALLOW_PATTERNS,
    // Element state
    isElementVisible,
    isElementDisabled,
    getEditableText,
    normalizeEditableInput,
    collectEditableCandidates,
    scoreEditableCandidate,
    // Input & click
    setInputValue,
    forceSetEditableText,
    clickSendButton,
    clickSendButtonDeep,
    findEditableNearSendButton,
    findSendButtonNearInput,
    clickLikeHuman,
    clickOnce,
    dispatchEnterKey,
    setKimiEditableText,
    // Provider send functions
    sendChatGPTMessage,
    sendCopilotMessage,
    sendGrokMessage,
    sendKimiMessage,
    sendImaMessage,
    sendTongyiMessage,
    // Response detection helpers
    getStopSelectors,
    countResponseNodes,
    // Logging
    log
  };
})();
