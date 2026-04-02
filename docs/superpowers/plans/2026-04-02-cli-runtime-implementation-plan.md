# CLI Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an agent-first, browser-first CLI MVP that reuses the user's logged-in Chrome, supports `ask/providers/doctor/help`, and works first for Grok, DeepSeek, and Gemini with stable JSON output.

**Architecture:** Add a thin CLI layer on top of a runtime core that owns Chrome connection, tab reuse/open logic, and normalized result/error contracts. Keep provider-specific logic isolated in adapters so MVP can ship single-provider `ask` while preserving a clean path to future fan-out and daemon mode.

**Tech Stack:** Existing repo JavaScript, Chrome/extension-era provider knowledge, new Node-based CLI/runtime modules, git for backups/revertability, independent review subagents.

---

## File Structure

Planned new files/directories for MVP:

- Create: `cli/`
- Create: `cli/index.js` — top-level CLI entry point and command router
- Create: `cli/commands/ask.js` — `ask` command handler
- Create: `cli/commands/providers.js` — `providers` command handler
- Create: `cli/commands/doctor.js` — `doctor` command handler
- Create: `cli/commands/help.js` — semantic help command handler
- Create: `cli/runtime/chrome.js` — Chrome connection and target discovery
- Create: `cli/runtime/tabs.js` — provider tab reuse/create policy
- Create: `cli/runtime/contracts.js` — result/error/exit code normalization
- Create: `cli/runtime/ask.js` — orchestrates one ask lifecycle
- Create: `cli/runtime/doctor.js` — orchestrates one doctor lifecycle
- Create: `cli/providers/registry.js` — provider capability metadata for CLI runtime
- Create: `cli/providers/shared.js` — shared provider adapter helpers
- Create: `cli/providers/deepseek.js` — DeepSeek adapter
- Create: `cli/providers/gemini.js` — Gemini adapter
- Create: `cli/providers/grok.js` — Grok adapter
- Create: `cli/help/*.md` or equivalent embedded help source files — semantic help content
- Create: `tests/cli/` — CLI/runtime tests
- Create: `tests/cli/contracts.test.js`
- Create: `tests/cli/providers.test.js`
- Create: `tests/cli/help.test.js`
- Create: `tests/cli/runtime.test.js`

Planned existing files to modify:

- Modify: `providers.js` only if extraction/re-export is necessary and minimal
- Modify: `task.md` — track this task through status transitions
- Modify: `progress.md` — record implementation evidence per round

Notes:

- Do **not** modify dashboard or extension runtime files for MVP unless a later task proves a shared extraction is clearly necessary.
- Before any code-edit task, create a restorable backup point using git status verification and an explicit branch/commit strategy or patch snapshot.
- Independent code review must be performed by a separate agent before claiming completion.

---

### Task 1: Create planning and execution scaffolding

**Files:**
- Modify: `task.md`
- Modify: `progress.md`
- Test: N/A (document verification)

- [ ] **Step 1: Add or update the active task entry in `task.md`**

Record a new task for CLI runtime MVP planning/execution with status `进行中`.

- [ ] **Step 2: Append the planning record in `progress.md`**

Record what was decided in the spec and what documents were created.

- [ ] **Step 3: Verify only documentation/progress files changed in this task**

Run: `git status --short`

Expected: only plan/spec/progress/task files changed for this task.

- [ ] **Step 4: Commit planning artifacts**

```bash
git add task.md progress.md docs/superpowers/specs/2026-04-02-cli-runtime-design.md docs/superpowers/plans/2026-04-02-cli-runtime-implementation-plan.md
git commit -m "docs: add CLI runtime design and implementation plan"
```

---

### Task 2: Create CLI entry point and command routing skeleton

**Files:**
- Create: `cli/index.js`
- Create: `cli/commands/ask.js`
- Create: `cli/commands/providers.js`
- Create: `cli/commands/doctor.js`
- Create: `cli/commands/help.js`
- Test: `tests/cli/help.test.js`

- [ ] **Step 1: Write the failing command-routing test**

Cover:

- `ask` routes to ask handler
- `providers` routes to providers handler
- `doctor` routes to doctor handler
- `help` routes to help handler
- unknown command returns structured error

- [ ] **Step 2: Run test to verify it fails**

Run the single test file using the project’s chosen Node test runner.

Expected: missing module or missing handler failure.

- [ ] **Step 3: Write minimal CLI router implementation**

Implement:

- argument parsing
- command dispatch
- `--help` passthrough behavior
- JSON-first output wrapper

- [ ] **Step 4: Add standard help text for every public command**

Each command must explain:

- purpose
- required arguments
- examples
- expected JSON behavior

- [ ] **Step 5: Run tests to verify routing and help pass**

- [ ] **Step 6: Commit**

```bash
git add cli/index.js cli/commands tests/cli/help.test.js
git commit -m "feat: add CLI command routing skeleton"
```

---

### Task 3: Define result, error, and exit-code contracts

