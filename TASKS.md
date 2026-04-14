# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 078 — Active

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1192 | Evening summary empty-content fallback Telegram message | Dev | interface/scheduler | — | task/1192-evening-fallback | Review |

**WIP:** 0 In Progress.

---

## Task Details (active tasks only — Done tasks archived)

### Task 1192 — Evening summary empty-content fallback Telegram message

**Why:** The 2026-04-13 evening report was entirely empty. `eveningSummaryJob` silently
skipped the Telegram send. The user received zero market-channel feedback, making a
complete data-collection failure indistinguishable from normal operation.

**What:**
- Modify `src/scheduler/eveningSummaryJob.ts`: in the `hasContent === false` else branch,
  send a fallback market-channel message (Vietnamese, mentions `get_pipeline_health`).
- Add injectable `sendFn` parameter to `runEveningSummary` for test isolation.
- Tests in `src/__tests__/1192-evening-summary-empty-fallback.test.ts` (4 cases).

**Done when:** All tests pass, `bun tsc --noEmit` clean, empty evening always sends Telegram.
