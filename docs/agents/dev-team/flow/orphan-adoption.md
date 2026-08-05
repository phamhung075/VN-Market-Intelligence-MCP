<!-- size-justification: relocated verbatim from docs/agents/dev-team/flow/main.md (TE-T02, 2026-08-05, docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-02 — WU-2 verbatim-relocation guarantee: content moved, not deleted). Reached ONLY when the inline task_list_held probe kept in main.md § Step 0a-B returns at least one orphan-signal row with original_task_kind=="sprint-task" — observed rare; the common no-orphan-signals tick never reads this file. Body below (per-signal adoption loop: N_MAX redispatch gate, claim, DoD-P15-1 tree-hygiene precondition, checkpoint verify, board flip, resume-spawn) is byte-identical to its prior inline home. -->
# Dev Team — Step 0a-B: Orphan-Signal Adoption Loop (P1.5-AF-2 — Sprint CROSS-SESSION-MULTI-TEAM-ORCH · TASK_1987)

**Parent flow:** `docs/agents/dev-team/flow/main.md` (Step 0a-B — reached only when the inline
`task_list_held` probe kept there returns a non-empty `sprint-task` orphan-signal set)

> **Honest bound:** zero live sessions = zero execution; the reaper only makes work ADOPTABLE, it
> never self-heals execution.

```
for each signal in orphan_signals where signal.payload.original_task_kind == "sprint-task":
  original_task_id           = signal.payload.original_task_id
  redispatch_count           = signal.payload.redispatch_count   # DoD-P15-3: carry forward
  last_payload               = signal.payload.last_payload
  dead_session               = signal.payload.original_owner_client_session
  task_zone                  = signal.payload.zone ?? infer_from_task_id(original_task_id)

  if redispatch_count >= N_MAX:
    # Router P1.5-AF-1 handles escalation — dev-team SKIPS; do NOT re-dispatch
    log "[dev-team] orphan-signal:{original_task_id} redispatch_count={redispatch_count} >= N_MAX — skip (router escalates)"
    continue

  # Claim the original task_id (stale-steal succeeds: reaper deleted the original row)
  adopt_result = call_tool(server="vn-market", tool="task_claim", arguments={
    task_id:              original_task_id,
    task_kind:            "sprint-task",
    owner_agent:          "dev-team",
    owner_client_session: $CLAUDE_CODE_SESSION_ID,   # REQUIRED — authoritative key
    ttl_seconds:          3600,
    payload:              {"site": "orphan-adoption",
                           "adopted_from": dead_session,
                           "redispatch_count": redispatch_count}   # DoD-P15-3: carry forward
  })

  if not adopt_result.claimed:
    log "[dev-team] orphan-signal:{original_task_id} — adoption lost to peer; skip"
    continue

  # --- DoD-P15-1 GATE: Tree-Hygiene PRECONDITION (MANDATORY — load-bearing) ---
  # A dead worker's uncommitted edits are LIVE in the shared working tree and corrupt until reverted.
  # This gate MUST run BEFORE any resume work. The checkpoint SHA is blind to live tree state.
  #
  # Run git status --porcelain scoped to the task zone:
  uncommitted = $(git status --porcelain -- {task_zone} | grep -E '^[ M]M')
  reverted_files = []
  for each line in uncommitted:
    filepath = line[3:]   # strip status prefix
    git checkout -- {filepath}
    reverted_files.append(filepath)
    log "[dev-team] tree-hygiene: reverted uncommitted edit in {filepath} (dead session: {dead_session})"

  # Leave untracked files in place (e.g. .DS_Store, build artifacts, node_modules/ if not tracked)
  # Lines starting with '??' in git status are untracked — leave them

  # Surface reverted list in board note (see board flip below)
  tree_hygiene_note = "tree-hygiene: reverted " + len(reverted_files) + " file(s): " + join(reverted_files, ", ")
  send_telegram(channel="work",
    message="[dev-team] Adopted orphan task {original_task_id} from dead session {dead_session}. {tree_hygiene_note}")

  # --- Read checkpoint from signal payload (§6.5.5 resume contract) ---
  git_sha = last_payload.git_sha ?? null

  if git_sha:
    # Verify checkpoint is in repo history
    sha_valid = $(git log --oneline -5 {git_sha} 2>&1 | grep -c {git_sha})
    if sha_valid == 0:
      send_telegram(channel="bug",
        message="[dev-team] Orphan adoption {original_task_id}: git_sha {git_sha} not in history — cannot resume; skip")
      call_tool(server="vn-market", tool="task_release", arguments={
        task_id: original_task_id, owner_client_session: $CLAUDE_CODE_SESSION_ID
      })
      call_tool(server="vn-market", tool="task_release", arguments={
        task_id: "orphan-signal:" + original_task_id, owner_client_session: $CLAUDE_CODE_SESSION_ID
      })
      continue
    # Checkpoint valid — continue work from git_sha (DO NOT re-run already-committed steps)
    log "[dev-team] resuming from checkpoint SHA={git_sha} (DoD-P15-3 redispatch_count={redispatch_count})"
  else:
    # No git SHA checkpoint — resume from board state (task_board entry is authoritative)
    log "[dev-team] no git_sha checkpoint in orphan-signal payload; resuming from board state"

  # --- Board flip: update assigned_to, leave status=in_progress (re-assign only) ---
  # MUST route via scripts/orch-apply.sh (NEVER raw write — SSOT-W1-ORCH-APPLY-WRAPPER)
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  # DoD-P15-2: check for cowork-slot or cron published artifact before re-running
  # (sprint-task checkpoint is git SHA; this check is belt-and-suspenders for mixed-kind adoptions)
  jq --arg tid "{original_task_id}" --arg now "$NOW" --arg note "{tree_hygiene_note}" \
    --arg session "$CLAUDE_CODE_SESSION_ID" \
    '(.task_board.active_sprints[].tasks[] | select(.id == $tid))
     |= (.assigned_to = $session | .adopted_at = $now | .tree_hygiene_note = $note)' \
    docs/data/orch/orch-state.json \
    | bash "$PROJECT_ROOT/scripts/orch-apply.sh"

  # --- Release the orphan-signal row after successful adoption ---
  call_tool(server="vn-market", tool="task_release", arguments={
    task_id:              "orphan-signal:" + original_task_id,
    owner_client_session: $CLAUDE_CODE_SESSION_ID
  })

  # --- Resume work ---
  # Treat adopted task as the next task to execute — prepend to work queue
  # Spawn the appropriate agent with checkpoint; dev-team owns the original task_id lock
  Agent(<zone-agent>, prompt="run docs/agents/<zone-agent>/flow/main.md
        coordination_session=$CLAUDE_CODE_SESSION_ID
        task={original_task_id}
        checkpoint={git_sha}
        redispatch_count={redispatch_count}
        mode=adopt-resume",
        run_in_background=true)   # BGFAN-1
  # Adoption path exits here — release original lock inside the spawned agent's finally block
  JUMP TO end   # adopted task queued; do not process further signals in this tick
```
