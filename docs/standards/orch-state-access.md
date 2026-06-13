<!-- size-justification: 60L — living standard, single rule + jq recipe table + cross-refs. -->

# orch-state Access Standard

**Load when:** any agent or flow reads from `docs/data/orch/orch-state.json`.

---

## §1 — Read Rule (mandatory)

**ORCH-STATE READ RULE:** Never open `docs/data/orch/orch-state.json` with the Read tool and never cat it to stdout for model consumption. Always extract the needed slice via `jq -c '.<section>'` in Bash. The file is ~933KB / ~233K tokens — a full Read burns 23% of a 1M context.

Exception: `CURRENT=$(cat docs/data/orch/orch-state.json)` inside a **bash-only write pipeline** (result fed back through `jq` and never printed to stdout or returned to the model) is permitted — see `docs/architecture-briefs/2026-06-01-orch-state-consolidate.md §2.3`. Mark such lines with comment `# bash-only pipeline — not surfaced to model`.

---

## §2 — Canonical jq Recipes

| Needed data | Recipe | Token budget |
|---|---|---|
| `.head` routing fields | `jq -c '.head' docs/data/orch/orch-state.json` | ~150 tokens |
| `.head.status` guard only | `jq -r '.head.status' docs/data/orch/orch-state.json` | ~3 tokens |
| `.task_board` task count | `jq '[.task_board.active_sprints[].tasks[]] \| length' docs/data/orch/orch-state.json` | ~5 tokens |
| `.task_board` open tasks | `jq '[.task_board.active_sprints[].tasks[] \| select(.status=="TODO" or .status=="IN_PROGRESS")]' docs/data/orch/orch-state.json` | ~500 tokens typical |
| `.task_board` single task lookup | `jq --arg id "<task_id>" '[.task_board.active_sprints[].tasks[] \| select(.task_id==$id or .id==$id)]' docs/data/orch/orch-state.json` | ~50 tokens |
| `.task_board` dedup keyword search | `jq --arg kw "<kw>" '[.task_board \| (.active_sprints[].tasks[], .backlog[], .archive[]) \| select(.title \| test($kw;"i"))]' docs/data/orch/orch-state.json` | ~200 tokens typical |
| `.sprint_goal` current sprint | `jq '.sprint_goal.entries[0]' docs/data/orch/orch-state.json` | ~80 tokens |
| `.signal_queue` NEW rows | See `.claude/skills/signal-dashboard/dashboard-protocol.md § READ` | ~200 tokens |

---

## §3 — Cross-References

- Write protocol (atomic temp-file-then-rename): `docs/architecture-briefs/2026-06-01-orch-state-consolidate.md §2.3`
- Signal-queue READ (two-phase delta): `.claude/skills/signal-dashboard/SKILL.md § READ`
- Signal-queue WRITE: `.claude/skills/signal-dashboard/dashboard-protocol.md § WRITE`
