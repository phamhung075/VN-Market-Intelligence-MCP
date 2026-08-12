---
sprint: TICK-PREFLIGHT-USAGE-INSTRUMENTATION
branch: task/TICK-WU-1-cowork-wiring
size: S
zone: cross-service/
depends_on: ["TICK-WU-0-TELEMETRY-LIB"]
blocks: ["TICK-WU-3-AUDITOR-WIRING"]
---

## TLDR
Wire `scripts/agents-flow/cowork-tick-preflight.sh` at the "Standalone execution" trailer to log per-invocation telemetry via the WU-0 `tt_capture_and_log` wrapper. Changes: source the new lib, wrap the trailer (2-line diff), add logging-specific test cases. Zero changes inside `_emit_verdict()` or any `return` statement — the logging choke point is the pre-existing trailer where all verdict paths already converge.

## [PM] Planning Context

### Zone
`cross-service/` (scripts/agents-flow/ infrastructure — same zone as WU-0)

### Acceptance Criteria (PO AC-1..AC-11 carried forward; inherited from WU-0 baseline)

**AC-1..AC-11:** Same as WU-0 (inherited — log_tick_usage and tt_capture_and_log already satisfy all ACs). This task verifies AC compliance *in situ* on this specific script.

**AC-3 (zero semantic change):** Verdict token, JSON field set, exit code, lock claim/release, MCP calls — all byte-identical before/after. The existing `run_preflight()` output is captured into a variable by `tt_capture_and_log`, reprinted byte-identical (`printf '%s\n' "$out"`), and passed to the logger (which writes to file, not stdout). Exit code is the real `$?` from `run_preflight()`, not the logger's result.

**AC-6 (stdout purity):** The cowork verdict line (`{...verdict:SILENT|WORK|..., tick:...}`) is the ONLY stdout. Logging goes to file via `log_tick_usage`. Test: run the wrapped trailer and verify `stdout` contains only the verdict JSON, no logging noise.

**AC-7 (zero tool calls on silent/skip path):** Cowork's `_emit_verdict()` prints to stdout (the only stdout-writing site in the script). The logging wrapper is called AFTER `run_preflight()` returns, purely as a hook on already-emitted verdict — zero new MCP/git/network I/O on any code path.

**AC-10 (pre-sprint baseline):** Before editing this script, run `bash scripts/agents-flow/cowork-tick-preflight.test.sh` NOW and record the count (unverified baseline cited in PO intake as 20/20). Re-run post-landing and verify same or better counts (QA gate).

### FR Requirements

**FR-2 (cowork wiring at trailer):** `log_tick_usage` fires once per invocation at the trailer (not inside `_emit_verdict()`), capturing the exact string that reaches stdout. Specifically:
- Existing trailer structure:
  ```bash
  if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    run_preflight
    exit $?
  fi
  ```
- New structure:
  ```bash
  if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    tt_capture_and_log "cowork-tick-preflight.sh" run_preflight
    exit $?
  fi
  ```

### Design Shape (Architect Blueprint)

The change is a mechanical 2-line swap in the trailer:

```bash
# OLD (lines ~299-303 or similar)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_preflight
  exit $?
fi

# NEW
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  tt_capture_and_log "cowork-tick-preflight.sh" run_preflight
  exit $?
fi
```

Plus one new source line near the top (alongside existing `source "$SCRIPT_DIR/mcp-call.sh"`):
```bash
source "$SCRIPT_DIR/lib/tick-telemetry.sh"
```

Total diff: ~3 lines (1 source + 1 trailer swap + 1 exit).

### Exit Code Mapping

Per architect ratification: `exit_code` is captured from the trailer's real `$?` (post-`run_preflight()`), not a lookup table. Verified mapping (architect read-verified):
- `SILENT` → exit 0 (line ~142, `_step8_silent_release` `return 0`)
- Everything else (`ERROR|TOMBSTONED|DEFER|LOST_ELECTION|WORK`) → exit 1

The logging wrapper preserves this by capturing the real `$?` after `run_preflight()` returns.

### Test Coverage

**Existing tests:** The ~13+ assertions in `cowork-tick-preflight.test.sh` source the script and call `run_preflight()` directly (never reach the trailer since `BASH_SOURCE[0] != $0` when sourced). These stay green by construction (R4 — `run_preflight()` internals untouched).

**New test cases (additive):**
1. **Logging-specific case:** Call the wrapped trailer via `tt_capture_and_log` directly (mimic source + call pattern), verify log file contents (JSON format, fields present)
2. **Rotation in-situ:** Over-fill the log, verify rotation works and latest lines remain
3. **AC-6 stdout purity:** Verify cowork verdict is FIRST and ONLY line on stdout (negative control: log file has entries, stdout is clean)
4. **AC-4/AC-5 fault inject:** Unwritable log destination, verify `tt_capture_and_log` returns caller's real exit code unaffected

### Files to read first

