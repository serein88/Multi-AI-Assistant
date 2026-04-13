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
        return { id: 1 };
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
  const transcriptStore = require("../../session/transcript-store.js");
  require("../../session/window-manager.js");
  const background = require("../../background.js");

  return {
    background,
    constants,
    transcriptStore
  };
}

test.afterEach(() => {
  clearModuleCache();
  resetSessionGlobals();
  delete global.chrome;
  delete global.importScripts;
});

test("applyTranscriptStatus keeps responding and completed timestamps in provider transcript state", () => {
  const { createSessionRecord } = require("../../session/session-model.js");
  const { ensureSessionTranscript, applyTranscriptStatus } = require("../../session/transcript-store.js");

  const session = ensureSessionTranscript(createSessionRecord({
    sessionId: "sess_status",
    providers: ["deepseek"],
    now: "2026-04-13T10:00:00.000Z"
  }));

  const started = applyTranscriptStatus(session, {
    provider: "deepseek",
    status: "responding",
    timestamp: "2026-04-13T10:01:00.000Z"
  });

  assert.equal(started.transcript.providers.deepseek.status, "responding");
  assert.equal(started.transcript.providers.deepseek.answerStartedAt, "2026-04-13T10:01:00.000Z");
  assert.equal(started.transcript.providers.deepseek.answerCompletedAt, null);
  assert.equal(started.transcript.providers.deepseek.lastStatusAt, "2026-04-13T10:01:00.000Z");

  const completed = applyTranscriptStatus(started, {
    provider: "deepseek",
    status: "completed",
    timestamp: "2026-04-13T10:01:08.000Z"
  });

  assert.equal(completed.transcript.providers.deepseek.status, "completed");
  assert.equal(completed.transcript.providers.deepseek.answerStartedAt, "2026-04-13T10:01:00.000Z");
  assert.equal(completed.transcript.providers.deepseek.answerCompletedAt, "2026-04-13T10:01:08.000Z");
  assert.equal(completed.transcript.providers.deepseek.lastStatusAt, "2026-04-13T10:01:08.000Z");
});

test("applyTranscriptStatus records terminal failure states without losing existing start time", () => {
  const { createSessionRecord } = require("../../session/session-model.js");
  const { ensureSessionTranscript, applyTranscriptStatus } = require("../../session/transcript-store.js");

  const session = ensureSessionTranscript(createSessionRecord({
    sessionId: "sess_status_fail",
    providers: ["grok"],
    now: "2026-04-13T10:00:00.000Z"
  }));

  const started = applyTranscriptStatus(session, {
    provider: "grok",
    status: "responding",
    timestamp: "2026-04-13T10:02:00.000Z"
  });
  const failed = applyTranscriptStatus(started, {
    provider: "grok",
    status: "failed",
    timestamp: "2026-04-13T10:02:12.000Z"
  });

  assert.equal(failed.transcript.providers.grok.status, "failed");
  assert.equal(failed.transcript.providers.grok.answerStartedAt, "2026-04-13T10:02:00.000Z");
  assert.equal(failed.transcript.providers.grok.answerCompletedAt, "2026-04-13T10:02:12.000Z");
  assert.equal(failed.transcript.providers.grok.lastStatusAt, "2026-04-13T10:02:12.000Z");
});

