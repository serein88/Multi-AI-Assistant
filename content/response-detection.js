"use strict";

/**
 * Response Detection Module
 *
 * Extracted from content.js — waitForResponseStart, waitForResponseComplete,
 * waitForStreamSignal, and related helper functions.
 *
 * Exported via globalThis.__MAI_Response for use by content.js and transcript-capture.js.
 *
 * Depends on: content/send-handlers.js (getStopSelectors, countResponseNodes)
 */

var __MAI_Response = (function () {
  var RD = globalThis.__MAI_Response || {};
  var SH = globalThis.__MAI_Send || {};
  var getStopSelectors = SH.getStopSelectors;
  var log = SH.log || console.log.bind(console, "[MultiAI Response]");
  // RESPONSE_SELECTORS is a content.js global — read lazily inside functions (never at module load time)
  // eslint-disable-next-line no-undef
  var _rs = function () { return typeof RESPONSE_SELECTORS !== "undefined" ? RESPONSE_SELECTORS : globalThis.RESPONSE_SELECTORS; };

  // ─── Helper: Stop / Send button visibility ─────────────────────────────────

  function getStopVisible(doc) {
    return Array.from(doc.querySelectorAll(
      'button[aria-label="Stop generating"],' +
      'button[aria-label="停止生成"],' +
      'button[aria-label="Génération arrêtée"],' +
      'button[aria-label="Generación detenida"],' +
      'button[aria-label="Geração interrompida"],' +
      'button[aria-label="生成を停止"],' +
      'button[aria-label="생성 중지"],' +
      'button[aria-label="停止生成"]'
    )).filter(SH.isElementVisible);
  }

  function getStopHidden(doc) {
    return Array.from(doc.querySelectorAll(
      'button[aria-label="Stop generating"],' +
      'button[aria-label="停止生成"],' +
      'button[aria-label="Génération arrêtée"],' +
      'button[aria-label="Generación detenida"],' +
      'button[aria-label="Geração interrompida"],' +
      'button[aria-label="生成を停止"],' +
      'button[aria-label="생성 중지"],' +
      'button[aria-label="停止生成"]'
    )).filter(function (el) { return !SH.isElementVisible(el); });
  }

  function getSendVisible(doc) {
    return Array.from(doc.querySelectorAll('button[data-testid="send-button"]')).filter(SH.isElementVisible);
  }

  function getSendHidden(doc) {
    return Array.from(doc.querySelectorAll('button[data-testid="send-button"]')).filter(function (el) {
      return !SH.isElementVisible(el);
    });
  }

  // ─── waitForSendButtonDisabled ─────────────────────────────────────────────

  function waitForSendButtonDisabled(doc, timeout) {
    timeout = timeout || 5000;
    var startBtns = doc.querySelectorAll('button[data-testid="start-speech-button"]');
    if (startBtns.length) {
      var startBtn = startBtns[startBtns.length - 1];
      if (startBtn.getAttribute("data-testid") === "start-speech-button" && startBtn.offsetWidth > 0) {
        return Promise.resolve({ stopped: true, reason: "speech-mode" });
      }
    }
    var sendBtns = doc.querySelectorAll('button[data-testid="send-button"]');
    if (!sendBtns.length) return Promise.resolve({ stopped: false, reason: "no-send-button" });
    var sendBtn = sendBtns[sendBtns.length - 1];
    if (sendBtn.disabled || sendBtn.closest('[aria-disabled="true"]')) return Promise.resolve({ stopped: true, reason: "send-disabled" });
    if (!sendBtn.querySelector('svg') && !sendBtn.querySelector('[data-icon]')) return Promise.resolve({ stopped: true, reason: "send-icon-removed" });
    return new Promise(function (resolve) {
      var observer = new MutationObserver(function () {
        if (sendBtn.disabled || sendBtn.closest('[aria-disabled="true"]')) {
          cleanup(); resolve({ stopped: true, reason: "send-disabled" });
        } else if (!sendBtn.querySelector('svg') && !sendBtn.querySelector('[data-icon]')) {
          cleanup(); resolve({ stopped: true, reason: "send-icon-removed" });
        }
      });
      var interval = setTimeout(function () {
        cleanup(); resolve({ stopped: false, reason: "timeout" });
      }, timeout);
      function cleanup() { observer.disconnect(); clearTimeout(interval); }
      observer.observe(sendBtn, { attributes: true, subtree: true, childList: true });
    });
  }

  // ─── waitForResponseStart ──────────────────────────────────────────────────

  var MAX_START_WAIT = 30000;
  var CHECK_INTERVAL = 500;
  var STOP_CHECK_LIMIT = 60;
  var META_CHECK_LIMIT = 20;

  function waitForResponseStart(provider, meta, config) {
    config = config || {};
    var providerStop = getStopSelectors(provider);
    var chatStopSelector = providerStop.join(", ");
    var doc = config.document || document;
    var timeout = config.timeout || MAX_START_WAIT;
    var cancelled = false;

    var startedResolve, startedReject;

    function cleanup() {
      cancelled = true;
    }

    var promise = new Promise(function (resolve, reject) {
      startedResolve = function (v) { if (!cancelled) { cleanup(); resolve(v); } };
      startedReject = function (e) { if (!cancelled) { cleanup(); reject(e); } };
    });

    if (meta && meta.observability === "high") {
      waitForSendButtonDisabled(doc, timeout).then(function (result) {
        if (cancelled) return;
        if (result.stopped) {
          setTimeout(function () { if (!cancelled) startedResolve("stream-started"); }, 500);
          return;
        }
        var count = 0;
        var interval = setInterval(function () {
          if (cancelled) { clearInterval(interval); return; }
          if (++count > META_CHECK_LIMIT) { clearInterval(interval); startedResolve("meta-expired"); return; }
          var sv = getStopVisible(doc);
          var dv = doc.querySelectorAll('button[aria-label="停止"]');
          if (sv.length || (provider === "deepseek" && dv.length)) { clearInterval(interval); startedResolve("stream-started"); }
        }, 250);
      });
    }

    (function checkStop(k) {
      if (cancelled) return;
      if (k > STOP_CHECK_LIMIT) { startedResolve("stream-started"); return; }
      var vs = chatStopSelector ? doc.querySelectorAll(chatStopSelector) : [];
      var sv = getStopVisible(doc);
      var isVs = false;
      if (provider === "yuanbao") {
        isVs = vs.length > 0 && sv.length > 0 && Array.from(vs).some(function (el) { return SH.isElementVisible(el); });
      } else {
        isVs = sv.length > 0 && Array.from(vs).some(function (el) { return SH.isElementVisible(el); });
      }
      if (isVs) { startedResolve("stream-started"); return; }
      var anyStop = Array.from(doc.querySelectorAll('button[aria-label="Stop"], button[aria-label="停止"], button[aria-stop]')).filter(SH.isElementVisible);
      if (anyStop.length) { startedResolve("stream-started"); return; }
      setTimeout(function () { checkStop(k + 1); }, CHECK_INTERVAL);
    })(0);

    if (meta && meta.observability === "high") {
      var cnt = 0;
      var metaInterval = setInterval(function () {
        if (cancelled) { clearInterval(metaInterval); return; }
        if (++cnt > META_CHECK_LIMIT) { clearInterval(metaInterval); return; }
        var checkBtn = doc.querySelector('button[data-testid="send-button"]');
        if (checkBtn && !checkBtn.disabled) { clearInterval(metaInterval); startedResolve("send-button-visible"); }
      }, 250);
    }

    if (meta && meta.observability === "high") {
      var t = 0;
      var sdInterval = setInterval(function () {
        if (cancelled) { clearInterval(sdInterval); return; }
        if (++t > 20) { clearInterval(sdInterval); startedResolve("stream-started"); return; }
        var btns = doc.querySelectorAll('button[data-testid="send-button"]');
        if (!btns.length) return;
        var b = btns[btns.length - 1];
        if (b.disabled || b.closest('[aria-disabled="true"]') || (!b.querySelector('svg') && !b.querySelector('[data-icon]'))) {
          clearInterval(sdInterval); startedResolve("stream-started");
        }
      }, 250);
    }

    return promise;
  }

  // ─── waitForResponseComplete ───────────────────────────────────────────────

  var STREAMING_CANDIDATES = [
    '.result-streaming', '.streaming', '[data-is-streaming="true"]',
    '[data-streaming]', '[aria-busy="true"]', '.generating',
    '.typing-indicator', '.loading-indicator'
  ];
  var STREAMING_SELECTORS = STREAMING_CANDIDATES.join(",");

  function waitForResponseComplete(provider, meta, config) {
    config = config || {};
    var providerStop = getStopSelectors(provider);
    var chatStopSelector = providerStop.join(", ");
    var doc = config.document || document;
    var textStableMs = 3500;
    if (provider === "deepseek") textStableMs = 1500;
    else if (provider === "doubao" || provider === "kimi" || provider === "tongyi") textStableMs = 1800;
    function collectText() {
      var sel = _rs();
      var texts = [];
      var msgEls = Array.from(doc.querySelectorAll(sel.messageSelector));
      msgEls.forEach(function (el) {
        if (el.querySelector && el.querySelector("#__mai_stopwatch__")) return;
        var role = el.getAttribute(sel.roleAttr);
        if (role !== "assistant" && role !== "bot") return;
        var isTarget = false;
        if (provider === "chatglm") isTarget = el.getAttribute("data-message-author-role") !== "user";
        else if (provider === "copilot") isTarget = !el.closest("[data-content='ai-card-inner']");
        else if (provider === "hunyuan") isTarget = role === "assistant";
        else if (provider === "yuanbao") isTarget = role === "assistant" || el.getAttribute("data-role") === "assistant";
        if (isTarget) {
          var cloned = el.cloneNode(true);
          var $$stopwatch = cloned.querySelector("#__mai_stopwatch__");
          if ($$stopwatch) $$stopwatch.remove();
          var t = cloned.textContent || "";
          if (provider === "hunyuan") {
            t = t.replace(/\n{4,}/g, "\n\n\n");
            var contentEl = el.querySelector("[class*='content']");
            if (contentEl) {
              var wc = contentEl.closest("[class*='writer-container']");
              if (wc) {
                var copyBtn = wc.querySelector("button[class*='copy']");
                if (copyBtn) copyBtn.remove();
              }
            }
          }
          if (t.trim()) texts.push(t.trim());
        }
      });
      return texts;
    }

    function isStreaming(doc) {
      var sv = getStopVisible(doc);
      if (sv.length > 0) return true;
      if (chatStopSelector) {
        var matches = doc.querySelectorAll(chatStopSelector);
        var mvisible = Array.from(matches).filter(SH.isElementVisible);
        if (mvisible.length > 0) return true;
        if (matches.length === 1 && !mvisible.length) return false;
      }
      var streaming = doc.querySelectorAll(STREAMING_SELECTORS);
      if (streaming.length > 0) return true;
      var stop = Array.from(doc.querySelectorAll('button[aria-label="Stop"], button[aria-label="停止"]')).filter(SH.isElementVisible);
      if (stop.length > 0) return true;
      return false;
    }

    return new Promise(function (resolve, reject) {
      var finished = false;
      var pendingCheck = null;

      function cleanup() {
        clearTimeout(pendingCheck);
      }

      function onDone(reason, text) {
        if (finished) return;
        finished = true;
        cleanup();
        log("[ResponseComplete]", provider, "done:", reason, "textLen:", (text || "").length);
        if (text && text.trim()) resolve({ completed: true, reason: reason, text: text });
        else resolve({ completed: false, reason: "empty", text: "" });
      }

      // Step 1: 等待停止按钮消失
      var stopTs = Date.now();
      var hasSeenStop = false;
      function checkStopBtn() {
        if (finished) return;
        var sv = getStopVisible(doc);
        var dv = doc.querySelectorAll('button[aria-label="停止"]');
        var isProviderStop = false;
        if (provider === "yuanbao") {
          var yuanbaoMatch = chatStopSelector ? doc.querySelectorAll(chatStopSelector) : [];
          isProviderStop = yuanbaoMatch.length > 0 && sv.length > 0 && Array.from(yuanbaoMatch).some(function (el) { return SH.isElementVisible(el); });
        } else {
          isProviderStop = chatStopSelector ? Array.from(doc.querySelectorAll(chatStopSelector)).filter(SH.isElementVisible).length > 0 : false;
        }
        var anyVisibleStop = sv.length > 0 || (provider === "deepseek" && dv.length > 0) || isProviderStop;
        if (anyVisibleStop) {
          hasSeenStop = true;
          setTimeout(checkStopBtn, 800);
          return;
        }
        if (!hasSeenStop && Date.now() - stopTs < 5000) {
          setTimeout(checkStopBtn, 400);
          return;
        }
        checkTextStability(0);
      }

      // Step 2: 文本稳定性检测
      var lastTextSnapshot = null;
      var textStableStart = null;
      function checkTextStability(k) {
        if (finished) return;
        if (isStreaming(doc)) {
          textStableStart = null;
          lastTextSnapshot = null;
          setTimeout(function () { checkTextStability(0); }, 800);
          return;
        }
        var t0 = collectText().join("\n");
        var now = Date.now();
        if (t0 !== lastTextSnapshot) {
          lastTextSnapshot = t0;
          textStableStart = now;
          setTimeout(function () { checkTextStability(k + 1); }, 400);
          return;
        }
        if (!textStableStart) {
          textStableStart = now;
          setTimeout(function () { checkTextStability(k + 1); }, 400);
          return;
        }
        if (now - textStableStart >= textStableMs) {
          if (isStreaming(doc)) {
            textStableStart = null;
            lastTextSnapshot = null;
            setTimeout(function () { checkTextStability(0); }, 800);
            return;
          }
          var finalText = collectText().join("\n");
          onDone("text-stable", finalText);
          return;
        }
        setTimeout(function () { checkTextStability(k + 1); }, 400);
      }

      function step1() {
        if (finished) return;
        if (meta && (meta.kind === "unreliable_streaming" || meta.kind === "unreliable_button")) {
          if (!meta.skipStreamingSignals) {
            var __visible = Array.from(doc.querySelectorAll(
              'button[aria-label="Stop generating"], button[aria-label="停止"], button[aria-label="停止生成"], button[aria-stop="true"]'
            )).filter(function (el) { return el.offsetWidth > 0; });
            if (__visible.length) {
              onDone("stop-generating", collectText().join("\n"));
              return;
            }
          }
          setTimeout(function () {
            if (finished) return;
            if (meta && (meta.kind === "unreliable_streaming" || meta.kind === "unreliable_button")) {
              onDone("unreliable-no-streaming-fallback", collectText().join("\n"));
              return;
            }
            if (meta && meta.kind === "text_only_fallback") {
              onDone("text-only-fallback", collectText().join("\n"));
              return;
            }
            checkStopBtn();
          }, textStableMs);
          return;
        }
        if (meta && meta.kind === "text_only_fallback") {
          onDone("text-only-fallback", collectText().join("\n"));
          return;
        }
        checkStopBtn();
      }

      step1();
    });
  }

  // ─── waitForStreamSignal ───────────────────────────────────────────────────

  function waitForStreamSignal(meta, config) {
    return new Promise(function (resolve, reject) {
      var streamingEls = Array.from(document.querySelectorAll(
        '.result-streaming, .streaming, [data-is-streaming="true"], [data-streaming], [aria-busy="true"]'
      ));
      if (streamingEls.length) { resolve("streaming-present"); return; }
      var streamingBtn = Array.from(document.querySelectorAll('[aria-label="停止"], [aria-label="Stop"]')).filter(SH.isElementVisible);
      if (streamingBtn.length) { resolve("streaming-btn"); return; }
      setTimeout(function () { resolve("skip"); }, 250);
    });
  }

  // ─── Exports ───────────────────────────────────────────────────────────────

  RD.getStopVisible = getStopVisible;
  RD.getStopHidden = getStopHidden;
  RD.getSendVisible = getSendVisible;
  RD.getSendHidden = getSendHidden;
  RD.waitForSendButtonDisabled = waitForSendButtonDisabled;
  RD.waitForResponseStart = waitForResponseStart;
  RD.waitForResponseComplete = waitForResponseComplete;
  RD.waitForStreamSignal = waitForStreamSignal;

  globalThis.__MAI_Response = RD;
  return RD;
})();
