<!-- size-justification: 210L — end-to-end blueprint for 3 code changes + 1 migration + DoD; sections non-separable (each references shared context). -->
# Architecture Brief: Cascade Macro Card Real-Detail Fix

**Task ID:** FIX-CASCADE-MACRO-CARD-REAL-DETAIL  
**Epic:** INFOCARD-EXPAND-FETCH  
**Date:** 2026-06-19  
**Author:** architect  
**Status:** DESIGN COMPLETE — ready for PM decomposition → dev

---

## 1. Context & Confirmed Root Causes

The "Tác động Macro" (`MacroImpactPanel`) card on `dashboard.analysis.tsx` shows empty generic rows because three independent defects conspire:

| # | Defect | Location | Confirmed live |
|---|--------|----------|----------------|
| D-1 | `type=chain_catalyst` query param is silently ignored at DB layer | `stockSignalsHandler.ts:querySignalsForStock` (no type filter) + `server.ts:1329` (param not passed through) | curl returns newest rows of ALL types — empty `verified_decision` stubs dominate |
| D-2 | `alert-engine` writes empty `verified_decision` correlation rows (`payload={}`, `finding_data={}`) into `agent_signals` on every alert fire | `alertStore.ts:storeAlerts` + `storeAlertsFromCommander` (lines 104–147, 179–207) | 137 empty `verified_decision` rows live; id 6611 created 2026-06-19T04:00Z |
| D-3 | Test-fixture rows with `payload LIKE '%VCB catalyst%'` / `'%HPG chain verify%'` live in production DB | Written by dev test runners that used the live named-volume DB | id 6218 (VCB/chain_catalyst/Test) and id 6216 (HPG/verified_chain) confirmed live |

Frontend and InfoCardExpand are **already correct** (commit 6abf4d19, FIX-SIGNALS-STOCK-FULL-DETAIL + FIX-INFOCARD-DROPDOWN-EXPAND). `FindingDataPanel` renders all `finding_data` fields generically with a source link; the honest empty-state "Không có dữ liệu chi tiết." fires only when `finding_data` is null/empty AND `source` is null. The entire fix surface is backend.

---

## 2. Design Decisions

### 2.1 — D-1: Honor the `type` filter (PREFERRED type set)

**Decision: accept `chain_catalyst` AND `urgent_news` as cascade-relevant types** (not strictly `chain_catalyst` only).

Live data confirms:
- Real `chain_catalyst` rows for FPT (id 6071, 6065): `finding_data` has `headline`, `event_type:"macro"`, `affected_sectors`, `affected_stocks`, `confidence`, `source`, `hot_money_risk` — renders beautifully.
- Real `urgent_news` rows for FPT (id 6069, 6056, 6042): `finding_data` has `headline`, `cpi_pressure_risk`, `hot_money_risk`, `regime`, `severity`, `source` — also macro-meaningful for the card.
- `fundamental_validation`, `price_anomaly`, `cross_validate`, `verified_chain`, `verified_decision` are NOT macro cascade signals; they belong to other cards (RSI anomaly, validation chain).

The frontend already requests `?type=chain_catalyst` (client.ts:594). We widen the backend to treat the `type` param as an **OR filter**: when `type=chain_catalyst`, return rows where `signal_type IN ('chain_catalyst', 'urgent_news')`. This matches the semantic intent (both types carry macro-event detail) without any frontend change.

Alternatively, the frontend could pass `?type=chain_catalyst,urgent_news` and the backend could parse a CSV. This is cleaner contract-wise. **Chosen approach: backend expands `chain_catalyst` to `('chain_catalyst','urgent_news')` internally** — zero frontend change required, consistent with existing `fetchCascadeSignals` call.

### 2.2 — D-2: Eliminate empty verified_decision serving (ROOT CAUSE FIX)

**Decision: fix the writer, not the reader. Specifically: stop co-writing `agent_signals` rows for verified_decision in `alertStore.ts`.**

