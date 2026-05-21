# Handoff — TASK_1967-11: Recurring-bug-escalation freeze no review cadence (ITEM-13)

**Task:** 1967-11 | **Sprint:** 1967c | **Severity:** MED | **Status:** BLOCKED-until-1954c-gate | **Size:** XS+XS

---

## Summary

Recurring-bug-escalation freeze policy has no time-bound review gate. BCTC tasks remain blocked indefinitely without a scheduled architect review cadence. 1954c has been blocked since 2026-05-19 (>48h as of audit).

---

## Evidence

**Brief cross-link:** `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md` § ITEM-13

**Repro path:line:** 
- SPRINT_GOAL.md E-7: "BCTC freeze since 1954c gate"
- DASHBOARD.md 1953-G-FAIL row: "DO-NOT-DISPATCH 1953e/h — recurring-bug-escalation freeze"
- 1954c blocked since 2026-05-19 (>48h as of audit)

---

## Current Behavior

- Freeze policy: "DO NOT dispatch BCTC-path fixes until 1954c (consolidation) lands"
- No timeout mechanism: 1954c can remain blocked indefinitely
- No scheduled review cadence
- PO/architect have no trigger to revisit freeze decision

---

## Expected Behavior

- Freeze policy includes timeout: "if freeze > 72h → system-auditor emits `freeze-timeout` DASHBOARD alert to po section"
- PO either extends freeze (with justification) or dispatches architect review
- Automated escalation prevents indefinite stalls

---

## Proposed Fix

**Part 1 (agent-father):** Add to recurring-bug-escalation policy doc (e.g., `docs/policies/recurring-bug-escalation-freeze.md`):
```
## Freeze Timeout Rule
If a freeze remains active for >72h without new evidence or architect decision, system-auditor emits a `freeze-timeout` DASHBOARD alert to ## po.
PO must then:
1. Review the freeze justification
2. Extend freeze (with updated rationale) OR
3. Close freeze and dispatch architect review on the underlying bug root-cause
```

**Part 2 (dev-mcp-server):** system-auditor D5/D-N dimension: monitor DASHBOARD freeze rows for age > 72h → emit DASHBOARD row `freeze-timeout: {freeze_id}` to ## po

**Zone:**
- `docs/policies/recurring-bug-escalation-freeze.md` or similar (agent-father)
- `docs/agents/system-auditor/audit-dimensions.md` D-N (dev-mcp-server)

**Blast radius:** BCTC block no longer indefinite; forces periodic PO decision-making

**Dependency chain:** `depends_on: 1954c-gate` — this task is conditional on 1954c; if 1954c closes the freeze naturally, this task becomes N/A

---

## Acceptance Criteria

1. [ ] Recurring-bug-escalation freeze policy includes 72h timeout rule + escalation action
2. [ ] system-auditor D-N dimension added: age > 72h → `freeze-timeout` DASHBOARD alert
3. [ ] Test: freeze DASHBOARD row created with ts > 72h ago → system-auditor detects + alerts ✓
4. [ ] Test: freeze DASHBOARD row closed before 72h → no alert ✓
5. [ ] DASHBOARD ## po receives freeze-timeout row on next system-auditor cycle (D5, ~3h after 72h threshold)

---

## Owner & Zone

- **Primary:** agent-father (policy doc)
- **Secondary:** dev-mcp-server (system-auditor dimension)
- **Zone:** `docs/policies/`, `docs/agents/system-auditor/`
- **Model:** claude-haiku-4-5-20251001

---

## Blocked By

- **1954c-gate:** This task is conditional. If 1954c closes the freeze before this task starts, the task may be cancelled. PM should wait for 1954c signal before dispatching.

---

## Notes

- This is a policy + automation task, not a bug fix
- Complies with REQ-1967-7 (drive-to-fix invariant): freeze policy gains a timeout mechanism
- Part 1 (policy doc edit) can proceed anytime
- Part 2 (system-auditor dimension) depends on 1954c-gate remaining open long enough to justify the automation

---

## Related

- REQ-1967-7 (cross-cutting policy + orchestration)
- ITEM-13 (same finding)
- 1954c (BCTC consolidation design, gates this task's necessity)
