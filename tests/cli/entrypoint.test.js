const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const path = require('path');

describe('CLI Entrypoint', () => {
  let cliPath;
  
  beforeEach(() => {
    cliPath = path.join(__dirname, '..', '..', 'cli', 'index.js');
    Object.keys(require.cache).forEach(key => {
      if (key.includes('cli/')) {
        delete require.cache[key];
      }
    });
  });

  describe('Main path execution', () => {
    it('outputs JSON to stdout when run as main', async () => {
      const result = await new Promise((resolve, reject) => {
        const child = spawn('node', [cliPath, 'help'], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        child.on('close', (code) => {
          resolve({ stdout, stderr, code });
        });
        
        child.on('error', reject);
      });
      
      assert.ok(result.stdout.length > 0, 'Should have stdout output');
      
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.json, true);
      assert.strictEqual(parsed.command, 'help');
      assert.strictEqual(parsed.status, 'success');
    });

    it('sets exit code 0 for success', async () => {
      const result = await new Promise((resolve, reject) => {
        const child = spawn('node', [cliPath, 'help'], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        
        child.on('close', (code) => resolve(code));
        child.on('error', reject);
      });
      
      assert.strictEqual(result, 0);
    });

    it('sets exit code 1 for unknown command', async () => {
      const result = await new Promise((resolve, reject) => {
        const child = spawn('node', [cliPath, 'unknown-command'], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        
        let stdout = '';
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.on('close', (code) => resolve({ code, stdout }));
        child.on('error', reject);
      });
      
      assert.strictEqual(result.code, 1);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.status, 'error');
      assert.strictEqual(parsed.error.code, 'UNKNOWN_COMMAND');
    });

    it('sets exit code 4 for provider not found', async () => {
      const result = await new Promise((resolve, reject) => {
        const child = spawn('node', [cliPath, 'doctor', '--provider', 'unknown-provider'], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        
        let stdout = '';
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.on('close', (code) => resolve({ code, stdout }));
        child.on('error', reject);
      });
      
      assert.strictEqual(result.code, 4);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.status, 'error');
      assert.strictEqual(parsed.error.code, 'PROVIDER_NOT_FOUND');
    });
  });

  describe('run function', () => {
    it('can be imported and called programmatically', async () => {
      const { run } = require('../../cli/index.js');
      
      const result = await run(['help']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.json, true);
    });

    it('returns error for unknown command', async () => {
      const { run } = require('../../cli/index.js');
      
      const result = await run(['unknown-command']);
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'UNKNOWN_COMMAND');
    });

    it('passes runtime to command handlers', async () => {
      const { run } = require('../../cli/index.js');
      
      const result = await run(['doctor', '--provider', 'deepseek']);
      
      assert.strictEqual(result.command, 'doctor');
      assert.strictEqual(result.provider, 'deepseek');
    });
  });

  describe('parseArgs', () => {
    it('parses command and options', async () => {
      const { parseArgs } = require('../../cli/index.js');
      
      const result = parseArgs(['ask', '--provider', 'deepseek', '--prompt', 'hello']);
      
      assert.strictEqual(result.command, 'ask');
      assert.strictEqual(result.options.provider, 'deepseek');
      assert.strictEqual(result.options.prompt, 'hello');
    });

    it('parses --option=value syntax', async () => {
      const { parseArgs } = require('../../cli/index.js');
      
      const result = parseArgs(['ask', '--provider=gemini', '--prompt=test']);
      
      assert.strictEqual(result.command, 'ask');
      assert.strictEqual(result.options.provider, 'gemini');
      assert.strictEqual(result.options.prompt, 'test');
    });

    it('detects --help flag', async () => {
      const { parseArgs } = require('../../cli/index.js');
      
      const result = parseArgs(['ask', '--help']);
      
      assert.strictEqual(result.command, 'ask');
      assert.strictEqual(result.hasHelp, true);
    });

    it('detects -h flag', async () => {
      const { parseArgs } = require('../../cli/index.js');
      
      const result = parseArgs(['ask', '-h']);
      
      assert.strictEqual(result.command, 'ask');
      assert.strictEqual(result.hasHelp, true);
    });

    it('collects positional arguments', async () => {
      const { parseArgs } = require('../../cli/index.js');
      
      const result = parseArgs(['help', 'ask', 'providers']);
      
      assert.strictEqual(result.command, 'help');
      assert.deepStrictEqual(result.positional, ['ask', 'providers']);
    });
  });
});

