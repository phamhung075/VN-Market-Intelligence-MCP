---
sprint: TICK-PREFLIGHT-USAGE-INSTRUMENTATION
branch: task/TICK-WU-0-telemetry-lib
size: M
zone: cross-service/
depends_on: []
blocks: ["TICK-WU-1-COWORK-WIRING", "TICK-WU-2-DEVTEAM-WIRING", "TICK-WU-3-AUDITOR-WIRING"]
---

## TLDR
Implement shared shell utility library `scripts/agents-flow/lib/tick-telemetry.sh` (functions: `tt_epoch_ms`, `log_tick_usage`, `tt_capture_and_log`, `_tt_rotate`, `_tt_log_path`), ship its own regression test suite (`tick-telemetry.test.sh`), add `.gitignore` patterns for `docs/data/telemetry/`, and document the logging convention in `docs/policies/dev-standards.md` CANONICAL block. This is the foundation that unblocks WU-1/WU-2/WU-3 (all depend on WU-0 being green).

## [PM] Planning Context

### Zone
`cross-service/` (scripts/agents-flow/ infrastructure — shared utility, not service-specific)

### Acceptance Criteria (PO AC-1..AC-11 carried forward unrenumbered)

**AC-1:** `log_tick_usage(script, captured_json, elapsed_ms, exit_code)` appends exactly ONE compact JSON line to the configured destination, parsing `verdict` and `tick` directly from the captured JSON (never re-derived).

**AC-2:** `tt_capture_and_log <script_name> <fn> [args...]` wrapper captures fn's output into a variable, reprints it byte-identical to stdout, measures elapsed time, and calls `log_tick_usage` with the real exit code — all test suites for cowork/dev-team/auditor that source-then-call-function directly (never trigger the trailer) remain provably unaffected (R4).

**AC-3:** Zero semantic change to verdict token, JSON field set, exit code, lock claim/release sequence, or MCP call sequence in any of the 4 callers. This is a pure instrumentation add, not a behavioral change (NFR-1, inherited from TOKEN-ECONOMY-TICK-PREFLIGHT).

**AC-4:** Non-blocking append with explicit failure path: unwritable destination (missing parent dir, permission error, disk full) degrades silently — zero effect on caller's stdout, exit code, or return status. All failure paths in `log_tick_usage` end in `return 0`, never propagated to caller. Test negative control: fault-inject an unwritable parent dir, verify `tt_capture_and_log` still returns caller function's real `$rc`.

**AC-5:** Caller's final `exit $?` sees the real exit code from the wrapped function, not from the logging call — logging failure is invisible to exit status (corollary of AC-4). Use `output=$("$fn" "$@"); rc=$?` idiom (command-substitution preserves the real exit status in `$?`). Test: verify logging call failure (mock logger that errors) does not change exit code.

**AC-6 (NFR-3 — stdout purity):** Verdict line stays the FIRST and ONLY thing on stdout. The `tt_capture_and_log` wrapper must NOT leak any logging output to real stdout — logging goes to file only. Test with a fault-injected `log_tick_usage` that attempts to write to stdout; prove the guard catches this class and verdict still reaches the terminal uncontaminated (R1).

**AC-7 (NFR-2 — zero new tool calls on silent/skip path):** Logging call is a pure local file append (`O_APPEND`, single `write()` syscall). Zero new MCP/git/network I/O; zero new subprocess forks beyond the jq-line-format + append itself needs. Bash `EPOCHREALTIME` (sub-second) or fallback `date +%s` (second-precision) — NO python3, NO `date %N/%3N` (enforces the BSD-date-`%N`-landmine constraint).

