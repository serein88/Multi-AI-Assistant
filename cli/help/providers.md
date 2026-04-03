# multi-ai providers

List available AI providers.

## PURPOSE

List all supported AI providers with their capability metadata. Shows which providers are implemented, support ask/doctor commands, require login, and have known risks.

## USAGE

```
multi-ai providers [options]
```

## ARGUMENTS

No required arguments.

## OPTIONAL ARGUMENTS

| Argument | Description |
|----------|-------------|
| `--json` | Force JSON output (default behavior) |

## EXAMPLES

```bash
# List all providers
multi-ai providers

# Explicit JSON output
multi-ai providers --json
```

## JSON OUTPUT

```json
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
    {
      "id": "gemini",
      "implemented": true,
      "ask_supported": true,
      "doctor_supported": true,
      "login_required": true,
      "known_risks": []
    },
    {
      "id": "grok",
      "implemented": true,
      "ask_supported": true,
      "doctor_supported": true,
      "login_required": true,
      "known_risks": [
        "Response-start detection may be unreliable; prefer strong signals like Stop button appearance or input field clearing",
        "Unstable response detection may require fallback timeout handling"
      ]
    }
  ],
  "json": true
}
```

## PROVIDER FIELDS

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Provider identifier |
| `implemented` | boolean | Whether the provider is implemented |
| `ask_supported` | boolean | Whether `ask` command is supported |
| `doctor_supported` | boolean | Whether `doctor` command is supported |
| `login_required` | boolean | Whether login is required |
| `known_risks` | string[] | Known issues or limitations |

## SEE ALSO

- `multi-ai help ask` - Send a prompt
- `multi-ai help doctor` - Diagnose provider readiness
- `multi-ai help provider <id>` - Provider-specific help
