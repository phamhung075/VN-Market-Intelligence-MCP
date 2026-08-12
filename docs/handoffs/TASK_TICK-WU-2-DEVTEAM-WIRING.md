---
sprint: TICK-PREFLIGHT-USAGE-INSTRUMENTATION
branch: task/TICK-WU-2-devteam-wiring
size: S
zone: cross-service/
depends_on: ["TICK-WU-0-TELEMETRY-LIB"]
blocks: ["TICK-WU-3-AUDITOR-WIRING"]
---

## TLDR
Wire `scripts/agents-flow/dev-team-tick-preflight.sh` at the "Standalone execution" trailer to log per-invocation telemetry via the WU-0 `tt_capture_and_log` wrapper. Changes: source the new lib, wrap the trailer (2-3 line diff), add logging-specific test cases. Zero changes inside `_emit_verdict()` or any `return` statement — the logging choke point is the pre-existing trailer where all verdict paths already converge.

## [PM] Planning Context

### Zone
`cross-service/` (scripts/agents-flow/ infrastructure — same zone as WU-0/WU-1)

### Acceptance Criteria (PO AC-1..AC-11 carried forward; inherited from WU-0 baseline)

**AC-1..AC-11:** Same as WU-0 (inherited — log_tick_usage and tt_capture_and_log already satisfy all ACs). This task verifies AC compliance *in situ* on this specific script.

**AC-3 (zero semantic change):** Verdict token, JSON field set, exit code, lock claim/release, MCP calls — all byte-identical before/after. The existing `run_preflight()` output is captured into a variable by `tt_capture_and_log`, reprinted byte-identical, and passed to the logger (which writes to file, not stdout). Exit code is the real `$?` from `run_preflight()`.

**AC-6 (stdout purity):** The dev-team verdict line (`{...verdict:SKIP|SKIP-WIDENED|RUN|..., tick:...}`) is the ONLY stdout. Logging goes to file. Note: `_step55_board_hygiene()` has a PRE-EXISTING but rare stdout-leak risk (unredirected `orch-state-validate.sh` / `git commit` output) independent of this sprint — if it leaks during a test, logging will defensively output `verdict:UNKNOWN, tick:null` (R6, not a regression).

**AC-7 (zero tool calls on silent/skip path):** Dev-team's `_emit_verdict()` prints to stdout. The logging wrapper is called AFTER `run_preflight()` returns, purely as a hook — zero new MCP/git/network I/O on any code path.

**AC-10 (pre-sprint baseline):** Before editing this script, run `bash scripts/agents-flow/dev-team-tick-preflight.test.sh` NOW and record the count (unverified baseline cited in PO intake as 37/37). Re-run post-landing and verify same or better counts (QA gate).

### FR Requirements

**FR-3 (dev-team wiring at trailer):** `log_tick_usage` fires once per invocation at the trailer (not inside `_emit_verdict()`), capturing the exact string that reaches stdout. Specifically:
- Existing trailer structure (lines ~682-686 or similar):
  ```bash
  if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    run_preflight
    exit $?
  fi
  ```
- New structure:
  ```bash
  if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    tt_capture_and_log "dev-team-tick-preflight.sh" run_preflight
    exit $?
  fi
  ```

### Design Shape (Architect Blueprint)

The change is a mechanical 2-3 line swap in the trailer:

```bash
# OLD (lines ~682-686 or similar)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_preflight
  exit $?
fi

# NEW
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  tt_capture_and_log "dev-team-tick-preflight.sh" run_preflight
  exit $?
fi
```

Plus one new source line near the top (alongside existing `source` statements):
```bash
source "$SCRIPT_DIR/lib/tick-telemetry.sh"
```

Total diff: ~3 lines (1 source + 1 trailer swap + 1 exit). Architect's original "~1 line" framing is now achievable (WU-0 exists; FR-6/FR-7 constraints resolved).

### Exit Code Mapping

Per architect ratification: `exit_code` is captured from the trailer's real `$?`, not a lookup table. Verified mapping (architect read-verified):
- `SKIP|SKIP-WIDENED` → exit 0
- Everything else (`ERROR|RUN-IDLE|RUN`) → exit 1

The logging wrapper preserves this by capturing the real `$?` after `run_preflight()` returns.

### Test Coverage

**Existing tests:** The ~34+ assertions in `dev-team-tick-preflight.test.sh` source the script and call `run_preflight()` directly (never reach the trailer since `BASH_SOURCE[0] != $0` when sourced). These stay green by construction (R4 — `run_preflight()` internals untouched).

