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

- [x] vps_service_health table created (8 columns)
- [x] sla_breach_audit table created (9 columns)
- [x] Both tables indexed on (service_name, signal_type)
- [x] vpsServiceHealthPoll cron: */5 * * * *
- [x] freshnessSlaMonitor cron: */30 * * * *
- [x] Jobs imported + registered in startScheduler()
- [x] Tools exported + registered in toolRegistry
- [x] All 12 tests still GREEN
- [x] Tool output formats correctly (ASCII tables)

---

## [QA] Review Record

**verdict**: APPROVED

**blocking_issues**: []

**non_blocking**: []

**files_confirmed_clean**:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/system/vpsHealthTools.ts` (187 lines, proper I/O, no circular imports)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/system/slaStatusTools.ts` (238 lines, proper I/O, no circular imports)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/registry.ts` (both tools registered at lines 66-67)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/system/index.ts` (barrel exports added at lines 12-13)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/data/tool-registry.json` (toolCount: 104, new "VPS Health & SLA" category)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema-system.ts` (vps_service_health at lines 357-377, sla_breach_audit at lines 379-403)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/jobs.ts` (imports at lines 66-67, registrations at lines 687-700)

**test_results**:
- bun test: 12 pass / 0 fail (as expected)
- bun tsc --noEmit: 0 errors
- DDD compliance: PASS (no cross-layer imports detected)

**integration_checklist**:
- [x] vpsHealthTools.ts exports `get_vps_service_health` with correct Zod schema (service_name enum, optional, default "all")
- [x] slaStatusTools.ts exports `get_sla_status` with correct Zod schema (signal_type enum, optional, default "all")
- [x] Tool registry updated with both tools (toolRegistry lines 141-142)
- [x] Tool descriptions clear and actionable
- [x] tool-registry.json updated (toolCount 104, new category "VPS Health & SLA")
- [x] Barrel exports in system/index.ts updated (lines 12-13)
- [x] No circular imports (tools import only db + MCP SDK)
- [x] MCP tool parameter validation in place (service_name / signal_type filters with proper enum validation)

**merge_ready**: YES
