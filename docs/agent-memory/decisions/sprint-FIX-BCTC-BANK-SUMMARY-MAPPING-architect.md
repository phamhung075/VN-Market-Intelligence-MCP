# Decision Journal — Sprint FIX-BCTC-BANK-SUMMARY-MAPPING · architect

**Sprint goal:** Bank (B02-TCTD) financial_reports scalar summaries MUST serve plausible, accounting-identity-consistent numbers generically across all bank tickers, or hard-block as honest-NULL — never serve labeled garbage. /goal#1 no-fake-data.
**Agent:** architect
**Started:** 2026-07-01T17:40:00Z

---

### STEP architect-S1 · architect · 2026-07-01T18:20:00Z
**task-id:** ARCH-FIX-BCTC-BANK-SUMMARY-MAPPING
**what-done:** Ran AC-1 live SPIKE (docker exec against named-volume market.db, cross-referenced with serve-path source code since `mcp__gateway__call_tool` was unreachable from this session); wrote brief `docs/architecture-briefs/2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING.md`; appended Brownfield Findings to BA handoff.
**what-considered:**
- (A) Accept BA §3.2 at face value (CTG-specific row corruption, VCB clean) — REJECTED after extended probe: "Tổng tài sản" row absent from `bctc_table_rows` for BOTH CTG and VCB; VCB's correct total_assets traced to a luck-driven non-bank-aware initial extractor, not a working bank row-mapper.
- (B) Route split per sprint default (`route_to: dev-pdf-extractor`) — REJECTED: `bctc_md_tables` (pdf-extractor bridge table) is NULL for both current report_ids; corruption signature fully reproduced by mcp-server's `refinedMarkdownParser.ts` on agentic-refine-sourced markdown. Pinned dev-mcp-server as sole zone.
- (C) Treat `bctcScalarAggregator.ts` as the defect (per sprint's original title "SCALAR summary garbage") — REJECTED: mapping logic is structurally sound (documented truth table, generic discriminator) but has zero production evidence because upstream row data never existed; reclassified as upstream-starved not broken.
**why-decision:** Live `bctc_md_tables` NULL check + `parseRefinedMarkdown` code-path reproduction of the exact corruption shape is direct, falsifiable evidence pointing to mcp-server-owned agentic-refine pipeline, not pdf-extractor's deterministic OCR.
**why-change:** Overrides BA/PO's provisional `route_to: dev-pdf-extractor` default per AC-1's explicit charter ("BA does NOT pin the final verdict — that is the architect SPIKE's explicit job"). Flagged RISK-2 (medium confidence, not absolute) with a cheap confirmatory check for dev-mcp-server before large investment.
