# Flow-defect: orphan-adoption lacks board-state guard + reaper false-orphans long-running agents

- **Filed:** 2026-07-03 by router (during dev-team 06:37Z tick continuation)
- **Type:** repair_task_request → PO → backlog
- **Suggested task id:** `FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD`
- **Severity:** HIGH (data-loss vector via tree-hygiene revert)

## Incident

`FIX-BCTC-BANK-BS-COLUMN-ORDER` was dispatched to dev-mcp-server at 06:37Z. Its sprint-task
coordination lock (`task:FIX-BCTC-BANK-BS-COLUMN-ORDER`, TTL 3600s) expired ~08:04Z **mid-run**
— the agent ran ~90 min (> lock TTL) and the lock was not heartbeated. The reaper then
**false-orphaned** the still-active task (created `orphan-signal:task:FIX-BCTC-BANK-BS-COLUMN-ORDER`,
`redispatch_count=1`, `owner_client_session=null`). The agent completed cleanly 4 min later
(08:08Z) with committed work `d69b13f41` + `e73a53688`, RAW-verified, promoted to `review`.

The orphan-signal is **immune to all session-based clear tools**: `task_release`,
`task_heartbeat`, and `task_force_release_orphan` all key on `owner_client_session`, which is
`null` for a reaper-created orphan (force-release returned `lock_not_found`). Only its TTL
(7200s, ~10:04Z) or server GC can clear it. The router cannot.

## Defect

BOTH orphan-adoption paths re-dispatch `original_task_id` **without checking its current board lane**:
- dev-team `docs/agents/dev-team/flow/main.md` Step 0a (lines ~306–332)
- router `.claude/skills/dispatch-claim/SKILL.md` § Orphan-Adoption Probe (lines ~362+)

Neither skips when `original_task_id` is already in `review` / `qa` / `done` / `done_verified` / `closed`.

## Impact

The next unguarded tick would adopt the **already-completed** task →
1. wasteful dev re-spawn, and
2. **data-loss vector**: the adoption's tree-hygiene step runs `git checkout -- <file>` on every
   uncommitted file in the task_zone (`main.md` lines 339–345) — reverting any UNRELATED
   uncommitted work in `apps/mcp-server/`. (Class: `feedback_dead_worker_uncommitted_live_file_revert`.)

This instance is mitigated because (a) `apps/mcp-server` tree is clean (nothing to revert) and
(b) the orphan's `last_payload` has no `git_sha` → adoption falls to resume-from-board-state,
which reads the terminal `review`/`done_verified` lane. But that is luck, not a guard.

## Proposed fix

1. **(a) Board-state guard (both paths):** before adopting, read `orch-state .task_board`; if
   `original_task_id` is in `review`/`qa`/`done`/`done_verified`/`closed` → SKIP adoption, log,
   and neutralize the orphan-signal (no re-dispatch).
2. **(b) Stop false-orphaning live agents:** heartbeat the sprint-task lock during long agent
   runs, OR raise the sprint-task lock TTL above typical agent runtime (currently 3600s < ~90 min).
3. **(c) Make reaper-created orphan-signals clearable:** allow force-release by
   `owner_agent` + `payload.original_owner_client_session` match (today a `session=null` orphan
   is unclearable except by TTL).