Rationale:
- The `FIX-ALERT-ORPHAN-CORRELATION` write was introduced to fix C-08 correlation audit (`ON a.id = s.alert_id`). That correlation need is real — but the row needs to be excluded from the user-facing stock-signal card.
- Options considered:
  - (A) **Stop writing** the correlation rows → breaks C-08 audit.
  - (B) **Mark correlation rows as excluded** from user-facing queries: add a boolean column `is_correlation_stub BOOLEAN DEFAULT 0`, set to `1` at write time, filter in `querySignalsForStock`.
  - (C) **Read-layer filter**: `querySignalsForStock` drops any row where `finding_data` is empty AND `detail` is empty AND `source` is null.
  - (D) **Two-table design**: correlation acks go into a separate `alert_signal_correlation` table, never polluting `agent_signals`.

**Chosen: option (C) as the read-layer guard, combined with option (B) as the write-layer marker.**

Justification for the combination:
- Option (C) alone (read filter) is the fastest fix and handles the immediate symptom across ALL current empty rows without a schema migration.
- Option (B) makes the intent explicit in schema so future writers cannot accidentally re-pollute without opting in. The marker also lets C-08 distinguish correlation stubs from real signal rows.
- Option (D) (two-table) is the cleanest long-term design but requires C-08 query rewrite + migration and exceeds the scope of this fix.
- Option (A) alone breaks the correlation audit.

**Implementation plan for D-2:**
1. `alertStore.ts`: add `is_correlation_stub = 1` to the `INSERT INTO agent_signals` in both `storeAlerts` and `storeAlertsFromCommander`. This requires `ALTER TABLE agent_signals ADD COLUMN is_correlation_stub INTEGER DEFAULT 0` (plain `ADD COLUMN`, no UNIQUE — lesson: `ADD COLUMN UNIQUE` is illegal SQLite, silently swallowed).
2. `stockSignalsHandler.ts:querySignalsForStock`: add a dual-guard filter in the WHERE clause:
   ```sql
   AND (is_correlation_stub IS NULL OR is_correlation_stub = 0)
   AND NOT (
     (finding_data IS NULL OR finding_data = '{}' OR finding_data = '')
     AND (payload IS NULL OR payload = '{}' OR payload = '')
     AND signal_type = 'verified_decision'
   )
   ```
   The second condition is a belt-and-suspenders for pre-existing rows before the column migration runs.

Schema evolution guard already exists in `querySignalsForStock` (the `hasConfidenceScore` / `hasFindingData` probe pattern). The new `is_correlation_stub` column guard must follow the same pattern (probe-then-use).

### 2.3 — D-3: Data hygiene — purge test fixture rows

**Safe idempotent DELETE — named-volume only, no schema change.**

Target rows:
- id 6218: `VCB / chain_catalyst / payload='{"title":"VCB catalyst"}'` — test fixture with no real finding_data source
- id 6216: `HPG / verified_chain / payload='{"title":"HPG chain verify"}'` — test fixture

Delete predicate (narrow + safe — targets only these two known rows by precise payload match):
```sql
DELETE FROM agent_signals
WHERE (
  (payload LIKE '%"title":"VCB catalyst"%' AND stock_code = 'VCB')
  OR (payload LIKE '%"title":"HPG chain verify"%' AND stock_code = 'HPG')
)
AND finding_data IN ('{}', '', NULL)
AND signal_type IN ('chain_catalyst', 'verified_chain');
```

The additional `finding_data` guard prevents accidental deletion if a later real row somehow matched the LIKE pattern. The `signal_type` constraint further narrows the blast radius.

**Delivery vehicle: a migration script** at `scripts/migrations/purge-test-fixture-signals.ts` (not a one-liner — must be idempotent and loggable per `docs/policies/dev-standards.md § Script Persistence`). The script prints affected row count before and after; `--dry-run` mode required.

**Execution against live DB (named-volume pattern, not host ./data):**
```bash
docker cp scripts/migrations/purge-test-fixture-signals.ts \
  vn-market-intelligence-mcp-mcp-server-1:/tmp/purge-test-fixture-signals.ts
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun /tmp/purge-test-fixture-signals.ts --dry-run   # verify count = 2
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun /tmp/purge-test-fixture-signals.ts --live       # execute
```

