---
sprint: TICK-PREFLIGHT-USAGE-INSTRUMENTATION
branch: task/TICK-WU-3-auditor-wiring
size: L
zone: cross-service/
depends_on: ["TICK-WU-0-TELEMETRY-LIB", "TICK-WU-1-COWORK-WIRING", "TICK-WU-2-DEVTEAM-WIRING"]
blocks: []
---

## TLDR
Wire `scripts/agents-flow/auditor-tier1-probe.sh` via an extracted choke point in its pre-existing "Standalone execution" trailer `case` statement to correctly discriminate the Tier-1-standalone-stdout context from the Tier-2/3-wrapper-stdout context. This is NOT a mechanical port of WU-1/WU-2 — the 925-line script has a real architectural challenge (double-log risk if naive) that requires its own design review. Changes: source the new lib, wrap the case statement branches (3-4 line diff in the trailer), add logging-specific test cases that PROVE the double-log corruption does not occur.

## [PM] Planning Context

### Zone
`cross-service/` (scripts/agents-flow/ infrastructure — same zone as WU-0/WU-1/WU-2)

### Acceptance Criteria (PO AC-1..AC-11 carried forward; inherited from WU-0 baseline)

**AC-1..AC-11:** Same as WU-0 (inherited). This task verifies AC compliance *in situ* on the auditor, with SPECIAL EMPHASIS on AC-3 (zero semantic change to verdict token / JSON field set / exit code) because auditor's Tier-1 and Tier-2/3 emit DIFFERENT field vocabularies.

**AC-3 (CRITICAL for WU-3):** Zero semantic change. This is the single most important AC for auditor:
- **Tier-1 standalone (`run_probe()` output):** `{verdict: ALL_GREEN|FAILURE, tick, detail, ...}` (fields per line ~764-772)
- **Tier-2/3 wrapper (`run_tiered_probe()` output):** `{tier, checks_verdict, verdict: SKIP-SPAWN|SPAWN, detail, last_healthy_at, fresh_threshold_minutes, heartbeat_age_minutes}` (fields per line ~894-896)
- Both verdict vocabularies are completely different (`ALL_GREEN|FAILURE` vs `SKIP-SPAWN|SPAWN`), yet both must reach stdout BYTE-IDENTICAL before/after logging is added. The log file will contain BOTH verdict types (Tier-1 on Monday-Friday, Tier-2/3 on weekend when `run_tiered_probe` is invoked), and `verdict` field is sufficient to distinguish them (architect confirmed — no dedicated `tier` field needed in logs per FR-5).

**AC-6 (CRITICAL — stdout purity + double-log prevention):** This is where the "own design review" distinction from WU-1/WU-2 becomes essential. The double-log risk (§1 finding 3 in architect spec) is:
- `run_probe()` has 3 internal `jq -n` sites (lines ~754, ~767, ~772)
- `run_tiered_probe()` has 3 more (lines ~858, ~894, ~921)
- A naive hook-at-every-site would log intermediate verdicts (the 2 captured-into-variable sites within `run_probe()` called by `run_tiered_probe()`) that never reach real stdout, PLUS miss the outer `run_tiered_probe()` final verdict that IS the real stdout — silently corrupting the telemetry dataset.
- **Architect's solution:** wrap only at the trailer's CASE DISCRIMINATOR, where the Tier-1-standalone and Tier-2/3-wrapper paths are already structurally distinct. Each real invocation fires exactly ONE `tt_capture_and_log` call (either the Tier-1 branch or one of the Tier-2/3 branches), never both, never the inner `run_probe()` calls that get captured into variables.

**AC-7 (zero tool calls):** Auditor's MCP calls happen inside `_check_docker_ps()` / health checks (all results captured via `out=$(...)`). The logging wrapper is added AFTER `run_probe()`/`run_tiered_probe()` returns — zero new tool calls on the silent/skip path.

**AC-10 (pre-sprint baseline — CRITICAL QA gate):** Before editing this script, run `bash scripts/agents-flow/auditor-tier1-probe.test.sh` NOW and record the count (unverified baseline cited in PO intake as 32/32). Re-run post-landing and verify same or better counts. QA must explicitly verify the double-log negative (see below).

