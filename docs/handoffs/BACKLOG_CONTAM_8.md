---
id: BACKLOG_CONTAM_8
sprint: OHLCV-UNIT-CONTAM
status: QUEUED
created_at: 2026-06-12T11:00:00Z
scope: OUT_OF_SCOPE_CONTAM_SPRINT
---

# BACKLOG ITEM — All-Zero-Rows Defect Investigation

## Summary

**Status:** QUEUED (out-of-scope for OHLCV-UNIT-CONTAM sprint per binding amendment 2026-06-12T07:53:30Z)

Separate defect discovered during contamination analysis: bulk rows with `open=0, high=0, low=0, close=0` (all zeros) in daily_ohlcv, dated 2026-05-30T11:47Z. This is a distinct issue from the mixed-unit contamination (CONTAM-1..7).

## Context

- **When found:** 2026-05-30T11:47Z
- **Pattern:** Rows with all OHLC fields = 0
- **Scope:** Multiple tickers in the contamination corpus
- **Impact:** Low-priority (zeros are easily detectable; does not cause calculation corruption like mixed-units)
- **Root cause:** Unknown — likely a data write path edge case or aggregation failure

## Investigation Scope

1. **Identify the write path** that generated all-zero rows
   - Check Writer A (pushPricesHandler) — did it ever upsert with zero prices?
   - Check Writer C (aggregator) — did it ever derive zero from empty tick set?
   - Check Writers B/D/E — did any upstream source deliver zero values?

2. **Determine impact** on downstream consumers
   - Are zeros propagated to `franceSummaryJob`?
   - Do they affect any analytics/ratios?

3. **Repair path** (if needed)
   - One-shot DELETE or RESET (set to NULL or regenerate from ticks)?
   - Prevent future zero generation at source?

## Work Items (Sketch)
- [ ] Query DB: `SELECT COUNT(*) FROM daily_ohlcv WHERE open=0 AND high=0 AND low=0 AND close=0` (find extent)
- [ ] Trace data lineage: which writer created these rows?
- [ ] Root cause: missing data in upstream API? Type-casting bug? Aggregation edge case?
- [ ] Fix: patch the source writer + clean up existing rows
- [ ] Test: ensure guards (CONTAM-1..7) prevent future zeros

## Notes
- **CONTAM-6 binding amendment:** Repair migration script must SKIP all-zero rows (defensive) without crashing
- **Not urgent:** Zeros don't corrupt calculations; prioritize CONTAM-1..7 first
- **Standalone:** Can be investigated independently after main contamination sprint

## Next Steps
1. OHLCV-UNIT-CONTAM sprint completes (CONTAM-1..7 deployed)
2. PO reviews backlog
3. If prioritized, create full decomposition with dev-mcp-server
4. Likely owner: dev-mcp-server (same codebase as CONTAM sprint)

## Related
- CONTAM-6: repair script includes safety guard `WHERE NOT (open=0 AND low=0 AND high=0 AND close=0)`
- CONTAM-7: sanity check job could flag zeros as distinct issue for future triage

---

## [QA] Review Record — 2026-06-14T08:22:00Z

**verdict:** APPROVED → done_verified
**impl_commit:** 9088c052
**verified_by:** qa (cycle-265)

**Checks:**
- G1 Targeted: bun test ALLZERO-OHLCV-FETCH.test.ts → 5 pass / 0 fail / 17 expect() / 574ms. All 5 AC green.
- G2 TSC: bun tsc --noEmit → 0 errors.
- G3 Full suite: 12,942 tests / 1,083 files — Bun v1.3.13 C++ OOM crash post-completion (pre-existing runtime bug, not a code defect). Zero failures from ALLZERO files.
- G4 DDD: PASS. scheduler→domain import (ohlcvUnitGuard.js) permitted. interface→infra import (logger.js) permitted. domain layer has zero infra imports.
- G5 Security: PASS. No process.env, no secrets. All SQL parameterized (? placeholders). No shell injection.
- G6 Generic: PASS. purgeAllZeroRows uses predicate open=0 AND high=0 AND low=0 AND close=0 across ALL tickers — no per-ticker hardcode. normalizeResidualContam uses predicate close>0 AND close<STOCK_MIN_VND(100) AND NOT IN (INDEX_TICKERS) — no per-ticker hardcode.
- G7 Idempotency: PASS. purge deletes 0 rows on re-run. normalize close<100 guard excludes already-normalized rows (×1000 >> 100).
- G8 Mock-guard: PASS (exit 0).
- G9 BCTC regression: PASS. No bctc_table_rows touched.
- G10 Live (router + ops pre-verified): VCB 2026-06-01 close=62,200 confirmed. SHB/VCB/FPT BB-width 0.88%/1.92%/2.14% — all well under 15% acceptance threshold. Zero-candle absent.

**unblocks:** FIX-FE-CHART-PRICE-DOMAIN (dev-frontend) — handoff: docs/handoffs/FIX-FE-CHART-PRICE-DOMAIN.md
