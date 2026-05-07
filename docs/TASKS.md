# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md` | **Archived Done tasks:** See `docs/TASKS_ARCHIVE.md` for complete history (1777–1848)

---

## Backlog

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|

---

## Todo

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| 1849a | SPRINT-S: Schema migration + store functions — ALTER TABLE resolution + resolved_at columns on telegram_reports, compound index on (status, resolution), markResolved() + listUnresolvedReports() + listResolvedReports() store functions, all SELECT statements fixed to project all 10 columns. 2 files, 5 new tests. **BLOCKS: 1849c**. | MEDIUM | SPRINT-S | dev-mcp-server | docs/handoffs/TASK_1849a.md | — |
| 1849b | SPRINT-S: MCP tool + serializeReport upgrade — process_telegram_report(id, resolution?, delete_telegram_message?) Zod schema with 5-value enum (none/fixed/wontfix/duplicate/monitoring), markResolved() call, serializeReport() extended to include resolution + resolved_at + claimed_by + claimed_at (C-2 SELECT gap fix). 1 file, 3 new tests, backward-compatible. **BLOCKS: 1849c**. | MEDIUM | SPRINT-S | dev-mcp-server | docs/handoffs/TASK_1849b.md | — |
| 1849c | SPRINT-S: Dev-team flow Step 4 update — split unresolved query: read new (status=new), read claimed+monitoring (resolution NOT IN fixed/wontfix/duplicate), guard Step 4 to prevent infinite monitoring loop (C-6: no Step 1 re-trigger if only monitoring), archive fixed/wontfix/duplicate reports only. 1 file (~30 lines). | MEDIUM | SPRINT-S | developer | docs/handoffs/TASK_1849c.md | 1849a, 1849b |
| 1849d | SPRINT-S: Tests + regression — extend 226-telegram-report-store.test.ts with markResolved() atomicity, listUnresolvedReports() filters, MCP tool resolution param, backward-compat (no resolution → 'none'), serializeReport() output. Run bun test; baseline ≥8804 pass, 0 fail. | MEDIUM | SPRINT-S | dev-mcp-server | — | 1849a |

---

## In Progress

| Task ID | Title | Priority | Type | Owner | Handoff | Started |
|---------|-------|----------|------|-------|---------|---------|

---

## Review

| Task ID | Title | Priority | Type | Owner | Handoff |
|---------|-------|----------|------|-------|---------|

---

## Done

Tasks completed in current sprint are archived to `docs/TASKS_ARCHIVE.md`.

---
