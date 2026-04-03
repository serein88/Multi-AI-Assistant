/**
 * @fileoverview Tests for CLI command routing and help behavior
 * 
 * Task 2: CLI entry point and command routing skeleton
 * 
 * Tests cover:
 * - Command routing (ask, providers, doctor, help)
 * - Unknown command handling
 * - Help text for each public command
 * - JSON-first output structure
 * - Parser edge cases
 * - Handler dispatch verification
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

let cli;

describe('CLI Command Routing', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../../cli/index.js')];
    cli = require('../../cli/index.js');
  });

  describe('Command dispatch', () => {
    it('routes "ask" command to ask handler', async () => {
      const result = await cli.run(['ask', '--provider', 'deepseek', '--prompt', 'test']);
      
      assert.strictEqual(result.command, 'ask');
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.json, true);
      assert.ok(result.error);
      assert.strictEqual(result.error.code, 'INTERNAL_ERROR');
      assert.ok(result.error.message.includes('Runtime'));
    });

    it('routes "providers" command to providers handler', async () => {
      const result = await cli.run(['providers']);
      
      assert.strictEqual(result.command, 'providers');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.json, true);
      assert.ok(Array.isArray(result.providers));
      assert.strictEqual(result.providers.length, 3);
    });

    it('routes "doctor" command to doctor handler', async () => {
      const result = await cli.run(['doctor', '--provider', 'deepseek']);
      
      assert.strictEqual(result.command, 'doctor');
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.json, true);
      assert.ok(result.error);
    });

    it('routes "help" command to help handler', async () => {
      const result = await cli.run(['help']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.json, true);
    });

    it('routes no command to help handler (default)', async () => {
      const result = await cli.run([]);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.json, true);
    });
  });

  describe('Unknown command handling', () => {
    it('returns structured error for unknown command', async () => {
      const result = await cli.run(['unknown-command']);
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.command, null);
      assert.strictEqual(result.error.code, 'UNKNOWN_COMMAND');
      assert.strictEqual(result.error.message, 'Unknown command: unknown-command');
      assert.ok(result.error.suggestion);
      assert.strictEqual(result.json, true);
    });

    it('includes ALL available commands in error suggestion', async () => {
      const result = await cli.run(['foo']);
      
      const suggestion = result.error.suggestion;
      assert.ok(suggestion.includes('ask'), 'suggestion should include ask');
      assert.ok(suggestion.includes('providers'), 'suggestion should include providers');
      assert.ok(suggestion.includes('doctor'), 'suggestion should include doctor');
      assert.ok(suggestion.includes('help'), 'suggestion should include help');
    });
  });

  describe('--help flag', () => {
    it('shows help for "ask --help"', async () => {
      const result = await cli.run(['ask', '--help']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.json, true);
      assert.ok(result.helpText);
      assert.ok(result.helpText.includes('multi-ai ask'));
    });

    it('shows help for "providers --help"', async () => {
      const result = await cli.run(['providers', '--help']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.json, true);
      assert.ok(result.helpText);
      assert.ok(result.helpText.includes('multi-ai providers'));
    });

    it('shows help for "doctor --help"', async () => {
      const result = await cli.run(['doctor', '--help']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.json, true);
      assert.ok(result.helpText);
      assert.ok(result.helpText.includes('multi-ai doctor'));
    });

    it('shows help for "help --help"', async () => {
      const result = await cli.run(['help', '--help']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.json, true);
      assert.ok(result.helpText);
      assert.ok(result.helpText.includes('multi-ai help'));
    });
  });

  describe('help command with argument', () => {
    it('shows help for "help ask"', async () => {
      const result = await cli.run(['help', 'ask']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.ok(result.helpText.includes('multi-ai ask'));
    });

    it('shows help for "help providers"', async () => {
      const result = await cli.run(['help', 'providers']);
      
      assert.strictEqual(result.command, 'help');
      assert.ok(result.helpText.includes('multi-ai providers'));
    });

    it('shows help for "help doctor"', async () => {
      const result = await cli.run(['help', 'doctor']);
      
      assert.strictEqual(result.command, 'help');
      assert.ok(result.helpText.includes('multi-ai doctor'));
    });

    it('returns error for unknown help topic', async () => {
      const result = await cli.run(['help', 'nonexistent']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'UNKNOWN_TOPIC');
      assert.ok(result.error.suggestion.includes('ask'));
      assert.ok(result.error.suggestion.includes('providers'));
      assert.ok(result.error.suggestion.includes('doctor'));
      assert.ok(result.error.suggestion.includes('help'));
    });
  });
});

describe('CLI Help Text', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../../cli/index.js')];
    cli = require('../../cli/index.js');
  });

  describe('ask command help', () => {
    it('includes PURPOSE section', async () => {
      const result = await cli.run(['ask', '--help']);
      
      assert.ok(result.helpText.includes('PURPOSE'));
    });

    it('includes required arguments', async () => {
      const result = await cli.run(['ask', '--help']);
      
      assert.ok(result.helpText.includes('--provider'));
      assert.ok(result.helpText.includes('--prompt'));
    });

    it('includes EXAMPLES section', async () => {
      const result = await cli.run(['ask', '--help']);
      
      assert.ok(result.helpText.includes('EXAMPLES'));
    });

    it('includes JSON OUTPUT section', async () => {
      const result = await cli.run(['ask', '--help']);
      
      assert.ok(result.helpText.includes('JSON OUTPUT'));
    });
  });

  describe('providers command help', () => {
    it('includes PURPOSE section', async () => {
      const result = await cli.run(['providers', '--help']);
      
      assert.ok(result.helpText.includes('PURPOSE'));
    });

    it('includes JSON OUTPUT section', async () => {
      const result = await cli.run(['providers', '--help']);
      
      assert.ok(result.helpText.includes('JSON OUTPUT'));
    });
  });

  describe('doctor command help', () => {
    it('includes PURPOSE section', async () => {
      const result = await cli.run(['doctor', '--help']);
      
      assert.ok(result.helpText.includes('PURPOSE'));
    });

    it('includes required arguments', async () => {
      const result = await cli.run(['doctor', '--help']);
      
      assert.ok(result.helpText.includes('--provider'));
    });

    it('includes JSON OUTPUT section', async () => {
      const result = await cli.run(['doctor', '--help']);
      
      assert.ok(result.helpText.includes('JSON OUTPUT'));
    });
  });

  describe('help command help', () => {
    it('includes PURPOSE section', async () => {
      const result = await cli.run(['help', '--help']);
      
      assert.ok(result.helpText.includes('PURPOSE'));
    });
  });
});

describe('JSON-first output', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../../cli/index.js')];
    cli = require('../../cli/index.js');
  });

  it('all commands return JSON-serializable results', async () => {
    const commands = [
      ['ask', '--provider', 'deepseek', '--prompt', 'test'],
      ['providers'],
      ['doctor', '--provider', 'deepseek'],
      ['help'],
    ];

    for (const args of commands) {
      const result = await cli.run(args);
      
      const json = JSON.stringify(result);
      assert.ok(json, `Command ${args[0]} should return JSON-serializable result`);
      
      const parsed = JSON.parse(json);
      assert.strictEqual(parsed.json, true);
      assert.ok(typeof parsed.command === 'string' || parsed.command === null);
      assert.ok(typeof parsed.status === 'string');
    }
  });

  it('error results are JSON-serializable with all required fields', async () => {
    const result = await cli.run(['nonexistent']);
    
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);
    
    assert.strictEqual(parsed.status, 'error');
    assert.strictEqual(parsed.command, null);
    assert.strictEqual(parsed.json, true);
    assert.strictEqual(typeof parsed.error.code, 'string');
    assert.strictEqual(typeof parsed.error.message, 'string');
    assert.strictEqual(typeof parsed.error.suggestion, 'string');
  });
});

describe('Parser', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../../cli/index.js')];
    cli = require('../../cli/index.js');
  });

  describe('parseArgs direct tests', () => {
    it('parses --key value pairs', () => {
      const result = cli.parseArgs(['--provider', 'deepseek', '--prompt', 'hello world']);
      
      assert.strictEqual(result.options.provider, 'deepseek');
      assert.strictEqual(result.options.prompt, 'hello world');
    });

    it('parses --key=value syntax', () => {
      const result = cli.parseArgs(['--provider=deepseek', '--prompt=test']);
      
      assert.strictEqual(result.options.provider, 'deepseek');
      assert.strictEqual(result.options.prompt, 'test');
    });

    it('parses boolean flags without values', () => {
      const result = cli.parseArgs(['--json', '--verbose']);
      
      assert.strictEqual(result.options.json, true);
      assert.strictEqual(result.options.verbose, true);
    });

    it('parses -h as help flag', () => {
      const result = cli.parseArgs(['-h']);
      
      assert.strictEqual(result.hasHelp, true);
    });

    it('parses --help as help flag', () => {
      const result = cli.parseArgs(['--help']);
      
      assert.strictEqual(result.hasHelp, true);
    });

    it('parses short flags like -j as options', () => {
      const result = cli.parseArgs(['-j']);
      
      assert.strictEqual(result.options.j, true);
    });

    it('extracts command from first positional', () => {
      const result = cli.parseArgs(['ask', '--provider', 'deepseek']);
      
      assert.strictEqual(result.command, 'ask');
    });

    it('collects remaining positionals', () => {
      const result = cli.parseArgs(['help', 'ask', 'extra']);
      
      assert.strictEqual(result.command, 'help');
      assert.deepStrictEqual(result.positional, ['ask', 'extra']);
    });
  });

  describe('--key=value syntax', () => {
    it('parses --provider=deepseek', async () => {
      const result = await cli.run(['ask', '--provider=deepseek', '--prompt=test']);
      
      assert.strictEqual(result.command, 'ask');
      assert.strictEqual(result.status, 'error');
      assert.ok(result.error);
    });

    it('parses --timeout=30000', async () => {
      const result = await cli.run(['ask', '--provider=deepseek', '--prompt=test', '--timeout=30000']);
      
      assert.strictEqual(result.command, 'ask');
    });

    it('handles empty value after =', async () => {
      const result = await cli.run(['ask', '--provider=', '--prompt=test']);
      
      assert.strictEqual(result.command, 'ask');
      assert.strictEqual(result.status, 'error');
      assert.ok(result.error.code, 'PROVIDER_NOT_FOUND');
    });
  });

  describe('dash-prefixed values', () => {
    it('allows -hello as value for --prompt', async () => {
      const result = await cli.run(['ask', '--provider', 'deepseek', '--prompt', '-hello']);
      
      assert.strictEqual(result.command, 'ask');
      assert.strictEqual(result.status, 'error');
      assert.ok(result.error);
    });

    it('allows --dashed-value as value when attached with =', async () => {
      const result = await cli.run(['ask', '--provider=deepseek', '--prompt=--dashed-value']);
      
      assert.strictEqual(result.command, 'ask');
      assert.strictEqual(result.status, 'error');
      assert.ok(result.error);
    });

    it('treats -x (single letter) as short flag, not value', () => {
      const parsed = cli.parseArgs(['--prompt', '-a']);
      
      assert.strictEqual(parsed.options.prompt, true);
      assert.strictEqual(parsed.options.a, true);
    });

    it('treats -x as short flag, not value', () => {
      const parsed = cli.parseArgs(['-x']);
      
      assert.strictEqual(parsed.options.x, true);
      assert.strictEqual(parsed.command, null);
    });

    it('treats -hello as value, not short flags', () => {
      const parsed = cli.parseArgs(['--prompt', '-hello']);
      
      assert.strictEqual(parsed.options.prompt, '-hello');
    });
  });

  describe('boolean flags', () => {
    it('treats --json as boolean true', async () => {
      const result = await cli.run(['providers', '--json']);
      
      assert.strictEqual(result.command, 'providers');
    });

    it('handles multiple boolean flags', async () => {
      const result = await cli.run(['ask', '--json', '--verbose', '--provider', 'deepseek', '--prompt', 'test']);
      
      assert.strictEqual(result.command, 'ask');
    });
  });

  describe('-h short flag', () => {
    it('treats -h same as --help', async () => {
      const result = await cli.run(['ask', '-h']);
      
      assert.strictEqual(result.command, 'help');
      assert.ok(result.helpText.includes('multi-ai ask'));
    });
  });

  describe('positional arguments', () => {
    it('collects positional args after command', async () => {
      const result = await cli.run(['help', 'ask', 'extra']);
      
      assert.strictEqual(result.command, 'help');
    });
  });

  describe('edge cases', () => {
    it('handles empty args array', async () => {
      const result = await cli.run([]);
      
      assert.strictEqual(result.command, 'help');
    });

    it('handles only flags, no command', async () => {
      const result = await cli.run(['--json']);
      
      assert.strictEqual(result.command, 'help');
    });

    it('handles --help as only arg', async () => {
      const result = await cli.run(['--help']);
      
      assert.strictEqual(result.command, 'help');
    });
  });
});

describe('Response envelope standardization', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../../cli/index.js')];
    cli = require('../../cli/index.js');
  });

  it('all successful responses have command, status, json fields', async () => {
    const commands = [
      ['ask', '--provider', 'deepseek', '--prompt', 'test'],
      ['providers'],
      ['doctor', '--provider', 'deepseek'],
      ['help'],
    ];

    for (const args of commands) {
      const result = await cli.run(args);
      
      assert.ok('command' in result, `${args[0]}: missing command field`);
      assert.ok('status' in result, `${args[0]}: missing status field`);
      assert.ok('json' in result, `${args[0]}: missing json field`);
      assert.strictEqual(result.json, true);
    }
  });

  it('error responses have command=null for unknown commands', async () => {
    const result = await cli.run(['nonexistent']);
    
    assert.strictEqual(result.command, null);
    assert.strictEqual(result.status, 'error');
    assert.strictEqual(result.json, true);
    assert.ok(result.error);
  });

  it('help responses have helpText field', async () => {
    const result = await cli.run(['ask', '--help']);
    
    assert.strictEqual(result.command, 'help');
    assert.ok(result.helpText);
    assert.strictEqual(typeof result.helpText, 'string');
  });
});

describe('Handler dispatch verification', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../../cli/index.js')];
    cli = require('../../cli/index.js');
  });

  it('ask handler validates provider option', async () => {
    const result = await cli.run(['ask', '--prompt', 'hello']);
    
    assert.strictEqual(result.command, 'ask');
    assert.strictEqual(result.status, 'error');
    assert.ok(result.error);
    assert.ok(result.error.message.includes('provider'));
  });

  it('ask handler validates prompt option', async () => {
    const result = await cli.run(['ask', '--provider', 'deepseek']);
    
    assert.strictEqual(result.command, 'ask');
    assert.strictEqual(result.status, 'error');
    assert.ok(result.error);
    assert.ok(result.error.message.includes('prompt'));
  });

  it('ask handler returns error when runtime not available', async () => {
    const result = await cli.run(['ask', '--provider', 'gemini', '--prompt', 'hello']);
    
    assert.strictEqual(result.command, 'ask');
    assert.strictEqual(result.status, 'error');
    assert.ok(result.error);
    assert.strictEqual(result.error.code, 'INTERNAL_ERROR');
    assert.ok(result.error.message.includes('Runtime'));
  });

  it('ask handler returns error for unknown provider', async () => {
    const result = await cli.run(['ask', '--provider', 'unknown', '--prompt', 'hello']);
    
    assert.strictEqual(result.command, 'ask');
    assert.strictEqual(result.status, 'error');
    assert.strictEqual(result.error.code, 'PROVIDER_NOT_FOUND');
  });

  it('doctor handler receives parsed options', async () => {
    const result = await cli.run(['doctor', '--provider', 'grok']);
    
    assert.strictEqual(result.command, 'doctor');
    assert.strictEqual(result.status, 'error');
    assert.ok(result.error);
  });

  it('doctor handler returns error for missing provider', async () => {
    const result = await cli.run(['doctor']);
    
    assert.strictEqual(result.command, 'doctor');
    assert.strictEqual(result.status, 'error');
    assert.ok(result.error);
  });

  it('providers handler returns provider list from registry', async () => {
    const result = await cli.run(['providers']);
    
    assert.strictEqual(result.command, 'providers');
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.json, true);
    assert.ok(Array.isArray(result.providers));
    assert.strictEqual(result.providers.length, 3);
    assert.deepStrictEqual(
      result.providers.map(p => p.id).sort(),
      ['deepseek', 'gemini', 'grok']
    );
  });

  it('help handler returns success', async () => {
    const result = await cli.run(['help']);
    
    assert.strictEqual(result.command, 'help');
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.json, true);
  });
});

describe('Semantic Help System', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../../cli/index.js')];
    cli = require('../../cli/index.js');
  });

  describe('Semantic help topics', () => {
    it('shows help for "help errors"', async () => {
      const result = await cli.run(['help', 'errors']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.json, true);
      assert.ok(result.helpText);
      assert.ok(result.helpText.includes('ERROR'));
      assert.ok(result.helpText.includes('code'));
      assert.ok(result.helpText.includes('suggestion'));
    });

    it('shows help for "help result-schema"', async () => {
      const result = await cli.run(['help', 'result-schema']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.json, true);
      assert.ok(result.helpText);
      assert.ok(result.helpText.includes('result'));
      assert.ok(result.helpText.includes('schema'));
    });

    it('returns error for unknown semantic topic', async () => {
      const result = await cli.run(['help', 'unknown-topic']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'UNKNOWN_TOPIC');
    });
  });

  describe('Provider-specific help', () => {
    it('shows help for "help provider grok"', async () => {
      const result = await cli.run(['help', 'provider', 'grok']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.json, true);
      assert.ok(result.helpText);
      assert.ok(result.helpText.includes('Grok'));
      assert.ok(result.helpText.includes('grok.com'));
    });

    it('shows help for "help provider deepseek"', async () => {
      const result = await cli.run(['help', 'provider', 'deepseek']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.json, true);
      assert.ok(result.helpText);
      assert.ok(result.helpText.includes('DeepSeek'));
      assert.ok(result.helpText.includes('deepseek.com'));
    });

    it('shows help for "help provider gemini"', async () => {
      const result = await cli.run(['help', 'provider', 'gemini']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.json, true);
      assert.ok(result.helpText);
      assert.ok(result.helpText.includes('Gemini'));
      assert.ok(result.helpText.includes('gemini.google.com'));
    });

    it('returns error for unknown provider help', async () => {
      const result = await cli.run(['help', 'provider', 'unknown']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'UNKNOWN_PROVIDER');
    });

    it('returns error for "help provider" without provider id', async () => {
      const result = await cli.run(['help', 'provider']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'MISSING_PROVIDER_ID');
    });
  });

  describe('Help content from external files', () => {
    it('help ask loads from external file', async () => {
      const result = await cli.run(['help', 'ask']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.ok(result.helpText);
      assert.ok(result.helpText.includes('multi-ai ask'));
      assert.ok(result.helpText.includes('PURPOSE'));
      assert.ok(result.helpText.includes('EXAMPLES'));
    });

    it('help providers loads from external file', async () => {
      const result = await cli.run(['help', 'providers']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.ok(result.helpText);
      assert.ok(result.helpText.includes('multi-ai providers'));
    });

    it('help doctor loads from external file', async () => {
      const result = await cli.run(['help', 'doctor']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.ok(result.helpText);
      assert.ok(result.helpText.includes('multi-ai doctor'));
    });
  });

  describe('Stable and machine-usable output', () => {
    it('help output is valid UTF-8 text', async () => {
      const result = await cli.run(['help', 'errors']);
      
      assert.strictEqual(typeof result.helpText, 'string');
      const encoded = Buffer.from(result.helpText, 'utf-8');
      const decoded = encoded.toString('utf-8');
      assert.strictEqual(decoded, result.helpText);
    });

    it('help output is JSON-serializable', async () => {
      const result = await cli.run(['help', 'result-schema']);
      
      const json = JSON.stringify(result);
      const parsed = JSON.parse(json);
      
      assert.strictEqual(parsed.command, 'help');
      assert.strictEqual(parsed.status, 'success');
      assert.strictEqual(typeof parsed.helpText, 'string');
    });

    it('help output includes structured sections', async () => {
      const result = await cli.run(['help', 'errors']);
      
      assert.ok(result.helpText.includes('##') || result.helpText.includes('PURPOSE') || result.helpText.includes('ERROR CODES'));
    });
  });

  describe('Help topic discovery', () => {
    it('help without arguments shows available topics', async () => {
      const result = await cli.run(['help']);
      
      assert.strictEqual(result.command, 'help');
      assert.ok(result.helpText);
      assert.ok(result.helpText.includes('ask') || result.helpText.includes('Commands'));
    });

    it('help --help shows help about help command', async () => {
      const result = await cli.run(['help', '--help']);
      
      assert.strictEqual(result.command, 'help');
      assert.ok(result.helpText);
      assert.ok(result.helpText.includes('multi-ai help'));
    });
  });
});

describe('Help System Quality', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../../cli/index.js')];
    delete require.cache[require.resolve('../../cli/commands/help.js')];
    delete require.cache[require.resolve('../../cli/providers/registry.js')];
    cli = require('../../cli/index.js');
  });

  describe('Provider help alignment with registry', () => {
    it('help module derives provider IDs from registry', () => {
      const help = require('../../cli/commands/help.js');
      const registry = require('../../cli/providers/registry.js');
      
      const helpProviderIds = help.getProviderIds();
      const registryProviderIds = registry.getProviderIds();
      
      assert.deepStrictEqual(helpProviderIds.sort(), registryProviderIds.sort());
    });

    it('isKnownProvider matches registry', () => {
      const help = require('../../cli/commands/help.js');
      const registry = require('../../cli/providers/registry.js');
      
      const providerIds = registry.getProviderIds();
      
      for (const id of providerIds) {
        assert.strictEqual(help.isKnownProvider(id), true, `Provider ${id} should be known`);
      }
      
      assert.strictEqual(help.isKnownProvider('nonexistent-provider'), false);
    });

    it('all registry providers have help files', async () => {
      const registry = require('../../cli/providers/registry.js');
      const providerIds = registry.getProviderIds();
      
      for (const id of providerIds) {
        const result = await cli.run(['help', 'provider', id]);
        assert.strictEqual(result.status, 'success', `Provider ${id} should have help file`);
        assert.ok(result.helpText, `Provider ${id} help should have content`);
      }
    });
  });

  describe('Help topic validation', () => {
    it('isKnownCommandTopic validates command topics', () => {
      const help = require('../../cli/commands/help.js');
      
      assert.strictEqual(help.isKnownCommandTopic('ask'), true);
      assert.strictEqual(help.isKnownCommandTopic('providers'), true);
      assert.strictEqual(help.isKnownCommandTopic('doctor'), true);
      assert.strictEqual(help.isKnownCommandTopic('help'), true);
      assert.strictEqual(help.isKnownCommandTopic('unknown'), false);
    });

    it('isKnownSemanticTopic validates semantic topics', () => {
      const help = require('../../cli/commands/help.js');
      
      assert.strictEqual(help.isKnownSemanticTopic('errors'), true);
      assert.strictEqual(help.isKnownSemanticTopic('result-schema'), true);
      assert.strictEqual(help.isKnownSemanticTopic('unknown'), false);
    });
  });

  describe('Malformed provider requests', () => {
    it('handles extra positional args after provider id', async () => {
      const result = await cli.run(['help', 'provider', 'grok', 'extra', 'args']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.ok(result.helpText);
    });

    it('handles provider id with special characters', async () => {
      const result = await cli.run(['help', 'provider', 'grok<script>']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'UNKNOWN_PROVIDER');
    });

    it('handles provider id with spaces', async () => {
      const result = await cli.run(['help', 'provider', 'grok deepseek']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.error.code, 'UNKNOWN_PROVIDER');
    });
  });

  describe('Contract-level assertions', () => {
    it('help success response has required fields', async () => {
      const result = await cli.run(['help', 'ask']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.json, true);
      assert.strictEqual(typeof result.helpText, 'string');
      assert.ok(result.helpText.length > 0);
    });

    it('help error response has canonical error envelope', async () => {
      const result = await cli.run(['help', 'nonexistent']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.json, true);
      assert.ok(result.error);
      assert.strictEqual(typeof result.error.code, 'string');
      assert.strictEqual(typeof result.error.message, 'string');
      assert.strictEqual(typeof result.error.suggestion, 'string');
    });

    it('UNKNOWN_TOPIC error includes available topics in suggestion', async () => {
      const result = await cli.run(['help', 'nonexistent']);
      
      assert.strictEqual(result.error.code, 'UNKNOWN_TOPIC');
      assert.ok(result.error.suggestion.includes('Commands:'));
      assert.ok(result.error.suggestion.includes('Semantic topics:'));
      assert.ok(result.error.suggestion.includes('Provider help:'));
    });

    it('UNKNOWN_PROVIDER error includes available providers in suggestion', async () => {
      const result = await cli.run(['help', 'provider', 'nonexistent']);
      
      assert.strictEqual(result.error.code, 'UNKNOWN_PROVIDER');
      assert.ok(result.error.suggestion.includes('deepseek') || result.error.suggestion.includes('gemini') || result.error.suggestion.includes('grok'));
    });

    it('MISSING_PROVIDER_ID error has correct structure', async () => {
      const result = await cli.run(['help', 'provider']);
      
      assert.strictEqual(result.error.code, 'MISSING_PROVIDER_ID');
      assert.ok(result.error.message.includes('required'));
      assert.ok(result.error.suggestion.includes('Usage:'));
    });
  });

  describe('Status value clarity', () => {
    it('help success uses "success" status, not "skeleton"', async () => {
      const result = await cli.run(['help']);
      
      assert.strictEqual(result.status, 'success');
      assert.notStrictEqual(result.status, 'skeleton');
    });

    it('help with topic uses "success" status', async () => {
      const topics = ['ask', 'providers', 'doctor', 'errors', 'result-schema'];
      
      for (const topic of topics) {
        const result = await cli.run(['help', topic]);
        assert.strictEqual(result.status, 'success', `Topic ${topic} should return success status`);
      }
    });

    it('help with provider uses "success" status', async () => {
      const registry = require('../../cli/providers/registry.js');
      const providerIds = registry.getProviderIds();
      
      for (const id of providerIds) {
        const result = await cli.run(['help', 'provider', id]);
        assert.strictEqual(result.status, 'success', `Provider ${id} should return success status`);
      }
    });
  });
});

describe('Help File Failure Modes', () => {
  const fs = require('fs');
  const path = require('path');
  const HELP_DIR = path.join(__dirname, '..', '..', 'cli', 'help');
  
  beforeEach(() => {
    delete require.cache[require.resolve('../../cli/index.js')];
    delete require.cache[require.resolve('../../cli/commands/help.js')];
    delete require.cache[require.resolve('../../cli/providers/registry.js')];
    cli = require('../../cli/index.js');
  });

  describe('loadHelpFile direct tests', () => {
    it('returns found:false for non-existent file', () => {
      const help = require('../../cli/commands/help.js');
      
      const result = help.loadHelpFile('nonexistent-file-12345.md');
      
      assert.strictEqual(result.found, false);
      assert.strictEqual(result.content, null);
      assert.strictEqual(result.error, null);
    });

    it('returns found:true for existing file', () => {
      const help = require('../../cli/commands/help.js');
      
      const result = help.loadHelpFile('errors.md');
      
      assert.strictEqual(result.found, true);
      assert.ok(result.content);
      assert.strictEqual(result.error, null);
    });
  });

  describe('HELP_FILE_NOT_FOUND for missing files', () => {
    it('returns HELP_FILE_NOT_FOUND when command help file is missing', async () => {
      const fs = require('fs');
      const path = require('path');
      const HELP_DIR = path.join(__dirname, '..', '..', 'cli', 'help');
      const testFile = path.join(HELP_DIR, 'ask.md');
      const backupFile = path.join(HELP_DIR, 'ask.md.bak-test');
      
      let moved = false;
      try {
        if (fs.existsSync(testFile)) {
          fs.renameSync(testFile, backupFile);
          moved = true;
        }
        
        delete require.cache[require.resolve('../../cli/commands/help.js')];
        cli = require('../../cli/index.js');
        
        const result = await cli.run(['help', 'ask']);
        
        assert.strictEqual(result.status, 'error');
        assert.strictEqual(result.error.code, 'HELP_FILE_NOT_FOUND');
        assert.ok(result.error.message.includes('ask'));
        assert.ok(result.error.suggestion.includes('bug'));
      } finally {
        if (moved && fs.existsSync(backupFile)) {
          fs.renameSync(backupFile, testFile);
        }
      }
    });
  });

  describe('Semantic topic inventory derivation', () => {
    it('getSemanticTopics returns topics from actual files', () => {
      const help = require('../../cli/commands/help.js');
      
      const topics = help.getSemanticTopics();
      
      assert.ok(Array.isArray(topics));
      assert.ok(topics.includes('errors'));
      assert.ok(topics.includes('result-schema'));
    });

    it('isKnownSemanticTopic uses inventory, not hard-coded list', () => {
      const help = require('../../cli/commands/help.js');
      
      const topics = help.getSemanticTopics();
      
      for (const topic of topics) {
        assert.strictEqual(help.isKnownSemanticTopic(topic), true);
      }
    });

    it('scanHelpInventory returns correct structure', () => {
      const help = require('../../cli/commands/help.js');
      
      const inventory = help.scanHelpInventory();
      
      assert.ok(inventory.commands);
      assert.ok(inventory.semantic);
      assert.ok(inventory.providers);
      assert.ok(Array.isArray(inventory.commands));
      assert.ok(Array.isArray(inventory.semantic));
      assert.ok(Array.isArray(inventory.providers));
    });

    it('scanHelpInventory includes expected command topics', () => {
      const help = require('../../cli/commands/help.js');
      
      const inventory = help.scanHelpInventory();
      
      assert.ok(inventory.commands.includes('ask'));
      assert.ok(inventory.commands.includes('providers'));
      assert.ok(inventory.commands.includes('doctor'));
      assert.ok(inventory.commands.includes('help'));
    });

    it('scanHelpInventory includes expected provider help files', () => {
      const help = require('../../cli/commands/help.js');
      const registry = require('../../cli/providers/registry.js');
      
      const inventory = help.scanHelpInventory();
      const providerIds = registry.getProviderIds();
      
      for (const id of providerIds) {
        assert.ok(inventory.providers.includes(id), `Provider ${id} should be in inventory`);
      }
    });
  });

  describe('Provider help file alignment', () => {
    it('all providers in registry have corresponding help files', () => {
      const help = require('../../cli/commands/help.js');
      const registry = require('../../cli/providers/registry.js');
      
      const inventory = help.scanHelpInventory();
      const providerIds = registry.getProviderIds();
      
      for (const id of providerIds) {
        assert.ok(inventory.providers.includes(id), `Provider ${id} should have help file`);
      }
    });
  });
});

describe('Help File Read Error', () => {
  const fs = require('fs');
  const path = require('path');
  const HELP_DIR = path.join(__dirname, '..', '..', 'cli', 'help');
  
  beforeEach(() => {
    delete require.cache[require.resolve('../../cli/index.js')];
    delete require.cache[require.resolve('../../cli/commands/help.js')];
    delete require.cache[require.resolve('../../cli/providers/registry.js')];
    cli = require('../../cli/index.js');
  });

  describe('HELP_FILE_READ_ERROR for unreadable files', () => {
    const testDir = path.join(HELP_DIR, 'test-unreadable.md');
    
    it('returns HELP_FILE_READ_ERROR when help file is a directory', async () => {
      let created = false;
      try {
        if (!fs.existsSync(testDir)) {
          fs.mkdirSync(testDir);
          created = true;
        }
        
        delete require.cache[require.resolve('../../cli/commands/help.js')];
        cli = require('../../cli/index.js');
        
        const result = await cli.run(['help', 'test-unreadable']);
        
        assert.strictEqual(result.status, 'error');
        assert.strictEqual(result.error.code, 'HELP_FILE_READ_ERROR');
        assert.ok(result.error.message.includes('test-unreadable'));
        assert.ok(result.error.suggestion.includes('File system error'));
      } finally {
        if (created && fs.existsSync(testDir)) {
          fs.rmdirSync(testDir);
        }
      }
    });
  });
});

describe('End-to-End Help Contract', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../../cli/index.js')];
    delete require.cache[require.resolve('../../cli/commands/help.js')];
    delete require.cache[require.resolve('../../cli/providers/registry.js')];
    cli = require('../../cli/index.js');
  });

  describe('CLI entry path consistency', () => {
    it('help command returns success status through CLI entry', async () => {
      const result = await cli.run(['help']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.json, true);
      assert.ok(result.helpText);
    });

    it('help <topic> returns success status through CLI entry', async () => {
      const topics = ['ask', 'providers', 'doctor', 'errors', 'result-schema'];
      
      for (const topic of topics) {
        const result = await cli.run(['help', topic]);
        assert.strictEqual(result.command, 'help');
        assert.strictEqual(result.status, 'success');
        assert.strictEqual(result.json, true);
        assert.ok(result.helpText, `Topic ${topic} should have helpText`);
      }
    });

    it('help provider <id> returns success status through CLI entry', async () => {
      const registry = require('../../cli/providers/registry.js');
      const providerIds = registry.getProviderIds();
      
      for (const id of providerIds) {
        const result = await cli.run(['help', 'provider', id]);
        assert.strictEqual(result.command, 'help');
        assert.strictEqual(result.status, 'success');
        assert.strictEqual(result.json, true);
        assert.ok(result.helpText, `Provider ${id} should have helpText`);
      }
    });

    it('--help flag returns success status through CLI entry', async () => {
      const commands = ['ask', 'providers', 'doctor', 'help'];
      
      for (const cmd of commands) {
        const result = await cli.run([cmd, '--help']);
        assert.strictEqual(result.command, 'help');
        assert.strictEqual(result.status, 'success');
        assert.strictEqual(result.json, true);
        assert.ok(result.helpText, `Command ${cmd} --help should have helpText`);
      }
    });
  });

  describe('Error responses through CLI entry', () => {
    it('UNKNOWN_TOPIC returns error status through CLI entry', async () => {
      const result = await cli.run(['help', 'nonexistent-topic']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.json, true);
      assert.strictEqual(result.error.code, 'UNKNOWN_TOPIC');
    });

    it('UNKNOWN_PROVIDER returns error status through CLI entry', async () => {
      const result = await cli.run(['help', 'provider', 'nonexistent']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.json, true);
      assert.strictEqual(result.error.code, 'UNKNOWN_PROVIDER');
    });

    it('MISSING_PROVIDER_ID returns error status through CLI entry', async () => {
      const result = await cli.run(['help', 'provider']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.json, true);
      assert.strictEqual(result.error.code, 'MISSING_PROVIDER_ID');
    });
  });

  describe('No skeleton status in public contract', () => {
    it('never returns skeleton status for any help path', async () => {
      const paths = [
        ['help'],
        ['help', 'ask'],
        ['help', 'providers'],
        ['help', 'doctor'],
        ['help', 'errors'],
        ['help', 'result-schema'],
        ['help', 'provider', 'grok'],
        ['help', 'provider', 'deepseek'],
        ['help', 'provider', 'gemini'],
        ['ask', '--help'],
        ['providers', '--help'],
        ['doctor', '--help'],
        ['help', '--help'],
      ];
      
      for (const args of paths) {
        const result = await cli.run(args);
        assert.notStrictEqual(result.status, 'skeleton', 
          `Path [${args.join(', ')}] should not return skeleton status`);
        assert.ok(['success', 'error'].includes(result.status),
          `Path [${args.join(', ')}] should return success or error status`);
      }
    });
  });
});
