#!/usr/bin/env node

const registry = require('./registry');
const contracts = require('./runtime/contracts');
const ask = require('./commands/ask');
const providers = require('./commands/providers');
const doctor = require('./commands/doctor');
const help = require('./commands/help');

const HANDLERS = {
  ask,
  providers,
  doctor,
  help,
};

function isOption(arg) {
  if (arg.startsWith('--')) return true;
  if (/^-[a-zA-Z]$/.test(arg)) return true;
  return false;
}

function parseArgs(args) {
  const result = {
    command: null,
    options: {},
    positional: [],
    hasHelp: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.hasHelp = true;
      continue;
    }

    if (arg.startsWith('--')) {
      const afterDashes = arg.slice(2);
      
      if (afterDashes.includes('=')) {
        const eqIndex = afterDashes.indexOf('=');
        const key = afterDashes.slice(0, eqIndex);
        const value = afterDashes.slice(eqIndex + 1);
        result.options[key] = value;
      } else {
        const key = afterDashes;
        const nextArg = args[i + 1];
        
        if (nextArg && !isOption(nextArg)) {
          result.options[key] = nextArg;
          i++;
        } else {
          result.options[key] = true;
        }
      }
      continue;
    }

    if (/^-[a-zA-Z]$/.test(arg)) {
      const key = arg.slice(1);
      result.options[key] = true;
      continue;
    }

    if (!result.command) {
      result.command = arg;
    } else {
      result.positional.push(arg);
    }
  }

  return result;
}

const { makeResponse, makeErrorResponse } = contracts;

async function resolveHelp(targetCommand) {
  if (!targetCommand) {
    return help.run({ options: {}, positional: [] });
  }

  return help.run({ options: {}, positional: [targetCommand] });
}

async function run(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  const { command, options, positional, hasHelp } = parsed;

  const targetCommand = command || 'help';

  if (hasHelp) {
    return resolveHelp(targetCommand);
  }

  if (targetCommand === 'help') {
    return help.run({ options, positional });
  }

  if (!registry.isValidCommand(targetCommand)) {
    const available = registry.getCommandIds().join(', ');
    return makeErrorResponse(null, 'UNKNOWN_COMMAND',
      `Unknown command: ${targetCommand}`,
      `Available commands: ${available}. Run "multi-ai help" for usage.`);
  }

  const handler = HANDLERS[targetCommand];
  return handler.run({ options, positional });
}

module.exports = { run, parseArgs, makeResponse, makeErrorResponse, resolveHelp, HANDLERS };
