---
sprint: ARCH-DAILY-FOREIGN-FLOW-TABLE
parent_task: ARCH-DAILY-FOREIGN-FLOW-TABLE
subtask_index: 2
task_id: TASK_2001
branch: task/2001-daily-ff-backfill
size: M
zone: apps/mcp-server/
depends_on: ["TASK_2000"]
blocks: ["TASK_2002"]
---

## TLDR
One-time idempotent backfill: copy all existing foreign-flow data from frozen `daily_ohlcv.foreign_*` columns into new `daily_foreign_flow` table. **Critical ordering:** this task MUST ship and complete before TASK_2002 (writer cutover) goes live — R-6 constraint.

## [PM] Planning Context

**Architect's subtask:** SUBTASK-DAILY-FF-2 (§5 PM Task Atomization)

### Acceptance Criteria
- [ ] Backfill SQL implemented: `INSERT OR IGNORE INTO daily_foreign_flow SELECT ...` from `daily_ohlcv` where foreign_buy_vol OR foreign_sell_vol IS NOT NULL
- [ ] Backfill migration wired into boot sequence (same idempotent pattern as `migrateForeignFlowColumns()`)
- [ ] Backfill SQL includes all 8 columns: foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol, foreign_buy_value, foreign_sell_value, updated_at, plus (code, date) as PK
- [ ] Unit test T-5: backfill idempotency — run twice against pre-seeded DB, verify second run is no-op (row count unchanged, no duplicates/errors)
- [ ] Backfill completes in < 5s on production DB snapshot (performance checkpoint — if > 5s, investigate index/query plan)
- [ ] Verify: all rows from legacy `daily_ohlcv` with foreign_* data now exist in `daily_foreign_flow` with identical values

### Files to read first
- `docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md` § Change 4
- `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:88-105` (legacy `daily_ohlcv` structure)
- `apps/mcp-server/src/infrastructure/db/schema.ts:278-300` (idempotent migration pattern)

### Files to modify
- `apps/mcp-server/src/infrastructure/db/schema-market-data.ts` or `schema.ts` — add idempotent backfill migration function
- Boot sequence that runs migrations on startup

### Files to create
- Test file or extend existing: verify idempotency (T-5 from design doc)

### Dependencies
- **Depends on:** TASK_2000 (schema must exist before backfill runs)
- **Blocks:** TASK_2002 (writer cutover) — R-6 constraint; backfill MUST land first

### Knowledge needed
- `docs/policies/dev-standards.md`
- SQLite `INSERT OR IGNORE` idempotency semantics
- `docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md` § Change 4 — mandatory read for R-6 ordering constraint

### Notes
- **Zone:** `apps/mcp-server/` only
- **Risk R-6 (design doc):** backfill omitted/out-of-order → multi-day depth regression on cutover day. Mitigation: explicit task dependency + test idempotency.
- If live DB has > 1000 rows with foreign data, do not worry about performance — idempotent INSERT OR IGNORE is O(n) with index on PK; even 10k rows should be < 1s on modern SQLite.
- Backfill must run on every boot (idempotent) to handle DB resets/rebuilds during development and test.

## [Developer] Implementation Record
- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/infrastructure/db/schema.ts:264-296` — added `backfillDailyForeignFlow(db)` (exported, sync) implementing the exact `INSERT OR IGNORE INTO daily_foreign_flow (...) SELECT ... FROM daily_ohlcv WHERE foreign_buy_vol IS NOT NULL OR foreign_sell_vol IS NOT NULL` from the architect design § Change 4; wired into `initDatabase()` immediately after the existing `await migrateForeignFlowColumns(db);` call.
  - `docs/architecture/microservice/mcp-server/infrastructure.md` — documented SUBTASK-DAILY-FF-2 backfill under the `daily_foreign_flow` DDL block.
  - `docs/architecture/microservice/mcp-server/testing.md` — added row for the new test file.
- **Tests written:** `apps/mcp-server/src/__tests__/daily-foreign-flow-backfill.test.ts` — 6 tests / 24 expect(), GREEN. Covers T-5 idempotency (backfill run twice against a seeded DB — 2nd run no-op, identical row count, no dup/error), correctness (all 8 columns + PK copied identically), WHERE-clause exclusion (rows with both foreign_buy_vol/foreign_sell_vol NULL skipped), additive-only proof (pre-existing `daily_foreign_flow` row never overwritten via PK conflict), boot-sequence wiring proof (re-running `initDatabase()` backfills without a direct function call), and a performance checkpoint (3000 synthetic rows backfilled in well under 5s).
- **Git commits:** `878f5414a` feat(mcp-server/ARCH-DAILY-FOREIGN-FLOW-TABLE): TASK_2001 — daily_foreign_flow one-time backfill (SUBTASK-DAILY-FF-2)
- **Type check:** clean (`bun tsc --noEmit`)
- **bun test:** new suite 6/6 pass; regression (`daily-foreign-flow-schema` 15/15 + `2026-ohlcv-foreign-flow-merge` 7/7 + `1286-daily-ohlcv-schema` + `1527-schema-slices` + `002-db-schema`) 123/123 pass, 0 fail
- **Tool count:** 183 — matches pre-task baseline (unchanged, no tool file touched)
- **Scheduler count:** cron.schedule grep = 3 (pre-existing doc/reality drift vs the flow doc's stated baseline of 76, already flagged in the TASK_2000-cycle notebook entry; unrelated to this diff, zero scheduler files touched)
- **Docs updated:** `docs/architecture/microservice/mcp-server/infrastructure.md`, `docs/architecture/microservice/mcp-server/testing.md`
- **Graphify:** skipped (small doc delta, additive-only change; no new architectural concept introduced beyond what TASK_2000 already documented)

**Idempotency test (T-5) result (raw, `bun test ... -t "T-5"`):**
```
bun test v1.3.13 (bf2e2cec)

src/__tests__/daily-foreign-flow-backfill.test.ts:
 1 pass
 5 filtered out
 0 fail
 7 expect() calls
Ran 1 test across 1 file. [131.00ms]
```
Both `afterFirst.cnt` and `afterSecond.cnt` assert `toBe(1)` — second run produces zero new rows and zero errors.

**Additive/idempotent confirmation:** `INSERT OR IGNORE` is PK-guarded on `(code, date)` — it only inserts rows that don't yet exist in `daily_foreign_flow`. It never issues an UPDATE or DELETE, so it cannot overwrite or remove any existing row (proven by the "additive-only" test: a pre-existing row with different values is untouched when a conflicting legacy `daily_ohlcv` row exists for the same `(code,date)`).

**Redeploy note:** rides the pending user/ops-gated mcp-server rebuild (same as TASK_2000) — the backfill runs automatically and safely on the next container boot against the live named-volume DB. This agent did NOT run it against the live serving DB (tested only against an in-memory `:memory:` DB, per task's data-safety instruction).
