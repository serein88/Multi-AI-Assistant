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
    "[data-md]",
    "[class*='markdown']",
    "[class*='response']",
    "rich-text"
  ],
  copilot: [
    "cib-chat-turn.cib-bot-turn",
    "cib-serp .response-message",
    "[class*='bot-message']",
    "[class*='ai-message']"
  ],
  grok: [
    "[data-role='assistant']",
    ".assistant",
    "[class*='message-ai']",
    "[data-testid*='chat-message']"
  ],
  kimi: [
    "[class*='assistant']",
    "[data-role='assistant']",
    "[class*='answer']"
  ],
  deepseek: [
    "[class*='assistant']",
    "[data-role='assistant']",
    "[data-testid*='chat-message']"
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
    if (nodes.length) {
      const target = nodes[nodes.length - 1];
      const text = target.innerText || target.textContent || "";
      if (text.trim()) {
        latest = text.trim();
      }
    }
    if (latest) break;
  }
  return latest;
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
      "textarea[aria-label*='prompt']",
      "textarea[aria-label*='输入']",
      "textarea[placeholder*='Enter']",
      "textarea",
      "div[contenteditable='true']"
    ],
    sendButtonSelectors: [
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
      "button[aria-label*='发送']",
      "button[title*='Send']",
      "button[title*='发送']",
      "button[data-testid*='send']",
      "button[type='submit']",
      "div[role='button'][aria-label*='Send']"
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
      "textarea[placeholder*='说']",
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

const DEBUG = true;
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
            console.error("设置输入值失败:", error);
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
            console.error("设置contenteditable值失败:", error);
            resolve(false);
          }
        }, 10); // Reduced delay
      });
    }
  } catch (error) {
    console.error("设置输入值失败:", error);
    return Promise.resolve(false);
  }

  return Promise.resolve(false);
}

function clickSendButton(selectors) {
  const button = findElement(selectors);
  if (!button) return false;

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
    console.error("点击发送按钮失败:", error);
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
          label.includes("发送") ||
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
    input.focus({ preventScroll: true });

    // 1. Set text (ChatGPT uses contenteditable div usually)
    if (input.tagName === 'TEXTAREA') {
      input.value = prompt;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      input.innerHTML = `<p>${prompt}</p>`;
      input.dispatchEvent(new Event('input', { bubbles: true }));
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

      dispatchEnterKey(input);

      return true;
    }

    log("ChatGPT: clicking button");
    btn.click();
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
        const isSendLike = label.includes('send') || label.includes('发送') || hasIcon;
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
    const editable = findEditableNearSendButton(input, config.inputSelectors, config.sendButtonSelectors, config.useShadow) || normalizeEditableInput(input) || input;
    if (!editable) return false;
    editable.focus({ preventScroll: true });

    let setOk = await forceSetEditableText(editable, prompt);
    if (!setOk) {
      setOk = await setInputValue(editable, prompt);
    }
    if (!setOk) {
      try {
        if (editable.tagName === "TEXTAREA" || editable.tagName === "INPUT") {
          editable.value = prompt;
          editable.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
          editable.innerText = prompt;
          editable.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } catch (e) {}
    }

    editable.dispatchEvent(new Event("input", { bubbles: true }));
    editable.dispatchEvent(new Event("change", { bubbles: true }));
    editable.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
    editable.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));

    for (let attempt = 0; attempt < 15; attempt++) {
        const currentText = getEditableText(editable).trim();
        if (!currentText) {
            await forceSetEditableText(editable, prompt);
            editable.dispatchEvent(new Event("input", { bubbles: true }));
            editable.dispatchEvent(new Event("change", { bubbles: true }));
        }

        let clicked = config.useShadow 
          ? clickSendButtonDeep(config.sendButtonSelectors)
          : clickSendButton(config.sendButtonSelectors);
        
        if (clicked) return true;

        const potentialButtons = [];
        let current = editable;
        for (let i = 0; i < 4; i++) {
            if (!current || !current.parentElement) break;
            current = current.parentElement;
            const candidates = current.querySelectorAll("button, div[role=\"button\"], [class*=\"button\"], [class*=\"btn\"], a[href=\"#\"]");
            for (const cand of candidates) {
                if (cand === editable || cand.contains(editable)) continue;
                if (!isElementVisible(cand)) continue;
                
                let score = 0;
                const html = cand.outerHTML.toLowerCase();
                const text = cand.innerText.trim().toLowerCase();
                const ariaLabel = (cand.getAttribute("aria-label") || "").toLowerCase();
                
                if (ariaLabel.includes("send") || ariaLabel.includes("发送") || ariaLabel.includes("submit")) score += 20;
                
                const negativeKeywords = ["attach", "upload", "voice", "model", "mode", "search", "附件", "上传", "语音", "模型", "搜索", "file", "sidebar", "menu", "private", "侧边栏", "菜单", "私密", "主页", "history", "历史"];
                if (negativeKeywords.some(k => ariaLabel.includes(k) || text.includes(k))) score -= 20;
                
                if (html.includes("svg") || cand.querySelector("svg")) score += 5;
                
                if (text) {
                    if (text === "send" || text === "发送") score += 15;
                    else if (text.includes("send") || text.includes("发送")) score += 5;
                    else if (text.length > 0) score -= 5;
                } else {
                    if (html.includes("rounded-full") || html.includes("circle")) score += 5;
                    if (html.includes("aspect-square") && (html.includes("h-8") || html.includes("h-10"))) score += 5;
                }

                if (html.includes("arrow") || html.includes("paper")) score += 5;
                if (cand.disabled) score -= 10;
                
                if (score > 0) {
                    potentialButtons.push({ el: cand, score });
                }
            }
            if (potentialButtons.length > 0) {
                 break; 
            }
        }

        if (potentialButtons.length > 0) {
            potentialButtons.sort((a, b) => b.score - a.score);
            const best = potentialButtons[0];
            if (best.score >= 12) {
                best.el.click();
                return true;
            }
        }
        
        await new Promise(r => setTimeout(r, 200));
    }

    // 4. Fallback: Enter key
    const enterEvents = [
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true }),
      new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true }),
      new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true }),
      new InputEvent('beforeinput', { inputType: 'insertParagraph', data: null, bubbles: true, cancelable: true, composed: true })
    ];

    for (const evt of enterEvents) {
      editable.dispatchEvent(evt);
      await new Promise(r => setTimeout(r, 10));
    }
    
    // Also dispatch on parent form/container just in case
    const container = editable.closest('form') || editable.closest('[class*="input"]') || editable.parentElement;
    if (container) {
       for (const evt of enterEvents) {
        container.dispatchEvent(evt);
       }
       // Try dispatching submit if it's a form
       if (container.tagName === 'FORM') {
           container.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
           container.requestSubmit && container.requestSubmit();
       }
    }
    
    return true;

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

  return [
    'button[aria-label*="Stop"]',
    'button[aria-label*="停止"]',
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
  return !!document.querySelector(base);
}

