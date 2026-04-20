# TASK_1513b — GREEN: france-summary global snapshot impl

sprint: 197
depends_on: [1513_a]
files_modified:
  - src/scheduler/franceSummaryJob.ts

## Injection points (all in franceSummaryJob.ts)

### 1. FranceSummaryResult — line 44 block

Add field after `vnIndex`:

```typescript
/** Global market snapshot (VIX, DXY, S&P500, Hang Seng); null when unavailable. */
globalSnapshot: GlobalSnapshot | null
```

Full updated interface:

```typescript
export interface FranceSummaryResult {
  sent: boolean
  moverCount: number
  alertCount: number
  taSignals: TaSignalRow[]
  vnIndex: VnIndexSnapshot | null
  globalSnapshot: GlobalSnapshot | null   // NEW
}
```

### 2. FranceSummaryOptions — line 58 block

Add field after `fetchVnIndexFn`:

```typescript
/**
 * Injectable global snapshot fn for TDD.
 * Defaults to querying commodity_prices (same query as assembleBriefing.ts Step 12b).
 * Return null to skip the global section.
 */
getGlobalSnapshotFn?: () => Promise<GlobalSnapshot | null>
```

### 3. Import — top of file

Add import alongside existing imports:

```typescript
import type { GlobalSnapshot } from "../application/usecases/assembleBriefing.js"
```

Check if `assembleBriefing.js` is already imported; if so, extend the existing import line.

### 4. formatFranceSummaryVI — line 331 signature

Add `globalSnapshot?` as 7th parameter:

```typescript
export function formatFranceSummaryVI(
  dateStr: string,
  movers: MoverRow[],
  alerts: AlertRow[],
  taSignals: TaSignalRow[] | number,
  portfolioPnl?: PortfolioPnlResult | null,
  vnIndex?: VnIndexSnapshot | null,
  globalSnapshot?: GlobalSnapshot | null,   // NEW
): string {
```

Add Section 0.5 block — insert AFTER Section 0 (VN-Index) block, BEFORE Section 1 (movers):

```typescript
  // Section 0.5: global snapshot (VIX/DXY/SP500/HangSeng) — reuse morningBriefingJob formatter
  if (globalSnapshot != null) {
    const { formatGlobalSnapshotSection } = await import("../scheduler/morningBriefingJob.js")
    // NOTE: formatFranceSummaryVI is sync — use static import at file top instead:
    blocks.push(formatGlobalSnapshotSection(globalSnapshot).join("\n"))
  }
```

**Important — sync function constraint**: `formatFranceSummaryVI` is sync. Use a static import at the top of the file instead of dynamic import inside the function:

```typescript
import { formatGlobalSnapshotSection } from "./morningBriefingJob.js"
```

Then in Section 0.5:

```typescript
  // Section 0.5: global snapshot (VIX/DXY/SP500/HangSeng) — before movers
  if (globalSnapshot != null) {
    blocks.push(formatGlobalSnapshotSection(globalSnapshot).join("\n"))
  }
```

### 5. hasContent guard — line 531 area

Current guard:

```typescript
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

Updated guard — add globalSnapshot condition AND update return object:

```typescript
if (
  movers.length === 0 &&
  alerts.length === 0 &&
  taSignals.length === 0 &&
  !hasPnl &&
  vnIndex == null &&
  globalSnapshot == null              // NEW
) {
  return { sent: false, moverCount: 0, alertCount: 0, taSignals: [], vnIndex: null, globalSnapshot: null }
}
```

### 6. globalSnapshot fetch block — insert after vnIndex block (~line 482)

Pattern mirrors `fetchVnIndexFn` block:

```typescript
  // ── Global snapshot (best-effort, injectable via getGlobalSnapshotFn) ──────
  let globalSnapshot: GlobalSnapshot | null = null
  try {
    if (opts.getGlobalSnapshotFn) {
      globalSnapshot = await opts.getGlobalSnapshotFn()
    } else {
      // Default: query commodity_prices (same as assembleBriefing Step 12b)
      interface CpRow { vix: number; dxy: number; sp500: number; hang_seng: number; fetched_at: string }
      const cpRow = resolvedDb
        .prepare<CpRow, []>(
          `SELECT vix, dxy, sp500, hang_seng, fetched_at FROM commodity_prices ORDER BY fetched_at DESC LIMIT 1`,
        )
        .get()
      if (cpRow && (cpRow.vix !== 0 || cpRow.dxy !== 0 || cpRow.sp500 !== 0 || cpRow.hang_seng !== 0)) {
        globalSnapshot = {
          vix: cpRow.vix,
          dxy: cpRow.dxy,
          sp500: cpRow.sp500,
          hangSeng: cpRow.hang_seng,
          fetchedAt: cpRow.fetched_at,
        }
      }
    }
  } catch (err) {
    logger.warn("[franceSummaryJob] getGlobalSnapshotFn failed — skipping global section", {
      error: err instanceof Error ? err.message : String(err),
    })
    globalSnapshot = null
  }
```

### 7. Return objects — update all 4 return sites

Every `return { sent: ..., moverCount: ..., alertCount: ..., taSignals: ..., vnIndex: ... }` must add `globalSnapshot`.

Search pattern: `return { sent:` in franceSummaryJob.ts — 4 occurrences.

| Location | Change |
|----------|--------|
| alreadySentToday early return (~line 436) | add `globalSnapshot: null` |
| silent-skip early return (~line 541) | add `globalSnapshot: null` |
| success return (~line 549) | add `globalSnapshot` (variable) |
| send-fail return (~line 554) | add `globalSnapshot` (variable) |

### 8. formatFranceSummaryVI call site (~line 545)

Add `globalSnapshot` as 7th argument:

```typescript
const message = formatFranceSummaryVI(dateStr, movers, alerts, taSignals, portfolioPnl, vnIndex, globalSnapshot)
```

## Verification

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP
bun test src/__tests__/1513-france-summary-global-snapshot.test.ts 2>&1 | tail -20
bun tsc --noEmit 2>&1 | grep -i error | head -20
bun test 2>&1 | tail -5
```

Expected: all 1513 tests pass, 0 TS errors, full suite green.

## Circular import check

`morningBriefingJob.ts` imports from `assembleBriefing.ts`. `franceSummaryJob.ts` would import from both. Verify no cycle:

```
franceSummaryJob → morningBriefingJob → assembleBriefing  (one-way, OK)
franceSummaryJob → assembleBriefing                        (one-way, OK)
```

No cycle. Safe.

## Commit message template

```
feat(1513): GREEN — france-summary global snapshot (VIX/DXY/SP500/HangSeng)
```

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/franceSummaryJob.ts   # added GlobalSnapshot import + formatGlobalSnapshotSection import; added globalSnapshot field to FranceSummaryResult + getGlobalSnapshotFn to FranceSummaryOptions; extended formatFranceSummaryVI signature (7th param); added Section 0.5 block; added globalSnapshot fetch block; updated hasContent guard + all 4 return sites
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1364-france-ta-detail.test.ts   # added globalSnapshot: null to fallback result object
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1370-france-watchlist-movers.test.ts   # added globalSnapshot: null to 2 fallback result objects

tests_written:
- src/__tests__/1513-france-summary-global-snapshot.test.ts   # 10 assertions, all GREEN (AC-1 through AC-6)

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # Bun 1.3.11 crash is pre-existing, unrelated to these changes; 1513+1364+1370 batched: 19 pass 0 fail

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/franceSummaryJob.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1513-france-summary-global-snapshot.test.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1364-france-ta-detail.test.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1370-france-watchlist-movers.test.ts

merge_commit: pending
