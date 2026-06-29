/**
 * Runtime messaging helper with timeout and retry.
 *
 * Wraps chrome.runtime.sendMessage with:
 * - Per-attempt timeout (Promise.race)
 * - Configurable retry on timeout or synchronous throw
 * - Identifiable error codes for logging
 *
 * Exposes: globalThis.__MAI_RuntimeMessaging
 */
(function initRuntimeMessaging(root) {
  "use strict";

  var C = (typeof globalThis !== "undefined" && globalThis.MultiAIContentConstants) || {};

  var TIMEOUT_MS = C.RUNTIME_MESSAGE_TIMEOUT_MS || 5000;
  var RETRY_COUNT = C.RUNTIME_MESSAGE_RETRY_COUNT || 3;
  var RETRY_DELAY_MS = C.RUNTIME_MESSAGE_RETRY_DELAY_MS || 250;

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /**
   * Send a message to the background service worker with timeout and retry.
   *
   * @param {object} message - The message payload (must have .type).
   * @param {object} [options]
   * @param {number} [options.timeoutMs]   - Per-attempt timeout (default 5000).
   * @param {number} [options.retries]     - Max total attempts (default 3).
   * @param {number} [options.retryDelayMs] - Delay between attempts (default 250).
   * @returns {Promise<any>} Resolves with the response, or rejects after all attempts exhausted.
   */
  function sendRuntimeMessageWithRetry(message, options) {
    var timeoutMs   = (options && options.timeoutMs)   || TIMEOUT_MS;
    var retries     = (options && options.retries)     || RETRY_COUNT;
    var delayMs     = (options && options.retryDelayMs) || RETRY_DELAY_MS;
    var messageType = (message && message.type) || "unknown";

    var attempt = 0;

    function tryOnce() {
      attempt++;
      var currentAttempt = attempt;

      return new Promise(function (resolve, reject) {
        var settled = false;

        var timer = setTimeout(function () {
          if (!settled) {
            settled = true;
            var err = new Error(
              "runtime-message-timeout: " + messageType + " (attempt " + currentAttempt + "/" + retries + ")"
            );
            err.code = "runtime-message-timeout";
            err.messageType = messageType;
            err.attempt = currentAttempt;
            reject(err);
          }
        }, timeoutMs);

        try {
          var result = chrome.runtime.sendMessage(message);
          if (result && typeof result.then === "function") {
            result.then(
              function (val) {
                if (!settled) {
                  settled = true;
                  clearTimeout(timer);
                  resolve(val);
                }
              },
              function (err) {
                if (!settled) {
                  settled = true;
                  clearTimeout(timer);
                  reject(err);
                }
              }
            );
          } else {
            // sendMessage returned non-Promise (shouldn't happen in MV3, but guard)
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve(result);
            }
          }
        } catch (syncErr) {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(syncErr);
          }
        }
      });
    }

    function attemptWithRetry() {
      return tryOnce().catch(function (err) {
        if (attempt >= retries) {
          throw err;
        }
        return sleep(delayMs).then(attemptWithRetry);
      });
    }

    return attemptWithRetry();
  }

  root.__MAI_RuntimeMessaging = {
    sendRuntimeMessageWithRetry: sendRuntimeMessageWithRetry
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { sendRuntimeMessageWithRetry: sendRuntimeMessageWithRetry };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
