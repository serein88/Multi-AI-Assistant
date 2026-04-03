# Provider: DeepSeek

DeepSeek is an AI assistant by DeepSeek AI, available at chat.deepseek.com.

## OVERVIEW

| Property | Value |
|----------|-------|
| ID | `deepseek` |
| URL | https://chat.deepseek.com |
| Ask Support | Yes |
| Doctor Support | Yes |
| Login Required | Yes |

## KNOWN RISKS

No known risks. DeepSeek is generally stable for CLI usage.

## USAGE

```bash
# Ask DeepSeek a question
multi-ai ask --provider deepseek --prompt "Explain quantum computing"

# Diagnose DeepSeek connectivity
multi-ai doctor --provider deepseek
```

## LOGIN

1. Open https://chat.deepseek.com in Chrome
2. Sign in with your account
3. Ensure you can send messages in the DeepSeek interface
4. Run `multi-ai doctor --provider deepseek` to verify

## TROUBLESHOOTING

### Response Timeout

If you get `RESPONSE_TIMEOUT` errors:

1. The AI may be slow to respond. Try again.
2. Check your network connection.
3. Run `doctor` first to verify connectivity.

### Login Not Detected

If `doctor` reports `login_detected: false`:

1. Open chat.deepseek.com in Chrome
2. Verify you can send a message manually
3. Refresh the page and try again

### Input Not Found

If `doctor` reports `input_located: false`:

1. The DeepSeek UI may have changed
2. Try refreshing the page
3. Report an issue if the problem persists

## SEE ALSO

- `multi-ai help ask` - Send a prompt
- `multi-ai help doctor` - Diagnose provider readiness
- `multi-ai help errors` - Error codes reference