- `docs/handoffs/TASK_TICK-WU-0-TELEMETRY-LIB.md` (WU-0 spec — know what tt_capture_and_log does)
- `scripts/agents-flow/cowork-tick-preflight.sh` (entire file, focus on trailer lines ~299-303 and _emit_verdict lines ~76-82)
- `scripts/agents-flow/cowork-tick-preflight.test.sh` (understand existing test seam: PREFLIGHT_ROOT fixture, mcp_call stub)
- `docs/handoffs/TICK-PREFLIGHT-USAGE-INSTRUMENTATION-BA-spec.md` § Verified Paths — cowork section for confirmed choke point and exit-code mapping

### Files to create

- **NEW `scripts/agents-flow/cowork-tick-preflight.test.sh` additions** (within existing file)
  - Add logging-specific test cases (4-5 new `OUT=...; assert` blocks)
  - Use existing `PREFLIGHT_ROOT` fixture (already exported in test setup)
  - Verify log file format, rotation, stdout purity, fault injection

### Files to modify

1. **MODIFIED `scripts/agents-flow/cowork-tick-preflight.sh`**
   - Line ~top: add `source "$SCRIPT_DIR/lib/tick-telemetry.sh"` (after existing `source "$SCRIPT_DIR/mcp-call.sh"`)
   - Lines ~299-303 (trailer): replace `run_preflight` with `tt_capture_and_log "cowork-tick-preflight.sh" run_preflight`
   - Zero other changes (internal `run_preflight()` / `_emit_verdict()` / `return` statements untouched)