---

## 3. DDD Layer Assignments

| File | DDD Layer | Change type |
|------|-----------|-------------|
| `apps/mcp-server/src/interface/mcp/routes/stockSignalsHandler.ts` | Interface | Modify `querySignalsForStock` signature: add optional `signalTypes?: string[]` param; update SQL WHERE; add `is_correlation_stub` schema guard |
| `apps/mcp-server/src/interface/mcp/server.ts` | Interface | Wire `?type` query param → `querySignalsForStock(db, code, limit, types)` |
| `apps/mcp-server/src/infrastructure/db/alertStore.ts` | Infrastructure | Add `is_correlation_stub = 1` to two INSERT statements; add `ALTER TABLE ... ADD COLUMN is_correlation_stub` migration guard on startup |
| `scripts/migrations/purge-test-fixture-signals.ts` | (ops/migration) | New migration script — idempotent, `--dry-run` flag |
| `apps/mcp-server/src/__tests__/FIX-SIGNALS-STOCK-FULL-DETAIL.test.ts` | Interface test | Extend with new test cases for the type filter and stub exclusion |
| `apps/mcp-server/src/__tests__/FIX-CASCADE-MACRO-CARD-REAL-DETAIL.test.ts` | Interface test | New test file: type-filter AC + stub-exclusion AC + migration idempotency AC |

**Golden rule honored:** `alertStore.ts` (infrastructure) imports nothing from `domain/`. The new column flag is a pure DB-level concern.

---

## 4. Precise File Modifications

### 4a. `stockSignalsHandler.ts` — `querySignalsForStock` signature change

```typescript
// NEW signature
export function querySignalsForStock(
  db: Database,
  stockCode: string,
  limit: number,
  signalTypes?: string[],   // ← new optional param
): StockSignalItem[]
```

Inside the function body:

1. Add `is_correlation_stub` schema probe (same pattern as `hasConfidenceScore`):
   ```typescript
   let hasCorrelationStub = false;
   try {
     db.prepare("SELECT is_correlation_stub FROM agent_signals LIMIT 0").all();
     hasCorrelationStub = true;
   } catch { /* column absent — pre-migration schema */ }
   ```

2. Build the WHERE clause dynamically:
   ```typescript
   // Cascade type filter: when signalTypes provided, include those types only.
   // When signalTypes=['chain_catalyst'], expand to include 'urgent_news' (both carry macro detail).
   const effectiveTypes = signalTypes && signalTypes.includes("chain_catalyst") && !signalTypes.includes("urgent_news")
     ? [...signalTypes, "urgent_news"]
     : signalTypes;

   const typeFilter = effectiveTypes && effectiveTypes.length > 0
     ? `AND signal_type IN (${effectiveTypes.map(() => "?").join(",")})`
     : "";

   const stubFilter = hasCorrelationStub
     ? "AND (is_correlation_stub IS NULL OR is_correlation_stub = 0)"
     : "AND NOT (signal_type = 'verified_decision' AND (finding_data IS NULL OR finding_data = '{}' OR finding_data = '') AND (payload IS NULL OR payload = '{}' OR payload = ''))";
   ```

3. Compose final SQL:
   ```sql
   SELECT id, stock_code, signal_type, payload, created_at${confidenceCol}${findingCol}
   FROM agent_signals
   WHERE stock_code = ?
   ${typeFilter}
   ${stubFilter}
   ORDER BY created_at DESC
   LIMIT ?
   ```

4. Bind params: `[stockCode, ...(effectiveTypes ?? []), limit]`

### 4b. `server.ts` — route wiring

At line 1331, after extracting `limitParam`, add:
```typescript
const typeParam = url.searchParams.get("type");   // e.g. "chain_catalyst"
const signalTypes = typeParam ? typeParam.split(",").map(s => s.trim()).filter(Boolean) : undefined;
```

Pass to handler: `querySignalsForStock(db, code, limit, signalTypes)`

### 4c. `alertStore.ts` — correlation stub marker

