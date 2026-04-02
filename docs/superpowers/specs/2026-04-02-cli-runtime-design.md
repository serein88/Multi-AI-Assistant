# Multi AI CLI Runtime Design

> Status: Draft approved for planning

## 1. Goal

Build an **agent-first, browser-first local CLI runtime** for this project so tools such as OpenCode, Claude Code, Codex, and OpenClaw can talk to supported web AI providers through the user's already logged-in Chrome session.

The CLI is not intended to replace the browser GUI for humans. It is intended to provide a **stable, self-explanatory, JSON-first local interface** for agents.

## 2. Product Positioning

This CLI should be treated as:

- a **local runtime interface** for automation agents
- a **browser-backed orchestration layer** over real AI websites
- a **protocol surface** with structured results and recoverable errors

This CLI should **not** be treated as:

- a terminal-native chatbot for humans
- a thin wrapper around the existing dashboard UI
- a one-off script tied to a single provider

## 3. Chosen Direction

### Chosen architecture

**Browser-first runtime + CLI frontend**, designed internally so it can evolve into a daemon later.

### Why this direction

Compared with an extension-bridge CLI:

- it keeps the architecture cleaner
- it avoids making the CLI a long-term extension remote control
- it makes JSON contracts, error contracts, and session models easier to define
- it makes future growth into `serve`, explicit sessions, and multi-provider fan-out more natural

Compared with a full daemon-first design on day one:

- it reduces MVP complexity
- it keeps the first implementation focused on reliability instead of infrastructure
- it still allows future daemonization if the runtime boundary is designed cleanly

## 4. Core Constraints

The design must satisfy all of the following:

1. Reuse the user's **normal logged-in Chrome**.
2. Prefer **reusing existing provider tabs**.
3. If a suitable tab does not exist, the runtime may **open and manage a new tab**.
4. The primary caller is an **agent**, not a human at the terminal.
5. Output must default to **JSON**.
6. The first version must focus on **single-provider ask**, while preserving room for future multi-provider fan-out.
7. Providers must be **explicitly specified** for `ask`; no implicit default and no automatic provider choice.
8. The CLI must be **self-explanatory**, including `help` support beyond bare flag listings.

## 5. MVP Scope

### Supported providers in MVP

- Grok
- DeepSeek
- Gemini

### Why these three

- **DeepSeek** provides a comparatively stable baseline.
- **Gemini** surfaces Google-account and verification edge cases.
- **Grok** is the instability stress test and reveals whether the runtime can survive real-world volatility.

### Public commands in MVP

- `ask`
- `providers`
- `doctor`
- `help`

## 6. Command Semantics

### 6.1 `ask`

Purpose: send one prompt to one explicitly specified provider and return a structured JSON result.

Required properties:

- `--provider` is mandatory
- prompt may be passed inline or via file
- output is JSON by default
- no hidden default provider

Example:

```bash
multi-ai ask --provider deepseek --prompt "Summarize this error"
```

### 6.2 `providers`

Purpose: report what providers are implemented and what capabilities are currently supported.

Example:

```bash
multi-ai providers --json
```

### 6.3 `doctor`

Purpose: verify whether the runtime is in a usable state **without sending a real prompt**.

Checks include:

- Chrome connection availability
- remote debugging availability
- provider page reachable or openable
- login state appears usable
- input and key interaction elements are locatable

### 6.4 `help`

Purpose: provide self-explanatory guidance for both humans and agents.

Help must exist at two levels:

1. Standard command/flag help (`--help`)
2. Semantic help (`help errors`, `help result-schema`, `help provider grok`)

## 7. Self-Explanation Requirements

The CLI must explain:

- what each command does
- what required and optional arguments mean
- what JSON fields mean
- what each error code means
- what recovery suggestions imply
- what provider-specific caveats are known

Minimum semantic help topics:

- `help ask`
- `help providers`
- `help doctor`
- `help errors`
- `help result-schema`
- `help provider <id>`

## 8. Browser Runtime Model

### 8.1 Browser ownership

The runtime does **not** own the user's main browser identity. It attaches to the user's existing logged-in Chrome environment.

### 8.2 Tab strategy

For each provider request:

1. Search for a reusable existing provider tab.
2. If found and healthy, reuse it.
3. Otherwise open a new provider tab.
4. Mark runtime-created tabs as managed tabs for future cleanup logic.

### 8.3 Why this matters

This preserves the value of:

- existing login state
- existing page readiness
- reduced setup friction

while still allowing the runtime to recover when no usable tab is available.

## 9. Result Contract

The `ask` result must distinguish these phases:

1. **dispatch** — prompt injection/send was attempted and either succeeded or failed
2. **response started** — the provider showed evidence that generation began
3. **response completed** — the response reached completion
4. **final text** — extracted answer text

Representative shape:

```json
{
  "ok": true,
  "provider": "grok",
  "tab": {
    "mode": "reused",
    "id": "tab-123"
  },
  "dispatch": {
    "ok": true,
    "at": "2026-04-02T12:00:00Z"
  },
  "response": {
    "started": true,
    "started_at": "2026-04-02T12:00:02Z",
    "completed": true,
    "completed_at": "2026-04-02T12:00:15Z",
    "final_text": "..."
  },
  "timing": {
    "dispatch_ms": 320,
    "start_ms": 2100,
    "complete_ms": 15420
  },
  "error": null
}
```

