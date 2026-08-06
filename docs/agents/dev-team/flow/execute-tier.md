# Dev Team — Step 3: Execution (Tiered, Zone-Routed, Worktree-Parallel)

<!-- BGFAN-1: ALL Agent spawns in this file MUST use run_in_background=true. Canonical rule → docs/protocols/agent-chaining-protocol.md § Background Spawn Mandate. Independent tier tasks fan out concurrently (parallel background); commit-mutex serialization unchanged. -->

**Parent flow:** `docs/agents/dev-team/flow/main.md` (Step 3 dispatcher)

Read `pm` return for task list + dependency map. Each task carries `zone:` field (mandatory per PM/architect contract).

---

## Tier Grouping

```
Tier 1: no deps → spawn ALL in one message (parallel)
Tier 2: depends on Tier 1 → spawn after Tier 1 Done
Tier 3: depends on Tier 2 → etc.
```

## Zone Routing — 3-Tier Resolution

→ Load skill: `.claude/skills/zone-detect/SKILL.md` (`fail_loud: true`)

Apply the skill's 2-step inference logic per task. Full zone→specialist table and Tier-1/2/3 resolution rules are in the skill.

Tier 3 firing on any task in a cycle = upstream bug (PO emitted zone-less FIX). Each Tier-3 spawn auto-drops a `zone_missing_tier3` signal per the skill's signal schema. Cumulative count > 5 in one cycle = escalate to architect via WORK channel.

## Mode Flag

Batches of type SPIKE carry `mode: "spike"` — the spawned developer (or dev-* zone agent) reads `feature-spike.md` instead of its default flow. All other batch types use the default flow.

## Per-Tier Parallel Spawn

**Dispatcher-wrap (Phase 3.5):** Before spawning any agent in a tier batch, claim each task first. Spawn only claimed tasks. Release ONLY the specific task_id whose own spawn call threw — never on the success path, never a batch-wide release bound to "the fan-out calls returned."

