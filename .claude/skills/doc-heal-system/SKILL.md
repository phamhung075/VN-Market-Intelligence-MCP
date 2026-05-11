---
name: doc-heal-system
description: >
  Full-subtree audit + auto-fix for ALL agents, skills, flows, knowledge, docs.
  Enforces tree-map.md DAG, SSOT discipline, factory pointers, no-hardcode rule.
  Auto-fixes mechanical drift; escalates semantic drift to architect.
  Differs from `doc-self-heal` (per-agent, end-of-cycle, files touched this cycle only)
  by scanning the entire subtree every run regardless of git diff.
---

## When to invoke

- `claude-manager-helper` cron (Mon/Thu 17:30 UTC) — after the 10-pass git-diff sweep
- User runs `/docheal` or asks to "audit all docs / skills / knowledge"
- After any large sprint close, refactor, or agent-roster change

> **Do not run as part of a normal end-of-cycle.** Use `doc-self-heal` for local fixes.
> This skill is global and writes across the system — only run when authorised.

---

## Rule source — SSOT chain

| Rule | Lives in | Authority |
|------|----------|-----------|
| File DAG, parent→child only | `docs/references/tree-map.md` | Canonical |
| File placement (where new .md goes) | `docs/policies/docs-organization.md` | Canonical |
| Agent file factory template | `docs/AGENT_CREATION_GUIDE.md` → `docs/guides/guide-*.md` | Canonical |
| Skill file factory template | this file (Appendix A) | Canonical |
| Flow file factory template | `docs/guides/guide-flows.md` | Canonical |
| Knowledge file rules (no volatile counts) | `tree-map.md` §Rules + §Drift Detection | Canonical |
| Volatile data location | `docs/data/*.json` (never `.claude/`, never inline) | Canonical |
| Size caps | CLAUDE.md ≤120 · TASKS.md ≤80 · SPRINT_GOAL.md ≤30 · agent .md ≤200 | `claude-manager-helper/main.md` |

If two SSOTs conflict, **tree-map.md wins** and the other is fixed to match.

---

## Scope — every run, no exceptions

```
.claude/agents/*.md                     ← all agents
.claude/skills/*/SKILL.md               ← all skills
.claude/flows/*/main.md                 ← all flows (and sub-flows if present)
docs/{policies,protocols,standards,references}/*.md                  ← all knowledge files
docs/references/bundles/*.md          ← knowledge bundles
docs/*.md                               ← all top-level docs
docs/guides/*.md                        ← agent-father guides
docs/architecture/**/*.md               ← architecture briefs + microservices
docs/data/*.json                        ← volatile registry files
CLAUDE.md                               ← root pointer
memory/MEMORY.md                        ← user memory index (if reachable)
```

"Do not miss any" — if `find` reveals a file not in this list, treat as **orphan** (see Phase 2).

---

## Phases

### Phase 0 — Discover

```bash
# Enumerate the whole subtree
find .claude/agents .claude/skills .claude/flows .claude/knowledge docs \
  -type f \( -name "*.md" -o -name "*.json" \) -not -path "*/node_modules/*"
```

Store the list as `$ALL_FILES`. Cross-reference against tree-map.md to find orphans.

---

### Phase 1 — Pointer integrity (mechanical, auto-fix)

For each `.md` file in `$ALL_FILES`:

1. Extract every relative path reference (`.claude/...`, `docs/...`, `apps/...`, `mcp.config.json`).
2. Verify the target exists. If not:
   - **Auto-fix if** rename history (`git log --follow --diff-filter=R --name-status`) reveals the new path → rewrite the pointer.
   - **Otherwise** flag in report under "Dead pointers".
