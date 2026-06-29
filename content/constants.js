/**
 * Shared constants for content scripts.
 *
 * Single source of truth for timeouts, intervals, and thresholds used
 * across content/*.js modules. Loaded before all other content scripts
 * via manifest.json content_scripts injection order.
 *
 * Exposes: globalThis.MultiAIContentConstants (frozen)
 * Also:   module.exports (for Node.js tests)
 */
(function initContentConstants(root) {
  "use strict";

  var C = {

    // ── content/content.js ──────────────────────────────────────────

    /** Max wait for provider-configs readyPromise before giving up. */
    CONFIG_READY_TIMEOUT_MS: 5000,

    /** Max wait for DOMContentLoaded before proceeding with send. */
    DOM_READY_SETTLE_MS: 2000,

    /** Max wait for input element to appear before send attempt. */
    SEND_INPUT_WAIT_TIMEOUT_MS: 3000,

    /** Interval for Cloudflare challenge verification polling. */
    CLOUDFLARE_VERIFY_INTERVAL_MS: 2000,

    // ── content/response-state.js ───────────────────────────────────

    /** Default stabilityMs passed to createResponseStabilityTracker. */
    RESPONSE_STABILITY_MS_FALLBACK: 1200,

    /** DeepSeek text stability threshold. */
    RESPONSE_STABILITY_MS_DEEPSEEK: 1500,

    /** Doubao / Kimi / Tongyi text stability threshold. */
    RESPONSE_STABILITY_MS_DOUBAO_KIMI_TONGYI: 1800,

    /** Default text stability threshold (ChatGPT, Claude, Gemini, Copilot, Grok, etc.). */
    RESPONSE_STABILITY_MS_DEFAULT: 3500,

    // ── content/response-detection.js ───────────────────────────────

    /** Max wait for send button to become disabled (indicates response started). */
    SEND_BUTTON_DISABLED_WAIT_MS: 5000,

    /** Max total wait for any response-start signal. */
    RESPONSE_START_MAX_WAIT_MS: 30000,

    /** Interval for stop-button polling in checkStop loop. */
    RESPONSE_START_CHECK_INTERVAL_MS: 500,

    /** Max iterations for checkStop loop before giving up. */
    RESPONSE_START_STOP_CHECK_LIMIT: 60,

    /** Max iterations for meta/high-observability stop polling. */
    RESPONSE_START_META_CHECK_LIMIT: 20,

    /** Delay after send-button-disabled before resolving "stream-started". */
    RESPONSE_START_SIGNAL_DELAY_MS: 500,

    /** Fast poll interval for meta high-observability path. */
    RESPONSE_START_FAST_POLL_MS: 250,

    /** Grace period after stop button disappears before checking text stability. */
    RESPONSE_STOP_GRACE_MS: 5000,

    /** Delay after stop button hidden before re-checking. */
    RESPONSE_STOP_RECHECK_DELAY_MS: 800,

    /** Delay after text changed before re-checking stability. */
    RESPONSE_TEXT_STABILITY_RECHECK_MS: 800,

    /** Delay before resolving "skip" when no streaming indicators found. */
    RESPONSE_SKIP_DELAY_MS: 250,

    // ── content/send-handlers.js ────────────────────────────────────

    /** General element-wait timeout (waitForElement / waitForElementDeep). */
    ELEMENT_WAIT_TIMEOUT_MS: 3000,

    /** Copilot: delay after text insertion before sending Enter (bot detection avoidance). */
    COPILOT_SEND_DELAY_MS: 800,

    /** Grok: max wait for send-signal after dispatching Enter (default parameter). */
    GROK_SEND_SIGNAL_TIMEOUT_MS: 2000,

    /** Kimi: max wait for send button to become enabled. */
    KIMI_SEND_BUTTON_ENABLE_WAIT_MS: 1500,

    /** Kimi: poll interval while waiting for send button enable. */
    KIMI_SEND_BUTTON_POLL_MS: 100,

    /** Kimi: settle delay after setting editable text before checking result. */
    KIMI_INPUT_SETTLE_MS: 250,

    /** Tongyi: settle delay after setting editable text before clicking send. */
    TONGYI_INPUT_SETTLE_MS: 100,

    // ── content/transcript-capture.js ───────────────────────────────

    /** Window (ms) after manual send during which the send is considered "recent". */
    MANUAL_SEND_CAPTURE_WINDOW_MS: 1200,

    /** Delay before restarting observer after manual turn detection. */
    MANUAL_TURN_OBSERVER_RESTART_DELAY_MS: 300,

    // ── content/runtime-messaging.js ─────────────────────────────────

    /** Timeout per attempt for chrome.runtime.sendMessage. */
    RUNTIME_MESSAGE_TIMEOUT_MS: 5000,

    /** Max total attempts (retries = 3 means up to 3 attempts total). */
    RUNTIME_MESSAGE_RETRY_COUNT: 3,

    /** Delay between retry attempts. */
    RUNTIME_MESSAGE_RETRY_DELAY_MS: 250
  };

  Object.freeze(C);

  root.MultiAIContentConstants = C;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = C;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
