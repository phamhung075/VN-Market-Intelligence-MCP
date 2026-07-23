# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · dev-mcp-server

**Sprint goal:** Make cowork `guaranteed:true` an HONORED contract, not a false promise (see orch-state sprint_goal.entries[COWORK-GUARANTEED-SLOT-CATCHUP]).
**Agent:** dev-mcp-server
**Started:** 2026-07-23T08:57:56Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-23T08:57:56Z
**task-id:** BCTC-REPORT-ID-LOOKUP-TOOL
**what-done:** Added `get_bctc_report_id` MCP tool (ticker[+year][+quarter] -> financial_reports.id, restricted to refine_status='DONE'); wired into registry.ts + regenerated docs/data/project-stats.json#toolCount (183->184) + docs/data/tool-registry.json via the existing bun scripts/gen-tool-registry.ts + gen-project-stats.ts generators; updated bctc-analyst flow/main.md ESC-5 Step 5d to resolve report_id before calling get_bctc_refined; 5-case bun test (DONE match, not-yet-refined typed-null, no-report typed-null, non-DONE-status exclusion, multi-match ordering).
**what-considered:**
- Name `get_bctc_report_lookup` (per backlog AC-1 alt wording) vs `get_bctc_report_id` — chose the latter: matches the `get_bctc_<noun>` convention of every sibling BCTC tool (get_bctc_full/ocf/series/refined/page_text/page_image/pending_refine).
- Extend get_bctc_full's own response to also carry report_id vs a standalone lookup tool — chose standalone: get_bctc_full's JSON is publishability-gated (PUB-1..8), so a report stuck below the publish bar would still need a raw lookup path; a dedicated tool is also independently callable by ESC-5 without re-running the whole compound tool.
- Error-shape on zero matches: `{error}` (like get_bctc_refined) vs typed-absent `{report_id:null}` — chose typed-absent per task AC ("empty/typed-absent for a not-yet-refined one") + it mirrors ESC-5's own graceful "no rows = FALSE, not an error" precedent.
**why-decision:** Root cause was structural (no tool anywhere surfaced report_id by ticker+period — confirmed by reading get_bctc_full's full JSON output, which omits report_id from structured_data); a dedicated, DONE-restricted lookup tool is the minimal fix that unblocks all 4 downstream report_id-consuming tools without touching their contracts.
**why-change:** no change from task brief.
