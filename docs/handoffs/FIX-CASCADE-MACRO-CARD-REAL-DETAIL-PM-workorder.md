# PM Workorder — FIX-CASCADE-MACRO-CARD-REAL-DETAIL

**From:** pm · **To:** dev-mcp-server · **Date:** 2026-06-19  
**Design source:** docs/architecture-briefs/2026-06-19-cascade-macro-card-redesign.md (DESIGN COMPLETE)  
**Epic:** INFOCARD-EXPAND-FETCH · **Sprint:** active  
**Task status:** READY -> IN PROGRESS

---

## Task Overview

Fix three independent defects that cause the Macro Impact Card (`MacroImpactPanel`) to display empty generic rows instead of real cascade-macro detail:

1. **D-1 (Interface):** `type=chain_catalyst` query param silently ignored at DB layer
2. **D-2 (Infrastructure):** Empty `verified_decision` correlation rows polluting the card display
3. **D-3 (Data hygiene):** Test-fixture rows (ids 6218, 6216) live in production DB

All fixes are **server-side TypeScript only** (`apps/mcp-server/`). No frontend rebuild required. Single zone, sequential dispatch.

---

## Atomic Task Breakdown

### Task 1: Interface + Data Layer (Server-side)

**Files:**
- `apps/mcp-server/src/interface/mcp/routes/stockSignalsHandler.ts` (modify `querySignalsForStock`)
- `apps/mcp-server/src/interface/mcp/server.ts` (wire `?type` param at ~L1331)
- `apps/mcp-server/src/infrastructure/db/alertStore.ts` (add `is_correlation_stub` marker)

**Changes:**

1. **stockSignalsHandler.ts — querySignalsForStock:**
   - Add optional `signalTypes?: string[]` param to signature
   - Add schema probe for `is_correlation_stub` column (idempotent, same pattern as existing `hasConfidenceScore` probe)
   - Build dynamic WHERE clause:
     - When `signalTypes=['chain_catalyst']`, expand to `IN ('chain_catalyst','urgent_news')`
     - When `signalTypes` undefined, include all types
     - Always apply dual exclusion guard:
       - If column exists: `AND (is_correlation_stub IS NULL OR is_correlation_stub = 0)`
       - If column absent (pre-migration): `AND NOT (signal_type = 'verified_decision' AND empty payload/finding_data)`

2. **server.ts — route handler (~L1331):**
   - Extract `url.searchParams.get("type")` 
   - Parse as CSV: `typeParam.split(",").map(s => s.trim()).filter(Boolean)`
   - Pass `signalTypes` to `querySignalsForStock(db, code, limit, signalTypes)`

3. **alertStore.ts — correlation marker:**
   - Add idempotent `ensureCorrelationStubColumn(db)` function: `ALTER TABLE agent_signals ADD COLUMN is_correlation_stub INTEGER DEFAULT 0` (plain ADD, NO UNIQUE)
   - Call this function inside `storeAlerts` and `storeAlertsFromCommander` before transaction
   - In both `INSERT INTO agent_signals` statements for `verified_decision` rows: add column `is_correlation_stub` with value `1`

**Acceptance Criteria (AC-10 to AC-12):**
- **AC-10:** Type filter returns correct rows  
  Insert 3 rows (chain_catalyst, urgent_news, verified_decision); query with `["chain_catalyst"]` → returns 2 rows (chain_catalyst + urgent_news), excludes verified_decision
- **AC-11:** Stub exclusion via flag  
  Insert verified_decision with `is_correlation_stub=1`; query without filter → returns 0 rows
- **AC-12:** Belt-and-suspenders guard (pre-migration)  
  Schema has NO is_correlation_stub column; insert empty verified_decision; query → returns 0 rows via fallback filter

**Dependencies:** None (alertStore changes are additive, no breaking changes).

---

### Task 2: Migration Script (Data Layer)

**File:**
- `scripts/migrations/purge-test-fixture-signals.ts` (NEW)

**Changes:**
- Create idempotent migration script with `--dry-run` and `--live` flags
- Delete predicate (triple-guarded):
  ```sql
  DELETE FROM agent_signals
  WHERE (
    (payload LIKE '%"title":"VCB catalyst"%' AND stock_code = 'VCB')
    OR (payload LIKE '%"title":"HPG chain verify"%' AND stock_code = 'HPG')
  )
  AND finding_data IN ('{}', '', NULL)
  AND signal_type IN ('chain_catalyst', 'verified_chain')
  ```
- Print row counts before/after
- `--dry-run` mode shows count without deletion
- `--live` mode executes deletion
- Exit with error if count ≠ 2 on `--live`

**Execution pattern (dev runs this, not PM):**
```bash
# Verify count = 2
docker cp scripts/migrations/purge-test-fixture-signals.ts \
  vn-market-intelligence-mcp-mcp-server-1:/tmp/purge-test-fixture-signals.ts
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun /tmp/purge-test-fixture-signals.ts --dry-run

# Execute deletion
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun /tmp/purge-test-fixture-signals.ts --live
```

**Acceptance Criteria (AC-15):**
- **AC-15:** Migration idempotency + live verification  
  Run `--dry-run` → count = 2; run `--live` → deletion succeeds, total rows decrease by exactly 2; re-run `--dry-run` → count = 0 (rows gone)

---

### Task 3: Test Suite Extensions

