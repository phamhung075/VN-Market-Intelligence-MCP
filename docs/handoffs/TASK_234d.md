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

- [ ] 02-financial-analyst.md updated: Step 0-c includes VPS health query before price fetch
- [ ] 04-market-watcher.md updated: Step 0-c includes VPS health query before multi-source fetch
- [ ] Decision logic documented: if service='unhealthy' → escalate to fallback chain
- [ ] Both agents call get_sla_status() after fetch to log data age
- [ ] No new code files (agent .md updates only)
- [ ] All 12 tests GREEN
- [ ] Agent .md syntax valid (Markdown OK)
