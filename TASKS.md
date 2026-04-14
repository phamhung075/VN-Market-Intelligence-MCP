# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 076 — Active

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1190 | Pipeline Watchdog — stale-pipeline Telegram alert | Developer | scheduler | 1189 | task/1190-pipeline-watchdog | In Progress |

**WIP:** 1 In Progress.

---

### Task 1190 — Pipeline Watchdog

**Vision source:** SPRINT_GOAL.md (Sprint 076)

**BA deliverable:** `docs/REQ_1190.md` — requirement spec covering:
- Scheduler file design (`pipelineWatchdogJob.ts`, cron `*/30 * * * *`)
- Staleness gate logic (`staleMins > 90`) and 3-hour cooldown mechanism
- Telegram payload format for the work-channel alert
- Test scenarios for `src/__tests__/1190-pipeline-watchdog.test.ts`
- `cron-registry.json` update spec

---

## Task Details (active tasks only — Done tasks archived)
