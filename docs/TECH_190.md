# TECH-190: feat(ohlcv-foreign-flow) — foreign buy/sell/net/put-through vol in daily_ohlcv + evening digest

status: APPROVED_BY_ARCHITECT
req_ref: REQ-190

## Brownfield Impact

- Files modified: 5
- Files created: 1 (test)
- Files deleted: 0
- Breaking changes: no — all 4 new cols nullable, existing rows untouched

## Architecture Decision

Pipe VPS foreign-flow payload into `daily_ohlcv` via an update-only store function (`writeForeignFlowToOhlcv`) that fires after the existing `upsertForeignFlow` call inside the `push-foreign-flow` handler. This avoids stub rows (FR-2 decision: skip when no OHLCV row), keeps net_vol computed at write time, and lets the application layer query a single table for the evening digest — no join required.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| daily_ohlcv DDL +4 cols + ALTER migration | infrastructure | `src/infrastructure/db/schema.ts:1109-1121` | MODIFY |
| `writeForeignFlowToOhlcv` store fn | infrastructure | `src/infrastructure/db/vnstockStore.ts:373` | MODIFY (insert after `upsertForeignFlow`) |
| push-foreign-flow endpoint wiring | interface | `src/interface/mcp/server.ts:691-710` | MODIFY |
| `ForeignFlowMover` interface + `foreignFlowMovers` field on `EveningSummary` | application | `src/application/usecases/assembleEveningSummary.ts:79-110` | MODIFY |
| `AssembleEveningSummaryOptions.getForeignFlowMoversFn` injectable | application | `src/application/usecases/assembleEveningSummary.ts:121-139` | MODIFY |
| foreignFlowMovers Step 4b query block | application | `src/application/usecases/assembleEveningSummary.ts:504-510` (after TA step) | MODIFY |
| "Khối ngoại" Telegram formatter + hasContent guard | interface/scheduler | `src/scheduler/eveningSummaryJob.ts:199-208, 291-297` | MODIFY |
| TDD test file | test | `src/__tests__/1503-ohlcv-foreign-flow.test.ts` | NEW |

## Interface Contracts

### New type (export from assembleEveningSummary.ts, above `EveningSummary`)

```typescript
export interface ForeignFlowMover {
  code: string;
  foreignNetVol: number;   // positive = net buy, negative = net sell
  foreignBuyVol: number;
  foreignSellVol: number;
}
```

### EveningSummary extension (add after `portfolioPnl?` field, line ~109)

```typescript
/** Top 5 stocks by |foreign_net_vol| for latest trading day. Empty when no data. */
foreignFlowMovers: ForeignFlowMover[];
```

### AssembleEveningSummaryOptions extension (add after `getPnlFn?`, line ~138)

```typescript
/** Injectable for tests — avoids real DB query for foreign flow movers */
getForeignFlowMoversFn?: (db: Database) => ForeignFlowMover[];
```

### New store function signature (insert before upsertForeignFlow or after, at line 373)

```typescript
export interface WriteForeignFlowItem {
  code: string;
  date: string;
  foreignBuyVol: number;
  foreignSellVol: number;
  putThroughVol: number;   // 0 when absent from payload
}

export function writeForeignFlowToOhlcv(
  items: WriteForeignFlowItem[],
  db?: ReturnType<typeof getDb>,
): number
```

Strategy: `UPDATE daily_ohlcv SET foreign_buy_vol=?, foreign_sell_vol=?, foreign_net_vol=?, put_through_vol=? WHERE code=? AND date=?` — no INSERT, no CONFLICT clause. Returns count of rows actually changed (via `changes`).

### Schema changes (schema.ts)

DDL addition inside CREATE TABLE block (lines 1110-1118):
```sql
foreign_buy_vol   REAL,
foreign_sell_vol  REAL,
foreign_net_vol   REAL,
put_through_vol   REAL,
```

