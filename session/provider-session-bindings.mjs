"use strict";

/**
 * Provider Session Bindings (ESM)
 *
 * Provider URL patterns and child session normalization for background service worker.
 */

const DEFAULT_SESSION_PROVIDER_IDS = [
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
];

const SESSION_PROVIDER_URL_PREFIXES = {
  chatgpt: ["https://chatgpt.com/"],
  claude: ["https://claude.ai/"],
  copilot: ["https://copilot.microsoft.com/", "https://copilot.cloud.microsoft/"],
  deepseek: ["https://chat.deepseek.com/"],
  doubao: ["https://www.doubao.com/"],
  gemini: ["https://gemini.google.com/"],
  grok: ["https://grok.com/", "https://www.grok.com/"],
  ima: ["https://ima.qq.com/"],
  kimi: ["https://www.kimi.com/", "https://kimi.moonshot.cn/"],
  tongyi: ["https://www.qianwen.com/", "https://qianwen.aliyun.com/"],
  you: ["https://you.com/"],
  yuanbao: ["https://yuanbao.tencent.com/"],
  zhipu: ["https://chatglm.cn/"]
};

const SESSION_PROVIDER_IGNORED_PATH_PATTERNS = {
  gemini: ["/_/bscframe"]
};

export const SESSION_PROVIDER_IDS = DEFAULT_SESSION_PROVIDER_IDS.slice();

export function isSessionProviderSupported(provider) {
  if (typeof provider !== "string" || provider.length === 0) {
    return false;
  }
  return SESSION_PROVIDER_IDS.includes(provider);
}

function isLoginOrChallengeUrl(url) {
  if (!url) {
    return false;
  }

  const normalizedUrl = url.toLowerCase();
  if (normalizedUrl.includes("/login") || normalizedUrl.includes("/challenge")) {
    return true;
  }

  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname || "";
    const search = parsed.search || "";
    const hash = parsed.hash || "";
    const combined = `${pathname}${search}${hash}`.toLowerCase();
    return combined.includes("login") || combined.includes("challenge");
  } catch {
    // ignore invalid urls
  }

  return false;
}

function isUrlMatchingProvider(provider, url) {
  if (!url || typeof provider !== "string") {
    return false;
  }

  const prefixes = SESSION_PROVIDER_URL_PREFIXES[provider];
  if (!Array.isArray(prefixes) || prefixes.length === 0) {
    return false;
  }

  const normalizedUrl = url.toLowerCase();
  return prefixes.some((prefix) => normalizedUrl.startsWith(prefix));
}

export function shouldIgnoreChildSessionUrl(provider, url) {
  if (!url || typeof provider !== "string") {
    return false;
  }

  const ignoredPatterns = SESSION_PROVIDER_IGNORED_PATH_PATTERNS[provider];
  if (!Array.isArray(ignoredPatterns) || ignoredPatterns.length === 0) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const combined = `${parsed.pathname || ""}${parsed.search || ""}${parsed.hash || ""}`.toLowerCase();
    return ignoredPatterns.some((pattern) => combined.includes(String(pattern).toLowerCase()));
  } catch {
    return false;
  }
}

export function normalizeChildSessionBinding({ provider, url, title, tabId, now }) {
  const normalizedProvider = typeof provider === "string" ? provider : "";
  const normalizedUrl = typeof url === "string" ? url.trim() : "";
  const recoverable =
    Boolean(normalizedUrl) &&
    !shouldIgnoreChildSessionUrl(normalizedProvider, normalizedUrl) &&
    isSessionProviderSupported(normalizedProvider) &&
    isUrlMatchingProvider(normalizedProvider, normalizedUrl) &&
    !isLoginOrChallengeUrl(normalizedUrl);

  return {
    provider: normalizedProvider,
    tabId: typeof tabId === "number" ? tabId : null,
    url: normalizedUrl,
    title: typeof title === "string" && title.length > 0 ? title : normalizedProvider,
    lastActiveAt: now || null,
    recoverable
  };
}
