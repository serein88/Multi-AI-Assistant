const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createWindowManager,
  normalizeWindowCreatePayload
} = require("../../session/window-manager.js");

test("createManagedSessionWindow opens a non-focused window in background mode", async () => {
  const calls = [];
  const chromeApi = {
    windows: {
      async create(payload) {
        calls.push(payload);
        return { id: 500 };
      }
    }
  };

  const manager = createWindowManager({ chromeApi });
  const result = await manager.createManagedSessionWindow({
    urls: ["https://chat.deepseek.com/", "https://gemini.google.com/", "https://grok.com/"],
    focused: false
  });

  assert.equal(result.id, 500);
  assert.equal(calls[0].focused, false);
});

test("createManagedSessionWindow forwards urls and focused truthy values", async () => {
  const calls = [];
  const chromeApi = {
    windows: {
      async create(payload) {
        calls.push(payload);
        return { id: 501 };
      }
    }
  };

  const manager = createWindowManager({ chromeApi });
  const urls = ["https://chat.deepseek.com/", "https://gemini.google.com/"];
  const result = await manager.createManagedSessionWindow({
    urls,
    focused: "yes"
  });

  assert.equal(result.id, 501);
  assert.deepEqual(calls[0].url, urls);
  assert.equal(calls[0].focused, true);
});

test("normalizeWindowCreatePayload coerces focused and defaults urls", () => {
  const payload = normalizeWindowCreatePayload({ focused: 1 });
  assert.deepEqual(payload.url, []);
  assert.equal(payload.focused, true);
});
