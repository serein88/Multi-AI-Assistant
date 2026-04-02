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
      assert.strictEqual(result.status, 'skeleton');
      assert.strictEqual(result.json, true);
      assert.strictEqual(result.provider, 'deepseek');
      assert.strictEqual(result.prompt, 'test');
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
      assert.strictEqual(result.status, 'skeleton');
      assert.strictEqual(result.json, true);
      assert.strictEqual(result.provider, 'deepseek');
    });

    it('routes "help" command to help handler', async () => {
      const result = await cli.run(['help']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'skeleton');
      assert.strictEqual(result.json, true);
    });

    it('routes no command to help handler (default)', async () => {
      const result = await cli.run([]);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'skeleton');
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
      assert.strictEqual(result.json, true);
      assert.ok(result.helpText);
      assert.ok(result.helpText.includes('multi-ai ask'));
    });

    it('shows help for "providers --help"', async () => {
      const result = await cli.run(['providers', '--help']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.json, true);
      assert.ok(result.helpText);
      assert.ok(result.helpText.includes('multi-ai providers'));
    });

    it('shows help for "doctor --help"', async () => {
      const result = await cli.run(['doctor', '--help']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.json, true);
      assert.ok(result.helpText);
      assert.ok(result.helpText.includes('multi-ai doctor'));
    });

    it('shows help for "help --help"', async () => {
      const result = await cli.run(['help', '--help']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.json, true);
      assert.ok(result.helpText);
      assert.ok(result.helpText.includes('multi-ai help'));
    });
  });

  describe('help command with argument', () => {
    it('shows help for "help ask"', async () => {
      const result = await cli.run(['help', 'ask']);
      
      assert.strictEqual(result.command, 'help');
      assert.strictEqual(result.status, 'skeleton');
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
      
      assert.ok(result.helpText.includes('PURPOSE:'));
    });

    it('includes required arguments', async () => {
      const result = await cli.run(['ask', '--help']);
      
      assert.ok(result.helpText.includes('--provider'));
      assert.ok(result.helpText.includes('--prompt'));
    });

    it('includes EXAMPLES section', async () => {
      const result = await cli.run(['ask', '--help']);
      
      assert.ok(result.helpText.includes('EXAMPLES:'));
    });

    it('includes JSON OUTPUT section', async () => {
      const result = await cli.run(['ask', '--help']);
      
      assert.ok(result.helpText.includes('JSON OUTPUT:'));
    });
  });

  describe('providers command help', () => {
    it('includes PURPOSE section', async () => {
      const result = await cli.run(['providers', '--help']);
      
      assert.ok(result.helpText.includes('PURPOSE:'));
    });

    it('includes JSON OUTPUT section', async () => {
      const result = await cli.run(['providers', '--help']);
      
      assert.ok(result.helpText.includes('JSON OUTPUT:'));
    });
  });

  describe('doctor command help', () => {
    it('includes PURPOSE section', async () => {
      const result = await cli.run(['doctor', '--help']);
      
      assert.ok(result.helpText.includes('PURPOSE:'));
    });

    it('includes required arguments', async () => {
      const result = await cli.run(['doctor', '--help']);
      
      assert.ok(result.helpText.includes('--provider'));
    });

    it('includes JSON OUTPUT section', async () => {
      const result = await cli.run(['doctor', '--help']);
      
      assert.ok(result.helpText.includes('JSON OUTPUT:'));
    });
  });

  describe('help command help', () => {
    it('includes PURPOSE section', async () => {
      const result = await cli.run(['help', '--help']);
      
      assert.ok(result.helpText.includes('PURPOSE:'));
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
      assert.strictEqual(result.status, 'skeleton');
      assert.strictEqual(result.provider, 'deepseek');
      assert.strictEqual(result.prompt, 'test');
    });

    it('parses --timeout=30000', async () => {
      const result = await cli.run(['ask', '--provider=deepseek', '--prompt=test', '--timeout=30000']);
      
      assert.strictEqual(result.command, 'ask');
    });

    it('handles empty value after =', async () => {
      const result = await cli.run(['ask', '--provider=', '--prompt=test']);
      
      assert.strictEqual(result.command, 'ask');
      assert.strictEqual(result.provider, null);
    });
  });

  describe('dash-prefixed values', () => {
    it('allows -hello as value for --prompt', async () => {
      const result = await cli.run(['ask', '--provider', 'deepseek', '--prompt', '-hello']);
      
      assert.strictEqual(result.command, 'ask');
      assert.strictEqual(result.provider, 'deepseek');
      assert.strictEqual(result.prompt, '-hello');
    });

    it('allows --dashed-value as value when attached with =', async () => {
      const result = await cli.run(['ask', '--provider=deepseek', '--prompt=--dashed-value']);
      
      assert.strictEqual(result.command, 'ask');
      assert.strictEqual(result.prompt, '--dashed-value');
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

  it('ask handler receives parsed options', async () => {
    const result = await cli.run(['ask', '--provider', 'gemini', '--prompt', 'hello']);
    
    assert.strictEqual(result.command, 'ask');
    assert.strictEqual(result.provider, 'gemini');
    assert.strictEqual(result.prompt, 'hello');
  });

  it('ask handler returns null for missing options', async () => {
    const result = await cli.run(['ask']);
    
    assert.strictEqual(result.command, 'ask');
    assert.strictEqual(result.provider, null);
    assert.strictEqual(result.prompt, null);
  });

  it('doctor handler receives parsed options', async () => {
    const result = await cli.run(['doctor', '--provider', 'grok']);
    
    assert.strictEqual(result.command, 'doctor');
    assert.strictEqual(result.provider, 'grok');
  });

  it('doctor handler returns null for missing provider', async () => {
    const result = await cli.run(['doctor']);
    
    assert.strictEqual(result.command, 'doctor');
    assert.strictEqual(result.provider, null);
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

  it('help handler returns skeleton', async () => {
    const result = await cli.run(['help']);
    
    assert.strictEqual(result.command, 'help');
    assert.strictEqual(result.status, 'skeleton');
    assert.strictEqual(result.json, true);
  });
});
