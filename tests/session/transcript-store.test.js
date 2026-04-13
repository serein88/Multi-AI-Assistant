const test = require("node:test");
const assert = require("node:assert/strict");

function createChromeStub() {
  return {
    storage: {
      local: {
        async get() {
          return {};
        },
        async set() {
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

if (typeof global.chrome === "undefined") {
  global.chrome = createChromeStub();
}

const { createSessionRecord } = require("../../session/session-model.js");
const { ensureSessionTranscript } = require("../../background.js");

test("ensureSessionTranscript initializes transcript shell for new session", () => {
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

test("ensureSessionTranscript preserves existing transcript data and fills missing providers", () => {
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
          lastActiveAt: null
        }
      }
    }
  };

  const ensured = ensureSessionTranscript(seeded, "2026-04-12T10:06:00.000Z");

  assert.equal(ensured.transcript.timeline.length, 1);
  assert.equal(ensured.transcript.providers.deepseek.turns.length, 1);
  assert.ok(ensured.transcript.providers.grok);
  assert.equal(ensured.transcript.providers.grok.status, "idle");
});
