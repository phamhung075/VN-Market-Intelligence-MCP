# Task Report: MACRO-CMDTY-DELTA — Brent/Gold day-over-day delta fix
date: 2026-05-31
sprint: MACRO-CMDTY-DELTA
outcome: CHANGES_REQUESTED
qa_agent: qa (cycle-162)

## Commits in scope
- e510e5df — fix(MACRO-CMDTY-DELTA/mcp-server): use prev-day close for Brent/Gold delta
- fdc17265 — chore(memory/dev-mcp-server): notebook 2026-05-31 MACRO-CMDTY-DELTA session

---

## Gate 1 — Live get_cycle_bootstrap MACRO block (raw values, not badges)

Observed at 2026-05-31T01:06Z (post-rebuild, first tick at 00:15:02Z):

```
=== MACRO ===
BRENT        91,12 (+0.00%)
GOLD         4.593 (+0.00%)
```

**Brent: 91.12, change_pct = 0.00%**
**Gold: 4593.00, change_pct = 0.00%**

These are HONEST zeroes, not the stale-bug zeroes. Explanation below.

---

## Gate 2 — DB cross-check (direct in-container bun:sqlite on /app/data/market.db)

### market_prices table
| code  | price | change_amt | change_pct | updated_at |
|-------|-------|-----------|------------|------------|
| BRENT | 91.12 | 0 | 0 | 2026-05-31T00:15:02.101Z |
| GOLD  | 4593  | 0 | 0 | 2026-05-31T00:15:02.101Z |

### commodity_prices_history (last 5 rows)
All rows from 2026-05-30T03:15 onward through 2026-05-31T00:15 show:
- brent_crude_usd: 91.12 (unchanged since ~05:45Z on 2026-05-30)
- gold_usd_per_oz: 4593 (unchanged since ~05:45Z on 2026-05-30; was 4569.9 before)

### Prev-day close lookup (new query: date(fetched_at) < date('2026-05-31'))
- prevBrent found: 91.12 at fetched_at=2026-05-30T23:00:04.775Z
- prevGold found: 4593 at fetched_at=2026-05-30T23:00:04.775Z

### Expected delta calculation
- Brent: (91.12 - 91.12) / 91.12 * 100 = 0.0000% — CORRECT (price genuinely flat)
- Gold: (4593 - 4593) / 4593 * 100 = 0.0000% — CORRECT (price genuinely flat)

**Verdict on 0.00%**: Yahoo Finance's regularMarketPrice has been returning 91.12/4593 since
2026-05-30T05:45Z. The fix IS working correctly — it looks up the previous calendar day's
row (found: 2026-05-30T23:00, which has brent=91.12 and gold=4593) and computes delta vs
today's first tick (also 91.12/4593). The 0.00% is not a stale-bug artefact; it reflects a
genuine flat weekend/off-market session where prices did not move. The OLD bug would have also
shown 0.00% but for the WRONG reason (comparing same-day row). The new 0.00% is correct.

**Key distinction**: Prices changed from 2026-05-29 (brent ~91.7, gold ~4570) to 2026-05-30
(brent 91.12, gold 4593) — that WOULD have shown as a non-zero delta during the 2026-05-30
trading day. Today (2026-05-31) uses 2026-05-30 as prev-day, which has the same closing value
as today's first tick.

---

## Gate 3 — Test suite: YF-14 / YF-15 (the regression guards)

File: apps/mcp-server/src/__tests__/025-yahoo-finance.test.ts
Run: bun test 025-yahoo-finance.test.ts

```
16 pass
0 fail
54 expect() calls
```

YF-14: PASS — off-market repeated price uses prev-day close, yields non-zero delta (1.244%)
YF-15: PASS — zero-valued history rows skipped by AND brent_crude_usd > 0 guard

---

## Gate 4 — BLOCKING: DPI-3 test regression introduced by e510e5df

File: apps/mcp-server/src/__tests__/DPI-3-commodity-delta.test.ts
Run: bun test DPI-3-commodity-delta.test.ts

```
4 pass
2 FAIL
```

**Failing tests:**
1. `DPI-3 AC-2 > price up from 80 → 100 → change_pct = 25.0`
2. `DPI-3 AC-3 > second storeCommoditySnapshot updates change_pct, not keeps stale 0`

**Root cause of DPI-3 test failures:**

The MACRO-CMDTY-DELTA fix changed the prev-close query from:
```sql
-- OLD (broken for prod, but worked in DPI-3 tests):
WHERE source = 'yahoo' AND fetched_at < ? ORDER BY fetched_at DESC LIMIT 1
-- (? = snapshot.fetchedAt, finds same-day rows)
```
to:
```sql
-- NEW (correct for prod, but breaks DPI-3 intra-day test setup):
WHERE source = 'yahoo' AND date(fetched_at) < date(?) AND brent_crude_usd > 0
ORDER BY fetched_at DESC LIMIT 1
-- (? = snapshotDate "YYYY-MM-DD", only finds PREVIOUS calendar day)
```

