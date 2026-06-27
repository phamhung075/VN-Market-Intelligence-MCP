---
task_id: SSOT-W1-HOOK-ENFORCE
sprint: SSOT-INTEGRITY-PERIMETER
wave: 1
rank: 3
type: dev
size: S
zone: .claude/
priority: high
owner: dev-mcp-server
depends_on:
  - SSOT-W1-ZOD-SCHEMA-MODEL
created_at: 2026-06-27T16:50:00Z
---

# SSOT-W1-HOOK-ENFORCE

**Current state:** Hook enforcement is ~90% wired. Both hook scripts exist and are registered in `.claude/settings.local.json`.

**What's shipped:**
- `scripts/agents-flow/orch-state-hook-prewrite.mjs`: PreToolUse hook for Write|Edit calls targeting file_path ending in `orch-state.json`
  - Intercepts Write: extracts tool_input.content
  - Intercepts Edit: reconstructs post-edit content from old_string→new_string delta
  - Writes candidate to temp file
  - Runs `bun scripts/orch-validate.mjs <temp>`
  - On validator non-zero exit: outputs `{"decision":"block","reason":"..."}` to stdout
  - reason field contains structured auto-fix error output (truncated at 600 chars for agent readability)
  - On bun spawn fail or validator missing: blocks hard (misconfiguration is fatal)
  - On stdin parse error: allows through silently (hook must not break non-orch-state work)

- `scripts/agents-flow/orch-state-hook-bash-backstop.sh`: PostToolUse hook for Bash calls
  - Fires after every Bash command
  - Filters: grep command for `orch-state|docs/data/orch` to avoid latency on unrelated Bash
  - On match: runs validator, emits structured warning to stdout (Claude Code surfaces as feedback)
  - Non-blocking: always exits 0 (write already happened; fix-forward is recovery)

- `.claude/settings.local.json`: Both hooks registered
  - PreToolUse: Write|Edit matcher with bun command path
  - PostToolUse: Bash matcher with bash command path

**Delta — what this task hardens:**
1. **QA-5 gate (Write of bad orch-state blocked):** Write test where Claude Code issues a Write call to orch-state.json with an invalid status (e.g., "PARKED"). Hook must return `{"decision":"block","reason":"..."}` and the write must NOT reach disk. Verify by checking file contents post-hook-return.

2. **PreToolUse inline-validate wiring:** Verify hook correctly:
   - Detects Write calls with file_path ending in orch-state.json
   - Extracts content from tool_input.content (Write) or reconstructs from old_string/new_string (Edit)
   - Invokes bun subprocess without hanging/timing out
   - Parses validator exit code and structured stderr
   - Formats reason field (first ~600 chars of validator output) for agent visibility

3. **PostToolUse bash matcher heuristic:** Verify hook correctly:
   - Filters Bash calls to avoid latency on non-orch work (grep for `orch-state|docs/data/orch`)
   - Runs validator on matching commands
   - Emits warning (non-blocking) on validator fail
   - Exits 0 always (so bad writes can be fixed via git/re-validate/retry, not stalled by the hook)

4. **Error handling:** Verify both hooks gracefully handle:
   - bun not found / subprocess spawn failure → block hard (PreToolUse), log warning (PostToolUse)
   - Validator path missing → block hard (PreToolUse), log warning (PostToolUse)
   - stdin parse error in hook (malformed tool_input) → allow through silently (PreToolUse — must not break non-orch work)
   - File I/O errors (temp file write, read) → block hard with clear reason (PreToolUse), non-blocking (PostToolUse)

5. **Integration:** Verify hooks work in end-to-end flow:
   - Agent (Claude Code) issues Write with bad orch-state
   - PreToolUse intercepts, blocks, returns reason
   - Agent receives feedback + structured reason
   - Agent self-corrects and retries (or escalates)
   - Second Write passes validation
   - PreToolUse allows through, file updated

**Acceptance criteria:**
- QA-5 gate passes (Write of bad orch-state blocked, deny reason returned to agent).
- PreToolUse inline-validate logic verified for both Write and Edit paths.
- PostToolUse matcher heuristic verified (avoids latency, non-blocking behavior confirmed).
- Error handling tested for all failure modes (subprocess, file, validator missing, stdin parse).
- Hook registration in settings.local.json verified as active.
- No regressions in non-orch Write/Edit/Bash calls (hooks don't interfere with unrelated work).
- Full Claude Code agent loop test green.

**Files touched:**
- `scripts/agents-flow/orch-state-hook-prewrite.mjs` (review, add test coverage)
- `scripts/agents-flow/orch-state-hook-bash-backstop.sh` (review, add test coverage)
- `.claude/settings.local.json` (verify registration, no edits needed if already wired)

**Depends on:** SSOT-W1-ZOD-SCHEMA-MODEL (schema must exist for validator to import).

**Time estimate:** 1.5h (verify inline-validate wiring, test all error paths, integration test, registration check).
