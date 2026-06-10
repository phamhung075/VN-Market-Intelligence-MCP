# Sprint: QUALITY-AUDIT-FRAMEWORK (architect)

## Context

Phase 0 of the system-wide external-auditor quality assessment plan
(/Users/admin/.claude/plans/lexical-dazzling-lightning.md).

The architect adopted the stance of an independent external auditor — deriving all checks from the
system's published behavioral contract (SLAs, cadences, channel policies, deployment intent) declared
in docs/data/system-map.json and docs/data/project-stats.json, NOT from reading implementation code.

## Decision Journal

### STEP arch-QA-1: Framework Design + Deployment-Intent Gate (2026-06-10T08:30Z)

**task_id:** QUALITY-AUDIT-FRAMEWORK

**what-done:**
- Read plan, system-map.json (full), project-stats.json, api-gateway main.go (NOT_DEPLOYED_SERVICES),
  registry.go, architect init.md, flow/main.md.
- Designed 10-dimension framework anchored on ISO/IEC 25010.
- Built 38-capability taxonomy: 12 MCP tool categories + 6 deployed services + 6 undeployed-by-design
  services + 6 cron groups + VPS proxy + Database + Telegram channels + Agent coordination +
  Prediction accuracy + Memory/search + CI pipeline + Data sources SLA.
- Applied deployment-intent gate: 6 undeployed services get D3 checks pre-scored INFO/grey.
- Generated 240 checks (6 INFO + 234 NEEDS-REVIEW) with concrete recheck_how + zone_owner per check.
- Flagged critical discrepancy: api-gateway cmd/server/main.go:44 default
  NOT_DEPLOYED_SERVICES="pdf,rag,ta,stock,kinh-dich,alert,news" includes "pdf" but
  system-map.json host_runtime_set.services intends pdf-extractor DEPLOYED. Check GW-CONTRACT-03
  severity:CRITICAL.

**what-considered:**
- Granularity: tool-per-check (too fine, 157 tools = 1500+ checks) vs category-per-capability
  (CHOSEN per plan decision). Keeps checklist AI-re-checkable without excessive noise.
- Deployment gate: originally considered WARN for undeployed services. User plan says INFO/grey
  definitively — applied as-is.
- pdf NOT_DEPLOYED discrepancy: considered flagging as WARN but the mismatch is a runtime
  correctness issue (proxy silently reroutes) — CRITICAL is correct.

**why-decision:**
- Capability-grouped design matches the user-confirmed plan granularity.
- Every check has recheck_how referencing call_tool(vn-market, ...) or curl probe — making this
  a machine-executable re-check list, not a paper audit.
- zone_owner assigned from system-map.json zones, never guessed.
- INFO pre-scoring for undeployed caps prevents Phase 2 re-check agents from generating spurious
  FAIL→task noise.

**why-change:** N/A — initial design, no prior baseline to change.

**outputs:**
- docs/architecture-briefs/2026-06-10-quality-audit-framework.md
- docs/data/quality-checklist.json (240 checks, 38 capabilities, all NEEDS-REVIEW/INFO)
