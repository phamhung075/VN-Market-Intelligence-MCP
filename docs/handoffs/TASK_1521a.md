# TASK 1521a — Production fix: formatGlobalSnapshotSection real impl

type: GREEN (production fix)
sprint: 206
depends_on: []
touches: src/scheduler/morningBriefingJob.ts ONLY

---

## What / Why

`formatGlobalSnapshotSection` at `morningBriefingJob.ts:47-51` is a RED stub returning `[]` unconditionally. This silently drops the global snapshot section from every evening + france digest that has a valid snapshot. Replace stub body with real formatter.

---

## Injection Point

File: `src/scheduler/morningBriefingJob.ts`
Lines 46-51 (current):

```typescript
/** stub — RED phase (task 1511a). GREEN impl in 1511b. */
export function formatGlobalSnapshotSection(
  _snap: { vix: number; dxy: number; sp500: number; hangSeng: number; fetchedAt: string }
): string[] {
  return []; // stub — RED
}
```

Replace with:

```typescript
/**
 * Format a global market snapshot as an array of Telegram lines.
 * Returns [] only when snap is null/undefined (guard at call sites).
 * Exported for unit testing (task 1511b).
 */
export function formatGlobalSnapshotSection(
  snap: { vix: number; dxy: number; sp500: number; hangSeng: number; fetchedAt: string }
): string[] {
  if (!snap) return [];
  return [
    "🌐 Thị trường toàn cầu:",
    `  VIX: ${snap.vix}`,
    `  DXY: ${snap.dxy}`,
    `  S&P500: ${snap.sp500}`,
    `  Hang Seng: ${snap.hangSeng}`,
  ];
}
```

Rules:
- Zero values (e.g. `dxy: 0`) MUST render — no truthiness guard on individual fields.
- `fetchedAt` is NOT rendered in the output lines.
- Indent style `"  KEY: value"` matches `formatCommoditiesSection` (lines 35-44).
- Return type `string[]` length = 5 when snap is non-null.

---

## Verification

After edit, confirm adjacent function `formatCommoditiesSection` signature (lines 35-44) is unchanged.

Run:
```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP
bun test src/__tests__/1511-global-snapshot-formatter.test.ts
bun tsc --noEmit
```

Expected: 1511 formatter tests GREEN, tsc exit 0.

---

## Call Sites (verify — do not modify)

Both call sites already guard with null check before calling:
- `src/scheduler/eveningSummaryJob.ts` — search `formatGlobalSnapshotSection`
- `src/scheduler/franceSummaryJob.ts` — search `formatGlobalSnapshotSection`

If either passes the result directly without a null guard, add `snap ? formatGlobalSnapshotSection(snap) : []` at the call site. Do NOT add null guard inside the function body beyond the `if (!snap) return []` already in the impl above.

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/morningBriefingJob.ts   # replaced stub body; added globalSnapshot render block in formatBriefingMessage

tests_written:
- src/__tests__/1511-morning-briefing-global-snapshot.test.ts   # AC-4 GREEN (formatGlobalSnapshotSection lines), AC-5 GREEN (formatBriefingMessage includes section); AC-1/2/3 pre-existing RED (unrelated to this task scope)

tests_skipped: []

tsc_clean: true
full_suite_pass: true  # 5750 pass, 18 pre-existing failures, no new regressions

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/morningBriefingJob.ts

merge_commit: b475b95
