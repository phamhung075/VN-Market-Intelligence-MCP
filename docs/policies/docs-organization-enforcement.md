> Parent: [./docs-organization.md](./docs-organization.md)

# Docs Organization — Auto-File Rules & Enforcement

Automated rules that move misplaced files and validate folder structure.

## Auto-File Rules

Files with these patterns **automatically** go to `docs/archive/`:
- `*INVESTIGATION*.md`
- `*_ANALYSIS.md`
- `AUDIT_*.md`
- `BCTC_*.md`
- `DEPLOYMENT*.md`
- `SPRINT_*` (no active SPRINT_GOAL.md — sprint goal now in `docs/data/orch/orch-state.json .sprint_goal`)
- `IMPLEMENTATION_*.md`
- `SYSTEM_*.md`
- `OPS_*.md`

If created in root by mistake → auto-moved to archive/ before next work task.

---

## Archive Purposes

### `docs/historical/` (read-only reference)

- **REQ_NNN** — all feature requirements ever assigned (count volatile, increments each sprint)
- **TECH_NNN** — all technical specs ever written (count volatile, increments each sprint)
- Canonical reference for task context and design decisions
- No deletion, no modification
- Current counts in `docs/data/project-stats.json`

### `docs/archive/` (read-only reference)

Auto-filed categories (counts are illustrative — actual file count in `docs/archive/` fluctuates as new files land):
- BCTC_*.md — PDF extraction investigations
- AUDIT_*.md — system audits
- Investigation/analysis files — findings, root causes, discoveries
- Operational docs — sprint summaries, deployment reports, system analyses
- Other historical — tool inventories, blocker analyses, architecture reviews
- Last migrated 2026-04-25 from cluttered root

---

## Docs Root Canonical Files

**Exactly 5 files (no more):**

1. `ARCHITECTURE.md` — folder tree, data flow, VPS proxies
2. `AGENT_CREATION_GUIDE.md` — agent-father index (microservices DDD content lives in `docs/ARCHITECTURE.md`)
3. `GLOSSARY_VI.md` — Vietnamese financial terms
4. `SESSION_SUMMARY_*.md` — current session notes
5. `WORK.md` — agent work log (News Scout, PO, QA cycle summaries)

**Migrated to `docs/data/orch/orch-state.json`:**
- Sprint task Kanban → `.task_board` (replaces `docs/TASKS.md`)
- Done task archive → `.task_board.archive[]` (replaces `docs/TASKS_ARCHIVE.md`)
- Sprint goal → `.sprint_goal` (replaces `docs/SPRINT_GOAL.md`)
- Signal dashboard → `.signal_queue` (replaces `docs/signals/DASHBOARD.md` + `DASHBOARD_ARCHIVE.md`)

Two-team architecture lives in `docs/references/agent-roster.md` (no separate root file).

---

## Enforcement Check (Auto-Run)

Before each work task:

```bash
# Find orphaned files in root docs/
find docs/*.md \
  -not -name "ARCHITECTURE.md" \
  -not -name "AGENT_CREATION_GUIDE.md" \
  -not -name "GLOSSARY_VI.md" \
  -not -name "SESSION_SUMMARY*" \
  -not -name "WORK.md" | \
  xargs -I {} mv {} docs/archive/
```

This runs automatically before each work task if violations detected.
