# Docs Organization — Quick Reference

**Updated:** 2026-05-01 | **Status:** Active enforcement

## ⚠ BEFORE CREATING ANY FILE — Check This Table First

Every agent MUST look up the correct location here before writing a new file.
Creating a file in the wrong place causes duplication debt that requires manual cleanup.

| File pattern | Canonical location | ❌ Never here |
|---|---|---|
| `TASK_REPORT_*.md` | `reports/` | `apps/mcp-server/reports/`, `docs/reports/` |
| `*-evening.json` | `reports/` | `apps/mcp-server/reports/` |
| `SPRINT_GOAL.md` | `docs/SPRINT_GOAL.md` | root, `apps/` |
| `TASKS.md` | `docs/TASKS.md` | root, `apps/` |
| `WORK.md` | `docs/WORK.md` | root, `apps/` |
| `TASK_NNN.md` (handoff) | `docs/handoffs/` | root, `reports/` |
| `REQ_NNN.md` | `docs/historical/` | root, `docs/` root |
| `TECH_NNN.md` | `docs/historical/` | root, `docs/` root |
| Agent notebooks | `docs/agent-memory/notebooks/` | root |
| Analysis briefs | `docs/analysis-briefs/` | root, `reports/` |
| Source code `*.ts` | `apps/mcp-server/src/` | root, `docs/` |
| Tests `*.test.ts` | `apps/mcp-server/src/__tests__/` | root, `reports/` |
| Knowledge/rules | `docs/{policies,protocols,standards,references}/` | root, `docs/` |
| Agent configs | `.claude/agents/` | root |
| `*.md` (any other) | See decision tree below | ❌ Never at root except `CLAUDE.md`, `README.md` |

**If unsure → default to `docs/` subdirectory. Never create at project root.**

---

## File Placement Rules

When creating a new `.md` file, use this decision tree:

```
┌─ Is it logic, rules, or policy?
│  └→ docs/{policies,protocols,standards,references}/*.md
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
└─ Root files only (2 canonical):
   ├─ CLAUDE.md (project context)
   └─ README.md (project intro)
```

## Folder Purpose

| Folder | Purpose | Access | Management |
|--------|---------|--------|------------|
| `docs/` (root) | 6 core docs | Read weekly | Stable, rarely change |
| `docs/data/` | Volatile counts (JSON) | Read/write during work | Agents update via MCP |
| `docs/archive/` | Investigation/audit reports | Read-only | Auto-file, never delete |
| `docs/historical/` | Task specs (REQ/TECH) | Read-only | Append-only, 0 files (cleaned 2026-04-26) |
| `docs/agent-memory/` | Shared analysis workbook | Lazy-load | Agent MCP tools manage |
| `docs/policies/` | Enforceable rules / decisions / conventions | Read-heavy | Stable, update on policy change |
| `docs/protocols/` | Sequence flows / procedures / runbooks | Read-heavy | Stable, update on process change |
| `docs/standards/` | Format specs / schemas / methodologies / tool lookups | Read-heavy | Stable, update on spec change |
| `docs/references/` | Lookups / rosters / maps / templates (incl. `bundles/`) | Read-heavy | Stable, update on registry change |
| `.claude/skills/` | CLI skills (Caveman, etc.) | Read-only | Never delete |
| `.claude/agents/` | Agent configs | Read-only | Update via agent-md-factory |
| `.claude/flows/` | Agent flow files | Read-only | Update via flow guide |

### Knowledge bucket decision matrix

| Question to ask | Bucket |
|------|--------|
| Is it an enforceable rule / decision? (e.g. alert-policy, restart-policy, commit-convention) | `policies/` |
| Is it a sequence / procedure / runbook? (e.g. agent-chaining, fail-loud, bctc-extraction-runbook) | `protocols/` |
| Is it a format spec / schema / methodology / tool lookup? (e.g. mcp-tools, cron-jobs, portfolio-schema) | `standards/` |
| Is it a roster / map / template / glossary? (e.g. tree-map, agent-roster, agent-routing) | `references/` |

## Auto-File Rules (Enforcement)

Files with these patterns **automatically** go to `docs/archive/`:
- `*INVESTIGATION*.md`
- `*_ANALYSIS.md`
- `AUDIT_*.md`
- `BCTC_*.md`
- `DEPLOYMENT*.md`
- `SPRINT_*` (except active docs/SPRINT_GOAL.md)
- `IMPLEMENTATION_*.md`
- `SYSTEM_*.md`
- `OPS_*.md`

If created in root by mistake → auto-moved to archive/ before next work task.

## What's in Each Archive

**`docs/historical/` (see docs/data/project-stats.json for current counts — never touch)**
- REQ_NNN — all feature requirements ever assigned (count volatile, increments each sprint)
- TECH_NNN — all technical specs ever written (count volatile, increments each sprint)
- Canonical reference for task context and design decisions
- No deletion, no modification

**`docs/archive/` (0 files (cleaned 2026-04-26) — read-only reference)**
- BCTC_*.md (14) — PDF extraction investigations
- AUDIT_*.md (3) — system audits
- Investigation/analysis files (20) — findings, root causes, discoveries
- Operational docs (28) — sprint summaries, deployment reports, system analyses
- Other historical (24) — tool inventories, blocker analyses, architecture reviews
- Moved 2026-04-25 from cluttered root

**`docs/` ROOT (8 files — active use)**

Two-team architecture lives in `docs/references/agent-roster.md` (no separate root file).

1. `ARCHITECTURE.md` — folder tree, data flow, VPS proxies
2. `AGENT_CREATION_GUIDE.md` — agent-father index (microservices DDD content lives in `docs/architecture/global.md`)
3. `GLOSSARY_VI.md` — Vietnamese financial terms
4. `SESSION_SUMMARY_*.md` — current session notes
5. `TASKS_ARCHIVE.md` — done task index by sprint
6. `SPRINT_GOAL.md` — current sprint vision (≤30 lines, PO-owned)
7. `WORK.md` — agent work log (News Scout, PO, QA cycle summaries)
8. `TASKS.md` — active sprint Kanban (≤80 lines, PM-owned)

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

# Should be exactly these 8:
# ARCHITECTURE.md
# AGENT_CREATION_GUIDE.md
# GLOSSARY_VI.md
# SESSION_SUMMARY_*.md
# TASKS_ARCHIVE.md
# SPRINT_GOAL.md
# WORK.md
# TASKS.md

# If you see others, they belong in archive/ or historical/
```

## Enforcement Check (Auto-Run)

```bash
# Find orphaned files in root docs/
find docs/*.md \
  -not -name "ARCHITECTURE.md" \
  -not -name "AGENT_CREATION_GUIDE.md" \
  -not -name "GLOSSARY_VI.md" \
  -not -name "SESSION_SUMMARY*" \
  -not -name "TASKS_ARCHIVE.md" \
  -not -name "SPRINT_GOAL.md" \
  -not -name "WORK.md" \
  -not -name "TASKS.md" | \
  xargs -I {} mv {} docs/archive/
```

This runs automatically before each work task if violations detected.

---

**Updated by:** Knowledge → docs/ migration 2026-05-11
**Next review:** After next document creation
**Related:** CLAUDE.md § File Organization, `docs/references/tree-map.md`
