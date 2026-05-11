# Claude Manager Helper — Notebook

**Last cycle:** 2026-05-11

## Cycle 2026-05-11: File Location Audit + Size Cap Cleanup

Pass 0 violation: 6 TASK_*.md files created at root instead of reports/. Auto-fixed and moved to reports/TASK_1872a-{1..6}.md.

Pass 5: SPRINT_GOAL.md exceeded 30-line limit (56 → 43 lines). Removed Sprint 1849 (kept last 3 closed sprints). TASKS.md still 120+ lines — Done section has 47 rows and needs archival to TASKS_ARCHIVE.md (recommended: keep only current cycle 1872a + 2-3 recent in Review).

Tree-map.md validated: all 30+ pointers exist. Recent addition: docs/architecture/ subtree (global.md + 8 microservices + 12 mcp-server tool groups) for SSOT hardening sprint 1872a.

## Recurring Patterns

### watch: TASKS.md bloat
Done section grows without cleanup. Recommend: dev-team or PM batch-archive tasks older than 7 days to TASKS_ARCHIVE.md before end of sprint.

### watch: agent-roster.md agent counts
Hardcoded numbers drift quickly. Always replace with pointer to `docs/data/project-stats.json`.

### watch: SPRINT_GOAL.md
PO often adds closed sprint rows without removing old ones. Trim to keep ≤30 lines (last 3 closed sprints only).
