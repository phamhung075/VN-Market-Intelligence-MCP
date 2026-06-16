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

## §4 — Head SSOT (single canonical field — mandatory)

**The dispatch head has ONE canonical field: TOP-LEVEL `.head`.** Every consumer reads it — `docs/agents/dev-team/flow/main.md` Step 0b (`HEAD=$(jq -c '.head' ...)`), this doc §2 (`.head` routing fields), and `scripts/router-d1-claim.jq`.

- **READ** `.head` (top-level) for `active_task_id` / `next_agent` / `status`. Never read `.task_board.head`.
- **WRITE** `.head` (top-level) ONLY. Any po-s* / router script that dispatches a task sets `.head.{status,active_task_id,next_agent,updated_at,updated_by,note}`.
- **`.task_board.head` is DEPRECATED** — a non-routing stub (`status:"deprecated"`, `canonical_moved_to:".head"`). Writing it is a BUG: it drifts from top-level `.head` because the flow reads top-level. A script that writes `.task_board.head` leaves the real head stale and any flow-resume mis-tracks (root of signal `head-drift-po-s64-vs-task-board-head`, 2026-06-15; collapsed by `scripts/po-s66-head-ssot-collapse-reconcile.jq`).

## §5 — head.status Enum (valid values)

All `head.status` values used across router scripts and inter-agent flows — the validated set as of 2026-06-13:

| Value | Meaning |
|---|---|
| `idle` | No active task |
| `in_progress` | Task claimed by a dev agent |
| `blocked` | Waiting on external dependency |
| `stale` | head not updated recently |
| `review` | Task done, awaiting QA/PO sign-off |
| `active` | Work in flight between agents / inter-agent handoff |
| `qa` | Task at final QA live-verify gate before done_verified |

Source of truth: `apps/mcp-server/src/__tests__/1837a-pipeline-state.test.ts` AC-2 assertion (test validates the live `orch-state.json` value is always within this set). Any new status value added to router jq scripts must be added here simultaneously.

---

## §3 — Cross-References

- Write protocol (atomic temp-file-then-rename): `docs/architecture-briefs/2026-06-01-orch-state-consolidate.md §2.3`
- Signal-queue READ (two-phase delta): `.claude/skills/signal-dashboard/SKILL.md § READ`
- Signal-queue WRITE: `.claude/skills/signal-dashboard/dashboard-protocol.md § WRITE`
