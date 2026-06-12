# Decision Journal — Sprint BCTC-ANALYTICS-LAYER · dev-mcp-server

**Sprint goal:** BCTC analytics/serving layer defects — 4 clusters + publish-integrity gap
**Agent:** dev-mcp-server
**Started:** 2026-06-13T01:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-13T01:30Z
**task-id:** FIX-PENDING-REFINE-TICKER-TARGETING
**what-done:** Extended getBctcPendingRefineTool InputSchema with optional ticker + report_id params; refactored SQL into 3 branches with parameterized placeholders; updated tool doc.
**what-considered:**
- Create a separate get_bctc_windows_by_id tool (rejected: architect ruling says extend existing tool — page-text fetch + window partition logic too complex to duplicate)
- String-interpolate ticker/report_id into SQL (rejected: SQL injection risk, parameterized placeholders required per policy)
- Make report_id bypass confirm_status guard too (rejected: confirm_status guard is load-bearing per AC-4-1)
**why-decision:** Architect ruling in brief §BUG 3 and handoff §Architecture Reference both prescribe exact 3-branch SQL design; followed spec precisely.
**why-change:** No deviation from plan.