3. Verify direction: child does not point upward to parent (tree-map §Rules #2).
   - **Auto-fix if** the parent already points to this child → delete the child→parent line.
   - **Otherwise** flag under "Reversed pointer".

---

### Phase 2 — Orphans + factory drift (escalate)

| Drift | Detection | Action |
|-------|-----------|--------|
| File on disk, not in tree-map | `comm -23 <(find ...) <(grep -oE '[a-z./_-]+\.(md\|json)' tree-map.md)` | Auto-add to tree-map under inferred parent; escalate if parent unclear |
| File in tree-map, not on disk | Inverse `comm -13` | Auto-remove from tree-map; flag in report |
| Agent .md missing factory sections | grep for required headings per `docs/guides/guide-agent-definition.md` | **Escalate to `agent-father`** |
| Flow .md missing factory sections | per `docs/guides/guide-flows.md` | **Escalate to `agent-father`** |
| Skill SKILL.md missing frontmatter (`name:`, `description:`) | head -5 check | Auto-fix if pattern clear; else escalate |

---

### Phase 3 — SSOT / no-hardcode (auto-fix)

Scan `docs/{policies,protocols,standards,references}/*.md` + `.claude/agents/*.md` + `.claude/flows/**/*.md` for:

| Anti-pattern | Replace with |
|--------------|--------------|
| Tool count number (`123 tools`, `83 tools`) | Pointer to `docs/data/tool-registry.json` |
| Cron count (`29 cron jobs`) | Pointer to `docs/data/cron-registry.json` |
| Agent count (`33 agents`, `22 agents`) | Pointer to `docs/data/project-stats.json` |
| Sprint number inline | Pointer to `docs/SPRINT_GOAL.md` |
| Ticker lists inline | Pointer to `docs/data/stock-classification.json` |
| Mcp tool name list inline | Pointer to `docs/standards/mcp-tools.md` |
| Telegram channel rule restated | Pointer to `.claude/skills/telegram-channel-routing/SKILL.md` |
| Fail-loud protocol restated | Pointer to `.claude/skills/cowork-boundary/SKILL.md` |

Auto-fix rewrites the line. Originals saved in `reports/DOC_HEAL_<YYYY-MM-DD>.md`.

---

### Phase 4 — Size caps + obsolete content (auto-fix or archive)

| File | Cap | Action on overflow |
|------|-----|--------------------|
| `CLAUDE.md` | 120 lines | Move bloat to `docs/<bucket>/<topic>.md`; leave pointer |
| `docs/TASKS.md` | 80 lines | Move Done section → `docs/TASKS_ARCHIVE.md` |
| `docs/SPRINT_GOAL.md` | 30 lines | Delete sprint goals older than current |
| `docs/WORK.md` | unbounded but compact | Trim entries older than 14 days to `docs/agent-memory/sessions/` |
| `.claude/agents/*.md` | 200 lines | Move repeated >3-line blocks to `docs/{policies,protocols,standards,references}/` or new skill |
| `.claude/skills/*/SKILL.md` | 200 lines | Same — extract reusable rules to knowledge |
| `memory/MEMORY.md` | 200 lines (index only) | Trim oldest pointers; never inline content |

Obsolete content patterns (auto-archive to `docs/archive/`):
- `*INVESTIGATION*.md`, `*_ANALYSIS.md`, `AUDIT_*.md`, `BCTC_*.md` at root → move to archive
- `SESSION_SUMMARY_*` older than 30 days → archive

---

### Phase 5 — Dedup / boilerplate extraction (escalate by default)

Detect: any block of >3 lines repeated in ≥3 files.

Heuristic: `grep -rh '^#' .claude/agents/*.md | sort | uniq -c | sort -rn | head` for repeated headings; widen for body blocks.

- **Auto-fix** if the block matches an existing skill (replace with skill pointer).
- **Escalate to `cowork-refactory-expert`** if no existing skill — propose new skill in report.

---

### Phase 6 — Memory + index hygiene

- `MEMORY.md` lines must be one-liners under ~150 chars; no inline memory content.
- Any duplicate-named memory file → keep newest, archive older to `memory/_archive/`.
- Any memory pointer whose target file is missing → remove the line.

---

### Phase 7 — Report + commit

Write `reports/DOC_HEAL_<YYYY-MM-DD>.md` with:

```markdown
## Doc-Heal System Audit — YYYY-MM-DD

### Summary
- Files scanned: N
- Auto-fixes applied: M
- Escalations: K (to agent-father / architect / cowork-refactory-expert)

### Phase results
- Phase 1 Pointers: OK | N dead | M reversed → fixed
- Phase 2 Orphans: N added to tree-map | M removed | K factory drift escalated
- Phase 3 SSOT: N hardcoded values replaced with pointers
- Phase 4 Size caps: N trimmed | M archived
- Phase 5 Dedup: N replaced with skill ref | M escalated
- Phase 6 Memory: N lines pruned

### Escalations
[List with target agent + reason]
```

Commit:
```
docs(heal): full-subtree audit YYYY-MM-DD — N auto-fixes, K escalations
```

Send `send_telegram(channel="bug")` only if escalations exist.

---

## Auto-fix vs Escalate — decision matrix

| Category | Auto-fix | Escalate |
|----------|----------|----------|
| Dead pointer with known rename | ✅ rewrite | — |
| Dead pointer, unknown target | — | architect |
| Reversed pointer | ✅ delete | — |
| Orphan file with clear parent | ✅ add to tree-map | — |
| Orphan file, unclear parent | — | architect |
| Hardcoded count → JSON pointer | ✅ rewrite | — |
| Restated SSOT rule | ✅ replace with pointer | — |
| Agent missing factory section | — | agent-father |
| Flow missing factory section | — | agent-father |
| Size cap exceeded | ✅ trim / archive | — |
| Boilerplate matches existing skill | ✅ replace with pointer | — |
| Boilerplate, no existing skill | — | cowork-refactory-expert |
| Memory line stale | ✅ remove | — |
| Semantic claim wrong | — | architect or owning agent |

---

## Forbidden actions

- ❌ Rewriting prose for style. Only mechanical fixes + pointer substitution.
- ❌ Deleting knowledge files without recording the merge target (tree-map §Deleted Files table).
- ❌ Editing files outside the Scope list. Never touch source code (`apps/`, `src/`).
- ❌ Auto-fixing semantic drift (wrong claims, stale facts). Always escalate.
- ❌ Running without a git working tree on main or an authorised task branch — refuse if uncommitted unrelated changes exist.

---

## Appendix A — Skill file factory template

Every `.claude/skills/<name>/SKILL.md` must have:

```markdown
---
name: <kebab-case>
description: >
  <one-paragraph summary; triggers SkillTool match>
---

## Purpose (or When to invoke)
## Rule source / Inputs
## Steps or Phases
## Output / Side effects
## Forbidden actions  (if mutating)
```

Optional: Appendix sections for templates, examples, lessons learned.

---

## Appendix B — Discovery commands cheat sheet

```bash
# All .md/.json in scope
find .claude docs -type f \( -name "*.md" -o -name "*.json" \) \
  -not -path "*/node_modules/*" -not -path "*/_archive/*"

# Files in tree-map vs files on disk
grep -oE '[a-zA-Z0-9./_-]+\.(md|json)' docs/references/tree-map.md | sort -u > /tmp/in_tree.txt
find .claude docs -type f \( -name "*.md" -o -name "*.json" \) | sort -u > /tmp/on_disk.txt
comm -23 /tmp/on_disk.txt /tmp/in_tree.txt    # orphans on disk
comm -13 /tmp/on_disk.txt /tmp/in_tree.txt    # tree-map points to missing files

# Hardcoded count drift
grep -rnE '\b(83|112|123|22|33|29) (tools|cron|agents|jobs)\b' .claude/ docs/

# Size cap check
wc -l CLAUDE.md docs/TASKS.md docs/SPRINT_GOAL.md
find .claude/agents .claude/skills -name "*.md" -exec wc -l {} \; | sort -rn | head
```

---

> Requires `$PROJECT_ROOT` set by skill: `.claude/skills/project-root/SKILL.md`
> Companion: `.claude/skills/doc-self-heal/SKILL.md` (per-agent, narrow scope)
