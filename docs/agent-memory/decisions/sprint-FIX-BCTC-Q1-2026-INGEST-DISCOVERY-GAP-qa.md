# Decision Journal — Sprint FIX-BCTC-Q1-2026-INGEST-DISCOVERY-GAP · qa

**Sprint goal:** Expose BCTC refine-layer stall in fetch-status endpoint (visibility fix)
**Agent:** qa
**Started:** 2026-06-27T09:50:00Z

---

### STEP qa-S1 · qa · 2026-06-27T09:50:00Z
**task-id:** FIX-BCTC-Q1-2026-INGEST-DISCOVERY-GAP
**what-done:** Ran full QA pipeline on f1998b7c — adversarial regression check revealed 12 new failures
**what-considered:**
- Accept dev's "122 pre-existing" claim at face value (rejected — memory lesson: never trust dev badges)
- Run targeted F-1 only (rejected — ci-subset-verify-misses-full-suite lesson)
- Run full suite + cross-check all failing files against f1998b7c git delta (chosen)
**why-decision:** Full suite found 118 fail (vs prior baseline ~104). Adversarial check: FIX-BCTC-VPS-QUEUE-STALE-TRIAGE (5 fail) + CLEAN-DEAD-SOURCE-IDS (7 fail) both use handleFetchStatus with makeDb() that lacks financial_reports table. f1998b7c added refine_pending query on financial_reports — throws "no such table" → catch returns 500 → result.bctcPipeline = undefined. Both test files last-touch commits predated f1998b7c (pre-existing passing). CHANGES_REQUESTED.
**why-change:** Dev claimed all failures pre-existing; adversarial check proves 12 are genuine regressions from the fix itself missing DDL updates in 2 test files.
