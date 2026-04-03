# Provider: Grok

Grok is an AI assistant by xAI, available at grok.com.

## OVERVIEW

| Property | Value |
|----------|-------|
| ID | `grok` |
| URL | https://grok.com |
| Ask Support | Yes |
| Doctor Support | Yes |
| Login Required | Yes |

## KNOWN RISKS

### Unstable Response Detection

Grok's response detection can be unreliable. The CLI uses multiple signals to detect when a response has started:

1. Stop button appearance
2. Input field clearing
3. Streaming markers
4. Response node growth

If response detection fails, the CLI may report a timeout even when Grok is responding.

### Workaround

If you experience issues with Grok:

1. Increase the timeout: `--timeout 120000`
2. Run `doctor` first to verify connectivity
3. Try a simpler prompt to test

## USAGE

```bash
# Ask Grok a question
multi-ai ask --provider grok --prompt "What is the meaning of life?"

# Diagnose Grok connectivity
multi-ai doctor --provider grok
```

## LOGIN

1. Open https://grok.com in Chrome
2. Sign in with your X (Twitter) account
3. Ensure you can send messages in the Grok interface
4. Run `multi-ai doctor --provider grok` to verify

## TROUBLESHOOTING

### Response Timeout

If you get `RESPONSE_TIMEOUT` errors:

```bash
# Increase timeout
multi-ai ask --provider grok --prompt "Hello" --timeout 120000
```

### Login Not Detected

If `doctor` reports `login_detected: false`:

1. Open grok.com in Chrome
2. Verify you can send a message manually
3. Refresh the page and try again

## SEE ALSO

- `multi-ai help ask` - Send a prompt
- `multi-ai help doctor` - Diagnose provider readiness
- `multi-ai help errors` - Error codes reference