**Startup migration guard** (call once at startup, idempotent):
```typescript
function ensureCorrelationStubColumn(db: Database): void {
  try {
    db.prepare("SELECT is_correlation_stub FROM agent_signals LIMIT 0").all();
  } catch {
    // Column absent — add it
    db.exec("ALTER TABLE agent_signals ADD COLUMN is_correlation_stub INTEGER DEFAULT 0");
  }
}
```

Call `ensureCorrelationStubColumn(db)` inside both `storeAlerts` and `storeAlertsFromCommander` before the transaction (guard is idempotent, negligible overhead).

In both INSERT statements, add `is_correlation_stub` to the column list with value `1`:
```sql
INSERT OR IGNORE INTO agent_signals
  (from_agent, to_agent, signal_type, stock_code, payload, status,
   created_at, expires_at, alert_id, is_correlation_stub)
VALUES
  ('alert-engine', 'all', 'verified_decision', ?, '{}', 'unread',
   ?, datetime(?, '+2 hours'), ?, 1)
```

---

## 5. Test Contracts (per-file CI isolation)

### Existing test file to extend: `FIX-SIGNALS-STOCK-FULL-DETAIL.test.ts`

Add these test cases:

**AC-10: type filter — chain_catalyst returns chain_catalyst + urgent_news rows**
- Insert 3 rows: `chain_catalyst`, `urgent_news`, `verified_decision` (all for same stock)
- `querySignalsForStock(db, code, 10, ["chain_catalyst"])` → returns 2 rows (chain_catalyst + urgent_news), excludes `verified_decision`

**AC-11: type filter — undefined returns all non-stub rows**
- Same 3 rows + 1 `verified_decision` with `is_correlation_stub=1`
- `querySignalsForStock(db, code, 10, undefined)` → returns 3 rows (excludes stub)

**AC-12: stub exclusion — empty verified_decision rows excluded even without column**
- Insert `verified_decision` row with `finding_data='{}'`, `payload='{}'`
- Schema has NO `is_correlation_stub` column (simulate pre-migration)
- `querySignalsForStock` → returns 0 rows for that stock

### New test file: `apps/mcp-server/src/__tests__/FIX-CASCADE-MACRO-CARD-REAL-DETAIL.test.ts`

**AC-13: server route passes type param to handler**
- This is an integration test: instantiate the route handler logic directly (or mock it), confirm that `?type=chain_catalyst` causes the SQL to include `signal_type IN ('chain_catalyst', 'urgent_news')`.

**AC-14: alertStore correlation stub marker**
- Call `storeAlerts([alert], db)` in :memory: DB
- Verify the resulting `agent_signals` row has `is_correlation_stub = 1`
- Call `querySignalsForStock(db, stockCode, 10)` → returns 0 rows (stub excluded)

**AC-15: `ensureCorrelationStubColumn` is idempotent**
- Call twice — no error thrown, column present after both calls

---

## 6. Verification / DoD

All 5 items must pass before this task is DONE:

1. **Type filter live**: `curl http://localhost:4000/mcp/api/signals/stock/FPT?limit=5&type=chain_catalyst` → response `signals` array contains ONLY `signal_type IN ['chain_catalyst','urgent_news']`; `verified_decision` rows absent.

2. **Real detail visible**: At least one returned row for FPT has non-empty `finding_data` (keys: `headline`, `source`, `direction`, `affected_stocks`) and `source != null`. Same check on VCB and HPG (3 different watchlist stocks, varied data — not a constant).

3. **Empty state honest**: `curl http://localhost:4000/mcp/api/signals/stock/VNM?limit=5&type=chain_catalyst` → if signals array is empty, frontend correctly shows "Không có cascade macro cho VNM trong 24h qua." (not the "Không có dữ liệu chi tiết." from `FindingDataPanel`). VNM currently has 0 real cascade rows — this is the honest empty-state DoD check.

4. **Test suite green**: `cd apps/mcp-server && pnpm check && bun test --preload src/__tests__/setup.ts src/__tests__/FIX-SIGNALS-STOCK-FULL-DETAIL.test.ts src/__tests__/FIX-CASCADE-MACRO-CARD-REAL-DETAIL.test.ts` → all pass. Full CI run clean (no regressions in alertStore tests).

