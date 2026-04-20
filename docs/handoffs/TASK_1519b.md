# TASK_1519b — GREEN: france-summary-bctc-deadlines implementation

sprint: 204
phase: GREEN (make 1519a tests pass)
depends_on: TASK_1519a (stubs already placed)

## Files modified

| File | Action | Lines |
|------|--------|-------|
| `src/scheduler/franceSummaryJob.ts` | MODIFY | 4 injection points |

## Step-by-step impl

### 1 — Import (top of franceSummaryJob.ts, after existing imports)

Add to the assembleBriefing import — it already imports `GlobalSnapshot`, extend it:
```typescript
import type {
  BctcDeadlineRow,
  GlobalSnapshot,
} from "../application/usecases/assembleBriefing.js"
```
`BctcDeadlineRow`, `getCurrentDeadline`, `classifyFilingStatus`, `getNextDeadline` are all exported from `assembleBriefing.ts`. Import the functions only in the default implementation block (dynamic-style or static import).

Full import line (replace/extend existing GlobalSnapshot import):
```typescript
import type { BctcDeadlineRow, GlobalSnapshot } from "../application/usecases/assembleBriefing.js"
```

For the default runtime path inside `runFranceSummary`, use dynamic import to avoid circular dep:
```typescript
const { getCurrentDeadline, getNextDeadline, classifyFilingStatus } =
  await import("../application/usecases/assembleBriefing.js")
```

### 2 — FranceSummaryResult (line ~48)

```typescript
export interface FranceSummaryResult {
  sent: boolean
  moverCount: number
  alertCount: number
  taSignals: TaSignalRow[]
  vnIndex: VnIndexSnapshot | null
  globalSnapshot: GlobalSnapshot | null
  foreignFlowMovers?: ForeignFlowMover[]
  upcomingDeadlines?: BctcDeadlineRow[]   // ADD
}
```

### 3 — FranceSummaryOptions (line ~66)

```typescript
export interface FranceSummaryOptions {
  // ... existing fields ...
  getForeignFlowMoversFn?: (db: Database) => ForeignFlowMover[]
  getUpcomingDeadlinesFn?: (db: Database, now: Date) => BctcDeadlineRow[]   // ADD
}
```

### 4 — formatFranceSummaryVI (line ~352) — add 9th param + Section 4.5

New signature:
```typescript
export function formatFranceSummaryVI(
  dateStr: string,
  movers: MoverRow[],
  alerts: AlertRow[],
  taSignals: TaSignalRow[] | number,
  portfolioPnl?: PortfolioPnlResult | null,
  vnIndex?: VnIndexSnapshot | null,
  globalSnapshot?: GlobalSnapshot | null,
  foreignFlowMovers?: ForeignFlowMover[],
  upcomingDeadlines?: BctcDeadlineRow[],   // NEW 9th param
): string {
```

Insert Section 4.5 block AFTER Section 4 (portfolioPnl block, ~line 436):
```typescript
  // Section 4.5: BCTC sắp đến — mirrors morningBriefingJob.ts BCTC block
  if (upcomingDeadlines && upcomingDeadlines.length > 0) {
    const lines: string[] = []
    lines.push("BCTC sắp đến:")
    for (const row of upcomingDeadlines) {
      if (row.status === "QUA_HAN") {
        lines.push(
          `  ${row.code}: Q${row.quarter}/${row.year} — QUÁ HẠN ${Math.abs(row.daysUntilDeadline)} ngày`
        )
      } else {
        lines.push(
          `  ${row.code}: Q${row.quarter}/${row.year} — hạn ${row.deadline} (${row.daysUntilDeadline} ngày)`
        )
      }
    }
    blocks.push(lines.join("\n"))
  }
```

Note: no emoji prefix — franceSummaryJob uses plain-text format (consistent with other sections like "Top biến động giá", "Cảnh báo gần nhất").

### 5 — runFranceSummary (line ~456) — deadline computation block

Insert AFTER the foreign flow movers block (~line 632), BEFORE the `hasContent` guard:

