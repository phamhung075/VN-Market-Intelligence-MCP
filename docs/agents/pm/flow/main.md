<!-- size-justification: 210L — single PM orchestration flow; TASKS.md gate, handoff template, multi-zone handling, DASHBOARD CAS guard, heartbeat lock protocol, commit convention, pre-commit mutex gate, mandatory decision-journal step, and HSC-3 terminal-lane bloat gate + HSC-6 done_verified eviction hook are all non-separable PM responsibilities executed in sequence. UC-DTL-P9 2026-07-23: Sprint closeout step — atomic sprint-terminal-flip + guarded head-idle via scripts/pm-closeout-head-idle.jq, replaces the old two-write flip+idle sequence (+11L). FIX-PM-HEAD-RESET-SHAPE 2026-08-11: +18L (229→247, live line-count at edit time; the "210L" figure above was already stale pre-edit, not corrected here — out of this task's scope) — new Step 4c (Non-closeout head release), inserted after Step 4b, before the Signal Queue Write Guard section: full `.head =` null-out (status/active_task_id/next_agent/updated_at/updated_by) whenever a mid-sprint decomposition mints child task(s) without triggering §5's Sprint closeout, matching `docs/agents/dev-team/flow/main.md`'s WF-1c ready-lane convention byte-for-byte instead of the previous undocumented partial status-only flip (2 confirmed occurrences, `feedback_pm_midsprint_decomposition_leaves_head_stale_not_closeout`: UC-RDL-P4 — head left fully untouched; FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE commit `95540b50d` — status flipped, active_task_id/next_agent left dangling, router repair `82ec1f018`). Inlined directly in this file (no new scripts/ file — agent-father's commit_zone excludes scripts/, TE-T02 precedent). FIX-PM-DECOMPOSE-CLOSEOUT-STEP-UNREACHABLE-PAST-RETURN-AND-MINT-OMITS-NEXTAGENT 2026-08-23 (agent-father, per architecture brief `docs/architecture-briefs/2026-08-14-pm-decompose-closeout-reachability-and-nextagent-mint.md`): +28L (247→275) — Steps 3d + old-4c relocated to BEFORE the decomposition-mint invocation's own `## RETURN` (previously the RETURN sat between 3c and 3d, leaving 3d/4/4b/4c all textually unreachable — 3 confirmed occurrences of stale `.head`/parent-row/child-`next_agent`); old-4c renamed 3e and gained a `DECOMPOSITION_COMPLETE` closeout-vs-partial branch (parent → `done[]` + `.children` write, or row-level `next_agent` correction) folding in the write-side half of `FIX-DEVTEAM-EPICWRAPPER-PARENTHOOD-FIELD-DRIFT-AUTOCLOSE-BLIND`; Steps 4/4b relocated under a new `## Task Lifecycle — Later-Cycle Steps` heading (bounds the later, separate re-invocation segment); Step 3's canonical task-JSON shape note gained `next_agent` as conditionally-mandatory-at-mint with a routing-intent-source order. FIX-PM-3E-FAILLOUD-HOTFIX 2026-08-23 (agent-father, architecture brief `docs/architecture-briefs/2026-08-23-pm-decompose-closeout-lane-resolution-and-fail-loud.md` §4.2 L1+L2, brief §6 row 1): +66L (275→341, mostly the inline rationale comment) — Step 3e's two branches gain jq refuse-guards (parent missing / cross-lane duplicate / already terminal / empty CORRECTED_NEXT_AGENT) and their bare `|| echo` tails become `|| { echo >&2; exit 1; }`, matching Step 3c's own idiom in this same file. Also fixes a THIRD defect the brief did not have, found by executing the block against a live-shaped fixture: both branches iterated `.tasks` unguarded while 2 of 19 live `active_sprints[]` carry no `tasks` key, so jq died with "Cannot iterate over null" and the SUCCESS path was unrunnable in both branches. HOTFIX ONLY — the step is NOT restructured and still cannot dispose of a `ready[]`/`backlog[]` parent; brief row 3 supersedes this block once row 2 ships `scripts/pm-decompose-closeout.jq`. -->
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
- Task JSON shape — canonical per `docs/standards/task-schema.md`: `{id, title, owner, status, zone, created_at}` + optional `{type, size, priority, depends, note, files, status_note}`. **`next_agent` (FIX-PM-DECOMPOSE-CLOSEOUT-STEP-UNREACHABLE-PAST-RETURN-AND-MINT-OMITS-NEXTAGENT, 2026-08-14): mandatory at mint time whenever the resolved `owner` is NOT a dev-role (`scripts/lib/devteam-eligibility.jq:is_dev_role`)** — omission silently defeats the Ready-Lane Consumer's dispatch resolution (falls back to `owner`, which may be the SUBJECT agent being edited, not the editor that should apply the change). Routing-intent source, in priority order: (1) the architect design handoff's own per-subtask assignment — a `review_note`/`note` field on the PARENT row or its `docs/handoffs/<parent>.md` enumerating per-subtask owning agents (e.g. "1 shared-skill-file subtask → developer, 6 agent-family-flow-edit subtasks → agent-father"); (2) if the architect design is silent for a given child, `next_agent := owner` ONLY IF `owner` is a dev-role; (3) otherwise HOLD AND ESCALATE — never mint with `next_agent` silently omitted: write `status_note: "next_agent unresolved — architect design silent on per-child routing, owner is non-dev"` and `send_telegram(channel="work")`. NEVER use banned fields: `task_id` (write), `desc`, `label`, `summary`, `resolvedId`, `resolved_id`.

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
`zone:` on every task is mandatory — dev-team Step 3 reads this field to pick the right dev-* specialist.

