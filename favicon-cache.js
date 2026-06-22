/**
 * FaviconCache — shared favicon URL module.
 *
 * Exposes globalThis.FaviconCache with:
 *   - getFaviconSrc(providerId)   → Google Favicon API URL
 *   - getFaviconUrl(providerId)   → same, for API compatibility
 *   - preloadFavicons(providerIds) → pre-warm browser image cache via <img> tags
 *
 * Icons are served directly from Google Favicon API via <img> tags.
 * Browser native image cache handles caching — no data URL conversion needed.
 */
(function () {
  "use strict";

  var API_TEMPLATE = "https://www.google.com/s2/favicons?domain={domain}&sz=32";

  var PROVIDER_HOSTS = {
    chatgpt: "chatgpt.com",
    claude: "claude.ai",
    grok: "grok.com",
    gemini: "gemini.google.com",
    copilot: "copilot.cloud.microsoft",
    doubao: "www.doubao.com",
    kimi: "www.kimi.com",
    deepseek: "chat.deepseek.com",
    tongyi: "qianwen.aliyun.com",
    yuanbao: "yuanbao.tencent.com",
    zhipu: "chatglm.cn",
    you: "you.com",
    ima: "ima.qq.com"
  };

  function buildApiUrl(hostname) {
    return API_TEMPLATE.replace("{domain}", hostname);
  }

  /** Pre-warm browser cache by loading images into off-screen <img> elements. */
  function preloadImage(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(true); };
      img.onerror = function () { resolve(false); };
      img.src = url;
    });
  }

  var FaviconCache = {
    getFaviconUrl: function (providerId) {
      var hostname = PROVIDER_HOSTS[providerId];
      if (!hostname) return "";
      return buildApiUrl(hostname);
    },

    getFaviconSrc: function (providerId) {
      var hostname = PROVIDER_HOSTS[providerId];
      if (!hostname) return "";
      return buildApiUrl(hostname);
    },

    preloadFavicons: async function (providerIds) {
      if (!Array.isArray(providerIds) || providerIds.length === 0) {
        return;
      }
      var unique = Array.from(new Set(providerIds));
      var urls = unique.map(function (id) {
        var hostname = PROVIDER_HOSTS[id];
        return hostname ? buildApiUrl(hostname) : null;
      }).filter(Boolean);
      await Promise.all(urls.map(function (url) {
        return preloadImage(url);
      }));
    }
  };

  globalThis.FaviconCache = FaviconCache;
})();
