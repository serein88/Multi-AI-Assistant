(() => {
  const api = {
    SESSION_STATUS_ACTIVE: "active",
    SESSION_STATUS_ARCHIVED: "archived",
    SESSION_MODE_FOREGROUND: "foreground",
    SESSION_STORAGE_KEY: "multi-ai-sessions"
  };

  if (typeof globalThis !== "undefined") {
    globalThis.MultiAISessionConstants = api;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
