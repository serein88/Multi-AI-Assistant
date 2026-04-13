const test = require("node:test");
const assert = require("node:assert/strict");

const MODULE_PATHS = [
  "../../background.js",
  "../../session/session-constants.js",
  "../../session/session-model.js",
  "../../session/session-registry.js",
  "../../session/provider-session-bindings.js",
  "../../session/transcript-store.js",
  "../../session/window-manager.js"
];

function clearModuleCache() {
  for (const modulePath of MODULE_PATHS) {
    delete require.cache[require.resolve(modulePath)];
  }
}

function resetSessionGlobals() {
  delete global.MultiAISessionConstants;
  delete global.MultiAISessionModel;
  delete global.MultiAISessionRegistry;
  delete global.MultiAISessionProviderBindings;
  delete global.MultiAISessionTranscriptStore;
  delete global.MultiAISessionWindowManager;
}

function createChromeStub(initialStore = {}) {
  const store = { ...initialStore };

  return {
    __store: store,
    storage: {
      local: {
        async get(key) {
          if (typeof key === "string") {
            return { [key]: store[key] };
          }
          if (Array.isArray(key)) {
            return key.reduce((acc, item) => {
              acc[item] = store[item];
              return acc;
            }, {});
          }
          return { ...store };
        },
        async set(patch) {
          Object.assign(store, patch);
          return undefined;
        }
      }
    },
    runtime: {
      getURL(path) {
        return `chrome-extension://test/${path}`;
      },
      onMessage: {
        addListener() {}
      }
    },
    action: {
      onClicked: {
        addListener() {}
      }
    },
    tabs: {
      async query() {
        return [];
      },
      async create() {
        return { id: 1, status: "complete" };
      },
      onUpdated: {
        addListener() {},
        removeListener() {}
      },
      async sendMessage() {
        return { ok: true };
      }
    },
    scripting: {
      async executeScript() {
        return [{ result: { ok: true } }];
      }
    },
    windows: {
      async create() {
        return { id: 1, focused: true, tabs: [] };
      }
    }
  };
}

function loadBackgroundWithStubs(chromeStub) {
  clearModuleCache();
  resetSessionGlobals();
  global.chrome = chromeStub;
  global.importScripts = () => undefined;

  const constants = require("../../session/session-constants.js");
  require("../../session/session-model.js");
  require("../../session/session-registry.js");
  require("../../session/provider-session-bindings.js");
  require("../../session/transcript-store.js");
  require("../../session/window-manager.js");
  const background = require("../../background.js");

  return {
    background,
    constants
  };
}

test.afterEach(() => {
  clearModuleCache();
  resetSessionGlobals();
  delete global.chrome;
  delete global.importScripts;
});

test("applyProviderLiveStatus normalizes provider live status fields", () => {
  const { createSessionRecord } = require("../../session/session-model.js");
  const {
    ensureSessionTranscript,
    applyProviderLiveStatus
  } = require("../../session/transcript-store.js");

  const baseSession = ensureSessionTranscript(createSessionRecord({
    sessionId: "sess_live_state",
    providers: ["deepseek"],
    now: "2026-04-13T08:00:00.000Z"
  }), "2026-04-13T08:00:00.000Z");

  const responding = applyProviderLiveStatus(baseSession, {
    provider: "deepseek",
    status: "responding",
    occurredAt: "2026-04-13T08:01:00.000Z"
  });
  assert.equal(responding.transcript.providers.deepseek.status, "responding");
  assert.equal(responding.transcript.providers.deepseek.answerStartedAt, "2026-04-13T08:01:00.000Z");
  assert.equal(responding.transcript.providers.deepseek.answerCompletedAt, null);
  assert.equal(responding.transcript.providers.deepseek.lastActiveAt, "2026-04-13T08:01:00.000Z");
  assert.equal(responding.transcript.providers.deepseek.statusUpdatedAt, "2026-04-13T08:01:00.000Z");

  const completed = applyProviderLiveStatus(responding, {
    provider: "deepseek",
    status: "completed",
    occurredAt: "2026-04-13T08:01:30.000Z"
  });
  assert.equal(completed.transcript.providers.deepseek.status, "completed");
  assert.equal(completed.transcript.providers.deepseek.answerStartedAt, "2026-04-13T08:01:00.000Z");
  assert.equal(completed.transcript.providers.deepseek.answerCompletedAt, "2026-04-13T08:01:30.000Z");
  assert.equal(completed.transcript.providers.deepseek.statusUpdatedAt, "2026-04-13T08:01:30.000Z");

  const failed = applyProviderLiveStatus(completed, {
    provider: "deepseek",
    status: "failed",
    occurredAt: "2026-04-13T08:02:00.000Z"
  });
  assert.equal(failed.transcript.providers.deepseek.status, "failed");
  assert.equal(failed.transcript.providers.deepseek.answerCompletedAt, "2026-04-13T08:02:00.000Z");
  assert.equal(failed.transcript.providers.deepseek.statusUpdatedAt, "2026-04-13T08:02:00.000Z");

  const interrupted = applyProviderLiveStatus(failed, {
    provider: "deepseek",
    status: "interrupted",
    occurredAt: "2026-04-13T08:02:15.000Z"
  });
  assert.equal(interrupted.transcript.providers.deepseek.status, "interrupted");
  assert.equal(interrupted.transcript.providers.deepseek.answerCompletedAt, "2026-04-13T08:02:15.000Z");
  assert.equal(interrupted.transcript.providers.deepseek.statusUpdatedAt, "2026-04-13T08:02:15.000Z");
});

test("handleSessionTranscriptLiveStatus updates managed session transcript provider state", async () => {
  const { createSessionRecord } = require("../../session/session-model.js");
  const { ensureSessionTranscript } = require("../../session/transcript-store.js");

  const seeded = ensureSessionTranscript(createSessionRecord({
    sessionId: "sess_live_message",
    providers: ["deepseek", "gemini"],
    now: "2026-04-13T09:00:00.000Z"
  }), "2026-04-13T09:00:00.000Z");
  seeded.windowId = 2468;

  const chromeStub = createChromeStub({
    "multi-ai-sessions": [seeded]
  });
  const { background, constants } = loadBackgroundWithStubs(chromeStub);

  const response = await background.handleSessionTranscriptLiveStatus({
    provider: "deepseek",
    status: "responding",
    occurredAt: "2026-04-13T09:00:10.000Z"
  }, {
    tab: {
      id: 9527,
      windowId: 2468
    }
  });

  assert.equal(response.ok, true);
  assert.equal(response.sessionId, "sess_live_message");
  assert.equal(response.provider, "deepseek");
  assert.equal(response.status, "responding");

  const storedSessions = chromeStub.__store[constants.SESSION_STORAGE_KEY];
  const providerState = storedSessions[0].transcript.providers.deepseek;
  assert.equal(providerState.status, "responding");
  assert.equal(providerState.answerStartedAt, "2026-04-13T09:00:10.000Z");
  assert.equal(providerState.answerCompletedAt, null);
  assert.equal(providerState.statusUpdatedAt, "2026-04-13T09:00:10.000Z");
});
