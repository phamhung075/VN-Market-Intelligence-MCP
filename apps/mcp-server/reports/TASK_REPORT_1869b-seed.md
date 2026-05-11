# TASK_REPORT_1869b-seed — Watchlist alert_drop_pct Migration

**Date:** 2026-05-11
**Sprint:** 1869
**SHA:** 44d5bf2c
**Branch:** task/1869b-seed-alert-drop-defaults (merged main)

---

## AC Verification

| AC | Criterion | Result |
|----|-----------|--------|
| AC1 | Migration exists in standard location | PASS — `seedWatchlist.ts` `migrateWatchlistThresholds()` |
| AC2 | All rows non-null after migration | PASS — AC4 test verifies 0 null rows |
| AC3 | Standard rows = -7.0 | PASS — AC2/AC2b tests; full scenario: 25 standard rows |
| AC4 | High-vol (NVL, DPM, REE, VNH, KBC, MWG, TCH) = -9.0 | PASS — AC3/AC3b; highVol=7 verified |
| AC5 | Idempotent: re-run = 0 standard updates | PASS — AC5/AC5b tests; guard `WHERE alert_drop_pct IS NULL OR = -3` |

---

## Implementation

**Files changed:**
- `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` — added `migrateWatchlistThresholds()`, exported `HIGH_VOL_TICKERS`, `STANDARD_DROP_PCT`, `HIGH_VOL_DROP_PCT`
- `apps/mcp-server/src/infrastructure/db/schema.ts` — imported and called `migrateWatchlistThresholds(db)` in post-init migrations section
- `apps/mcp-server/src/__tests__/1869b-seed-watchlist-thresholds.test.ts` — 10 new tests (AC1–AC6 + full 25+7 scenario)

**Sign convention confirmed:** negative values (`-7.0`, `-9.0`) as per 1869b wiring.

**alert_rise_pct note:** Column exists (schema default 5). No defaults needed — `5` is already the correct/intended default for all tiers. Not included in migration scope.

---

## Test Results

- New test file: **10 pass / 0 fail**
- Full suite: **9153 pass / 16 fail** (16 failures pre-existing: Task 178 + legacy tests, not caused by this change)
- Baseline post-1869b: 9148 pass (+5 new tests net vs baseline)

---

## Deviations from Handoff

| Deviation | Reason |
|-----------|--------|
| No SQL file in `migrations/` folder | No migrations folder exists. Pattern is TypeScript functions in `seedWatchlist.ts` + post-init section in `schema.ts`. Matched existing codebase convention exactly. |
| Handoff brief shows positive 7.0/9.0 | Task clarification: actual values are -7.0/-9.0 (negative). Implemented correctly. |
| HIGH_VOL_TICKERS not in WATCHLIST_SEED | NVL, DPM, REE, VNH, KBC, MWG, TCH are not in the 25-ticker seed. Migration runs on production DB contents at startup — affects any rows present in watchlist, not just seed rows. |
