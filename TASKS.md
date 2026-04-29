# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Historical sprint details: see [docs/TASKS_ARCHIVE.md](docs/TASKS_ARCHIVE.md)

---

## Todo

| Task ID | Title | Priority | Type | Owner | Handoff |
|---------|-------|----------|------|-------|---------|
| 1395a | alertBatchGrouper.ts + server.ts send loop replacement + 11 tests | MEDIUM | feature | developer | docs/handoffs/TASK_1395a.md |
| 1396 | [UX] GAS digest: add intra-day progression label to distinguish incremental price_drop %s | LOW | ux | ba | — |

---

## In Progress

| Task ID | Title | Priority | Type | Owner | Handoff | Started |
|---------|-------|----------|------|-------|---------|---------|

---

## Review

| Task ID | Title | Priority | Type | Owner | Handoff |
|---------|-------|----------|------|-------|---------|

## Done

| Task ID | Title | Merged | Reports |
|---------|-------|--------|---------|
| JANITOR-004 | DRY: replace COMPANY_SHORT_NAME with getCompanyName (STOCK_CATALOG SSOT) | 2026-04-29 | — |
| JANITOR-005 | DRY: extract IMF_HISTORICAL_BASELINE=3.0 to imfIndicators.ts, 3 callers updated | 2026-04-29 | — |
| JANITOR-007 | DRY: Vietnamese severity label map extracted to severityLabels.ts, 5 files updated | 2026-04-29 | — |
| JANITOR-008 | DRY: LOG_ROTATE_BYTES constant in vps-lib.sh, 10 scripts sourced | 2026-04-29 | — |
| 1409a | AUDIT: Trim SPRINT_GOAL.md to ≤30 lines | 2026-04-29 | — |
| 1409b | AUDIT: Archive old sprint prose from TASKS.md to docs/TASKS_ARCHIVE.md | 2026-04-29 | — |
| 1409c | AUDIT: Create .claude/knowledge/agent-spawn-template.md | 2026-04-29 | — |
| 1409d | AUDIT: ULTRA/FULL/LITE compression policy — merged into .claude/skills/token-economy/SKILL.md Part 3 | 2026-04-29 | — |
| 1409e | AUDIT: Delete docs/agent-memory/modules/test-module-memory.md (ghost file) | 2026-04-29 | — |
| 1409f | AUDIT: Update project-stats.json — currentSprintNotes + lastUpdated + knowledgeFileCount | 2026-04-29 | — |
| 1406a | Extract pushPricesHandler.ts + server-startup.ts from server.ts | 2026-04-29 | reports/TASK_REPORT_1406f.md |
| 1406b | Extract pushForeignFlowHandler.ts from server.ts | 2026-04-29 | reports/TASK_REPORT_1406f.md |
| 1406c | Extract webhookHandler.ts from server.ts — server.ts ≤1600 lines achieved | 2026-04-29 | reports/TASK_REPORT_1406f.md |
| 1406d | server-startup.ts done (part of 1406a) | 2026-04-29 | reports/TASK_REPORT_1406f.md |
| 1406e | Decompose jobs.ts (967 lines) → cronConfig.ts + startupHelpers.ts + startScheduler.ts + 15-line barrel | 2026-04-29 | reports/TASK_REPORT_1406f.md |
| 1406f | QA sign-off: 8043 tests pass, 0 TS errors, all structural targets met | 2026-04-29 | reports/TASK_REPORT_1406f.md |

---