test("handleSessionTranscriptLiveStatus updates the matching managed session by window and provider", async () => {
  const { createSessionRecord, updateChildSessionRecord } = require("../../session/session-model.js");
  const baseSession = createSessionRecord({
    sessionId: "sess_runtime_status",
    providers: ["deepseek", "gemini"],
    now: "2026-04-13T10:00:00.000Z"
  });
  const withWindow = {
    ...baseSession,
    windowId: 44,
    childSessions: {
      ...baseSession.childSessions,
      deepseek: updateChildSessionRecord(baseSession, "deepseek", {
        tabId: 8,
        url: "https://chat.deepseek.com/",
        title: "DeepSeek",
        lastActiveAt: "2026-04-13T10:00:00.000Z",
        recoverable: true
      }).childSessions.deepseek
    }
  };

  const chromeStub = createChromeStub({
    "multi-ai-sessions": [withWindow]
  });
  const { background, constants } = loadBackgroundWithStubs(chromeStub);

  const result = await background.handleSessionTranscriptLiveStatus({
    type: "session:transcript-live-status",
    provider: "deepseek",
    status: "responding",
    occurredAt: "2026-04-13T10:03:00.000Z"
  }, {
    tab: {
      id: 8,
      windowId: 44
    }
  });

  assert.equal(result.ok, true);
  const storedSessions = chromeStub.__store[constants.SESSION_STORAGE_KEY];
  assert.equal(storedSessions[0].transcript.providers.deepseek.status, "responding");
  assert.equal(storedSessions[0].transcript.providers.deepseek.answerStartedAt, "2026-04-13T10:03:00.000Z");
});

test("handleSessionTranscriptProviderTurn records manual user and assistant turns with minimal dedupe and merge", async () => {
  const { createSessionRecord, updateChildSessionRecord } = require("../../session/session-model.js");
  const { ensureSessionTranscript } = require("../../session/transcript-store.js");
  const baseSession = ensureSessionTranscript(createSessionRecord({
    sessionId: "sess_manual_turn_capture",
    providers: ["deepseek", "gemini"],
    now: "2026-04-13T12:00:00.000Z"
  }));
  const withWindow = {
    ...baseSession,
    windowId: 52,
    childSessions: {
      ...baseSession.childSessions,
      deepseek: updateChildSessionRecord(baseSession, "deepseek", {
        tabId: 21,
        url: "https://chat.deepseek.com/",
        title: "DeepSeek",
        lastActiveAt: "2026-04-13T12:00:00.000Z",
        recoverable: true
      }).childSessions.deepseek
    }
  };

  const chromeStub = createChromeStub({
    "multi-ai-sessions": [withWindow]
  });
  const { background, constants } = loadBackgroundWithStubs(chromeStub);
  const sender = {
    tab: {
      id: 21,
      windowId: 52
    }
  };

  const manualUser = await background.handleSessionTranscriptProviderTurn({
    type: "session:transcript-provider-turn",
    provider: "deepseek",
    role: "user",
    content: "Manual follow-up question",
    occurredAt: "2026-04-13T12:01:00.000Z"
  }, sender);
  assert.equal(manualUser.ok, true);

  const duplicateUser = await background.handleSessionTranscriptProviderTurn({
    type: "session:transcript-provider-turn",
    provider: "deepseek",
    role: "user",
    content: "Manual follow-up question",
    occurredAt: "2026-04-13T12:01:05.000Z"
  }, sender);
  assert.equal(duplicateUser.ok, true);

  const assistantPartial = await background.handleSessionTranscriptProviderTurn({
    type: "session:transcript-provider-turn",
    provider: "deepseek",
    role: "assistant",
    content: "First sentence.",
    occurredAt: "2026-04-13T12:01:20.000Z"
  }, sender);
  assert.equal(assistantPartial.ok, true);

  const assistantExpanded = await background.handleSessionTranscriptProviderTurn({
    type: "session:transcript-provider-turn",
    provider: "deepseek",
    role: "assistant",
    content: "First sentence. Second sentence.",
    occurredAt: "2026-04-13T12:01:24.000Z"
  }, sender);
  assert.equal(assistantExpanded.ok, true);

  const storedSessions = chromeStub.__store[constants.SESSION_STORAGE_KEY];
  const turns = storedSessions[0].transcript.providers.deepseek.turns;

  assert.equal(turns.length, 2);
  assert.equal(turns[0].role, "user");
  assert.equal(turns[0].content, "Manual follow-up question");
  assert.equal(turns[1].role, "assistant");
  assert.equal(turns[1].content, "First sentence. Second sentence.");
});
