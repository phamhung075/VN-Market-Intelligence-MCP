# BREAKDOWN: 1847d Alert Accuracy Feedback Loop

**Architect Design:** docs/handoffs/ARCH_1847d.md
**Spec:** docs/REQ_1847d.md
**Status:** 4 atomic developer tasks ready

---

## Task Decomposition

### TASK-1847d-A — Infrastructure (READY NOW)
**Owner:** dev-alert-engine | **Status:** IN PROGRESS (started 2026-05-06)

| Item | Count |
|------|-------|
| Files modified | 2 |
| Files created | 0 |
| Tests | 5 |
| Blocking | 1847d-B, 1847d-C, 1847d-D |

**Scope:**
- `schema-alerts.ts` — 3 idempotent ALTER TABLE columns (outcome, outcome_at, outcome_detail) + index
- `alertStore.ts` — readPendingOutcomeAlerts() + writeAlertOutcome() store methods

**Handoff:** docs/handoffs/TASK_1847d-A.md

---

### TASK-1847d-B — Domain (READY AFTER 1847d-A)
**Owner:** dev-alert-engine | **Status:** BLOCKED by 1847d-A

| Item | Count |
|------|-------|
| Files created | 1 + 1 test |
| Tests | 14 unit tests |
| Blocking | 1847d-C |

**Scope:**
- `alertOutcomeScorer.ts` (NEW) — Pure functions, zero infra imports
  - classifyAlertType(signalsJson, message) → AlertClassification
  - scoreAlertOutcome(classification, alertPrice, windowPrices, calendarDaysElapsed) → OutcomeResult
- Types: AlertOutcome, AlertClass, AlertClassification, PricePoint, OutcomeResult
- Test coverage: 14 unit tests (classification logic + 3 outcome types + edge cases)

**Handoff:** docs/handoffs/TASK_1847d-B.md

---

### TASK-1847d-C — Scheduler (READY AFTER 1847d-A & 1847d-B)
**Owner:** dev-alert-engine | **Status:** BLOCKED by 1847d-A, 1847d-B

| Item | Count |
|------|-------|
| Files created | 1 job + 1 test |
| Files modified | 2 (startScheduler.ts, cronConfig.ts) |
| Tests | 8 integration tests |
| Blocking | none (parallel with 1847d-D) |

**Scope:**
- `alertOutcomeJob.ts` (NEW) — Daily cron scheduler (08:45 UTC, weekdays only)
  - runAlertOutcomeJob(deps?) → AlertOutcomeJobResult
  - Orchestrates: read pending → classify → score → batch write
  - BLK-3: Telegram digest for position-danger HITs
  - Price queries: inline DB access (same pattern as signalOutcomeJob)
  - Transaction: single batch write with idempotency guard
- `startScheduler.ts` — import + wire job to cron schedule
- `cronConfig.ts` — add alertOutcomeJob cron expression with env fallback
- Test coverage: 8 integration tests (pending alerts, eval window, batch write, idempotency, etc.)

**Handoff:** docs/handoffs/TASK_1847d-C.md

---

### TASK-1847d-D — Interface (READY AFTER 1847d-A; PARALLEL with 1847d-C)
**Owner:** dev-mcp-server | **Status:** BLOCKED by 1847d-A only

| Item | Count |
|------|-------|
| Files modified | 1 (alertAccuracy.ts) + index |
| Files created | 0 |
| Tests | 8 integration tests |
| Blocking | none |

**Scope:**
- `alertAccuracy.ts` upgrade (existing file, same file)
  - `handleGetAlertAccuracy()` — dual-path scoring
    - Fast path: read outcome from DB when outcome IS NOT NULL
    - Fallback: on-demand scoreAlert() when outcome IS NULL
    - NEW output: summary_by_type breakdown (position-danger / watchlist-opportunity / price-signal / composite / unscoreable)
  - `registerMarkAlertOutcomeTool()` (NEW)
    - Input: alertId, outcome (hit/miss), notes (optional), force (optional)
    - Guard: reject if outcome already set AND force!=true
    - Write: UPDATE without WHERE outcome IS NULL if force=true
- `alerts/index.ts` — register both tool functions
- Test coverage: 8 integration tests (DB outcome read, on-demand fallback, summary breakdown, mark rejection, force override)

**Handoff:** docs/handoffs/TASK_1847d-D.md

---

## Task Dependency Graph

