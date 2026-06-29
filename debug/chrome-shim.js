// Mock chrome APIs for local development
// This allows dashboard-dev.html to run without extension context

window.chrome = window.chrome || {};

// Mock chrome.storage
if (!chrome.storage) {
  const store = {};
  chrome.storage = {
    local: {
      get: async (keys) => {
        if (typeof keys === 'string') {
          return { [keys]: store[keys] };
        }
        return store;
      },
      set: async (items) => {
        Object.assign(store, items);
        console.log('[Dev] Storage set:', items);
      }
    }
  };
}

// Mock chrome.runtime
if (!chrome.runtime) {
  chrome.runtime = {
    sendMessage: (msg) => {
      console.log('[Dev] Message sent:', msg);
      return Promise.resolve();
    },
    onMessage: {
      addListener: (callback) => {
        console.log('[Dev] Message listener added');
      }
    },
    getURL: (path) => path
  };
}

// Mock chrome.tabs
if (!chrome.tabs) {
  chrome.tabs = {
    create: async (props) => {
      console.log('[Dev] Tab created:', props);
      window.open(props.url, '_blank');
      return {};
    }
  };
}

console.log('[Dev] Chrome shim loaded');