**3d.** Heartbeat umbrella lock → load skill: `.claude/skills/task-lock/SKILL.md`
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id: "task:" + sprint_id,
  owner_client_session: "<resolved CLAUDE_CODE_SESSION_ID — REQUIRED, coordinationTools.ts:165-171;
    substitute the real value, NEVER write the literal text "$CLAUDE_CODE_SESSION_ID">
})
// ok=false here = sprint umbrella expired or stolen; log only, do not abort planning
```

**3e. Decomposition-closeout disposition** (FIX-PM-DECOMPOSE-CLOSEOUT-STEP-UNREACHABLE-PAST-RETURN-AND-MINT-OMITS-NEXTAGENT, 2026-08-14 — renamed + relocated from the old Step 4c so it sits BEFORE this invocation's own `## RETURN` below and is therefore always reached; absorbs the write-side half of `FIX-DEVTEAM-EPICWRAPPER-PARENTHOOD-FIELD-DRIFT-AUTOCLOSE-BLIND` per architecture brief `docs/architecture-briefs/2026-08-14-pm-decompose-closeout-reachability-and-nextagent-mint.md` §5/§6):

pm decides, explicitly, whether Steps 2/3/3c above delegated ALL of the dispatched row's (`$SPRINT_ID`'s) scope to the minted children this cycle — encode the decision as `DECOMPOSITION_COMPLETE=true|false`, never left implicit in prose (`decomposition_note`). This determines the parent row's terminal disposition; §5 Monitor's Sprint closeout (below) is a SEPARATE, later-cycle write over `active_sprints[].tasks[]` and does not substitute for this step, which must fire on every decomposition-mint invocation regardless of sprint-closeout status.

