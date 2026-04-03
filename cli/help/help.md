# multi-ai help

Show help for commands and topics.

## PURPOSE

Display help information for multi-ai commands and topics. Without arguments, shows general usage and available topics. With a command or topic name, shows detailed help for that specific item.

## USAGE

```
multi-ai help [topic]
multi-ai help provider <id>
```

## ARGUMENTS

| Argument | Description |
|----------|-------------|
| `[topic]` | Optional topic name to get help for |

## EXAMPLES

```bash
# Show general help
multi-ai help

# Get help for a command
multi-ai help ask
multi-ai help providers
multi-ai help doctor

# Get help for semantic topics
multi-ai help errors
multi-ai help result-schema

# Get help for a specific provider
multi-ai help provider grok
multi-ai help provider deepseek
multi-ai help provider gemini
```

## JSON OUTPUT

```json
{
  "command": "help",
  "status": "success",
  "helpText": "...",
  "json": true
}
```

## ERROR CODES

| Code | Description |
|------|-------------|
| `UNKNOWN_TOPIC` | The requested topic does not exist |
| `UNKNOWN_PROVIDER` | The requested provider does not exist |
| `MISSING_PROVIDER_ID` | Provider ID was not specified |
| `HELP_FILE_NOT_FOUND` | Help file for known topic is missing |
| `HELP_FILE_READ_ERROR` | Help file could not be read |

## SEE ALSO

- `multi-ai help errors` - Error codes reference
- `multi-ai help result-schema` - Result schema reference
- `multi-ai providers` - List available providers
