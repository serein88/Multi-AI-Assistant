/**
 * i18n message loader for dashboard.
 *
 * Single source of truth: _locales/<locale>/messages.json (Chrome i18n layout).
 * Messages are loaded via synchronous XHR at script load time so they are
 * available before shared-state.js and dashboard.js execute.
 *
 * Exposes:
 *   globalThis.MultiAI_I18n.t(key, ...substitutions)
 *   globalThis.MultiAI_I18n.currentLang   (mutable — updated by toggleLanguage)
 *   globalThis.MultiAI_I18n.messages      (mutable — swapped on language switch)
 *   globalThis.MultiAI_I18n.LOCALES       (read-only cache of all loaded locales)
 *
 * t() always reads from the live `messages` reference on this object,
 * so after toggleLanguage() swaps `messages`, all callers pick up the
 * new language without re-binding.
 *
 * Loaded before shared-state.js so the shared state can reference it.
 * Falls back to key name if a message is missing.
 */
(() => {
  "use strict";

  // ── Locale directory mapping ─────────────────────────────────────
  // Chrome _locales uses underscores: zh_CN, en, etc.
  // Internal language codes use BCP-47 hyphens: zh-CN, en-US.
  var LOCALE_DIRS = [
    { dir: "zh_CN", lang: "zh-CN" },
    { dir: "en",    lang: "en-US" }
  ];

  // ── Load a locale JSON synchronously from _locales/<dir>/messages.json ──
  function loadLocale(dir) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", "../_locales/" + dir + "/messages.json", false); // synchronous
      xhr.send(null);
      if (xhr.status === 200 || xhr.status === 0) {
        var raw = JSON.parse(xhr.responseText);
        // Chrome messages.json uses { key: { message, description, ... } }
        // Flatten to { key: messageString }
        var flat = {};
        for (var k in raw) {
          if (Object.prototype.hasOwnProperty.call(raw, k)) {
            flat[k] = raw[k].message;
          }
        }
        return flat;
      }
    } catch (_) { /* XHR not available or file missing — normal in tests */ }
    return null;
  }

  // ── Load all known locales ───────────────────────────────────────
  var LOCALES = {};
  LOCALE_DIRS.forEach(function(entry) {
    var dict = loadLocale(entry.dir);
    if (dict) {
      LOCALES[entry.lang] = dict;
    }
  });

  // ── Determine initial language ───────────────────────────────────
  var currentLang = "zh-CN";
  try {
    var stored = localStorage.getItem("multi-ai-lang");
    if (stored && LOCALES[stored]) {
      currentLang = stored;
    }
  } catch (_) { /* localStorage unavailable */ }

  // ── Live reference — swapped by dashboard.js toggleLanguage() ────
  var messages = LOCALES[currentLang] || {};

  /**
   * Translate a key with optional positional substitutions.
   * Always reads from the live `messages` variable so that after a
   * language switch the next call returns the new language.
   *
   * @param {string} key - Message key
   * @param {...string} substitutions - Values for $1, $2, …
   * @returns {string}
   */
  function t(key) {
    var msg = messages[key];
    if (msg === undefined) return key;
    for (var i = 1; i < arguments.length; i++) {
      msg = msg.replace("$" + i, arguments[i]);
    }
    return msg;
  }

  globalThis.MultiAI_I18n = {
    t: t,
    get currentLang() { return currentLang; },
    set currentLang(v) { currentLang = v; },
    get messages() { return messages; },
    set messages(v) { messages = v; },
    LOCALES: LOCALES
  };
})();
