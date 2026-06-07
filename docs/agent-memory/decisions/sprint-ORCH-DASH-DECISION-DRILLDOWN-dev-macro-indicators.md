# Decision Journal — Sprint ORCH-DASH-DECISION-DRILLDOWN · dev-macro-indicators

**Sprint goal:** ORCH-DASH-DECISION-DRILLDOWN
**Agent:** dev-macro-indicators
**Started:** 2026-06-08T01:30:00Z

---

### STEP dev-macro-indicators-S1 · dev-macro-indicators · 2026-06-08T01:30:00Z
**task-id:** FIX-MACRO-GO-FIXTURE-FALLBACK
**what-done:** Extended `effrStaleBound` in repositories.go from 96h to 168h (7 days). Added 3 tests: `TestFetchFedFundsRateFromDB_WeekendSim` (infra layer), `TestWeekendSim_BridgedDBValueServed` (AC-1 end-to-end), `TestWeekendSim_FixtureOnlyWhenBothFail` (AC-2). Rebuilt and verified live service serves fedFundsRate=3.62 with source_tier=2, is_estimate=false.
**what-considered:**
- Option A: extend `effrStaleBound` from 96h to 168h — covers worst-case FRED business-day gap (Mon publication + 4-day holiday weekend = 7 days). Minimal change, zero structural risk.
- Option B: add a separate "stale-but-present" code path returning tier 3 for rows between 96h and 168h, preserving existing 96h as tier-2 window. More precise provenance but adds structural complexity and a new tier not present elsewhere in the codebase.
- Option C: remove the staleness gate entirely for EFFR (never reject a DB row, always use it). Simplest but wrong — a multi-week-old rate after a FRED API outage would still be served as "live".
**why-decision:** Option A chosen. The 96h bound was undersized for real FRED publication patterns: FRED last published on 2026-06-03 (Tuesday) and the service was checked on 2026-06-08 (Sunday) = 120h, which exceeds 96h. 168h (7 days) is the correct industry-standard window for a daily-published series that only updates on business days. Option B adds unnecessary tier complexity — the task spec accepts "tier 2/3" with no requirement to distinguish them in the existing code. Option C is over-permissive.
**why-change:** No deviation from task spec. The fix is exactly the root cause: the staleness gate was too tight, causing valid DB rows to be rejected on weekends.
