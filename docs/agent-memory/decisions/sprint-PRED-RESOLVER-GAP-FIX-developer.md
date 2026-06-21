# Decision Journal — PRED-RESOLVER-GAP-FIX
**Agent:** dev-mcp-server
**Date:** 2026-06-21
**Task:** PRED-RESOLVER-GAP-FIX

## Approach chosen

**What considered:**
- (A) Add `resolution_status TEXT` column to carry 'hit'/'miss'/'excluded'/'unresolvable' semantic labels alongside the existing INTEGER `resolution_outcome` — rejected: double-writes two columns, confusing dual source-of-truth, breaks calibrationReportJob which already filters by `brier_score IS NOT NULL`.
- (B) Change schema CHECK on `resolution_outcome` to allow value `-1` or `2` for excluded — rejected: requires DROP+recreate (no ALTER COLUMN in SQLite), risky for live named-volume DB with 9 rows.
- (C) Add plain `is_excluded INTEGER NOT NULL DEFAULT 0` column + `excludeClaim()` store function — CHOSEN: safe plain ADD COLUMN per [[feedback_sqlite_add_column_unique_silent_noop]], makes the excluded status explicit and queryable, satisfies invariant via `is_excluded=1 OR resolution_outcome IS NOT NULL`, backward-compatible (existing rows default to 0).

**Why change:** Three-leg fix mandated by PO spec in .folded_evidence: calendar-vs-trading-day mismatch in resolver (Leg 1), calendar-day producer creating unresolvable dates (Leg 2), neutral claims with no rule (Leg 3). All three legs discovered via live named-volume DB evidence (ids 1,6,7,8,9 stuck).

## Implementation record

- `alertThresholds.ts`: added `NEUTRAL_BAND_PCT = 2.0` (config, not hardcoded per PO product_decision)
- `schema-system.ts`: `ALTER TABLE prediction_claims ADD COLUMN is_excluded INTEGER NOT NULL DEFAULT 0`
- `predictionClaimStore.ts`: added `is_excluded?: number` to `PredictionClaimRow`, `ClaimDbRow`; added `excludeClaim(db, id)` function
- `predictionResolutionJob.ts`: full rewrite — `getClosePriceNearestTradingDay()` (nearest-day logic); `evaluateOutcome()` extended for neutral-band + "excluded" sentinel; main loop handles "excluded" sentinel; `markClaimUnresolvable` sets `is_excluded=1`; `PredictionResolutionResult` gains `.excluded` counter
- `evidenceTools.ts`: added `addTradingDays()` exported helper; Step 4 of `create_prediction_claim` now calls it
- Tests: `PRED-RESOLVER-GAP-FIX.test.ts` (28 new assertions); updated `1125`, `1154`, `1124` tests

## tsc: clean (exit 0)
## Full suite: 13359 pass / 42 skip / 59 fail (59 = pre-existing disjoint set, none overlap changed files)
## REBUILD_REQUIRED: yes
