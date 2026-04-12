(() => {
  const constants =
    typeof require === "function"
      ? require("./session-constants.js")
      : (globalThis.MultiAISessionConstants || {});

  const {
    SESSION_STATUS_ACTIVE,
    SESSION_MODE_FOREGROUND
  } = constants;

  function createEmptyChildSession(provider) {
    return {
      provider,
      tabId: null,
      url: "",
      title: "",
      lastActiveAt: null,
      recoverable: false
    };
  }

  function createSessionRecord({ sessionId, providers, mode, now }) {
    return {
      sessionId,
      name: `Session ${now}`,
      windowId: null,
      status: SESSION_STATUS_ACTIVE,
      mode: mode || SESSION_MODE_FOREGROUND,
      createdAt: now,
      lastActiveAt: now,
      providers: providers.slice(),
      childSessions: providers.reduce((acc, provider) => {
        acc[provider] = createEmptyChildSession(provider);
        return acc;
      }, {})
    };
  }

  function updateChildSessionRecord(session, provider, patch) {
    if (!Object.prototype.hasOwnProperty.call(session.childSessions, provider)) {
      throw new Error(`Unknown provider "${provider}"`);
    }
    return {
      ...session,
      lastActiveAt: patch.lastActiveAt ?? session.lastActiveAt,
      childSessions: {
        ...session.childSessions,
        [provider]: {
          ...session.childSessions[provider],
          ...patch,
          provider
        }
      }
    };
  }

  const api = {
    createSessionRecord,
    updateChildSessionRecord
  };

  if (typeof globalThis !== "undefined") {
    globalThis.MultiAISessionModel = api;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
