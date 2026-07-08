# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · architect

**Sprint goal:** no goal set (sprint_id resolved from orch-state; no matching sprint_goal.entries description found)
**Agent:** architect
**Started:** 2026-07-08T00:00:00Z

---

### STEP architect-S1 · architect · 2026-07-08T00:00:00Z
**task-id:** FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM
**what-done:** Round-2 brownfield probe (live container RAW-query, not local decoy DB) found Writer H (`handlePushOhlcvHistory`, `/api/push-ohlcv-history`) never migrated to `writeOhlcvBatch` — actively re-contaminating up to yesterday, ~15-30min cadence. Appended findings to handoff + brief.
**what-considered:**
- Redesign repair predicate as boundary/discontinuity date-scan — REJECTED: flat cold-start seed bars (volume>0, confirmed live) would corrupt a boundary-scan's "clean data starts here" assumption.
- Keep existing per-row anchor-ratio predicate (order-independent, no boundary needed) — CHOSEN, already safe by construction.
- Fix Writer H locally (duplicate cross-day check inline) vs migrate to writeOhlcvBatch — CHOSEN migrate (DRY, reuses SSOT chokepoint, no new duplicated logic).
**why-decision:** Live evidence (VHM/VIC anchor=flat-seed value, numerically correct per PO) proves ratio-predicate math stays safe without redesign; Writer H migration closes the actual active leak with minimal diff, non-overlapping with stalled P0's narrower Rule-5 coercion fix on the same file.
**why-change:** Original 2026-06-30 design assumed CONTAM-10-WRITER (ohlcvWriteService.ts) alone would close the class — did not account for Writer H bypass; corrected in Round 2 with a new sequential EXEC gate on WRITER-H.
