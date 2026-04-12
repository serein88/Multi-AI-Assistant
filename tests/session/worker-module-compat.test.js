const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT_DIR = path.resolve(__dirname, "../..");

function runScriptInWorkerContext(relativePath, context) {
  const absolutePath = path.join(ROOT_DIR, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  vm.runInContext(source, context, { filename: relativePath });
}

test("session scripts can be loaded sequentially in a shared worker context", () => {
  const context = vm.createContext({
    console,
    URL,
    globalThis: null
  });
  context.globalThis = context;

  runScriptInWorkerContext("providers.js", context);
  runScriptInWorkerContext("session/session-constants.js", context);
  runScriptInWorkerContext("session/session-model.js", context);
  runScriptInWorkerContext("session/session-registry.js", context);
  runScriptInWorkerContext("session/provider-session-bindings.js", context);
  runScriptInWorkerContext("session/window-manager.js", context);

  assert.ok(context.MultiAISessionConstants);
  assert.ok(context.MultiAISessionModel);
  assert.ok(context.MultiAISessionRegistry);
  assert.ok(context.MultiAISessionProviderBindings);
  assert.ok(context.MultiAISessionWindowManager);
});