**LOCK-LIFETIME (FIX-EXECUTETIER-PHASE35-RESUME-LOCK-RELEASED-AT-SPAWN-NOT-COMPLETION, architect, 2026-08-06):** `run_in_background=true` returns in milliseconds while the spawned agent runs far longer — a release bound to "the batch of spawn calls returned" (the pre-fix shape below `finally: for each ... release`) frees every `task:<id>` in `spawned_batch` while every one of those agents is still live, letting the NEXT read of the SAME key (a later tick's S2/SLS/RLC/DRS resume, or a peer session) re-claim and duplicate-spawn onto a task that already has a live agent working it. This is the IDENTICAL class main.md's own S2/SLS/RLC/DRS/QA-Drain/SECONDARY-Drain/Wrapper-Autoclose dispatcher-wraps already fix (grep `LOCK-LIFETIME` in `docs/agents/dev-team/flow/main.md` and `post-cycle.md`) — no release on success, `ttl_seconds:3600` IS the lock's lifetime bound, release only on the per-item exception path.

**Adjudication (does the fix apply to every claim in `spawned_batch`, or only the single-task case where the claimed id equals `.head.active_task_id`?):** EVERY claim, unconditionally — there is no different-correctness case for a genuine multi-task PM-tier batch. `task:<id>` is a per-task_id mutex answering "does this specific task already have a live spawn" — it has no relationship to `.head` at all (`.head` is a single-slot resume POINTER used only by the idle-fallthrough chain; most of this file's own callers, e.g. main.md's Epic-Wrapper Autoclose Sweep and Review-Lane QA-Drain/SECONDARY-Drain, already claim+spawn MULTIPLE independent `task:<id>` rows per tick with NO `.head` write at all, and already carry this exact "no release on success, per-item exception-only release" shape — see `docs/agents/dev-team/flow/post-cycle.md` § Step 4.4, explicit: "this dispatch is independent of the head-idle fall-through's own single resume-pointer... NOT `.head`... so parallel closeouts never collide with each other or with `.head`"). Conflating the lock's scope with `.head`'s scope was the root confusion in the original board note; once untangled there is no design question left — this is a straight port of the already-validated pattern, per-task, regardless of batch width.

**Rejected alternative (`po_scope_widen_20260806` candidate (b) — a Step-0b short-circuit in main.md keyed on `head.updated_by` prefix, treated like WF-2's supervised-hold):** rejected, not adopted. WF-2 gates on CONTENT (does this row need a human `po_goahead_*` stamp) — static and correctly inert until an explicit stamp lands. `head.updated_by`'s provenance is IDENTICAL whether Phase-3.5 already spawned successfully (should hold), skipped via an `outer_claim` peer-collision (should legitimately retry), or crashed outright — a prefix check cannot distinguish those three, so it either wrongly blocks a legitimate S2 retry forever (no other lane exists to re-pick a BOUNDED-1-origin head once this short-circuit holds it) or provides no real protection once the string persists past the lock's own TTL. It also does nothing for the `po_occurrence_3_20260806` "COMPOUNDING" finding (`head.next_agent` left as the literal, non-spawnable string `"dev-team"`) — a distinct defect in the BOUNDED-1 claim script, not remedied by either candidate design, and out of scope here (not yet tracked as its own row as of this adjudication). A second, weaker mechanism solving the same liveness question `task_claim`/`task_release` already answers correctly (once this fix lands) is exactly the "two divergent mechanisms for the same lane" anti-pattern this codebase already flagged-and-rejected once (`docs/architecture-briefs/2026-08-06-review-lane-qadrain-throughput-unblock.md` §1b, re QA-Drain's batch shape). Fixing the lock's own hold-duration (adopted, above) closes the gap for every caller of `task:<id>` uniformly; a Step-0b provenance check would not.

**Regression fixture:** `scripts/audits/execute-tier-phase35-locklifetime-verify.sh` — live-drives the real `task_claim`/`task_release` MCP primitives (mirrors how the original S2 fix, commit `adb426877`, was itself "Live-proved against the real task_claim/task_release MCP primitives ... not flow-doc prose") against a throwaway `task:<id>`: proves a 2nd claim from a different session FAILS while the 1st claim is unreleased (the fixed, "spawned agent still live" state), and — negative control — that the SAME 2nd claim only succeeds once the 1st is explicitly released (the exact pre-fix counterfactual this row closes).

```
# Step 1 — Claim each task in the tier batch:
spawned_batch = []
for each (agent, task_id) in tier_batch:
  # SAFE-JSON: payload built as a structured object — NEVER interpolate task_id/agent into a /bin/sh string.
  # INVARIANT: no agent-authored or PM-authored field (task_id, agent name, zone) may appear
  #            in a shell command line. Use jq --arg pattern if a bash step is ever needed here.
  outer_claim = call_tool(server="vn-market", tool="task_claim", arguments={
    task_id:     "task:" + task_id,
    task_kind:   "sprint-task",
    owner_agent: "dev-team",
    owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980); was missing pre-fix
    ttl_seconds: 3600,
    payload:     JSON.stringify({site: "S1", spawning: agent})   // live schema requires a SERIALIZED JSON STRING (verified 2026-06-05); build object with bound params, stringify last — never shell-concatenate
  })
  if not outer_claim.claimed:
    log "[dev-team] SKIP task:" + task_id + " — held by " + outer_claim.current_holder.owner_agent
    send_telegram(channel="work", message="[dev-team] SKIP collision task:" + task_id + " — held by peer session")
  else:
    spawned_batch.append((agent, task_id))

# Step 2 + 3 — Spawn claimed tasks, per-task try/except (never a batch-wide `finally`):
# DJ-GATE-1: append to EVERY worker spawn-prompt: "Before returning, run skill .claude/skills/decision-journal/SKILL.md § Write Entry [task_id: <TASK_ID>] — DONE/REVIEW flip is INVALID without it." (canonical rule → docs/protocols/agent-chaining-protocol.md § Journal-before-DONE Gate)
for stage_calls in [devs, qa, fixer_if_needed]:        # e.g. devs = [(dev-stock-price,taskA),(dev-alert-engine,taskB)]
  for (agent, task_id) in stage_calls ∩ spawned_batch: # still issued as ONE parallel message per stage — BGFAN-1
    try:
      Agent(agent, task_id, run_in_background=true)    # (background)
      # LOCK-LIFETIME: NO release here on success — see note above. ttl_seconds:3600 (Step 1) is
      # this task_id's lock lifetime bound; the lock clears naturally once the Merge Gate/
      # DJ-GATE-1 flip moves the task out of in_progress[], or on TTL lapse (crash backstop) —
      # never via a release bound to "this stage's spawn call returned."
    except:
      # Release ONLY this task_id's own claim — its OWN spawn threw (Agent() never handed off).
      # Never touch a sibling task_id's still-good claim; never re-release a task_id an earlier
      # stage's exception already released.
      call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + task_id, owner_client_session: $CLAUDE_CODE_SESSION_ID })
      raise
```

**Worktree isolation:** add `isolation: "worktree"` to each Agent call. Main terminal merges worktree branches (fast-forward if disjoint) after tier returns. See `docs/architecture-briefs/2026-05-12-sprint-parallel-isolation.md`. Sequential MANDATORY until c44 pass (Phase 3); Phase 4 relaxes after c44+c45.

### Conflict Check Before Parallel Spawn

- Different files, disjoint scopes → parallel (`isolation: "worktree"`)
- Same file modified by both → sequential (omit `isolation`)
- Task B `depends_on` Task A → sequential
- Shared SSOT write (`docs/data/orch/orch-state.json`, project-stats.json, any agent .md) → sequential
- Same test suite → parallel ok if different test files AND no shared SQLite DB

### Developer Spawn Constraint (Invariant)

All developer agents MUST use `git commit -m "..."` (index-only). NEVER use `git commit -am` or `git commit -a` — the `-a` flag greedily stages untracked index content from other sources and violates C2 atomicity (root cause of c47 incident).

## Merge Gate (After Each Tier — Sequential)

Enter only after ALL tier agents returned.

```
1. bash scripts/audits/index-check.sh  → abort + WORK alert if exit 1 (Control 1)
2. For each agent branch in tier order (one-by-one, NOT batch):
   a. git cherry-pick <sha>  OR  git merge --ff-only <branch>
   b. bash scripts/audits/tree-verify.sh <cherry-sha>  → if exit 1: STOP, WORK alert, Control 5
   c. git worktree remove <path>  (worktree agents only)
   d. git branch -d <branch>      (worktree agents only)
3. bash scripts/audits/c2-alert.sh <new-HEAD-sha>  (Control 4 — non-blocking, prints warning)
4. If Control 1 or Control 3 fired: STOP tier, WORK alert, await human.
   Recovery: bash scripts/audits/recovery-snapshot.sh  (operator-explicit only — Control 5)
5. All controls pass → DJ-GATE-1 pre-flip check: verify journal entry exists for each completed task (canonical gate → `docs/protocols/agent-chaining-protocol.md` § Journal-before-DONE Gate) — tasks without journal entry stay REVIEW + status_note="journal-missing"; spawn pm (run_in_background=true) (background — BGFAN-1) to update `docs/data/orch/orch-state.json` `.task_board` + unblock next tier
6. Status-flip MUST move lane array-membership in the SAME write (no exceptions) → see § MUST — Status-Flip = Lane-Move below; a `.status` patch left in its old lane array is an INVALID flip, not a partial one.
```

---

## MUST — Status-Flip = Lane-Move (CANONICAL:SSOT-STATUSFLIP-LANEMOVE)

> **SSOT for this rule** — `docs/agents/dev-team/flow/main.md` § Step 3 Execution points here; do NOT duplicate the clause there.

Any agent (pm, qa, developer, fixer, or any other agent operating under dev-team dispatch) that flips a task's `.status` to a terminal/review token (`REVIEW`, `QA`, `DONE`, `DONE_VERIFIED`, `BLOCKED`, etc.) MUST, in the SAME `scripts/orch-apply.sh` write:
- (a) move the task's array-membership OUT of its current `.task_board.<oldlane>[]` and INTO the matching `.task_board.<newlane>[]` — never patch `.status` in place while leaving the object in the old lane array;
- (b) if the flipped task is `.head.active_task_id`, sync top-level `.head` in that SAME write, per the task's `branch` field:
  - **`branch: null` flipped to `REVIEW`** (the direct-execute / self-closeout path, `main.md` ~L643) → `.head` MUST be set to the idle terminal state — `status:"idle", active_task_id:null, next_agent:"router"` — NEVER `"review"`/`"in_progress"`. Do NOT mirror the task's own new `.status` onto `.head.status`: `"review"` IS a valid `.head.status` enum value (`docs/standards/orch-state-access.md §5`), but `main.md` § Pipeline Resume + Session Gate only branches on `head.status == "in_progress"` or `head.status ∈ {idle, done, missing, v1}` — `"review"` matches NEITHER, so it silently skips the BOUNDED-1→SLS→RLC→QA-Drain idle-fallthrough chain, which is the ONLY lane that dispatches `qa` in `verify-committed` mode against a branch:null row (no task branch/handoff exists for the normal `pipeline` JUMP-TO to check out). A non-idle head after this flip does not error — it just silently strands the row in `review[]` forever.
  - **branch-carrying (worktree-isolated) task**, or any flip where a next legitimate `active_task_id`/`next_agent` is dispatched in this SAME write → `.head` may point there instead of idle; this sub-case is unchanged.
- (c) **BLOCKED disambiguation (FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-ROWS, 2026-07-30):** `apps/mcp-server/src/infrastructure/orchStateSchema.ts` § ADD-2 lists `BLOCKED` as a lane-coherent status for THREE lanes (`backlog`, `review`, `in_progress`) — that table governs schema VALIDITY only (`checkLaneCoherence()` does not fail on a BLOCKED row sitting in any of the three); it is NOT a license to leave a row wherever it happened to be when it went BLOCKED, and it does NOT create an exception to rule (a) above. An `IN_PROGRESS -> BLOCKED` flip MUST still move the row OUT of `in_progress[]` and INTO `backlog[]` (`.status` stays `BLOCKED`, `blocked_reason`/`blocked_at` required) in the SAME write — `backlog[]` is BLOCKED's resting lane, because a blocked-mid-flight row is, operationally, un-worked/parked work awaiting architect/PO adjudication, not live concurrency. **Confirmed recurrence:** `FU-CNYVND-DEAD-FIELD-REMOVE` flipped `IN_PROGRESS`→`BLOCKED` at 2026-07-30T16:53:28Z and was left in `in_progress[]` — the commit message doing the flip cited THIS SAME ADD-2 table as justification ("BLOCKED is a valid in_progress sub-state per orchStateSchema.ts LANE_STATUS_MAP"), which is exactly the ambiguity this bullet closes. Downstream effect: `wip_in_progress` (`scripts/lib/devteam-eligibility.jq`) treated the parked row as live concurrency, freezing BOUNDED-1/SLS/RLC/DRS fleet-wide for ~2.5h — PO hand-unparked it into `backlog[]` as acute containment; `wip_in_progress` was ALSO hardened (excludes BLOCKED/`TERMINAL_SET` rows from the count regardless of lane) as a read-side belt to this write-side suspenders, so a future missed lane-move degrades WIP accounting instead of freezing it. Self-healing backstop for a flip that skips this bullet: `docs/agents/dev-team/flow/main.md` § WF-1 BLOCKED-task check performs the same lane-move on the next dev-team resume tick if `.head` was left pointing at the row.

A status-flip WITHOUT the matching lane-move is **FORBIDDEN**. WIP and coherence checks (e.g. `main.md` § Idle-capacity backlog pickup BOUNDED-1, `scripts/devteam-backlog-promote-bounded1.jq`) are computed by ARRAY MEMBERSHIP, not by reading `.status` — a status-only flip desyncs WIP counts from ground truth and strands the row in the wrong lane (`.status` says REVIEW/QA/DONE while the object still physically sits in `in_progress[]`).

**Confirmed recurrence (3x)** — root-cause + incident detail: `feedback_review_status_stuck_in_inprogress_lane_blocks_wip.md`; board row `FIX-DEVTEAM-STATUSFLIP-LANEMOVE-RULE`. Note: the review lane also lacks a dedicated QA-drain step — that is a SEPARATE, NOT-yet-fixed gap tracked as `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN`; do not conflate the two.

**Confirmed recurrence — branch:null head-sync wrong-value (distinct from the lane-move gap above; head WAS synced per rule (b), but to the WRONG value):** live 2026-07-23, commit `38f081ec1` — a `developer` DONE→REVIEW self-closeout of `UC-GCP-P1` correctly lane-moved (a) but set `.head.status = "review"` (mirrored the task's own status) instead of `"idle"`; dispatcher had to hand-reset `head`→`idle` to unstall QA-Drain (3 rows unblocked). Routing-gap signal `dev-team-20260723T063731Z-head-review-unhandled-bypasses-qadrain` → board row `FIX-EXECTIER-HEADSYNC-BRANCHNULL-REVIEW-IDLE` (this clause is that row's fix). Symptom before this clause existed: `review[]` grew unboundedly (47 rows live, `qa[]=0`) because every branch:null REVIEW flip that didn't independently think to idle `.head` stranded its row past the fall-through chain. Regression verifier: `scripts/audits/execute-tier-branchnull-review-headidle-verify.sh` — SYNTHETIC before/after fixture replay of the live incident shape (no code-enforced call site exists to test directly: every flip is hand-written jq per agent per tick); proves the documented pattern itself yields `head={status:idle, active_task_id:null, next_agent:router}`.
