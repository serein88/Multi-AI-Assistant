(() => {
  if (window.chrome && window.chrome.storage && window.chrome.runtime) {
    return;
  }

  const log = (...args) => console.info("[dev-chrome]", ...args);

  const getStoredValue = (key) => {
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };

  const setStoredValue = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
  };

  const normalizeGetKeys = (keys) => {
    if (keys === null || typeof keys === "undefined") {
      return Object.keys(localStorage);
    }
    if (typeof keys === "string") return [keys];
    if (Array.isArray(keys)) return keys;
    if (typeof keys === "object") return Object.keys(keys);
    return [];
  };

  const chromeShim = (window.chrome = window.chrome || {});
  chromeShim.storage = chromeShim.storage || {};
  chromeShim.storage.local = chromeShim.storage.local || {
    get(keys) {
      return new Promise((resolve) => {
        const result = {};
        const keyList = normalizeGetKeys(keys);
        keyList.forEach((key) => {
          const value = getStoredValue(key);
          if (typeof value === "undefined" && keys && typeof keys === "object" && !Array.isArray(keys)) {
            result[key] = keys[key];
          } else {
            result[key] = value;
          }
        });
        resolve(result);
      });
    },
    set(items) {
      return new Promise((resolve) => {
        if (items && typeof items === "object") {
          Object.keys(items).forEach((key) => {
            setStoredValue(key, items[key]);
          });
        }
        resolve();
      });
    },
    remove(keys) {
      return new Promise((resolve) => {
        normalizeGetKeys(keys).forEach((key) => localStorage.removeItem(key));
        resolve();
      });
    },
    clear() {
      return new Promise((resolve) => {
        localStorage.clear();
        resolve();
      });
    }
  };

  chromeShim.runtime = chromeShim.runtime || {};
  chromeShim.runtime.sendMessage = (message, callback) => {
    log("sendMessage", message);
    if (typeof callback === "function") {
      callback({ ok: false, dev: true });
    }
  };
})();