2. **MODIFIED `scripts/agents-flow/cowork-tick-preflight.test.sh`**
   - Add new test cases (nested inside `testMain()` or as separate functions, follow existing pattern)
   - Use `TICK_TELEMETRY_LOG_PATH` override (passed via environment, no new fixture seam needed — cowork's `PREFLIGHT_ROOT` already covers it)
   - Assert log file JSON format, field presence, rotation behavior, exit-code preservation

### Dependencies

- **Upstream:** TICK-WU-0-TELEMETRY-LIB (must be green first; cowork depends on `tt_capture_and_log` existing)
- **Downstream:** TICK-WU-3-AUDITOR-WIRING (auditor depends on both WU-0+WU-1+WU-2 per architect gate)

### Knowledge needed

- Understand `tt_capture_and_log` behavior (read WU-0 handoff)
- Existing `PREFLIGHT_ROOT` fixture pattern in cowork test suite
- jq `-c` compact output format
- JSON line format (one record per line)
- Expected exit-code mapping for cowork (SILENT→0, others→1)

---

## Risk Notes (Architect's — propagated for dev awareness)

**R1 (correctness-critical):** WU-0's suite must prove stdout purity via fault-injection; this task verifies it works in-situ on cowork. Do not skip the `tt_capture_and_log` → fault-injected-logger negative control.

**R3 (byte-identity edge case, low):** Command-substitution drops trailing NULs; not a risk for cowork's JSON output, but noted.

**R4 (positive):** Existing cowork test suite (which sources the script and calls `run_preflight` directly, never reaching the trailer) stays green by construction. New logging tests are additive only.

---

## RETURN (PM)

Handoff complete. Task ready for developer dispatch.

AC: AC-1..AC-11 (inherited from WU-0 baseline + verified in-situ on this script); exit-code mapping verified; R1/R3/R4 acknowledged.

Zone: cross-service/

Depends on: TICK-WU-0-TELEMETRY-LIB (must be green)

Blocks: TICK-WU-3-AUDITOR-WIRING (auditor needs both WU-1 and WU-2 done first)

---

## [Developer] Implementation Record

- **Files modified:**
  - `scripts/agents-flow/cowork-tick-preflight.sh` — added `source "$SCRIPT_DIR/lib/tick-telemetry.sh"` (after the existing `mcp-call.sh` source); trailer swapped `run_preflight; exit $?` → `tt_capture_and_log "cowork-tick-preflight.sh" run_preflight; exit $?` (+comment block). Zero other lines touched — `run_preflight()`/`_emit_verdict()`/all `return` sites byte-identical.
  - `scripts/agents-flow/cowork-tick-preflight.test.sh` — 5 new test blocks appended (T-LOG..T-LOG5, 18 assertions): logging-specific field-shape check, WORK-path exit-code preservation, rotation-in-situ (8 real invocations, cap=5), AC-6 stdout purity + AC-2/AC-3 byte-identity (diffed against a direct unwrapped `run_preflight()` call — corrected from an initial wrong "single-line stdout" assumption, see decision journal S6), AC-4/AC-5 unwritable-log-destination fault injection.
- **Tests written:** `scripts/agents-flow/cowork-tick-preflight.test.sh` — 18 new assertions, all GREEN.
- **Git commits:** (pending — see closeout)
- **tsc status:** N/A — pure bash/jq, no `apps/` TypeScript touched (cross-service/ zone, same as WU-0).
- **Full suite:** `cowork-tick-preflight.test.sh` 58/58 (AC-10 pre-edit baseline 40/40 confirmed unchanged by R4 before any new test was added; +18 new). `dev-team-tick-preflight.test.sh` 146/146 unaffected (WU-2 landed same cycle, see its own handoff). `shellcheck -S warning` clean.
- **Docs updated:** NONE — this task's own handoff is the only doc impacted (Implementation Record below); no `docs/{policies,protocols,standards,references}/` domain doc changed by this mechanical wiring (WU-0 already carries the CANONICAL block).
- **Graphify:** skipped (no docs impacted).
- **Simplicity gate:** PASS — Q1 scope clean (exact 3-line production diff, no extra flags/knobs), Q2 no single-use abstractions (reused WU-0's `tt_capture_and_log` verbatim), Q3 senior-test clean, Q4 ratio <50% overhead (nearly all added lines are the explicitly-requested new test coverage).

---

## [QA] Review Record

**Verdict: APPROVED — DONE_VERIFIED.** Direct-commit verify (commit `976e7c5b7`, confirmed on `main` ancestry via `git log`; no `task/TICK-WU-1-cowork-wiring` branch exists — the frontmatter `branch:` field is aspirational, not used; no merge/push/branch-delete step needed). Everything below independently RAW-verified against the actual diff and by actually running things — developer's own prose was read but not trusted as evidence.

- **Diff shape matches claim exactly:** `git show --stat 976e7c5b7` touches only `docs/handoffs/TASK_TICK-WU-1-COWORK-WIRING.md`, `scripts/agents-flow/cowork-tick-preflight.sh` (+10/-1), `scripts/agents-flow/cowork-tick-preflight.test.sh` (+86/-0, pure append). `git show` on the `.sh` file shows exactly TWO hunks: one new `source "$SCRIPT_DIR/lib/tick-telemetry.sh"` line near the top, one trailer swap (`run_preflight` → `tt_capture_and_log "cowork-tick-preflight.sh" run_preflight`) plus a comment block — zero touches inside `run_preflight()`/`_emit_verdict()`/any `return` site (AC-3/FR-2 confirmed structurally, not just by developer's claim).
- **Re-ran `cowork-tick-preflight.test.sh` myself:** 58/58 PASS — matches claimed count exactly, not copy-pasted.
- **Independently re-verified the AC-10 pre-edit baseline** (not trusted from the journal chain): checked out the immediate parent commit into a disposable `git worktree` and ran the suite there — 40/40 PASS, exact match to developer's/WU-0 QA's recorded baseline.
- **shellcheck -S warning:** ran myself on both touched files — clean, exit 0.
- **Live smoke-run of the wired trailer standalone** (`bash scripts/agents-flow/cowork-tick-preflight.sh` with `CLAUDE_CODE_SESSION_ID` exported, `PREFLIGHT_ROOT` pointed at a scratch tree) beyond just the test suite's stubbed calls: stdout was exactly one valid JSON document (`jq -e .` parses), exit code matched the verdict (`ERROR`→1), telemetry line written to `docs/data/telemetry/cowork-tick-preflight.jsonl` with the correct 7-key shape, and `grep` of the exported session-id value against the log file found zero matches.
- **`CLAUDE_CODE_SESSION_ID` never logged:** grepped the changed `.sh` file — the only 3 references are the script's own pre-existing presence/error-message logic (lines 56/148/150, unrelated to WU-1's diff), never passed to `log_tick_usage`/`tt_capture_and_log`. Test T-LOG's own key-shape-absence assertion also re-run and PASS.
- **jq-only, no python3:** grep for `python3` across the 3 touched files returns zero hits (tick-telemetry.sh's own doc-comment mention is pre-existing WU-0 code, untouched here).
- **No new tool call on the silent/skip path:** `docs/agents/cowork-team/flow/main.md:58` still shows the single `VERDICT_JSON=$(bash "$PROJECT_ROOT/scripts/agents-flow/cowork-tick-preflight.sh")` invocation, unchanged.
- **Byte-identity/stdout-purity (AC-2/AC-3/AC-6):** T-LOG4 diffs a direct unwrapped `run_preflight()` call against the `tt_capture_and_log`-wrapped call under identical stub state and asserts byte-for-byte equality, plus a single-JSON-document parse check — re-ran, PASS. Confirms the developer's self-caught "single line" test-authoring correction (S6 journal entry) was the right fix, not a cover for a real regression.
- **orch-state.json:** confirmed `git show --stat 976e7c5b7` does not touch `docs/data/orch/orch-state.json`. Applied my own status flip via `jq | scripts/orch-apply.sh` but did not commit the live file myself (it currently carries substantial unrelated uncommitted peer-agent dirt) — same discipline as WU-0's own QA cycle and the developer's own commit discipline.