5. **Migration verified**: After running `purge-test-fixture-signals.ts --live`, confirm via a bun probe on the live DB that ids 6218 and 6216 are absent; total `agent_signals` rowcount decreases by exactly 2.

6. **tsc gate**: `pnpm check` from repo root green before commit (RED-PREPUSH lesson).

7. **No rebuild needed**: This fix is server-side TypeScript only (`apps/mcp-server/`). The mcp-server container must be rebuilt and restarted (`docker compose up -d --build mcp-server`) for changes to take effect. Frontend rebuild NOT required.

---

## 7. Risk Flags

| Risk | Severity | Mitigation |
|------|----------|------------|
| `ALTER TABLE ADD COLUMN` on live DB with WAL | Low | SQLite WAL supports DDL online; pattern already used for other columns; guard is idempotent |
| Expanding `chain_catalyst` to include `urgent_news` changes card semantics | Low | `urgent_news` rows in live DB for FPT carry `cpi_pressure_risk`, `hot_money_risk`, `regime` — genuine macro context; frontend `MacroImpactPanel` already renders them correctly via `InfoCardExpand` |
| `is_correlation_stub` column absent on first request after deploy (before migration runs) | Mitigated | Belt-and-suspenders `NOT (signal_type='verified_decision' AND empty payload)` filter handles pre-migration rows |
| `purge-test-fixture-signals.ts` deletes a real row if payload ever matched | Very low | LIKE + `signal_type` + `finding_data='{}'` triple guard prevents it; `--dry-run` confirms 2 rows before `--live` |
| C-08 correlation audit broken by `is_correlation_stub=1` rows | None | C-08 query joins `ON a.id = s.alert_id` — the alert_id column still populated correctly; C-08 does not check `is_correlation_stub` |

---

## 8. Build Standard

- Zone: `apps/mcp-server/` (single zone)
- BUILD-STANDARD: **not-applicable** (bug-fix + refactor, no new primitives, no new service)
- No new MCP tools, no new routes, no new DB tables. Schema evolution via `ADD COLUMN` only.
- Rebuild required: **mcp-server container only** (COPY-baked src — force-recreate without --build ships nothing; use `docker compose up -d --build mcp-server`).

---

## [Architect] Brownfield Findings

- **Zone:** `apps/mcp-server/`
- **Verified paths:**
  - `apps/mcp-server/src/interface/mcp/routes/stockSignalsHandler.ts:98-186` — `querySignalsForStock`, no type param, no stub filter
  - `apps/mcp-server/src/interface/mcp/server.ts:1329-1373` — route handler, extracts `limit` but NOT `type` param
  - `apps/mcp-server/src/infrastructure/db/alertStore.ts:89-147,165-207` — `storeAlerts`/`storeAlertsFromCommander`, writes empty `verified_decision` rows
  - `apps/frontend/app/routes/dashboard.analysis.tsx:730-799` — `MacroImpactPanel`, already correct
  - `apps/frontend/app/components/InfoCardExpand.tsx:100-145` — `FindingDataPanel`, already correct
  - `apps/frontend/app/lib/api/client.ts:593-609` — `fetchCascadeSignals`, requests `?type=chain_catalyst`, already correct
  - `apps/mcp-server/src/__tests__/FIX-SIGNALS-STOCK-FULL-DETAIL.test.ts` — existing test file to extend
- **Reuse patterns:**
  - Schema evolution probe pattern (lines 104-114 of stockSignalsHandler.ts) — extend same pattern for `is_correlation_stub`
  - Existing `signalTypes` filter pattern in `getSignals()` (agentSignalStore.ts) — mirror the same SQL IN-list construction in `querySignalsForStock`
- **Scan clean:** true — no new interfaces, no DDD violations, no security surface (read-only query change + write marker)
- **Isolation:** sequential dispatch (alertStore and stockSignalsHandler changes share server.ts import graph)
