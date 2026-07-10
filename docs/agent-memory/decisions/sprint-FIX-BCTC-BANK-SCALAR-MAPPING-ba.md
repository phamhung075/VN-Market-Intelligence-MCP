# Decision Journal — Sprint FIX-BCTC-BANK-SCALAR-MAPPING · ba

**Sprint goal:** Bank (B02-TCTD) scalar summary obeys the accounting identity (total_assets>0, plausible net_margin_pct) for CTG/VCB, RAW-verified vs named-volume market.db. TNB audit c97 HIGH finding.
**Agent:** ba
**Started:** 2026-07-09T23:50:00Z

---

### STEP ba-S1 · ba · 2026-07-09T23:58:00Z
**task-id:** FIX-BCTC-BANK-SCALAR-MAPPING
**what-done:** Wrote REQ spec (docs/handoffs/BA-FIX-BCTC-BANK-SCALAR-MAPPING.md); live-probed CTG/VCB financial_reports + bctc_table_rows + refine_status distribution + bctc_refined_units against named-volume market.db; set next_agent=architect, zone=apps/mcp-server/.
**what-considered:**
- Treat this as a fresh independent defect and re-run a full root-cause SPIKE from zero — REJECTED: this task is a same-day (2026-06-16) near-duplicate mint of the still-`active` sprint `FIX-BCTC-BANK-SUMMARY-MAPPING`, whose architect SPIKE already pinned zone=apps/mcp-server/ only (bctc_md_tables NULL evidence ruled out pdf-extractor) and shipped W1-W4 code fixes. Re-deriving would be pure churn (project_systemic_review_0704_churn_without_convergence).
- Accept the task's own stale desc ("raw extraction now correct, 55 real varied rows for CTG/VCB") at face value — REJECTED: live probe shows CTG's CURRENT report_id (e497f7d1, parsed 2026-07-07) has ZERO bctc_table_rows, not 55 — the 55-row report the desc references (96e36139) is orphaned/superseded.
- Accept the twin sprint's W5 "operational re-ingest will fix it" framing unmodified — REJECTED/EXTENDED: live evidence shows the refine pipeline (bctc_refined_units, financial_reports.refine_status) has produced ZERO completions system-wide since 2026-06-07/07-04 (63 PENDING reports accumulated), corroborated by an independent 07-08 gateway-blind escalation naming refine_bctc_md and the 07-09 ARCH-HEADLESS-GATEWAY-COWORK-NOPOST closure brief (harness-level defect, not repo-fixable) — added as new FR-8/FR-9 + AC-15 MUST-RECONCILE input rather than silently re-running the same blocked runbook.
**why-decision:** Evidence-based framing (live docker-exec probe vs named-volume DB) over the task's own possibly-stale description, same standing precedent as the twin spec's §3.2 contest of PO's "raw extraction already correct" claim.
**why-change:** Route unchanged (ba->architect SPIKE->dev, apps/mcp-server/ zone). Scope narrowed from the task's stated "split pdf-extractor vs mcp-server" premise (already resolved by the twin SPIKE) to a lighter reconcile-and-extend SPIKE focused on the NEW pipeline-health question (FR-8/AC-15), plus flagged the duplicate-task board-hygiene issue to po/dev-team as non-blocking advisory.
