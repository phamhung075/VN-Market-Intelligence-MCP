---
agent: dev-mcp-server
task_id: FIX-PRED-CLAIMS-EXCLUDED-SERVE-DISPLAY
timestamp: 2026-06-21T20:30:00Z
---

## Decision: is_excluded serve layer — approach

**What-considered:**
Only path: thread `is_excluded` from the already-selected `PredictionClaimRow.is_excluded`
(already populated via SELECT * since PRED-RESOLVER-GAP-FIX) through two pure helpers:
(1) `mapOutcome` gains a second arg `is_excluded?: number | null` with precedence guard
before the null→pending check;
(2) `computeCalibration` adds an `excluded` counter using the same row field.
No schema change needed (column exists; `mapRow` in store already sets `is_excluded: r.is_excluded ?? 0`).

**Why-change:** no change from plan — task spec was explicit and minimal; single-file
scope confirmed by reading the full row type before touching anything.

**Rejected alternatives:**
- Adding a separate DB query for excluded count: unnecessary, `computeCalibration` already
  iterates all rows; a second query would add latency with zero benefit.
- Changing `mapClaimRow` signature to take is_excluded separately: rejected in favour of
  passing the full row (already the pattern), which avoids a breaking call-site change.

**Key implementation detail:**
`is_excluded` precedence guard fires BEFORE the `resolution_outcome === null` check — this
is load-bearing. Without precedence, a row with is_excluded=1 AND resolution_outcome=null
would fall through to "pending" (the exact bug being fixed).

**Backward compat:**
`mapOutcome(null)` (1-arg) still returns "pending" (is_excluded defaults to undefined, which
is !== 1). All 26 existing TASK17-PRED tests pass unchanged.

**tsc:** exit 0 (no type errors).
**Tests:** 20 new (FIX-PRED-CLAIMS-EXCLUDED-SERVE-DISPLAY.test.ts) GREEN.
          88 total across 4 files, 0 fail.
**Commit:** a41e09a9.
**REBUILD_REQUIRED:** yes.