describe('Default Runtime', () => {
  let defaultRuntime;
  
  beforeEach(() => {
    Object.keys(require.cache).forEach(key => {
      if (key.includes('cli/')) {
        delete require.cache[key];
      }
    });
    defaultRuntime = require('../../cli/runtime/default.js');
  });

  describe('Runtime interface', () => {
    it('exports runAsk function', () => {
      assert.ok(typeof defaultRuntime.runAsk === 'function');
    });

    it('exports runDoctor function', () => {
      assert.ok(typeof defaultRuntime.runDoctor === 'function');
    });

    it('exports connect function', () => {
      assert.ok(typeof defaultRuntime.connect === 'function');
    });

    it('exports getProviderAdapter function', () => {
      assert.ok(typeof defaultRuntime.getProviderAdapter === 'function');
    });
  });

  describe('Provider adapter registry', () => {
    it('returns adapter for deepseek', () => {
      const adapter = defaultRuntime.getProviderAdapter('deepseek');
      assert.ok(adapter);
      assert.ok(typeof adapter.getAskAdapter === 'function');
      assert.ok(typeof adapter.getDoctorAdapter === 'function');
    });

    it('returns adapter for gemini', () => {
      const adapter = defaultRuntime.getProviderAdapter('gemini');
      assert.ok(adapter);
      assert.ok(typeof adapter.getAskAdapter === 'function');
      assert.ok(typeof adapter.getDoctorAdapter === 'function');
    });

    it('returns adapter for grok', () => {
      const adapter = defaultRuntime.getProviderAdapter('grok');
      assert.ok(adapter);
      assert.ok(typeof adapter.getAskAdapter === 'function');
      assert.ok(typeof adapter.getDoctorAdapter === 'function');
    });

    it('returns null for unknown provider', () => {
      const adapter = defaultRuntime.getProviderAdapter('unknown');
      assert.strictEqual(adapter, null);
    });
  });

  describe('runDoctor with default runtime', () => {
    it('returns error when browser not connected', async () => {
      const result = await defaultRuntime.runDoctor('deepseek');
      
      assert.strictEqual(result.command, 'doctor');
      assert.strictEqual(result.provider, 'deepseek');
      assert.strictEqual(result.healthy, false);
      assert.strictEqual(result.status, 'error');
      assert.ok(['BROWSER_NOT_CONNECTED', 'INTERNAL_ERROR'].includes(result.error.code));
    });

    it('returns error for unknown provider', async () => {
      const result = await defaultRuntime.runDoctor('unknown-provider');
      
      assert.strictEqual(result.command, 'doctor');
      assert.strictEqual(result.provider, 'unknown-provider');
      assert.strictEqual(result.healthy, false);
      assert.strictEqual(result.error.code, 'PROVIDER_NOT_FOUND');
    });
  });

  describe('runAsk with default runtime', () => {
    it('returns error when browser not connected', async () => {
      const result = await defaultRuntime.runAsk('deepseek', 'test prompt');
      
      assert.strictEqual(result.command, 'ask');
      assert.strictEqual(result.provider, 'deepseek');
      assert.strictEqual(result.status, 'error');
      assert.ok(['BROWSER_NOT_CONNECTED', 'INTERNAL_ERROR'].includes(result.error.code));
    });

    it('returns error for unknown provider', async () => {
      const result = await defaultRuntime.runAsk('unknown-provider', 'test prompt');
      
      assert.strictEqual(result.command, 'ask');
      assert.strictEqual(result.provider, 'unknown-provider');
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'PROVIDER_NOT_FOUND');
    });
  });
});