```
1847d-A (INFRA)
  ├→ blocks 1847d-B (DOMAIN)
  │  └→ blocks 1847d-C (SCHEDULER)
  │
  ├→ blocks 1847d-C (SCHEDULER)
  │
  └→ blocks 1847d-D (INTERFACE)

1847d-C (SCHEDULER) — can run parallel with 1847d-D after 1847d-B done
```

**Critical path:** 1847d-A → 1847d-B → 1847d-C
**Parallel opportunity:** 1847d-D after 1847d-A (does not depend on 1847d-B)

---

## Execution Summary

| Task | Type | Owner | Files | Tests | Deps | Order |
|------|------|-------|-------|-------|------|-------|
| 1847d-A | INFRA | dev-alert-engine | 2 modify | 5 | none | 1st ✓ (IN PROGRESS) |
| 1847d-B | DOMAIN | dev-alert-engine | 1 new | 14 unit | 1847d-A | 2nd |
| 1847d-C | SCHEDULER | dev-alert-engine | 1 new + 2 modify | 8 integ | 1847d-A, 1847d-B | 3rd |
| 1847d-D | INTERFACE | dev-mcp-server | 1 modify | 8 integ | 1847d-A | 2nd (parallel) |

**WIP Strategy:**
- Start 1847d-A now (dev-alert-engine)
- When 1847d-A merged: launch 1847d-B (dev-alert-engine) + 1847d-D (dev-mcp-server) **in parallel** — 2 agents, WIP=2 ✓
- When 1847d-B done: launch 1847d-C (dev-alert-engine)
- Pipeline: 1847d-A DONE → (1847d-B + 1847d-D in parallel) → 1847d-C DONE

---

## Test Summary

| Task | Unit | Integration | Total |
|------|------|-------------|-------|
| 1847d-A | — | 5 (schema + store) | 5 |
| 1847d-B | 14 | — | 14 |
| 1847d-C | — | 8 (job logic) | 8 |
| 1847d-D | — | 8 (tool logic) | 8 |
| **TOTAL** | **14** | **21** | **35** |

**Baseline:** ~8763 pass (before 1847d)
**Expected after 1847d:** ~8763 + 35 = **~8798 pass** (0 new fail)

---

## File Change Matrix

| File | 1847d-A | 1847d-B | 1847d-C | 1847d-D | Type |
|------|---------|---------|---------|---------|------|
| schema-alerts.ts | ✓ | — | — | — | MODIFY |
| alertStore.ts | ✓ | — | — | — | MODIFY |
| alertOutcomeScorer.ts | — | ✓ | — | — | CREATE |
| alertOutcomeJob.ts | — | — | ✓ | — | CREATE |
| startScheduler.ts | — | — | ✓ | — | MODIFY |
| cronConfig.ts | — | — | ✓ | — | MODIFY |
| alertAccuracy.ts | — | — | — | ✓ | MODIFY |
| alerts/index.ts | — | — | — | ✓ | MODIFY |
| 1847d-alert-outcome-scorer.test.ts | — | ✓ | — | — | CREATE |
| 1847d-alert-outcome-job.test.ts | — | — | ✓ | — | CREATE |

**Total files:** 4 modify, 4 create = 8 files (matches ARCH spec)

---

## Success Criteria

- [ ] 1847d-A: 5 tests pass, schema migration idempotent, store methods query/write correctly
- [ ] 1847d-B: 14 unit tests pass, zero infra imports (grep domain imports only), classifyAlertType/scoreAlertOutcome logic validated
- [ ] 1847d-C: 8 integration tests pass, job runs < 5s for 500 alerts, batch write atomic, Telegram notify non-fatal
- [ ] 1847d-D: 8 integration tests pass, get_alert_accuracy 2-path logic validated, mark_alert_outcome force guard tested
- [ ] `bun test` suite: 0 new failures, ≥8798 pass (AC-10 from REQ_1847d)
- [ ] tsc: clean (no type errors)
- [ ] All 4 handoff docs completed and linked in docs/TASKS.md

---

## Handoff Files

- **TASK_1847d-A.md** → /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/handoffs/TASK_1847d-A.md
- **TASK_1847d-B.md** → /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/handoffs/TASK_1847d-B.md
- **TASK_1847d-C.md** → /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/handoffs/TASK_1847d-C.md
- **TASK_1847d-D.md** → /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/handoffs/TASK_1847d-D.md

---

*Breakdown complete. 1847d-A in progress. Ready for dev-alert-engine to start.*
