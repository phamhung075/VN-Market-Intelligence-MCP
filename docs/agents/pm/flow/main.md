<!-- size-justification: 185L — single PM orchestration flow; TASKS.md gate, handoff template, multi-zone handling, DASHBOARD CAS guard, heartbeat lock protocol, commit convention, pre-commit mutex gate, mandatory decision-journal step, and HSC-3 terminal-lane bloat gate + HSC-6 done_verified eviction hook are all non-separable PM responsibilities executed in sequence -->
# Project Manager — Main Flow

**Tools:** `docs/agents/tools/package/pm.md`

## Input
Architect design (task list + dependencies + layer assignments), current `docs/data/orch/orch-state.json` — hot-path slice only: `active_sprints` + `backlog[].{id,title,priority,size,type,zone,status}` (NO `done[]` / `done_verified[]` reads in the hot path — HSC-3)

## Output
Atomic tasks in `docs/data/orch/orch-state.json` `.task_board` | `docs/handoffs/TASK_NNN.md` per task | Developer notified

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Role in dev-team flow
> Canonical orchestration: `docs/agents/dev-team/flow/main.md`

**Called from:** dev-team Step 2 final step (all sprint sizes after architect); Step 3 after each tier completes to update `docs/data/orch/orch-state.json` `.task_board` and unblock next tier
**Receives:** Step 2: architect output (`[Architect] Brownfield Findings` in `docs/handoffs/TASK_NNN.md`) + current `docs/data/orch/orch-state.json` `.task_board`; Step 3: completed tier list + QA results
**Produces:** Step 2: atomic task list with dependency tiers in RETURN block (`tier1 (parallel): ...`, `tier2 (after tier1): ...`) + `docs/handoffs/TASK_NNN-*.md` per subtask; Step 3: updated `.task_board` (Done statuses) + RETURN unblocking next tier
**Hand off to:** Step 2 → main terminal routes to Step 3 execution; Step 3 → main terminal spawns next tier developers
**Composes with:** architect (receives from), developer + qa (provides task specs to, monitors status of)

Each atomic task must be: single file/fn group | clear AC | ~2h agent work | explicit deps.
WIP > 2 → hold and return `PIPELINE: blocked | NEXT: po | WIP limit exceeded`.
Task status updates: `docs/data/orch/orch-state.json` `.task_board` tasks (atomic write per §2.3).

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `pm`)

**1. Read context**

```bash
# terminal-lane bloat gate — run before any planning work (HSC-3: replaces active_sprints task count > 80)
# jq slice only — NEVER cat full file to model context (rule: docs/standards/orch-state-access.md §1)
DONE_N=$(jq '.task_board.done | length' "$PROJECT_ROOT/docs/data/orch/orch-state.json")
DV_N=$(jq '.task_board.done_verified | length' "$PROJECT_ROOT/docs/data/orch/orch-state.json")
if [ "$DONE_N" -gt 10 ] || [ "$DV_N" -gt 0 ]; then
  echo "[pm] terminal-lane bloat: done[]=$DONE_N, done_verified[]=$DV_N — invoking task-archive sub-flow"
  # → Run sub-flow: docs/agents/pm/flow/task-archive.md, then resume here
fi
```

`docs/data/orch/orch-state.json` — jq slice: `active_sprints` + `backlog[].{id,title,priority,size,type,zone,status}` (NEVER read `done[]` / `done_verified[]` in planning hot path — HSC-3) | Architect proposal | pm.md notebook (already read in Step 0b)

**HSC-4 lazy-load — full backlog detail (when promoting a specific item to sprint):**
```bash
# Load full detail for one backlog item by id (never load the whole file into context):
jq '.items["<id>"]' "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json"
# When adding a NEW backlog item: write full object to backlog-detail.json first, then stub to hot.
# One-time migration + ongoing stub-writer: bash scripts/orch-backlog-stub.sh
# Owning brief: docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md §HSC-4
```

**Notebooks:** Read `docs/agent-memory/notebooks/pm.md` only (done via Step 0b).
If the architect handoff explicitly names another agent's notebook, read that one file only.
**Do NOT glob `docs/agent-memory/notebooks/*.md`** — unbounded glob pulls all notebooks (~7k+ L).