- `DECOMPOSITION_COMPLETE=true` (this invocation is pm's LAST touch on `$SPRINT_ID` — all scope now delegated) → **closeout-shaped**, matching the `FIX-READYLANE-...` precedent (commit `86b7a6264`) formally instead of ad hoc: parent row moves `in_progress[]`/`active_sprints[].tasks[]` → `done[]`, `status: "DONE"`, `closed_at: $now`, **`children: [<minted child ids>]`** (closes the write-side half of the parenthood-field-drift gap — `effective_children` sweeps can now see the relationship).
- `DECOMPOSITION_COMPLETE=false` (mid-sprint-partial — more decomposition or pm oversight remains on this row) → parent row **stays** in its current lane, row-level `next_agent` corrected to a non-stale value (often `"pm"` again if more decomposition is pending — never left pointing at a stage that already finished).

Both branches ALSO perform the `.head` full null-out inherited from the old Step 4c guard (content unchanged) — fires ONLY if `.head.active_task_id` (freshly re-read, never cached) still names `$SPRINT_ID`, and ONLY if §5's Sprint closeout has not already written `.head` this same cycle (never write `.head` twice in one cycle). Two confirmed occurrences pre-dated this guard (`feedback_pm_midsprint_decomposition_leaves_head_stale_not_closeout`): UC-RDL-P4 2026-08-11 — `.head` left fully untouched; FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE 2026-08-11T19:27Z, commit `95540b50d` — only `.head.status` flipped, `active_task_id`/`next_agent` left dangling, forcing router repair `82ec1f018`. A THIRD occurrence (UC-CCA-P2, 2026-08-14) additionally left the parent row itself stale with ZERO 4c write attempt and all 7 minted children `next_agent`-omitted — the reachability defect this Step 3e relocation exists to close.

ONE `orch-apply.sh` write, same shape both branches:

<!-- FIX-PM-3E-FAILLOUD-HOTFIX (2026-08-23, agent-father; architecture brief
     docs/architecture-briefs/2026-08-23-pm-decompose-closeout-lane-resolution-and-fail-loud.md
     §4.2 rows L1+L2, brief §6 row 1). HOTFIX SCOPE ONLY — this converts a SILENT corruption/no-op
     into a VISIBLE refusal. It deliberately does NOT make Step 3e work on a parent sitting in
     `ready[]`/`backlog[]`; that is brief row 3 (`FIX-PM-3E-FLOWDOC-REPOINT-3WAY-DISPOSITION`),
     which supersedes this block once row 2 ships `scripts/pm-decompose-closeout.jq`. Do not
     restructure the step here.

     WHAT WAS BROKEN, both measured on the live doc:
     L1 — the `true` branch resolved `$row` with `... | .[0]`, which yields `null` when the parent
     is in NEITHER `in_progress[]` NOR `active_sprints[].tasks[]`. `null + {status:"DONE", ...}`
     is a VALID jq expression, so the branch happily appended a synthetic id-less row to `done[]`
     and the write went through. The `false` branch was worse: its two `map(if .id == $sid ...)`
     calls are a silent no-op on a miss — nothing written, exit 0, step reports success. Three
     confirmed occurrences (UC-RDL-P4, FIX-BCTC-FALLBACK-SHELL-..., UC-CCA-P2) all read as clean
     cycles for exactly this reason.
     L2 — both tails were bare `|| echo "..."`. `echo` exits 0, so an `orch-apply.sh` rejection
     (validator / CAS mismatch / prose-ceiling) was swallowed and the step still reported success;
     architect measured `wrapped exit=0` today. Step 3c in THIS SAME FILE already uses the correct
     `|| { echo "..." >&2; exit 1; }` idiom — 3e had diverged from its own neighbour.

     THIRD DEFECT, NOT IN THE BRIEF, found only by EXECUTING this block against a live-shaped
     fixture: both branches iterated `.tasks` unguarded (`.tasks |= map(...)`), and 2 of the 19 live
     `active_sprints[]` entries (`SPRINT-CCATO-TRUTHGATE-MCP-NATIVE`, `SYSREMAKE-P2-STRUCTURAL-
     REMAKE-ROUTE`) have NO `tasks` key at all. jq raised "Cannot iterate over null" and exited 5
     BEFORE producing any candidate — i.e. Step 3e's SUCCESS path was structurally unrunnable on
     today's board, in both branches. Now guarded with `if (.tasks|type)=="array" ... else . end`,
     which also leaves those two tasks-less sprints byte-identical rather than materialising an
     empty `tasks: []` on them. Shipping the fail-loud tails without this would have converted a
     silent no-op into a loud refusal on EVERY invocation — visible, but still never working.

     ON "DISTINCT EXITS" (brief AC-4): all three refusals exit 5 (jq's error code), and the brief's
     own evidence column says so. They are distinguished by MESSAGE, not by code — do not invent
     per-case exit codes here. The pipeline still ends non-zero on every one of them: jq exits 5
     having written nothing, `orch-apply.sh` receives empty stdin and exits 3, and the pipeline's
     status is the last command's, so L2's `exit 1` fires without needing `pipefail`. -->

```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
head_active=$(jq -r '.head.active_task_id' "$PROJECT_ROOT/docs/data/orch/orch-state.json")
if [ "$DECOMPOSITION_COMPLETE" = "true" ]; then
  jq --arg s "idle" --arg t "$NOW" --arg u "pm" --arg sid "$SPRINT_ID" --arg head_active "$head_active" \
     --argjson children "$CHILD_IDS_JSON" \
     '(.task_board.in_progress // []) as $ip
      | (.task_board.active_sprints // []) as $as
      | ( [$ip[], ($as[]?.tasks[]?)] | map(select(.id == $sid)) ) as $hits
      | ( [ (.task_board.done // [])[], (.task_board.done_verified // [])[] ]
          | map(select(.id == $sid)) ) as $terminal_hits
      | if ($hits | length) > 1 then
          error("[pm 3e] parent \($sid) resolves in \($hits|length) places across in_progress[]/active_sprints[].tasks[] -- ambiguous, refuse")
        elif ($hits | length) == 0 and ($terminal_hits | length) > 0 then
          error("[pm 3e] parent \($sid) is already in a TERMINAL lane (done[]/done_verified[]) but Step 3e was invoked with an open disposition -- refuse, do not re-close")
        elif ($hits | length) == 0 then
          error("[pm 3e] parent \($sid) NOT FOUND in in_progress[] or active_sprints[].tasks[] -- refuse. This step cannot dispose of a ready[]/backlog[] parent; see FIX-PM-3E-CLOSEOUT-SCRIPT-LANE-AGNOSTIC")
        else . end
      | ( $hits[0] ) as $row
      | .task_board.done = ((.task_board.done // []) + [ $row + {
            status: "DONE", closed_at: $t, children: $children } ])
      | .task_board.in_progress = [ $ip[] | select(.id != $sid) ]
      | .task_board.active_sprints = [ $as[]
          | if (.tasks | type) == "array" then .tasks |= map(select(.id != $sid)) else . end ]
      | (if $head_active == $sid then
           .head = {status:$s, active_task_id:null, next_agent:null, updated_at:$t, updated_by:$u}
         else . end)' \
    "$PROJECT_ROOT/docs/data/orch/orch-state.json" | bash "$PROJECT_ROOT/scripts/orch-apply.sh" \
    || { echo "[pm] decomposition-closeout ABORTED for ${SPRINT_ID} — refused above or orch-apply.sh rejected; live SSOT untouched" >&2; exit 1; }
else
  jq --arg s "idle" --arg t "$NOW" --arg u "pm" --arg sid "$SPRINT_ID" --arg na "$CORRECTED_NEXT_AGENT" --arg head_active "$head_active" \
     '(.task_board.in_progress // []) as $ip
      | (.task_board.active_sprints // []) as $as
      | ( [$ip[], ($as[]?.tasks[]?)] | map(select(.id == $sid)) ) as $hits
      | ( [ (.task_board.done // [])[], (.task_board.done_verified // [])[] ]
          | map(select(.id == $sid)) ) as $terminal_hits
      | if ($hits | length) > 1 then
          error("[pm 3e] parent \($sid) resolves in \($hits|length) places across in_progress[]/active_sprints[].tasks[] -- ambiguous, refuse")
        elif ($hits | length) == 0 and ($terminal_hits | length) > 0 then
          error("[pm 3e] parent \($sid) is already in a TERMINAL lane (done[]/done_verified[]) but Step 3e was invoked with an open disposition -- refuse, do not reopen")
        elif ($hits | length) == 0 then
          error("[pm 3e] parent \($sid) NOT FOUND in in_progress[] or active_sprints[].tasks[] -- refuse. The old form silently no-op'd here and reported success; see FIX-PM-3E-CLOSEOUT-SCRIPT-LANE-AGNOSTIC")
        elif (($na // "") | length) == 0 then
          error("[pm 3e] CORRECTED_NEXT_AGENT is empty for \($sid) -- refuse. TaskSchema.next_agent is z.string().optional(), NOT nullable; writing null aborts the whole write at the validator")
        else . end
      | (.task_board.in_progress // []) |= map(if .id == $sid then .next_agent = $na else . end)
      | (.task_board.active_sprints // []) |= map(
          if (.tasks | type) == "array"
          then .tasks |= map(if .id == $sid then .next_agent = $na else . end)
          else . end)
      | (if $head_active == $sid then
           .head = {status:$s, active_task_id:null, next_agent:null, updated_at:$t, updated_by:$u}
         else . end)' \
    "$PROJECT_ROOT/docs/data/orch/orch-state.json" | bash "$PROJECT_ROOT/scripts/orch-apply.sh" \
    || { echo "[pm] non-closeout head+next_agent correction ABORTED for ${SPRINT_ID} — refused above or orch-apply.sh rejected; live SSOT untouched" >&2; exit 1; }
fi
```
FULL null-out ONLY on `.head` (whole-object `.head =` replace) — matches `docs/agents/dev-team/flow/main.md`'s WF-1c ready-lane convention byte-for-byte, never a partial field-wise status-only flip. Do NOT reuse `scripts/pm-closeout-head-idle.jq` here — that script ALSO flips the sprint's own `.status` to `"DONE"` unconditionally, which is wrong for the `DECOMPOSITION_COMPLETE=false` branch (the row legitimately stays `IN_PROGRESS` — only children moved). No-op-safe by construction: if `.head.active_task_id` no longer matches `$SPRINT_ID` (a concurrent write already moved it on), the `.head` branch is simply skipped — safe to run unconditionally at the end of every planning cycle.

Return task list with dependency tiers and zone per task — this is the TRUE last reachable element of the decomposition-mint invocation (Steps 1-3e). **Reachability invariant: no numbered step may be added below this RETURN in this same document segment** — that is the exact defect this relocation fixes; a new step belongs either before this RETURN (same invocation) or under `## Task Lifecycle — Later-Cycle Steps` below (a bounded, separate segment for the later, separate invocation):
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

## Task Lifecycle — Later-Cycle Steps

Reached only on a SEPARATE pm re-invocation AFTER the decomposition-mint pass above (Steps 1-3e) has already returned — dev-team Step 3, "after each tier completes." This `## `-bounded heading is the segment marker the reachability invariant above needs: NOT part of the same invocation as Steps 1-3e, and no future edit near Steps 4/4b can accidentally land them back in the decomposition-mint segment.

**4.** Set task status → `in_progress` when developer picks up

**4b.** Heartbeat developer's task lock if pre-existing:
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id: "task:" + task_id,
  owner_client_session: "<resolved CLAUDE_CODE_SESSION_ID — same requirement as Step 3d above>"
})
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
1. Resolve owner_client_session — REQUIRED, no default (coordinationTools.ts:104-110,
   P1-FINAL/TASK_1980). Substitute the ACTUAL resolved value of your session's
   CLAUDE_CODE_SESSION_ID (Bash: `echo $CLAUDE_CODE_SESSION_ID` if you hold a Bash grant, or the
   literal value your dispatcher already substituted into your spawn prompt as a coordination
   parameter). NEVER write the literal text "$CLAUDE_CODE_SESSION_ID" inside the call_tool
   arguments — an LLM-issued call_tool is a direct function call, not a shell command, so the
   variable is NOT expanded; the literal string would be sent as the session id and silently
   defeat the mutex (session memory: feedback_llm_issued_call_tool_does_not_expand_session_id_variable).

