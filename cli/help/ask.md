# multi-ai ask

Send a prompt to an AI provider.

## PURPOSE

Send a prompt to a specified AI provider and return the response. This command orchestrates the full ask lifecycle: connect to browser, find or create a provider tab, inject the prompt, trigger send, and extract the response.

## USAGE

```
multi-ai ask --provider <id> --prompt <text> [options]
```

## REQUIRED ARGUMENTS

| Argument | Description |
|----------|-------------|
| `--provider <id>` | The provider to use (e.g., deepseek, gemini, grok) |
| `--prompt <text>` | The prompt text to send |

## OPTIONAL ARGUMENTS

| Argument | Description |
|----------|-------------|
| `--json` | Force JSON output (default behavior) |

## EXAMPLES

```bash
# Basic usage
multi-ai ask --provider deepseek --prompt "What is 2+2?"

# Using = syntax
multi-ai ask --provider=grok --prompt="Hello, world!"
```

## JSON OUTPUT

### Success

```json
{
  "command": "ask",
  "status": "success",
  "provider": "deepseek",
  "response": {
    "text": "The AI response text"
  },
  "phases": {
    "dispatch": true,
    "responseStarted": true,
    "responseCompleted": true
  },
  "json": true
}
```

### Failure

```json
{
  "command": "ask",
  "status": "error",
  "provider": "deepseek",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error",
    "suggestion": "How to recover"
  },
  "json": true
}
```

## PREREQUISITES

1. Chrome must be running with remote debugging enabled:
   ```bash
   chrome --remote-debugging-port=9222
   ```

2. You must be logged in to the provider in your browser.

## SEE ALSO

- `multi-ai help providers` - List available providers
- `multi-ai help doctor` - Diagnose provider readiness
- `multi-ai help errors` - Error codes reference
