# Task Report: FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT

date: 2026-08-13
outcome: APPROVED (Direct-Commit Verify)
mode: verify-committed — row `branch: null`, work already on `main`, no merge/branch step required

## Summary

Verified dev-mcp-server's fix to `getSlaThreshold("bctc")` — the bctc SLA threshold
previously returned `now - T_anchor` for a fixed past anchor timestamp (an AGE, not a
duration), which grows 1:1 with wall-clock time at the same rate as `ageMinutes`
(`now - T_data`), making their difference a time-invariant constant (mechanically
proven at 5439min across 12 production samples) — a breach could never self-clear.
The fix replaces this with two FIXED, config-sourced constants gated only by a
boolean (`isBctcEarningsWindowActive(now)`): 1440min (24h) during an earnings-filing
window, 10080min (168h/7d) otherwise, sourced from `system-map.json`'s pre-existing
but previously-unwired SSOT values.

Commits verified: `78f945fb2` (code+tests), `abd890ef1` (notebook+journal). Both
confirmed ancestors of `main`; `git show --stat` matches every claimed file.

## Independent Verification (RAW, not review_note-trusted)

- **AC-1** (root cause read at source): confirmed — `freshnessSlaChecker.ts:636-640`
  branches only on the `isBctcEarningsWindowActive` boolean, zero `minutesSinceX(now)`
  age term remains in the bctc branch.
- **AC-2** (fixed across emissions): confirmed in the new dedicated test file,
  read line-by-line — 3 emissions >1h apart, both regimes, byte-identical threshold.
- **AC-3** (bidirectional proof): confirmed — gate CLEARS on fresh data, FIRES on
  stale data, in both regimes, plus an explicit breach→recovery test.
- **AC-4** (regression pin): confirmed — `DEFAULT_SLA_CONFIG` bctc entry hardcoded
  to `{defaultThresholdMinutes:10080, earningsWindowThresholdMinutes:1440}`; legacy
  `marketHoursThresholdMinutes`/`offHoursThresholdMinutes` fields grep-confirmed
  removed from `SignalSlaConfig` (only surviving reference is the new test's own
  `toBeUndefined()` guard).
- **AC-5** (configured duration stated): confirmed — pulled
  `docs/data/system-map.json` `.project.data_sources["bctc-discover"].sla` directly
  and diffed against the code: `default_stale_threshold_hours:168`(=10080min) /
  `earnings_window.stale_threshold_hours:24`(=1440min) — byte-exact match,
  independent of the row's own citation.

## Test Results

Widened beyond the claimed 8-file/107-test scope in 3 rings (all independently
re-run, none trusted from prose):
- Ring 1 (7 files review_note names): **110 pass / 0 fail** (318 expect() calls)
- Ring 2 (+9 more bctc/SLA-threshold-touching files found via grep): **140 pass / 0 fail**
- Ring 3 (full 18-file set of every test importing `freshnessSlaChecker`/
  `freshnessSlaConfig`): **271 pass / 0 fail** (730 expect() calls)

`bun tsc --noEmit`: 0 errors.
Full 14870-test `bun test` claim not independently re-run (609s cost judged
disproportionate — the 18-file direct-importer ring is exhaustive for this
change's blast radius).

## DDD Compliance: PASS

Touched files are `domain/services/freshnessSlaChecker.ts` and
`domain/services/freshnessSlaConfig.ts` (config extraction, unchanged by this
commit) plus test files only. No `infrastructure`/`application` imports (grep
match on "infrastructure" is a doc-comment, not an import).

## Security: PASS

- No `process.env` usage in touched files.
- No hardcoded secrets/credentials.
- `bash scripts/audits/mock-guard.sh --files apps/mcp-server/src/domain/services/freshnessSlaChecker.ts` → PASS.

## Files Changed (commit 78f945fb2)

- `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts` (root-cause fix)
- `apps/mcp-server/src/__tests__/FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT.test.ts` (new, AC-1..5 regression pin)
- `apps/mcp-server/src/__tests__/FIX-BCTC-SLA-WEEKEND.test.ts` (fixture ripple)
- `apps/mcp-server/src/__tests__/FIX-BCTC-SLA-THRESHOLD-360.test.ts` (fixture ripple)
- `apps/mcp-server/src/__tests__/FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH.test.ts` (fixture ripple)
- `apps/mcp-server/src/__tests__/1920i-freshness-sla-extension.test.ts` (fixture ripple)
- `apps/mcp-server/src/__tests__/234-vps-health-sla.test.ts` (fixture ripple)
- `apps/mcp-server/src/__tests__/1407b-sla-market-hours-gate.test.ts` (fixture ripple)

## Board Disposition

`docs/data/orch/orch-state.json` `.task_board.qa[]` → `.task_board.done_verified[]`
via `orch-apply.sh`: status `QA → DONE_VERIFIED`, `[QA] Review Record` appended to
the row's `review_note`, `verification.raw_probe` attached (tool/args/
live_value_observed/observed_at). Conservation check clean (task_total 732=732).
No merge/branch-delete step — work was already on `main`.

## RETURN

DONE: Task FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT verified against
main HEAD commits 78f945fb2/abd890ef1 — no branch/merge needed (already on main)
NEXT: pm | mark done, unblock downstream
PIPELINE: continue