**New test cases (additive):**
1. **Logging-specific case:** Call the wrapped trailer via `tt_capture_and_log` directly, verify log file contents
2. **Rotation in-situ:** Over-fill the log, verify rotation works and latest lines remain
3. **AC-6 stdout purity:** Verify dev-team verdict is FIRST and ONLY line on stdout
4. **AC-4/AC-5 fault inject:** Unwritable log destination, verify `tt_capture_and_log` returns caller's real exit code unaffected
5. **Pre-existing leak coverage (R6):** If `_step55_board_hygiene` (rare path) leaks stdout, verify logger outputs `verdict:UNKNOWN` gracefully (defensive, not a regression fix)

### Files to read first

- `docs/handoffs/TASK_TICK-WU-0-TELEMETRY-LIB.md` (WU-0 spec)
- `scripts/agents-flow/dev-team-tick-preflight.sh` (entire file, focus on trailer and _emit_verdict; note the FIX-DEVTEAM-PREFLIGHT-STEP55-COLDEVICT-STDOUT-LEAK-CORRUPTS-VERDICT comment block)
- `scripts/agents-flow/dev-team-tick-preflight.test.sh` (understand existing test seam: PREFLIGHT_ROOT fixture, mcp_call stub)
- `docs/handoffs/TICK-PREFLIGHT-USAGE-INSTRUMENTATION-BA-spec.md` § Verified Paths — dev-team section for confirmed choke point and exit-code mapping

### Files to create

- **NEW `scripts/agents-flow/dev-team-tick-preflight.test.sh` additions** (within existing file)
  - Add logging-specific test cases (5-6 new `OUT=...; assert` blocks)
  - Use existing `PREFLIGHT_ROOT` fixture
  - Verify log file format, rotation, stdout purity, fault injection, R6 defensive handling

### Files to modify

1. **MODIFIED `scripts/agents-flow/dev-team-tick-preflight.sh`**
   - Line ~top: add `source "$SCRIPT_DIR/lib/tick-telemetry.sh"` (after existing source statements)
   - Lines ~682-686 (trailer): replace `run_preflight` with `tt_capture_and_log "dev-team-tick-preflight.sh" run_preflight`
   - Zero other changes (internal `run_preflight()` / `_emit_verdict()` / `return` statements untouched)

2. **MODIFIED `scripts/agents-flow/dev-team-tick-preflight.test.sh`**
   - Add new test cases (follow existing pattern)
   - Use `TICK_TELEMETRY_LOG_PATH` override (passed via environment; cowork's `PREFLIGHT_ROOT` already covers it)
   - Assert log file JSON format, field presence, rotation behavior, exit-code preservation, graceful degradation on pre-existing leaks

### Dependencies

- **Upstream:** TICK-WU-0-TELEMETRY-LIB (must be green first)
- **Downstream:** TICK-WU-3-AUDITOR-WIRING (auditor depends on both WU-0+WU-1+WU-2)

### Knowledge needed

- Understand `tt_capture_and_log` behavior (read WU-0 handoff)
- Existing `PREFLIGHT_ROOT` fixture pattern in dev-team test suite
- jq `-c` compact output format and `// "UNKNOWN"` graceful null/missing handling
- Expected exit-code mapping for dev-team (SKIP/SKIP-WIDENED→0, others→1)
- Note: pre-existing `_step55_board_hygiene` stdout-leak risk (R6) — out of scope to fix (zero-semantic-change constraint), but logging may incidentally surface it as `UNKNOWN` verdicts for QA attention

---

## Risk Notes (Architect's — propagated for dev awareness)

**R1 (correctness-critical):** WU-0's suite must prove stdout purity; this task verifies in-situ. Do not skip fault-injection negatives.

**R3 (byte-identity edge case, low):** Command-substitution drops trailing NULs; not a risk for JSON text output.

**R4 (positive):** Existing dev-team test suite (which sources and calls `run_preflight` directly, never reaching trailer) stays green by construction. New tests additive only.

**R6 (pre-existing, NOT this sprint's regression):** `_step55_run_validate()` / `_step55_git_commit_evict()` remain unredirected (low-frequency, gated behind `_step55_would_evict` detecting actual byte reduction). If they leak stdout, logging's defensive `jq -r '.verdict // "UNKNOWN"' 2>/dev/null` converts it to a `verdict:UNKNOWN, tick:null` row (beneficial incidental discovery, not a fix or regression). Out of scope to fix here (zero-semantic-change constraint).

---

## RETURN (PM)

Handoff complete. Task ready for developer dispatch.

AC: AC-1..AC-11 (inherited from WU-0 baseline + verified in-situ); exit-code mapping verified; R1/R3/R4/R6 acknowledged.

Zone: cross-service/

Depends on: TICK-WU-0-TELEMETRY-LIB (must be green)

Blocks: TICK-WU-3-AUDITOR-WIRING (auditor needs both WU-1 and WU-2 done first)
