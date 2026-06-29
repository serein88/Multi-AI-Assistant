/**
 * Guard tests: content script injection chain constraints
 *
 * Ensures response-state.js is injected before content.js in manifest.json
 * and that content.js does not contain inline duplicate logic.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const contentJs = fs.readFileSync(path.join(ROOT, "content/content.js"), "utf8");

test("manifest.json content_scripts includes content/response-state.js", () => {
  const scripts = manifest.content_scripts[0].js;
  assert.ok(
    scripts.includes("content/response-state.js"),
    "content/response-state.js must be declared in manifest.json content_scripts[0].js"
  );
});

test("content/response-state.js is injected before content/content.js in manifest", () => {
  const scripts = manifest.content_scripts[0].js;
  const rsIdx = scripts.indexOf("content/response-state.js");
  const contentIdx = scripts.indexOf("content/content.js");
  assert.ok(rsIdx >= 0, "content/response-state.js not found in manifest");
  assert.ok(contentIdx >= 0, "content/content.js not found in manifest");
  assert.ok(
    rsIdx < contentIdx,
    `content/response-state.js (index ${rsIdx}) must come before content/content.js (index ${contentIdx})`
  );
});

test("content/content.js does not contain _inlineResponseState", () => {
  assert.ok(
    !contentJs.includes("_inlineResponseState"),
    "content/content.js must not contain _inlineResponseState — response-state.js is now injected via manifest"
  );
});

test("content/content.js does not contain misleading Chrome caching comment", () => {
  assert.ok(
    !contentJs.includes("Chrome caching"),
    "content/content.js must not reference Chrome caching as explanation for inline response-state"
  );
});

test("content/response-state.js sets globalThis.MultiAIResponseState", () => {
  const rsSource = fs.readFileSync(path.join(ROOT, "content/response-state.js"), "utf8");
  assert.ok(
    rsSource.includes("MultiAIResponseState"),
    "content/response-state.js must set globalThis.MultiAIResponseState"
  );
});

test("content/response-detection.js reads textStableMs from MultiAIResponseState", () => {
  const rdSource = fs.readFileSync(path.join(ROOT, "content/response-detection.js"), "utf8");
  assert.ok(
    rdSource.includes("MultiAIResponseState"),
    "response-detection.js must reference MultiAIResponseState for stability threshold"
  );
  assert.ok(
    rdSource.includes("getProviderStabilityMs"),
    "response-detection.js must call getProviderStabilityMs to read threshold"
  );
});

test("content/content.js does not contain dead response-state wrapper functions", () => {
  assert.ok(
    !contentJs.includes("function getResponseStateApi"),
    "content.js must not define getResponseStateApi — response-detection.js reads MultiAIResponseState directly"
  );
  assert.ok(
    !contentJs.includes("function getProviderStabilityMs"),
    "content.js must not define getProviderStabilityMs wrapper — dead code removed"
  );
  assert.ok(
    !contentJs.includes("function shouldUseGenericResponseStartSignals"),
    "content.js must not define shouldUseGenericResponseStartSignals wrapper — dead code removed"
  );
});

// ─── run_at: document_start tests ──────────────────────────────────────────────

test("manifest.json content_scripts[0].run_at is document_start", () => {
  assert.strictEqual(
    manifest.content_scripts[0].run_at,
    "document_start",
    "content_scripts[0] must have run_at: document_start to avoid missing early DOM events"
  );
});

test("content/constants.js is the first injected script", () => {
  const scripts = manifest.content_scripts[0].js;
  assert.strictEqual(
    scripts[0],
    "content/constants.js",
    "constants.js must be first — other scripts depend on globalThis.MultiAIContentConstants"
  );
});

test("injection order preserves dependency chain", () => {
  const scripts = manifest.content_scripts[0].js;
  const requiredOrder = [
    "content/constants.js",
    "content/runtime-messaging.js",
    "content/provider-configs.js",
    "content/send-handlers.js",
    "content/response-state.js",
    "content/response-detection.js",
    "content/transcript-capture.js",
    "content/session-sync.js",
    "content/content.js"
  ];
  assert.deepStrictEqual(
    scripts,
    requiredOrder,
    "Script injection order must match dependency chain"
  );
});

test("content/response-state.js is injected before content/response-detection.js", () => {
  const scripts = manifest.content_scripts[0].js;
  const rsIdx = scripts.indexOf("content/response-state.js");
  const rdIdx = scripts.indexOf("content/response-detection.js");
  assert.ok(rsIdx >= 0 && rdIdx >= 0, "both response-state and response-detection must be present");
  assert.ok(
    rsIdx < rdIdx,
    `response-state.js (index ${rsIdx}) must come before response-detection.js (index ${rdIdx})`
  );
});

test("content/send-handlers.js is injected before content/transcript-capture.js", () => {
  const scripts = manifest.content_scripts[0].js;
  const shIdx = scripts.indexOf("content/send-handlers.js");
  const tcIdx = scripts.indexOf("content/transcript-capture.js");
  assert.ok(shIdx >= 0 && tcIdx >= 0, "both send-handlers and transcript-capture must be present");
  assert.ok(
    shIdx < tcIdx,
    `send-handlers.js (index ${shIdx}) must come before transcript-capture.js (index ${tcIdx})`
  );
});

test("no content script has top-level document.body/head access", () => {
  const scripts = manifest.content_scripts[0].js;
  const domAccessRe = /document\.(body|head)/g;

  /**
   * Strip function bodies and object blocks by tracking brace depth.
   * Static regression guard — does not replace human review for DOM safety.
   */
  function stripFunctionBodies(source) {
    let result = "";
    let depth = 0;
    let inString = false;
    let stringChar = "";
    let prev = "";
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (inString) {
        if (ch === stringChar && prev !== "\\") inString = false;
        prev = ch;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = true;
        stringChar = ch;
        prev = ch;
        continue;
      }
      if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        if (depth > 0) depth--;
      }
      if (depth === 0) result += ch;
      prev = ch;
    }
    return result;
  }

  for (const script of scripts) {
    const source = fs.readFileSync(path.join(ROOT, script), "utf8");
    const topLevelCode = stripFunctionBodies(source);
    const matches = topLevelCode.match(domAccessRe);
    assert.strictEqual(
      matches,
      null,
      `${script} has top-level document.body/head access — unsafe under document_start`
    );
  }
});
