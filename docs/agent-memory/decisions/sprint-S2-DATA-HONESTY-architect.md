# Decision Journal — Sprint S2-DATA-HONESTY · architect

**Sprint goal:** Data honesty and integrity across BCTC pipeline + signal confidence
**Agent:** architect
**Started:** 2026-06-24T13:12:59Z

---

### STEP architect-S1 · architect · 2026-06-24T13:12:59Z
**task-id:** FIX-REFINE-QUEUE-TERMINAL-FAILED-UNIT-HEADPOISON
**what-done:** Designed fix for BCTC refine queue head-poison (VCB permanently blocking HPG/GVR)
**what-considered:**
- (a) Extend `get_bctc_pending_refine` NOT clause: `window_status NOT IN ('DONE','FAILED')` — minimal, same layer as Fix-A
- (b) New `COMPLETE_WITH_SKIPS` status in `finalize_bctc_refine` — requires enum change + 5 BLOCKs + fleet cron aggregation update, high risk surface
- (c) `FAILED_PERMANENT` window_status variant keyed on page_type_mismatch flag — fragile string-match on JSON column, not indexed, fleet cron must classify
**why-decision:** Option (a) chosen. Minimal change to existing Fix-A clause (1 token change per branch). Index `idx_bctc_refined_units_report_status` already covers the NOT IN. VCB scenario: 20 DONE + 1 FAILED = 0 non-terminal units = excluded. Transient-FAILED docs ARE safely excluded too: if they retry successfully they become DONE (leave queue entirely); if retry still fails, staying excluded is correct. Risk-1: DV-FIX-A-2 test inversion is intentional and documented.
**why-change:** PO left mechanism choice open (a vs b). Chose (a) after confirming finalize tool's complexity makes (b) high risk.
