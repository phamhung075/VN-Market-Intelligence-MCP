---
sprint: COWORK-GUARANTEED-SLOT-CATCHUP
branch: task/cowork-catchup-10-runbook-doc
size: S
zone: docs/
depends_on: [TASK-COWORK-CATCHUP-9]
blocks: []
next_agent: agent-father
---

## TLDR
FR-10 doc-only (continued from TASK-COWORK-CATCHUP-9). **ROUTED TO:** `agent-father` (existing doc owner per `cowork-master-cron-runbook.md` header). Update `guaranteed` semantics + `last_fired` staleness-check note (now reconciler-backed, not dispatch-stamped). Pure documentation, no code changes. Coordination: developer completes code TASK-1..9, then agent-father integrates this doc-only subtask into the cron-runbook handoff.

## [PM] Planning Context
- **Zone:** `docs/`
- **Next Agent:** `agent-father` (existing doc owner)
- **Acceptance Criteria:**
  - [ ] AC-8: Cron runbook guaranteed semantics + last_fired reconciliation note updated
  - [ ] AC-9: All 6 consolidated rows closed together (5 fixed rows + umbrella task)

- **Files to modify (by agent-father):**
  - `docs/protocols/cowork-master-cron-runbook.md`:
    - Update `guaranteed` semantics section: mirror the new contract definition from cowork-schedule.json (delivery within window OR structured miss)
    - Update `last_fired` staleness-check note: "With the adoption of reconciler-backed `last_fired` (§2026-07-22 sprint COWORK-GUARANTEED-SLOT-CATCHUP, FR-7), the timestamp now reflects delivery-proof (claimed_at from published-marker task_claim) rather than spawn-dispatch time. This means `last_fired` staleness is the ground truth for catch-up detection: a stale-stamped run (pre-2026-07-22 artifact or a run that never reached its publish gate) will correctly re-match on the next tick."

- **Knowledge needed:**
  - Architecture brief §5 + FR-10 (cowork-master-cron-runbook.md is FR-10 doc touch point)
  - Existing cowork-master-cron-runbook.md structure and owner pattern
  - Coordination with developer's TASK-1..9 completion

## RETURN (after completion — by agent-father)
- [ ] docs/protocols/cowork-master-cron-runbook.md semantics + last_fired note updated (AC-8)
- [ ] Part of AC-9 closure (all 6 consolidated rows closed together)
- [ ] Decision journal entry: sprint-COWORK-GUARANTEED-SLOT-CATCHUP-agent-father.md § STEP fa-T10
