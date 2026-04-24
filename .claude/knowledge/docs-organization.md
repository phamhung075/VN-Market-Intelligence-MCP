# Docs Organization — Quick Reference

**Updated:** 2026-04-25 | **Status:** Active enforcement

## File Placement Rules

When creating a new `.md` file, use this decision tree:

```
┌─ Is it logic, rules, or policy?
│  └→ .claude/knowledge/*.md
│
├─ Is it session analysis or agent memory?
│  └→ /memory/*.md (via MCP tool, not Write)
│
├─ Is it core architecture/design (used weekly)?
│  └→ docs/*.md (ROOT ONLY — 6 files max)
│
├─ Is it task report, investigation, audit, or BCTC?
│  └→ docs/archive/ (auto-manage, never delete)
│
├─ Is it task spec (REQ_* or TECH_*)?
│  └→ docs/historical/ (append-only, never delete)
│
├─ Is it volatile data (counts, JSON)?
│  └→ docs/data/*.json (update via MCP tool)
│
└─ Root files only (4 canonical):
   ├─ CLAUDE.md (project context)
   ├─ TASKS.md (active Kanban)
   ├─ SPRINT_GOAL.md (sprint objective)
   └─ README.md (project intro)
```

## Folder Purpose

| Folder | Purpose | Access | Management |
|--------|---------|--------|------------|
| `docs/` (root) | 6 core docs | Read weekly | Stable, rarely change |
| `docs/data/` | Volatile counts (JSON) | Read/write during work | Agents update via MCP |
| `docs/archive/` | Investigation/audit reports | Read-only | Auto-file, never delete |
| `docs/historical/` | Task specs (REQ/TECH) | Read-only | Append-only, 249 files |
| `docs/agent-memory/` | Shared analysis workbook | Lazy-load | Agent MCP tools manage |
| `.claude/knowledge/` | Logic & rules | Read-heavy | Stable, update on policy change |
| `.claude/skills/` | CLI skills (Caveman, etc.) | Read-only | Never delete |

## Auto-File Rules (Enforcement)

Files with these patterns **automatically** go to `docs/archive/`:
- `*INVESTIGATION*.md`
- `*_ANALYSIS.md`
- `AUDIT_*.md`
- `BCTC_*.md`
- `DEPLOYMENT*.md`
- `SPRINT_*` (except active SPRINT_GOAL.md)
- `IMPLEMENTATION_*.md`
- `SYSTEM_*.md`
- `OPS_*.md`

If created in root by mistake → auto-moved to archive/ before next work task.

## What's in Each Archive

**`docs/historical/` (249 files — never touch)**
- REQ_006 through REQ_1422 (118 files) — all feature requirements ever assigned
- TECH_006 through TECH_1422 (131 files) — all technical specs ever written
- Canonical reference for task context and design decisions
- No deletion, no modification

**`docs/archive/` (89 files — read-only reference)**
- BCTC_*.md (14) — PDF extraction investigations
- AUDIT_*.md (3) — system audits
- Investigation/analysis files (20) — findings, root causes, discoveries
- Operational docs (28) — sprint summaries, deployment reports, system analyses
- Other historical (24) — tool inventories, blocker analyses, architecture reviews
- Moved 2026-04-25 from cluttered root

**`docs/` ROOT (6 files — active use)**
1. `ARCHITECTURE.md` — folder tree, data flow, VPS proxies
2. `AI_TEAM_DESIGN.md` — two-team architecture (Analysis + Dev)
3. `MICROSERVICES_DDD.md` — language choice, DDD pattern, monorepo structure
4. `GLOSSARY_VI.md` — Vietnamese financial terms
5. `SESSION_SUMMARY_20260424.md` — current session notes
6. `TASKS_ARCHIVE.md` — done task index by sprint

## Examples

**Creating "VN Exchange Analysis 2026-04-25.md"?**
- Is it investigation/findings? → `docs/archive/`
- Is it design/architecture? → `docs/ARCHITECTURE.md` (update existing)
- Is it session notes? → `/memory/*.md` (use MCP tool)

**Creating "REQ_1500.md" (new task spec)?**
- Task specs go to `docs/historical/` immediately
- BA creates in local branch, commits to main
- Never stays in root

**Creating "Stock Correlation Analysis 2026-04-25.md"?**
- Analysis/findings → `docs/archive/`
- Or save to `/memory/` if session-specific
- Commit with "docs: archive analysis from 2026-04-25 session"

## Violation Detection

**Check before creating any `.md` file:**
```bash
# What's currently in docs/ root?
ls -1 docs/*.md

# Should be exactly these 6:
# ARCHITECTURE.md
# AI_TEAM_DESIGN.md
# MICROSERVICES_DDD.md
# GLOSSARY_VI.md
# SESSION_SUMMARY_*.md
# TASKS_ARCHIVE.md

# If you see others, they belong in archive/ or historical/
```

## Enforcement Check (Auto-Run)

```bash
# Find orphaned files in root docs/
find docs/*.md \
  -not -name "ARCHITECTURE.md" \
  -not -name "AI_TEAM_DESIGN.md" \
  -not -name "GLOSSARY_VI.md" \
  -not -name "MICROSERVICES_DDD.md" \
  -not -name "SESSION_SUMMARY*" \
  -not -name "TASKS_ARCHIVE.md" | \
  xargs -I {} mv {} docs/archive/
```

This runs automatically before each work task if violations detected.

---

**Updated by:** Cleanup session 2026-04-25
**Next review:** After next document creation
**Related:** CLAUDE.md § File Organization, tree-map.md