**Files:**
- Create: `cli/runtime/contracts.js`
- Test: `tests/cli/contracts.test.js`

- [ ] **Step 1: Write the failing contract tests**

Test:

- success result shape for `ask`
- failure result shape for `ask`
- doctor result shape
- provider list result shape
- exit code mapping for known error codes

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement minimal contract builders**

Include:

- `makeAskSuccess`
- `makeAskFailure`
- `makeDoctorResult`
- `makeProvidersResult`
- `mapErrorCodeToExitCode`

- [ ] **Step 4: Encode required structured recovery suggestion behavior**

Ensure every error-producing path can carry `code`, `message`, and `suggestion`.

- [ ] **Step 5: Run tests to verify they pass**

- [ ] **Step 6: Commit**

```bash
git add cli/runtime/contracts.js tests/cli/contracts.test.js
git commit -m "feat: add CLI result and error contracts"
```

---

### Task 4: Add provider registry and capability metadata

**Files:**
- Create: `cli/providers/registry.js`
- Test: `tests/cli/providers.test.js`

- [ ] **Step 1: Write the failing provider metadata test**

Test that registry exposes exactly MVP providers with:

- `id`
- `implemented`
- `ask_supported`
- `doctor_supported`
- `login_required`
- `known_risks`

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement minimal provider registry**

Source provider identity from existing project knowledge, but keep CLI metadata independent.

- [ ] **Step 4: Add command integration so `providers` returns JSON metadata**

- [ ] **Step 5: Run tests to verify registry behavior passes**

- [ ] **Step 6: Commit**

```bash
git add cli/providers/registry.js cli/commands/providers.js tests/cli/providers.test.js
git commit -m "feat: add provider capability registry"
```

---

### Task 5: Build Chrome connection and tab discovery runtime

**Files:**
- Create: `cli/runtime/chrome.js`
- Create: `cli/runtime/tabs.js`
- Test: `tests/cli/runtime.test.js`

- [ ] **Step 1: Write the failing runtime connection test**

Cover:

- browser not connected
- browser connected but provider tab absent
- provider tab reuse path
- provider tab creation path

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement Chrome connection abstraction**

Minimal responsibilities:

- connect to the user’s Chrome
- enumerate targets/tabs
- normalize browser connection errors

- [ ] **Step 4: Implement provider tab policy**

Required order:

1. look for reusable provider tab
2. if reusable and healthy, return it
3. otherwise create/open a new one

- [ ] **Step 5: Run tests to verify runtime behavior passes**

- [ ] **Step 6: Commit**

```bash
git add cli/runtime/chrome.js cli/runtime/tabs.js tests/cli/runtime.test.js
git commit -m "feat: add Chrome connection and tab management runtime"
```

---

### Task 6: Implement `doctor` orchestration for DeepSeek first

**Files:**
- Create: `cli/runtime/doctor.js`
- Create: `cli/providers/shared.js`
- Create: `cli/providers/deepseek.js`
- Test: `tests/cli/runtime.test.js`

- [ ] **Step 1: Write the failing DeepSeek doctor test**

Cover:

- Chrome connection ok
- page reachable
- login detected
- input located
- structured unhealthy result when any check fails

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement shared doctor helper behavior**

Helpers should standardize:

- readiness checks
- common DOM query patterns
- error normalization

- [ ] **Step 4: Implement DeepSeek doctor adapter**

- [ ] **Step 5: Wire the `doctor` command to DeepSeek**

- [ ] **Step 6: Run tests to verify DeepSeek doctor passes**

- [ ] **Step 7: Commit**

```bash
git add cli/runtime/doctor.js cli/providers/shared.js cli/providers/deepseek.js tests/cli/runtime.test.js cli/commands/doctor.js
git commit -m "feat: add DeepSeek doctor support"
```

---

### Task 7: Implement `ask` lifecycle for DeepSeek first

**Files:**
- Create: `cli/runtime/ask.js`
- Modify: `cli/providers/deepseek.js`
- Test: `tests/cli/runtime.test.js`

- [ ] **Step 1: Write the failing DeepSeek ask test**

Cover required result phases:

- dispatch ok/fail
- response started true/false
- response completed true/false
- final text extraction

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement minimal `ask` orchestration**

The runtime should:

- resolve tab
- inject prompt
- trigger send
- detect response start
- detect response completion
- extract final text

- [ ] **Step 4: Ensure structured failures include recovery suggestions**

- [ ] **Step 5: Wire `ask` command to runtime**

- [ ] **Step 6: Run tests to verify DeepSeek ask passes**

- [ ] **Step 7: Commit**

```bash
git add cli/runtime/ask.js cli/providers/deepseek.js cli/commands/ask.js tests/cli/runtime.test.js
git commit -m "feat: add DeepSeek ask lifecycle"
```

---

### Task 8: Add Gemini adapter support

**Files:**
- Create: `cli/providers/gemini.js`
- Modify: `cli/runtime/doctor.js`
- Modify: `cli/runtime/ask.js`
- Test: `tests/cli/runtime.test.js`