describe('Command Runtime Injection', () => {
  beforeEach(() => {
    Object.keys(require.cache).forEach(key => {
      if (key.includes('cli/')) {
        delete require.cache[key];
      }
    });
  });

  describe('ask command', () => {
    it('uses injected runtime when provided', async () => {
      const askCommand = require('../../cli/commands/ask.js');
      
      const mockRuntime = {
        runAsk: async (providerId, prompt, options) => ({
          command: 'ask',
          status: 'success',
          provider: providerId,
          response: { text: 'mocked response' },
          phases: { dispatch: true, responseStarted: true, responseCompleted: true },
          json: true,
        }),
      };
      
      const result = await askCommand.run({
        options: { provider: 'deepseek', prompt: 'test' },
        positional: [],
        runtime: mockRuntime,
      });
      
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.response.text, 'mocked response');
    });

    it('returns error when runtime not provided', async () => {
      const askCommand = require('../../cli/commands/ask.js');
      
      const result = await askCommand.run({
        options: { provider: 'deepseek', prompt: 'test' },
        positional: [],
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'INTERNAL_ERROR');
      assert.ok(result.error.message.includes('Runtime'));
    });
  });

  describe('doctor command', () => {
    it('uses injected runtime when provided', async () => {
      const doctorCommand = require('../../cli/commands/doctor.js');
      
      const mockRuntime = {
        runDoctor: async (providerId, options) => ({
          command: 'doctor',
          status: 'success',
          provider: providerId,
          healthy: true,
          checks: { connection: true, pageReachable: true, loginDetected: true, inputLocated: true },
          json: true,
        }),
      };
      
      const result = await doctorCommand.run({
        options: { provider: 'deepseek' },
        positional: [],
        runtime: mockRuntime,
      });
      
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.healthy, true);
    });

    it('returns error when runtime not provided', async () => {
      const doctorCommand = require('../../cli/commands/doctor.js');
      
      const result = await doctorCommand.run({
        options: { provider: 'deepseek' },
        positional: [],
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'INTERNAL_ERROR');
      assert.ok(result.error.message.includes('Runtime'));
    });
  });
});

describe('Documentation Contract Tests', () => {
  beforeEach(() => {
    Object.keys(require.cache).forEach(key => {
      if (key.includes('cli/')) {
        delete require.cache[key];
      }
    });
  });

  describe('ask result schema', () => {
    it('phases are at top level, not inside response', async () => {
      const { makeAskSuccess } = require('../../cli/runtime/contracts.js');
      
      const result = makeAskSuccess({
        provider: 'deepseek',
        response: { text: 'test' },
        phases: { dispatch: true, responseStarted: true, responseCompleted: true },
      });
      
      assert.ok(result.phases, 'phases should exist at top level');
      assert.ok(!result.response.phases, 'phases should NOT be inside response');
      assert.strictEqual(typeof result.phases.dispatch, 'boolean');
      assert.strictEqual(typeof result.phases.responseStarted, 'boolean');
      assert.strictEqual(typeof result.phases.responseCompleted, 'boolean');
    });

    it('phases field names match documentation', async () => {
      const { makeAskSuccess } = require('../../cli/runtime/contracts.js');
      
      const result = makeAskSuccess({
        provider: 'deepseek',
        response: { text: 'test' },
        phases: { dispatch: true, responseStarted: true, responseCompleted: true },
      });
      
      const expectedPhaseKeys = ['dispatch', 'responseStarted', 'responseCompleted'];
      assert.deepStrictEqual(Object.keys(result.phases).sort(), expectedPhaseKeys.sort());
    });
  });

  describe('doctor result schema', () => {
    it('checks use camelCase field names', async () => {
      const { makeDoctorResult } = require('../../cli/runtime/contracts.js');
      
      const result = makeDoctorResult({
        provider: 'deepseek',
        healthy: true,
        checks: {
          connection: true,
          pageReachable: true,
          loginDetected: true,
          inputLocated: true,
        },
      });
      
      assert.strictEqual(result.checks.connection, true);
      assert.strictEqual(result.checks.pageReachable, true);
      assert.strictEqual(result.checks.loginDetected, true);
      assert.strictEqual(result.checks.inputLocated, true);
    });

    it('checks do not use snake_case field names', async () => {
      const { makeDoctorResult } = require('../../cli/runtime/contracts.js');
      
      const result = makeDoctorResult({
        provider: 'deepseek',
        healthy: true,
        checks: {
          connection: true,
          pageReachable: true,
          loginDetected: true,
          inputLocated: true,
        },
      });
      
      assert.ok(!('browser_connected' in result.checks));
      assert.ok(!('page_reachable' in result.checks));
      assert.ok(!('login_detected' in result.checks));
      assert.ok(!('input_located' in result.checks));
    });
  });
});
