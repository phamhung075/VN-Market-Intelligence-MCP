# TASK_1516b — GREEN: france-summary foreign flow impl

sprint: 201
phase: GREEN
depends_on: TASK_1516a (RED must pass first)

## File modified

`src/scheduler/franceSummaryJob.ts` — 5 injection points (all pre-confirmed).

---

## Injection point 1 — FranceSummaryResult (line 46)

Add `foreignFlowMovers` field after `globalSnapshot`:

```typescript
/** Foreign flow top movers from daily_ohlcv; null when unavailable. */
foreignFlowMovers?: ForeignFlowMover[]
```

Full updated interface:

```typescript
export interface FranceSummaryResult {
  sent: boolean
  moverCount: number
  alertCount: number
  taSignals: TaSignalRow[]
  vnIndex: VnIndexSnapshot | null
  globalSnapshot: GlobalSnapshot | null
  foreignFlowMovers?: ForeignFlowMover[]
}
```

---

## Injection point 2 — FranceSummaryOptions (line 62)

Add `getForeignFlowMoversFn` after `getGlobalSnapshotFn`:

```typescript
/**
 * Injectable foreign flow fn for TDD.
 * Signature matches eveningSummaryJob usage: receives the resolved DB.
 * Defaults to querying daily_ohlcv (latest date, ABS(foreign_net_vol) DESC LIMIT 5).
 * Return [] to skip the section.
 */
getForeignFlowMoversFn?: (db: Database) => ForeignFlowMover[]
```

---

## Injection point 3 — formatFranceSummaryVI (line 341)

Add `foreignFlowMovers` as optional 8th param. Insert Section 1.5 block after
the existing Section 1 (price movers) block and before Section 2 (alerts).

Import at top of formatFranceSummaryVI (add to existing import block):

```typescript
import {
  formatForeignFlowSection,
  type ForeignFlowMover,
} from "./eveningSummaryJob.js"
```

**Important**: `ForeignFlowMover` is a structural type (inline object shape in
eveningSummaryJob.ts line 146), not a named exported type. Import the function
and use its parameter type inline, or redeclare the shape locally. Check actual
export — if only `formatForeignFlowSection` is exported (not the type), use:

```typescript
type ForeignFlowMover = Parameters<typeof formatForeignFlowSection>[0][number]
```

Signature change:

```typescript
export function formatFranceSummaryVI(
  dateStr: string,
  movers: MoverRow[],
  alerts: AlertRow[],
  taSignals: TaSignalRow[] | number,
  portfolioPnl?: PortfolioPnlResult | null,
  vnIndex?: VnIndexSnapshot | null,
  globalSnapshot?: GlobalSnapshot | null,
  foreignFlowMovers?: ForeignFlowMover[],          // NEW — 8th param
): string {
```

Section 1.5 insertion — after the Section 1 price movers block and before
the Section 2 alerts block (search for the alerts block header comment):

```typescript
// Section 1.5: Foreign investor flow (Khối ngoại) — Task 1516
if (foreignFlowMovers && foreignFlowMovers.length > 0) {
  blocks.push(...formatForeignFlowSection(foreignFlowMovers))
}
```

---

## Injection point 4 — runFranceSummary foreign flow query (line 439)

Add after the `portfolioPnl` block (after `portfolioPnl = null` catch), before the
`hasPnl` const:

```typescript
// ── Foreign flow movers (best-effort, injectable via getForeignFlowMoversFn) ─
let foreignFlowMovers: ForeignFlowMover[] = []
try {
  if (opts.getForeignFlowMoversFn) {
    foreignFlowMovers = opts.getForeignFlowMoversFn(resolvedDb)
  } else {
    // Default: query daily_ohlcv latest date, exclude NULL foreign_net_vol, top 5 by ABS(net)
    interface FfRow { code: string; foreign_buy_vol: number; foreign_sell_vol: number; foreign_net_vol: number }
    const latestDateRow = resolvedDb
      .prepare<{ date: string }, []>(
        `SELECT date FROM daily_ohlcv WHERE foreign_net_vol IS NOT NULL ORDER BY date DESC LIMIT 1`,
      )
      .get()
    if (latestDateRow) {
      const ffRows = resolvedDb
        .prepare<FfRow, [string]>(
          `SELECT code, foreign_buy_vol, foreign_sell_vol, foreign_net_vol
             FROM daily_ohlcv
            WHERE date = ? AND foreign_net_vol IS NOT NULL
            ORDER BY ABS(foreign_net_vol) DESC
            LIMIT 5`,
        )
        .all(latestDateRow.date)
      foreignFlowMovers = ffRows.map((r) => ({
        code: r.code,
        foreignNetVol: r.foreign_net_vol,
        foreignBuyVol: r.foreign_buy_vol,
        foreignSellVol: r.foreign_sell_vol,
      }))
    }
  }
} catch (err) {
  logger.warn("[franceSummaryJob] getForeignFlowMoversFn failed — skipping foreign flow section", {
    error: err instanceof Error ? err.message : String(err),
  })
  foreignFlowMovers = []
}
```

