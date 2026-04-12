const DEFAULT_SESSION_PROVIDER_IDS = ["deepseek", "gemini", "grok"];

const SESSION_PROVIDER_URL_PREFIXES = {
  deepseek: ["https://chat.deepseek.com/"],
  gemini: ["https://gemini.google.com/"],
  grok: ["https://grok.com/", "https://www.grok.com/"]
};

function loadSessionProviderIds() {
  try {
    const providerModule = require("../providers.js");
    if (
      providerModule &&
      Array.isArray(providerModule.SESSION_PROVIDER_IDS) &&
      providerModule.SESSION_PROVIDER_IDS.length > 0
    ) {
      return providerModule.SESSION_PROVIDER_IDS.slice();
    }
  } catch {
    // ignore
  }

  return DEFAULT_SESSION_PROVIDER_IDS.slice();
}

const SESSION_PROVIDER_IDS = loadSessionProviderIds();

function isSessionProviderSupported(provider) {
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

function normalizeChildSessionBinding({ provider, url, title, tabId, now }) {
  const normalizedProvider = typeof provider === "string" ? provider : "";
  const normalizedUrl = typeof url === "string" ? url.trim() : "";
  const recoverable =
    Boolean(normalizedUrl) &&
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

module.exports = {
  SESSION_PROVIDER_IDS,
  isSessionProviderSupported,
  normalizeChildSessionBinding
};
