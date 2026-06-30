"use strict";

/**
 * Provider Configs Module
 *
 * Loads PROVIDER_CONFIGS (input/send selectors per provider) and HOST_MAP
 * from content/provider-configs.json via async fetch, then exports them
 * on globalThis.__MAI_ProviderConfigs.
 *
 * Loading strategy:
 *   - PROVIDER_CONFIGS starts empty and is populated once JSON loads.
 *   - Content scripts access configs only inside user-triggered handlers
 *     (sendPrompt, transcript capture), which run well after page load.
 *   - readyPromise is exposed for callers that need to guarantee configs
 *     are loaded before proceeding.
 *   - reloadProviderConfigs() supports runtime refresh without extension reload.
 *
 * Exported namespace: globalThis.__MAI_ProviderConfigs
 *   PROVIDER_CONFIGS, HOST_MAP, getProviderFromHost,
 *   getProviderConfig(), getProviderConfigs(), getProviderFromHost(),
 *   ready, readyPromise, reloadProviderConfigs()
 */

var __MAI_ProviderConfigs = (function () {
  var PC = globalThis.__MAI_ProviderConfigs || {};
  var JSON_URL = (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL("content/provider-configs.json")
    : "";
  var logWarn = (typeof console !== "undefined" && console.warn)
    ? console.warn.bind(console, "[ProviderConfigs]")
    : function () {};

  // ─── Sync exports (empty until JSON loads) ─────────────────────────────────

  PC.PROVIDER_CONFIGS = {};
  PC.HOST_MAP = [];

  // ─── Helper functions ──────────────────────────────────────────────────────

  function getProviderFromHost(hostname) {
    var host = hostname || (typeof window !== "undefined" ? window.location.hostname : "");
    var map = PC.HOST_MAP;
    for (var i = 0; i < map.length; i++) {
      if (host.includes(map[i].match)) return map[i].id;
    }
    return "";
  }

  function getProviderConfigs() {
    return PC.PROVIDER_CONFIGS;
  }

  function getProviderConfig(provider) {
    if (!provider) return null;
    var cfg = PC.PROVIDER_CONFIGS[provider];
    return cfg || null;
  }

  function _applyConfig(data) {
    if (data && typeof data === "object") {
      PC.PROVIDER_CONFIGS = data.providerConfigs || {};
      PC.HOST_MAP = data.hostMap || [];
    }
  }

  // ─── Async load ────────────────────────────────────────────────────────────

  var _resolveReady;
  PC.readyPromise = new Promise(function (resolve) {
    _resolveReady = resolve;
  });
  PC.ready = false;

  function loadProviderConfigs() {
    if (!JSON_URL) {
      logWarn("chrome.runtime.getURL unavailable — configs stay empty");
      _resolveReady(false);
      return PC.readyPromise;
    }

    return fetch(JSON_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        _applyConfig(data);
        PC.ready = true;
        _resolveReady(true);
        return true;
      })
      .catch(function (err) {
        logWarn("Failed to load provider-configs.json: " + err.message +
          " — PROVIDER_CONFIGS will be empty until reload");
        _resolveReady(false);
        return false;
      });
  }

  function reloadProviderConfigs() {
    if (!JSON_URL) {
      logWarn("chrome.runtime.getURL unavailable — cannot reload");
      return Promise.resolve(false);
    }
    return fetch(JSON_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        _applyConfig(data);
        PC.ready = true;
        return true;
      })
      .catch(function (err) {
        logWarn("Reload failed: " + err.message);
        return false;
      });
  }

  // ─── Exports ───────────────────────────────────────────────────────────────

  PC.getProviderFromHost = getProviderFromHost;
  PC.getProviderConfigs = getProviderConfigs;
  PC.getProviderConfig = getProviderConfig;
  PC.reloadProviderConfigs = reloadProviderConfigs;
  PC.loadProviderConfigs = loadProviderConfigs;

  globalThis.__MAI_ProviderConfigs = PC;

  // Kick off async load immediately
  loadProviderConfigs();

  return PC;
})();
