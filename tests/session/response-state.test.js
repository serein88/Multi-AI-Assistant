const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createResponseStabilityTracker,
  getProviderStabilityMs,
  shouldUseGenericResponseStartSignals
} = require("../../content/response-state.js");

test("deepseek does not use generic input-cleared or send-disabled start signals", () => {
  assert.equal(shouldUseGenericResponseStartSignals("deepseek"), false);
  assert.equal(shouldUseGenericResponseStartSignals("grok"), false);
  assert.equal(shouldUseGenericResponseStartSignals("gemini"), true);
});

test("deepseek completion stability threshold is 1.5 seconds", () => {
  assert.equal(getProviderStabilityMs("deepseek"), 1500);
  assert.equal(getProviderStabilityMs("grok"), 5000);
  assert.equal(getProviderStabilityMs("gemini"), 1200);
});

test("deepseek stability tracker ignores unchanged previous answer text", () => {
  const tracker = createResponseStabilityTracker({
    provider: "deepseek",
    baselineText: "上一轮回答",
    baselineResponseCount: 3,
    stabilityMs: 1500,
    now: 1000
  });

  // Same text as baseline — gate blocks
  assert.deepEqual(
    tracker.check({
      text: "上一轮回答",
      responseCount: 3,
      streaming: false,
      now: 10000
    }),
    { complete: false, reason: "baseline" }
  );

  // New text — gate opens, first check returns "changed"
  assert.equal(
    tracker.check({
      text: "新回答第一段",
      responseCount: 4,
      streaming: false,
      now: 11000
    }).complete,
    false
  );

  // Same text, but not yet stable (only 900ms elapsed)
  assert.deepEqual(
    tracker.check({
      text: "新回答第一段",
      responseCount: 4,
      streaming: false,
      now: 11900
    }),
    { complete: false, reason: "waiting" }
  );

  // Same text, now stable (1600ms elapsed >= 1500ms threshold)
  assert.deepEqual(
    tracker.check({
      text: "新回答第一段",
      responseCount: 4,
      streaming: false,
      now: 12600
    }),
    { complete: true, reason: "stable", elapsed: 1600 }
  );
});

test("deepseek gate does NOT open on response count increase alone (thinking phase)", () => {
  // Simulates: baseline captured before send, then thinking phase starts
  // (.ds-message appears, increasing count, but .ds-markdown text is still previous response)
  const tracker = createResponseStabilityTracker({
    provider: "deepseek",
    baselineText: "旧回答内容",
    baselineResponseCount: 3,
    stabilityMs: 1500,
    now: 1000
  });

  // Thinking phase: count increased (new .ds-message) but text is still baseline
  // Gate should BLOCK — this is the key fix for premature completion
  assert.deepEqual(
    tracker.check({
      text: "旧回答内容",
      responseCount: 4,
      streaming: false,
      now: 5000
    }),
    { complete: false, reason: "baseline" }
  );

  // Still baseline text, even higher count
  assert.deepEqual(
    tracker.check({
      text: "旧回答内容",
      responseCount: 5,
      streaming: false,
      now: 10000
    }),
    { complete: false, reason: "baseline" }
  );

  // Now the actual response text appears — gate opens
  assert.equal(
    tracker.check({
      text: "新回答开始生成",
      responseCount: 5,
      streaming: false,
      now: 15000
    }).complete,
    false
  );

  // Text stable for 1.5+ seconds — completion
  assert.deepEqual(
    tracker.check({
      text: "新回答开始生成",
      responseCount: 5,
      streaming: false,
      now: 16600
    }),
    { complete: true, reason: "stable", elapsed: 1600 }
  );
});
