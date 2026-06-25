/**
 * Unit tests for favicon-cache.js — favicon URL building and preloading
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Load favicon-cache.js in a sandboxed context with mock globals
 */
function loadFaviconCache(mocks = {}) {
  const imageInstances = [];

  const mockImage = function () {
    const instance = {
      src: "",
      onload: null,
      onerror: null,
      setSrc(url) {
        this.src = url;
        // Auto-trigger onload after a tick
        if (this.onload) {
          setTimeout(() => this.onload(), 0);
        }
      }
    };
    // Setter for src that triggers load
    Object.defineProperty(instance, "src", {
      get() { return instance._src || ""; },
      set(value) {
        instance._src = value;
        if (instance.onload) {
          setTimeout(() => instance.onload(), 0);
        }
      }
    });
    imageInstances.push(instance);
    return instance;
  };

  const defaultMocks = {
    Image: mockImage,
    Array,
    Set,
    Promise,
    Boolean,
    setTimeout: global.setTimeout
  };

  const context = { ...defaultMocks, ...mocks };
  context.globalThis = context;

  const code = require("fs").readFileSync(
    require("path").resolve(process.cwd(), "favicon-cache.js"),
    "utf8"
  );

  vm.runInContext(code, vm.createContext(context));

  return {
    api: context.FaviconCache,
    context,
    imageInstances
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("favicon-cache.js", () => {

  describe("getFaviconUrl", () => {
    it("returns Google Favicon API URL for known provider", () => {
      const { api } = loadFaviconCache();
      const url = api.getFaviconUrl("chatgpt");
      assert.ok(url.includes("google.com/s2/favicons"));
      assert.ok(url.includes("chatgpt.com"));
      assert.ok(url.includes("sz=32"));
    });

    it("returns empty string for unknown provider", () => {
      const { api } = loadFaviconCache();
      const url = api.getFaviconUrl("nonexistent");
      assert.equal(url, "");
    });

    it("handles all 13 known providers", () => {
      const { api } = loadFaviconCache();
      const knownProviders = [
        "chatgpt", "claude", "grok", "gemini", "copilot",
        "doubao", "kimi", "deepseek", "tongyi", "yuanbao",
        "zhipu", "you", "ima"
      ];
      knownProviders.forEach((id) => {
        const url = api.getFaviconUrl(id);
        assert.ok(url.length > 0, `${id} should have favicon URL`);
        assert.ok(url.includes("google.com/s2/favicons"), `${id} URL should use Google API`);
      });
    });

    it("includes correct domain for deepseek", () => {
      const { api } = loadFaviconCache();
      const url = api.getFaviconUrl("deepseek");
      assert.ok(url.includes("chat.deepseek.com"));
    });

    it("includes correct domain for grok", () => {
      const { api } = loadFaviconCache();
      const url = api.getFaviconUrl("grok");
      assert.ok(url.includes("grok.com"));
    });
  });

  describe("getFaviconSrc", () => {
    it("returns same URL as getFaviconUrl", () => {
      const { api } = loadFaviconCache();
      const urlA = api.getFaviconUrl("claude");
      const urlB = api.getFaviconSrc("claude");
      assert.equal(urlA, urlB);
    });

    it("returns empty string for unknown provider", () => {
      const { api } = loadFaviconCache();
      const src = api.getFaviconSrc("unknown");
      assert.equal(src, "");
    });
  });

  describe("preloadFavicons", () => {
    it("returns immediately when providerIds is empty array", async () => {
      const { api } = loadFaviconCache();
      await api.preloadFavicons([]);
      // Should not throw
    });

    it("returns immediately when providerIds is not an array", async () => {
      const { api } = loadFaviconCache();
      await api.preloadFavicons(null);
      await api.preloadFavicons(undefined);
      await api.preloadFavicons("not-an-array");
      // Should not throw
    });

    it("creates Image instances for valid providers", async () => {
      const { api, imageInstances } = loadFaviconCache();
      await api.preloadFavicons(["chatgpt", "claude"]);
      assert.equal(imageInstances.length, 2);
      assert.ok(imageInstances[0].src.includes("chatgpt.com"));
      assert.ok(imageInstances[1].src.includes("claude.ai"));
    });

    it("deduplicates provider IDs", async () => {
      const { api, imageInstances } = loadFaviconCache();
      await api.preloadFavicons(["chatgpt", "chatgpt", "claude"]);
      assert.equal(imageInstances.length, 2);
    });

    it("filters out unknown providers", async () => {
      const { api, imageInstances } = loadFaviconCache();
      await api.preloadFavicons(["chatgpt", "nonexistent", "claude"]);
      assert.equal(imageInstances.length, 2);
      assert.ok(imageInstances.every(img => img.src.length > 0));
    });

    it("waits for all images to load", async () => {
      const { api, imageInstances } = loadFaviconCache();
      const promise = api.preloadFavicons(["chatgpt", "claude", "grok"]);
      // Images should be created before promise resolves
      await new Promise(r => setTimeout(r, 10));
      assert.equal(imageInstances.length, 3);
      await promise;
    });

    it("handles image load errors gracefully", async () => {
      const mockImageWithError = function () {
        const instance = {
          src: "",
          onload: null,
          onerror: null
        };
        Object.defineProperty(instance, "src", {
          get() { return instance._src || ""; },
          set(value) {
            instance._src = value;
            // Trigger onerror instead of onload
            if (instance.onerror) {
              setTimeout(() => instance.onerror(), 0);
            }
          }
        });
        return instance;
      };

      const { api } = loadFaviconCache({ Image: mockImageWithError });
      // Should not throw even when images fail to load
      await api.preloadFavicons(["chatgpt", "claude"]);
    });

    it("handles empty providerIds gracefully", async () => {
      const { api } = loadFaviconCache();
      await api.preloadFavicons([]);
      // Should complete without error
    });

    it("preloads all 13 providers without error", async () => {
      const { api, imageInstances } = loadFaviconCache();
      const allProviders = [
        "chatgpt", "claude", "grok", "gemini", "copilot",
        "doubao", "kimi", "deepseek", "tongyi", "yuanbao",
        "zhipu", "you", "ima"
      ];
      await api.preloadFavicons(allProviders);
      assert.equal(imageInstances.length, 13);
      imageInstances.forEach((img, index) => {
        assert.ok(img.src.length > 0, `Image ${index} should have src`);
        assert.ok(img.src.includes("google.com/s2/favicons"), `Image ${index} should use Google API`);
      });
    });
  });

  describe("API surface", () => {
    it("exposes getFaviconUrl, getFaviconSrc, and preloadFavicons", () => {
      const { api } = loadFaviconCache();
      assert.ok(typeof api.getFaviconUrl === "function");
      assert.ok(typeof api.getFaviconSrc === "function");
      assert.ok(typeof api.preloadFavicons === "function");
    });

    it("does not expose internal PROVIDER_HOSTS", () => {
      const { api } = loadFaviconCache();
      assert.equal(api.PROVIDER_HOSTS, undefined);
    });

    it("does not expose internal API_TEMPLATE", () => {
      const { api } = loadFaviconCache();
      assert.equal(api.API_TEMPLATE, undefined);
    });
  });

});