**2. Atomic tasks** — each must be: single file/fn group | clear AC | ~2h agent work | deps explicit

**3. Update `docs/data/orch/orch-state.json` `.task_board`** (atomic write per §2.3: read full → modify `.task_board` section only → write atomically)
- Deps Done → status: **TODO** | Deps In Progress → type: **backlog**
- Task JSON shape — canonical per `docs/standards/task-schema.md`: `{id, title, owner, status, zone, created_at}` + optional `{type, size, priority, depends, note, files, status_note}`. NEVER use banned fields: `task_id` (write), `desc`, `label`, `summary`, `resolvedId`, `resolved_id`.

**3b. Create handoff file** `docs/handoffs/TASK_NNN.md` — AC listed here will also be written as the `AC:` trailer in the developer's commit (`docs/policies/commit-convention.md`), making git the second copy:
```markdown
---
sprint: NNN
branch: task/NNN-kebab-name
size: S|M|L
zone: apps/<service>/   ← MANDATORY — copy from architect handoff § Zone; dev-team Step 3 routes by this
depends_on: []
blocks: []
---

## TLDR
[3 sentences: what, where, why]

## [PM] Planning Context
- **Zone:** apps/<service>/   ← also in body for visibility
- **Acceptance Criteria:**
  - [ ] Criterion 1
- **Files to read first:** [path:lines]
- **Files to create:** [path — purpose]
- **Files to modify:** [path:lines]
- **Dependencies:** [list or "none"]
- **Knowledge needed:** `docs/policies/dev-standards.md` + others
```

**Multi-zone handling:** If architect returned `ZONE: multi`, split the design into one subtask per zone — each subtask carries its own single zone. Never bundle multi-zone work in one task: zone-routed parallel spawns require disjoint scopes.

**3c-journal** (mandatory — before returning): skill: `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: "<the sprint planning task_id from task_board — e.g. SPRINT-NNN or the PM task id>"]
Write at minimum ONE entry per task you complete stamped with its task-id. Routine work: `what-considered: "only path: <reason>"`, `why-change: "no change from plan"`.

**3c.** Update `docs/data/orch/orch-state.json .task_board` (task status → TODO, atomic write per §2.3 — **route through orch-apply.sh**):
```bash
# atomic write pattern — single gated write path (SSOT-W1-ORCH-APPLY-WRAPPER)
jq '...' "$PROJECT_ROOT/docs/data/orch/orch-state.json" \
  | bash "$PROJECT_ROOT/scripts/orch-apply.sh" \
  || { echo "[pm] ABORTED: orch-apply.sh validation/CAS failed" >&2; exit 1; }
```
Return task list with dependency tiers and zone per task:
```
## RETURN
DONE: Tasks broken down, handoffs created for NNN-a, NNN-b, NNN-c
TASKS:
  tier1 (parallel):
    - NNN-a [zone: apps/stock-price/, files: apps/stock-price/src/foo.ts]
    - NNN-b [zone: apps/alert-engine/, files: apps/alert-engine/src/bar.ts]
  tier2 (after tier1):
    - NNN-c [zone: apps/stock-price/, depends_on: NNN-a, files: apps/stock-price/src/baz.ts]
HANDOFF: docs/handoffs/TASK_NNN-a.md, docs/handoffs/TASK_NNN-b.md, docs/handoffs/TASK_NNN-c.md
PIPELINE: continue
```
`zone:` on every task is mandatory — dev-team Step 3 reads this field to pick the right dev-* specialist.

**3d.** Heartbeat umbrella lock → load skill: `.claude/skills/task-lock/SKILL.md`
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "task:" + sprint_id })
// ok=false here = sprint umbrella expired or stolen; log only, do not abort planning
```

**4.** Set task status → `in_progress` when developer picks up

