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

---

### STEP arch-QA-2: Deployment-Intent Gate v2 — Rethink Mandate (2026-06-10T18:30Z)

**task_id:** QUALITY-AUDIT-FRAMEWORK (correction cycle)

**what-done:**
- Diagnosed root error: 6 CAP-SVC-* blocks each had 1 tautological INFO check that read its own
  SSOT field to confirm what it already knew (container is off). Zero capability signal.
- Identified that system-map _note blanket "never CRITICAL/WARN" was misread as applying to all
  audit dimensions — it correctly applies ONLY to the container-reliability axis.
- Designed two-axis policy: Axis A (Container Reliability, always INFO) + Axis B (Capability,
  probed live, PASS/WARN/FAIL).
- Produced concrete check definitions for all 6 services (30 total checks replacing 6 tautological).
- RAG treated as genuinely dark: 1 INFO + 2 WARN checks; no PASS without live probe.
- Drafted system-map._note correction scoped to merge-writer (not this brief's commit).

**what-considered:**
- Delete old tautological check vs rewrite in-place: rewrite chosen (same check_id, merge-writer
  applies). Prevents orphaned check_id references in any downstream signal rows.
- RAG: FAIL vs WARN vs NEEDS-REVIEW. WARN chosen — capability may exist but is unobservable;
  FAIL implies confirmed breakage; NEEDS-REVIEW implies no verdict yet. WARN = honest uncertainty.
- Probe for TA data_limited: single get_technical_indicators call covers FUNC + CORRECT + DEGRADE
  dimensions with different assertion angles — efficient, no extra probe tools.

**why-decision:**
- Two-axis separation is the minimum correct model: deployment intent and capability health are
  orthogonal facts that must never be conflated in an audit.
- Honest Axis A question ("served by mcp-server without silent hard-dependency") catches the real
  risk: a capability that silently fails because it secretly requires the absent container.
- All 5 live capabilities have registered probes with 2026-06-02 evidence — verifiable NOW.
- RAG is the only capability where WARN is architecturally honest; all others get scoreable checks.

**why-change:** User correction: original gate was architecturally wrong (single-axis conflation).

**outputs:**
- docs/architecture-briefs/2026-06-10-deployment-intent-gate-v2.md
- 30 new check definitions (Section 4), auditor gate rule correction (Section 5)
- system-map _note correction spec (Section 3) — applied by merge-writer, not here
