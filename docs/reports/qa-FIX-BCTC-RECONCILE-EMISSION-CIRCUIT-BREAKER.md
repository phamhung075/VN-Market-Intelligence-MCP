# QA Task Report — FIX-BCTC-RECONCILE-EMISSION-CIRCUIT-BREAKER

**Verdict: PASS — promoted REVIEW → DONE_VERIFIED**

## Scope
Single-row independent verify gate. Did not touch any other review-lane row
(29 other stranded rows are out of scope, tracked by
FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN).

## Emission site
`apps/mcp-server/src/scheduler/financial-reports/bctcExtractReconcileJob.ts`
— post-loop circuit-breaker block (lines ~529-608). Two new named,
env-overridable consts:
- `RECONCILE_DORMANCY_ROW_THRESHOLD` (K, default 3, env
  `BCTC_RECONCILE_DORMANCY_ROW_THRESHOLD`) — lines 141-144.
- `RECONCILE_PRODUCER_STALE_DAYS` (N, default 2, env
  `BCTC_RECONCILE_PRODUCER_STALE_DAYS`) — lines 152-155.

## Targeted test suite — RAW
```
bun test apps/mcp-server/src/__tests__/bctc-extract-reconcile-job.test.ts
19 pass
0 fail
94 expect() calls
Ran 19 tests across 1 file. [2.56s]
```
Matches worker's claim exactly (15 pre-existing + 4 new breaker tests, 19/19
green). Confirmed the 4 new tests by direct read
(`apps/mcp-server/src/__tests__/bctc-extract-reconcile-job.test.ts` lines
382-497):
1. L382 — exports both consts as positive integers.
2. L389 — below-threshold (M=2 < K=3), healthy producer → `bugCalls`
   `toHaveLength(2)` (per-row unchanged), messages contain `RECONCILE
   EXHAUSTED` and explicitly assert `not.toContain("CIRCUIT BREAKER
   TRIPPED")`.
3. L422 — row-count breaker: M=3 (=K) exhausted rows → `bugCalls`
   `toHaveLength(1)`, summary contains `CIRCUIT BREAKER TRIPPED` + all 3
   tickers + total count.
4. L454 — freshness breaker: M=1 (<K) exhausted row + a stale
   `bctc_layout_units` probe row (`RECONCILE_PRODUCER_STALE_DAYS + 1` days
   old) → `bugCalls` `toHaveLength(1)`, summary contains `producer dormant`.
5. L481 — freshness breaker does NOT trip when producer landed a row
   recently (M=1 <K, fresh probe row) → per-row shape, `not.toContain`
   `CIRCUIT BREAKER TRIPPED`.

All 4 tests directly assert the sendBugFn call-count contract via
`bugCalls.toHaveLength(n)` on an injected `sendBugFn` — exactly the AC-4
requirement.

## AC-by-AC

- **AC-1 (PASS)** — code inspection (lines 541-608): when
  `exhaustedRows.length >= RECONCILE_DORMANCY_ROW_THRESHOLD` OR
  `producerStale` (computed from `MAX(bctc_layout_units.extracted_at)` vs
  `RECONCILE_PRODUCER_STALE_DAYS`), exactly one `effectiveSendBug(summaryMsg)`
  call fires (line 588) — no loop, single await. Confirmed behaviorally by
  test L422 (row-count) and L454 (freshness) — both assert
  `toHaveLength(1)`.
- **AC-2 (PASS)** — below threshold with healthy producer (lines 594-607)
  falls into the `else` branch: `for (const r of exhaustedRows) { await
  effectiveSendBug(r.bugMsg) }` — one call per exhausted row, unchanged
  shape. Confirmed by test L389 (`toHaveLength(2)` for 2 isolated rows) and
  L481.
- **AC-3 (PASS)** — `updateEnrichFailed.run(row.id)` (line 451) executes
  inside the main per-row loop, unconditionally, BEFORE the post-loop
  breaker decision block, for every exhausted row regardless of which
  emission path is later chosen. All 4 new tests assert
  `row?.status === "enrich_failed"` for every ticker after the run,
  independent of breaker-tripped/not-tripped outcome.
- **AC-4 (PASS)** — see the 4 tests above; all assert call-count via
  `bugCalls.toHaveLength(...)` on the injected `sendBugFn`, exactly the
  call-count contract required.

## DDD / security spot-check
- No injection surface: `bugMsg`/`summaryMsg` are plain template-literal
  Telegram text messages, never interpolated into SQL or a shell command.
  All DB reads use `?` bound params (including the `RECONCILE_PRODUCER_STALE_DAYS`
  numeric value at line 550, parsed via `parseInt` at const-definition time
  — not string-concatenated from untrusted input).
- No swallowed errors: `sendBugFn` failures in both the summary path (line
  589) and the per-row path (line 598) are caught, `logger.warn`'d, and
  explicitly documented as non-fatal-to-the-status-transition (matches the
  pre-existing test at line 361 that this contract predates the fix).
  `updateEnrichFailed.run()` is never inside a try/catch that could swallow
  a real failure — it's a direct synchronous `bun:sqlite` prepared-statement
  `.run()` call, consistent with the rest of the file's convention.
- Layer: interface/scheduler importing infrastructure only (db, logger,
  fetchers, notifiers) — no domain→infrastructure violation introduced.
- `Bun.env` used for the two new env overrides (not `process.env`) —
  consistent with project convention (`docs/policies/dev-standards.md`:
  "Runtime config: always Bun.env, never process.env").
- `bun tsc --noEmit -p .` (apps/mcp-server) — exit 0, no output.

## Full-suite cross-check (per gate instructions, not required to run fully)
Per the QA prompt's own instruction, did not re-run the full ~14.6k-test
suite (documented pre-existing flaky class unrelated to this change).
Targeted-suite direct run above is the authoritative signal for this gate;
0 fail confirms zero regression in this file/test's own execution.

## Promotion
- `docs/data/orch/orch-state.json`: row moved `.task_board.review[]` →
  `.task_board.done_verified[]`, `status: "DONE_VERIFIED"`,
  `verified_by: "qa"`, `verified_at` stamped, via `scripts/orch-apply.sh`
  (never raw overwrite).
- Both `.head` and `.task_board.head` set to
  `{status:"idle",active_task_id:null,next_agent:"router",updated_at:<now>,updated_by:"qa (FIX-BCTC-RECONCILE done_verified)"}`.
- `bash scripts/orch-state-validate.sh` exit 0 post-write; conservation
  check passed inside `orch-apply.sh` (row count preserved, only moved
  between board sub-arrays).

## Commits (code, pre-existing, verified not re-implemented)
- `e5a70ab44` fix(mcp-server): circuit-breaker for bctcExtractReconcileJob
  fail-loud emission
- `ce2456122` docs(mcp-server): document bctcExtractReconcileJob emission
  circuit breaker
- `4c7f6b0ae` chore(tasks): FIX-BCTC-RECONCILE-EMISSION-CIRCUIT-BREAKER
  IN_PROGRESS→REVIEW via orch-apply.sh
- `3b99ea0ad` chore(memory/dev-mcp-server): notebook + decision journal

All 4 already pushed to origin/main prior to this QA pass.