2. Claim commit-mutex:
   task_claim(task_id="pm-commit-<slug>", task_kind="commit-mutex",
     owner_agent="pm", owner_client_session="<resolved value from step 1>", ttl_seconds=120)

3. Apply commit-boundary RULE 1-3 (.claude/skills/commit-boundary/SKILL.md):
   RULE 1: git add <named files only> — NEVER git add -A or git add .
   RULE 2: git diff --cached --name-only → verify all paths within pm zone
            (allowed: docs/data/orch/orch-state.json, docs/agent-memory/notebooks/pm.md)
            (if intruder: git restore --staged <file>)
   RULE 3: git show --name-only HEAD → verify after commit; reset --soft if intruder found

4. Release after self-verify passes (task_release is the only registered release tool —
   "task_release_or_expire" does not exist; {ok:true, released:0} on an expired/foreign lock
   is already a clean no-op, not an error):
   task_release(task_id="pm-commit-<slug>", owner_client_session="<same resolved value as step 1>")
```

**End of cycle** → skill: `.claude/skills/end-0-cowork/SKILL.md`

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
  git commit -m "chore(tasks): done_verified eviction → archive/${YYYYMM}.json" \
    -- docs/data/orch/orch-state.json "$PROJECT_ROOT/docs/data/orch/archive/${YYYYMM}.json"
  ```
  **Invariant:** `done_verified[]` must never exceed 5 items in the hot file. Eviction failure → log BUG, continue (do not block planning cycle).