**Files:**
- `apps/mcp-server/src/__tests__/FIX-SIGNALS-STOCK-FULL-DETAIL.test.ts` (extend existing)
- `apps/mcp-server/src/__tests__/FIX-CASCADE-MACRO-CARD-REAL-DETAIL.test.ts` (NEW)

**Changes:**

1. **FIX-SIGNALS-STOCK-FULL-DETAIL.test.ts — add AC-10 to AC-12 test cases** (under existing test suite)

2. **FIX-CASCADE-MACRO-CARD-REAL-DETAIL.test.ts — NEW file with AC-13 to AC-15:**
   - **AC-13:** Server route wiring — `?type=chain_catalyst` param → SQL includes `signal_type IN ('chain_catalyst','urgent_news')`
   - **AC-14:** Alert correlation stub marker — `storeAlerts` writes row with `is_correlation_stub=1`; `querySignalsForStock` excludes it
   - **AC-15:** `ensureCorrelationStubColumn` idempotent — call twice, no error, column present

---

## DoD Checklist (7 items)

1. **Type filter live:** `curl http://localhost:4000/mcp/api/signals/stock/FPT?limit=5&type=chain_catalyst` → returns ONLY `signal_type IN ['chain_catalyst','urgent_news']`; `verified_decision` rows absent
2. **Real detail visible:** At least one row for FPT has non-empty `finding_data` (keys: headline, source, direction) and `source != null`; same check on VCB and HPG (3 watchlist stocks, varied data)
3. **Empty state honest:** `curl http://localhost:4000/mcp/api/signals/stock/VNM?limit=5&type=chain_catalyst` → empty array (VNM has 0 real cascade rows); frontend shows "Không có cascade macro cho VNM trong 24h qua."
4. **Test suite green:** `cd apps/mcp-server && pnpm check && bun test --preload src/__tests__/setup.ts src/__tests__/FIX-SIGNALS-STOCK-FULL-DETAIL.test.ts src/__tests__/FIX-CASCADE-MACRO-CARD-REAL-DETAIL.test.ts` → all pass; full CI run clean
5. **Migration verified:** After `purge-test-fixture-signals.ts --live`, confirm ids 6218 and 6216 absent; rowcount decreases by exactly 2
6. **tsc gate:** `pnpm check` from repo root green before commit (RED-PREPUSH)
7. **Container rebuild:** `docker compose up -d --build mcp-server` post-commit; service restarts cleanly; no image rebuild since --build is stateless (COPY-baked src)

---

## Risk Flags + Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `ALTER TABLE ADD COLUMN` on live WAL DB | Low | SQLite WAL supports online DDL; guard is idempotent; pattern already used for other columns |
| `is_correlation_stub` column absent on first request (pre-migration) | Mitigated | Belt-and-suspenders fallback filter: `NOT (signal_type='verified_decision' AND empty)` handles pre-migration rows |
| `purge-test-fixture-signals.ts` deletes wrong row | Very low | LIKE + signal_type + finding_data='{}' triple guard + dry-run confirms count=2 before live |
| Expanding chain_catalyst → (chain_catalyst,urgent_news) changes card semantics | Low | `urgent_news` rows carry genuine macro context (cpi_pressure_risk, regime, source); InfoCardExpand already renders correctly |

---

## Build Standard

- **Zone:** `apps/mcp-server/` (single zone)
- **Build:** Container rebuild required (`docker compose up -d --build mcp-server`)
- **No schema breaking changes:** `ADD COLUMN` only, backward-compat via probe pattern
- **No new routes, tools, or tables**
- **CI baseline:** Full test suite green before merge

---

## RETURN: Next Agent Assignment

**Task ID:** FIX-CASCADE-MACRO-CARD-REAL-DETAIL  
**Next agent:** dev-mcp-server  
**Subtasks:** 3 (interface wiring, migration, tests)  
**WIP slot:** 1 of 2 (in_progress lane)  
**Ready to pull:** YES  

**Expected duration:** ~2–3h (single zone, sequential, no blocking dependencies)

---

## Handoff Summary

**What you (dev-mcp-server) need to do:**
1. Implement the three interface/infra changes (server.ts, stockSignalsHandler.ts, alertStore.ts) with schema probes
2. Write the migration script (purge-test-fixture-signals.ts) with --dry-run/--live
3. Extend the test suite (AC-10 to AC-15)
4. Run full test suite + live curl verification (3 stocks: FPT, VCB, HPG + 1 empty VNM)
5. Run migration --dry-run (verify count=2), then --live
6. Rebuild container and verify no regressions
7. Commit with message ending `Claude-Session: https://claude.ai/code/session_01JdVqWyt2s6zx9wA14JM2XD`

**Files in scope:**
```
apps/mcp-server/src/interface/mcp/routes/stockSignalsHandler.ts
apps/mcp-server/src/interface/mcp/server.ts
apps/mcp-server/src/infrastructure/db/alertStore.ts
apps/mcp-server/src/__tests__/FIX-SIGNALS-STOCK-FULL-DETAIL.test.ts
apps/mcp-server/src/__tests__/FIX-CASCADE-MACRO-CARD-REAL-DETAIL.test.ts
scripts/migrations/purge-test-fixture-signals.ts (NEW)
```

**AC + DoD:** 15 AC (AC-10 through AC-15 in tests) + 7 DoD items (live curl + migration + tsc + rebuild).

**Route back to PM:** When done, create a pull request or mark task DONE in orch-state with verification notes.
