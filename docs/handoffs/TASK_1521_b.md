# Task Context — 1521_b: GREEN — fix test-drift + implement formatGlobalSnapshotSection

## TLDR
change: morningBriefingJob.ts (stub → real impl) + 6 test files (daily_ohlcv seed drift fix)
test: 30 currently-failing assertions must turn GREEN
branch: task/1521b-test-drift-fix
depends: 1521_a ✓ (audit done)
knowledge_needed: [bundle-developer]

---

sprint: 192
branch: task/1521b-test-drift-fix
status: todo
baseline_pass: 5731

---

## Root Causes (confirmed)

| Cluster | Files | Count | Cause |
|---------|-------|-------|-------|
| A | 1133-foreign-flow-alert-job.test.ts | 12 | Seeds `vnstock_trading_stats`; prod reads `daily_ohlcv.foreign_net_vol` |
| B | 1134-get-foreign-flow-tool.test.ts | 5 | Same — no `daily_ohlcv` table |
| C | 1290-france-summary-job.test.ts | 3 | Seeds `market_prices`; prod reads `daily_ohlcv` for movers |
| D | 1344-france-summary-stale-alerts.test.ts | 3 | Same |
| E | 1364-france-ta-detail.test.ts | 1 | `daily_ohlcv` exists but no `foreign_net_vol` col + seeds `market_prices` mover |
| F | 1450-france-summary-vnindex.test.ts | 1 | Seeds `market_prices_history`; prod reads `daily_ohlcv` |
| G | 1512-evening-global-snapshot.test.ts | 2 | `formatGlobalSnapshotSection` stub returns `[]` |
| H | 1513-france-summary-global-snapshot.test.ts | 3 | Same stub → `formatFranceSummaryVI` renders empty global section |

**NOT to fix:** 1511 (5 intentional RED — Sprint 188 pending), Task 125 (pre-existing E2E)

---

## Changes

### 1. morningBriefingJob.ts — implement formatGlobalSnapshotSection

File: `src/scheduler/morningBriefingJob.ts:47-51`

Replace:
```typescript
export function formatGlobalSnapshotSection(
  _snap: { vix: number; dxy: number; sp500: number; hangSeng: number; fetchedAt: string }
): string[] {
  return []; // stub — RED
}
```

With real implementation returning `string[]`:
```typescript
export function formatGlobalSnapshotSection(
  snap: { vix: number; dxy: number; sp500: number; hangSeng: number; fetchedAt: string }
): string[] {
  return [
    "🌐 Thị trường toàn cầu:",
    `  VIX: ${snap.vix.toFixed(2)}`,
    `  DXY: ${snap.dxy.toFixed(2)}`,
    `  S&P500: ${snap.sp500.toFixed(0)}`,
    `  Hang Seng: ${snap.hangSeng.toFixed(0)}`,
  ];
}
```

This immediately fixes clusters G + H (1512 AC-4/AC-5, 1513 AC-3/AC-5/AC-6) since `eveningSummaryJob.ts:248-250` and `franceSummaryJob.ts:364-365` already call this function.

### 2. Clusters A + B — 1133 + 1134 test seed fix

`src/__tests__/1133-foreign-flow-alert-job.test.ts`:
- In `makeDb()`: replace `vnstock_trading_stats` CREATE with `daily_ohlcv` CREATE including `foreign_net_vol REAL DEFAULT 0`
- Replace `seedForeignFlow()` helper: insert into `daily_ohlcv` rows with `foreign_net_vol = dailyDelta` per day (net_vol per day, not cumulative — the production code does the cumsum)
- Update all test `describe` blocks: calls to `seedForeignFlow` remain same signature if helper updated
- Remove `vnstock_trading_stats` INSERT stmts from individual tests

