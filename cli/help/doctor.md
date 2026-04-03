# multi-ai doctor

Diagnose provider readiness.

## PURPOSE

Run diagnostic checks on a provider to verify browser connectivity, page accessibility, login status, and input element availability. Use this to troubleshoot issues before running ask commands.

## USAGE

```
multi-ai doctor --provider <id> [options]
```

## REQUIRED ARGUMENTS

| Argument | Description |
|----------|-------------|
| `--provider <id>` | The provider to diagnose (e.g., deepseek, gemini, grok) |

## OPTIONAL ARGUMENTS

| Argument | Description |
|----------|-------------|
| `--json` | Force JSON output (default behavior) |

## EXAMPLES

```bash
# Diagnose DeepSeek
multi-ai doctor --provider deepseek

# Diagnose Gemini
multi-ai doctor --provider gemini

# Diagnose Grok
multi-ai doctor --provider grok
```

## JSON OUTPUT

### Healthy

```json
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
```

### Unhealthy

```json
{
  "command": "doctor",
  "status": "error",
  "provider": "deepseek",
  "checks": {
    "browser_connected": true,
    "page_reachable": true,
    "login_detected": false,
    "input_located": false
  },
  "error": {
    "code": "CHECK_FAILED",
    "message": "Login not detected",
    "suggestion": "Please log in to DeepSeek in your browser"
  },
  "json": true
}
```

## CHECKS

| Check | Description |
|-------|-------------|
| `browser_connected` | Chrome is running with remote debugging |
| `page_reachable` | Provider page can be loaded |
| `login_detected` | User is logged in to the provider |
| `input_located` | Input element is found on the page |

## PREREQUISITES

1. Chrome must be running with remote debugging enabled:
   ```bash
   chrome --remote-debugging-port=9222
   ```

## SEE ALSO

- `multi-ai help ask` - Send a prompt
- `multi-ai help providers` - List available providers
- `multi-ai help errors` - Error codes reference
