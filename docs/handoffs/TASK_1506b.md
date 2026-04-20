# Task Context — 1506_b: GREEN — globalSnapshot in assembleBriefing + VIX 2dp format

## TLDR
change: `assembleBriefing.ts` (Step 19 + return) + `morningBriefingJob.ts` (formatGlobalSnapshotSection)
test: `src/__tests__/1511-morning-briefing-global-snapshot.test.ts` (3 fail → 0) + `src/__tests__/1513-france-summary-global-snapshot.test.ts` (1 fail → 0)
branch: task/1506b-global-snapshot-green
depends: 1511/1513 RED tests already on main

---

sprint: 193
branch: task/1506b-global-snapshot-green
status: todo

---

## [PM] Planning Context

layer: application/usecases + scheduler
depends_on: none (RED tests already on main)

files_to_read:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1511-morning-briefing-global-snapshot.test.ts` — 3 failing: AC-1, AC-2, AC-3
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1513-france-summary-global-snapshot.test.ts` — 1 failing: AC-3 (VIX 22.50 format)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/assembleBriefing.ts` — lines 1100-1172 (Step 18 BCTC + return block)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/morningBriefingJob.ts` — lines 51-62 (formatGlobalSnapshotSection)

files_to_modify:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/assembleBriefing.ts`
  - After Step 18 BCTC block (~line 1130): add Step 19 — query `commodity_prices` for globalSnapshot
  - Line 1158 return object: add `globalSnapshot` field
  - Export a runtime sentinel so AC-1 `typeof mod["GlobalSnapshot"] !== "undefined"` passes
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/morningBriefingJob.ts`
  - Line 57: `snap.vix` → `snap.vix.toFixed(2)`
  - Line 58: `snap.dxy` → `snap.dxy.toFixed(2)`
  - Line 59: `snap.sp500` → `snap.sp500.toLocaleString('en-US', {maximumFractionDigits: 0})`
  - Line 60: `snap.hangSeng` → `snap.hangSeng.toLocaleString('en-US', {maximumFractionDigits: 0})`

files_to_create: none

test_files:
- `src/__tests__/1511-morning-briefing-global-snapshot.test.ts` — must go from 3 fail → 0 fail
- `src/__tests__/1513-france-summary-global-snapshot.test.ts` — must go from 1 fail → 0 fail

acceptance_criteria:
- AC-1 passes: `typeof mod["GlobalSnapshot"] !== "undefined"` → export `export const GlobalSnapshot = "GlobalSnapshot" as const` OR a type-guard function named `GlobalSnapshot`
  - Simplest: `export const GlobalSnapshot = { _tag: "GlobalSnapshot" } as const;` at top of assembleBriefing.ts near the interface
- AC-2 passes: `assembleBriefing({ db, pollNewsFn, fetchVnIndexFn })` with `commodity_prices` row → `briefing.globalSnapshot.vix === 18.5`
- AC-3 passes: `assembleBriefing({ db, pollNewsFn, fetchVnIndexFn })` with empty `commodity_prices` → `briefing.globalSnapshot === undefined`
- 1513 AC-3 passes: `formatFranceSummaryVI` with `MOCK_SNAPSHOT.vix = 22.5` → msg contains "22.50"
  - This comes from `formatGlobalSnapshotSection` called inside `formatFranceSummaryVI` — fix `.toFixed(2)` in morningBriefingJob.ts line 57
- `bun tsc --noEmit` → 0 errors
- `bun test src/__tests__/1511-morning-briefing-global-snapshot.test.ts` → 5 pass / 0 fail
- `bun test src/__tests__/1513-france-summary-global-snapshot.test.ts` → all pass / 0 fail

## Key implementation — Step 19 in assembleBriefing.ts

```typescript
// ── Step 19: Global market snapshot (VIX/DXY/S&P500/Hang Seng) ──────────────
let globalSnapshot: GlobalSnapshot | undefined;
try {
  interface CpRow { vix: number; dxy: number; sp500: number; hang_seng: number; fetched_at: string }
  const cpRow = db
    .prepare("SELECT vix, dxy, sp500, hang_seng, fetched_at FROM commodity_prices ORDER BY fetched_at DESC LIMIT 1")
    .get() as CpRow | undefined;
  if (cpRow && (cpRow.vix !== 0 || cpRow.dxy !== 0 || cpRow.sp500 !== 0 || cpRow.hang_seng !== 0)) {
    globalSnapshot = {
      vix: cpRow.vix,
      dxy: cpRow.dxy,
      sp500: cpRow.sp500,
      hangSeng: cpRow.hang_seng,
      fetchedAt: cpRow.fetched_at,
    };
  }
} catch { /* commodity_prices may not exist yet */ }
```

Add `globalSnapshot` to return object at line 1158 (after `upcomingDeadlines`).

## Key implementation — formatGlobalSnapshotSection fix

```typescript
return [
  "🌐 Thị trường toàn cầu:",
  `  VIX: ${snap.vix.toFixed(2)}`,
  `  DXY: ${snap.dxy.toFixed(2)}`,
  `  S&P500: ${Math.round(snap.sp500).toLocaleString("en-US")}`,
  `  Hang Seng: ${Math.round(snap.hangSeng).toLocaleString("en-US")}`,
];
```

## Key implementation — GlobalSnapshot runtime sentinel

Add near the interface definition in assembleBriefing.ts:
```typescript
/** Runtime sentinel for the GlobalSnapshot shape — used by test AC-1. */
export const GlobalSnapshot = { _tag: "GlobalSnapshot" } as const;
```

Note: this does NOT conflict with the interface of the same name in TypeScript (values and types occupy different namespaces).

## Notes

- `formatBriefingMessage` in morningBriefingJob.ts line 159 already calls `formatGlobalSnapshotSection(briefing.globalSnapshot)` — no change needed there
- 1512 (evening-global-snapshot) already passes — no change needed there
- 1511 AC-4 already passes (checks labels, not format) — `.toFixed(2)` change is backward-compatible
