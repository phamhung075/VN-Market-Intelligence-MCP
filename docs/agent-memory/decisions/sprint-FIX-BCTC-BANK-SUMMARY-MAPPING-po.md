# Decision Journal — Sprint FIX-BCTC-BANK-SUMMARY-MAPPING · po

**Sprint goal:** Bank (Mẫu B02-TCTD) financial_reports scalar summaries must serve PLAUSIBLE, accounting-identity-consistent numbers generically across ALL bank tickers — or HARD-BLOCK as honest-NULL / confidence=0 — never a labeled-garbage reading (CTG 2026Q1: total_assets=0 with total_liabilities=24.7B, net_margin_pct=229157%, identity 100% violated, served at conf 56% with a "Validation FAILED" label). No-fake-data goal #1.
**Agent:** po (po-s136)
**Started:** 2026-07-01T17:15Z
**Recurrence class:** feedback_recurring_bug_escalation — P1, 3rd re-fire over 15 days (2026-06-16 mint PO-s70, 2026-06-21 reconfirm, 2026-07-01 ESC-2 signal bca-20260701T151500Z). Dev-team dispatcher PROMOTED this row per PO's own 2026-07-01 escalation recommendation.

---

### STEP po-S1 · po · 2026-07-01T17:15Z
**task-id:** BA-FIX-BCTC-BANK-SUMMARY-MAPPING
**what-done:** Self-initiated + opened the PROMOTED sprint — wrote the sprint_goal vision + minted the BA cascade-kickoff to ready[] (next_agent=ba, zone=multi, type=FIX, P1) + routed head to ba, via scripts/po-s136 → orch-apply.sh (rc=0; Zod PASS; 98 pre-existing SHG coherence warnings, 0 new). Claimed sprint umbrella lock `task:FIX-BCTC-BANK-SUMMARY-MAPPING` (sprint-task, ttl 3600) under session 3340d049 to mark ownership.
**what-considered:**
- **Patch vs SPIKE-first** — chose SPIKE-first because this is a 3rd re-fire (feedback_recurring_bug_escalation: 2+ re-fires same module → block until root-caused). Embedded the SPIKE mandate in the BA kickoff (`spike_first` + `spike_mandate`): BA/architect must pin LIVE (compare_financials/get_bctc_full CTG vs VCB vs FPT/VNM via gateway) WHY VCB(bank) parses clean but CTG(bank) corrupts, and DECIDE the owning zone before any code patch.
- **Owning zone** — the scalar aggregator (`bctcScalarAggregator.ts`, bank-aware B02-TCTD mapping with a ~1% accounting-identity check) AND the identity serve-guard (`reports.ts`, "CORRUPT DATA — SKIP") both physically live in apps/mcp-server → dev-mcp-server is the primary suspect. But raw table extraction lives in the separate apps/pdf-extractor Python app, so a CTG-specific row/scale/layout parse variant is the alternative. Set zone=multi so the architect SPLITs per the SPIKE verdict rather than pre-committing.
- **Serve-guard gap (co-owner)** — FIX-BCTC-IDENTITY-SERVE-GUARD (merged 62ef64fe: total_assets<=0 → confidence=0 [CORRUPT DATA — SKIP]) is NOT firing on the bank-form labeled-serve path (CTG served conf 56% + "Validation FAILED" despite assets=0 with non-zero liabilities = exactly the guard condition). Added dev-mcp-server co-owner scope: determine regressed / never-fired-on-bank-form / bypassed, and hard-block — never serve labeled garbage.
- **backlog[] vs ready[]** — chose ready[] (po-s135 precedent: promoted/prioritized → immediate cascade-kickoff; dev-team cron adopts). Left the pre-existing FIX implementation row in backlog[] untouched (architect/pm pull it in AFTER the SPIKE); WIP stays 0 — this is PLANNING, not in_progress.
- **head** — set (next_agent=ba) per the coordination brief, GUARDED to only overwrite when head is idle or already ours, so the peer session f981431d (owns DASH-CRON-RECHECK-TABLE, ARCH-* in ready) is never clobbered. Head was idle at kickoff.
**why-decision:** A 3rd re-fire of a served-data-integrity defect demands root-cause pinning before code; the SPIKE + generic-fix (isBankFormFromRows, no allowlist) + serve-guard hard-block + verification gate (CTG+VCB plausible, identity holds, magnitudes sane, non-regression FPT/VNM) are carried verbatim into the ACs so the fix cannot be re-declared "done" without RAW-live proof on the named-volume market.db.
**why-change:** no change from plan — dispatcher promoted the row; PO scoped + self-initiated the SPIKE-first cascade and did exactly that. PO does NOT spawn — dev-team cron adopts the ready BA task.
