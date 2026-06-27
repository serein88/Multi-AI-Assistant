// tests/content/shadow-dom-traversal.test.js
// Tests for Shadow DOM traversal whitelist in content/send-handlers.js

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// ---- Minimal DOM mocks for IIFE load ----
const savedGlobals = {};
function ensureGlobal(key, value) {
  if (!(key in globalThis)) {
    savedGlobals[key] = undefined;
    globalThis[key] = value;
  }
}

function setupMinimalDOM() {
  ensureGlobal("window", {
    getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
    HTMLTextAreaElement: { prototype: {} },
    HTMLInputElement: { prototype: {} },
    parent: null,
  });
  ensureGlobal("document", {
    createTreeWalker: () => ({ nextNode: () => false }),
    querySelector: () => null,
    querySelectorAll: () => [],
    createRange: () => ({}),
    body: null,
    execCommand: () => true,
  });
  ensureGlobal("NodeFilter", { SHOW_ELEMENT: 1 });
  ensureGlobal("chrome", { runtime: { sendMessage: () => Promise.resolve(null) } });
  ensureGlobal("MutationObserver", class { observe() {} disconnect() {} });
  ensureGlobal("requestAnimationFrame", (cb) => setTimeout(cb, 0));
}

function loadModule() {
  setupMinimalDOM();
  require(join(__dirname, "../../content/send-handlers.js"));
  return globalThis.__MAI_Send;
}

// ---- Mock DOM builders ----
function createMockWalker(nodes) {
  let idx = -1;
  return {
    nextNode() {
      idx++;
      return idx < nodes.length;
    },
    get currentNode() { return nodes[idx]; }
  };
}

function makeNode(options = {}) {
  return {
    tagName: options.tagName || "DIV",
    shadowRoot: options.shadowRoot || null,
    id: options.id || "",
    className: options.className || "",
    _attrs: options.attrs || {},
    getAttribute(name) { return this._attrs[name] || null; },
    querySelectorAll: options.querySelectorAll || (() => [])
  };
}

function makeShadowRoot(queryAll) {
  return { querySelectorAll: queryAll || (() => []) };
}

function overrideDocument(doc, nodesForRoot) {
  const origCreateTreeWalker = doc.createTreeWalker.bind(doc);
  // nodesForRoot can be an array (used for all roots) or a function(root) => nodes
  const resolveNodes = typeof nodesForRoot === "function"
    ? nodesForRoot
    : () => nodesForRoot;
  doc.createTreeWalker = (_root) => createMockWalker(resolveNodes(_root));
  return () => { doc.createTreeWalker = origCreateTreeWalker; };
}

