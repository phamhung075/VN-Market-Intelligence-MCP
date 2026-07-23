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
---

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-23T15:01:12Z
**task-id:** MD-FUNC-01-FIX
**what-done:** Verified `get_market_snapshot` (marketTools.ts) already emits a `vn_index{price,change_pct,direction}` struct from live `fetchVnIndex()` data (VNDirect vnmarket_prices), fixed under commit 815ccaedd/ddc36452e; confirmed by live gateway call (`mcp_call get_market_snapshot {}`) returning `vn_index:{price:1699.38, change_pct:1.85, direction:"up"}` — non-null, plausible, matches breadth block (189 adv/122 dec). No code change needed.
**what-considered:**
- Re-implement fix from scratch vs verify existing implementation — chose verify-only after `git log -- marketTools.ts` showed the exact "MD-FUNC-01 FIX" comment already committed 2026-06-16, predating the currently-running container image (built 2026-07-22), so the fix is live, not stale.
- Trust schema comment vs re-derive from a live payload — per task directive, called the live tool through gateway (not just reading the test file) to authoritatively confirm all 3 fields non-null.
**why-decision:** Root-cause check confirmed no defect exists (field present, correctly mapped, dynamically derived from live changePct sign — not hardcoded); re-doing the fix would be redundant churn.
**why-change:** no change from task brief — outcome is "no fix needed", documented per dispatch instructions.

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-07-23T15:35:00Z
**task-id:** ALT-FUNC-02-FIX
**what-done:** Verified `get_alert_accuracy` already emits top-level `accuracy_rate:number|null in [0,1]`, fixed under commit `815ccaedd` (2026-06-10, comment "ALT-FUNC-02 FIX"); live gateway call (`mcp_call get_alert_accuracy {}`) returned `accuracy_rate:1, insufficientSample:false, scored_pct:19, total:628, hits:110`. `docs/data/quality-checklist.json` ALT-FUNC-02 already `status:"PASS"` since 2026-06-10T18:00Z citing this same fix commit — backlog row `ALT-FUNC-02-FIX` was created 09:27 UTC same day, ~10h BEFORE the fix landed at 17:24 UTC, and was never pruned. No code change.
**what-considered:**
- Re-derive/patch accuracy_rate vs verify existing contract — chose verify-only: `git log -- alertAccuracy.ts` shows the exact null-when-insufficient contract already shipped and covered by 3 dedicated tests (`1982-quality-burndown-CHIJ.test.ts` "FIX 3 — ALT-FUNC-02").
- Treat live `insufficientSample:false`+`accuracy_rate:1` as sufficient AC proof vs demanding a non-null value under ALL conditions — chose the former: AC only requires the *available* rate be in [0,1]; null-on-zero-scoreable is the documented, tested, already-QA-passed contract for the data-gap case.
**why-decision:** Stale-signal orphan backlog row (BOUNDED-1 auto-picked a pre-fix snapshot 6 weeks old); re-implementing would be redundant churn against an already-PASS, already-tested contract.
**why-change:** no change from task brief — outcome is "no fix needed, stale backlog row", documented per dispatch instructions (route data-gap distinctly per task's own fallback clause; here there IS no data gap live).
