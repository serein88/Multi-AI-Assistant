(function initResponseState(root) {
  console.log('[response-state.js] initResponseState called, root type:', typeof root);
  function normalizeText(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function shouldUseGenericResponseStartSignals(provider) {
    return provider !== "deepseek" && provider !== "grok";
  }

  function getProviderStabilityMs(provider) {
    if (provider === "deepseek") return 1500;
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
          // DeepSeek: only check text change, NOT response count.
          // countResponseNodes() includes .ds-message which appears during the
          // thinking phase (before .ds-markdown is created), causing the gate to
          // open prematurely while the text still reads the previous response.
          if (provider === "deepseek") {
            if (text === baselineText) {
              return { complete: false, reason: "baseline" };
            }
          } else {
            if (text === baselineText && responseCount <= baselineResponseCount) {
              return { complete: false, reason: "baseline" };
            }
          }
          console.log(`[DS-gate] opened: text="${text.substring(0, 50)}" baseline="${baselineText.substring(0, 50)}" count=${responseCount} baseline=${baselineResponseCount}`);
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
  console.log('[response-state.js] MultiAIResponseState set, deepseekMs:', api.getProviderStabilityMs('deepseek'));

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
