# Task Context — 234b: GREEN — VPS health + SLA checker domain services + jobs

## TLDR
change: CREATE `src/domain/services/vpsHealthPoller.ts` + `src/domain/services/freshnessSlaChecker.ts` + scheduler jobs + escalation callback
test: src/__tests__/234-vps-health-sla.test.ts → 12 assertions GREEN
branch: task/234b-green-impl
depends: 234a ✓ (test file exists)
knowledge_needed: [bundle-developer, dev-standards, circuit-breaker-registry, rate-limiter]

---

sprint: 234
branch: task/234b-green-impl
status: todo
req_ref: REQ-234
tech_ref: TECH-234

---

## [PM] Planning Context

layer: domain (poller, checker) + scheduler (jobs)
depends_on: 234a ✓

files_to_create:
- `src/domain/services/vpsHealthPoller.ts` (NEW)
- `src/domain/services/freshnessSlaChecker.ts` (NEW)
- `src/scheduler/system/vpsServiceHealthJob.ts` (NEW)
- `src/scheduler/system/freshnessSlaMonitorJob.ts` (NEW)

files_to_modify:
- `src/domain/services/index.ts` (barrel export: add 2 exports)

test_file: src/__tests__/234-vps-health-sla.test.ts

acceptance_criteria:
- Given test file from 234a (RED state)
- When `bun test src/__tests__/234-vps-health-sla.test.ts` runs
- Then all 12 assertions GREEN
  - pollVpsServiceHealth() returns 5 HealthPollResult objects
  - vps_service_health table exists with 8 columns
  - price/BCTC/news/SBV/foreign-flow SLA breaches detected
  - escalateToCommander() fires on breach
  - sla_breach_audit.recovered_at updated on recovery
  - get_vps_service_health() tool returns ASCII table
  - get_sla_status() tool returns ASCII table
  - DDD compliance verified
  - Circuit breaker wraps all HTTP
  - 60-min cooldown enforced
  - Partial failures handled

---

## Deliverable

- [ ] vpsHealthPoller created + tested
- [ ] freshnessSlaChecker created + tested
- [ ] vpsServiceHealthJob created
- [ ] freshnessSlaMonitorJob created
- [ ] escalateToCommander() callback working
- [ ] All 12 tests GREEN
- [ ] `bun tsc --noEmit` passes
- [ ] Branch merged after 234c
