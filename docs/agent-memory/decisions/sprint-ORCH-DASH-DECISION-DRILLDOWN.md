# Decision Journal — Sprint ORCH-DASH-DECISION-DRILLDOWN

**Sprint goal:** Clickable DONE-task Decision-Journal drill-down (accordion) on /dashboard/orchestration.
**Started:** 2026-06-05T21:06:28Z

---

### STEP po-S1 · po · 2026-06-05T21:06:28Z

**what-done:** Wrote sprint goal ORCH-DASH-DECISION-DRILLDOWN + first BA task into orch-state.json and claimed the sprint umbrella lock; routed to BA.
**what-considered:**
- Join-key design (a) add optional task-id to STEP format vs (b) sprint-group-only vs (BOTH = router rec)
- Where /api/orchestration is served — must verify the live layer before dispatch (data-serve-integrity lesson; likely apps/mcp-server, not the not-deployed Go plane)
- Scope creep risk: editing/auth/backfill could balloon a one-feature ask
**why-decision:** Forwarded the BOTH recommendation (optional task-id for precise forward mapping + sprint fallback bucket for legacy back-compat) to architect as a confirm-not-decide item, and hard-fenced scope_out (read-only, no backfill, no new storage) to keep it one tight feature.
**why-change:** Did not pre-pick (a) vs (b) myself — join-key + serving-layer location are technical design calls that belong to architect (sprint-kickoff hands to BA→architect), not PO.

### STEP po-S2 · po · 2026-06-05T21:06:28Z

**what-done:** Applied the orch-state edit via read-full→jq→sentinel-verify→atomic mv instead of an inline in-place edit, and deliberately left .head (FIX-MW-OFFHOURS-DISPATCH) untouched.
**what-considered:**
- Inline jq in-place vs temp-file + sentinel verify
- The jq-empty-clobber footgun that has deleted this exact SSOT before (recovered fwd 9e090a90)
- head pointer currently owns an in-flight dev-team FIX — must not be repointed by a kickoff
**why-decision:** Used `[ -s tmp ]` + a 3-key sentinel (new sprint_id present AND exactly one BA task AND head still == FIX-MW) so a botched filter can never clobber the SSOT, and scoped my write to sprint_goal+task_board only.
**why-change:** Stronger than the kickoff template's bare `jq empty` guard — that guard passes empty input as valid JSON; the sentinel-key check closes that hole.