## 10. Error Contract

Errors must be:

- structured
- stage-aware
- actionable

Representative shape:

```json
{
  "ok": false,
  "provider": "gemini",
  "stage": "doctor",
  "error": {
    "code": "login_required",
    "message": "Gemini page is reachable but no authenticated session was detected.",
    "suggestion": "Open Gemini in your normal Chrome profile, complete login, and rerun doctor."
  }
}
```

MVP error codes should include at least:

- `browser_not_connected`
- `remote_debugging_unavailable`
- `provider_not_supported`
- `provider_tab_not_found`
- `provider_page_open_failed`
- `login_required`
- `challenge_detected`
- `input_not_found`
- `send_failed`
- `response_not_started`
- `response_timeout`
- `page_unstable`
- `unknown_provider_state`

## 11. Provider Capability Contract

`providers` should expose machine-readable capability metadata.

Representative shape:

```json
{
  "providers": [
    {
      "id": "grok",
      "implemented": true,
      "ask_supported": true,
      "doctor_supported": true,
      "login_required": true,
      "known_risks": [
        "challenge_detected",
        "dom_volatility"
      ]
    }
  ]
}
```

## 12. Internal Architecture

### 12.1 CLI layer

Responsibilities:

- parse commands and flags
- expose help and self-explanatory documentation
- invoke runtime operations
- serialize JSON output
- map outcomes to stable exit codes

Must not own provider-specific browser logic.

### 12.2 Runtime layer

Responsibilities:

- connect to Chrome
- discover, reuse, or create tabs
- orchestrate `ask` and `doctor`
- normalize errors and results
- isolate browser lifecycle from CLI presentation

This is the core of the system and should be designed so it can later run as a persistent daemon.

### 12.3 Provider adapter layer

Responsibilities:

- provider-specific readiness checks
- input discovery
- prompt injection
- send trigger behavior
- response-start detection
- response-complete detection
- final text extraction
- provider-specific error mapping

Each provider adapter should be independently testable.

## 13. Explicit Non-Goals for MVP

The MVP does **not** need to include:

- multi-provider fan-out execution
- explicit session commands
- a public `serve` command
- token-level streaming output
- replacing the current browser GUI for humans

## 14. Required Future Evolution Paths

The MVP architecture must leave room for:

1. Multi-provider fan-out
2. Explicit sessions
3. Daemon/serve mode
4. Broader provider coverage
5. Richer health diagnostics and telemetry

## 15. Design Principles

1. **Explicit over implicit** — provider must be named.
2. **JSON-first** — output must be stable for automation.
3. **Real browser first** — use the user's actual logged-in environment.
4. **Recoverability matters** — every major error should provide a next-step suggestion.
5. **Thin CLI, strong runtime** — long-term value sits in the runtime and adapter layers.
6. **MVP scope discipline** — keep public commands minimal and reliable.

## 16. Governance and Execution Rules

### 16.1 Subagent policy

Implementation work may use subagents.

Required intent:

- use subagents for isolated implementation tasks where clear boundaries exist
- keep one logical task unit per implementing subagent whenever possible
- preserve a separate reviewer role so the implementation agent is not the final approver of its own work

### 16.2 Independent review requirement

No MVP implementation task should be considered complete without an **independent review** by a separate agent.

The reviewer must validate:

- the implementation matches the approved design and plan
- the JSON contract remains stable
- the error contract still includes actionable recovery suggestions
- tests and verification evidence are sufficient

### 16.3 Backup and revertability

Before risky code changes begin, the implementation workflow must ensure the work is reversible.

Minimum rule set:

1. verify current repository state before edits
2. create or identify a restorable snapshot boundary
3. keep changes scoped to exact files for the current task
4. avoid mixing unrelated working-tree changes into CLI runtime work

This repository already contains unrelated uncommitted changes in places, so exact-path staging and narrow task boundaries are mandatory.

### 16.4 Repo hygiene

Because the repository is already git-initialized and contains pre-existing work, CLI runtime implementation must assume:

- the repository is a live working tree, not a greenfield folder
- unrelated changes may exist at the same time
- every implementation round must explicitly avoid accidental staging of unrelated files

## 17. MVP Acceptance Criteria

### 17.1 `ask`

MVP acceptance for `ask`:

- fails fast if `--provider` is missing
- returns JSON by default
- distinguishes `dispatch`, `response started`, and `response completed`
- returns extracted `final_text` on success
- returns structured `error.code` and `error.suggestion` on failure

### 17.2 `providers`

MVP acceptance for `providers`:

- lists all MVP providers: Grok, DeepSeek, Gemini
- returns capability metadata for each provider
- clearly indicates whether `ask` and `doctor` are supported

### 17.3 `doctor`

MVP acceptance for `doctor`:

- checks Chrome connectivity
- checks provider page reachability or openability
- checks likely login usability
- checks whether the input surface can be found
- does not perform a real send
- returns machine-readable health information and structured failure advice

### 17.4 `help`

MVP acceptance for `help`:

- supports standard command help
- supports semantic help topics
- explains commands, JSON schema, errors, and provider caveats

### 17.5 Runtime architecture

MVP acceptance for internal structure:

- browser connection logic is not mixed into CLI presentation logic
- provider-specific behavior is isolated behind adapters
- the internal runtime boundary remains compatible with future daemonization
