> Parent: [./SKILL.md](./SKILL.md)

# Doc-Heal System — Phases 0–7

## Phase 0 — Discover

```bash
# Enumerate the whole subtree
find .claude/agents .claude/skills .claude/knowledge docs \
  -type f \( -name "*.md" -o -name "*.json" \) -not -path "*/node_modules/*"
```

Store the list as `$ALL_FILES`. Cross-reference against tree-map.md to find orphans.

---

## Phase 1 — Pointer integrity (mechanical, auto-fix)

For each `.md` file in `$ALL_FILES`:

1. Extract every relative path reference (`.claude/...`, `docs/...`, `apps/...`, `mcp.config.json`).
2. Verify the target exists. If not:
   - **Auto-fix if** rename history (`git log --follow --diff-filter=R --name-status`) reveals the new path → rewrite the pointer.
   - **Otherwise** flag in report under "Dead pointers".
3. Verify direction: child does not point upward to parent (tree-map §Rules #2).
   - **Auto-fix if** the parent already points to this child → delete the child→parent line.
   - **Otherwise** flag under "Reversed pointer".

---

## Phase 2 — Orphans + factory drift (escalate)

| Drift | Detection | Action |
|-------|-----------|--------|
| File on disk, not in tree-map | `comm -23 <(find ...) <(grep -oE '[a-z./_-]+\.(md\|json)' tree-map.md)` | Auto-add to tree-map under inferred parent; escalate if parent unclear |
| File in tree-map, not on disk | Inverse `comm -13` | Auto-remove from tree-map; flag in report |
| Agent .md missing factory sections | grep for required headings per `docs/guides/guide-agent-definition.md` | **Escalate to `agent-father`** |
| Flow .md missing factory sections | per `docs/guides/guide-flows.md` | **Escalate to `agent-father`** |
| Skill SKILL.md missing frontmatter (`name:`, `description:`) | head -5 check | Auto-fix if pattern clear; else escalate |

---

## Phase 3 — SSOT / no-hardcode (auto-fix)

Scan `docs/{policies,protocols,standards,references}/*.md` + `.claude/agents/*.md` + `docs/agents/**/flow/*.md` for:

| Anti-pattern | Replace with |
|--------------|--------------|
| Tool count number (`123 tools`, `83 tools`) | Pointer to `docs/data/tool-registry.json` |
| Cron count (`29 cron jobs`) | Pointer to `docs/data/cron-registry.json` |
| Agent count (`33 agents`, `22 agents`) | Pointer to `docs/data/project-stats.json` |
| Sprint number inline | Pointer to `docs/data/orch/orch-state.json .sprint_goal` |
| Ticker lists inline | Pointer to `docs/data/stock-classification.json` |
| Mcp tool name list inline | Pointer to `docs/standards/mcp-tools.md` |
| Telegram channel rule restated | Pointer to `.claude/skills/telegram-channel-routing/SKILL.md` |
| Fail-loud protocol restated | Pointer to `.claude/skills/cowork-boundary/SKILL.md` |

Auto-fix rewrites the line. Originals saved in `reports/DOC_HEAL_<YYYY-MM-DD>.md`.

---

## Phase 4 — Size caps + obsolete content (auto-fix or archive)

| File | Cap | Action on overflow |
|------|-----|--------------------|
| `CLAUDE.md` | 120 lines | Move bloat to `docs/<bucket>/<topic>.md`; leave pointer |
| `docs/data/orch/orch-state.json .task_board` active tasks | 80 tasks | PM runs task-archive sub-flow: move DONE tasks to `.task_board.archive[]` |
| `docs/data/orch/orch-state.json .sprint_goal.entries[]` | 15 entries | PO closes/removes old sprint entries |
| `docs/WORK.md` | unbounded but compact | Trim entries older than 14 days to `docs/agent-memory/sessions/` |
| `.claude/agents/*.md` | 200 lines | Move repeated >3-line blocks to `docs/{policies,protocols,standards,references}/` or new skill |
| `.claude/skills/*/SKILL.md` | 200 lines | Same — extract reusable rules to knowledge |
| `memory/MEMORY.md` | 200 lines (index only) | Trim oldest pointers; never inline content |

Obsolete content patterns (auto-archive to `docs/archive/`):
- `*INVESTIGATION*.md`, `*_ANALYSIS.md`, `AUDIT_*.md`, `BCTC_*.md` at root → move to archive
- `SESSION_SUMMARY_*` older than 30 days → archive

---

## Phase 5 — Dedup / boilerplate extraction (escalate by default)

Detect: any block of >3 lines repeated in ≥3 files.

Heuristic: `grep -rh '^#' .claude/agents/*.md | sort | uniq -c | sort -rn | head` for repeated headings; widen for body blocks.

- **Auto-fix** if the block matches an existing skill (replace with skill pointer).
- **Escalate to `cowork-refactory-expert`** if no existing skill — propose new skill in report.

---

## Phase 6 — Memory + index hygiene

- `MEMORY.md` lines must be one-liners under ~150 chars; no inline memory content.
- Any duplicate-named memory file → keep newest, archive older to `memory/_archive/`.
- Any memory pointer whose target file is missing → remove the line.

---

## Phase 7 — Report + commit

Write `reports/DOC_HEAL_<YYYY-MM-DD>.md` with summary + per-phase results + escalation list.

Commit:
```
docs(heal): full-subtree audit YYYY-MM-DD — N auto-fixes, K escalations
```

Send `send_telegram(channel="bug")` only if escalations exist.