**AC-8 (FR-8 — rotation):** Log file size-capped at `TICK_TELEMETRY_MAX_LINES` (default 5000; overridable for tests). Rotation uses atomic tmp+mv (no in-place truncate): `tail -n "$CAP" "$logpath" > "$logpath.tmp.$$" && mv -f "$logpath.tmp.$$" "$logpath"`. Explicitly state: an append racing a rotation swap targets the old file and is lost — accepted tradeoff (one-file-per-script + script's own SF-1 lock already substantially serializes concurrent writes; FR-9 constraint is O_APPEND single-line, satisfied).

**AC-9 (FR-9):** Single `O_APPEND` write of one line via `printf '%s\n' <json> >> "$logpath"` — never read-modify-write, never double-write, never acquire `flock` (matches this repo's existing no-`flock`-anywhere convention; `scripts/db-integrity-history-append.sh` read-modify-write explicitly rejected in architect ratification as wrong for this cadence). Concurrent appenders (cowork 15min, dev-team 7/37min, auditor 30/60min, possibly different sessions) never corrupt each other's lines.

**AC-10 (QA requirement — UNVERIFIED baseline):** Pre-sprint baseline for ALL 3 existing test suites MUST be established before any WU-1/WU-2/WU-3 edit touches production scripts. Run `bash scripts/agents-flow/cowork-tick-preflight.test.sh`, `bash scripts/agents-flow/dev-team-tick-preflight.test.sh`, `bash scripts/agents-flow/auditor-tier1-probe.test.sh` now and document the REAL counts (not the PO intake brief's unverified 20/20, 37/37, 32/32 claims). QA will re-run post-WU-1/2/3 and verify same or better counts.

**AC-11 (documenting cost bounds):** `verdict_bytes` field is a LOWER BOUND on true per-tick cost (excludes the cron prompt text + flow-doc lines the LLM loads that tick, measures only the tool_result). CANONICAL block in `docs/policies/dev-standards.md` must state this explicitly, matching the architecture-brief's own treatment in `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md` §W-1 (4 chars/token ratio, reuse, do not invent).

### FR Requirements (Architect's ratified blueprint)

**FR-1 (shared lib):** `scripts/agents-flow/lib/tick-telemetry.sh` — functions `tt_epoch_ms()`, `_tt_log_path()` (internal), `log_tick_usage(script, captured_json, elapsed_ms, exit_code)`, `tt_capture_and_log(script_name, fn, [args...])`, `_tt_rotate()` (internal). Bash 3.2+ syntax only (no bash4+ features — matches `notebook-section-direction.sh` constraint). Sourced by WU-1/2/3, never executed standalone.

**FR-5 (field set, exact):** Per invocation: `ts` (real wallclock, `date -u +%Y-%m-%dT%H:%M:%SZ`, never hand-typed — blocks `feedback_hand_typed_iso_timestamps_drift_into_the_future`), `script`, `verdict`, `tick` (where present), `verdict_bytes` (byte length via `wc -c`, true UTF-8 safe count), `elapsed_ms`, `exit_code`. NOTHING else (no session_id per scope_out §0(f), no computed token/cost per scope_out §0(c), no precision flag for `elapsed_ms` per architect ratification §Q5).

**FR-6 (elapsed_ms with graceful degrade):** `tt_epoch_ms()` checks `EPOCHREALTIME` (bash 5+, sub-second); if unset, falls back to `date -u +%s * 1000` (second-precision, rounds down). Both branches work under bash 3.2 (plain POSIX parameter expansion + arithmetic). Resolution caveat documented in shared lib header comment + CANONICAL block in dev-standards.md (same treatment AC-11 mandates for `verdict_bytes`).

**FR-7 (exit_code from trailer's real `$?`):** No lookup table, no per-`return`-site edits — capture happens at the TRAILER where `exit $?` already sits, with real `$?` available zero-derivation. WU-1/2/3 inherit this for free (one design resolves Q3+Q4).

**FR-8 (rotation via tmp+mv, atomic):** Mirrored from existing `_write_heartbeat()` pattern in auditor-tier1-probe.sh and `_widen_write_counter()` in dev-team-tick-preflight.sh. Single `tail -n` read, `tmp+mv` swap.

**FR-9 (O_APPEND single-line, no read-modify-write):** Confirmed pattern (not inherited from `db-integrity-history-append.sh` which is read-modify-write — explicitly rejected by architect).

**FR-10 (non-goal explicit):** code-janitor-tick-preflight.sh, db-integrity-probe.sh, orch-sentinel-lite-probe.sh are OUT of scope this sprint — record as designated follow-up after WU-0 proves itself on live cron. Bouncing any future scope creep to PO.

### NFRs (Architect's ratified, carried from PO)

**NFR-1 (zero semantic change):** Verdict token, JSON field set, exit code, lock claim/release, MCP calls — byte-identical before/after. Carries R2/R3/R4/R7/R8 risk notes from TOKEN-ECONOMY-TICK-PREFLIGHT.

**NFR-2 (zero new tool-call cost on silent/skip path):** Logging is pure local file append; zero MCP/git/network I/O; zero subprocess forks beyond jq-line-format + append. This is the ENTIRE point of the sprint (sequence dev tasks so this constraint can't be quietly dropped under time pressure).

**NFR-3 (stdout purity):** Verdict line stays FIRST and ONLY stdout. Test with fault-injected logger proving the guard.

**NFR-4 (test-seam reuse):** Extend the existing `PREFLIGHT_ROOT` fixture-isolation pattern (cowork/dev-team test suites) and the existing `HEARTBEAT_FILE` parent-dir-missing fault-injection precedent (auditor suite) for the new log-path override — do not invent a second isolation mechanism.

**NFR-5 (gitignore discipline):** Pattern added in the SAME change as the lib ship, mirroring `docs/data/cycle-snapshot-*.json` triple-pattern block.

### Risk Notes (Architect's numbered risks — pm: propagate into this task's AC; dev: read before writing code)

**R1 (WU-0, correctness-critical):** Fault-inject `log_tick_usage` to prove AC-6 stdout purity holds through the wrapper — the existing `feedback_tick_preflight_verdict_is_first_json_key_tail_always_drops_it` memory exists because "should be fine" claims about this stdout contract have been wrong before. NOT an assumption.

**R2 (WU-0/Q6, correctness):** auditor's test suite has NO seam to override `REPO_ROOT` (only derived `*_PATH` vars). Any new auditor logging test MUST set `TICK_TELEMETRY_LOG_PATH` explicitly. Noted here; explicitly flagged in WU-3's task AC so dev doesn't assume parity with WU-1/WU-2.

**R3 (WU-1/WU-2, byte-identity edge case, low):** Command-substitution drops trailing NUL bytes; not a realistic risk for JSON text output, noted for completeness.

**R4 (WU-3, positive):** Because `run_probe()`/`run_tiered_probe()` internals untouched, the 1323-line `auditor-tier1-probe.test.sh` suite stays green — zero changes needed. New WU-3 logging tests additive only.

**R5 (WU-3, scope-narrowing):** Invalid-`--tier` branch not logged (cron-misconfiguration path, never expected in production); deliberately left unwrapped. Flagged explicitly rather than silently dropped.

**R6 (dev-team, pre-existing):** `_step55_run_validate()` / `_step55_git_commit_evict()` remain unredirected — a REAL but rare stdout-leak path independent of this sprint. If incidentally surfaced as `verdict:UNKNOWN` rows, that's a beneficial side effect not a regression. Out of scope to fix (zero-semantic-change constraint).

### Files to read first

1. **Architect blueprint (Q1-Q6 ratification + design decisions + risk notes):** `docs/handoffs/TICK-PREFLIGHT-USAGE-INSTRUMENTATION-BA-spec.md` § [Architect] (lines ~131-532)
2. **PO/BA decision journals:** `docs/agent-memory/decisions/sprint-TICK-PREFLIGHT-USAGE-INSTRUMENTATION-po.md` and `sprint-TICK-PREFLIGHT-USAGE-INSTRUMENTATION-ba.md`
3. **Existing shared lib extraction precedents:** `scripts/agents-flow/lib/hook-guard.sh`, `scripts/agents-flow/lib/notebook-section-direction.sh` (style/syntax/bash-3.2-compat discipline)
4. **Existing test seam patterns:** `scripts/agents-flow/cowork-tick-preflight.test.sh` (PREFLIGHT_ROOT fixture), `scripts/agents-flow/auditor-tier1-probe.test.sh` (HEARTBEAT_FILE parent-dir-missing fault-injection)
5. **Rolling history precedent (for rotation idiom):** `scripts/db-integrity-history-append.sh` (explicitly NOT reused as-is; read-modify-write rejected; single O_APPEND adopted instead)
6. **Token ratio (for AC-11 documentation):** `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md` § W-1 (4 chars/token)

### Files to create

1. **NEW `scripts/agents-flow/lib/tick-telemetry.sh`** — shared utility library
   - Functions: `tt_epoch_ms()`, `log_tick_usage()`, `tt_capture_and_log()`, `_tt_rotate()`, `_tt_log_path()`
   - Bash 3.2+ syntax only (no mapfile, no associative arrays, no `local -r`, `set -u` discipline)
   - Architecture per architect ratification: `tt_capture_and_log` is the convenience layer; `log_tick_usage` is the lower-level primitive (two-tier lib style, mirrors `hg_run` + `hg_resolve_project_root`)

2. **NEW `scripts/agents-flow/lib/tick-telemetry.test.sh`** — regression suite
   - Must be green BEFORE WU-1 starts (PO's WU-0-gates-the-rest ordering)
   - Minimum cases per architect blueprint:
     - One-line-per-call (rotation, verdict derivation, tick derivation)
     - `verdict`/`tick` extracted correctly from both field shapes (cowork/dev-team vs auditor tier-2/3)
     - `verdict_bytes` == real byte count (multi-byte-safe via `wc -c`)
     - `elapsed_ms` present and numeric on both EPOCHREALTIME-available and EPOCHREALTIME-unset paths (force via `unset EPOCHREALTIME` + stubbed value)
     - Rotation fires at cap and preserves newest N lines
     - AC-4 negative control: logger failure never changes `tt_capture_and_log`'s returned `$rc`
     - AC-5 negative control: unwritable parent dir → silent no-op, `tt_capture_and_log` still returns wrapped function's real `$rc`
     - AC-6/R1 negative control (critical): fault-injected logger that writes to real stdout — prove wrapper guards against this class, verdict reaches caller untouched

### Files to modify

1. **MODIFIED `.gitignore`**
   - Add line: `docs/data/telemetry/*.jsonl`
   - Add line: `docs/data/telemetry/*.jsonl.tmp.*`
   - Same convention as existing `docs/data/cycle-snapshot-*.json` triple-pattern block (lines ~33-35)
   - In the SAME change (NFR-5) — no separate commit

2. **MODIFIED `docs/policies/dev-standards.md`**
   - New CANONICAL block for `tick-telemetry.sh` (mirrors the existing `hook-guard.sh` CANONICAL block pattern)
   - Content: pointer to lib file + one-line usage summary + AC-11 resolution-limitation caveat for `elapsed_ms` (second-precision on bash < 5.0)
   - No code changes to existing sections

### Dependencies

- **Upstream:** None (WU-0 is the unblocking foundation)
- **Downstream:** WU-1 (cowork), WU-2 (dev-team), WU-3 (auditor) all depend_on WU-0

### Knowledge needed

- `docs/policies/dev-standards.md` (existing CANONICAL convention pattern)
- `docs/policies/commit-convention.md` (commit message format)
- Bash 3.2 portability (no bash4+ features)
- `O_APPEND` semantics + atomic tmp+mv swap idiom
- `wc -c` for multi-byte-safe byte counting
- `date -u +%Y-%m-%dT%H:%M:%SZ` and `date -u +%s` (BSD/GNU portability per architect ratification)
- jq `-r` flag for extracting string values from JSON + graceful null/missing field handling with `// "UNKNOWN"`

---

## Implementation Notes

### Design Shape (from Architect Blueprint)

The library exports these functions:

```bash
tt_epoch_ms()
# Returns: milliseconds since epoch (EPOCHREALTIME if bash5+, else date +%s * 1000)

log_tick_usage(script, captured_json, elapsed_ms, exit_code)
# Parses verdict/tick from captured_json via jq
# Computes verdict_bytes via wc -c
# Appends one JSON line to log destination (O_APPEND)
# All failures: return 0 (silent, never propagated)

tt_capture_and_log(script_name, fn, [args...])
# t0=$(tt_epoch_ms)
# out=$("$fn" "$@"); rc=$?
# t1=$(tt_epoch_ms); elapsed=$((t1 - t0))
# printf '%s\n' "$out"  [reprints byte-identical]
# log_tick_usage "$script_name" "$out" "$elapsed" "$rc"
# return "$rc"

_tt_log_path()  [internal]
# Checks TICK_TELEMETRY_LOG_PATH, PREFLIGHT_ROOT, REPO_ROOT, git-toplevel fallback
# Returns path: $root/docs/data/telemetry/$script.jsonl

_tt_rotate()  [internal]
# Reads line count; if > TICK_TELEMETRY_MAX_LINES, tail+mv swap
```

### Testing Strategy

1. **Unit tests for each function** (call directly from test suite)
2. **Integration test:** call `tt_capture_and_log` with a stubbed function, verify log file format and caller's exit code
3. **Rotation test:** set `TICK_TELEMETRY_MAX_LINES=10`, append 15 lines, verify only newest 10 remain
4. **Fault injection (R1/AC-6):** mock `log_tick_usage` to output to stdout, call `tt_capture_and_log`, verify verdict is FIRST line and logger's output does not leak
5. **Fault injection (AC-4/AC-5):** set `TICK_TELEMETRY_LOG_PATH` to unwritable path, verify `tt_capture_and_log` returns caller's real `$rc` unaffected
6. **EPOCHREALTIME path:** verify logic with both `EPOCHREALTIME` set and unset (force via `unset` in test)

### Q1 Ratification (Log Destination)

Per architect: `docs/data/telemetry/` git-ignored directory, ONE file per script (not one shared file). This WU-0 ships the lib; WU-1/2/3 each target their own file:
- `docs/data/telemetry/cowork-tick-preflight.jsonl`
- `docs/data/telemetry/dev-team-tick-preflight.jsonl`
- `docs/data/telemetry/auditor-tier1-probe.jsonl`

### Q6 Ratification (Root Variable Naming Divergence)

`_tt_log_path()` resolves roots in order:
1. `TICK_TELEMETRY_LOG_PATH` (new, explicit override — required for auditor testing per R2)
2. `PREFLIGHT_ROOT` (cowork/dev-team)
3. `REPO_ROOT` (auditor)
4. Git-toplevel fallback (belt-and-suspenders, `cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd`)

Zero edits to any existing root-resolution line in cowork/dev-team/auditor scripts (they keep their existing `PREFLIGHT_ROOT`/`REPO_ROOT` logic). WU-0 lib handles the naming divergence internally.

---

## RETURN (PM)

Handoff complete. Task ready for developer dispatch.

AC: 11 acceptance criteria from PO (AC-1..AC-11) + 6 architect risk notes (R1-R6) propagated; all non-negotiable constraints captured above.

Zone: cross-service/

Blocks: WU-1, WU-2, WU-3 (they all depend_on this task being green)
