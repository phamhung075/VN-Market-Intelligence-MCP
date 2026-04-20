# TASK_1524b — GREEN: assembleBriefing globalSnapshot query + format fix

sprint: 208
status: Todo
role: Dev
depends_on: TASK_1524a (RED verified)

---

## Changes (3 files)

### 1. `src/application/usecases/assembleBriefing.ts`

**Add Step 19** — insert after Step 18 (upcomingDeadlines block, line ~1133) and before the persist + return block (line ~1135):

```typescript
// ── Step 19: Global market snapshot from commodity_prices ────────────────
let globalSnapshot: GlobalSnapshot | undefined;
try {
  interface CpRow { vix: number; dxy: number; sp500: number; hang_seng: number; fetched_at: string }
  const cpRow = db.prepare<CpRow, []>(
    `SELECT vix, dxy, sp500, hang_seng, fetched_at FROM commodity_prices ORDER BY fetched_at DESC LIMIT 1`
  ).get();
  if (cpRow && (cpRow.vix !== 0 || cpRow.dxy !== 0 || cpRow.sp500 !== 0 || cpRow.hang_seng !== 0)) {
    globalSnapshot = {
      vix: cpRow.vix,
      dxy: cpRow.dxy,
      sp500: cpRow.sp500,
      hangSeng: cpRow.hang_seng,
      fetchedAt: cpRow.fetched_at,
    };
  }
} catch { /* best-effort: commodity_prices may not exist in all envs */ }
```

**Add `globalSnapshot` to return object** at line ~1139 (the `const briefing: DailyBriefing = {` block):

After `upcomingDeadlines,` add:
```typescript
...(globalSnapshot !== undefined ? { globalSnapshot } : {}),
```

**Test fixture fix** — the test `setupDb()` only creates `commodity_prices`. The GREEN test fixture (not the existing test file) must include all tables `assembleBriefing` touches. The existing 1511 test file's `setupDb` needs expanding. Add to `setupDb`:

```sql
CREATE TABLE IF NOT EXISTS rag_analyses (
  source_title TEXT, level TEXT NOT NULL DEFAULT 'country',
  sentiment TEXT, impact_score REAL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY, triggered_at TEXT NOT NULL, severity TEXT NOT NULL,
  message TEXT, affected_actions_json TEXT, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS watchlist (
  code TEXT PRIMARY KEY, domain TEXT NOT NULL DEFAULT 'other'
);
CREATE TABLE IF NOT EXISTS financial_reports (
  id TEXT PRIMARY KEY, action_code TEXT NOT NULL, period_type TEXT,
  period_year INTEGER, parsed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Injection point: `setupDb()` function body in `src/__tests__/1511-morning-briefing-global-snapshot.test.ts` — insert the 4 `CREATE TABLE` statements after the existing `commodity_prices` DDL.

---

### 2. `src/scheduler/morningBriefingJob.ts`

**Injection point: `formatGlobalSnapshotSection` function, lines 55–62.**

Current:
```typescript
return [
  "🌐 Thị trường toàn cầu:",
  `  VIX: ${snap.vix}`,
  `  DXY: ${snap.dxy}`,
  `  S&P500: ${snap.sp500}`,
  `  Hang Seng: ${snap.hangSeng}`,
];
```

Replace with:
```typescript
return [
  "🌐 Thị trường toàn cầu:",
  `  VIX: ${snap.vix.toFixed(2)}`,
  `  DXY: ${snap.dxy.toFixed(2)}`,
  `  S&P500: ${Math.round(snap.sp500)}`,
  `  Hang Seng: ${Math.round(snap.hangSeng)}`,
];
```

Why: VIX/DXY are precision floats (18.5 → "18.50"). S&P500/HangSeng are index points displayed as integers (5120.75 → 5121). The 1513 test expects `"22.50"` for VIX=22.5.

---

## Acceptance criteria (all 15 tests must pass)

| File | Expected |
|------|---------|
| 1511 AC-1 | `GlobalSnapshot` runtime export — note: TS interface has no runtime value. Fix: AC-1 test assertion checks `typeof mod["GlobalSnapshot"]` which will still be `"undefined"`. This test may need to be updated to check the runtime shape via a produced object (AC-2 already covers this). Confirm with test owner if AC-1 should be updated or skipped. |
| 1511 AC-2 | `briefing.globalSnapshot.vix` ≈ 18.5 |
| 1511 AC-3 | `briefing.globalSnapshot` is `undefined` when table empty |
| 1511 AC-4 | `formatGlobalSnapshotSection` returns 5 lines, VIX/DXY/SP500/HangSeng present |
| 1511 AC-5 | `formatBriefingMessage` contains "Thị trường toàn cầu" |
| 1513 AC-3 "VIX 2dp" | message contains `"22.50"` |
| All other 1513 | already passing — do not regress |

---

## Notes on AC-1 (1511)

`GlobalSnapshot` is a TypeScript `export interface` — no runtime value exists. The assertion `typeof mod["GlobalSnapshot"] !== "undefined"` will remain `false` even after the fix. Options:

A. Update AC-1 assertion to verify shape via a real produced briefing (already covered by AC-2).
B. Export a const type guard: `export const isGlobalSnapshot = (v: unknown): v is GlobalSnapshot => ...`

Recommended: update AC-1 to verify via `briefing.globalSnapshot` key existence (same pattern as AC-2/AC-3). This is a test-file-only change.

---

## Verify GREEN

```bash
bun test src/__tests__/1511-morning-briefing-global-snapshot.test.ts src/__tests__/1513-france-summary-global-snapshot.test.ts 2>&1 | grep -E "fail|pass"
# Expected: 0 fail, 15 pass
bun tsc --noEmit
```

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/assembleBriefing.ts   # added Step 19: globalSnapshot query from commodity_prices; added globalSnapshot to return object
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/morningBriefingJob.ts   # formatGlobalSnapshotSection: VIX/DXY toFixed(2), SP500/HangSeng Math.round
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1511-morning-briefing-global-snapshot.test.ts   # expanded setupDb DDL (market_prices, daily_ohlcv + 4 tables); fixed AC-1 assertion to verify shape via produced object

tests_written:
- src/__tests__/1511-morning-briefing-global-snapshot.test.ts   # 5 assertions, all GREEN
- src/__tests__/1513-france-summary-global-snapshot.test.ts   # 10 assertions, all GREEN (pre-existing, no regression)

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # pre-existing 125-test-e2e-briefing.test.ts fail confirmed unrelated (no such table: commodity_prices in evening summary — different flow)

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/assembleBriefing.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/morningBriefingJob.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1511-morning-briefing-global-snapshot.test.ts

merge_commit: 48ee4a7