DPI-3 AC-2 seeds a history row at t0="2026-05-29T06:00:00.000Z" and stores a snapshot at
t1="2026-05-29T07:00:00.000Z". With the new query, t0 is on the SAME day as t1
(date('2026-05-29T06') = '2026-05-29', which is NOT < date('2026-05-29T07') = '2026-05-29'),
so the prev row is NOT found → prevBrent=null → delta=0 → AC-2 asserts 25.0% → FAIL.

DPI-3 AC-3 has the same same-day timestamp problem.

This is a real regression in the test suite introduced by e510e5df. The DPI-3 tests were
passing before the fix (confirmed by git show e510e5df~1 showing same timestamps with the old
fetched_at < ? query that would find same-day rows).

**Fix required in DPI-3 test file:**
Update t0/t1/t2 timestamps in DPI-3 AC-2 and AC-3 to span two calendar days, e.g.:
- AC-2: t0="2026-05-28T08:00:00.000Z" (yesterday), t1="2026-05-29T07:00:00.000Z" (today)
- AC-3: t0="2026-05-28T06:00:00.000Z", t1="2026-05-29T07:00:00.000Z", t2="2026-05-30T08:00:00.000Z"

Note: the fix logic is correct. The DPI-3 tests have stale intra-day assumptions that must be
updated to match the new day-over-day semantics.

---

## Gate 5 — TypeScript

bun tsc --noEmit (via npx tsc --noEmit): 0 errors

Pre-existing: DWF-routing-policy-fence.test.ts has 19 TS18048 errors (pre-existing from
commit 8105f8fd, out-of-scope for this sprint, same as cycle-160/161).

---

## Gate 6 — Tool count discrepancy

- Dev reported: 157 tools
- Live /health endpoint: toolCount=155
- MCP tools/list protocol: 155 tools confirmed
- Last known correct count before this sprint: 155 (AIT-QA cycle-157)

**Finding**: The live tool count is 155, matching the pre-fix baseline. There is NO regression
in tool count from this fix (MACRO-CMDTY-DELTA touched only yahooFinance.ts + 025 test file
— neither registers new MCP tools). The dev claim of 157 appears to be a dev-side error
in reporting; the ops health report (155) is authoritative and matches the pre-fix baseline.
Not a regression; not blocking.

---

## Gate 7 — Code logic verification

The fix in yahooFinance.ts lines 440-469 is logically correct:
1. snapshotDate = snapshot.fetchedAt.slice(0, 10) — correctly extracts YYYY-MM-DD in UTC
2. Prev-close query: date(fetched_at) < date(snapshotDate) AND brent/gold > 0
   — correctly excludes same-day rows and zero-value rows
3. computeDelta(current, prev): returns {amt:0, pct:0} when prev=null (first-run tolerance)
4. brentDelta/goldDelta computed before the write transaction (DDD readability per DPI-3 doc)
5. upsertMacroPrice passes computed delta.amt and delta.pct (no longer hardcoded 0)

DDD: no domain imports in infrastructure layer. Security: Bun.env only, no process.env.

---

## Issues Found

### Blocking
- `apps/mcp-server/src/__tests__/DPI-3-commodity-delta.test.ts:54-85` (AC-2) and `:145-170` (AC-3)
  — tests fail because they use same-day t0/t1 timestamps (both 2026-05-29).
  New prev-close query requires previous CALENDAR DAY. Fix: use cross-day timestamps.
  e.g. AC-2: t0="2026-05-28T08:00:00.000Z", t1="2026-05-29T07:00:00.000Z"
  e.g. AC-3: t0="2026-05-28T06:00:00.000Z", t1="2026-05-29T07:00:00.000Z", t2="2026-05-30T08:00:00.000Z"
  No production code changes needed — test-file only fix.

### Non-Blocking
- Tool count discrepancy: dev reported 157, live shows 155. Pre-fix baseline was 155. No regression.
  Discrepancy is in dev's reporting, not in the running system. Flag to dev to correct reports.

---

## Verdict

CHANGES_REQUESTED (1 blocking)

Fix is logically correct and the YF-14/YF-15 regression guards pass. The production
0.00% delta is an honest flat-market result, not a stale-bug artefact. However, the
same commit (e510e5df) introduced a 2-test regression in DPI-3-commodity-delta.test.ts
(AC-2 and AC-3) because those tests use intra-day timestamps that the new calendar-day
query skips. Test fix is minimal (timestamp updates only, no production code change).

NEXT: fixer | update DPI-3-commodity-delta.test.ts AC-2 and AC-3 timestamps to span
  two calendar days so the prev-day query finds the seeded row; verify 6/6 DPI-3 pass.
ROUTE: fixer round=1 (first round)
