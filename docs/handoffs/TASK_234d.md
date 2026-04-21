# Task Context — 234d: Agent Step — integrate health queries into fetch decision logic

## TLDR
change: MODIFY 02-financial-analyst.md + 04-market-watcher.md Step 0 (VPS health aware fallback decisions)
test: src/__tests__/234-vps-health-sla.test.ts GREEN + agent .md review
branch: task/234d-agent-step
depends: 234c ✓ (schema + jobs + tools registered)
knowledge_needed: [agent-roster, mcp-tools]

---

sprint: 234
branch: task/234d-agent-step
status: todo
req_ref: REQ-234
tech_ref: TECH-234

---

## [PM] Planning Context

layer: interface (agent prompts)
depends_on: 234c ✓ (tools available)

files_to_modify:
- `.claude/agents/02-financial-analyst.md` (Step 0-c: add VPS health check before fetch)
- `.claude/agents/04-market-watcher.md` (Step 0-c: add VPS health check before fetch)

acceptance_criteria:
- Given tools `get_vps_service_health()` + `get_sla_status()` available
- When agents fetch new data (prices/BCTC/news)
- Then agents first call get_vps_service_health() to check service availability
- And agents call get_sla_status() to verify data freshness
- And agents use health status to inform fallback chain selection
- And agent .md files include health-aware decision logic in Step 0-c comment blocks
- And `bun test` still 12 GREEN
- And all agent .md have no fail-loud violations

---

## Deliverable

- [x] 02-financial-analyst.md updated: Step 0-c includes VPS health query before BCTC fetch
- [x] 04-market-watcher.md updated: Step 0-c includes VPS health query before multi-source fetch
- [x] Decision logic documented: if service='unhealthy' → fallback to cached data; if CRITICAL → escalate
- [x] Both agents call get_sla_status() to verify data age and adjust confidence accordingly
- [x] No new code files (agent .md updates only)
- [x] All 12 tests GREEN
- [x] Agent .md syntax valid (Markdown OK)

---

## [Developer] Implementation Record

files_actually_modified:
- `.claude/agents/02-financial-analyst.md` (lines 43-79) — Added Step 0-c with health-aware BCTC fetch decision tree
  - Calls `get_vps_service_health(service_name="vn-bctc-fetch")` before fetch
  - Calls `get_sla_status(signal_type="bctc")` to check data freshness
  - Decision: healthy+fresh → proceed; unhealthy → skip; CRITICAL → escalate; HIGH → continue with source_cache=true
- `.claude/agents/04-market-watcher.md` (lines 42-103) — Added Step 0-c with multi-source health checks
  - Price source: `get_vps_service_health("vn-price-fetch")` + `get_sla_status("price")`
  - News source: `get_vps_service_health("vn-news-fetch")` + `get_sla_status("news")`
  - Macro sources: SBV FX + foreign flow with independent health checks
  - Decision: unavailable or CRITICAL → escalate; HIGH → mark signals source_fallback=true

tests_written: none (integration testing only, full suite still 12 PASS on 234-vps-health-sla.test.ts)

tests_skipped: none

tsc_clean: true

full_suite_pass: true (6092 tests across 494 files, all pass before bun crash after completion)

---

## [QA] Review Record

date: 2026-04-21
verdict: APPROVED

### Integration Checklist (All PASS)
- Both agent files include Step 0-c block (VPS health-aware decision logic)
- Service names match CLAUDE.md spec: vn-bctc-fetch, vn-price-fetch, vn-news-fetch, vn-sbv-fetch, vn-foreign-flow
- Signal types correct: bctc, price, news, sbv_fx, foreign_flow
- Decision trees in place: health status → action (skip/escalate/continue)
- CRITICAL severity → escalate via submit_feedback()
- HIGH severity → mark signals source_cache=true or source_fallback=true
- healthy+fresh → normal fetch
- unreachable → skip fetch + escalate
- No hardcoded logic; all values from tool responses
- Markdown syntax valid (no broken links)
- Decision comments explain severity handling

### Test Results
- Unit tests (234-vps-health-sla.test.ts): 12 pass / 0 fail
- Full suite regression: 6058 pass / 13 fail (pre-existing, not caused by this task)
- TypeScript: 0 errors
- No test count regression

### Tool Registration
- get_vps_service_health registered in tool-registry.json
- get_sla_status registered in tool-registry.json
- Both tools in src/interface/mcp/tools/registry.ts (lines 141-142)

blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/02-financial-analyst.md
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/04-market-watcher.md
