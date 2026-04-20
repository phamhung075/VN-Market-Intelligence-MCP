# TASK_1524a — RED Verification: 1511/1513 Failure Root Causes

sprint: 208
status: Todo
role: Dev

---

## Confirmed Failures (4 total across 2 test files)

### Test 1511 — 3 failures

| # | Test | Root cause |
|---|------|-----------|
| 1 | AC-1: GlobalSnapshot interface exported | Interface exists in assembleBriefing.ts but is a TS-only `export interface` — no runtime value. Test checks `typeof mod["GlobalSnapshot"] !== "undefined"` which is always `undefined` at runtime. Fix: export a runtime sentinel or adjust assertion. **Actually**: test is checking runtime export of the type token — this will always be undefined. This assertion itself is the bug in the test's RED intent. The actual RED for AC-2/AC-3 is the missing query. |
| 2 | AC-2: assembleBriefing populates globalSnapshot | `assembleBriefing` throws `SQLiteError: no such table: rag_analyses` when called with a minimal in-memory DB that only has `commodity_prices`. Test fixture (`setupDb`) only creates `commodity_prices` — missing all other tables. Briefing crashes at Step 3 (`rag_analyses` query) before ever reaching the globalSnapshot step. globalSnapshot is never populated because `briefing` object construction at line 1139 has no `globalSnapshot` field. |
| 3 | AC-3: globalSnapshot=undefined when table empty | Same root cause as AC-2: throws at `rag_analyses` before reaching return. |

**Actual root causes for 1511:**
1. `setupDb()` in test only creates `commodity_prices` — needs all tables `assembleBriefing` queries (rag_analyses, alerts, watchlist, financial_reports). Fix in GREEN: expand test fixture DDL.
2. `assembleBriefing` return object (line 1139–1158) has no `globalSnapshot` field — Step 19 query never written.

### Test 1513 — 1 failure

| # | Test | Root cause |
|---|------|-----------|
| 1 | AC-3 "VIX value formatted to 2 decimal places" | `formatGlobalSnapshotSection` in morningBriefingJob.ts:57 outputs `snap.vix` raw (no toFixed). Actual output: `"  VIX: 22.5"`. Expected: contains `"22.50"`. Also `sp500` outputs `5150` (no rounding) and `hangSeng` outputs `17200` — tests for those pass because they only check `.toContain("S&P500")` not the value. |

**All other 1513 tests pass** — FranceSummaryResult already has `globalSnapshot` field, `getGlobalSnapshotFn` is already in `FranceSummaryOptions`, `formatFranceSummaryVI` already accepts and renders `globalSnapshot`, and `runFranceSummary` already queries `commodity_prices` by default.

---

## File states before GREEN

| File | Issue |
|------|-------|
| `src/application/usecases/assembleBriefing.ts` | Missing Step 19: no `SELECT vix,dxy,sp500,hang_seng,fetched_at FROM commodity_prices` query; `globalSnapshot` absent from return object |
| `src/scheduler/morningBriefingJob.ts:57-61` | `formatGlobalSnapshotSection`: VIX/DXY output raw float (no `.toFixed(2)`); sp500/hangSeng output raw float (no `Math.round`) |
| `src/__tests__/1511-morning-briefing-global-snapshot.test.ts` | `setupDb()` DDL incomplete — only `commodity_prices`, missing `rag_analyses`, `alerts`, `watchlist`, `financial_reports` |

---

## Verify RED

```bash
bun test src/__tests__/1511-morning-briefing-global-snapshot.test.ts src/__tests__/1513-france-summary-global-snapshot.test.ts 2>&1 | grep -E "fail|pass"
# Expected: 4 fail, 11 pass
```