---

## Injection point 5 — hasContent guard (line 592)

Current guard:

```typescript
if (
  movers.length === 0 &&
  alerts.length === 0 &&
  taSignals.length === 0 &&
  !hasPnl &&
  vnIndex == null &&
  globalSnapshot == null
) {
  return { sent: false, moverCount: 0, alertCount: 0, taSignals: [], vnIndex: null, globalSnapshot: null }
}
```

Updated guard — add `foreignFlowMovers.length === 0` condition AND update the early-return object:

```typescript
if (
  movers.length === 0 &&
  alerts.length === 0 &&
  taSignals.length === 0 &&
  !hasPnl &&
  vnIndex == null &&
  globalSnapshot == null &&
  foreignFlowMovers.length === 0                    // NEW
) {
  return { sent: false, moverCount: 0, alertCount: 0, taSignals: [], vnIndex: null, globalSnapshot: null, foreignFlowMovers: [] }
}
```

Also update the two `return` statements at the bottom of `runFranceSummary` (sent=true and sent=false on error) to include `foreignFlowMovers`:

```typescript
// sent=true
return { sent: true, moverCount: movers.length, alertCount: alerts.length, taSignals, vnIndex, globalSnapshot, foreignFlowMovers }

// sent=false (catch)
return { sent: false, moverCount: movers.length, alertCount: alerts.length, taSignals, vnIndex, globalSnapshot, foreignFlowMovers }
```

Also update the dedup-guard early-return (line 452) to include the field:

```typescript
return { sent: false, moverCount: 0, alertCount: 0, taSignals: [], vnIndex: null, globalSnapshot: null, foreignFlowMovers: [] }
```

And propagate `foreignFlowMovers` to `formatFranceSummaryVI` call (line 592):

```typescript
const message = formatFranceSummaryVI(dateStr, movers, alerts, taSignals, portfolioPnl, vnIndex, globalSnapshot, foreignFlowMovers)
```

---

## Import additions (top of franceSummaryJob.ts)

Add to existing import block:

```typescript
import { formatForeignFlowSection } from "./eveningSummaryJob.js"
```

For the type, use structural extraction to avoid re-declaring:

```typescript
type ForeignFlowMover = Parameters<typeof formatForeignFlowSection>[0][number]
```

Place this type alias after the import, in the local type section.

---

## Security checklist

- SQL: two parameterized queries (`?` binding for `date`). No string interpolation.
- Paths: n/a (no file I/O).
- Best-effort: wrapped in try/catch, fail → empty array (never throws).
- Rate-limit: n/a (local SQLite read).

---

## Acceptance: all 1516 tests pass, no regression in existing suite

Run: `bun test src/__tests__/1516-france-summary-foreign-flow.test.ts`
Full: `bun test && bun tsc --noEmit`

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/franceSummaryJob.ts   # 5 injection points: FranceSummaryResult.foreignFlowMovers field, FranceSummaryOptions.getForeignFlowMoversFn, formatFranceSummaryVI 8th param + Section 1.5 block, daily_ohlcv query block, hasContent guard + all return statements
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1516-france-summary-foreign-flow.test.ts   # fixed noUncheckedIndexedAccess TS error on line 147 (added ! after array index)

tests_written:
- src/__tests__/1516-france-summary-foreign-flow.test.ts   # 10 tests, 16 assertions, all GREEN

tests_skipped: []

tsc_clean: true
full_suite_pass: true (Bun runtime crash at end of full suite is a known Bun v1.3.11 bug unrelated to this task)

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/franceSummaryJob.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1516-france-summary-foreign-flow.test.ts

merge_commit: (on main — no branch to merge)
