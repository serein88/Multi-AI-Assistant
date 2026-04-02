const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

let registry;

describe('CLI Provider Registry', () => {
  describe('MVP provider list', () => {
    it('exposes exactly the three MVP providers: grok, deepseek, gemini', () => {
      registry = require('../../cli/providers/registry.js');
      
      const providerIds = registry.getProviderIds();
      
      assert.deepStrictEqual(providerIds.sort(), ['deepseek', 'gemini', 'grok']);
    });

    it('getProviders returns array with exactly 3 providers', () => {
      registry = require('../../cli/providers/registry.js');
      
      const providers = registry.getProviders();
      
      assert.strictEqual(providers.length, 3);
    });
  });

  describe('Provider metadata schema', () => {
    beforeEach(() => {
      registry = require('../../cli/providers/registry.js');
    });

    it('each provider has required fields: id, implemented, ask_supported, doctor_supported, login_required, known_risks', () => {
      const providers = registry.getProviders();
      const requiredFields = ['id', 'implemented', 'ask_supported', 'doctor_supported', 'login_required', 'known_risks'];
      
      for (const provider of providers) {
        for (const field of requiredFields) {
          assert.ok(field in provider, `Provider ${provider.id} missing field: ${field}`);
        }
      }
    });

    it('id is a string matching provider identifier', () => {
      const providers = registry.getProviders();
      
      for (const provider of providers) {
        assert.strictEqual(typeof provider.id, 'string');
        assert.ok(['deepseek', 'gemini', 'grok'].includes(provider.id));
      }
    });

    it('implemented is a boolean', () => {
      const providers = registry.getProviders();
      
      for (const provider of providers) {
        assert.strictEqual(typeof provider.implemented, 'boolean');
      }
    });

    it('ask_supported is a boolean', () => {
      const providers = registry.getProviders();
      
      for (const provider of providers) {
        assert.strictEqual(typeof provider.ask_supported, 'boolean');
      }
    });

    it('doctor_supported is a boolean', () => {
      const providers = registry.getProviders();
      
      for (const provider of providers) {
        assert.strictEqual(typeof provider.doctor_supported, 'boolean');
      }
    });

    it('login_required is a boolean', () => {
      const providers = registry.getProviders();
      
      for (const provider of providers) {
        assert.strictEqual(typeof provider.login_required, 'boolean');
      }
    });

    it('known_risks is an array of strings', () => {
      const providers = registry.getProviders();
      
      for (const provider of providers) {
        assert.ok(Array.isArray(provider.known_risks), `${provider.id} known_risks should be array`);
        for (const risk of provider.known_risks) {
          assert.strictEqual(typeof risk, 'string');
        }
      }
    });
  });

  describe('getProviderById', () => {
    beforeEach(() => {
      registry = require('../../cli/providers/registry.js');
    });

    it('returns provider metadata for valid id', () => {
      const deepseek = registry.getProviderById('deepseek');
      const gemini = registry.getProviderById('gemini');
      const grok = registry.getProviderById('grok');
      
      assert.strictEqual(deepseek.id, 'deepseek');
      assert.strictEqual(gemini.id, 'gemini');
      assert.strictEqual(grok.id, 'grok');
    });

    it('returns null for unknown provider id', () => {
      const unknown = registry.getProviderById('chatgpt');
      const invalid = registry.getProviderById('nonexistent');
      
      assert.strictEqual(unknown, null);
      assert.strictEqual(invalid, null);
    });
  });

  describe('Provider-specific metadata', () => {
    beforeEach(() => {
      registry = require('../../cli/providers/registry.js');
    });

    it('all MVP providers have implemented=true', () => {
      const providers = registry.getProviders();
      
      for (const provider of providers) {
        assert.strictEqual(provider.implemented, true, `${provider.id} should be implemented`);
      }
    });

    it('all MVP providers have ask_supported=true', () => {
      const providers = registry.getProviders();
      
      for (const provider of providers) {
        assert.strictEqual(provider.ask_supported, true, `${provider.id} should support ask`);
      }
    });

    it('all MVP providers have doctor_supported=true', () => {
      const providers = registry.getProviders();
      
      for (const provider of providers) {
        assert.strictEqual(provider.doctor_supported, true, `${provider.id} should support doctor`);
      }
    });

    it('all MVP providers have login_required=true', () => {
      const providers = registry.getProviders();
      
      for (const provider of providers) {
        assert.strictEqual(provider.login_required, true, `${provider.id} should require login`);
      }
    });

    it('grok has known_risks documenting response-start instability', () => {
      const grok = registry.getProviderById('grok');
      
      assert.ok(grok.known_risks.length > 0, 'grok should have known risks documented');
      const hasResponseRisk = grok.known_risks.some(risk => 
        risk.toLowerCase().includes('response') || 
        risk.toLowerCase().includes('unstable') ||
        risk.toLowerCase().includes('timeout')
      );
      assert.ok(hasResponseRisk, 'grok should document response-related risks');
    });
  });

  describe('JSON serialization', () => {
    it('provider metadata is JSON-serializable', () => {
      registry = require('../../cli/providers/registry.js');
      
      const providers = registry.getProviders();
      
      for (const provider of providers) {
        const json = JSON.stringify(provider);
        const parsed = JSON.parse(json);
        assert.strictEqual(parsed.id, provider.id);
      }
    });

    it('getProviders result can be serialized and deserialized', () => {
      registry = require('../../cli/providers/registry.js');
      
      const providers = registry.getProviders();
      const json = JSON.stringify(providers);
      const parsed = JSON.parse(json);
      
      assert.strictEqual(parsed.length, 3);
      assert.deepStrictEqual(parsed.map(p => p.id).sort(), ['deepseek', 'gemini', 'grok']);
    });
  });

  describe('Immutability and mutation safety', () => {
    beforeEach(() => {
      registry = require('../../cli/providers/registry.js');
    });

    it('mutating returned provider object does not affect future calls', () => {
      const first = registry.getProviderById('grok');
      first.implemented = false;
      first.ask_supported = false;
      first.customField = 'injected';
      
      const second = registry.getProviderById('grok');
      
      assert.strictEqual(second.implemented, true);
      assert.strictEqual(second.ask_supported, true);
      assert.ok(!('customField' in second));
    });

    it('mutating known_risks array does not affect future calls', () => {
      const first = registry.getProviderById('grok');
      const originalLength = first.known_risks.length;
      
      first.known_risks.push('new risk');
      first.known_risks[0] = 'modified risk';
      
      const second = registry.getProviderById('grok');
      
      assert.strictEqual(second.known_risks.length, originalLength);
      assert.ok(!second.known_risks.includes('new risk'));
      assert.ok(!second.known_risks.includes('modified risk'));
    });

    it('mutating getProviders array does not affect future calls', () => {
      const first = registry.getProviders();
      first.push({ id: 'fake', implemented: false });
      first[0].id = 'hijacked';
      
      const second = registry.getProviders();
      
      assert.strictEqual(second.length, 3);
      assert.strictEqual(second[0].id, 'deepseek');
    });

    it('mutating provider from getProviders does not affect getProviderById', () => {
      const providers = registry.getProviders();
      const grokFromList = providers.find(p => p.id === 'grok');
      grokFromList.known_risks.push('injected');
      grokFromList.implemented = false;
      
      const grokById = registry.getProviderById('grok');
      
      assert.strictEqual(grokById.implemented, true);
      assert.ok(!grokById.known_risks.includes('injected'));
    });
  });

  describe('Registry invariants', () => {
    beforeEach(() => {
      registry = require('../../cli/providers/registry.js');
    });

    it('providers are returned in stable, deterministic order', () => {
      const first = registry.getProviders();
      const second = registry.getProviders();
      
      assert.deepStrictEqual(
        first.map(p => p.id),
        second.map(p => p.id)
      );
      
      assert.deepStrictEqual(
        first.map(p => p.id),
        ['deepseek', 'gemini', 'grok']
      );
    });

    it('all provider IDs are unique', () => {
      const providers = registry.getProviders();
      const ids = providers.map(p => p.id);
      const uniqueIds = new Set(ids);
      
      assert.strictEqual(ids.length, uniqueIds.size);
    });

    it('getProviderIds matches IDs from getProviders', () => {
      const ids = registry.getProviderIds();
      const providers = registry.getProviders();
      
      assert.deepStrictEqual(ids, providers.map(p => p.id));
    });

    it('provider output shape is exactly the expected fields', () => {
      const providers = registry.getProviders();
      const expectedFields = ['id', 'implemented', 'ask_supported', 'doctor_supported', 'login_required', 'known_risks'];
      
      for (const provider of providers) {
        const keys = Object.keys(provider).sort();
        assert.deepStrictEqual(keys, expectedFields.sort(), `Provider ${provider.id} has unexpected fields`);
      }
    });

    it('no extra fields leak into provider output', () => {
      const grok = registry.getProviderById('grok');
      
      assert.strictEqual(Object.keys(grok).length, 6);
      assert.ok(!('url' in grok));
      assert.ok(!('label' in grok));
    });
  });
});
