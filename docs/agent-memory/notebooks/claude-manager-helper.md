# Claude Manager Helper — Notebook

**Last cycle:** 2026-05-21T22:14:08 CEST

## Cycle 2026-05-21: Stale File Pruning + Cleanup

User request: clean all files older than 1 week (less important, keep important files).

Pass 0 (File Location) + custom janitor audit: Identified 320 stale file candidates across 4 categories:
- 5 preflight session logs from 2026-05-13 (ephemeral, not in MEMORY.md)
- 315 tool execution logs (./data/logs >7d old; 168M)
- 2 database shadow backups (.bak; obsolete)
- ~100+ /tmp/claude-501 orphans (26M collapsed sessions)

Execution complete 2026-05-21T22:14Z:
- Deleted 288 tool logs (315 → 27 recent retained)
- Deleted 2 .bak files
- Deleted 26M /tmp orphans
- Preserved: 44 notebooks (SSOT), 486 recent signals, 17 unprocessed signals, all source code

Cross-check: No 1967/1968 handoffs or OBS-1965c soak signals affected. All notebooks + active sprint state intact.

Report: docs/archive/cleanup-2026-05-21.md
Commit: 40c89b40

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
