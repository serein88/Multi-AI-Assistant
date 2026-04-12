const test = require("node:test");
const assert = require("node:assert/strict");
const { createWindowManager } = require("../../session/window-manager.js");

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