- [ ] **Step 1: Write failing Gemini doctor and ask tests**

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement Gemini readiness, input, send, and result extraction behavior**

- [ ] **Step 4: Encode Gemini-specific failure hints**

Examples:

- verification surface present
- redirected to login
- input surface variant not ready

- [ ] **Step 5: Run tests to verify Gemini support passes**

- [ ] **Step 6: Commit**

```bash
git add cli/providers/gemini.js cli/runtime/doctor.js cli/runtime/ask.js tests/cli/runtime.test.js
git commit -m "feat: add Gemini CLI adapter support"
```

---

### Task 9: Add Grok adapter support

**Files:**
- Create: `cli/providers/grok.js`
- Modify: `cli/runtime/doctor.js`
- Modify: `cli/runtime/ask.js`
- Test: `tests/cli/runtime.test.js`

- [ ] **Step 1: Write failing Grok doctor and ask tests**

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement Grok readiness and ask behavior**

Carry over the already-learned constraints from the extension era:

- response-start is more trustworthy than button-click alone
- unstable/challenge conditions need explicit classification

- [ ] **Step 4: Add Grok-specific risk and recovery mappings**

- [ ] **Step 5: Run tests to verify Grok support passes**

- [ ] **Step 6: Commit**

```bash
git add cli/providers/grok.js cli/runtime/doctor.js cli/runtime/ask.js tests/cli/runtime.test.js
git commit -m "feat: add Grok CLI adapter support"
```

---

### Task 10: Implement semantic help system

**Files:**
- Modify: `cli/commands/help.js`
- Create: `cli/help/ask.md`
- Create: `cli/help/providers.md`
- Create: `cli/help/doctor.md`
- Create: `cli/help/errors.md`
- Create: `cli/help/result-schema.md`
- Create: `cli/help/provider-grok.md`
- Create: `cli/help/provider-deepseek.md`
- Create: `cli/help/provider-gemini.md`
- Test: `tests/cli/help.test.js`

- [ ] **Step 1: Write failing semantic help tests**

Cover:

- `help ask`
- `help providers`
- `help doctor`
- `help errors`
- `help result-schema`
- `help provider <id>`

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement semantic help loader and renderer**

- [ ] **Step 4: Write help content that is stable and machine-usable**

- [ ] **Step 5: Run tests to verify semantic help passes**

- [ ] **Step 6: Commit**

```bash
git add cli/commands/help.js cli/help tests/cli/help.test.js
git commit -m "feat: add semantic help system"
```

---

### Task 11: Add safety, backup, and review workflow enforcement

**Files:**
- Modify: implementation docs only as needed
- Test: manual workflow verification

- [ ] **Step 1: Define the backup rule used before each code task**

Before editing code in each implementation session:

- verify `git status`
- create a dedicated branch if needed
- ensure a restorable snapshot exists before risky changes

- [ ] **Step 2: Define subagent usage policy for implementation**

At minimum:

- one subagent may implement a task
- a separate independent subagent must review the result before completion claims

- [ ] **Step 3: Document the review requirement in progress tracking**

- [ ] **Step 4: Commit workflow documentation updates if needed**

```bash
git add progress.md task.md
git commit -m "docs: record CLI implementation safety workflow"
```

---

### Task 12: Final verification and handoff

**Files:**
- Modify: `task.md`
- Modify: `progress.md`
- Test: all CLI tests and command smoke checks

- [ ] **Step 1: Run diagnostics/tests for all CLI files**

Run the chosen Node test suite for CLI modules.

Expected: all tests pass.

- [ ] **Step 2: Smoke test each public command**

At minimum:

- `multi-ai help`
- `multi-ai providers`
- `multi-ai doctor --provider deepseek`
- `multi-ai ask --provider deepseek --prompt "test"`

- [ ] **Step 3: Dispatch independent code review agent**

The review must be performed by a separate agent, not the implementation agent.

- [ ] **Step 4: Fix review findings and rerun verification**

- [ ] **Step 5: Update `task.md` and `progress.md` for completion evidence**

- [ ] **Step 6: Commit final verified MVP state**

```bash
git add cli tests task.md progress.md
git commit -m "feat: ship CLI runtime MVP for Grok DeepSeek and Gemini"
```

---

## Testing Strategy Summary

- Prefer TDD for every new CLI/runtime unit.
- Start with contract tests because the JSON shape is part of the product.
- Add provider support one adapter at a time.
- Use DeepSeek as the first vertical slice.
- Keep command-level tests and runtime-level tests separate.
- Do not claim completion without an independent review agent.

## Execution Notes

- Because this repository already contains unrelated uncommitted changes, implementation sessions must avoid accidental staging by always adding exact file paths.
- Because the user explicitly requested backup/revertability, every risky code task should start from a clean, understood git snapshot or a narrowly scoped branch/commit boundary.
- Because the user explicitly requested subagent usage and independent review, implementation should prefer fresh subagents per task and a dedicated review subagent between logical milestones.
