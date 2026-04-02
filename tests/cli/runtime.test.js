const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

/**
 * Task 5: Chrome connection and tab discovery runtime tests
 * 
 * These tests cover the minimal runtime abstraction for:
 * - Chrome connection via CDP
 * - Target/tab enumeration
 * - Provider tab reuse policy
 * - Provider tab creation policy
 */

describe('Chrome Runtime', () => {
  let chrome;
  let tabs;

  describe('Chrome connection abstraction', () => {
    it('connects to Chrome via CDP port and returns connection object', async () => {
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: [] }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      
      assert.strictEqual(connection.connected, true);
      assert.ok(connection.targets);
    });

    it('enumerates targets/tabs from connected browser', async () => {
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com' },
        { id: 'tab-2', type: 'page', url: 'https://gemini.google.com' },
        { id: 'tab-3', type: 'background_page', url: 'chrome-extension://...' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const targets = chrome.getTargets(connection);
      
      assert.strictEqual(targets.length, 3);
      assert.strictEqual(targets[0].url, 'https://chat.deepseek.com');
    });

    it('normalizes browser connection errors with canonical error envelope', async () => {
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockCDP = {
        connect: async () => {
          throw new Error('ECONNREFUSED');
        },
      };
      
      const result = await chrome.connect({ cdp: mockCDP, port: 9222 });
      
      assert.strictEqual(result.connected, false);
      assert.strictEqual(result.error.code, 'BROWSER_NOT_CONNECTED');
      assert.ok(result.error.message);
      assert.ok(result.error.suggestion);
    });

    it('filters targets by type (page only)', async () => {
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://example.com' },
        { id: 'tab-2', type: 'background_page', url: 'chrome-extension://...' },
        { id: 'tab-3', type: 'service_worker', url: 'chrome-extension://...' },
        { id: 'tab-4', type: 'page', url: 'https://chat.deepseek.com' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const pages = chrome.getPageTargets(connection);
      
      assert.strictEqual(pages.length, 2);
      assert.ok(pages.every(t => t.type === 'page'));
    });
  });

  describe('Provider tab discovery', () => {
    beforeEach(() => {
      delete require.cache[require.resolve('../../cli/runtime/chrome.js')];
      delete require.cache[require.resolve('../../cli/runtime/tabs.js')];
    });

    it('finds existing provider tab by URL pattern', async () => {
      chrome = require('../../cli/runtime/chrome.js');
      tabs = require('../../cli/runtime/tabs.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
        { id: 'tab-2', type: 'page', url: 'https://gemini.google.com/app' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const providerTab = tabs.findProviderTab(connection, 'deepseek');
      
      assert.ok(providerTab);
      assert.strictEqual(providerTab.id, 'tab-1');
      assert.ok(providerTab.url.includes('deepseek'));
    });

    it('returns null when provider tab not found', async () => {
      chrome = require('../../cli/runtime/chrome.js');
      tabs = require('../../cli/runtime/tabs.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://example.com' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const providerTab = tabs.findProviderTab(connection, 'deepseek');
      
      assert.strictEqual(providerTab, null);
    });
  });

  describe('Provider tab reuse policy', () => {
    beforeEach(() => {
      delete require.cache[require.resolve('../../cli/runtime/chrome.js')];
      delete require.cache[require.resolve('../../cli/runtime/tabs.js')];
    });

    it('reuses existing provider tab when healthy', async () => {
      chrome = require('../../cli/runtime/chrome.js');
      tabs = require('../../cli/runtime/tabs.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const mockHealthCheck = async () => ({ healthy: true });
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await tabs.resolveProviderTab(connection, 'deepseek', {
        healthCheck: mockHealthCheck,
      });
      
      assert.strictEqual(result.action, 'reused');
      assert.strictEqual(result.tab.id, 'tab-1');
      assert.strictEqual(result.created, false);
    });

    it('creates new tab when existing tab is unhealthy', async () => {
      chrome = require('../../cli/runtime/chrome.js');
      tabs = require('../../cli/runtime/tabs.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
        createTarget: async (url) => ({ id: 'tab-new', type: 'page', url }),
      };
      
      const mockHealthCheck = async () => ({ healthy: false, reason: 'Login required' });
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await tabs.resolveProviderTab(connection, 'deepseek', {
        healthCheck: mockHealthCheck,
      });
      
      assert.strictEqual(result.action, 'created');
      assert.strictEqual(result.tab.id, 'tab-new');
      assert.strictEqual(result.created, true);
    });

    it('creates new tab when no existing tab found', async () => {
      chrome = require('../../cli/runtime/chrome.js');
      tabs = require('../../cli/runtime/tabs.js');
      
      const mockTargets = [];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
        createTarget: async (url) => ({ id: 'tab-new', type: 'page', url }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await tabs.resolveProviderTab(connection, 'deepseek');
      
      assert.strictEqual(result.action, 'created');
      assert.strictEqual(result.tab.id, 'tab-new');
      assert.strictEqual(result.created, true);
    });
  });

  describe('Provider tab creation policy', () => {
    beforeEach(() => {
      delete require.cache[require.resolve('../../cli/runtime/chrome.js')];
      delete require.cache[require.resolve('../../cli/runtime/tabs.js')];
    });

    it('creates tab with correct provider URL', async () => {
      chrome = require('../../cli/runtime/chrome.js');
      tabs = require('../../cli/runtime/tabs.js');
      
      let createdUrl = null;
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: [] }),
        createTarget: async (url) => {
          createdUrl = url;
          return { id: 'tab-new', type: 'page', url };
        },
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await tabs.resolveProviderTab(connection, 'deepseek');
      
      assert.ok(createdUrl.includes('deepseek'));
      assert.strictEqual(result.tab.url, createdUrl);
    });

    it('returns error when browser not connected', async () => {
      chrome = require('../../cli/runtime/chrome.js');
      tabs = require('../../cli/runtime/tabs.js');
      
      const mockCDP = {
        connect: async () => ({
          connected: false,
          error: {
            code: 'BROWSER_NOT_CONNECTED',
            message: 'Could not connect',
            suggestion: 'Start Chrome with --remote-debugging-port=9222',
          },
        }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await tabs.resolveProviderTab(connection, 'deepseek');
      
      assert.strictEqual(result.action, 'error');
      assert.strictEqual(result.error.code, 'BROWSER_NOT_CONNECTED');
    });
  });

  describe('Provider URL mapping', () => {
    beforeEach(() => {
      delete require.cache[require.resolve('../../cli/runtime/chrome.js')];
      delete require.cache[require.resolve('../../cli/runtime/tabs.js')];
    });

    it('maps provider IDs to correct URLs', async () => {
      tabs = require('../../cli/runtime/tabs.js');
      
      const mappings = [
        { id: 'deepseek', expectedUrl: 'chat.deepseek.com' },
        { id: 'gemini', expectedUrl: 'gemini.google.com' },
        { id: 'grok', expectedUrl: 'grok.com' },
      ];
      
      for (const { id, expectedUrl } of mappings) {
        const url = tabs.getProviderUrl(id);
        assert.ok(url.includes(expectedUrl), `${id} should map to ${expectedUrl}`);
      }
    });

    it('returns null for unknown provider ID', async () => {
      tabs = require('../../cli/runtime/tabs.js');
      
      const url = tabs.getProviderUrl('unknown-provider');
      assert.strictEqual(url, null);
    });
  });

  describe('Runtime seam risks', () => {
    beforeEach(() => {
      delete require.cache[require.resolve('../../cli/runtime/chrome.js')];
      delete require.cache[require.resolve('../../cli/runtime/tabs.js')];
    });

    describe('False-positive same-domain URL matching', () => {
      it('does not match fake-deepseek.com as deepseek provider', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockTargets = [
          { id: 'tab-1', type: 'page', url: 'https://fake-deepseek.com/' },
          { id: 'tab-2', type: 'page', url: 'https://deepseek.com.evil.org/' },
          { id: 'tab-3', type: 'page', url: 'https://chat.deepseek.com.real-fake.com/' },
        ];
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: mockTargets }),
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const providerTab = tabs.findProviderTab(connection, 'deepseek');
        
        assert.strictEqual(providerTab, null);
      });

      it('matches only exact hostname for provider', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockTargets = [
          { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
          { id: 'tab-2', type: 'page', url: 'https://fake-deepseek.com/' },
        ];
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: mockTargets }),
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const providerTab = tabs.findProviderTab(connection, 'deepseek');
        
        assert.ok(providerTab);
        assert.strictEqual(providerTab.id, 'tab-1');
      });

      it('ignores malformed URLs', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockTargets = [
          { id: 'tab-1', type: 'page', url: 'not-a-valid-url' },
          { id: 'tab-2', type: 'page', url: '' },
          { id: 'tab-3', type: 'page' },
        ];
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: mockTargets }),
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const providerTab = tabs.findProviderTab(connection, 'deepseek');
        
        assert.strictEqual(providerTab, null);
      });
    });

    describe('Malformed or throwing healthCheck', () => {
      it('returns error when healthCheck throws', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockTargets = [
          { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
        ];
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: mockTargets }),
        };
        
        const throwingHealthCheck = async () => {
          throw new Error('Network timeout');
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const result = await tabs.resolveProviderTab(connection, 'deepseek', {
          healthCheck: throwingHealthCheck,
        });
        
        assert.strictEqual(result.action, 'error');
        assert.strictEqual(result.error.code, 'CHECK_FAILED');
        assert.ok(result.error.message.includes('Health check threw'));
      });

      it('returns error when healthCheck returns invalid shape (missing healthy)', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockTargets = [
          { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
        ];
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: mockTargets }),
        };
        
        const malformedHealthCheck = async () => ({ status: 'ok' });
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const result = await tabs.resolveProviderTab(connection, 'deepseek', {
          healthCheck: malformedHealthCheck,
        });
        
        assert.strictEqual(result.action, 'error');
        assert.strictEqual(result.error.code, 'CHECK_FAILED');
        assert.ok(result.error.message.includes('invalid result shape'));
      });

      it('returns error when healthCheck returns null', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockTargets = [
          { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
        ];
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: mockTargets }),
        };
        
        const nullHealthCheck = async () => null;
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const result = await tabs.resolveProviderTab(connection, 'deepseek', {
          healthCheck: nullHealthCheck,
        });
        
        assert.strictEqual(result.action, 'error');
        assert.strictEqual(result.error.code, 'CHECK_FAILED');
      });

      it('returns error when healthCheck returns non-boolean healthy', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockTargets = [
          { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
        ];
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: mockTargets }),
        };
        
        const invalidHealthCheck = async () => ({ healthy: 'yes' });
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const result = await tabs.resolveProviderTab(connection, 'deepseek', {
          healthCheck: invalidHealthCheck,
        });
        
        assert.strictEqual(result.action, 'error');
        assert.strictEqual(result.error.code, 'CHECK_FAILED');
      });
    });

    describe('Canonicalized runtime errors', () => {
      it('returns canonical error for unknown provider', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: [] }),
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const result = await tabs.resolveProviderTab(connection, 'unknown-provider');
        
        assert.strictEqual(result.action, 'error');
        assert.strictEqual(result.error.code, 'PROVIDER_NOT_FOUND');
        assert.ok(result.error.message);
        assert.ok(result.error.suggestion);
      });

      it('returns canonical error when browser not connected', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockCDP = {
          connect: async () => ({
            connected: false,
            error: {
              code: 'BROWSER_NOT_CONNECTED',
              message: 'Could not connect',
              suggestion: 'Start Chrome',
            },
          }),
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const result = await tabs.resolveProviderTab(connection, 'deepseek');
        
        assert.strictEqual(result.action, 'error');
        assert.strictEqual(result.error.code, 'BROWSER_NOT_CONNECTED');
        assert.ok(result.error.message);
        assert.ok(result.error.suggestion);
      });

      it('normalizes non-canonical connection error to canonical form', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockCDP = {
          connect: async () => ({
            connected: false,
            error: {
              code: 'SOME_RANDOM_CODE',
              message: 'Random error',
            },
          }),
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const result = await tabs.resolveProviderTab(connection, 'deepseek');
        
        assert.strictEqual(result.action, 'error');
        assert.strictEqual(result.error.code, 'BROWSER_NOT_CONNECTED');
      });
    });

    describe('Behavior when creation cannot actually happen', () => {
      it('returns error when createTarget is not available', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: [] }),
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const result = await tabs.resolveProviderTab(connection, 'deepseek');
        
        assert.strictEqual(result.action, 'error');
        assert.strictEqual(result.error.code, 'INTERNAL_ERROR');
        assert.ok(result.error.message.includes('createTarget not available'));
      });

      it('returns error when createTarget is not a function', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: [] }),
          createTarget: 'not-a-function',
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const result = await tabs.resolveProviderTab(connection, 'deepseek');
        
        assert.strictEqual(result.action, 'error');
        assert.strictEqual(result.error.code, 'INTERNAL_ERROR');
      });
    });

    describe('Same-host unsupported path rejection', () => {
      it('does not reuse gemini.google.com/about as gemini provider', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockTargets = [
          { id: 'tab-1', type: 'page', url: 'https://gemini.google.com/about' },
        ];
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: mockTargets }),
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const providerTab = tabs.findProviderTab(connection, 'gemini');
        
        assert.strictEqual(providerTab, null);
      });

      it('does not reuse gemini.google.com/ as gemini provider', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockTargets = [
          { id: 'tab-1', type: 'page', url: 'https://gemini.google.com/' },
        ];
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: mockTargets }),
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const providerTab = tabs.findProviderTab(connection, 'gemini');
        
        assert.strictEqual(providerTab, null);
      });

      it('does not reuse gemini.google.com/help as gemini provider', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockTargets = [
          { id: 'tab-1', type: 'page', url: 'https://gemini.google.com/help' },
        ];
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: mockTargets }),
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const providerTab = tabs.findProviderTab(connection, 'gemini');
        
        assert.strictEqual(providerTab, null);
      });

      it('reuses gemini.google.com/app as gemini provider', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockTargets = [
          { id: 'tab-1', type: 'page', url: 'https://gemini.google.com/app' },
        ];
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: mockTargets }),
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const providerTab = tabs.findProviderTab(connection, 'gemini');
        
        assert.ok(providerTab);
        assert.strictEqual(providerTab.id, 'tab-1');
      });

      it('reuses gemini.google.com/app/ with query params as gemini provider', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockTargets = [
          { id: 'tab-1', type: 'page', url: 'https://gemini.google.com/app/12345' },
        ];
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: mockTargets }),
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const providerTab = tabs.findProviderTab(connection, 'gemini');
        
        assert.ok(providerTab);
        assert.strictEqual(providerTab.id, 'tab-1');
      });

      it('does not reuse chat.deepseek.com/about as deepseek provider', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockTargets = [
          { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/about' },
        ];
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: mockTargets }),
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const providerTab = tabs.findProviderTab(connection, 'deepseek');
        
        assert.strictEqual(providerTab, null);
      });

      it('does not reuse chat.deepseek.com/chat/abc as deepseek provider', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockTargets = [
          { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/chat/abc' },
        ];
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: mockTargets }),
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const providerTab = tabs.findProviderTab(connection, 'deepseek');
        
        assert.strictEqual(providerTab, null);
      });

      it('reuses chat.deepseek.com/ as deepseek provider', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockTargets = [
          { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
        ];
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: mockTargets }),
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const providerTab = tabs.findProviderTab(connection, 'deepseek');
        
        assert.ok(providerTab);
        assert.strictEqual(providerTab.id, 'tab-1');
      });

      it('does not reuse grok.com/about as grok provider', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockTargets = [
          { id: 'tab-1', type: 'page', url: 'https://grok.com/about' },
        ];
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: mockTargets }),
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const providerTab = tabs.findProviderTab(connection, 'grok');
        
        assert.strictEqual(providerTab, null);
      });

      it('does not reuse grok.com/chat as grok provider', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockTargets = [
          { id: 'tab-1', type: 'page', url: 'https://grok.com/chat' },
        ];
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: mockTargets }),
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const providerTab = tabs.findProviderTab(connection, 'grok');
        
        assert.strictEqual(providerTab, null);
      });

      it('reuses grok.com/ as grok provider', async () => {
        chrome = require('../../cli/runtime/chrome.js');
        tabs = require('../../cli/runtime/tabs.js');
        
        const mockTargets = [
          { id: 'tab-1', type: 'page', url: 'https://grok.com/' },
        ];
        
        const mockCDP = {
          connect: async () => ({ connected: true, targets: mockTargets }),
        };
        
        const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
        const providerTab = tabs.findProviderTab(connection, 'grok');
        
        assert.ok(providerTab);
        assert.strictEqual(providerTab.id, 'tab-1');
      });
    });
  });
});

