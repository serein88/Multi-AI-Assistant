function normalizeWindowCreatePayload({ urls, focused } = {}) {
  return {
    url: Array.isArray(urls) ? urls : [],
    focused: Boolean(focused)
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
  normalizeWindowCreatePayload
};
