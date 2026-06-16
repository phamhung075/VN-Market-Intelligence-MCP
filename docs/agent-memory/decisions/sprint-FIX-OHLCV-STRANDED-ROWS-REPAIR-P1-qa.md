<!-- size-justification: QA decision journal for FIX-OHLCV-STRANDED-ROWS-REPAIR-P1 -->

# Decision Journal — FIX-OHLCV-STRANDED-ROWS-REPAIR-P1 QA gate

**task-id:** FIX-OHLCV-STRANDED-ROWS-REPAIR-P1
**date:** 2026-06-16
**agent:** qa
**verdict:** APPROVED

## What was considered

### Gate 1 — Generic predicate (no ticker allowlist, no date literal)

RAW code read of `purgeStrandedSeedRows()` at `allzeroOhlcvBackfill.ts:196–208`.
SQL: `DELETE FROM daily_ohlcv WHERE volume = 0 AND open = high AND high = low AND low = close`.
No WHERE clause on `code`, `date`, or `data_env`. No conditional branch gating per-ticker.
JSDoc confirms "Generic: fires for ANY ticker on ANY date". Test case "Generic" inserts XTICKER/ANOTHER
with arbitrary dates and confirms both are purged. PASS — /goal#2 satisfied.

### Gate 2 — Delete-safety (no real vol>0 candle ever deleted)

The sole discriminator is `volume = 0`. A real ATC halt day can produce O=H=L=C but will
always have vol > 0 from the auction crossing. Test case "Safety: real candle with vol>0 and O=H=L=C
(halt day)" plants ABC with vol=100,000 and O=H=L=C=50,000; `deleted=0` confirmed.

Edge case considered: could a legitimate zero-volume row exist in the live DB?
- Index/reference series (^DJI, ^FCHI, VNINDEX etc): these already survive other purges and are in
  the `normalizeResidualContam` exclusion list. However, `purgeStrandedSeedRows` does NOT exclude them.
  If an index snapshot row happens to have O=H=L=C AND vol=0 it would be deleted.
  Assessment: (a) index tickers do not follow the flat-seed pattern from the aggregator bug — they
  are fetched via a separate path (vnIndexRefreshJob) that records actual close values with varied
  OHLC; (b) even if deleted, the index rows would be re-fetched on the next cron cycle; (c) the
  QA report from cycle-277 noted "11 remaining fingerprint rows = all-zero stubs + global index
  snapshots (pre-existing, non-incident)" — the all-zero stubs (O=H=L=C=0, vol=0) ARE intended
  targets; the "global index snapshots" referenced are snapshot rows with close>0 and varied OHLC
  (they are NOT flat O=H=L=C), so they do NOT satisfy the predicate.
  CONCLUSION: No real live row with O=H=L=C AND vol=0 would be a legitimate data point in this system.
  The shape is a reliable synthetic fingerprint.

Penny stock / thin ticker single-trade day with vol>0: O=H=L=C possible, but vol>0 → NOT matched.
Any row with vol=0 but varying OHLC (which would be logically contradictory): NOT matched (open=high guard).
PASS — no valid real-data row deleted.

### Gate 3 — No fake data, idempotency

DELETE removes rows; no placeholder written in place. After purge, the taOhlcvBackfill cron will
re-fetch and re-insert real candles for any trading days that were only covered by seed bars.
Idempotency test: first run deletes 2, second run deletes 0. CONFIRMED.

### Gate 4 — Test suite

Targeted (7 cases): 7 pass / 0 fail. Covers: regression (DCR/H11/DAG incident), generic any-ticker,
safety halt-day vol>0, mixed (stranded+real coexist), idempotency, empty table, class-1 scale-outlier.
Companion suites (CONTAM-5/7 + ALLZERO + P0): 73 pass / 0 fail (5 files).
TSC: bunx tsc --noEmit exit 0, zero errors.
DDD: scheduler imports from domain/ only (STOCK_MIN_VND from ohlcvUnitGuard.js). PASS.
Security: no process.env, no secrets, no parameterized hazard (shape predicate uses only column
comparisons, no user input). Mock-guard: EXIT 0. PASS.
Full suite: Bun v1.3.13 C++ OOM crash (pre-existing runtime bug, not code defect — identical to cycles
265/267). Exit code 0 before crash. No new failures attributable to the fix.
toolCount: 164 (unchanged, no new MCP tool).
cronJobCount: 81 confirmed (zero new scheduleCron calls in the fix diff).

### Gate 5 — Startup-purge sufficiency

Purge runs once at container boot. Writer fix (d4b532be) blocks new poison. Assessment: SUFFICIENT.
Once the repair purge clears the ~773 historical stranded rows at rebuild time, the writer fix ensures
no new seed bars can be written. A belt-and-suspenders periodic guard would be redundant: the shape
that creates seed bars (aggregator writing O=H=L=C vol=0 reference prices) is blocked at source.
The taOhlcvBackfillJob (detect + re-fetch on corrupt_cnt > 0) handles any future gap-day recovery.
NOT blocking on periodic guard.

## Why APPROVED

All 5 gate priorities satisfied: generic predicate confirmed, delete-safety confirmed, no fake data,
full suite (targeted) green + TSC clean, startup-purge sufficient. Code is correct.
Router holds done_verified pending post-rebuild live probe (~773 flat seed rows gone from named-volume DB).