describe("T-021 Shadow DOM traversal policy", () => {
  let mod;
  before(() => { mod = loadModule(); });

  // ---- shouldTraverseShadowHost unit tests ----

  describe("shouldTraverseShadowHost", () => {
    it("returns false for null/undefined host", () => {
      assert.equal(mod.shouldTraverseShadowHost(null), false);
      assert.equal(mod.shouldTraverseShadowHost(undefined), false);
    });

    it("returns false for standard HTML elements (no hyphen in tag)", () => {
      assert.equal(mod.shouldTraverseShadowHost(makeNode({ tagName: "DIV" })), false);
      assert.equal(mod.shouldTraverseShadowHost(makeNode({ tagName: "SPAN" })), false);
      assert.equal(mod.shouldTraverseShadowHost(makeNode({ tagName: "BUTTON" })), false);
    });

    it("returns false for unknown custom elements", () => {
      assert.equal(mod.shouldTraverseShadowHost(makeNode({ tagName: "X-WIDGET" })), false);
      assert.equal(mod.shouldTraverseShadowHost(makeNode({ tagName: "MY-COMPONENT" })), false);
    });

    it("returns true for AI-related custom elements", () => {
      assert.equal(mod.shouldTraverseShadowHost(makeNode({ tagName: "GROK-INPUT" })), true);
      assert.equal(mod.shouldTraverseShadowHost(makeNode({ tagName: "KIMI-CHAT" })), true);
      assert.equal(mod.shouldTraverseShadowHost(makeNode({ tagName: "COPILOT-EDITOR" })), true);
    });

    it("returns true for allowlisted class/id patterns", () => {
      assert.equal(mod.shouldTraverseShadowHost(
        makeNode({ tagName: "X-BOX", className: "chat-input-container" })), true);
      assert.equal(mod.shouldTraverseShadowHost(
        makeNode({ tagName: "X-BOX", id: "lexical-editor-root" })), true);
      assert.equal(mod.shouldTraverseShadowHost(
        makeNode({ tagName: "X-BOX", attrs: { "data-testid": "composer-input" } })), true);
      assert.equal(mod.shouldTraverseShadowHost(
        makeNode({ tagName: "X-BOX", attrs: { role: "textbox" } })), true);
      assert.equal(mod.shouldTraverseShadowHost(
        makeNode({ tagName: "X-BOX", attrs: { "aria-label": "message input area" } })), true);
    });
  });

  // ---- isSensitiveShadowHost unit tests ----

  describe("isSensitiveShadowHost", () => {
    it("returns false for null/undefined", () => {
      assert.equal(mod.isSensitiveShadowHost(null), false);
      assert.equal(mod.isSensitiveShadowHost(undefined), false);
    });

    it("detects password input type", () => {
      assert.equal(mod.isSensitiveShadowHost(
        makeNode({ tagName: "INPUT", attrs: { type: "password" } })), true);
    });

    it("detects hidden input type", () => {
      assert.equal(mod.isSensitiveShadowHost(
        makeNode({ tagName: "INPUT", attrs: { type: "hidden" } })), true);
    });

    it("detects password manager class names", () => {
      assert.equal(mod.isSensitiveShadowHost(
        makeNode({ tagName: "DIV", className: "bitwarden-container" })), true);
      assert.equal(mod.isSensitiveShadowHost(
        makeNode({ tagName: "DIV", className: "one-password-fill" })), true);
      assert.equal(mod.isSensitiveShadowHost(
        makeNode({ tagName: "DIV", className: "lastpass-menu" })), true);
      assert.equal(mod.isSensitiveShadowHost(
        makeNode({ tagName: "DIV", className: "dashlane-autofill" })), true);
    });

    it("detects payment/auth/otp patterns", () => {
      assert.equal(mod.isSensitiveShadowHost(
        makeNode({ tagName: "DIV", id: "payment-form" })), true);
      assert.equal(mod.isSensitiveShadowHost(
        makeNode({ tagName: "DIV", id: "auth-widget" })), true);
      assert.equal(mod.isSensitiveShadowHost(
        makeNode({ tagName: "DIV", attrs: { "data-testid": "otp-input" } })), true);
      assert.equal(mod.isSensitiveShadowHost(
        makeNode({ tagName: "DIV", className: "2fa-verify" })), true);
      assert.equal(mod.isSensitiveShadowHost(
        makeNode({ tagName: "DIV", className: "mfa-container" })), true);
    });

    it("does not falsely flag AI components", () => {
      assert.equal(mod.isSensitiveShadowHost(
        makeNode({ tagName: "DIV", className: "chat-input" })), false);
      assert.equal(mod.isSensitiveShadowHost(
        makeNode({ tagName: "DIV", id: "composer-editor" })), false);
      assert.equal(mod.isSensitiveShadowHost(
        makeNode({ tagName: "GROK-INPUT" })), false);
    });
  });

  // ---- deepQueryAll integration tests ----

  describe("deepQueryAll with traversal policy", () => {

    it("returns light DOM matches (no shadow involved)", () => {
      const textarea = makeNode({ tagName: "TEXTAREA" });
      const root = makeNode({
        tagName: "DIV",
        querySelectorAll: (sel) => sel === ".input" ? [textarea] : []
      });

      const doc = globalThis.document;
      const restore = overrideDocument(doc, []);
      const results = mod.deepQueryAll(root, ".input");
      restore();

      assert.equal(results.length, 1);
      assert.equal(results[0], textarea);
    });

    it("traverses allowed AI component shadow DOM", () => {
      const textbox = makeNode({ tagName: "TEXTAREA" });
      const shadowRoot = makeShadowRoot((sel) => sel === "textarea" ? [textbox] : []);
      const host = makeNode({ tagName: "GROK-INPUT", shadowRoot });
      const root = makeNode({ tagName: "BODY", querySelectorAll: () => [] });

      const doc = globalThis.document;
      // root walker returns host; shadowRoot walker returns nothing
      const restore = overrideDocument(doc, (walkerRoot) =>
        walkerRoot === root ? [host] : []
      );
      const results = mod.deepQueryAll(root, "textarea");
      restore();

      assert.equal(results.length, 1);
      assert.equal(results[0], textbox);
    });

    it("rejects sensitive shadow host (password manager)", () => {
      const input = makeNode({ tagName: "INPUT" });
      const shadowRoot = makeShadowRoot((sel) => sel === "input" ? [input] : []);
      const host = makeNode({ tagName: "BITWARDEN-POPUP", shadowRoot });
      const root = makeNode({ tagName: "BODY", querySelectorAll: () => [] });

      const doc = globalThis.document;
      const restore = overrideDocument(doc, [host]);
      const results = mod.deepQueryAll(root, "input");
      restore();

      assert.equal(results.length, 0);
    });

    it("rejects standard HTML element shadow host (not a custom element)", () => {
      const textbox = makeNode({ tagName: "TEXTAREA" });
      const shadowRoot = makeShadowRoot((sel) => sel === "textarea" ? [textbox] : []);
      const host = makeNode({ tagName: "DIV", shadowRoot }); // standard element, no hyphen
      const root = makeNode({ tagName: "BODY", querySelectorAll: () => [] });

      const doc = globalThis.document;
      const restore = overrideDocument(doc, [host]);
      const results = mod.deepQueryAll(root, "textarea");
      restore();

      assert.equal(results.length, 0);
    });

    it("rejects unknown custom element without allowlist match", () => {
      const textbox = makeNode({ tagName: "TEXTAREA" });
      const shadowRoot = makeShadowRoot((sel) => sel === "textarea" ? [textbox] : []);
      const host = makeNode({ tagName: "X-UNKNOWN-WIDGET", shadowRoot });
      const root = makeNode({ tagName: "BODY", querySelectorAll: () => [] });

      const doc = globalThis.document;
      const restore = overrideDocument(doc, [host]);
      const results = mod.deepQueryAll(root, "textarea");
      restore();

      assert.equal(results.length, 0);
    });

    it("allows standard HTML element with allowlist attribute (chat-input-container)", () => {
      const textbox = makeNode({ tagName: "TEXTAREA" });
      const shadowRoot = makeShadowRoot((sel) => sel === "textarea" ? [textbox] : []);
      const host = makeNode({ tagName: "DIV", className: "chat-input-container", shadowRoot });
      const root = makeNode({ tagName: "BODY", querySelectorAll: () => [] });

      const doc = globalThis.document;
      const restore = overrideDocument(doc, (walkerRoot) =>
        walkerRoot === root ? [host] : []
      );
      const results = mod.deepQueryAll(root, "textarea");
      restore();

      assert.equal(results.length, 1);
      assert.equal(results[0], textbox);
    });

    it("allows standard HTML element with allowlist data-testid (composer-input)", () => {
      const textbox = makeNode({ tagName: "TEXTAREA" });
      const shadowRoot = makeShadowRoot((sel) => sel === "textarea" ? [textbox] : []);
      const host = makeNode({ tagName: "DIV", attrs: { "data-testid": "composer-input" }, shadowRoot });
      const root = makeNode({ tagName: "BODY", querySelectorAll: () => [] });

      const doc = globalThis.document;
      const restore = overrideDocument(doc, (walkerRoot) =>
        walkerRoot === root ? [host] : []
      );
      const results = mod.deepQueryAll(root, "textarea");
      restore();

      assert.equal(results.length, 1);
      assert.equal(results[0], textbox);
    });

    it("Kimi send container shadow DOM is traversed", () => {
      const btn = makeNode({ tagName: "BUTTON" });
      const shadowRoot = makeShadowRoot((sel) => sel === "button" ? [btn] : []);
      const host = makeNode({
        tagName: "X-CONTAINER",
        className: "send-button-container",
        shadowRoot
      });
      const root = makeNode({ tagName: "BODY", querySelectorAll: () => [] });

      const doc = globalThis.document;
      const restore = overrideDocument(doc, (walkerRoot) =>
        walkerRoot === root ? [host] : []
      );
      const results = mod.deepQueryAll(root, "button");
      restore();

      assert.equal(results.length, 1);
      assert.equal(results[0], btn);
    });

    it("Copilot chat-input shadow DOM is traversed", () => {
      const textbox = makeNode({ tagName: "DIV" });
      const shadowRoot = makeShadowRoot((sel) => sel === "[role='textbox']" ? [textbox] : []);
      const host = makeNode({
        tagName: "COPILOT-CHAT",
        className: "chat-input-wrapper",
        shadowRoot
      });
      const root = makeNode({ tagName: "BODY", querySelectorAll: () => [] });

      const doc = globalThis.document;
      const restore = overrideDocument(doc, (walkerRoot) =>
        walkerRoot === root ? [host] : []
      );
      const results = mod.deepQueryAll(root, "[role='textbox']");
      restore();

      assert.equal(results.length, 1);
      assert.equal(results[0], textbox);
    });

    it("Lexical editor inside custom element is traversed", () => {
      const editor = makeNode({ tagName: "DIV" });
      const shadowRoot = makeShadowRoot((sel) => sel === ".editor" ? [editor] : []);
      const host = makeNode({
        tagName: "RICH-TEXT-EDITOR",
        attrs: { "data-testid": "composer-input" },
        shadowRoot
      });
      const root = makeNode({ tagName: "BODY", querySelectorAll: () => [] });

      const doc = globalThis.document;
      const restore = overrideDocument(doc, (walkerRoot) =>
        walkerRoot === root ? [host] : []
      );
      const results = mod.deepQueryAll(root, ".editor");
      restore();

      assert.equal(results.length, 1);
      assert.equal(results[0], editor);
    });
  });

  // ---- Export verification ----

  describe("globalThis.__MAI_Send exports", () => {
    it("exposes shouldTraverseShadowHost", () => {
      assert.equal(typeof mod.shouldTraverseShadowHost, "function");
    });

    it("exposes isSensitiveShadowHost", () => {
      assert.equal(typeof mod.isSensitiveShadowHost, "function");
    });

    it("exposes SHADOW_DENY_PATTERNS array", () => {
      assert.ok(Array.isArray(mod.SHADOW_DENY_PATTERNS));
      assert.ok(mod.SHADOW_DENY_PATTERNS.length > 0);
    });

    it("exposes SHADOW_ALLOW_PATTERNS array", () => {
      assert.ok(Array.isArray(mod.SHADOW_ALLOW_PATTERNS));
      assert.ok(mod.SHADOW_ALLOW_PATTERNS.length > 0);
    });
  });
});