/**
 * Task 6: Doctor orchestration tests
 * 
 * These tests cover the doctor lifecycle for DeepSeek:
 * - Chrome connection ok
 * - page reachable
 * - login detected
 * - input located
 * - structured unhealthy result when any check fails
 */
describe('Doctor Orchestration', () => {
  let doctor;
  let chrome;
  let tabs;
  let deepseekAdapter;
  let sharedHelpers;

  beforeEach(() => {
    // Clear module cache
    Object.keys(require.cache).forEach(key => {
      if (key.includes('cli/runtime') || key.includes('cli/providers')) {
        delete require.cache[key];
      }
    });
  });

  describe('DeepSeek doctor checks', () => {
    it('returns healthy when all checks pass', async () => {
      doctor = require('../../cli/runtime/doctor.js');
      chrome = require('../../cli/runtime/chrome.js');
      tabs = require('../../cli/runtime/tabs.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      // Mock adapter that reports all checks passing
      const mockAdapter = {
        checkLogin: async () => ({ passed: true }),
        checkInput: async () => ({ passed: true, selector: 'textarea' }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await doctor.runDoctor('deepseek', {
        connection,
        adapter: mockAdapter,
      });
      
      assert.strictEqual(result.command, 'doctor');
      assert.strictEqual(result.provider, 'deepseek');
      assert.strictEqual(result.healthy, true);
      assert.ok(result.checks);
      assert.strictEqual(result.checks.connection, true);
      assert.strictEqual(result.checks.pageReachable, true);
      assert.strictEqual(result.checks.loginDetected, true);
      assert.strictEqual(result.checks.inputLocated, true);
    });

    it('returns unhealthy when Chrome not connected', async () => {
      doctor = require('../../cli/runtime/doctor.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockCDP = {
        connect: async () => ({
          connected: false,
          error: {
            code: 'BROWSER_NOT_CONNECTED',
            message: 'Could not connect',
            suggestion: 'Start Chrome with --remote-debugging-port=9222',
          },
        }),
      };
      
      const mockAdapter = {
        checkLogin: async () => ({ passed: true }),
        checkInput: async () => ({ passed: true }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await doctor.runDoctor('deepseek', {
        connection,
        adapter: mockAdapter,
      });
      
      assert.strictEqual(result.healthy, false);
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'BROWSER_NOT_CONNECTED');
      assert.ok(result.error.message);
      assert.ok(result.error.suggestion);
      assert.strictEqual(result.checks.connection, false);
    });

    it('returns unhealthy when provider page not reachable', async () => {
      doctor = require('../../cli/runtime/doctor.js');
      chrome = require('../../cli/runtime/chrome.js');
      tabs = require('../../cli/runtime/tabs.js');
      
      // No DeepSeek tab open
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://example.com' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
        createTarget: async () => null, // Simulate creation failure
      };
      
      const mockAdapter = {
        checkLogin: async () => ({ passed: true }),
        checkInput: async () => ({ passed: true }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await doctor.runDoctor('deepseek', {
        connection,
        adapter: mockAdapter,
      });
      
      assert.strictEqual(result.healthy, false);
      assert.strictEqual(result.checks.connection, true);
      assert.strictEqual(result.checks.pageReachable, false);
    });

    it('returns unhealthy when login not detected', async () => {
      doctor = require('../../cli/runtime/doctor.js');
      chrome = require('../../cli/runtime/chrome.js');
      tabs = require('../../cli/runtime/tabs.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      // Mock adapter that reports login check failed
      const mockAdapter = {
        checkLogin: async () => ({ passed: false, reason: 'Login page detected' }),
        checkInput: async () => ({ passed: true }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await doctor.runDoctor('deepseek', {
        connection,
        adapter: mockAdapter,
      });
      
      assert.strictEqual(result.healthy, false);
      assert.strictEqual(result.error.code, 'LOGIN_REQUIRED');
      assert.strictEqual(result.checks.connection, true);
      assert.strictEqual(result.checks.pageReachable, true);
      assert.strictEqual(result.checks.loginDetected, false);
    });

    it('returns unhealthy when input not located', async () => {
      doctor = require('../../cli/runtime/doctor.js');
      chrome = require('../../cli/runtime/chrome.js');
      tabs = require('../../cli/runtime/tabs.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      // Mock adapter that reports input check failed
      const mockAdapter = {
        checkLogin: async () => ({ passed: true }),
        checkInput: async () => ({ passed: false, reason: 'Input element not found' }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await doctor.runDoctor('deepseek', {
        connection,
        adapter: mockAdapter,
      });
      
      assert.strictEqual(result.healthy, false);
      assert.strictEqual(result.error.code, 'INPUT_NOT_FOUND');
      assert.strictEqual(result.checks.connection, true);
      assert.strictEqual(result.checks.pageReachable, true);
      assert.strictEqual(result.checks.loginDetected, true);
      assert.strictEqual(result.checks.inputLocated, false);
    });

    it('includes all check details in result', async () => {
      doctor = require('../../cli/runtime/doctor.js');
      chrome = require('../../cli/runtime/chrome.js');
      tabs = require('../../cli/runtime/tabs.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const mockAdapter = {
        checkLogin: async () => ({ passed: true, details: 'User logged in as test@example.com' }),
        checkInput: async () => ({ passed: true, selector: 'textarea#chat-input' }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await doctor.runDoctor('deepseek', {
        connection,
        adapter: mockAdapter,
      });
      
      assert.strictEqual(result.healthy, true);
      assert.ok(result.checks.loginDetails);
      assert.ok(result.checks.inputSelector);
    });
  });

  describe('Shared doctor helpers', () => {
    it('normalizes check results to canonical format', async () => {
      sharedHelpers = require('../../cli/providers/shared.js');
      
      const result = sharedHelpers.normalizeCheckResult({
        passed: true,
        details: 'Some details',
      });
      
      assert.strictEqual(result.passed, true);
      assert.strictEqual(result.details, 'Some details');
    });

    it('creates canonical error from check failure', async () => {
      sharedHelpers = require('../../cli/providers/shared.js');
      
      const error = sharedHelpers.makeCheckError('LOGIN_REQUIRED', 'Not logged in', 'Please log in');
      
      assert.strictEqual(error.code, 'LOGIN_REQUIRED');
      assert.strictEqual(error.message, 'Not logged in');
      assert.strictEqual(error.suggestion, 'Please log in');
    });

    it('provides common DOM query helpers', async () => {
      sharedHelpers = require('../../cli/providers/shared.js');
      
      assert.ok(typeof sharedHelpers.waitForElement === 'function');
      assert.ok(typeof sharedHelpers.checkElementExists === 'function');
    });
  });

  describe('DeepSeek adapter', () => {
    it('exports required doctor interface', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      assert.ok(typeof deepseekAdapter.checkLogin === 'function');
      assert.ok(typeof deepseekAdapter.checkInput === 'function');
      assert.ok(typeof deepseekAdapter.getDoctorAdapter === 'function');
    });

    it('checkLogin returns passed when login detected', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const pageEvaluate = async (callback, ...args) => {
        return { loginPage: false, authenticated: true };
      };
      
      const adapter = deepseekAdapter.getDoctorAdapter({ 
        page: { evaluate: pageEvaluate } 
      });
      const result = await adapter.checkLogin();
      
      assert.strictEqual(result.passed, true);
    });

    it('checkLogin returns failed when not logged in', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const pageEvaluate = async (callback, ...args) => {
        return { loginPage: true };
      };
      
      const adapter = deepseekAdapter.getDoctorAdapter({ 
        page: { evaluate: pageEvaluate } 
      });
      const result = await adapter.checkLogin();
      
      assert.strictEqual(result.passed, false);
      assert.ok(result.reason);
    });

    it('checkInput returns passed when input found', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const pageEvaluate = async (callback, ...args) => {
        return { found: true, selector: 'textarea', visible: true, usable: true };
      };
      
      const adapter = deepseekAdapter.getDoctorAdapter({ 
        page: { evaluate: pageEvaluate } 
      });
      const result = await adapter.checkInput();
      
      assert.strictEqual(result.passed, true);
      assert.ok(result.selector);
    });

    it('checkInput returns failed when input not found', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const pageEvaluate = async (callback, ...args) => {
        return { found: false };
      };
      
      const adapter = deepseekAdapter.getDoctorAdapter({ 
        page: { evaluate: pageEvaluate } 
      });
      const result = await adapter.checkInput();
      
      assert.strictEqual(result.passed, false);
      assert.ok(result.reason);
    });
  });

  describe('Doctor command integration', () => {
    it('wires doctor command to runtime for DeepSeek', async () => {
      const doctorCommand = require('../../cli/commands/doctor.js');
      
      // Mock runtime dependencies
      const mockRuntime = {
        connect: async () => ({
          connected: true,
          targets: [{ id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' }],
        }),
        runDoctor: async (provider, options) => ({
          command: 'doctor',
          provider,
          healthy: true,
          checks: {
            connection: true,
            pageReachable: true,
            loginDetected: true,
            inputLocated: true,
          },
        }),
      };
      
      const result = await doctorCommand.run({
        options: { provider: 'deepseek' },
        positional: [],
        runtime: mockRuntime,
      });
      
      assert.strictEqual(result.command, 'doctor');
      assert.strictEqual(result.provider, 'deepseek');
      assert.strictEqual(result.healthy, true);
    });

    it('returns error for unsupported provider', async () => {
      const doctorCommand = require('../../cli/commands/doctor.js');
      
      const result = await doctorCommand.run({
        options: { provider: 'unknown-provider' },
        positional: [],
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'PROVIDER_NOT_FOUND');
    });

    it('requires --provider option', async () => {
      const doctorCommand = require('../../cli/commands/doctor.js');
      
      const result = await doctorCommand.run({
        options: {},
        positional: [],
      });
      
      assert.strictEqual(result.status, 'error');
      assert.ok(result.error.message.includes('provider'));
    });
  });

  describe('Runtime seam normalization', () => {
    it('normalizes adapter throwing during checkLogin', async () => {
      doctor = require('../../cli/runtime/doctor.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const throwingAdapter = {
        checkLogin: async () => { throw new Error('Network timeout'); },
        checkInput: async () => ({ passed: true }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await doctor.runDoctor('deepseek', {
        connection,
        adapter: throwingAdapter,
      });
      
      assert.strictEqual(result.healthy, false);
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'LOGIN_REQUIRED');
      assert.ok(result.error.message.includes('threw'));
      assert.strictEqual(result.checks.connection, true);
      assert.strictEqual(result.checks.pageReachable, true);
      assert.strictEqual(result.checks.loginDetected, false);
    });

    it('normalizes adapter throwing during checkInput', async () => {
      doctor = require('../../cli/runtime/doctor.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const throwingAdapter = {
        checkLogin: async () => ({ passed: true }),
        checkInput: async () => { throw new Error('DOM query failed'); },
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await doctor.runDoctor('deepseek', {
        connection,
        adapter: throwingAdapter,
      });
      
      assert.strictEqual(result.healthy, false);
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'INPUT_NOT_FOUND');
      assert.ok(result.error.message.includes('threw'));
      assert.strictEqual(result.checks.connection, true);
      assert.strictEqual(result.checks.pageReachable, true);
      assert.strictEqual(result.checks.loginDetected, true);
      assert.strictEqual(result.checks.inputLocated, false);
    });

    it('normalizes malformed adapter result shape (missing passed)', async () => {
      doctor = require('../../cli/runtime/doctor.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const malformedAdapter = {
        checkLogin: async () => ({ status: 'ok' }),
        checkInput: async () => ({ passed: true }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await doctor.runDoctor('deepseek', {
        connection,
        adapter: malformedAdapter,
      });
      
      assert.strictEqual(result.healthy, false);
      assert.strictEqual(result.error.code, 'LOGIN_REQUIRED');
      assert.ok(result.error.message.includes('invalid'));
    });

    it('normalizes malformed adapter result shape (passed is not boolean)', async () => {
      doctor = require('../../cli/runtime/doctor.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const malformedAdapter = {
        checkLogin: async () => ({ passed: 'yes' }),
        checkInput: async () => ({ passed: true }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await doctor.runDoctor('deepseek', {
        connection,
        adapter: malformedAdapter,
      });
      
      assert.strictEqual(result.healthy, false);
      assert.strictEqual(result.error.code, 'LOGIN_REQUIRED');
    });

    it('normalizes null adapter result', async () => {
      doctor = require('../../cli/runtime/doctor.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const nullAdapter = {
        checkLogin: async () => null,
        checkInput: async () => ({ passed: true }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await doctor.runDoctor('deepseek', {
        connection,
        adapter: nullAdapter,
      });
      
      assert.strictEqual(result.healthy, false);
      assert.strictEqual(result.error.code, 'LOGIN_REQUIRED');
    });
  });

  describe('DeepSeek adapter stronger seams', () => {
    it('checkLogin detects login page via sign-in button', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const mockPage = {
        evaluate: async (fn) => {
          const loginIndicators = [
            'button[class*="login"]',
            'button[class*="sign-in"]',
          ];
          const authIndicators = [
            '[class*="user-menu"]',
          ];
          return fn(loginIndicators, authIndicators);
        },
      };
      
      const pageEvaluate = async (callback, ...args) => {
        return { loginPage: true };
      };
      
      const adapter = deepseekAdapter.getDoctorAdapter({ 
        page: { evaluate: pageEvaluate } 
      });
      const result = await adapter.checkLogin();
      
      assert.strictEqual(result.passed, false);
      assert.ok(result.reason.includes('Login page'));
    });

    it('checkLogin detects authenticated user via user-menu', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const pageEvaluate = async (callback, ...args) => {
        return { loginPage: false, authenticated: true };
      };
      
      const adapter = deepseekAdapter.getDoctorAdapter({ 
        page: { evaluate: pageEvaluate } 
      });
      const result = await adapter.checkLogin();
      
      assert.strictEqual(result.passed, true);
    });

    it('checkInput rejects hidden input element', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const pageEvaluate = async (callback, ...args) => {
        return { found: true, selector: 'textarea', visible: false, usable: true };
      };
      
      const adapter = deepseekAdapter.getDoctorAdapter({ 
        page: { evaluate: pageEvaluate } 
      });
      const result = await adapter.checkInput();
      
      assert.strictEqual(result.passed, false);
      assert.ok(result.reason.includes('not visible'));
    });

    it('checkInput rejects disabled input element', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const pageEvaluate = async (callback, ...args) => {
        return { found: true, selector: 'textarea', visible: true, usable: false };
      };
      
      const adapter = deepseekAdapter.getDoctorAdapter({ 
        page: { evaluate: pageEvaluate } 
      });
      const result = await adapter.checkInput();
      
      assert.strictEqual(result.passed, false);
      assert.ok(result.reason.includes('not usable'));
    });

    it('checkInput accepts visible and usable input', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const pageEvaluate = async (callback, ...args) => {
        return { found: true, selector: 'textarea#chat-input', visible: true, usable: true };
      };
      
      const adapter = deepseekAdapter.getDoctorAdapter({ 
        page: { evaluate: pageEvaluate } 
      });
      const result = await adapter.checkInput();
      
      assert.strictEqual(result.passed, true);
      assert.strictEqual(result.selector, 'textarea#chat-input');
    });
  });

  describe('Shared helpers validation', () => {
    it('isValidCheckResult returns true for valid result', async () => {
      sharedHelpers = require('../../cli/providers/shared.js');
      
      assert.strictEqual(sharedHelpers.isValidCheckResult({ passed: true }), true);
      assert.strictEqual(sharedHelpers.isValidCheckResult({ passed: false }), true);
    });

    it('isValidCheckResult returns false for invalid result', async () => {
      sharedHelpers = require('../../cli/providers/shared.js');
      
      assert.strictEqual(sharedHelpers.isValidCheckResult(null), false);
      assert.strictEqual(sharedHelpers.isValidCheckResult(undefined), false);
      assert.strictEqual(sharedHelpers.isValidCheckResult({}), false);
      assert.strictEqual(sharedHelpers.isValidCheckResult({ passed: 'yes' }), false);
      assert.strictEqual(sharedHelpers.isValidCheckResult({ status: 'ok' }), false);
    });
  });
});

/**
 * Task 7: Ask lifecycle tests
 * 
 * These tests cover the ask lifecycle for DeepSeek:
 * - dispatch ok/fail
 * - response started true/false
 * - response completed true/false
 * - final text extraction
 */
describe('Ask Orchestration', () => {
  let ask;
  let chrome;
  let tabs;
  let deepseekAdapter;

  beforeEach(() => {
    Object.keys(require.cache).forEach(key => {
      if (key.includes('cli/runtime') || key.includes('cli/providers')) {
        delete require.cache[key];
      }
    });
  });

  describe('DeepSeek ask lifecycle', () => {
    it('returns success when all phases complete', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      tabs = require('../../cli/runtime/tabs.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const mockAdapter = {
        injectPrompt: async () => ({ success: true }),
        triggerSend: async () => ({ success: true }),
        detectResponseStart: async () => ({ started: true }),
        detectResponseComplete: async () => ({ completed: true }),
        extractFinalText: async () => ({ text: 'Hello! How can I help you?' }),
      };
      
      const mockAdapterFactory = () => mockAdapter;
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: mockAdapterFactory,
      });
      
      assert.strictEqual(result.command, 'ask');
      assert.strictEqual(result.provider, 'deepseek');
      assert.strictEqual(result.status, 'success');
      assert.ok(result.response);
      assert.strictEqual(result.response.text, 'Hello! How can I help you?');
      assert.ok(result.phases);
      assert.strictEqual(result.phases.dispatch, true);
      assert.strictEqual(result.phases.responseStarted, true);
      assert.strictEqual(result.phases.responseCompleted, true);
    });

    it('returns failure when dispatch fails', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const mockAdapter = {
        injectPrompt: async () => ({ success: false, reason: 'Input not found' }),
        triggerSend: async () => ({ success: true }),
        detectResponseStart: async () => ({ started: true }),
        detectResponseComplete: async () => ({ completed: true }),
        extractFinalText: async () => ({ text: '' }),
      };
      
      const mockAdapterFactory = () => mockAdapter;
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: mockAdapterFactory,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'DISPATCH_FAILED');
      assert.ok(result.error.message);
      assert.ok(result.error.suggestion);
      assert.strictEqual(result.phases.dispatch, false);
    });

    it('returns failure when response start not detected', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const mockAdapter = {
        injectPrompt: async () => ({ success: true }),
        triggerSend: async () => ({ success: true }),
        detectResponseStart: async () => ({ started: false, reason: 'Timeout waiting for response' }),
        detectResponseComplete: async () => ({ completed: false }),
        extractFinalText: async () => ({ text: '' }),
      };
      
      const mockAdapterFactory = () => mockAdapter;
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: mockAdapterFactory,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'RESPONSE_TIMEOUT');
      assert.ok(result.error.suggestion);
      assert.strictEqual(result.phases.dispatch, true);
      assert.strictEqual(result.phases.responseStarted, false);
    });

    it('returns failure when response not completed', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const mockAdapter = {
        injectPrompt: async () => ({ success: true }),
        triggerSend: async () => ({ success: true }),
        detectResponseStart: async () => ({ started: true }),
        detectResponseComplete: async () => ({ completed: false, reason: 'Response interrupted' }),
        extractFinalText: async () => ({ text: 'Partial response...' }),
      };
      
      const mockAdapterFactory = () => mockAdapter;
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: mockAdapterFactory,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'RESPONSE_INCOMPLETE');
      assert.ok(result.partial);
      assert.strictEqual(result.partial.text, 'Partial response...');
      assert.strictEqual(result.phases.dispatch, true);
      assert.strictEqual(result.phases.responseStarted, true);
      assert.strictEqual(result.phases.responseCompleted, false);
    });

    it('extracts final text correctly', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const expectedText = 'This is a detailed response from DeepSeek with multiple paragraphs.\n\nSecond paragraph here.';
      
      const mockAdapter = {
        injectPrompt: async () => ({ success: true }),
        triggerSend: async () => ({ success: true }),
        detectResponseStart: async () => ({ started: true }),
        detectResponseComplete: async () => ({ completed: true }),
        extractFinalText: async () => ({ text: expectedText }),
      };
      
      const mockAdapterFactory = () => mockAdapter;
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Tell me a story', {
        connection,
        adapterFactory: mockAdapterFactory,
      });
      
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.response.text, expectedText);
    });

    it('returns failure when Chrome not connected', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockCDP = {
        connect: async () => ({
          connected: false,
          error: {
            code: 'BROWSER_NOT_CONNECTED',
            message: 'Could not connect',
            suggestion: 'Start Chrome with --remote-debugging-port=9222',
          },
        }),
      };
      
      const mockAdapter = {
        injectPrompt: async () => ({ success: true }),
        triggerSend: async () => ({ success: true }),
        detectResponseStart: async () => ({ started: true }),
        detectResponseComplete: async () => ({ completed: true }),
        extractFinalText: async () => ({ text: '' }),
      };
      
      const mockAdapterFactory = () => mockAdapter;
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: mockAdapterFactory,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'BROWSER_NOT_CONNECTED');
      assert.ok(result.error.suggestion);
    });

    it('returns failure when provider tab not found', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://example.com' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
        createTarget: async () => null,
      };
      
      const mockAdapter = {
        injectPrompt: async () => ({ success: true }),
        triggerSend: async () => ({ success: true }),
        detectResponseStart: async () => ({ started: true }),
        detectResponseComplete: async () => ({ completed: true }),
        extractFinalText: async () => ({ text: '' }),
      };
      
      const mockAdapterFactory = () => mockAdapter;
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: mockAdapterFactory,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.ok(result.error.code);
    });

    it('passes tab to adapter factory', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      let receivedTab = null;
      const mockAdapterFactory = ({ tab }) => {
        receivedTab = tab;
        return {
          injectPrompt: async () => ({ success: true }),
          triggerSend: async () => ({ success: true }),
          detectResponseStart: async () => ({ started: true }),
          detectResponseComplete: async () => ({ completed: true }),
          extractFinalText: async () => ({ text: 'Response' }),
        };
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: mockAdapterFactory,
      });
      
      assert.ok(receivedTab);
      assert.strictEqual(receivedTab.id, 'tab-1');
    });

    it('returns error when adapter factory returns invalid adapter', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const mockAdapterFactory = () => null;
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: mockAdapterFactory,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'INTERNAL_ERROR');
      assert.ok(result.error.message.includes('invalid adapter'));
    });

    it('returns error when no adapter factory provided', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'INTERNAL_ERROR');
      assert.ok(result.error.message.includes('adapter factory'));
    });
  });

  describe('DeepSeek ask adapter', () => {
    it('exports required ask interface', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      assert.ok(typeof deepseekAdapter.injectPrompt === 'function');
      assert.ok(typeof deepseekAdapter.triggerSend === 'function');
      assert.ok(typeof deepseekAdapter.detectResponseStart === 'function');
      assert.ok(typeof deepseekAdapter.detectResponseComplete === 'function');
      assert.ok(typeof deepseekAdapter.extractFinalText === 'function');
      assert.ok(typeof deepseekAdapter.getAskAdapter === 'function');
    });

    it('injectPrompt returns success when input found', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const mockPage = {
        evaluate: async (fn) => {
          return { injected: true, selector: 'textarea', requestMarker: { timestamp: Date.now() } };
        },
      };
      
      const adapter = deepseekAdapter.getAskAdapter({ page: mockPage });
      const result = await adapter.injectPrompt('Hello');
      
      assert.strictEqual(result.success, true);
    });

    it('injectPrompt returns failure when input not found', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const mockPage = {
        evaluate: async (fn) => {
          return { injected: false, reason: 'Input element not found' };
        },
      };
      
      const adapter = deepseekAdapter.getAskAdapter({ page: mockPage });
      const result = await adapter.injectPrompt('Hello');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.reason);
    });

    it('triggerSend returns success when button clicked', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const mockPage = {
        evaluate: async (fn) => {
          return { clicked: true, selector: 'button', timestamp: Date.now() };
        },
      };
      
      const adapter = deepseekAdapter.getAskAdapter({ page: mockPage });
      const result = await adapter.triggerSend();
      
      assert.strictEqual(result.success, true);
    });

    it('triggerSend returns failure when button not found', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const mockPage = {
        evaluate: async (fn) => {
          return { clicked: false, reason: 'Send button not found' };
        },
      };
      
      const adapter = deepseekAdapter.getAskAdapter({ page: mockPage });
      const result = await adapter.triggerSend();
      
      assert.strictEqual(result.success, false);
      assert.ok(result.reason);
    });

    it('detectResponseStart returns true when response begins', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const mockPage = {
        evaluate: async (fn) => {
          return { started: true, indicator: 'stop-button' };
        },
      };
      
      const adapter = deepseekAdapter.getAskAdapter({ page: mockPage });
      const result = await adapter.detectResponseStart({});
      
      assert.strictEqual(result.started, true);
    });

    it('detectResponseStart returns false on timeout', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const mockPage = {
        evaluate: async (fn) => {
          return { started: false, reason: 'Timeout' };
        },
      };
      
      const adapter = deepseekAdapter.getAskAdapter({ page: mockPage });
      const result = await adapter.detectResponseStart({});
      
      assert.strictEqual(result.started, false);
      assert.ok(result.reason);
    });

    it('detectResponseComplete returns true when done', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const mockPage = {
        evaluate: async (fn) => {
          return { completed: true, confirmationSignal: 'no-active-indicators' };
        },
      };
      
      const adapter = deepseekAdapter.getAskAdapter({ page: mockPage });
      const result = await adapter.detectResponseComplete({});
      
      assert.strictEqual(result.completed, true);
    });

    it('detectResponseComplete returns false when still streaming', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const mockPage = {
        evaluate: async (fn) => {
          return { completed: false, reason: 'Still streaming' };
        },
      };
      
      const adapter = deepseekAdapter.getAskAdapter({ page: mockPage });
      const result = await adapter.detectResponseComplete({});
      
      assert.strictEqual(result.completed, false);
      assert.ok(result.reason);
    });

    it('extractFinalText returns response text', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const expectedText = 'This is the AI response.';
      const mockPage = {
        evaluate: async (fn) => {
          return { text: expectedText, selector: '.response' };
        },
      };
      
      const adapter = deepseekAdapter.getAskAdapter({ page: mockPage });
      const result = await adapter.extractFinalText({});
      
      assert.strictEqual(result.text, expectedText);
    });

    it('extractFinalText returns empty string when no response', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const mockPage = {
        evaluate: async (fn) => {
          return { text: '', reason: 'No response content found' };
        },
      };
      
      const adapter = deepseekAdapter.getAskAdapter({ page: mockPage });
      const result = await adapter.extractFinalText({});
      
      assert.strictEqual(result.text, '');
    });

    it('getAskAdapter accepts tab parameter', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const mockPage = {
        evaluate: async (fn) => ({ injected: true }),
      };
      
      const adapter = deepseekAdapter.getAskAdapter({ tab: { page: mockPage } });
      assert.ok(typeof adapter.injectPrompt === 'function');
    });

    it('getAskAdapter throws when neither page nor tab provided', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      assert.throws(() => {
        deepseekAdapter.getAskAdapter({});
      }, /requires either page or tab/);
    });
  });

  describe('Ask command integration', () => {
    it('wires ask command to runtime for DeepSeek with correct arguments', async () => {
      const askCommand = require('../../cli/commands/ask.js');
      
      let receivedProvider = null;
      let receivedPrompt = null;
      let receivedOptions = null;
      
      const mockRuntime = {
        runAsk: async (provider, prompt, options) => {
          receivedProvider = provider;
          receivedPrompt = prompt;
          receivedOptions = options;
          return {
            command: 'ask',
            provider,
            status: 'success',
            response: { text: 'Response text' },
            phases: {
              dispatch: true,
              responseStarted: true,
              responseCompleted: true,
            },
          };
        },
      };
      
      const result = await askCommand.run({
        options: { provider: 'deepseek', prompt: 'Hello world' },
        positional: [],
        runtime: mockRuntime,
      });
      
      assert.strictEqual(result.command, 'ask');
      assert.strictEqual(result.provider, 'deepseek');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(receivedProvider, 'deepseek');
      assert.strictEqual(receivedPrompt, 'Hello world');
      assert.ok(receivedOptions);
    });

    it('passes additional options to runtime', async () => {
      const askCommand = require('../../cli/commands/ask.js');
      
      let receivedOptions = null;
      
      const mockRuntime = {
        runAsk: async (provider, prompt, options) => {
          receivedOptions = options;
          return { command: 'ask', provider, status: 'success' };
        },
      };
      
      await askCommand.run({
        options: { provider: 'deepseek', prompt: 'Hello', timeout: 30000 },
        positional: [],
        runtime: mockRuntime,
      });
      
      assert.strictEqual(receivedOptions.timeout, 30000);
    });

    it('returns error for unsupported provider', async () => {
      const askCommand = require('../../cli/commands/ask.js');
      
      const result = await askCommand.run({
        options: { provider: 'unknown-provider', prompt: 'Hello' },
        positional: [],
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'PROVIDER_NOT_FOUND');
    });

    it('requires --provider option', async () => {
      const askCommand = require('../../cli/commands/ask.js');
      
      const result = await askCommand.run({
        options: { prompt: 'Hello' },
        positional: [],
      });
      
      assert.strictEqual(result.status, 'error');
      assert.ok(result.error.message.includes('provider'));
    });

    it('requires --prompt option', async () => {
      const askCommand = require('../../cli/commands/ask.js');
      
      const result = await askCommand.run({
        options: { provider: 'deepseek' },
        positional: [],
      });
      
      assert.strictEqual(result.status, 'error');
      assert.ok(result.error.message.includes('prompt'));
    });
  });

  describe('Ask runtime seam normalization', () => {
    it('normalizes adapter throwing during injectPrompt', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const throwingAdapter = {
        injectPrompt: async () => { throw new Error('DOM error'); },
        triggerSend: async () => ({ success: true }),
        detectResponseStart: async () => ({ started: true }),
        detectResponseComplete: async () => ({ completed: true }),
        extractFinalText: async () => ({ text: '' }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: () => throwingAdapter,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'DISPATCH_FAILED');
      assert.ok(result.error.message.includes('threw'));
    });

    it('normalizes adapter throwing during triggerSend', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const throwingAdapter = {
        injectPrompt: async () => ({ success: true }),
        triggerSend: async () => { throw new Error('Click failed'); },
        detectResponseStart: async () => ({ started: true }),
        detectResponseComplete: async () => ({ completed: true }),
        extractFinalText: async () => ({ text: '' }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: () => throwingAdapter,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'DISPATCH_FAILED');
      assert.ok(result.error.message.includes('threw'));
    });

    it('normalizes adapter throwing during detectResponseStart', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const throwingAdapter = {
        injectPrompt: async () => ({ success: true }),
        triggerSend: async () => ({ success: true }),
        detectResponseStart: async () => { throw new Error('Observer error'); },
        detectResponseComplete: async () => ({ completed: true }),
        extractFinalText: async () => ({ text: '' }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: () => throwingAdapter,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'RESPONSE_TIMEOUT');
      assert.ok(result.error.message.includes('threw'));
    });

    it('normalizes adapter throwing during detectResponseComplete', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const throwingAdapter = {
        injectPrompt: async () => ({ success: true }),
        triggerSend: async () => ({ success: true }),
        detectResponseStart: async () => ({ started: true }),
        detectResponseComplete: async () => { throw new Error('Stream error'); },
        extractFinalText: async () => ({ text: '' }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: () => throwingAdapter,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'RESPONSE_INCOMPLETE');
      assert.ok(result.error.message.includes('threw'));
    });

    it('normalizes adapter throwing during extractFinalText', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const throwingAdapter = {
        injectPrompt: async () => ({ success: true }),
        triggerSend: async () => ({ success: true }),
        detectResponseStart: async () => ({ started: true }),
        detectResponseComplete: async () => ({ completed: true }),
        extractFinalText: async () => { throw new Error('Extraction failed'); },
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: () => throwingAdapter,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'TEXT_EXTRACTION_FAILED');
      assert.ok(result.error.message.includes('threw'));
    });

    it('normalizes malformed adapter result shape', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const malformedAdapter = {
        injectPrompt: async () => ({ status: 'ok' }),
        triggerSend: async () => ({ success: true }),
        detectResponseStart: async () => ({ started: true }),
        detectResponseComplete: async () => ({ completed: true }),
        extractFinalText: async () => ({ text: '' }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: () => malformedAdapter,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'DISPATCH_FAILED');
      assert.ok(result.error.message.includes('invalid'));
    });
  });

  describe('Structured failure recovery suggestions', () => {
    it('includes recovery suggestion for dispatch failure', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const mockAdapter = {
        injectPrompt: async () => ({ success: false, reason: 'Input not found' }),
        triggerSend: async () => ({ success: true }),
        detectResponseStart: async () => ({ started: true }),
        detectResponseComplete: async () => ({ completed: true }),
        extractFinalText: async () => ({ text: '' }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: () => mockAdapter,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.ok(result.error.suggestion);
      assert.ok(result.error.suggestion.length > 0);
    });

    it('includes recovery suggestion for response timeout', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const mockAdapter = {
        injectPrompt: async () => ({ success: true }),
        triggerSend: async () => ({ success: true }),
        detectResponseStart: async () => ({ started: false, reason: 'Timeout' }),
        detectResponseComplete: async () => ({ completed: false }),
        extractFinalText: async () => ({ text: '' }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: () => mockAdapter,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.ok(result.error.suggestion);
      assert.ok(result.error.suggestion.length > 0);
    });

    it('includes recovery suggestion for incomplete response', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const mockAdapter = {
        injectPrompt: async () => ({ success: true }),
        triggerSend: async () => ({ success: true }),
        detectResponseStart: async () => ({ started: true }),
        detectResponseComplete: async () => ({ completed: false, reason: 'Interrupted' }),
        extractFinalText: async () => ({ text: 'Partial' }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: () => mockAdapter,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.ok(result.error.suggestion);
      assert.ok(result.error.suggestion.length > 0);
    });
  });

  describe('Brittle seams: stale content and false positives', () => {
    it('detectResponseStart rejects stale pre-existing assistant content', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const requestTimestamp = Date.now();
      const staleTimestamp = requestTimestamp - 60000;
      
      const mockPage = {
        evaluate: async (fn, ...args) => {
          const [stopSelectors, responseSelectors, streamingIndicators, reqTimestamp] = args;
          
          return { 
            started: false, 
            reason: 'Response content exists but predates request (stale content)',
            staleContentDetected: true,
          };
        },
      };
      
      const adapter = deepseekAdapter.getAskAdapter({ page: mockPage });
      const result = await adapter.detectResponseStart({ requestTimestamp });
      
      assert.strictEqual(result.started, false);
      assert.ok(result.staleContentDetected);
    });

    it('detectResponseStart accepts new content after request timestamp', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const requestTimestamp = Date.now() - 1000;
      
      const mockPage = {
        evaluate: async (fn, ...args) => {
          return { 
            started: true, 
            indicator: 'response-content',
            responseMarker: { type: 'content-detected', timestamp: Date.now() },
          };
        },
      };
      
      const adapter = deepseekAdapter.getAskAdapter({ page: mockPage });
      const result = await adapter.detectResponseStart({ requestTimestamp });
      
      assert.strictEqual(result.started, true);
    });

    it('detectResponseComplete uses multiple confirmation signals', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const mockPage = {
        evaluate: async (fn) => {
          return { 
            completed: true, 
            confirmationSignal: 'regenerate-button-available',
          };
        },
      };
      
      const adapter = deepseekAdapter.getAskAdapter({ page: mockPage });
      const result = await adapter.detectResponseComplete({});
      
      assert.strictEqual(result.completed, true);
      assert.ok(result.confirmationSignal);
    });

    it('detectResponseComplete returns false when stop button visible', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const mockPage = {
        evaluate: async (fn) => {
          return { 
            completed: false, 
            reason: 'Stop button still visible - response in progress',
          };
        },
      };
      
      const adapter = deepseekAdapter.getAskAdapter({ page: mockPage });
      const result = await adapter.detectResponseComplete({});
      
      assert.strictEqual(result.completed, false);
    });

    it('extractFinalText prefers request-scoped content over historical', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const requestTimestamp = Date.now() - 1000;
      
      const mockPage = {
        evaluate: async (fn, ...args) => {
          return { 
            text: 'New response text',
            selector: '.assistant-message',
            extractionMethod: 'request-scoped',
          };
        },
      };
      
      const adapter = deepseekAdapter.getAskAdapter({ page: mockPage });
      const result = await adapter.extractFinalText({ requestTimestamp });
      
      assert.strictEqual(result.text, 'New response text');
      assert.strictEqual(result.extractionMethod, 'request-scoped');
    });

    it('extractFinalText uses fallback when no request-scoped content found', async () => {
      deepseekAdapter = require('../../cli/providers/deepseek.js');
      
      const mockPage = {
        evaluate: async (fn, ...args) => {
          return { 
            text: 'Fallback response text',
            selector: '.response',
            extractionMethod: 'fallback-newest',
            warning: 'Could not definitively identify request-scoped response',
          };
        },
      };
      
      const adapter = deepseekAdapter.getAskAdapter({ page: mockPage });
      const result = await adapter.extractFinalText({ requestTimestamp: Date.now() });
      
      assert.strictEqual(result.text, 'Fallback response text');
      assert.ok(result.warning);
    });
  });

  describe('Incomplete response extraction failure handling', () => {
    it('preserves extraction failure signal in incomplete response', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const mockAdapter = {
        injectPrompt: async () => ({ success: true }),
        triggerSend: async () => ({ success: true }),
        detectResponseStart: async () => ({ started: true }),
        detectResponseComplete: async () => ({ completed: false, reason: 'Interrupted' }),
        extractFinalText: async () => ({ text: '', extractionFailed: true, reason: 'DOM error' }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: () => mockAdapter,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'RESPONSE_INCOMPLETE');
      assert.ok(result.partial);
      assert.strictEqual(result.partial.extractionFailed, true);
      assert.ok(result.partial.extractionReason);
    });

    it('distinguishes empty text from extraction failure', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const mockAdapter = {
        injectPrompt: async () => ({ success: true }),
        triggerSend: async () => ({ success: true }),
        detectResponseStart: async () => ({ started: true }),
        detectResponseComplete: async () => ({ completed: false, reason: 'Interrupted' }),
        extractFinalText: async () => ({ text: '', extractionFailed: false }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: () => mockAdapter,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.partial.text, '');
      assert.strictEqual(result.partial.extractionFailed, false);
    });

    it('returns TEXT_EXTRACTION_FAILED when extraction fails after completion', async () => {
      ask = require('../../cli/runtime/ask.js');
      chrome = require('../../cli/runtime/chrome.js');
      
      const mockTargets = [
        { id: 'tab-1', type: 'page', url: 'https://chat.deepseek.com/' },
      ];
      
      const mockCDP = {
        connect: async () => ({ connected: true, targets: mockTargets }),
      };
      
      const mockAdapter = {
        injectPrompt: async () => ({ success: true }),
        triggerSend: async () => ({ success: true }),
        detectResponseStart: async () => ({ started: true }),
        detectResponseComplete: async () => ({ completed: true }),
        extractFinalText: async () => ({ text: '', extractionFailed: true, reason: 'No content found' }),
      };
      
      const connection = await chrome.connect({ cdp: mockCDP, port: 9222 });
      const result = await ask.runAsk('deepseek', 'Hello', {
        connection,
        adapterFactory: () => mockAdapter,
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'TEXT_EXTRACTION_FAILED');
    });
  });
});
