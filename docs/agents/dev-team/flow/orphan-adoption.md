<!-- size-justification: 188L — FIX-ORPHAN-FR4-FR5-FLOW-DEVTEAM-ADOPTION-GUARD (developer, 2026-08-25) added the FR-4 board-state guard (hot-lane + cold-archive + supervised classification, shared scripts/lib/resolve-task-lane-by-id.jq — see .claude/skills/dispatch-claim/SKILL.md Orphan-Adoption Probe for the SSOT classification rule this block applies identically) + the FR-5 lane-aware board-flip fix (EC-1 prefix-strip, EC-2 flat-lane blindness) + FR-2 Rung-B owner_agent/original_owner_client_session params across all 3 task_release call sites + a task_zone-empty tree-hygiene refusal (never repo-wide revert). Safety-critical for the exact MATERIALIZED incident this file's own Parent Ticket exists to close — not compressible below this without re-deriving the copy-paste-drift class it fixes. Relocated verbatim from docs/agents/dev-team/flow/main.md (TE-T02, 2026-08-05) baseline retained below this note. -->
# Dev Team — Step 0a-B: Orphan-Signal Adoption Loop (P1.5-AF-2 — Sprint CROSS-SESSION-MULTI-TEAM-ORCH . TASK_1987)

**Parent flow:** `docs/agents/dev-team/flow/main.md` (Step 0a-B — reached only when the inline
`task_list_held` probe kept there returns a non-empty `sprint-task` orphan-signal set)

> **Honest bound:** zero live sessions = zero execution — the reaper only makes work ADOPTABLE, it
> never self-heals execution.

