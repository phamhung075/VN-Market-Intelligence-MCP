# Task Context — 234a: TDD RED — VPS health SLA test suite (12 assertions)

## TLDR
change: CREATE `src/__tests__/234-vps-health-sla.test.ts` with 12 failing test skeletons (RED phase)
test: 12 assertions covering VPS polling, SLA breaches, schema, escalation callback, recovery, tool output
branch: task/234a-red-test
depends: none
knowledge_needed: [bundle-developer, dev-standards, qa-checklist]

---

sprint: 234
branch: task/234a-red-test
status: todo
req_ref: REQ-234
tech_ref: TECH-234

---

## [PM] Planning Context

layer: application / test
depends_on: none

files_to_create:
- `src/__tests__/234-vps-health-sla.test.ts`

acceptance_criteria:
- Given test file with 12 skeletons
- When `bun test src/__tests__/234-vps-health-sla.test.ts --bail` runs
- Then all 12 tests FAIL with RED output
  - AC-1: pollVpsServiceHealth returns 5 results
  - AC-2: vps_service_health table schema correct
  - AC-3: price SLA breach (>10min)
  - AC-4: BCTC market-hours threshold
  - AC-5: escalateToCommander callback fires
  - AC-6: recovery detection updates audit table
  - AC-7: get_vps_service_health tool formatted
  - AC-8: get_sla_status tool formatted
  - AC-9: DDD no infrastructure imports
  - AC-10: circuit breaker wraps HTTP
  - AC-11: 60-min cooldown
  - AC-12: partial failures escalate only breached type

---

## Deliverable

- [ ] File created: `src/__tests__/234-vps-health-sla.test.ts`
- [ ] 12 test stubs
- [ ] `bun test` shows RED
- [ ] `bun tsc --noEmit` passes