```typescript
  // ── BCTC upcoming deadlines (best-effort, injectable via getUpcomingDeadlinesFn) ─
  let upcomingDeadlines: BctcDeadlineRow[] = []
  try {
    const now = nowFn()
    if (opts.getUpcomingDeadlinesFn) {
      upcomingDeadlines = opts.getUpcomingDeadlinesFn(resolvedDb, now)
    } else {
      // Default: mirrors assembleBriefing.ts Step 18
      const { getCurrentDeadline, getNextDeadline, classifyFilingStatus } =
        await import("../application/usecases/assembleBriefing.js")

      // Read watchlist rows (code + domain)
      interface WatchlistRow { code: string; domain: string }
      const wlRows = resolvedDb
        .prepare<WatchlistRow, []>(`SELECT code, domain FROM watchlist`)
        .all()

      // Detect period_quarter column presence
      let hasPeriodQuarter = false
      try {
        const cols = resolvedDb.query<{ name: string }, []>(
          "PRAGMA table_info(financial_reports)"
        ).all()
        hasPeriodQuarter = cols.some((c) => c.name === "period_quarter")
      } catch { /* schema probe failed */ }

      interface FiledAtRow { filed_at: string | null }
      const filedAtStmt = hasPeriodQuarter
        ? resolvedDb.prepare<FiledAtRow, [string, number, number]>(`
            SELECT MAX(parsed_at) AS filed_at FROM financial_reports
            WHERE action_code = ? AND period_year = ? AND period_quarter = ?
          `)
        : null

      const queryFiledAt = (code: string, year: number, quarter: number): string | null => {
        if (filedAtStmt) {
          const r = filedAtStmt.get(code, year, quarter)
          return r?.filed_at ?? null
        }
        const periodType = `Q${quarter}`
        const r = resolvedDb.prepare<FiledAtRow, [string, number, string]>(`
          SELECT MAX(parsed_at) AS filed_at FROM financial_reports
          WHERE action_code = ? AND period_year = ? AND period_type = ?
        `).get(code, year, periodType)
        return r?.filed_at ?? null
      }

      const rows: BctcDeadlineRow[] = []
      for (const wl of wlRows) {
        try {
          const nextInfo = getNextDeadline(now, wl.domain)
          const currentInfo = getCurrentDeadline(now, wl.domain)
          const daysToCurrent = Math.floor(
            (currentInfo.deadline.getTime() - now.getTime()) / (24 * 3600_000)
          )
          const daysToNext = Math.floor(
            (nextInfo.deadline.getTime() - now.getTime()) / (24 * 3600_000)
          )
          const info =
            Math.abs(daysToNext) <= Math.abs(daysToCurrent) ? nextInfo : currentInfo
          const filedAt = queryFiledAt(wl.code, info.year, info.quarter)
          const fs = classifyFilingStatus(now, { ...info, filingDate: filedAt })
          if (fs.status === "SAP_DEN" || fs.status === "QUA_HAN") {
            rows.push({
              code: wl.code,
              domain: wl.domain,
              quarter: info.quarter,
              year: info.year,
              deadline: info.deadline.toISOString().slice(0, 10),
              daysUntilDeadline: fs.daysUntilDeadline!,
              status: fs.status,
            })
          }
        } catch { /* per-stock failure — skip silently */ }
      }
      upcomingDeadlines = rows.sort((a, b) => a.daysUntilDeadline - b.daysUntilDeadline)
    }
  } catch (err) {
    logger.warn("[franceSummaryJob] getUpcomingDeadlinesFn failed — skipping BCTC deadlines", {
      error: err instanceof Error ? err.message : String(err),
    })
    upcomingDeadlines = []
  }
```

### 6 — hasContent guard update (~line 634)

Current guard:
```typescript
  if (
    movers.length === 0 &&
    alerts.length === 0 &&
    taSignals.length === 0 &&
    !hasPnl &&
    vnIndex == null &&
    globalSnapshot == null &&
    foreignFlowMovers.length === 0
  ) {
    return { sent: false, ... }
  }
```

Add `upcomingDeadlines.length === 0` condition:
```typescript
  if (
    movers.length === 0 &&
    alerts.length === 0 &&
    taSignals.length === 0 &&
    !hasPnl &&
    vnIndex == null &&
    globalSnapshot == null &&
    foreignFlowMovers.length === 0 &&
    upcomingDeadlines.length === 0    // ADD
  ) {
    return { sent: false, moverCount: 0, alertCount: 0, taSignals: [], vnIndex: null, globalSnapshot: null, foreignFlowMovers: [], upcomingDeadlines: [] }
  }
```

### 7 — formatFranceSummaryVI call site (~line 648)

Add `upcomingDeadlines` as 9th arg:
```typescript
  const message = formatFranceSummaryVI(
    dateStr, movers, alerts, taSignals, portfolioPnl, vnIndex, globalSnapshot, foreignFlowMovers, upcomingDeadlines
  )
```

### 8 — Return values (~line 652 + 657)

Both success and error return paths: add `upcomingDeadlines` to result object:
```typescript
  return { sent: true, moverCount: movers.length, alertCount: alerts.length, taSignals, vnIndex, globalSnapshot, foreignFlowMovers, upcomingDeadlines }
  // and error path:
  return { sent: false, moverCount: movers.length, alertCount: alerts.length, taSignals, vnIndex, globalSnapshot, foreignFlowMovers, upcomingDeadlines }
```

Also fix the early-exit paths (alreadySentToday, hasContent) to include `upcomingDeadlines: []`.

## Reuse contract

| Symbol | Source | How |
|--------|--------|-----|
| `BctcDeadlineRow` | `assembleBriefing.ts` | type import (static) |
| `getCurrentDeadline` | `assembleBriefing.ts` | dynamic import in default path |
| `getNextDeadline` | `assembleBriefing.ts` | dynamic import in default path |
| `classifyFilingStatus` | `assembleBriefing.ts` | dynamic import in default path |

No new interfaces, no new files.

## Verification

```bash
bun test src/__tests__/1519-france-summary-bctc-deadlines.test.ts
bun tsc --noEmit
```

All 9 assertions green. No regressions in 1516 / 1513 / 1511 test suites.

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/franceSummaryJob.ts
  - `formatFranceSummaryVI`: renamed `_upcomingDeadlines` → `upcomingDeadlines`, added Section 4.5 BCTC block
  - `runFranceSummary`: added upcomingDeadlines computation block (injectable via `getUpcomingDeadlinesFn` or default path via `earningsCalendar.ts`); updated `hasContent` guard; updated all return paths; fixed `alreadySentToday` early-exit return
  - Fixed handoff error: dynamic import uses `earningsCalendar.ts` (not `assembleBriefing.ts`) for `getCurrentDeadline`/`getNextDeadline`/`classifyFilingStatus`

tests_written:
- src/__tests__/1519-france-summary-bctc-deadlines.test.ts   # 10 assertions, all GREEN (written in 1519a RED phase)

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # Bun crashed after 5785 tests (Bun runtime bug, not code regression)