```
for each signal in orphan_signals where signal.payload.original_task_kind == "sprint-task":
  original_task_id           = signal.payload.original_task_id
  redispatch_count           = signal.payload.redispatch_count   # DoD-P15-3: carry forward
  last_payload               = signal.payload.last_payload
  dead_session                = signal.payload.original_owner_client_session
  task_zone                  = signal.payload.zone ?? infer_from_task_id(original_task_id)

  # --- FR-4 Board-State Guard (IDENTICAL classification rule to
  # .claude/skills/dispatch-claim/SKILL.md § Orphan-Adoption Probe — that file
  # is SSOT for the active/terminal rule; the genuinely-shared part is the
  # board lookup mechanics, extracted ONCE into scripts/lib/resolve-task-lane-by-id.jq
  # — the FR-5 board-flip below reuses the SAME $bare_id/$hit, no re-derivation).
  # Runs BEFORE the redispatch_count >= N_MAX branch (EC-3) AND before the adopt
  # claim (stronger than the base position — never locks work that is already
  # finished). WIDENED per this row's own po_corroboration_20260808 annotation
  # (10/10-stale orphan-signal batch observed live 2026-08-06/08): a hot-lane
  # miss falls back to the cold archive instead of merely assuming terminal (4
  # of 8 terminal rows in that batch resolved ONLY in docs/data/orch/archive/*.json
  # — confirmed again live 2026-08-25, see docs/handoffs/2026-08-25-orphan-adoption-terminal-guard-live-reproduction.md),
  # and a live row with supervised==true is ALSO treated as terminal here (its
  # own WF-2/Supervised-Lane-Sweep owns the re-check; a generic resume must not
  # bypass po_goahead ratification). ---
  bare_id = ltrimstr(original_task_id, "task:")
  hit = $(jq -c --arg id "$bare_id" \
    'include "scripts/lib/resolve-task-lane-by-id"; lane_map[$id] // null' \
    docs/data/orch/orch-state.json)

  if hit == null:
    # Not found hot — fall back to the cold archive (rare path: only reached
    # on a hot-lane miss, so a per-signal read here is acceptable cost).
    hit = $(jq -c --arg id "$bare_id" -s '
      [.[] | (.done_tasks[]?, (.closed_sprints[]?.tasks[]?))] | map(select(.id == $id)) | first
      | if . then {id, lane: "archive", status, supervised: (.supervised // false)} else null end
    ' docs/data/orch/archive/2026-06.json docs/data/orch/archive/2026-07.json docs/data/orch/archive/2026-08.json)

  board_class =
    if hit == null: "terminal"                                                       # never found -> never default to active
    elif hit.lane in ["ready", "in_progress"]: "active"
    elif hit.lane in ["review", "qa", "done", "done_verified", "archive"]: "terminal"
    elif hit.lane == "backlog": "terminal"    # architect ruling, 2026-07-22 brief §2 — no BLOCKED carve-out
    elif hit.lane == "active_sprints" and hit.status in ["TODO","IN_PROGRESS","READY","BLOCKED"]: "active"
    else: "terminal"                          # unrecognized/corrupt status — never default to active

  supervised_skip = (board_class == "active") and ((hit.supervised // false) == true)
  if supervised_skip: board_class = "terminal"

  if board_class == "terminal":
    log "[dev-team] orphan-signal:{original_task_id} — board guard: lane=" + (hit.lane ?? "not-found") +
        " status=" + (hit.status ?? "n/a") + (supervised_skip ? " supervised=true" : "") +
        " — skip (no claim, no tree-hygiene, no board-flip, no resume-spawn)"
    call_tool(server="vn-market", tool="task_release", arguments={
      task_id:                       "orphan-signal:" + original_task_id,
      owner_client_session:          $CLAUDE_CODE_SESSION_ID,
      owner_agent:                   "dev-team",
      original_owner_client_session: dead_session   # FR-2 Rung B — real release now (subtask 4)
    })
    continue
  # --- End FR-4 guard. board_class == "active" falls through to N_MAX, unchanged. ---

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
  # ZONE GUARD (live hazard, not hypothetical — an empty/unresolved task_zone
  # widens `git status --porcelain -- {task_zone}` to REPO-WIDE, which would
  # revert every live peer's uncommitted file including this tick's own
  # preflight state — NEVER widen this scope):
  if not task_zone or task_zone == "":
    log "[dev-team] orphan-signal:{original_task_id} — task_zone unresolved; SKIPPING tree-hygiene revert (refuse, never repo-wide)"
    reverted_files = []
    tree_hygiene_note = "tree-hygiene: skipped (task_zone unresolved — refused to widen scope)"
  else:
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
        task_id:                       "orphan-signal:" + original_task_id,
        owner_client_session:          $CLAUDE_CODE_SESSION_ID,
        owner_agent:                   "dev-team",
        original_owner_client_session: dead_session   # FR-2 Rung B (subtask 4)
      })
      continue
    # Checkpoint valid — continue work from git_sha (DO NOT re-run already-committed steps)
    log "[dev-team] resuming from checkpoint SHA={git_sha} (DoD-P15-3 redispatch_count={redispatch_count})"
  else:
    # No git SHA checkpoint — resume from board state (task_board entry is authoritative)
    log "[dev-team] no git_sha checkpoint in orphan-signal payload; resuming from board state"

  # --- FR-5 Board flip: update assigned_to/adopted_at/tree_hygiene_note via the
  # SAME resolved `hit` the FR-4 guard above already computed (no second lookup
  # or ltrimstr call — architect brief §2). Reached only when board_class ==
  # "active", so hit.lane is one of the 8 real board lanes (never "archive" --
  # that class always `continue`s above). Targets the CORRECT flat lane, not
  # just active_sprints (EC-2 fix); prefix already stripped via $bare_id (EC-1
  # fix — {original_task_id} in the pre-fix version was NEVER stripped, a
  # confirmed 100%-reproducible silent no-op on 95%+ of the board). ---
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  # DoD-P15-2: check for cowork-slot or cron published artifact before re-running
  # (sprint-task checkpoint is git SHA; this check is belt-and-suspenders for mixed-kind adoptions)
  if hit.lane == "active_sprints":
    jq --arg tid "$bare_id" --arg now "$NOW" --arg note "{tree_hygiene_note}" \
      --arg session "$CLAUDE_CODE_SESSION_ID" \
      '(.task_board.active_sprints[].tasks[] | select(.id == $tid))
       |= (.assigned_to = $session | .adopted_at = $now | .tree_hygiene_note = $note)' \
      docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh"
  else:
    jq --arg tid "$bare_id" --arg lane "$hit.lane" --arg now "$NOW" --arg note "{tree_hygiene_note}" \
      --arg session "$CLAUDE_CODE_SESSION_ID" \
      '(.task_board[$lane][] | select(.id == $tid))
       |= (.assigned_to = $session | .adopted_at = $now | .tree_hygiene_note = $note)' \
      docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh"

  # --- Release the orphan-signal row after successful adoption (FR-2 Rung B) ---
  call_tool(server="vn-market", tool="task_release", arguments={
    task_id:                       "orphan-signal:" + original_task_id,
    owner_client_session:          $CLAUDE_CODE_SESSION_ID,
    owner_agent:                   "dev-team",
    original_owner_client_session: dead_session
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
