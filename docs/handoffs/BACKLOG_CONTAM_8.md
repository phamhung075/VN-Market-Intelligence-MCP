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
