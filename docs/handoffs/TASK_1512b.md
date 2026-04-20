# TASK 1512b — GREEN: evening global snapshot impl

sprint: 196
phase: GREEN
depends: 1512a RED all passing (5 fail)

## Files to modify

| File | Action | Injection point |
|------|--------|-----------------|
| `src/application/usecases/assembleEveningSummary.ts` | MODIFY | line 91 (interface), line 641 (Step 6b block), line 660 (spread) |
| `src/scheduler/eveningSummaryJob.ts` | MODIFY | extract `formatEveningSummaryLines`, add global block after foreignFlow |

## 1. assembleEveningSummary.ts

### 1a. Interface (line 91)

Add after `foreignFlowMovers?: ForeignFlowMover[];` (last field before closing brace):

```typescript
  /**
   * VIX / DXY / SP500 / Hang Seng snapshot at market close (Task 1512).
   * undefined when commodity_prices table is empty or all values are zero.
   */
  globalSnapshot?: GlobalSnapshot;
```

### 1b. Import (top of file, with existing assembleBriefing imports)

```typescript
import type { GlobalSnapshot } from "./assembleBriefing.js";
```

Existing line 22 already imports from `assembleBriefing.js` — add `GlobalSnapshot` to that import.

### 1c. Step 6b block (insert before Step 6 persist block at line 643)

Insert after the portfolioPnl try/catch block (after line 641), before `// ── Step 6: Persist summary`:

```typescript
  // ── Step 6b: Global snapshot (VIX / DXY / SP500 / Hang Seng) ─────────────
  let globalSnapshot: GlobalSnapshot | undefined;
  try {
    const gsRow = db
      .query<
        { vix: number; dxy: number; sp500: number; hang_seng: number; fetched_at: string },
        []
      >("SELECT vix, dxy, sp500, hang_seng, fetched_at FROM commodity_prices LIMIT 1")
      .get();
    if (gsRow && (gsRow.vix !== 0 || gsRow.dxy !== 0 || gsRow.sp500 !== 0)) {
      globalSnapshot = {
        vix: gsRow.vix,
        dxy: gsRow.dxy,
        sp500: gsRow.sp500,
        hangSeng: gsRow.hang_seng,
        fetchedAt: gsRow.fetched_at,
      };
    }
  } catch (gsErr) {
    logger.warn("[assembleEveningSummary] globalSnapshot step failed", {
      error: gsErr instanceof Error ? gsErr.message : String(gsErr),
    });
  }
```

### 1d. Spread into returned summary (line 660)

Current spread block (lines 647-661):
```typescript
  const summary: EveningSummary = {
    date,
    topAlerts,
    ...
    foreignFlowMovers,
  };
```

Add `...(globalSnapshot !== undefined ? { globalSnapshot } : {}),` after `foreignFlowMovers`:

```typescript
  const summary: EveningSummary = {
    date,
    topAlerts,
    topStories,
    watchlistMovers,
    predictionSignals,
    predictionDiag,
    taDiag,
    taSummary,
    newsCount,
    generatedAt,
    ...(vnIndex !== undefined ? { vnIndex } : {}),
    portfolioPnl,
    foreignFlowMovers,
    ...(globalSnapshot !== undefined ? { globalSnapshot } : {}),
  };
```

## 2. eveningSummaryJob.ts

### 2a. Import formatGlobalSnapshotSection

Add to imports at top of file:

```typescript
import {
  formatGlobalSnapshotSection,
} from "./morningBriefingJob.js";
import type { GlobalSnapshot } from "../application/usecases/assembleBriefing.js";
```

### 2b. Extract `formatEveningSummaryLines` (new exported function)

Extract the inline `lines` assembly (currently lines 252-327 inside the `try` block) into a standalone exported function. The inline block becomes `lines.push(...formatEveningSummaryLines(summary)); await doSend(...)`.

Function signature:

```typescript
/**
 * Build Telegram lines for the evening summary.
 * Exported for unit testing (task 1512).
 */
export function formatEveningSummaryLines(summary: EveningSummary): string[] {
  const lines: string[] = [`TÓM TẮT BUỔI TỐI ${summary.date}`];

  // VN-Index close
  if (summary.vnIndex) { ... }

  // topAlerts, topStories, newsCount, movers, prediction, TA, PnL, foreignFlow
  // ... (identical to existing inline logic) ...

  // ── Global snapshot (task 1512) ──────────────────────────────────────────
  if (summary.globalSnapshot) {
    lines.push("");
    lines.push(...formatGlobalSnapshotSection(summary.globalSnapshot));
  }

  return lines;
}
```

Place global snapshot block AFTER `formatForeignFlowSection` (last existing section), before `return lines`.

### 2c. Update the Telegram send block

Replace the inline `lines` build + `doSend` call:

```typescript
const lines = formatEveningSummaryLines(summary);
await doSend(lines.join("\n"), {
  persist: { from_agent: "evening-summary", message_type: "evening_summary" },
});
```

## Acceptance check

```bash
bun test src/__tests__/1512-evening-global-snapshot.test.ts
# Expect: 5 pass / 0 fail

bun tsc --noEmit
# Expect: 0 errors

bun test
# Expect: all existing tests still pass
```

## Zero-value guard

Mirror `assembleBriefing.ts` logic:
- `globalSnapshot` set only when `vix !== 0 || dxy !== 0 || sp500 !== 0`
- Empty table → `globalSnapshot = undefined` → evening Telegram omits the block silently
- No logger.warn for empty (it is a valid normal state before market opens)

## Commit message

```
feat(1512): GREEN — evening global snapshot (VIX/DXY/SP500/HangSeng)
```

---

## [Developer] Implementation Record

files_actually_modified:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/assembleEveningSummary.ts` — added `GlobalSnapshot` to import, added `globalSnapshot?: GlobalSnapshot` field to `EveningSummary` interface, added Step 6b DB query block, spread `globalSnapshot` into returned summary (with EOP-safe cast)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/eveningSummaryJob.ts` — added `formatGlobalSnapshotSection` + `GlobalSnapshot` imports, extracted inline lines build into exported `formatEveningSummaryLines` with global snapshot block appended, replaced inline build in `runEveningSummary` with `formatEveningSummaryLines(summary)` call
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1512-evening-global-snapshot.test.ts` — fixed `setupDb` schema to match production columns (`source_title`, `sentiment` in rag_analyses; `triggered_at`, `affected_actions_json` in alerts; `code`+`exchange` in watchlist/market_prices; correct daily_ohlcv schema)

tests_written:
- `src/__tests__/1512-evening-global-snapshot.test.ts` — 5 assertions, all GREEN

tests_skipped: []

tsc_clean: true
full_suite_pass: true

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/assembleEveningSummary.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/eveningSummaryJob.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1512-evening-global-snapshot.test.ts

merge_commit: (pending)
