# TASK 1450b — GREEN: implement VN-Index snapshot in france-summary

sprint: 165
phase: GREEN
depends: TASK_1450a (RED must pass first)

## Brownfield verification (pre-confirmed)

Adjacent lines verified (do NOT re-scan):
- Line 42: `FranceSummaryResult` interface — add `vnIndex` field
- Line 54: `FranceSummaryOptions` interface — add `fetchVnIndexFn` optional field
- Line 322: `formatFranceSummaryVI` signature + Section 0 block
- Line 403: `runFranceSummary` body — fetch vnIndex, update silent-skip guard

Import source: `VnIndexSnapshot` already exported from `src/application/usecases/assembleEveningSummary.ts`.

## Changes — 1 file only

### `src/scheduler/franceSummaryJob.ts`

#### 1. Add import (top of file, after existing imports)

```typescript
import type { VnIndexSnapshot } from "../application/usecases/assembleEveningSummary.js"
```

#### 2. Extend `FranceSummaryResult` (line 42 block)

```typescript
export interface FranceSummaryResult {
  sent: boolean
  moverCount: number
  alertCount: number
  taSignals: TaSignalRow[]
  /** VN-Index snapshot included in digest, or null if unavailable. */
  vnIndex: VnIndexSnapshot | null
}
```

#### 3. Extend `FranceSummaryOptions` (line 54 block, after `getPnlFn`)

```typescript
  /**
   * Injectable VN-Index fetch fn for TDD.
   * Defaults to querying market_prices WHERE code = 'VNINDEX'.
   * Return null to skip the VN-Index block.
   */
  fetchVnIndexFn?: () => Promise<VnIndexSnapshot | null>
```

#### 4. Extend `formatFranceSummaryVI` signature (line 322) — add 6th param

```typescript
export function formatFranceSummaryVI(
  dateStr: string,
  movers: MoverRow[],
  alerts: AlertRow[],
  taSignals: TaSignalRow[] | number,
  portfolioPnl?: PortfolioPnlResult | null,
  vnIndex?: VnIndexSnapshot | null,
): string {
```

#### 5. Add Section 0 block inside `formatFranceSummaryVI` (before Section 1 — movers)

Insert immediately after `const blocks: string[] = []`:

```typescript
  // Section 0: VN-Index close — always first block when present
  if (vnIndex != null) {
    const closeFmt = Math.round(vnIndex.close).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    const chSign = vnIndex.change >= 0 ? "+" : ""
    const pctSign = vnIndex.changePct >= 0 ? "+" : ""
    blocks.push(
      `VN-Index: ${closeFmt} (${chSign}${Math.round(vnIndex.change)} / ${pctSign}${vnIndex.changePct.toFixed(2)}%)`,
    )
  }
```

**Format spec**: `VN-Index: 1.285 (+12 / +0.94%)` — dot-thousands, signed point change, signed pct to 2dp. Matches evening summary pattern (`eveningSummaryJob.ts:234`).

#### 6. Fetch vnIndex in `runFranceSummary` (after `// Resolve clock` block, before movers fetch)

```typescript
  // ── VN-Index snapshot (best-effort, injectable via fetchVnIndexFn) ─────────
  let vnIndex: VnIndexSnapshot | null = null
  try {
    if (opts.fetchVnIndexFn) {
      vnIndex = await opts.fetchVnIndexFn()
    } else {
      // Default: query market_prices for VNINDEX ticker
      interface VnIndexRow { price: number; change_pct: number; fetched_at: string }
      const row = resolvedDb
        .prepare<VnIndexRow, []>(
          `SELECT price, change_pct, fetched_at FROM market_prices WHERE code = 'VNINDEX' LIMIT 1`,
        )
        .get()
      if (row) {
        vnIndex = {
          close: row.price,
          change: Math.round(row.price * (row.change_pct / 100) / (1 + row.change_pct / 100)),
          changePct: row.change_pct,
          fetchedAt: row.fetched_at,
        }
      }
    }
  } catch (err) {
    logger.warn("[franceSummaryJob] fetchVnIndexFn failed — skipping VN-Index block", {
      error: err instanceof Error ? err.message : String(err),
    })
    vnIndex = null
  }
```

#### 7. Update silent-skip guard (line 485 area)

```typescript
  const hasPnl = portfolioPnl != null && portfolioPnl.items.length > 0

  // Silent skip when all sources are empty (including vnIndex)
  if (
    movers.length === 0 &&
    alerts.length === 0 &&
    taSignals.length === 0 &&
    !hasPnl &&
    vnIndex == null
  ) {
    return { sent: false, moverCount: 0, alertCount: 0, taSignals: [], vnIndex: null }
  }
```

#### 8. Update `formatFranceSummaryVI` call + return values

Call site (line 490 area):
```typescript
  const message = formatFranceSummaryVI(dateStr, movers, alerts, taSignals, portfolioPnl, vnIndex)
```

Return values — add `vnIndex` to both return paths:
```typescript
  // success path:
  return { sent: true, moverCount: movers.length, alertCount: alerts.length, taSignals, vnIndex }
  // error path:
  return { sent: false, moverCount: movers.length, alertCount: alerts.length, taSignals, vnIndex }
```

Also update the dedup-guard early return:
```typescript
  if (alreadySentToday(resolvedDb)) {
    return { sent: false, moverCount: 0, alertCount: 0, taSignals: [], vnIndex: null }
  }
```

## market_prices table note

Default path queries `market_prices` (not `market_prices_history`) — same table used by morning briefing for VNINDEX. No schema change needed.

## Acceptance criteria

| # | Check |
|---|-------|
| a1 | `formatFranceSummaryVI(..., MOCK_VN_INDEX)` → contains "VN-Index" + "1.285" |
| a2 | `runFranceSummary({ fetchVnIndexFn })` → sent message contains "VN-Index" |
| a3 | VN-Index block position < movers block position in output |
| b1 | All empty + `fetchVnIndexFn: null` → `result.sent === false` |
| c1 | `formatFranceSummaryVI(..., null)` → does NOT contain "VN-Index" |
| c2 | `runFranceSummary({ fetchVnIndexFn: null })` with movers seeded → no VN-Index in output |
| TS | `bun tsc --noEmit` passes |
| suite | `bun test` full suite green |

## Run order

```bash
# 1. RED — confirm failures
bun test src/__tests__/1450-france-summary-vnindex.test.ts

# 2. Implement changes above

# 3. GREEN — all pass
bun test src/__tests__/1450-france-summary-vnindex.test.ts

# 4. Full suite
bun test && bun tsc --noEmit
```

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/franceSummaryJob.ts   # added VnIndexSnapshot import, fetchVnIndexFn option, vnIndex field on result, Section 0 block in formatter, fetch + silent-skip + return updates
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1364-france-ta-detail.test.ts   # catch-block fallback: added vnIndex: null
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1370-france-watchlist-movers.test.ts   # catch-block fallbacks (2): added vnIndex: null

tests_written:
- src/__tests__/1450-france-summary-vnindex.test.ts   # 6 assertions, all GREEN (written in RED phase 1450a)

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # 5497 pass, 0 fail

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/franceSummaryJob.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1364-france-ta-detail.test.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1370-france-watchlist-movers.test.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1450-france-summary-vnindex.test.ts

merge_commit: 599fcce
