const REGISTRY = {
  ask: {
    id: 'ask',
    description: 'Send a prompt to an AI provider',
    helpText: `
multi-ai ask - Send a prompt to an AI provider

PURPOSE:
  Send a prompt to a specified AI provider and return the response.
  This command orchestrates the full ask lifecycle: connect to browser,
  find or create a provider tab, inject the prompt, trigger send,
  and extract the response.

REQUIRED ARGUMENTS:
  --provider <id>    The provider to use (e.g., deepseek, gemini, grok)
  --prompt <text>    The prompt text to send

OPTIONAL ARGUMENTS:
  --timeout <ms>     Maximum time to wait for response (default: 60000)
  --json             Force JSON output (default behavior)

EXAMPLES:
  multi-ai ask --provider deepseek --prompt "What is 2+2?"
  multi-ai ask --provider gemini --prompt "Explain quantum computing" --timeout 30000

JSON OUTPUT:
  On success:
    {
      "command": "ask",
      "status": "success",
      "provider": "deepseek",
      "response": { ... },
      "json": true
    }

  On failure:
    {
      "command": "ask",
      "status": "error",
      "error": {
        "code": "ERROR_CODE",
        "message": "Human-readable error",
        "suggestion": "How to recover"
      },
      "json": true
    }
`,
  },
  providers: {
    id: 'providers',
    description: 'List available AI providers',
    helpText: `
multi-ai providers - List available AI providers

PURPOSE:
  List all supported AI providers with their capability metadata.
  Shows which providers are implemented, support ask/doctor commands,
  require login, and have known risks.

ARGUMENTS:
  None required.

OPTIONAL ARGUMENTS:
  --json             Force JSON output (default behavior)

EXAMPLES:
  multi-ai providers
  multi-ai providers --json

JSON OUTPUT:
  {
    "command": "providers",
    "status": "success",
    "providers": [
      {
        "id": "deepseek",
        "implemented": true,
        "ask_supported": true,
        "doctor_supported": true,
        "login_required": true,
        "known_risks": []
      },
      ...
    ],
    "json": true
  }
`,
  },
  doctor: {
    id: 'doctor',
    description: 'Diagnose provider readiness',
    helpText: `
multi-ai doctor - Diagnose provider readiness

PURPOSE:
  Run diagnostic checks on a provider to verify browser connectivity,
  page accessibility, login status, and input element availability.
  Use this to troubleshoot issues before running ask commands.

REQUIRED ARGUMENTS:
  --provider <id>    The provider to diagnose (e.g., deepseek, gemini, grok)

OPTIONAL ARGUMENTS:
  --json             Force JSON output (default behavior)

EXAMPLES:
  multi-ai doctor --provider deepseek
  multi-ai doctor --provider gemini

JSON OUTPUT:
  On healthy:
    {
      "command": "doctor",
      "status": "success",
      "provider": "deepseek",
      "checks": {
        "browser_connected": true,
        "page_reachable": true,
        "login_detected": true,
        "input_located": true
      },
      "json": true
    }

  On unhealthy:
    {
      "command": "doctor",
      "status": "error",
      "provider": "deepseek",
      "checks": { ... },
      "error": {
        "code": "CHECK_FAILED",
        "message": "Login not detected",
        "suggestion": "Please log in to DeepSeek in your browser"
      },
      "json": true
    }
`,
  },
  help: {
    id: 'help',
    description: 'Show help for commands',
    helpText: `
multi-ai help - Show help for commands

PURPOSE:
  Display help information for multi-ai commands.
  Without arguments, shows general usage.
  With a command name, shows detailed help for that command.

ARGUMENTS:
  [command]          Optional command name to get help for

EXAMPLES:
  multi-ai help
  multi-ai help ask
  multi-ai help providers
  multi-ai help doctor

JSON OUTPUT:
  {
    "command": "help",
    "status": "skeleton",
    "helpText": "...",
    "json": true
  }
`,
  },
};

function getCommandIds() {
  return Object.keys(REGISTRY);
}

function getCommand(id) {
  return REGISTRY[id] || null;
}

function getHelpText(commandId) {
  const cmd = REGISTRY[commandId];
  return cmd ? cmd.helpText : null;
}

function isValidCommand(id) {
  return id in REGISTRY;
}

module.exports = {
  REGISTRY,
  getCommandIds,
  getCommand,
  getHelpText,
  isValidCommand,
};
