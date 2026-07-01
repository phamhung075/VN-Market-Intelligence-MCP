# Decision Journal — Sprint FIX-BCTC-BANK-SUMMARY-MAPPING · ba

**Sprint goal:** Bank (Mẫu B02-TCTD) financial_reports scalar summaries serve PLAUSIBLE, accounting-identity-consistent numbers generically or HARD-BLOCK as honest-NULL — never serve labeled-garbage (3rd re-fire, recurrence-escalation).
**Agent:** ba
**Started:** 2026-07-01T17:30:00Z

---

### STEP ba-S1 · ba · 2026-07-01T17:32:18Z
**task-id:** BA-FIX-BCTC-BANK-SUMMARY-MAPPING
**what-done:** Wrote REQ spec + 13 numbered ACs (docs/handoffs/BA-FIX-BCTC-BANK-SUMMARY-MAPPING.md); live-probed CTG/VCB/FPT/VNM against named-volume market.db; set next_agent=architect with SPIKE mandate.
**what-considered:**
- Accept PO's "raw extraction already correct" claim at face value — REJECTED: live probe shows CTG 20/55 (36%) code=NULL garbled rows vs VCB 0/57.
- Treat identity-serve-guard gap as regression — REJECTED: guard's own test docstring self-scopes to get_financial_summary only; classified never-fired/scope-gap.
- Use VNM 2026-Q1 (assets=0) as 2nd corrupt-bank AC-7 case — REJECTED: 0 raw rows/PENDING = FIX-BCTC-ENRICH-SILENT-0ROWS territory, out of scope.
**why-decision:** Evidence-based framing prevents the SPIKE from re-treading PO's possibly-stale assumption; contradicting evidence must reach architect, not be silently absorbed.
**why-change:** No sprint-scope change. Added compare_financials as a 3rd unguarded serve path (grep-confirmed) to co_owner_scope/AC-4, beyond the sprint's originally-named get_bctc_full gap.