**4b.** Heartbeat developer's task lock if pre-existing:
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "task:" + task_id })
// silent on ok=false — developer will (re)claim on entry
```

## Signal Queue Write Guard — CAS on orch-state.json (TASK_1967-03 fix)

Before writing ANY signal row to `docs/data/orch/orch-state.json` `.signal_queue` (including `plan_blocked`, `task_slate_ready`, or any pm-originated row), perform a fresh read of `docs/data/orch/orch-state.json`:

```
1. Slice `.head.status` via jq — NEVER use Read tool (see `docs/standards/orch-state-access.md §1`):
   ```bash
   head_status=$(jq -r '.head.status' docs/data/orch/orch-state.json)
   ```
2. Check `head_status` field
3. If .head.status == "idle" OR "closed" (case-insensitive substring match):
     → SKIP signal write
     → Log: "[pm] Sprint idle/closed — signal_queue write suppressed (stale-race guard)"
     → Continue to next step without emitting signal
4. If .head.status does not match idle/closed → proceed with signal write normally (atomic write, modify only .signal_queue)
```

**Scope:** This guard applies to every `.signal_queue` write in this flow — it is NOT limited to `plan_blocked`. Any pm signal written to a closed sprint is stale.

**Do NOT read orch-state.json at flow start and cache it.** Read it atomically, immediately before the write.

---

## Pre-commit gate (mandatory before EVERY git commit)

```
1. Claim commit-mutex:
   task_claim(task_kind="commit-mutex", task_id="pm-commit-<slug>",
     owner_agent="pm", ttl_seconds=120)

2. Apply commit-boundary RULE 1-3 (.claude/skills/commit-boundary/SKILL.md):
   RULE 1: git add <named files only> — NEVER git add -A or git add .
   RULE 2: git diff --cached --name-only → verify all paths within pm zone
            (allowed: docs/data/orch/orch-state.json, docs/agent-memory/notebooks/pm.md)
            (if intruder: git restore --staged <file>)
   RULE 3: git show --name-only HEAD → verify after commit; reset --soft if intruder found

3. Release after self-verify passes:
   task_release_or_expire (task_id: "pm-commit-<slug>")
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

**PM commits convention:**
- `chore(memory/pm): notebook YYYY-MM-DD` — notebook only, no trailers (C2-exempt)
- `chore(pm/cNN): <description>` — cycle bookkeeping, no trailers (C2-exempt: cycle ref)
- `chore(pm/NNNN*): <description>` — sprint bookkeeping (decompose, move-to-Done), no trailers (C2-exempt: PM housekeeping)
- `chore(cycle-NN): <description>` — cycle artifact persist, no trailers (C2-exempt: cycle ref)
- Any commit where scope contains a sprint number AND delivers code/config MUST carry `Task:` trailer.

**5. Monitor** (every cycle):
- Blocked tasks → return `PIPELINE: blocked | NEXT: architect | [reason]`
- WIP > 2 → hold, return `PIPELINE: blocked | NEXT: po | WIP limit exceeded`
- Task → Review → update `.task_board` status → return `NEXT: qa | review Task NNN branch task/NNN-kebab`
- QA Done → **DJ-GATE-1** (before DONE flip): verify journal entry for task-id exists in `docs/agent-memory/decisions/sprint-<SPRINT_ID>-*.md`; if absent → status stays REVIEW, write `status_note: "journal-missing"`, `send_telegram(channel="work", message="[DJ-GATE-1] journal absent for <TASK_ID> — held REVIEW")`. Full gate: `docs/protocols/agent-chaining-protocol.md` § Journal-before-DONE Gate.
- QA Done + journal present → update `.task_board` status DONE → **HSC-6 eviction hook:** if task written to `done[]` or `done_verified[]`, immediately call cold eviction (under commit-mutex — see Pre-commit gate above):
  ```bash
  bash "$PROJECT_ROOT/scripts/orch-cold-evict.sh"
  YYYYMM=$(date -u +%Y-%m)
  git add docs/data/orch/orch-state.json "$PROJECT_ROOT/docs/data/orch/archive/${YYYYMM}.json"
  git commit -m "chore(tasks): done_verified eviction → archive/${YYYYMM}.json"
  ```
  **Invariant:** `done_verified[]` must never exceed 5 items in the hot file. Eviction failure → log BUG, continue (do not block planning cycle).
  → unblock next → return `NEXT: developer | implement Task NNN+1`