async function waitForResponseStart(provider) {
  const timeout = 12000;
  const stopSelectors = getStopSelectors(provider);
  const baselineCount = countResponseNodes(provider);
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

      // 4. Check Send Button Disappearance or Disabled (Generic)
      // Only if we have valid send selectors
      // FIX: Skip for Grok because selectors might be unstable/heuristic-based, leading to false positives if selectors match nothing.
      if (sendSelectors.length > 0 && provider !== 'grok') {
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
      if (inputEl) {
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

async function waitForResponseComplete(provider) {
  const timeout = 90000;
  const stopSelectors = getStopSelectors(provider);
  const sendSelectors = PROVIDER_CONFIGS[provider]?.sendButtonSelectors || [];
  let sawStop = false;

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

    const check = () => {
      if (settled) return;
      const stopVisible = hasElementDeep(stopSelectors);
      if (stopVisible) {
        sawStop = true;
        return;
      }
      if (provider === "chatgpt" && sendSelectors.length > 0) {
        const sendVisible = hasElementDeep(sendSelectors);
        if (sawStop || sendVisible) {
          cleanup();
          resolve(true);
        }
        return;
      }

      if (sawStop) {
        // Stop button disappeared -> generation likely done
        cleanup();
        resolve(true);
      }
    };

    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });

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
  const maxRetries = 2;
  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    console.error(`未找到配置: ${provider}`);
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
    return false;
  }

  await new Promise(resolve => setTimeout(resolve, 10));

  let sendOk = false;

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
  } else {
    // Generic handler
    const setOk = await setInputValue(input, prompt);
    if (!setOk) {
      console.error(`设置输入值失败: ${provider}`);
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 50));
        return trySendPrompt(provider, prompt, retryCount + 1);
      }
      return false;
    }

    await new Promise(resolve => setTimeout(resolve, 10));

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
        console.error("发送Enter事件失败:", error);
      }
    }
  }

  if (window.parent && window.parent !== window) {
    try {
      log(`[Content] Sending sendResult to Dashboard for ${provider}: success=${sendOk}`);
      window.parent.postMessage({
        source: "multi-ai-content",
        type: "sendResult",
        provider: provider,
        success: sendOk
      }, "*");
    } catch (e) {
      console.error(`[Content] Failed to postMessage:`, e);
    }

    const responseStarted = sendOk ? await waitForResponseStart(provider) : false;
    log(`[Content] Response start detection for ${provider}: ${responseStarted ? "DETECTED" : "NOT DETECTED (or timed out)"}`);

    if (responseStarted) {
      try {
        window.parent.postMessage({
          source: "multi-ai-content",
          type: "responseStarted",
          provider: provider
        }, "*");
      } catch (e) {
        // ignore
      }

      waitForResponseComplete(provider).then(() => {
        const latest = extractLatestResponse(provider);
        try {
          window.parent.postMessage({
            source: "multi-ai-content",
            type: "responseComplete",
            provider: provider,
            text: latest
          }, "*");
        } catch {
          // ignore
        }
      });
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
    .catch(() => sendResponse({ ok: false }));
  return true;
});

window.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.source !== "multi-ai") return;
  if (data.type !== "sendPrompt" && data.type !== "sendPromptChatroom") return;

  const provider = data.provider || getProviderFromHost();
  const prompt = typeof data.prompt === "string" ? data.prompt : "";
  trySendPrompt(provider, prompt).catch(() => undefined);
});

function initializeCustomFixes() {
  const provider = getProviderFromHost();

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

    window.addEventListener("click", (event) => {
      const target = event.target;
      const avatar = target.closest('[aria-label*="Account"], [aria-label*="账户"], [aria-label*="头像"], [data-tooltip*="Account"], button, div[role="button"]');
      if (avatar && avatar.closest('[class*="avatar"], [class*="account"], [class*="profile"]')) {
        try {
          window.parent.postMessage({
            source: "multi-ai-content",
            type: "openAccountPage"
          }, "*");
        } catch (e) { }
      }
    }, true);
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

  // Generic Cloudflare / Verification Handler for Grok & Gemini
  if (provider === "grok" || provider === "gemini" || location.host.includes("cloudflare")) {
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
    setInterval(attemptVerification, 2000);

    // Also observe mutations
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes.length > 0) attemptVerification();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeCustomFixes);
} else {
  initializeCustomFixes();
}
