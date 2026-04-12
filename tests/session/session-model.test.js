const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSessionRecord,
  updateChildSessionRecord
} = require("../../session/session-model.js");

test("createSessionRecord creates a recoverable session shell", () => {
  const session = createSessionRecord({
    sessionId: "sess_1",
    providers: ["deepseek", "gemini", "grok"],
    mode: "foreground",
    now: "2026-04-12T10:00:00.000Z"
  });

  assert.equal(session.sessionId, "sess_1");
  assert.equal(session.status, "active");
  assert.equal(session.providers.length, 3);
  assert.equal(session.childSessions.deepseek.recoverable, false);
});

test("updateChildSessionRecord stores url title and recoverable flag", () => {
  const session = createSessionRecord({
    sessionId: "sess_2",
    providers: ["deepseek"],
    mode: "background",
    now: "2026-04-12T10:00:00.000Z"
  });

  const updated = updateChildSessionRecord(session, "deepseek", {
    tabId: 200,
    url: "https://chat.deepseek.com/a/chat/demo",
    title: "DeepSeek Demo",
    lastActiveAt: "2026-04-12T10:01:00.000Z",
    recoverable: true
  });

  assert.equal(updated.childSessions.deepseek.url, "https://chat.deepseek.com/a/chat/demo");
  assert.equal(updated.childSessions.deepseek.title, "DeepSeek Demo");
  assert.equal(updated.childSessions.deepseek.recoverable, true);
});
