# TASK 1409a — Trim SPRINT_GOAL.md to ≤30 lines

**Sprint:** 1409 — Audit Remediation
**Tier:** 2 (runs after Tier 1 tasks 1409b–1409e complete)
**Owner:** claude-manager-helper
**Priority:** HIGH
**Type:** chore
**Estimated effort:** ~15 min

---

## Context

SPRINT_GOAL.md currently has 32 lines. The standard cap is 30 lines. This is a minor trim — remove or consolidate the 2 excess lines without losing any meaningful content.

---

## Acceptance Criteria

1. `wc -l SPRINT_GOAL.md` returns ≤ 30
2. The current sprint header (Sprint 1409) is present and accurate
3. No prior sprint history is inlined — prior sprint references belong in docs/TASKS_ARCHIVE.md
4. File is valid Markdown (no broken headings, no orphaned bullets)

---

## Files

- `SPRINT_GOAL.md` — trim in place

---

## Instructions

1. Read SPRINT_GOAL.md
2. Identify the 2+ excess lines (likely repeated summary sentences or padded blank lines)
3. Remove or consolidate until line count is ≤ 30
4. Verify the current sprint goal for Sprint 1409 is still clearly stated
5. Do NOT add new content — this is a reduction task

---

## Definition of Done

- SPRINT_GOAL.md line count ≤ 30
- Content still accurately describes Sprint 1409 goal
- Committed with message: `task(1409a): trim SPRINT_GOAL.md to ≤30 lines`

---

## Dependencies

- Blocked by: 1409b (archive must complete first so SPRINT_GOAL.md does not reference archived content)
- Blocks: none
