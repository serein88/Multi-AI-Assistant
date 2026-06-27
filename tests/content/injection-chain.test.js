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
