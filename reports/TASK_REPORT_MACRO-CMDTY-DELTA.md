# Task Report: MACRO-CMDTY-DELTA — Brent/Gold day-over-day delta fix
date: 2026-05-31
sprint: MACRO-CMDTY-DELTA
outcome: APPROVED
qa_agent: qa (cycle-163)

## Commits in scope
- e510e5df — fix(MACRO-CMDTY-DELTA/mcp-server): use prev-day close for Brent/Gold delta
- fdc17265 — chore(memory/dev-mcp-server): notebook 2026-05-31 MACRO-CMDTY-DELTA session
- dab1bf86 — fix(test/DPI-3): shift test timestamps to cross-day boundary for prev-close query

---

## RE-GATE — cycle-163 (after fixer dab1bf86)

### Git scope verification — dab1bf86

Commit dab1bf86 touched exactly one file:

```
apps/mcp-server/src/__tests__/DPI-3-commodity-delta.test.ts | 6 +++---
1 file changed, 3 insertions(+), 3 deletions(-)
```

Production code confirmed untouched: `git log e510e5df..HEAD -- yahooFinance.ts` → empty.
No other source files modified. Scope is test-only as claimed.

---

### DV-1 — DPI-3 test suite (actual count: 4 tests)

File: `apps/mcp-server/src/__tests__/DPI-3-commodity-delta.test.ts`

Note on count mismatch: prior QA report (cycle-162) said "6/6 DPI-3" — that was a reporting
error; the current file contains exactly 4 `it()` blocks (confirmed via grep). The fixer's
claim of 4/4 is correct.

```
bun test DPI-3-commodity-delta.test.ts

4 pass
0 fail
13 expect() calls
Ran 4 tests across 1 file. [316ms]
```

**AC-2 PASS** — test "price up from 80 → 100 → change_pct = 25.0":
- t0 = 2026-05-28T06:00:00.000Z (previous calendar day)
- t1 = 2026-05-29T07:00:00.000Z (snapshot day)
- Asserts `change_amt ≈ 20` and `change_pct ≈ 25.0` — non-zero, meaningful delta.

**AC-3 PASS** — test "second storeCommoditySnapshot updates change_pct, not keeps stale 0":
- t0 = 2026-05-27T06:00:00.000Z, t1 = 2026-05-28T07:00:00.000Z, t2 = 2026-05-29T08:00:00.000Z
- Asserts `change_pct ≈ 25.0` (100 vs 80) then `change_pct ≈ -20.0` (80 vs 100).
- Both assertions are non-zero. No neutering detected.

**AC-5 PASS** — first-run tolerance, empty history → delta = 0. Asserts exactly 0.

**AC-2 second test PASS** — price unchanged 100 → 100 → change_pct = 0. Correct honest zero.

---

### DV-2 — 025-yahoo-finance.test.ts (YF-14/YF-15 regression guards)

```
16 pass
0 fail
54 expect() calls
Ran 16 tests across 1 file. [199ms]
```

YF-14: PASS. YF-15: PASS. No regression.

---

### DV-3 — Broader mcp-server test suite

```
10153 pass
35 skip
346 fail
11 errors
Ran 10534 tests across 950 files. [314.59s]
```

The 346 failures are pre-existing fleet-wide failures unrelated to this sprint:
- None are in DPI-3, DPI-3-commodity-delta, 025-yahoo-finance, or any yahooFinance module.
- Failure pattern: `newsHeadlinesRefreshJob`, `230-bootstrap-verify`, `089-tool-macro`,
  `247-cascade-metrics` and other unrelated modules — same pre-existing state from prior cycles.
- Commodity/delta grep across the failure output: zero hits on DPI-3, commodity-delta, or
  yahooFinance failures. The "no such table: commodity_prices_history" warnings in the fleet
  run originate from unrelated tests that do not call `initDatabase()` — a pre-existing
  isolation issue, not introduced by this sprint.

---

### DV-4 — TypeScript

```
bunx tsc --noEmit -p apps/mcp-server/tsconfig.json
EXIT: 0
```

Clean.

---

## Gate 1 — Live Production (from cycle-162, unchanged)

Observed at 2026-05-31T01:06Z (post-rebuild, first tick at 00:15:02Z):

```
=== MACRO ===
BRENT        91,12 (+0.00%)
GOLD         4.593 (+0.00%)
```

**0.00% is HONEST**: prices genuinely flat over the weekend. The new `date(fetched_at) < date(?)`
prev-close query correctly resolved 2026-05-30 close (brent=91.12, gold=4593) as the baseline,
and today's first tick is identical. This is correct production behavior — the fix IS working.
Non-zero delta will appear on the next real day-over-day price move (next trading day open).

Production image: 802d6463e665 (built from e510e5df).

---

## Gate 2 — DB cross-check (cycle-162, still valid)

| code  | price | change_amt | change_pct | updated_at |
|-------|-------|-----------|------------|------------|
| BRENT | 91.12 | 0 | 0 | 2026-05-31T00:15:02.101Z |
| GOLD  | 4593  | 0 | 0 | 2026-05-31T00:15:02.101Z |

prev-day close lookup (date < '2026-05-31'): prevBrent=91.12, prevGold=4593 at 2026-05-30T23:00.
Delta = 0 by correct arithmetic. Fix is live and correct.

---

## Verdict

**APPROVED**

All blocking issues from cycle-162 are resolved:
- DPI-3 4/4 PASS (fixer's count of 4 is correct; cycle-162 "6/6" was a QA reporting error)
- AC-2 and AC-3 now pass with cross-day timestamps; assertions remain non-zero (25%, -20%)
- No assertion neutering detected
- Production code (yahooFinance.ts) untouched since e510e5df — git scope clean
- 025-yahoo-finance 16/16 PASS — no regression
- Fleet-wide 346 failures are pre-existing, zero overlap with this sprint's modules
- tsc clean

Production status: fix live in image 802d6463e665. Brent/Gold 0.00% is honest flat-weekend
behavior. Non-zero signed delta will appear on the next real calendar-day price move.

NEXT: po EXIT
ROUTE: po (approved, close sprint)