### FR Requirements

**FR-4 (auditor via extracted choke point, NOT per-call-site hook):** This is the core of WU-3's distinction. Architect blueprint specifies exact shape:

Existing trailer (lines ~900-925 or similar):
```bash
if [[ "$TIER" == "" ]]; then
  TIER=$(command-substitution-to-get-tier-from-cron)
fi

case "$TIER" in
  1) run_probe; exit $? ;;
  2|3) run_tiered_probe "$TIER"; exit $? ;;
  *) jq -n --arg d "..." '{...}'; exit 2 ;;
esac
```

New structure:
```bash
if [[ "$TIER" == "" ]]; then
  TIER=$(command-substitution-to-get-tier-from-cron)
fi

case "$TIER" in
  1) tt_capture_and_log "auditor-tier1-probe.sh" run_probe; exit $? ;;
  2|3) tt_capture_and_log "auditor-tier1-probe.sh" run_tiered_probe "$TIER"; exit $? ;;
  *) jq -n --arg d "..." '{...}'; exit 2 ;;
esac
```

**Key points:**
- Tier-1 branch wraps `run_probe` (no args)
- Tier-2/3 branch wraps `run_tiered_probe "$TIER"` (with tier arg)
- Invalid-`--tier` branch DELIBERATELY NOT wrapped (R5 — never occurs in production, cron-misconfiguration class)
- Zero touches inside `run_probe()` / `run_tiered_probe()` / `_emit_verdict()` / any `return` site

### Design Shape (Architect Blueprint)

The change is a case-statement wrapper in the trailer (3-4 line diff):

```bash
# Tier-1 only: wrap run_probe
1) tt_capture_and_log "auditor-tier1-probe.sh" run_probe; exit $? ;;

# Tier-2/3 only: wrap run_tiered_probe with tier arg
2|3) tt_capture_and_log "auditor-tier1-probe.sh" run_tiered_probe "$TIER"; exit $? ;;

# Invalid tier: UNCHANGED (not wrapped per R5)
*) jq -n --arg d "..." '{...}'; exit 2 ;;
```

Plus one new source line near the top:
```bash
source "$SCRIPT_DIR/lib/tick-telemetry.sh"
```

Total diff: ~3-4 lines (1 source + 2 case branches + 1 exit). WU-1/WU-2 are ~2-3 lines; WU-3 has the case-branch complexity built-in (not a regression vs single-trailer style).

### Exit Code Mapping

Per architect ratification: `exit_code` is captured from the real `$?` after each branch's function returns. Verified mapping (architect read-verified):
- Tier-1: `ALL_GREEN` → 0, `FAILURE` → 1
- Tier-2/3: `SKIP-SPAWN` → 0, `SPAWN` → 1
- Invalid tier: exit 2 (not logged per R5)

### Double-Log Risk (The Core Design Challenge)

This is WHY WU-3 gets its own design review vs copy-paste from WU-1/WU-2.

**The problem:** `run_probe()` is called in two contexts:
1. **Tier-1 standalone:** directly by the trailer, its output goes to real stdout, must be logged
2. **Tier-2/3 wrapper:** invoked by `run_tiered_probe()` as `inner_out=$(run_probe "suppress_heartbeat")` (line ~873), its output is CAPTURED INTO A VARIABLE and never reaches real stdout, must NOT be logged

If a hook is placed inside `run_probe()` (or at every `jq -n` site within it), the Tier-2/3 invocation would be incorrectly logged as a real stdout event (corrupting the dataset), AND the actual Tier-2/3 outer verdict (from `run_tiered_probe()` line ~894-896) would be missed.

**The architect's solution:** wrap at the TRAILER's case statement, not inside the functions. The case statement is the exact point where:
- Tier-1 calls `run_probe()` and its output goes directly to real stdout → logged
- Tier-2/3 calls `run_tiered_probe()` and its output goes directly to real stdout → logged
- The inner `run_probe()` call within `run_tiered_probe()` (line ~873) stays a captured-into-variable call → NOT logged

### Test Coverage (CRITICAL — this is the proof the double-log fix is real)

