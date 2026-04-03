# Result Schema Reference

This document describes the JSON schema for all CLI command results.

## Common Fields

All responses include these fields:

| Field | Type | Description |
|-------|------|-------------|
| `command` | string \| null | The command that was executed |
| `status` | string | `success` or `error` |
| `json` | boolean | Always `true` for JSON output |

## Success Response

```json
{
  "command": "<command>",
  "status": "success",
  "json": true,
  "...": "command-specific fields"
}
```

## Error Response

```json
{
  "command": "<command>",
  "status": "error",
  "json": true,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "suggestion": "How to recover"
  }
}
```

## Command-Specific Schemas

### ask

**Success:**
```json
{
  "command": "ask",
  "status": "success",
  "provider": "deepseek",
  "response": {
    "text": "The AI response text",
    "phases": {
      "dispatched": true,
      "responseStarted": true,
      "responseComplete": true
    }
  },
  "json": true
}
```

**Error:**
```json
{
  "command": "ask",
  "status": "error",
  "provider": "deepseek",
  "error": {
    "code": "RESPONSE_TIMEOUT",
    "message": "Response timed out",
    "suggestion": "Increase timeout with --timeout <ms>"
  },
  "json": true
}
```

### providers

**Success:**
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
    }
  ],
  "json": true
}
```

### doctor

**Success (healthy):**
```json
{
  "command": "doctor",
  "status": "success",
  "provider": "deepseek",
  "healthy": true,
  "checks": {
    "browser_connected": true,
    "page_reachable": true,
    "login_detected": true,
    "input_located": true
  },
  "json": true
}
```

**Error (unhealthy):**
```json
{
  "command": "doctor",
  "status": "error",
  "provider": "deepseek",
  "healthy": false,
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

### help

**Success:**
```json
{
  "command": "help",
  "status": "success",
  "helpText": "...",
  "json": true
}
```

## Exit Codes

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success |
| 1 | General error (see error.code for details) |
| 2 | Browser not connected |
| 3 | Authentication/login required |
| 4 | Provider not found |
| 5 | Input element not found |
| 6 | Response timeout |
| 7 | Dispatch failed |
| 8 | Response incomplete |
| 9 | Text extraction failed |
