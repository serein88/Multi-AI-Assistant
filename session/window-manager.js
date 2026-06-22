(() => {
  function buildManagedDashboardUrl({ baseUrl, sessionId } = {}) {
    const normalizedBaseUrl = typeof baseUrl === "string" ? baseUrl : "";
    if (!normalizedBaseUrl) {
      return "";
    }

    const url = new URL(normalizedBaseUrl);
    if (sessionId) {
      url.searchParams.set("sessionId", sessionId);
    }
    return url.toString();
  }

  function normalizeWindowCreatePayload({ urls, focused } = {}) {
    return {
      url: Array.isArray(urls) ? urls : [],
      focused: Boolean(focused)
    };
  }

  function normalizeRestorePlan(session) {
    const childSessions = session?.childSessions || {};
    const clearedChildSessions = {};
    const restored = [];
    const urls = [];

    for (const [provider, child] of Object.entries(childSessions)) {
      const normalizedChild = {
        ...(child || {}),
        provider,
        tabId: null
      };
      clearedChildSessions[provider] = normalizedChild;

      if (normalizedChild.recoverable && normalizedChild.url) {
        urls.push(normalizedChild.url);
        restored.push(normalizedChild);
      }
    }

    return {
      urls,
      restored,
      clearedChildSessions
    };
  }

  function createWindowManager({ chromeApi }) {
    return {
      async createManagedSessionWindow({ urls, focused }) {
        const payload = normalizeWindowCreatePayload({ urls, focused });
        const firstUrl = Array.isArray(payload.url) && payload.url.length > 0
          ? payload.url[0]
          : undefined;
        // Open in the current window instead of creating a new one.
        // If a URL is provided, create a tab; otherwise just return the current window.
        if (firstUrl) {
          const tab = await chromeApi.tabs.create({
            url: firstUrl,
            active: payload.focused !== false
          });
          // Return a window-like object for compatibility
          const win = await chromeApi.windows.getCurrent();
          return { id: win?.id, tabs: [tab] };
        }
        return chromeApi.windows.getCurrent();
      }
    };
  }

  const api = {
    buildManagedDashboardUrl,
    createWindowManager,
    normalizeWindowCreatePayload,
    normalizeRestorePlan
  };

  if (typeof globalThis !== "undefined") {
    globalThis.MultiAISessionWindowManager = api;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
