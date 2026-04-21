# Task Context — 234c: Integration — schema + jobs + tools registration

## TLDR
change: MODIFY `src/infrastructure/db/schema-system.ts` + `src/scheduler/jobs.ts` + CREATE MCP tools
test: src/__tests__/234-vps-health-sla.test.ts → 12 assertions GREEN + schema verified
branch: task/234c-integration
depends: 234b ✓ (all services GREEN)
knowledge_needed: [bundle-developer, mcp-tools]

---

sprint: 234
branch: task/234c-integration
status: todo
req_ref: REQ-234
tech_ref: TECH-234

---

## [PM] Planning Context

layer: infrastructure (schema) + scheduler (jobs) + interface (tools)
depends_on: 234b ✓ (GREEN tests + services implemented)

files_to_create:
- `src/interface/mcp/tools/system/vpsHealthTools.ts` (NEW)
- `src/interface/mcp/tools/system/slaStatusTools.ts` (NEW)

files_to_modify:
- `src/infrastructure/db/schema-system.ts` (line ~370: add 2 tables)
- `src/scheduler/jobs.ts` (line ~152: add 2 crons; line ~62: add 2 imports; line ~500: add 2 cron.schedule blocks)
- `src/interface/mcp/tools/registry.ts` (line ~74: add 2 imports; line ~140: register 2 tools)

test_file: src/__tests__/234-vps-health-sla.test.ts

acceptance_criteria:
- Given 234b GREEN tests + services
- When schema-system.ts tables created
- Then `SELECT name FROM sqlite_master WHERE type='table' AND name='vps_service_health'` returns row
- When jobs.ts cron schedules registered
- Then vpsServiceHealthJob runs every 5 min, freshnessSlaMonitorJob every 30 min
- When MCP tools registered
- Then `get_vps_service_health()` + `get_sla_status()` callable by agents
- And `bun test` shows 12 GREEN
- And `bun tsc --noEmit` passes

---

## Deliverable

- [ ] vps_service_health table created (8 columns)
- [ ] sla_breach_audit table created (9 columns)
- [ ] Both tables indexed on (service_name, signal_type)
- [ ] vpsServiceHealthPoll cron: */5 * * * *
- [ ] freshnessSlaMonitor cron: */30 * * * *
- [ ] Jobs imported + registered in startScheduler()
- [ ] Tools exported + registered in toolRegistry
- [ ] All 12 tests still GREEN
- [ ] Tool output formats correctly (ASCII tables)
