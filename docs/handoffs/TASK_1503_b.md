# Task Context — 1503_b: GREEN — schema + store + server + domain + scheduler

## TLDR (read this first)
change: 5 files modified — schema.ts:1109-1121, vnstockStore.ts:373, server.ts:691-710, assembleEveningSummary.ts:79-139+504-510, eveningSummaryJob.ts:199-208+291-297
test: `src/__tests__/1503-ohlcv-foreign-flow.test.ts` — 5 assertions must go GREEN
branch: task/1503b-ohlcv-foreign-flow-green
depends: 1503_a ✓

knowledge_needed: [bundle-developer]

---

sprint: 190
branch: task/1503b-ohlcv-foreign-flow-green
status: todo
req_ref: REQ-190
tech_ref: TECH-190

---

## [PM] Planning Context

layer: infrastructure + application + interface + scheduler
depends_on: [1503_a ✓ merged]

files_to_read:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts`   # lines 1109-1122: daily_ohlcv DDL + migration location
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/vnstockStore.ts`   # line ~373: insert writeForeignFlowToOhlcv after upsertForeignFlow
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/server.ts`   # lines 691-710: push-foreign-flow handler wiring
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/assembleEveningSummary.ts`   # lines 79-139, 504-510: ForeignFlowMover type + Step 4b query
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/eveningSummaryJob.ts`   # lines 199-208, 291-297: hasContent guard + formatter block

files_to_modify:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts`   # MODIFY: +4 nullable cols in CREATE TABLE + 4 ALTER TABLE migrations
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/vnstockStore.ts`   # MODIFY: add WriteForeignFlowItem interface + writeForeignFlowToOhlcv fn
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/server.ts`   # MODIFY: push-foreign-flow calls writeForeignFlowToOhlcv after upsertForeignFlow
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/assembleEveningSummary.ts`   # MODIFY: ForeignFlowMover export + foreignFlowMovers field + Step 4b query + injectable fn
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/eveningSummaryJob.ts`   # MODIFY: hasContent guard + "Khối ngoại" formatter block

test_file: src/__tests__/1503-ohlcv-foreign-flow.test.ts

## Key implementation details (from TECH-190)

### schema.ts — 4 nullable REAL cols + ALTER migrations
```sql
foreign_buy_vol   REAL,
foreign_sell_vol  REAL,
foreign_net_vol   REAL,
put_through_vol   REAL,
```
Migration (after CREATE INDEX):
```sql
ALTER TABLE daily_ohlcv ADD COLUMN IF NOT EXISTS foreign_buy_vol  REAL;
ALTER TABLE daily_ohlcv ADD COLUMN IF NOT EXISTS foreign_sell_vol REAL;
ALTER TABLE daily_ohlcv ADD COLUMN IF NOT EXISTS foreign_net_vol  REAL;
ALTER TABLE daily_ohlcv ADD COLUMN IF NOT EXISTS put_through_vol  REAL;
```

### vnstockStore.ts — writeForeignFlowToOhlcv
Strategy: UPDATE only (no INSERT). `foreign_net_vol = foreignBuyVol - foreignSellVol` computed at write time.
Returns `db.prepare(...).run(...).changes`.

### server.ts — push-foreign-flow wiring
After `upsertForeignFlow(items)`: extract `putThroughVol` from raw payload (`?? 0`), build `WriteForeignFlowItem[]`, call `writeForeignFlowToOhlcv(ohlcvItems)`, log result count.

### assembleEveningSummary.ts — Step 4b query
```sql
SELECT code, foreign_net_vol, foreign_buy_vol, foreign_sell_vol
FROM daily_ohlcv
WHERE date = (SELECT MAX(date) FROM daily_ohlcv)
  AND foreign_net_vol IS NOT NULL
ORDER BY ABS(foreign_net_vol) DESC
LIMIT 5
```
Empty result → `foreignFlowMovers: []`.

### eveningSummaryJob.ts — formatter
- hasContent guard: add `|| (summary.foreignFlowMovers?.length ?? 0) > 0`
- Vol formatting: divide by 1000, `toFixed(3)`, suffix "k"
- Direction: `foreignNetVol >= 0` → "mua ròng" else "bán ròng"

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/ohlcvForeignFlowStore.ts   # NEW: writeForeignFlowToOhlcv — UPDATE-only, computes net_vol = buy - sell
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts   # +4 nullable cols in daily_ohlcv DDL + export migrateForeignFlowColumns
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/server.ts   # push-foreign-flow handler calls writeForeignFlowToOhlcv after upsertForeignFlow
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/assembleEveningSummary.ts   # ForeignFlowMover type + foreignFlowMovers? field + Step 4b query + getForeignFlowMoversFn injectable
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/eveningSummaryJob.ts   # export formatForeignFlowSection + hasContent guard + Khoi ngoai block
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1385-evening-summary-news-filler.test.ts   # add foreignFlowMovers: [] to base fixture for exactOptionalPropertyTypes compat

tests_written:
- src/__tests__/1503-ohlcv-foreign-flow.test.ts   # 5 assertions, all GREEN

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # pre-existing failures: 1168/239/217 — unrelated to this task

---

## Acceptance Criteria

**Given** task 1503_a test file exists with 5 RED assertions
**When** all implementation changes are applied and `bun test src/__tests__/1503-ohlcv-foreign-flow.test.ts` is run
**Then**
- All 5 assertions pass (GREEN)
- `bun tsc --noEmit` shows 0 errors
- `writeForeignFlowToOhlcv` with no matching OHLCV row returns 0 (no stub rows inserted)
- `foreignFlowMovers` field present on `EveningSummary` type
- Existing tests unaffected (`bun test` full suite passes)
