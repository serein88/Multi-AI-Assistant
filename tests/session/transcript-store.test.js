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
  let nextWindowId = 1;

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
      async create(payload) {
        return {
          id: nextWindowId++,
          focused: payload?.focused ?? true,
          tabs: Array.isArray(payload?.url)
            ? payload.url.map((url, index) => ({ id: index + 1, url }))
            : []
        };
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

test("ensureSessionTranscript initializes transcript shell for new session", () => {
  const { createSessionRecord } = require("../../session/session-model.js");
  const { ensureSessionTranscript } = require("../../session/transcript-store.js");

  const session = createSessionRecord({
    sessionId: "sess_transcript",
    providers: ["deepseek", "gemini"],
    now: "2026-04-12T10:00:00.000Z"
  });

  const ensured = ensureSessionTranscript(session, "2026-04-12T10:00:00.000Z");

  assert.equal(ensured.transcript.version, 1);
  assert.equal(Array.isArray(ensured.transcript.timeline), true);
  assert.equal(ensured.transcript.timeline.length, 0);

  const deepseek = ensured.transcript.providers.deepseek;
  assert.equal(deepseek.provider, "deepseek");
  assert.deepEqual(deepseek.turns, []);
  assert.equal(deepseek.status, "idle");
  assert.equal(deepseek.answerStartedAt, null);
  assert.equal(deepseek.answerCompletedAt, null);
  assert.equal(deepseek.lastActiveAt, null);
});

test("ensureSessionTranscript preserves existing transcript fields and fills missing providers", () => {
  const { createSessionRecord } = require("../../session/session-model.js");
  const { ensureSessionTranscript } = require("../../session/transcript-store.js");

  const session = createSessionRecord({
    sessionId: "sess_transcript_fill",
    providers: ["deepseek", "grok"],
    now: "2026-04-12T10:00:00.000Z"
  });

  const seeded = {
    ...session,
    transcript: {
      version: 1,
      createdAt: "2026-04-12T10:00:00.000Z",
      updatedAt: "2026-04-12T10:05:00.000Z",
      debugMeta: {
        source: "future-field"
      },
      timeline: [
        {
          role: "user",
          content: "Hello",
          createdAt: "2026-04-12T10:05:00.000Z",
          status: "completed"
        }
      ],
      providers: {
        deepseek: {
          provider: "deepseek",
          turns: [
            {
              role: "assistant",
              content: "Hi!",
              createdAt: "2026-04-12T10:05:30.000Z",
              status: "completed"
            }
          ],
          status: "idle",
          answerStartedAt: null,
          answerCompletedAt: null,
          lastActiveAt: null,
          debugToken: "keep-me"
        }
      }
    }
  };

  const ensured = ensureSessionTranscript(seeded, "2026-04-12T10:06:00.000Z");

  assert.equal(ensured.transcript.timeline.length, 1);
  assert.equal(ensured.transcript.providers.deepseek.turns.length, 1);
  assert.equal(ensured.transcript.providers.deepseek.debugToken, "keep-me");
  assert.equal(ensured.transcript.debugMeta.source, "future-field");
  assert.ok(ensured.transcript.providers.grok);
  assert.equal(ensured.transcript.providers.grok.status, "idle");
  assert.equal(ensured.transcript.updatedAt, "2026-04-12T10:06:00.000Z");
});

test("handleSessionCreate persists transcript shell for new sessions", async () => {
  const chromeStub = createChromeStub();
  const { background, constants } = loadBackgroundWithStubs(chromeStub);

  const created = await background.handleSessionCreate({ mode: "foreground" });
  const storedSessions = chromeStub.__store[constants.SESSION_STORAGE_KEY];

  assert.equal(Array.isArray(storedSessions), true);
  assert.equal(storedSessions.length, 1);
  assert.equal(storedSessions[0].sessionId, created.session.sessionId);
  assert.ok(storedSessions[0].transcript);
  assert.deepEqual(Object.keys(storedSessions[0].transcript.providers), ["deepseek", "gemini", "grok"]);
});

test("sanitizeSessionIfNeeded backfills transcript shell for legacy sessions", async () => {
  const { createSessionRecord } = require("../../session/session-model.js");
  const legacySession = createSessionRecord({
    sessionId: "sess_legacy",
    providers: ["deepseek", "gemini"],
    now: "2026-04-12T11:00:00.000Z"
  });

  const chromeStub = createChromeStub({
    "multi-ai-sessions": [legacySession]
  });
  const { background, constants } = loadBackgroundWithStubs(chromeStub);

  const updated = await background.sanitizeSessionIfNeeded(legacySession);
  const storedSessions = chromeStub.__store[constants.SESSION_STORAGE_KEY];

  assert.ok(updated.transcript);
  assert.equal(storedSessions[0].transcript.version, 1);
  assert.ok(storedSessions[0].transcript.providers.deepseek);
  assert.ok(storedSessions[0].transcript.providers.gemini);
});
