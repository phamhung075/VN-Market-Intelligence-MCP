---
sprint: ARCH-DAILY-FOREIGN-FLOW-TABLE
parent_task: ARCH-DAILY-FOREIGN-FLOW-TABLE
subtask_index: 3
task_id: TASK_2002
branch: task/2002-daily-ff-writer-cutover
size: L
zone: apps/mcp-server/
depends_on: ["TASK_2001"]
blocks: ["TASK_2005"]
---

## TLDR
Replace merge-only writer (`writeForeignFlowToOhlcv`) with unconditional upsert into `daily_foreign_flow`. Stop writing legacy `daily_ohlcv.foreign_*` columns. Freeze legacy columns + add SSOT-freeze annotation. Implement unit tests T-1/T-2/T-4/T-5 from design doc. This is the critical task that closes R-1 structurally.

## [PM] Planning Context

**Architect's subtask:** SUBTASK-DAILY-FF-3 (§5 PM Task Atomization)

### Acceptance Criteria
- [ ] `writeForeignFlowToOhlcv()` rewritten in `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts` (or renamed file per optional follow-on) to perform unconditional `INSERT INTO daily_foreign_flow ... ON CONFLICT(code, date) DO UPDATE SET ...` (exact SQL per design doc § Change 2)
- [ ] Writer STOPS writing `daily_ohlcv.foreign_*` columns (no UPDATE on legacy table)
- [ ] Return shape preserved: `{ changes: number }` — ensure callers see no signature change
- [ ] Debug log added: note whether matching `daily_ohlcv` row exists (operational visibility), but log message reflects that write always succeeds (not "deferred")
- [ ] SSOT-freeze annotation added to JSDoc per R-7 mitigation (same pattern as parent design's `ohlcvWriteService.ts` §Writer-Bypass Class Closure): any raw write to `daily_ohlcv.foreign_*` outside this frozen-column note is a violation
- [ ] **Unit tests (new file, e.g., `daily-foreign-flow-table.test.ts`):**
  - [ ] T-1: call writer for `(code,date)` with zero `daily_ohlcv` rows → `changes=1`, row exists in `daily_foreign_flow` with correct values (R-1 elimination proof)
  - [ ] T-2: call writer with existing `daily_ohlcv` row (no `daily_foreign_flow` row) → row created in `daily_foreign_flow`, `daily_ohlcv.foreign_*` untouched
  - [ ] T-4: after T-1, verify `SELECT close FROM daily_ohlcv WHERE code=? AND date=?` returns zero rows (no stub INSERT with close=0 — regression proof)
  - [ ] T-5: backfill idempotency (can also be in TASK_2001's test — move if appropriate) — run backfill twice, second is no-op
- [ ] Existing callers (`foreignFlowFetcher.ts:L136-137`, `pushForeignFlowHandler.ts:L314-329`) require zero code changes (signature unchanged, both already treat `changes=0` as non-error)
- [ ] `changes=0` can no longer occur for a valid row (was the whole point of R-2's concern — verify this holds)

### Files to read first
- `docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md` § Change 2, § Test Strategy (T-1/T-2/T-4/T-5), § Risk Flags R-6/R-7
- `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts:L53-114` (current merge-only UPDATE)
- `apps/mcp-server/src/infrastructure/fetchers/foreignFlowFetcher.ts:L136-137` (caller A, non-error check)
- `apps/mcp-server/src/interface/mcp/routes/pushForeignFlowHandler.ts:L314-329` (caller B, try/catch)

### Files to modify
- `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts` — rewrite function body (INSERT OR IGNORE ... ON CONFLICT pattern)
- Add/update unit tests in (new or existing test file)

### Files to create
- Test file (e.g., `apps/mcp-server/src/__tests__/daily-foreign-flow-table.test.ts`) — new comprehensive test suite for T-1/T-2/T-4/T-5

### Dependencies
- **Depends on:** TASK_2001 (backfill must land before writer goes live — R-6 hard constraint)
- **Blocks:** TASK_2005 (integration test) — needs writer cutover in place to test behavioral proof

### Knowledge needed
- `docs/policies/dev-standards.md`
- `docs/ARCHITECTURE.md` § Infrastructure layer
- SQLite `INSERT ... ON CONFLICT ... DO UPDATE` upsert pattern
- `docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md` § Change 2, § Test Strategy, § Risk Flags (R-6/R-7)
- SSOT-freeze annotation pattern (see parent design reference for `ohlcvWriteService.ts`)

### Notes
- **Zone:** `apps/mcp-server/` only
- **Size:** L — this rewrites a critical writer path + adds 4 unit tests + adds SSOT freeze annotation
- **Risk R-6 (critical):** backfill MUST land before this task ships. If backfill is missing, multi-day depth is a strict subset of history — worsens the `get_foreign_accum_rank` residual. This dependency is enforced by task ordering, not runtime logic.
- **Risk R-7:** SSOT-freeze annotation guards against future accidental raw writes to `daily_ohlcv.foreign_*` after this freeze. No new ESLint rule required — annotation-level guard per parent design's decision.
- Callers (`foreignFlowFetcher.ts`, `pushForeignFlowHandler.ts`) need **zero changes** — this is a drop-in replacement under the same interface
- Existing 15 foreign-flow test files should not break (they read via the view now in read-site migrations, or still read from `daily_ohlcv` directly if not migrated yet — backfill ensures legacy columns stay populated with historical data)
- Do NOT rename file in this task (optional follow-on per design doc) — keep as `ohlcvForeignFlowStore.ts` to minimize import churn risk on live P1 task