**Existing tests:** The 1323-line `auditor-tier1-probe.test.sh` suite sources the script and calls `run_probe()` / `run_tiered_probe()` directly (never reaches the trailer). These stay green by construction (R4 — internals untouched).

**New test cases (additive, WITH EXPLICIT DOUBLE-LOG NEGATIVE CONTROL):**
1. **Tier-1 standalone logging:** Call via trailer's Tier-1 branch (either directly or via a mock dispatch), verify exactly ONE log line is written (the `run_probe()` output)
2. **Tier-2/3 wrapper logging:** Call via trailer's Tier-2/3 branch, verify exactly ONE log line is written (the `run_tiered_probe()` output, NOT the inner `run_probe()` call)
3. **Double-log negative (R1/R4 — ESSENTIAL):** Directly call `run_tiered_probe()` (which internally calls `run_probe()`) and instrument the log file — verify:
   - ZERO log lines from the inner `run_probe()` call (because `tt_capture_and_log` is NOT wrapping it)
   - EXACTLY ONE log line from the outer `run_tiered_probe()` call (the real output)
   - Log line has the Tier-2/3 verdict vocabulary (`SKIP-SPAWN` or `SPAWN`), not Tier-1 (`ALL_GREEN`/`FAILURE`)
   - **This negative assertion is THE proof the double-log corruption class PO/BA flagged does NOT occur**

4. **Rotation in-situ:** Over-fill the log, verify rotation works
5. **AC-6 stdout purity:** Verify verdicts are FIRST/ONLY on stdout (both Tier-1 and Tier-2/3 independently)
6. **AC-4/AC-5 fault inject:** Unwritable log path, verify `tt_capture_and_log` returns caller's real exit code
7. **R2 (log path override):** Set `TICK_TELEMETRY_LOG_PATH` explicitly (auditor has no `PREFLIGHT_ROOT` override seam), verify logging writes to the override path, not the computed default

### Files to read first

- `docs/handoffs/TASK_TICK-WU-0-TELEMETRY-LIB.md` (WU-0 spec)
- `docs/handoffs/TICK-PREFLIGHT-USAGE-INSTRUMENTATION-BA-spec.md` § [Architect] "WU-3's double-log risk is sharper..." (entire section, lines ~28-29, and Q3 ratification lines ~164-172, and the Design Decisions section lines ~308-354)
- `scripts/agents-flow/auditor-tier1-probe.sh` (entire 925-line file; focus on):
  - Trailer case statement (lines ~900-925)
  - `run_probe()` definition + the 3 internal `jq -n` sites (lines ~704-774, especially the `suppress_heartbeat` guard at line ~752 that makes the heartbeat-FAILED site Tier-1-standalone-only)
  - `run_tiered_probe()` definition + its call to `run_probe()` as a captured variable (line ~873) and its own 3 `jq -n` sites (lines ~850-898)
- `scripts/agents-flow/auditor-tier1-probe.test.sh` (1323 lines; understand existing test seam: NO `PREFLIGHT_ROOT` override, only derived `*_PATH` vars, so `TICK_TELEMETRY_LOG_PATH` override must be used for new tests per R2)
- `docs/handoffs/TICK-PREFLIGHT-USAGE-INSTRUMENTATION-BA-spec.md` § Verified Paths — auditor section for confirmed choke point and the structural unreachability proof

### Files to create