Migration (after `CREATE INDEX`, line 1122):
```sql
ALTER TABLE daily_ohlcv ADD COLUMN IF NOT EXISTS foreign_buy_vol  REAL;
ALTER TABLE daily_ohlcv ADD COLUMN IF NOT EXISTS foreign_sell_vol REAL;
ALTER TABLE daily_ohlcv ADD COLUMN IF NOT EXISTS foreign_net_vol  REAL;
ALTER TABLE daily_ohlcv ADD COLUMN IF NOT EXISTS put_through_vol  REAL;
```

### server.ts changes (lines 691-710)

After mapping `items: ForeignFlowUpsertItem[]` and calling `upsertForeignFlow(items)`:
1. Extract `putThroughVol` from raw payload (`raw.putThroughVol ?? 0`)
2. Build `WriteForeignFlowItem[]` (code, date, foreignBuyVol, foreignSellVol, putThroughVol)
3. Call `writeForeignFlowToOhlcv(ohlcvItems)` — result logged, not surfaced in response body

### assembleEveningSummary query (Step 4b, insert after TA block ~line 508)

```sql
SELECT code, foreign_net_vol, foreign_buy_vol, foreign_sell_vol
FROM daily_ohlcv
WHERE date = (SELECT MAX(date) FROM daily_ohlcv)
  AND foreign_net_vol IS NOT NULL
ORDER BY ABS(foreign_net_vol) DESC
LIMIT 5
```

Empty result → `foreignFlowMovers: []` (no crash).

### eveningSummaryJob.ts changes

**hasContent guard** — add `|| (summary.foreignFlowMovers?.length ?? 0) > 0` to existing OR-chain (line ~207).

**Formatter block** (insert after portfolioPnl block, before `await doSend`):
```typescript
// ── Khối ngoại (task 1503) ─────────────────────────────────────
if ((summary.foreignFlowMovers ?? []).length > 0) {
  lines.push("");
  lines.push(`Khối ngoại (${summary.foreignFlowMovers.length} cp):`);
  for (const m of summary.foreignFlowMovers) {
    const direction = m.foreignNetVol >= 0 ? "mua ròng" : "bán ròng";
    const sign = m.foreignNetVol >= 0 ? "+" : "";
    const net  = (m.foreignNetVol / 1000).toFixed(3).replace(".", ".");
    const buy  = (m.foreignBuyVol  / 1000).toFixed(3);
    const sell = (m.foreignSellVol / 1000).toFixed(3);
    lines.push(`  ${m.code}: ${direction} ${sign}${net}k (B:${buy}k / S:${sell}k)`);
  }
}
```

Vol formatting: divide by 1000, `toFixed(3)`, suffix "k" → `12.350k`.

## Task Breakdown

| Task | Phase | Depends on |
|------|-------|------------|
| 1503a | RED — 5 failing assertions in `1503-ohlcv-foreign-flow.test.ts` | — |
| 1503b | GREEN — schema + store fn + server wiring + application query + scheduler formatter | 1503a |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| SQLite 3.37+ `ADD COLUMN IF NOT EXISTS` not available | Low | High | Bun ships libsql 3.44+; verify with `PRAGMA compile_options` in test |
| `writeForeignFlowToOhlcv` fires before price push → 0 rows updated | Medium | Low | Expected behavior per FR-2; log count for observability |
| `foreignFlowMovers` field absent on old persisted JSON reports | Low | Low | Field typed as `ForeignFlowMover[]`, add `?? []` fallback in formatter |
| `foreign_net_vol = 0` (equal buy/sell) → section renders all zeros | Low | Low | Valid signal per REQ edge-case doc; no mitigation needed |

## Security Review

- SQL parameterized: yes — UPDATE uses `?` bindings, no string interpolation
- File paths validated: n/a (no new file I/O paths)
- External HTTP rate-limited: n/a (no new outbound HTTP)
- Secrets via Bun.env only: yes
