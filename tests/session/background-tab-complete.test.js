const test = require("node:test");
const assert = require("node:assert/strict");

const MODULE_PATHS = [
  "../../providers.js",
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

function resetGlobals() {
  delete global.PROVIDERS;
  delete global.PROVIDERS_BY_ID;
  delete global.MultiAISessionConstants;
  delete global.MultiAISessionModel;
  delete global.MultiAISessionRegistry;
  delete global.MultiAISessionProviderBindings;
  delete global.MultiAISessionTranscriptStore;
  delete global.MultiAISessionWindowManager;
}

function createChromeStub() {
  const updatedListeners = new Set();
  const sentMessages = [];
  const createdTabs = [];

  return {
    __updatedListeners: updatedListeners,
    __sentMessages: sentMessages,
    __createdTabs: createdTabs,
    storage: {
      local: {
        async get() { return {}; },
        async set() { return undefined; }
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
      async create(payload) {
        const tab = { id: createdTabs.length + 1, status: "loading", url: payload?.url || "" };
        createdTabs.push(tab);
        return tab;
      },
      onUpdated: {
        addListener(listener) {
          updatedListeners.add(listener);
        },
        removeListener(listener) {
          updatedListeners.delete(listener);
        }
      },
      async sendMessage(tabId, message) {
        sentMessages.push({ tabId, message });
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

function loadBackground(chromeStub) {
  clearModuleCache();
  resetGlobals();
  global.chrome = chromeStub;
  global.importScripts = () => undefined;

  const providers = require("../../providers.js");
  global.PROVIDERS = providers.PROVIDERS;
  global.PROVIDER_BY_ID = providers.PROVIDER_BY_ID;
  require("../../session/session-constants.js");
  require("../../session/session-model.js");
  require("../../session/session-registry.js");
  require("../../session/provider-session-bindings.js");
  require("../../session/transcript-store.js");
  require("../../session/window-manager.js");
  return require("../../background.js");
}

test.afterEach(() => {
  clearModuleCache();
  resetGlobals();
  delete global.chrome;
  delete global.importScripts;
});

test("waitForTabComplete resolves on matching complete update and removes listener", async () => {
  const chromeStub = createChromeStub();
  const background = loadBackground(chromeStub);

  const completed = background.waitForTabComplete(7, { timeoutMs: 50 });
  assert.equal(chromeStub.__updatedListeners.size, 1);

  for (const listener of chromeStub.__updatedListeners) {
    listener(8, { status: "complete" });
  }
  assert.equal(chromeStub.__updatedListeners.size, 1);

  for (const listener of chromeStub.__updatedListeners) {
    listener(7, { status: "complete" });
  }

  await completed;
  assert.equal(chromeStub.__updatedListeners.size, 0);
});

test("waitForTabComplete rejects on timeout and removes listener", async () => {
  const chromeStub = createChromeStub();
  const background = loadBackground(chromeStub);

  await assert.rejects(
    background.waitForTabComplete(9, { timeoutMs: 5 }),
    /tab-complete-timeout.*9/
  );
  assert.equal(chromeStub.__updatedListeners.size, 0);
});

test("sendPromptToProviderTab returns false when tab completion times out", async () => {
  const chromeStub = createChromeStub();
  const background = loadBackground(chromeStub);

  const result = await background.sendPromptToProviderTab("deepseek", "hello", { tabCompleteTimeoutMs: 5 });

  assert.equal(result, false);
  assert.deepEqual(chromeStub.__sentMessages, []);
});
