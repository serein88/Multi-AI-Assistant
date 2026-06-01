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

test("deepseek completion stability threshold is one second", () => {
  assert.equal(getProviderStabilityMs("deepseek"), 1000);
  assert.equal(getProviderStabilityMs("grok"), 5000);
  assert.equal(getProviderStabilityMs("gemini"), 1200);
});

test("deepseek stability tracker ignores unchanged previous answer text", () => {
  const tracker = createResponseStabilityTracker({
    provider: "deepseek",
    baselineText: "上一轮回答",
    baselineResponseCount: 3,
    stabilityMs: 1000,
    now: 1000
  });

  assert.deepEqual(
    tracker.check({
      text: "上一轮回答",
      responseCount: 3,
      streaming: false,
      now: 10000
    }),
    { complete: false, reason: "baseline" }
  );

  assert.equal(
    tracker.check({
      text: "新回答第一段",
      responseCount: 4,
      streaming: false,
      now: 11000
    }).complete,
    false
  );

  assert.deepEqual(
    tracker.check({
      text: "新回答第一段",
      responseCount: 4,
      streaming: false,
      now: 11900
    }),
    { complete: false, reason: "waiting" }
  );

  assert.deepEqual(
    tracker.check({
      text: "新回答第一段",
      responseCount: 4,
      streaming: false,
      now: 12100
    }),
    { complete: true, reason: "stable", elapsed: 1100 }
  );
});
