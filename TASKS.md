# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 110 — Active

| ID | Title | Status |
|----|-------|--------|
| 1335 | fix(news-pipeline): diagnose and fix zero rag_analyses rows in production | Review |
| 1336 | test(news-pipeline): TDD test 1335-news-pipeline-rag-insert.test.ts | Review |

---

## Sprint 109 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1334 | chore(tasks): archive stale task detail blocks + fix sprint status entries | Done |

---

## Sprint 108 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1332 | test(source-health): TDD test 1332-pollnews-source-display-name.test.ts — written FIRST | Done |
| 1333 | fix(source-health): add SOURCE_DISPLAY_NAMES map to pollNews — record health under display name | Done |

---

## Task Details (active tasks only)

### 1334 — chore(tasks): archive stale task detail blocks

**Branch:** `task/1334-tasks-cleanup`
**Layer:** docs
**Depends on:** none
**Status:** Todo
**Role:** Dev

**Root cause:** TASKS.md task details section contains 8 completed task blocks (1332, 1333, 1331, 1330, 1329, 1327, 1326, 1328) — ~275 lines of stale content. These slow agent reads and create WIP confusion. SPRINT_GOAL.md Sprint 108 header still reads "PLANNING" though Sprint 108 is COMPLETE.

**Files to modify:**
- MODIFY: `TASKS.md` — remove task detail blocks for all Done tasks (1332, 1333, 1331, 1330, 1329, 1327, 1326, 1328). Keep only the Sprint 109 task detail block.
- MODIFY: `SPRINT_GOAL.md` — update Sprint 108 header from "PLANNING" → "COMPLETE", add completion date
- MODIFY: `SPRINT_GOAL.md` sprint history table — update Sprint 102 row from "PLANNING" → "COMPLETE 2026-04-15"
- APPEND: `docs/TASKS_ARCHIVE.md` — paste the 8 removed task detail blocks under a "Sprint 105-108 task details" section

**Acceptance Criteria:**
- `TASKS.md` task details section has only the Sprint 109 task (1334) or is empty after 1334 completes
- `SPRINT_GOAL.md` Sprint 108 shows COMPLETE
- `docs/TASKS_ARCHIVE.md` contains the archived detail blocks
- `bun tsc --noEmit` 0 errors (no code changes, TypeScript unaffected)
- Full suite: 0 new failures (no code changes)
