# Sprint Goal

## Sprint 1409 — Audit Remediation (2026-04-28)

**Status:** ACTIVE — PO self-initiated from system-auditor findings (6 anomalies, all severity: warn).

**Background:**
System auditor (2026-04-28) flagged 6 housekeeping anomalies: two oversized tracking files, one CLAUDE.md size cap breach, one missing knowledge SSOT, one stale directory with ghost files, and one stale stats entry. No functional regressions; all fixes are purely structural/documentation. Highest actual risk is the missing token-economy.md — agents that lazy-load it will fail loud.

**Scope:**

| Task ID | Title | Owner | Size |
|---------|-------|-------|------|
| 1409a | Clear SPRINT_GOAL.md (replace with current sprint header) | claude-manager-helper | XS |
| 1409b | Archive Done rows (sprints 1356–1392) from TASKS.md to docs/TASKS_ARCHIVE.md | claude-manager-helper | S |
| 1409c | Extract "Main Terminal Spawn Template" block from CLAUDE.md to .claude/knowledge/ | claude-manager-helper | XS |
| 1409d | Create ULTRA/FULL/LITE compression policy — merged into .claude/skills/token-economy/SKILL.md Part 3 | developer | S |
| 1409e | Delete 3 ghost files from docs/agent-memory/modules/ | claude-manager-helper | XS |
| 1409f | Update project-stats.json — currentSprint + testBaseline to actuals | claude-manager-helper | XS |

**Success Metrics:**
- SPRINT_GOAL.md: <= 30 lines
- TASKS.md: <= 80 lines; Done rows for 1356–1392 moved to TASKS_ARCHIVE.md
- CLAUDE.md: <= 120 lines; spawn template block replaced with pointer to knowledge file
- .claude/skills/token-economy/SKILL.md Part 3: ULTRA/FULL/LITE agent pipeline policy (merged, no separate knowledge file)
- docs/agent-memory/modules/: directory empty (scheduler.md, test-module-memory.md, tool-usage-stats.json deleted)
- project-stats.json: currentSprint=1409, testBaseline reflects actual passing count

**Blockers:** None.
