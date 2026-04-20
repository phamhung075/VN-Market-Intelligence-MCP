# TECH-206: fix(test-drift+global-snapshot)

status: APPROVED_BY_ARCHITECT
req_ref: REQ-206

---

## Brownfield Impact

- Files modified: 1 production + 6 test
- Files created: 0
- Files deleted: 0
- Breaking changes: no

| File | Change |
|------|--------|
| `src/scheduler/morningBriefingJob.ts` | Replace 5-line stub body at :47-51 |
| `src/__tests__/1133-foreign-flow-alert-job.test.ts` | Replace `vnstock_trading_stats` DDL + `seedForeignFlow` helper |
| `src/__tests__/1134-get-foreign-flow-tool.test.ts` | Replace `vnstock_trading_stats` DDL + seed helpers |
| `src/__tests__/1290-france-summary-job.test.ts` | Add `foreign_net_vol REAL` to `daily_ohlcv` CREATE |
| `src/__tests__/1344-france-summary-stale-alerts.test.ts` | Add `foreign_net_vol REAL` to `daily_ohlcv` CREATE |
| `src/__tests__/1364-france-ta-detail.test.ts` | Add `foreign_net_vol REAL` to `daily_ohlcv` CREATE |
| `src/__tests__/1450-france-summary-vnindex.test.ts` | Add `foreign_net_vol REAL` to `daily_ohlcv` CREATE |

## Architecture Decision

Two independent failure clusters exist: (1) `formatGlobalSnapshotSection` returns `[]` unconditionally — a stub left from task 1511a RED phase, causing silent absence of global snapshot in all digests; (2) six test files seed `vnstock_trading_stats` or use `daily_ohlcv` without `foreign_net_vol`, while production queries `daily_ohlcv.foreign_net_vol` since sprints 1517b/1518b. Fix (1) by implementing the real formatter in-place following `formatCommoditiesSection` style. Fix (2) by updating DDL-only test scaffolding — no production logic changes.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| `formatGlobalSnapshotSection` | interface/scheduler | `src/scheduler/morningBriefingJob.ts:47-51` | MODIFY (stub → impl) |
| 1133 `makeDb` + `seedForeignFlow` | test | `src/__tests__/1133-foreign-flow-alert-job.test.ts:30-152` | MODIFY |
| 1134 `buildInMemoryDb` + seed helpers | test | `src/__tests__/1134-get-foreign-flow-tool.test.ts:26-77` | MODIFY |
| 1290 `makeDb` daily_ohlcv DDL | test | `src/__tests__/1290-france-summary-job.test.ts:43-49` | MODIFY |
| 1344 `makeDb` daily_ohlcv DDL | test | `src/__tests__/1344-france-summary-stale-alerts.test.ts:46-52` | MODIFY |
| 1364 `makeDb` daily_ohlcv DDL | test | `src/__tests__/1364-france-ta-detail.test.ts:110-121` | MODIFY |
| 1450 inline DDL | test | `src/__tests__/1450-france-summary-vnindex.test.ts:47-51` | MODIFY |

## Interface Contracts

### formatGlobalSnapshotSection — final signature (no change, stub → real body)

```typescript
// src/scheduler/morningBriefingJob.ts:47-51
export function formatGlobalSnapshotSection(
  snap: { vix: number; dxy: number; sp500: number; hangSeng: number; fetchedAt: string }
): string[] {
  // real impl — see 1521a handoff
}
```

Output contract:
- `snap == null/undefined` → `[]` (guard at call sites; function itself receives typed arg)
- Otherwise: `string[]` length 5 — header + 4 metric lines
- Label format: matches `formatCommoditiesSection` indentation (`"  KEY: value"`)

### Canonical daily_ohlcv DDL for test files (FR-2 / FR-3 pattern)

```sql
CREATE TABLE daily_ohlcv (
  code          TEXT NOT NULL,
  date          TEXT NOT NULL,
  open          REAL,
  high          REAL,
  low           REAL,
  close         REAL,
  volume        REAL,
  foreign_buy_vol  REAL,
  foreign_sell_vol REAL,
  foreign_net_vol  REAL,
  put_through_vol  REAL,
  PRIMARY KEY (code, date)
)
```
Reference: `src/__tests__/1517-foreign-flow-alert-ohlcv-source.test.ts:66-80` (GREEN).

For tests that don't exercise foreign buy/sell/put-through (FR-4 through FR-7), minimal addition is only `foreign_net_vol REAL` to the existing DDL.

### Seed pattern for HIGH signal (FR-2 / FR-3)

Production query in `foreignFlowAlertJob.ts:84-99`:
```sql
SELECT code, date, COALESCE(foreign_net_vol, 0) AS net_vol
FROM daily_ohlcv WHERE code = ? ORDER BY date ASC LIMIT ?
```
Threshold: cumulative `foreign_net_vol` over 5 days must exceed HIGH threshold. Reference seed: 3+ days of `foreign_net_vol = 150_000` per row (confirmed from 1517 GREEN seed at lines 88-104). Each row represents one day's net flow directly (not cumulative in DB — `COALESCE` is sum in app logic).

## Task Breakdown

| Task | Title | Depends on | Layer |
|------|-------|------------|-------|
| 1521a | Production fix: `formatGlobalSnapshotSection` real impl | none | interface/scheduler |
| 1521b | Test-drift batch: 6 test files — daily_ohlcv seeds + foreign_net_vol col | none | test |

Both tasks have no inter-dependency — parallel execution safe.

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `formatGlobalSnapshotSection` zero-value fields suppressed | Low | Medium | Edge case in REQ-206: `dxy: 0` must still render — use string template, no truthiness guard |
| 1290 mover assertions break after daily_ohlcv seed change | Medium | Low | REQ-206 edge case note: keep `market_prices` seeds for fallback-path tests; only add `foreign_net_vol` column |
| 1133 seed produces cumulative < HIGH threshold | Medium | Medium | Mirror 1517 pattern exactly: 3 days × 150_000 net_vol; verify threshold constant in `foreignFlowAlertJob.ts` before seeding |
| tsc error if null check removed from call sites | Low | High | 1521a must verify `eveningSummaryJob` + `franceSummaryJob` call sites pass typed non-null snapshot |

## Security Review

- SQL parameterized: yes (no new queries)
- File paths validated: n/a
- External HTTP: n/a
- Secrets via Bun.env: n/a
