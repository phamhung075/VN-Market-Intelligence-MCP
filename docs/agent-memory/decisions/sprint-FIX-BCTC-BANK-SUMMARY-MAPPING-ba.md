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

### STEP ba-S2 · ba · 2026-08-25T00:20:00Z
**task-id:** FIX-BCTC-BANK-SUMMARY-MAPPING
**what-done:** Re-dispatch cycle 2 (row re-fired despite W1-W5 + 3 follow-on fixes all shipped/QA-approved). Re-read all 4 prior architect briefs before re-probing; live RAW-traced root cause to `bctc_refined_units` (CTG+VCB 100% FAILED, `agent_error:no_spawn_path_option_y`, frozen 2026-06-15) permanently excluded from retry by an already-shipped anti-headpoison guard in `getBctcPendingRefineTool.ts`. Confirmed all 2026-07 parser/classifier fixes still present at HEAD, unexercised against real CTG/VCB content. Reconfirmed OWNER_DECISION=dev-mcp-server (`bctc_md_tables` has 1 row DB-wide). Wrote FR-1..FR-4, 0 blockers, NEXT=architect.
**what-considered:**
- Trust the router dispatch prompt's evidence block as "currently being served" — REJECTED after live-verify: it is the pre-guard stored scalar row; a real `get_bctc_full(CTG)` call is hard-blocked today (guard confirmed wired + firing).
- Re-run the full 07-01/07-03 root-cause recon from scratch — REJECTED: all 3 stacking bugs those SPIKEs found are demonstrably still fixed in code (grep-confirmed); re-deriving would duplicate settled work and waste the architect's SPIKE budget.
- Treat this as a duplicate to close (per the 07-03 brief's own recommendation #4 to mark the stub superseded) — REJECTED: that recommendation predates today's evidence that CTG/VCB were NEVER actually re-processed by the fixed pipeline at all (retry-eligibility gap), so the row's underlying defect (implausible bank scalars) is still live and unresolved, just for a different reason than any prior cycle diagnosed.
**why-decision:** Every live probe point (guard wiring, refined_units status, flag literal, pending-refine exclusion query, bctc_md_tables count) was independently re-verified against the named-volume DB or grep'd from source at HEAD, not carried forward from stale docs.
**why-change:** Scope narrowed from cycle 1's broad "root-cause SPIKE" to a targeted retry/reset-mechanism SPIKE — the broad recon is done and its fixes shipped; only the retry-eligibility gap is unaddressed.