- **NEW `scripts/agents-flow/auditor-tier1-probe.test.sh` additions** (within existing file)
  - Add logging-specific test cases (7-8 new blocks)
  - **MANDATORY negative control:** Directly test Tier-2/3 invocation of `run_tiered_probe()` (which internally calls `run_probe()`), instrument the log file, PROVE that only ONE log line is written (the outer one) and ZERO from the inner call
  - Use `TICK_TELEMETRY_LOG_PATH` override (NOT `PREFLIGHT_ROOT` — auditor's test suite has no `PREFLIGHT_ROOT` seam per R2)
  - Assert Tier-1 and Tier-2/3 produce correct verdict vocabulary

### Files to modify

1. **MODIFIED `scripts/agents-flow/auditor-tier1-probe.sh`**
   - Line ~top: add `source "$SCRIPT_DIR/lib/tick-telemetry.sh"` (after existing source statements)
   - Lines ~900-925 (trailer case statement): wrap the Tier-1 and Tier-2/3 branches with `tt_capture_and_log` (3-4 line diff)
   - ZERO changes inside `run_probe()` / `run_tiered_probe()` / `_emit_verdict()` / any `return` / any `jq -n` site (1323-line existing suite must stay unaffected)
   - Invalid-`--tier` branch deliberately left unwrapped (R5)

2. **MODIFIED `scripts/agents-flow/auditor-tier1-probe.test.sh`**
   - Add new test cases (7-8 new blocks)
   - Use `TICK_TELEMETRY_LOG_PATH` override exclusively (R2)
   - Assert Tier-1 standalone produces one log line with Tier-1 verdict
   - Assert Tier-2/3 wrapper produces one log line with Tier-2/3 verdict
   - **ASSERT Tier-2/3 invocation of `run_tiered_probe()` produces ZERO inner-`run_probe()` logs + ONE outer log** (double-log negative)
   - Assert rotation, purity, fault-injection on this script specifically

### Dependencies

- **Upstream:** TICK-WU-0-TELEMETRY-LIB (WU-0 must be green), TICK-WU-1-COWORK-WIRING, TICK-WU-2-DEVTEAM-WIRING (architect's gating: auditor depends on 0+1+2 all complete because it's the final integration point and carries the most risk)
- **Downstream:** None (no tasks depend on WU-3)

### Knowledge needed

- Understand `tt_capture_and_log` behavior (read WU-0 handoff)
- Auditor's tier-1-vs-tier-2/3 architecture and why `run_probe()` is called in two contexts
- The `suppress_heartbeat` guard and why it makes one of `run_probe()`'s 3 internal sites unreachable under Tier-2/3
- bash parameter substitution for `TIER` arg passing
- Double-log corruption evidence (PO's Finding 3 in BA spec, architect Q3 ratification) and the structural proof that the trailer case-statement fix prevents it
- `TICK_TELEMETRY_LOG_PATH` override (R2 — critical for testing)

---

## Risk Notes (Architect's — propagated for dev awareness)

**R1 (WU-0+WU-3, correctness-critical):** Fault-inject logger to prove AC-6 stdout purity and the DOUBLE-LOG negative — the existing `feedback_tick_preflight_verdict_is_first_json_key_tail_always_drops_it` memory and PO's `product_decision` warning about WU-3 both exist because "should be fine" claims have been wrong before. The new test case that instruments the log file and asserts ZERO inner-`run_probe()` logs when `run_tiered_probe()` is called IS THE SINGLE MOST IMPORTANT ASSERTION IN THE ENTIRE SPRINT.

**R2 (WU-3, correctness):** auditor's test suite has NO `PREFLIGHT_ROOT` override seam (only derived `*_PATH` vars). Any new auditor logging test MUST set `TICK_TELEMETRY_LOG_PATH` explicitly — the convenience that "just works" for cowork/dev-team (via their existing `PREFLIGHT_ROOT` fixture setup) does NOT extend to auditor. Failing to set this override will leak test logging into the REAL `docs/data/telemetry/auditor-tier1-probe.jsonl` during `bash auditor-tier1-probe.test.sh` runs.

**R4 (WU-3, positive):** Because `run_probe()`/`run_tiered_probe()` internals are completely untouched (no `jq -n` sites touched, no internal verdict paths modified), the entire 1323-line `auditor-tier1-probe.test.sh` suite — which calls these functions directly after sourcing — needs ZERO changes to stay green. New logging tests are additive only. This is the proof that the trailer-only wrapper design is correct.

**R5 (WU-3, scope-narrowing):** The trailer's invalid-`--tier` branch (exit 2 case) is NOT wrapped in `tt_capture_and_log` — it is a cron-misconfiguration path (never occurs in correctly-configured production) and adding logging for a structurally-impossible case adds a 4th call site for zero value. Left un-instrumented per scope-narrowing; flagged explicitly.

---

## RETURN (PM)

Handoff complete. Task ready for developer dispatch — with explicit warning that this is a high-risk, own-design-review task distinct from the mechanical WU-1/WU-2 ports.

AC: AC-1..AC-11 (inherited from WU-0 baseline + verified in-situ, with SPECIAL EMPHASIS on AC-3 verdicts and AC-6 double-log prevention); tier-1 and tier-2/3 exit-code mappings verified; R1/R2/R4/R5 acknowledged.

Zone: cross-service/

Depends on: TICK-WU-0-TELEMETRY-LIB (must be green), TICK-WU-1-COWORK-WIRING (must be green), TICK-WU-2-DEVTEAM-WIRING (must be green) — architect gate (all three prerequisites must be complete before WU-3 dispatch).

Blocks: None (WU-3 is the final integration point).

---

## [Developer] Implementation Record

- **Files modified:**
  - `scripts/agents-flow/auditor-tier1-probe.sh` — added `source "$SCRIPT_DIR/lib/tick-telemetry.sh"` (right after `SCRIPT_DIR`/`REPO_ROOT` resolve, before `SYSTEM_MAP`). Trailer's TWO branches independently wrapped: `1) tt_capture_and_log "auditor-tier1-probe.sh" run_probe; exit $?` and `2|3) tt_capture_and_log "auditor-tier1-probe.sh" run_tiered_probe "$TIER"; exit $?` (+ header comment explaining the double-log-avoidance design). Invalid-tier branch (exit 2) deliberately left unwrapped per R5. Zero other lines touched — `run_probe()`/`run_tiered_probe()`/`_emit_verdict()`/all `return`/all `jq -n` verdict sites byte-identical.
  - `scripts/agents-flow/auditor-tier1-probe.test.sh` — 7 new test blocks appended (T-LOG..T-LOG7, 33 assertions): Tier-1 ALL_GREEN logging field-shape + session-id-absence check, Tier-1 FAILURE exit-code preservation, Tier-2/3 wrapped-call exactly-one-line + correct-vocabulary check, **CRITICAL double-log negative control** (bare unwrapped calls to both `run_probe("suppress_heartbeat")` and `run_tiered_probe()` write ZERO log lines — proves logging only ever happens via the explicit trailer-level wrap, never as a side effect of the functions themselves), rotation-in-situ, AC-6 stdout purity + AC-2/AC-3 byte-identity (both tiers, via a FAILURE-path stub to avoid a live-timestamp clock-boundary flake that the ALL_GREEN path would have introduced — see decision journal S10), AC-4/AC-5 unwritable-log-destination fault injection (both tiers).
- **Tests written:** `scripts/agents-flow/auditor-tier1-probe.test.sh` — 33 new assertions, all GREEN.
- **Git commits:** (pending — see closeout)
- **tsc status:** N/A — pure bash/jq, no `apps/` TypeScript touched (cross-service/ zone, same as WU-0/1/2).
- **Full suite:** `auditor-tier1-probe.test.sh` 214/214 (AC-10 pre-edit baseline 181/181 re-confirmed, matches WU-0's own recorded number exactly; R4 confirmed unaffected post-edit before any new test was added; +33 new). Sprint-wide cross-check: `tick-telemetry.test.sh` 53/53, `cowork-tick-preflight.test.sh` 58/58, `dev-team-tick-preflight.test.sh` 146/146 — all unaffected. `shellcheck -S warning` clean on both touched files (2 self-caught `SC2034` unused-var warnings fixed by turning captured exit codes into genuine assertions).
- **Docs updated:** NONE — this task's own handoff is the only doc impacted; `docs/policies/dev-standards.md`'s WU-0 CANONICAL block is shared-lib-owned (WU-1/WU-2 precedent: not touched by a wiring task's own domain change). Its "WU-1/2/3 wiring... tracked separately" line is now stale (all 3 wired) — flagged for PM/QA at sprint closeout, not fixed here.
- **Graphify:** skipped (no docs impacted).
- **Simplicity gate:** PASS — Q1 scope clean (exact 2-branch, ~6-line production diff matching the architect's own blueprint, no extra flags/knobs), Q2 no single-use abstractions (reused WU-0's `tt_capture_and_log` verbatim, zero new library code), Q3 senior-test clean, Q4 ratio <50% overhead (nearly all added lines are the explicitly-requested, CRITICAL-labeled new test coverage, including the mandatory double-log negative control).
