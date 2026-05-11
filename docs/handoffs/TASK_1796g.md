# TASK 1796g — Sync project-stats.json

**Sprint:** 1796
**Wave:** 2 (depends on all Wave 1 tasks)
**Type:** FIX
**Priority:** P2
**Owner:** developer
**Estimated effort:** ~20 min

---

## Context

After Wave 1 completes (1796a through 1796f), project-stats.json must be updated to reflect the new sprint baseline. This is the SSOT for project metrics referenced by agents and reports.

---

## Acceptance Criteria

1. `docs/data/project-stats.json` is updated with the following values:
   - `currentSprint`: `1796`
   - `totalTasksDone`: `393`
   - `testBaselinePass`: `8395`
   - `testBaselineFail`: `30`
2. No other fields are changed unless they are demonstrably stale (e.g., a count that can be verified from actual state).
3. The JSON file remains valid.

---

## Files

- Primary: `docs/data/project-stats.json`

---

## Dependencies

**Blocked on:** 1796a, 1796b, 1796c, 1796d, 1796e, 1796f (all Wave 1 tasks must be Done before starting this task).

---

## Definition of Done

- [ ] `jq '.currentSprint' docs/data/project-stats.json` returns `1796`
- [ ] `jq '.totalTasksDone' docs/data/project-stats.json` returns `393`
- [ ] `jq '.testBaselinePass' docs/data/project-stats.json` returns `8395`
- [ ] `jq '.testBaselineFail' docs/data/project-stats.json` returns `30`
- [ ] `node -e "JSON.parse(require('fs').readFileSync('docs/data/project-stats.json','utf8'))"` exits 0
- [ ] Commit: `task(1796g): sync project-stats.json — sprint 1796 baseline`
