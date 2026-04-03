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
  "healthy": true,
  "checks": {
    "connection": true,
    "pageReachable": true,
    "loginDetected": true,
    "inputLocated": true
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
  "healthy": false,
  "checks": {
    "connection": true,
    "pageReachable": true,
    "loginDetected": false,
    "inputLocated": false
  },
  "error": {
    "code": "LOGIN_REQUIRED",
    "message": "Login not detected",
    "suggestion": "Please log in to DeepSeek in your browser"
  },
  "json": true
}
```

## CHECKS

| Check | Description |
|-------|-------------|
| `connection` | Chrome is running with remote debugging |
| `pageReachable` | Provider page can be loaded |
| `loginDetected` | User is logged in to the provider |
| `inputLocated` | Input element is found on the page |

### Optional Check Fields

The following fields may appear in `checks` depending on the provider state:

| Field | Type | Description |
|-------|------|-------------|
| `loginType` | string | Type of login issue detected (e.g., `verification_required`, `login_redirect`, `challenge_required`) |
| `loginDetails` | object | Additional details about the login state |
| `unstable` | boolean | Login state may be unreliable |
| `unstableReason` | string | Reason for unstable login detection |
| `unstableCategory` | string | Category of instability |
| `warnings` | array | Warning messages about the provider state |
| `rateLimited` | boolean | Provider may be rate limiting requests |
| `inputSelector` | string | CSS selector used to locate the input element |

When no adapter is available for a provider, `loginDetected` and `inputLocated` will be `null` instead of boolean values.

## PREREQUISITES

1. Chrome must be running with remote debugging enabled:
   ```bash
   chrome --remote-debugging-port=9222
   ```

## SEE ALSO

- `multi-ai help ask` - Send a prompt
- `multi-ai help providers` - List available providers
- `multi-ai help errors` - Error codes reference
