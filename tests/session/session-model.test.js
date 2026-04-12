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

test("createSessionRecord copies the provider list and initializes every child session to defaults", () => {
  const providers = ["deepseek", "grok"];
  const session = createSessionRecord({
    sessionId: "sess_copy",
    providers,
    now: "2026-04-12T10:00:00.000Z"
  });

  providers.push("gemini");
  assert.equal(session.providers.length, 2);
  const childSessions = session.childSessions;
  assert(childSessions.deepseek);
  assert.equal(childSessions.deepseek.tabId, null);
  assert.equal(childSessions.deepseek.url, "");
  assert.equal(childSessions.deepseek.title, "");
  assert.equal(childSessions.deepseek.recoverable, false);
});

test("createSessionRecord defaults mode to foreground when not provided", () => {
  const session = createSessionRecord({
    sessionId: "sess_default",
    providers: ["deepseek"],
    now: "2026-04-12T10:00:00.000Z"
  });

  assert.equal(session.mode, "foreground");
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

test("updateChildSessionRecord preserves the original session record", () => {
  const session = createSessionRecord({
    sessionId: "sess_immut",
    providers: ["deepseek"],
    now: "2026-04-12T10:00:00.000Z"
  });

  const updated = updateChildSessionRecord(session, "deepseek", {
    url: "https://example.com",
    recoverable: true
  });

  assert.equal(session.childSessions.deepseek.url, "");
  assert.equal(session.childSessions.deepseek.recoverable, false);
  assert.equal(updated.childSessions.deepseek.url, "https://example.com");
});

test("updateChildSessionRecord rejects unknown providers", () => {
  const session = createSessionRecord({
    sessionId: "sess_invalid",
    providers: ["deepseek"],
    now: "2026-04-12T10:00:00.000Z"
  });

  assert.throws(
    () => updateChildSessionRecord(session, "jabberwocky", {}),
    /provider/
  );
});

test("updateChildSessionRecord applies patch-lastActiveAt when provided", () => {
  const session = createSessionRecord({
    sessionId: "sess_last",
    providers: ["deepseek"],
    now: "2026-04-12T10:00:00.000Z"
  });

  const updated = updateChildSessionRecord(session, "deepseek", {
    lastActiveAt: "2026-04-12T10:02:00.000Z"
  });

  assert.equal(updated.lastActiveAt, "2026-04-12T10:02:00.000Z");
});
