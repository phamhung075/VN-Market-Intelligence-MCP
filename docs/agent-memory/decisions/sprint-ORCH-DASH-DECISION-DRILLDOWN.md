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

### STEP ba-S1 · ba · 2026-06-05T21:10:02Z

**what-done:** Confirmed serving layer for /api/orchestration is apps/mcp-server (orchestrationHandler.ts), NOT the undeployed Go api-gateway plane; scoped F2 accordingly.
**what-considered:**
- Undeployed Go api-gateway plane (routes :4000) — ruled out by prior sprint note and by api.orchestration.tsx proxy target :3000
- apps/mcp-server:3000 orchestrationHandler.ts (chosen) — confirmed by direct code read: api.orchestration.tsx → :3000/api/orchestration → orchestrationHandler.ts
**why-decision:** Data-serve-integrity lesson mandates verifying the LIVE layer before dispatch; mcp-server proxy chain is code-confirmed and matches the OSC-4c A2 pattern already in production.
**why-change:** No change from router recommendation — confirms it rather than overriding.

### STEP ba-S2 · ba · 2026-06-05T21:10:02Z

**what-done:** Adopted BOTH join-key strategies (optional task-id field in STEP format for forward precision + sprint fallback bucket for legacy back-compat) and made that the F1 acceptance gate.
**what-considered:**
- Sprint-level grouping only (option b) — works with existing data, zero format change, but coarse (all decisions for a sprint show under every DONE task)
- Per-task-id only (option a, forward-only) — precise but leaves all legacy entries orphaned with no clean display path
- BOTH (router recommendation, chosen) — precise forward entries map to their task row; legacy/untagged entries surface under a sprint fallback bucket; no crash on missing data
**why-decision:** Sprint fallback bucket is mandatory for zero-crash on the existing corpus; task-id field is mandatory for the feature to be non-trivially useful going forward; the two are non-conflicting and together satisfy the PO success_metric.
**why-change:** No change from router recommendation; router already forwarded this as "architect confirms" rather than "architect decides."

### STEP ba-S3 · ba · 2026-06-05T21:10:02Z

**what-done:** Decomposed the sprint into three atomic sub-tasks (F1/F2/F3) with full AC, DDD layers, and dependency chain; wrote spec to docs/handoffs/ORCH-DASH-DECISION-DRILLDOWN-BA-spec.md; created architect task in backlog.
**what-considered:**
- Splitting F2 into API-parse + DTO-extension as separate tasks — rejected (they are one transaction: the handler must both parse journal md and extend its DTO atomically; splitting creates a window where the endpoint returns stale data)
- Rolling F1 (format change) into F2 (API parse) — rejected (F1 owner is agent-father / skill layer, F2 owner is dev-mcp-server; different zones and different deploy surfaces)
- Blocking F3 hard on F1 merge — chosen because the Remix loader type must match the new DTO field; a partial F2 deploy without the decisions key would cause a TypeScript type error in the loader
**why-decision:** Each leg has a distinct zone owner and a clear data dependency: F1 produces the STEP format contract, F2 consumes it server-side and extends the API contract, F3 consumes the API contract client-side; this ordering eliminates ambiguity about who unblocks whom.
**why-change:** No deviation from the intent given by the router; decomposition granularity is finer than the three rough legs in the PO task note (adds explicit acceptance criteria and DDD layer tagging per BA flow step 2).
