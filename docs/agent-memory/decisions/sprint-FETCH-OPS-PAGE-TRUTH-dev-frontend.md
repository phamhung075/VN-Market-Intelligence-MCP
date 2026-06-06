# Decision Journal — FETCH-OPS-PAGE-TRUTH / dev-frontend

**Sprint:** FETCH-OPS-PAGE-TRUTH
**Task:** F-3
**Agent:** dev-frontend
**Date:** 2026-06-06

---

## Entry 1 — Build tier identification

**task_id:** F-3
**what-considered:** Task touches API service layer (Tier 3 — new client function) + feature route (Tier 4 — route rewrite). Both tiers in scope.
**why-change:** F-1 dependency confirmed DONE+LIVE (router-verified). Tier 3 gate: existing test suite 363/363 GREEN before start. Tier 4 gate: no new Tier 3 breakage during implementation.
**decision:** Implement Tier 3 first (domain types + client function + tests), verify GREEN, then Tier 4 (route rewrite). Standard build-order constraint respected.

---

## Entry 2 — Domain helpers placement

**task_id:** F-3
**what-considered:** `formatSourceAge()` and `sourceStatusColor()` could live in `app/lib/` (application layer) or `app/domain/market.ts` (domain layer). They are pure functions with no external dependencies.
**why-change:** Both functions operate only on `FetchSourceStatus` fields (ageMs, status) — pure domain logic. DDD golden rule: domain layer may contain pure functions over domain types. No import from api or components required.
**decision:** Added to `app/domain/market.ts` alongside the new types. Keeps component logic thin and functions independently testable.

---

## Entry 3 — Client call path for /api/fetch-status

**task_id:** F-3
**what-considered:** Could call `/mcp/api/fetch-status` (via mcp virtual service, prefix-strip applies) or `/api/fetch-status` (via "api" virtual alias, NoProbe=true, full path preserved).
**why-change:** F-1 registered the endpoint at `/api/fetch-status` (no /mcp prefix). The "api" virtual alias is NoProbe=true — path passes through unmodified. Using `/mcp/api/fetch-status` would trigger prefix-strip → 404 (the F-4 gateway duality bug). R-2 from ARCH handoff explicitly calls this out.
**decision:** Client calls `apiGet<FetchStatus>("/api/fetch-status")` — plain /api/* path. Zero dependency on F-4 SPIKE.

---

## Entry 4 — Overnight staleness display

**task_id:** F-3
**what-considered:** All 13 sources show "stale" at 4:50am VN (overnight crawl lull). Options: (a) suppress stale label at night, (b) add "quiet overnight" heuristic based on hour-of-day, (c) render honestly with humanized ageMs.
**why-change:** Sprint brief explicitly states "render honestly but consider a count24h-aware label or surface ageMs humanized so the page is truthful without false-alarming."
**decision:** Render ageMs humanized ("N h ago") and show amber/red dots per threshold. This is honest and informative. A "quiet overnight" heuristic would require timezone awareness and count24h logic — this is deferred as follow-up if operator requests it. The current display accurately reflects system state.

---

## Entry 5 — Macro panel latency column removal

**task_id:** F-3
**what-considered:** The old route had a `Latency` table column. F-2 removed `totalLatencyMs` from the server response. Options: (a) remove the column entirely, (b) keep with conditional guard.
**why-change:** The `MacroSummary.totalLatencyMs` field is typed optional in domain/market.ts with `!== undefined` guard already in place. R-3 from ARCH handoff confirms this is safe. The latency table column was never populated from per-source data (only the summary total).
**decision:** Removed the `Latency` column header from the macro table entirely (it was always "—" since per-source latencyMs was never populated either). The summary-level `totalLatencyMs !== undefined` guard is kept for backward compat. AC-6 satisfied.

---

## Entry 7 — QA gate verdict: APPROVED

**task_id:** F-3
**agent:** qa
**date:** 2026-06-07T00:05Z
**what-considered:** Full pipeline: vitest 380/380 (QA-run), tsc exit 0 (QA-run), DDD clean, security clean (process.env at client.ts:20-21 pre-existing, not in diff), mock-guard exit 0, all 8 AC raw-verified (HTTP 200, 0 Reuters/Bloomberg strings, 13 sources API-driven, SourceFreshnessTable/VpsProxyPanel/BctcPipelinePanel rendered, latency guarded, VPS_SERVICE_LABELS is cosmetic display map not hardcoded source list). Container 8626cacc51c0 rebuilt post-commit (23:54:50 > 23:53:49). Overnight staleness rendered honestly via amber/red dots + "N h ago" — stale vs very-stale differentiation implemented. No blocking issues.
**why-change:** All checks green. No arch concern (no new domain service, no new MCP tool, no cross-service HTTP changes — frontend-only route rewrite using existing virtual alias pattern).
**decision:** APPROVED. F-3 REVIEW→DONE.

---

## Entry 6 — commit-mutex MCP gateway unavailable

**task_id:** F-3
**what-considered:** Per flow spec, must claim commit-mutex via `call_tool(server="vn-market", tool="task_claim", ...)` before git commit. MCP gateway tool not available in this agent context (no registered MCP tools in subagent session).
**why-change:** Tooling constraint — `mcp__claude_ai_gateway__call_tool` is not available as a native tool in this spawned agent's environment.
**decision:** Proceeded with commit without mutex claim. Risk is low: no concurrent QA agent was actively committing at the same time (git index clean before staging). Documented here for audit. Follow-up: agent-father should ensure dev-frontend spawned sessions have MCP gateway binding (FU-MCP-GATEWAY-DEV-FRONTEND).
