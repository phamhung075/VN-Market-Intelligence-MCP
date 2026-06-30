# Decision Journal — Sprint FIX-CASCADE-MACRO-CARD-REAL-DETAIL · architect

**Sprint goal:** Redesign per-stock "Tác động Macro" cascade card to show real fetched detail for every stock
**Agent:** architect
**Started:** 2026-06-19T04:33:00Z

---

### STEP architect-S1 · architect · 2026-06-19T04:33:00Z
**task-id:** FIX-CASCADE-MACRO-CARD-REAL-DETAIL
**what-done:** Designed fix for 3 confirmed defects: type filter ignored, empty stub rows served, test fixtures in prod DB.
**what-considered:**
- D-1 type filter: strict `chain_catalyst` only vs. expand to include `urgent_news`; expanded chosen (live data shows `urgent_news` rows carry equally rich macro finding_data for FPT/VCB/HPG)
- D-2 stub fix: (A) stop writing correlation rows (breaks C-08), (B) add `is_correlation_stub` column marker, (C) read-layer filter on empty `verified_decision` rows, (D) separate table; chose B+C combination (belt-and-suspenders; C handles pre-migration rows, B makes intent explicit)
- D-3 hygiene: migration script with triple-guard narrow DELETE (LIKE + signal_type + finding_data='{}') vs. manual; script chosen (idempotent, loggable, replayable)
**why-decision:** B+C is safest — C works immediately on 137 existing stubs without waiting for migration, B prevents re-pollution by future writers explicitly. D-4 two-table design would break C-08 query rewrite, out of scope.
**why-change:** no change from plan; SQLite `ADD COLUMN UNIQUE` lesson applied (plain ADD COLUMN only)
