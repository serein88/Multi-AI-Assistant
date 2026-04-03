# Error Codes Reference

This document describes all error codes returned by the multi-ai CLI.

## Error Response Structure

All errors follow this JSON structure:

```json
{
  "command": "ask",
  "status": "error",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "suggestion": "How to recover"
  },
  "json": true
}
```

## Command Errors

### UNKNOWN_COMMAND
The command does not exist.

**Message:** `Unknown command: <command>`

**Suggestion:** Run `multi-ai help` to see available commands.

### UNKNOWN_TOPIC
The help topic does not exist.

**Message:** `Unknown help topic: <topic>`

**Suggestion:** Run `multi-ai help` to see available topics.

### UNKNOWN_PROVIDER
The provider ID is not recognized.

**Message:** `Unknown provider: <id>`

**Suggestion:** Run `multi-ai providers` to see available providers.

### MISSING_PROVIDER_ID
Provider ID is required but not provided.

**Message:** `Provider ID is required`

**Suggestion:** Specify a provider with `--provider <id>`.

### PROVIDER_NOT_FOUND
The specified provider is not supported.

**Message:** `Unknown provider: <id>`

**Suggestion:** Use a supported provider: deepseek, gemini, grok

## Browser Errors

### BROWSER_NOT_CONNECTED
Chrome is not running or remote debugging is not enabled.

**Message:** `Could not connect to Chrome`

**Suggestion:** Start Chrome with `--remote-debugging-port=9222`.

## Authentication Errors

### LOGIN_REQUIRED
User is not logged in to the provider.

**Message:** `Login required`

**Suggestion:** Log in to the provider in your browser and try again.

### VERIFICATION_REQUIRED
A verification challenge (CAPTCHA, etc.) is present.

**Message:** `Verification required`

**Suggestion:** Complete the verification in your browser and try again.

### LOGIN_REDIRECT
User was redirected to a login page.

**Message:** `Redirected to login page`

**Suggestion:** Log in to the provider in your browser and try again.

### CHALLENGE_REQUIRED
A challenge/verification surface was detected.

**Message:** `Challenge required`

**Suggestion:** Complete the challenge in your browser and try again.

## Input Errors

### INPUT_NOT_FOUND
Could not find the input element on the page.

**Message:** `Input element not found`

**Suggestion:** The page may have changed. Try refreshing or report an issue.

## Response Errors

### RESPONSE_TIMEOUT
The AI did not respond within the timeout period.

**Message:** `Response did not start within timeout`

**Suggestion:** The AI may be slow to respond. Try again or check your network connection.

### DISPATCH_FAILED
Failed to dispatch the prompt to the provider.

**Message:** `Failed to dispatch prompt`

**Suggestion:** Check if the page is responsive and try again.

### RESPONSE_INCOMPLETE
The response was not completed.

**Message:** `Response incomplete`

**Suggestion:** Try again or check for provider issues.

### TEXT_EXTRACTION_FAILED
Could not extract the response text.

**Message:** `Failed to extract response text`

**Suggestion:** The response format may have changed. Report an issue.

## Help System Errors

### HELP_FILE_NOT_FOUND
The help file for a known topic/provider is missing.

**Message:** `Help file not found for <topic/provider>`

**Suggestion:** This may be a bug. Please report it.

### HELP_FILE_READ_ERROR
The help file exists but could not be read.

**Message:** `Failed to read help file for <topic/provider>`

**Suggestion:** File system error. Check permissions.

## Doctor Errors

### CHECK_FAILED
A doctor check failed.

**Message:** `Check failed: <check_name>`

**Suggestion:** See the specific check failure for details.

## Internal Errors

### INTERNAL_ERROR
An unexpected error occurred.

**Message:** `Internal error: <details>`

**Suggestion:** This is a bug. Please report it with the full error message.
