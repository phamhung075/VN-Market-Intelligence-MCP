# Task Context — 234e: QA Verification — e2e health polling + SLA escalation

## TLDR
change: VERIFY system observability via full test run + health polling behavior + SLA escalation firing
test: 12 assertions + e2e health polling under normal/degraded states + escalation callback verification
branch: (no code branch; review/verify only)
depends: 234d ✓ (all code merged)
knowledge_needed: [qa-checklist]

---

sprint: 234
branch: review/234e-qa
status: todo
req_ref: REQ-234
tech_ref: TECH-234

---

## [PM] Planning Context

layer: QA / system integration
depends_on: 234d ✓ (all code merged to main)

acceptance_criteria:
- Given 234a–234d all merged to main
- When `bun test src/__tests__/234-vps-health-sla.test.ts` runs
- Then all 12 assertions GREEN
- When `bun tsc --noEmit` runs
- Then no TypeScript errors
- When vpsServiceHealthJob runs (5-min cadence)
- Then vps_service_health table populated with 5 service rows
- When freshnessSlaMonitorJob runs (30-min cadence)
- Then sla_breach_audit table updated with breaches + recoveries
- When SLA breach detected
- Then escalateToCommander() fired → post_agent_signal() called
- When agents call get_vps_service_health()
- Then ASCII table returned with all 5 services + status
- When agents call get_sla_status()
- Then ASCII table returned with age + threshold + status
- When MCP tool output validated
- Then columns correct, relative times formatted (e.g., "2 min ago")
- And tool-registry.json includes 2 new tools (count = 102)

---

## QA Test Plan

1. Integration test: `bun test src/__tests__/234-vps-health-sla.test.ts`
   - All 12 assertions GREEN
   - No console errors

2. Type check: `bun tsc --noEmit`
   - 0 errors

3. Tool availability:
   - Call `get_vps_service_health('all')`
   - Verify output has 5 rows (one per service)
   - Verify columns: Service | Status | Last Poll | Response(ms) | Uptime

4. SLA breach escalation:
   - Manually insert stale market_prices (created_at = now - 20min)
   - Wait for freshnessSlaMonitorJob to run
   - Verify sla_breach_audit row created
   - Verify post_agent_signal() called with type='sla_breach'

5. Recovery detection:
   - Insert fresh market_prices (created_at = now)
   - Run freshnessSlaMonitorJob
   - Verify sla_breach_audit.recovered_at updated

6. Tool registry update:
   - Check docs/data/tool-registry.json
   - Verify toolCount incremented from 101 → 102
   - Verify 2 new tools listed

---

## Deliverable

- [ ] Test suite 12/12 GREEN
- [ ] TypeScript 0 errors
- [ ] VPS health table populated on schedule
- [ ] SLA breach audit table populated on schedule
- [ ] Escalation callback fires
- [ ] Tools return formatted tables
- [ ] Tool registry updated
- [ ] TASK_REPORT_234e.md created with verification log
