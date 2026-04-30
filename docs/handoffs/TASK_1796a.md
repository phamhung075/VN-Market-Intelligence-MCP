# TASK 1796a — Archive closed sprints in SPRINT_GOAL.md

**Sprint:** 1796
**Wave:** 1 (parallel)
**Type:** FIX
**Priority:** P2
**Owner:** developer
**Estimated effort:** ~30 min

---

## Context

SPRINT_GOAL.md has grown beyond 30 lines due to accumulation of closed sprint entries. It must be trimmed to stay useful as a quick-glance reference.

---

## Acceptance Criteria

1. SPRINT_GOAL.md is 30 lines or fewer after the change.
2. Only the current sprint (1796) and any active/in-progress sprint goal remain.
3. All closed sprint entries are either deleted or moved to docs/TASKS_ARCHIVE.md (or similar archive file). Do not delete historical data — move it if it has value.
4. File remains valid Markdown.

---

## Files

- Primary: `SPRINT_GOAL.md`
- Secondary (if archiving): `docs/TASKS_ARCHIVE.md`

---

## Dependencies

None — Wave 1, no blocking tasks.

---

## Definition of Done

- [ ] `wc -l SPRINT_GOAL.md` returns <= 30
- [ ] Current sprint goal is still present
- [ ] No information loss (archived if needed)
- [ ] Commit: `task(1796a): archive closed sprints — SPRINT_GOAL.md under 30 lines`
