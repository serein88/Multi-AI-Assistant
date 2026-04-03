# Provider: Gemini

Gemini is an AI assistant by Google, available at gemini.google.com.

## OVERVIEW

| Property | Value |
|----------|-------|
| ID | `gemini` |
| URL | https://gemini.google.com |
| Ask Support | Yes |
| Doctor Support | Yes |
| Login Required | Yes |

## KNOWN RISKS

### Verification Surface

Gemini may show verification challenges (CAPTCHA, etc.) that can interfere with CLI usage. If you encounter verification prompts:

1. Complete the verification manually in Chrome
2. Try the CLI command again

### Input Surface Variants

Gemini's input element may have different states depending on the page context. The CLI handles common variants, but edge cases may occur.

## USAGE

```bash
# Ask Gemini a question
multi-ai ask --provider gemini --prompt "What is machine learning?"

# Diagnose Gemini connectivity
multi-ai doctor --provider gemini
```

## LOGIN

1. Open https://gemini.google.com in Chrome
2. Sign in with your Google account
3. Ensure you can send messages in the Gemini interface
4. Run `multi-ai doctor --provider gemini` to verify

## TROUBLESHOOTING

### Response Timeout

If you get `RESPONSE_TIMEOUT` errors:

1. The AI may be slow to respond. Try again.
2. Check your network connection.
3. Run `doctor` first to verify connectivity.

### Login Not Detected

If `doctor` reports `login_detected: false`:

1. Open gemini.google.com in Chrome
2. Verify you can send a message manually
3. Check if you're redirected to a login page
4. Refresh the page and try again

### Redirected to Login

If you're redirected to login when opening Gemini:

1. Complete the login process
2. Ensure "Stay signed in" is checked
3. Try the CLI command again

## SEE ALSO

- `multi-ai help ask` - Send a prompt
- `multi-ai help doctor` - Diagnose provider readiness
- `multi-ai help errors` - Error codes reference
