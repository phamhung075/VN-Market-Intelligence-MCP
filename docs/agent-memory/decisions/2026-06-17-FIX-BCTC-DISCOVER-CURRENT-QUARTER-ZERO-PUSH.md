# Decision Journal — FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH

date: 2026-06-17
task-id: FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH
agent: qa
cycle: 292
verdict: CHANGES_REQUESTED

## What was considered

Implementation commit 3eebf3bc — removes the `attempts===0` no-op else branch in
`bctcQueueEnricherJob.ts` lines 484-518, replacing it with a single
`incrementAttemptsStmt.run(item.id)` so every real 0-URL discovery result increments
attempts regardless of current value. The `>= MAX_ENRICH_ATTEMPTS` terminal path
(markUrlNotFound) is preserved. The catch block (pre-network error) does not increment.

## Checks run

1. New test file (8 tests TERM-1..7 + TERM-3b): 8 pass / 0 fail (per-file run)
2. 1287-bctc-queue-enricher.test.ts (existing): 7 pass / 0 fail
3. 1358b-bctc-queue-enricher-gaps.test.ts (existing): 8 pass / 0 fail
4. tsc --noEmit: 0 errors
5. Full CI per-file isolation (13177 pass / 42 skip / 18 fail, 11 failed files):
   - FIX-BCTC-PIPELINE.test.ts: 1 FAIL — test "does not increment attempts field"
     expects attempts=0 on 0-URL first-pass — this encodes the OLD BUGGY behavior.
     Direct conflict with the new correct behavior (TERM-1 proves attempts must be 1).
   - BCTC-1943-queue-reset-and-retry.test.ts: 1 FAIL — test "leaves reset rows pending
     if attempts=0 and no URL found (first pass)" expects attempts=0 — same stale spec.
   - 9 remaining failed files: Chromium-absent / flaky-network env failures (pollNews,
     e2e-briefing, rss) — unrelated to this fix, pre-existing CI weather.
6. Generic mandate check: grep of bctcQueueEnricherJob.ts for BDI/DAG/DLC/JSH/SIS/VDC/
   VNH/VEA/Q1-2026 in non-comment production lines → zero hits. Fix is ticker-agnostic
   and date-agnostic. TERM-5 confirms with ZZTEST/2027-Q3. GENERIC CONFIRMED.
7. Error/catch path: read lines 519-538 — NO incrementAttemptsStmt call in catch block.
   TERM-4 confirms (SIS with ECONNREFUSED → attempts stays 0). NO-INCREMENT PRESERVED.

## Why CHANGES_REQUESTED (not APPROVED)

Two pre-existing tests encode the root-cause bug and are now failing:
- apps/mcp-server/src/__tests__/FIX-BCTC-PIPELINE.test.ts:184
  test name: "does not increment attempts field"
  assertion: expect(row.attempts).toBe(0) — should now be .toBe(1) or test deleted
- apps/mcp-server/src/__tests__/BCTC-1943-queue-reset-and-retry.test.ts:257
  test name: "leaves reset rows pending if attempts=0 and no URL found (first pass)"
  assertion: expect(row?.attempts).toBe(0) — same stale spec

These are not flaky failures — they reproduce deterministically when run in isolation.
They are stale tests that encoded the bug itself. Dev must update them to reflect the
new correct contract (first-pass 0-URL → attempts=1, not 0) or remove the stale
"no-increment on first pass" assertions entirely.

## Why catch-path non-increment is NOT a blocker

TERM-4 passes — the catch block at lines 519-538 has no incrementAttemptsStmt call,
only partialFailures/timeoutFailures counters and a logger.warn. Design invariant holds.

## Routing

CHANGES_REQUESTED → dev-mcp-server to update the two stale test assertions.
After fix: re-run full CI isolation to confirm 0 enricher-related failures before APPROVED.