- All of a sprint's `active_sprints[].tasks[]` reach terminal status → **Sprint closeout** (UC-DTL-P9 — ONE atomic transform, replaces the old two-write flip+idle sequence that could leave `.head` desynced mid-closeout): under commit-mutex (see Pre-commit gate above):
  ```bash
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq --arg sprint_id "$SPRINT_ID" --arg now "$NOW" \
    -f "$PROJECT_ROOT/scripts/pm-closeout-head-idle.jq" "$PROJECT_ROOT/docs/data/orch/orch-state.json" \
    | bash "$PROJECT_ROOT/scripts/orch-apply.sh" \
    || echo "[pm] sprint closeout ABORTED for ${SPRINT_ID} — orch-apply.sh failed, live SSOT untouched"
  ```
  Sets the sprint's `.status = "DONE"` in place (does NOT move it to `closed_sprints[]` — task-archive.md / `orch-cold-evict.sh` owns that eviction on its own bloat-gate cadence) and CONDITIONALLY idles `.head` only if `.head.active_task_id` belonged to this sprint or was null (guarded pattern mirrors `scripts/ops-closegate-handoff.jq`).
  **Self-verify before RETURN:** if `.head.active_task_id` belonged to this sprint (or was null) pre-write, assert `jq -r '.head.status' "$PROJECT_ROOT/docs/data/orch/orch-state.json"` == `"idle"`; else log `[pm] closeout: head owned by unrelated task <id> — left untouched` (deliberate — dev-team's RAW-verify expects this, no further action needed).
  → unblock next → return `NEXT: developer | implement Task NNN+1`
