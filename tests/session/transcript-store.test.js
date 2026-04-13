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

test("handleSessionTranscriptUserTurn records one unified-send user turn per target provider", async () => {
  const { createSessionRecord } = require("../../session/session-model.js");
  const { ensureSessionTranscript } = require("../../session/transcript-store.js");
  const now = "2026-04-13T11:00:00.000Z";
  const sessionId = "sess_transcript_unified_send";
  const managedSession = ensureSessionTranscript(createSessionRecord({
    sessionId,
    providers: ["deepseek", "gemini", "grok"],
    now
  }), now);
  managedSession.windowId = 88;

  const chromeStub = createChromeStub({
    "multi-ai-sessions": [managedSession]
  });
  const { background, constants } = loadBackgroundWithStubs(chromeStub);

  const occurredAt = "2026-04-13T11:02:00.000Z";
  const prompt = "Explain zero-shot learning in one paragraph.";
  const result = await background.handleSessionTranscriptUserTurn({
    type: "session:transcript-user-turn",
    sessionId,
    prompt,
    providers: ["deepseek", "grok"],
    occurredAt
  }, {
    tab: {
      id: 18,
      windowId: 88
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.providers, ["deepseek", "grok"]);

  const storedSessions = chromeStub.__store[constants.SESSION_STORAGE_KEY];
  const storedSession = storedSessions[0];
  const deepseekTurns = storedSession.transcript.providers.deepseek.turns;
  const geminiTurns = storedSession.transcript.providers.gemini.turns;
  const grokTurns = storedSession.transcript.providers.grok.turns;

  assert.equal(deepseekTurns.length, 1);
  assert.equal(grokTurns.length, 1);
  assert.equal(geminiTurns.length, 0);

  assert.equal(deepseekTurns[0].role, "user");
  assert.equal(deepseekTurns[0].content, prompt);
  assert.equal(deepseekTurns[0].createdAt, occurredAt);

  assert.equal(grokTurns[0].role, "user");
  assert.equal(grokTurns[0].content, prompt);
  assert.equal(grokTurns[0].createdAt, occurredAt);
});

test("provider raw turns and session timeline are updated together for unified-send and manual turns", async () => {
  const { createSessionRecord } = require("../../session/session-model.js");
  const { ensureSessionTranscript } = require("../../session/transcript-store.js");
  const now = "2026-04-13T13:00:00.000Z";
  const sessionId = "sess_transcript_timeline_sync";
  const managedSession = ensureSessionTranscript(createSessionRecord({
    sessionId,
    providers: ["deepseek", "gemini", "grok"],
    now
  }), now);
  managedSession.windowId = 109;

  const chromeStub = createChromeStub({
    "multi-ai-sessions": [managedSession]
  });
  const { background, constants } = loadBackgroundWithStubs(chromeStub);

  const prompt = "Summarize transfer learning in one paragraph.";
  const userOccurredAt = "2026-04-13T13:01:00.000Z";
  const userTurnResult = await background.handleSessionTranscriptUserTurn({
    type: "session:transcript-user-turn",
    sessionId,
    prompt,
    providers: ["deepseek", "grok"],
    occurredAt: userOccurredAt
  }, {
    tab: {
      id: 31,
      windowId: 109
    }
  });
  assert.equal(userTurnResult.ok, true);

  const sender = {
    tab: {
      id: 32,
      windowId: 109
    }
  };
  const assistantPartialResult = await background.handleSessionTranscriptProviderTurn({
    type: "session:transcript-provider-turn",
    provider: "deepseek",
    role: "assistant",
    content: "Transfer learning reuses pretrained representations",
    occurredAt: "2026-04-13T13:01:20.000Z"
  }, sender);
  assert.equal(assistantPartialResult.ok, true);

  const assistantExpandedResult = await background.handleSessionTranscriptProviderTurn({
    type: "session:transcript-provider-turn",
    provider: "deepseek",
    role: "assistant",
    content:
      "Transfer learning reuses pretrained representations and fine-tunes them on task-specific data",
    occurredAt: "2026-04-13T13:01:23.000Z"
  }, sender);
  assert.equal(assistantExpandedResult.ok, true);

  const storedSessions = chromeStub.__store[constants.SESSION_STORAGE_KEY];
  const storedSession = storedSessions[0];
  const deepseekTurns = storedSession.transcript.providers.deepseek.turns;
  const grokTurns = storedSession.transcript.providers.grok.turns;
  const timeline = storedSession.transcript.timeline;

  assert.equal(deepseekTurns.length, 2);
  assert.equal(grokTurns.length, 1);
  assert.equal(timeline.length, 3);

  assert.deepEqual(timeline[0], {
    provider: "deepseek",
    role: "user",
    content: prompt,
    createdAt: userOccurredAt,
    status: "completed"
  });
  assert.deepEqual(timeline[1], {
    provider: "grok",
    role: "user",
    content: prompt,
    createdAt: userOccurredAt,
    status: "completed"
  });
  assert.deepEqual(timeline[2], {
    provider: "deepseek",
    role: "assistant",
    content:
      "Transfer learning reuses pretrained representations and fine-tunes them on task-specific data",
    createdAt: "2026-04-13T13:01:20.000Z",
    status: "completed"
  });
});

test("handleSessionTranscriptProviderTurn ignores consecutive duplicates even when timestamps differ", async () => {
  const { createSessionRecord } = require("../../session/session-model.js");
  const { ensureSessionTranscript } = require("../../session/transcript-store.js");
  const now = "2026-04-13T13:10:00.000Z";
  const managedSession = ensureSessionTranscript(createSessionRecord({
    sessionId: "sess_transcript_consecutive_dupe",
    providers: ["deepseek", "gemini"],
    now
  }), now);
  managedSession.windowId = 109;

  const chromeStub = createChromeStub({
    "multi-ai-sessions": [managedSession]
  });
  const { background, constants } = loadBackgroundWithStubs(chromeStub);

  const sender = {
    tab: {
      id: 33,
      windowId: 109
    }
  };

  const firstAt = "2026-04-13T13:11:00.000Z";
  const secondAt = "2026-04-13T13:13:10.000Z";

  const first = await background.handleSessionTranscriptProviderTurn({
    type: "session:transcript-provider-turn",
    provider: "deepseek",
    role: "assistant",
    content: "OK",
    occurredAt: firstAt
  }, sender);
  assert.equal(first.ok, true);

  const dup = await background.handleSessionTranscriptProviderTurn({
    type: "session:transcript-provider-turn",
    provider: "deepseek",
    role: "assistant",
    content: "OK",
    occurredAt: secondAt
  }, sender);
  assert.equal(dup.ok, true);

  const storedSessions = chromeStub.__store[constants.SESSION_STORAGE_KEY];
  const storedSession = storedSessions[0];
  const deepseekTurns = storedSession.transcript.providers.deepseek.turns;
  const timeline = storedSession.transcript.timeline;

  assert.equal(deepseekTurns.length, 1);
  assert.equal(deepseekTurns[0].createdAt, firstAt);
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].createdAt, firstAt);
});
