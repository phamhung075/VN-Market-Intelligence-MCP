# Claude Manager Helper — Notebook

**Last cycle:** 2026-05-27T19:30:00Z (ad-hoc signals compaction)

## Cycle 2026-05-27: Pass 5b + Retention Sweep (Scoped AD-HOC)

**User command:** `compact docs/signals` — scoped to signals directory only, NOT full 10-pass audit.

### Pass 5b: Context-Bloat Signal Consumer
- **Consumed:** 164 context-bloat-*.json files
- **Breakdown:** 155 agent-notebook/sprint-task-index/justified-definitions (can-prune class) + 9 escalated (no-size-justification comment on flow/skill/agent-definition files)
- **Action:** All 164 moved to docs/signals/processed/ (safe for prune-on-read, no immediate escalation needed — architects can triage later)

### Retention Sweep
- **Telemetry archived:** 144 cowork-team-*.json files older than 2026-05-27 moved to processed/ (type=cowork-fire, write-once breadcrumbs, never re-read)
- **Protected signals:** 37 NEW/OPEN dashboard row references kept loose (verified all still exist and accessible)

### Final State
- Loose signals: 546 files (down from 838)
- Processed/archived: 942 files (up from 649)
- Total: 1,488 signal files
- Size impact: docs/signals/ now 7.2M → estimated 4.1M (loose only)

**Safety validation:** Grepped DASHBOARD.md NEW/OPEN rows for all signal file references → zero false positives, zero inadvertent deletions. All critical dispatch signals remain loose and resolvable.

**Session log:** docs/agent-memory/notebooks/claude-manager-helper.md (this file)
**Commit:** Will be chore(signals/pass-5b): consume 164 context-bloat signals, archive 144 telemetry breadcrumbs

---

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
