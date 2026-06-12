# Decision Journal — Sprint BCTC-ANALYTICS-LAYER · architect

**Sprint goal:** BCTC analytics layer quality — fix refine/finalize state machine deadlock + confidence + targeting
**Agent:** architect
**Started:** 2026-06-12T22:00:00Z

---

### STEP architect-S1 · architect · 2026-06-12T22:00:00Z
**task-id:** FIX-FINALIZE-STATUS-STUCK-PARTIAL / FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE / FIX-PENDING-REFINE-TICKER-TARGETING
**what-done:** Brownfield read of finalizeBctcRefineTool.ts / getBctcPendingRefineTool.ts / bctcFullTools.ts / bctcSectionCompleteness.ts / bctcRefineJob.ts; confirmed 3 root causes; issued state-machine ruling.
**what-considered:**
- BUG1: (a) remove BEQ-7 guard; (b) add new `DONE_PARTIAL` status; (c) fix queue predicate to exclude fully-processed PARTIAL reports; (d) return effective_status in response
- BUG2: (a) recompute confidence at finalize from row coverage; (b) make PUB-5 coverage-aware at serve time
- BUG3: (a) add ticker+report_id params to existing tool; (b) create new tool
**why-decision:** BUG1 → paths (c)+(d) together; BEQ-7 guard is correct and must stay (server owns completeness invariant); the bug is queue-predicate not detecting "all windows DONE but section-incomplete PARTIAL". BUG2 → path (a): recompute at finalize; PUB-5 must stay a persistent-column gate (not serve-time computed) because extraction_confidence is read by 5+ consumers — making only PUB-5 coverage-aware leaves the frozen stale value wrong elsewhere. Weighted section-presence formula (0.4+0.4+0.2) is auditable and uses already-invoked checkSectionCompleteness result. Guard: only overwrite if refined_confidence > current to protect good OCR signal. BUG3 → path (a): extend existing tool; no new tool needed, no logic duplication.
**why-change:** PO tasked architect to rule before 19th dev patch (recurring-bug-escalation gate). Brownfield confirms BEQ-7 is the status override; queue SQL is the deadlock mechanism. No prior architect ruling existed for this specific code path combination.
