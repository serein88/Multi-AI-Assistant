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
      return chromeApi.windows.create(payload);
    }
  };
}

module.exports = {
  createWindowManager,
  normalizeWindowCreatePayload,
  normalizeRestorePlan
};
