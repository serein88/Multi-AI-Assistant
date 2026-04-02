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