`src/__tests__/1134-get-foreign-flow-tool.test.ts`:
- In `buildInMemoryDb()`: replace `vnstock_trading_stats` CREATE with `daily_ohlcv` CREATE (include `foreign_net_vol REAL DEFAULT 0`)
- Replace `seedHighBuySignal()`: insert `daily_ohlcv` rows with `foreign_net_vol = dailyBuy` each row (net per day)
- Replace `seedInsufficientData()`: same pattern with < 2 rows
- Replace `seedZeroData()`: insert `daily_ohlcv` rows with `foreign_net_vol = 0`

### 3. Clusters C + D + E + F — france-summary test seed fixes

`src/__tests__/1290-france-summary-job.test.ts`:
- `makeDb()` already has `daily_ohlcv` — add `foreign_net_vol REAL DEFAULT 0` column
- Tests seeding `market_prices` + `market_prices_history` for movers: also INSERT into `daily_ohlcv` with `change_pct`-equivalent data. Use `open`/`close` to imply pct: e.g. open=85000, close=88000 for +3.5%
- `runFranceSummary` reads `daily_ohlcv` for movers — ensure `|close-open|/open >= 0.01` (1%) for mover to appear

`src/__tests__/1344-france-summary-stale-alerts.test.ts`:
- Check if `daily_ohlcv` table exists in makeDb — add if missing (with `foreign_net_vol`)
- Seed `daily_ohlcv` mover for tests that expect `sent: true`

`src/__tests__/1364-france-ta-detail.test.ts`:
- `makeDb()` has `daily_ohlcv` without `foreign_net_vol` — add column
- AC-4 seeds `market_prices` mover: also seed `daily_ohlcv` row with clear price move (open≠close ≥1%)

`src/__tests__/1450-france-summary-vnindex.test.ts`:
- `setupTestDb()` has `daily_ohlcv` without `foreign_net_vol` — add column
- Test at line 151-175: seeds `market_prices_history` for mover — also seed `daily_ohlcv` mover row

---

## How franceSummaryJob detects movers (after Fix 205)

```sql
SELECT w.code, o.open, o.close,
       ROUND((o.close - o.open) / o.open * 100, 2) AS change_pct
FROM daily_ohlcv o
JOIN watchlist w ON w.code = o.code
WHERE o.date = (SELECT MAX(date) FROM daily_ohlcv)
  AND ABS((o.close - o.open) / o.open * 100) >= 1.0
ORDER BY ABS((o.close - o.open) / o.open * 100) DESC
LIMIT 10
```

So test seeds must: INSERT `daily_ohlcv` rows where `|close - open| / open >= 0.01`.

---

## Acceptance Criteria

- `bun test` full suite: ≥5761 pass, ≤7 fail (1511×5 + Task125×1 remain)
- Targeted runs:
  - `bun test ./src/__tests__/1133-foreign-flow-alert-job.test.ts` → 12 pass / 0 fail
  - `bun test ./src/__tests__/1134-get-foreign-flow-tool.test.ts` → 5 pass / 0 fail
  - `bun test ./src/__tests__/1290-france-summary-job.test.ts` → all pass
  - `bun test ./src/__tests__/1344-france-summary-stale-alerts.test.ts` → all pass
  - `bun test ./src/__tests__/1364-france-ta-detail.test.ts` → all pass
  - `bun test ./src/__tests__/1512-evening-global-snapshot.test.ts` → all pass
  - `bun test ./src/__tests__/1513-france-summary-global-snapshot.test.ts` → all pass
- `bun tsc --noEmit` → 0 errors
- DDD: no domain/ importing infrastructure/ (no new cross-layer imports)
- Security: no string interpolation in SQL, parameterized bindings only

## Files to read before coding

- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/foreignFlowAlertJob.ts:78-116` — exact `daily_ohlcv` query (net_vol per day, cumsum in app layer)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/foreignFlowTools.ts:145-160` — get_foreign_flow tool query
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/franceSummaryJob.ts:154-201` — movers query from daily_ohlcv
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/morningBriefingJob.ts:47-51` — stub to replace
