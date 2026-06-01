(function initResponseState(root) {
  function normalizeText(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function shouldUseGenericResponseStartSignals(provider) {
    return provider !== "deepseek" && provider !== "grok";
  }

  function getProviderStabilityMs(provider) {
    if (provider === "deepseek") return 1000;
    if (provider === "grok") return 5000;
    return 1200;
  }

  function createResponseStabilityTracker(options = {}) {
    const provider = options.provider || "";
    const baselineText = normalizeText(options.baselineText);
    const baselineResponseCount = Number(options.baselineResponseCount) || 0;
    const stabilityMs = Number(options.stabilityMs) || 1200;
    const requireNewResponse = provider === "deepseek";
    let observedNewResponse = !requireNewResponse;
    let lastStableResponse = "";
    let lastStableResponseAt = 0;

    return {
      check(sample = {}) {
        const text = normalizeText(sample.text);
        const responseCount = Number(sample.responseCount) || 0;
        const now = Number(sample.now) || Date.now();
        const streaming = sample.streaming === true;

        if (!text) {
          return { complete: false, reason: "empty" };
        }

        if (!observedNewResponse) {
          if (text === baselineText && responseCount <= baselineResponseCount) {
            return { complete: false, reason: "baseline" };
          }
          observedNewResponse = true;
        }

        if (text !== lastStableResponse) {
          lastStableResponse = text;
          lastStableResponseAt = now;
          return { complete: false, reason: "changed" };
        }

        if (lastStableResponseAt > 0 && !streaming) {
          const elapsed = now - lastStableResponseAt;
          if (elapsed >= stabilityMs) {
            return { complete: true, reason: "stable", elapsed };
          }
        }

        return { complete: false, reason: "waiting" };
      }
    };
  }

  const api = {
    createResponseStabilityTracker,
    getProviderStabilityMs,
    shouldUseGenericResponseStartSignals
  };

  root.MultiAIResponseState = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
