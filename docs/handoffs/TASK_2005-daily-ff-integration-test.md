---
sprint: ARCH-DAILY-FOREIGN-FLOW-TABLE
parent_task: ARCH-DAILY-FOREIGN-FLOW-TABLE
subtask_index: 6
task_id: TASK_2005
branch: task/2005-daily-ff-integration-test
size: M
zone: apps/mcp-server/
depends_on: ["TASK_2002", "TASK_2003"]
blocks: []
---

## TLDR
Integration test (T-3 + behavioral gate from design doc) verifying that the view returns correct values even when `daily_ohlcv` row doesn't exist yet. This is the literal falsification of the "chưa trả số từng mã" symptom from live feedback. Seeded zero OHLCV rows, write foreign-flow, verify view returns values, then insert OHLCV row and re-verify join logic.

## [PM] Planning Context

**Architect's subtask:** SUBTASK-DAILY-FF-6 (§5 PM Task Atomization)

### Acceptance Criteria
- [ ] New integration test file (e.g., `apps/mcp-server/src/__tests__/daily-foreign-flow-integration.test.ts`)
- [ ] **T-3 (view correctness):** Insert row into `daily_foreign_flow` directly (no OHLCV row) → query `SELECT foreign_buy_vol FROM daily_ohlcv_with_flow WHERE code=? AND date=?` returns correct value (from new table, not NULL from non-existent OHLCV row)
- [ ] **Behavioral gate (R-1 elimination proof):** Seed zero `daily_ohlcv` rows for ticker X / date D → Call `writeForeignFlowToOhlcv([{code:X, date:D, foreignBuyVol: 100, ...}])` → Assert `daily_ohlcv_with_flow` returns `foreign_buy_vol=100` for X/D **even though `daily_ohlcv` itself has no row for X/D yet** — this is the direct falsification of "chưa trả số từng mã" (no per-ticker numbers) symptom from `feedback_foreign_flow_deferred_write_race_ohlcv_row.md`
- [ ] **Late OHLCV insertion (join correctness):** After behavioral gate passes, insert real OHLCV row for X/D (simulate `pushPricesHandler`) → Assert view still returns correct foreign values via the JOIN, and `daily_ohlcv.close` is the real price (not 0 — T-4 regression proof lives here)
- [ ] Run full regression suite: existing ~15 foreign-flow tests stay green (they now query view via TASK_2003 migrations, same column names)
- [ ] All assertions pass (`pnpm test -- daily-foreign-flow-integration`)

### Files to read first
- `docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md` § Test Strategy (T-3 + behavioral gate + regression), § Change 4 (backfill order)
- `feedback_foreign_flow_deferred_write_race_ohlcv_row.md` — the live symptom being directly falsified
- `apps/mcp-server/src/__tests__/` (look at existing pattern for test structure, DB seeding, assertions)

### Files to create
- New integration test file: `apps/mcp-server/src/__tests__/daily-foreign-flow-integration.test.ts`

### Files to modify
- (Existing test files — regression check only, no changes needed)

### Dependencies
- **Depends on:** TASK_2002 (writer cutover), TASK_2003 (Class-A read sites migrated)
- **Blocks:** none
- **Order:** Must run after writer is live (TASK_2002) and read sites are migrated (TASK_2003) to verify the full path works end-to-end

### Knowledge needed
- `docs/policies/dev-standards.md`
- `docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md` § Test Strategy, § Change 2 (writer upsert), § Change 3 (view definition)
- `feedback_foreign_flow_deferred_write_race_ohlcv_row.md` — understanding the live symptom being fixed
- Test DB seeding patterns from existing `apps/mcp-server/src/__tests__/` files

### Notes
- **Zone:** `apps/mcp-server/` only
- **Size:** M — new integration test file with 3 test cases (T-3, behavioral gate, late-OHLCV insertion)
- **Critical test:** the behavioral gate is the direct proof that R-1 is closed structurally — this is a non-negotiable verification gate before this sprint ships
- **Regression proof:** T-4 (close is not 0) lives in this integration test alongside the behavioral gate — cannot be separated
- Do NOT skip this test or defer it to follow-on — it is the primary verification that the whole design works end-to-end
- Performance note: test should run in < 2s (single-ticker, single-date, no network I/O)
