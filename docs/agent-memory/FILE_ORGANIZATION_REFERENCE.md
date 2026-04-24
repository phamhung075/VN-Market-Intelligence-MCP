---
name: File Organization Reference
description: Canonical file locations for all document types. Agents must follow this.
type: reference
---

# File Organization Reference

**Single source of truth**: CLAUDE.md → "File Organization" section + `.claude/knowledge/tree-map.md`

## Canonical Locations (ENFORCE)

### Root (ONLY 4 files allowed)
- `CLAUDE.md` — project context
- `TASKS.md` — active work Kanban
- `SPRINT_GOAL.md` — sprint objective
- `README.md` — project intro

### Logic & Rules (`.claude/knowledge/`)
Never in root, never in docs/, always in `.claude/knowledge/`

**Stable, rarely change, agents read only:**
- tree-map.md
- mcp-tools.md
- cron-jobs.md
- telegram-commands.md
- alert-policy.md
- agent-roster.md
- portfolio-schema.md
- kinh-dich-layer.md
- ask-queue-protocol.md
- dev-standards.md
- janitor-procedures.md
- market-analysis.md
- qa-checklist.md
- fail-loud-protocol.md
- restart-policy.md
- ops-incident-response.md
- vps-setup.md

### Architecture & Design (`docs/`)
**Reference documents, rarely change:**
- ARCHITECTURE.md (system design, folder tree, data flow)
- AI_TEAM_DESIGN.md (two-team design)
- IMPLEMENTATION_STATUS.md (sprint history)
- GLOSSARY_VI.md (Vietnamese financial terms)
- MICROSERVICES_DDD.md (microservices architecture + examples)
- SESSION_SUMMARY_*.md (session analysis summaries)
- TASKS_ARCHIVE.md (index of done tasks by sprint)
- VN_Market_MCP_Architecture.md (architectural overview)

### Volatile Data (`docs/data/`)
**JSON only, agents write during work:**
- tool-registry.json (tool count + list)
- cron-registry.json (scheduler count + list)
- project-stats.json (sprint, counts)
- stock-classification.json (tickers, sectors, peers)
- system-auditor-known-issues.json (dedup fingerprints)
- code-janitor-known-findings.json (dedup fingerprints)

### Task Reports & Analysis (`docs/archive/`)
**Read-only historical records:**
- ANALYST_FINDINGS_*.md
- ARCHITECT_SUMMARY_*.md
- BCTC_*.md
- DIAGNOSTIC_*.md
- EXECUTIVE_SUMMARY_*.md
- INDEX_*.md
- SPRINT_*_DELIVERY.md
- SPRINT_*_COMPLETION.md
- COWORK_REFRESH_*.md
- BRANCH_CLEANUP_*.md
- UNBLOCK_*.md
- All old reports, analysis, session files

### Reference Only (`docs/historical/`)
**Read-only, no maintenance:**
- AGENT_REWRITE_SPEC.md
- *_ANALYSIS.md
- *_INVESTIGATION.md
- *_INVESTIGATION_SUMMARY.md
- REQ_NNN.md (feature requirements)
- TECH_NNN.md (technical specs)

### Agent Memory (`docs/agent-memory/`)
**Per-agent lazy-load memory:**
- `AGENT_STARTUP.md` (startup protocol)
- `issues/` (bugs/edge cases)
- `patterns/` (code patterns)
- `modules/` (architectural modules)
- `sessions/` (work log records)

Per-agent memory should use `append_session_record()` MCP tool, NOT `Write` tool.

## Decision Tree (AGENTS: USE THIS)

When you create a document:

```
1. Is it logic/rules/procedure (DDD, coding standard, cascade rules)?
   → .claude/knowledge/FILENAME.md

2. Is it architecture/design (system design, team design)?
   → docs/FILENAME.md

3. Is it volatile data (counts, lists, JSON)?
   → docs/data/FILENAME.json

4. Is it a task report, analysis, diagnosis, old session?
   → docs/archive/FILENAME.md

5. Is it per-agent work log/memory?
   → Use append_session_record() MCP tool instead of Write tool
   → Or use update_memory_file() with record_type='issue'|'pattern'|'module'

6. Is it session analysis that should be saved for future context?
   → Save to /memory/ directory (auto-persisted)
   → Use update_memory_file() or Write to memory/*.md

DO NOT:
- Create .md files in root (except the 4 canonical ones)
- Create analysis/report files in docs/ root (use docs/archive/)
- Create logic/rules in docs/ (use .claude/knowledge/)
- Create JSON in .claude/ (use docs/data/)
```

## Recent Reorganization (2026-04-24)

Moved from root to correct locations:
- MICROSERVICES_DDD.md → `docs/`
- SESSION_SUMMARY_20260424.md → `docs/`
- 13 task reports → `docs/archive/` (ANALYST_FINDINGS, ARCHITECT_SUMMARY, BCTC_*, etc.)

All agents must follow this pattern going forward.

## Validation Checklist

Before committing a document:

- [ ] Does it belong in the identified location per decision tree above?
- [ ] Is the filename clear and time-scoped if needed (YYYY-MM-DD for sessions)?
- [ ] If in `.claude/knowledge/`, have I added a pointer to CLAUDE.md?
- [ ] If in `docs/`, have I added a pointer to CLAUDE.md?
- [ ] If logic/rules, is it in `.claude/knowledge/`, not root or docs/?
- [ ] If task report, is it in `docs/archive/`, not root?
- [ ] If session analysis, is it in `/memory/` or `docs/SESSION_SUMMARY_*.md`?
- [ ] If volatile data, is it JSON in `docs/data/`?
- [ ] Did I run `git add` + `git commit` + `git push` after creation?

## Examples

**Wrong:**
```
root/
├── MICROSERVICES_DDD.md ✗ (architecture doc in root)
├── SESSION_SUMMARY_20260424.md ✗ (session in root)
├── NEW_DDD_PATTERN.md ✗ (logic in root)
```

**Right:**
```
docs/
├── MICROSERVICES_DDD.md ✓ (architecture)
├── SESSION_SUMMARY_20260424.md ✓ (reference design)

.claude/knowledge/
├── ddd-microservices.md ✓ (logic/pattern)

docs/archive/
├── ANALYST_FINDINGS_1295.md ✓ (old task report)
└── BCTC_DISCOVERY_*.md ✓ (old analysis)

docs/data/
├── tool-registry.json ✓ (volatile)
└── project-stats.json ✓ (volatile)

memory/
├── project_microservices_architecture.md ✓ (session context)
└── reference_ddd_microservices.md ✓ (knowledge reference)
```

---

**See Also:**
- CLAUDE.md → File Organization section (enforcement rules)
- .claude/knowledge/tree-map.md → canonical DAG
- docs/TASKS_ARCHIVE.md → how to archive done tasks
