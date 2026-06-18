# po-s102-auto-push-backstop-promote-dispatch.jq
#
# Single-task PROMOTE + DISPATCH triage (idempotent):
#   M1 PROMOTE the fully-recon'd ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP design task
#      backlog[] -> ready[] (status=READY, promotion stamps) — skipped if the id
#      is already in ANY non-backlog lane (re-run promotes 0).
#   M2 REPOINT the canonical top-level .head at this task's first agent (architect)
#      ONLY if head is currently idle (active_task_id==null) AND the promote happened.
#
# WHY (PO decision, 2026-06-18): 3rd manual worktree-push this session. The backstop
# task gates nothing visible so the loop never surfaced it (~9 passes unstarted) while
# the manual cost recurred. design_mandate already complete (po-s98). architect lane
# free, ready[] holds only MEDIUM+P3 — no P0/P1 starved. "fix root cause not symptom".
#
# CONSERVATION: backlog -1, ready +1, in_progress/review/done/done_verified byte-stable.
# IDEMPOTENT: promote guarded by absence in all non-backlog lanes; head guarded by
#   active_task_id==null + flag. Re-run mutates 0.
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-s102-auto-push-backstop-promote-dispatch.jq \
#   docs/data/orch/orch-state.json
#   (atomic temp -> [ -s ] -> jq empty -> conservation -> rename; commit orch-state by EXPLICIT PATH)

def TID: "ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP";

# is the id already live somewhere other than backlog? (idempotency guard)
def already_live:
  (.task_board.ready    // []) + (.task_board.in_progress // [])
  + (.task_board.review // []) + (.task_board.done        // [])
  + (.task_board.done_verified // [])
  | any(.id? == TID);

. as $root
| (already_live) as $live
| (.task_board.backlog // [] | any(.id? == TID)) as $in_backlog
| ($in_backlog and ($live | not)) as $do_promote

# M1 PROMOTE backlog -> ready
| if $do_promote then
    ( .task_board.backlog | map(select(.id? == TID)) | .[0] ) as $row
    | .task_board.backlog |= map(select(.id? != TID))
    | .task_board.ready += [
        $row
        + { status: "READY",
            next_agent: "architect",
            promoted_at: $now,
            promoted_by: "po-s102",
            promotion_note: "3rd manual worktree-push this session — PO promotes the deferred option-2 backstop so this is the LAST manual push. design_mandate already complete (po-s98); architect lane free; ready[] holds only MEDIUM+P3 so no P0/P1 starved; market-independent infra/script work. fix root cause not recurrent symptom."
          }
      ]
  else . end

# M2 REPOINT canonical head only if idle AND we promoted
| if ($do_promote and (.head.active_task_id == null)) then
    .head = {
      status: "dispatch",
      active_task_id: TID,
      next_agent: "architect",
      updated_at: $now,
      updated_by: "po-s102",
      note: ("PO dispatch (po-s102, " + $now + "): ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP promoted ready[] -> architect. Durable fix for the recurring manual fleet-push (3rd this session). recon_first=true; deliverable=architecture-brief choosing trigger (prefer option-b: po/dev-team flow-step fires scripts/fleet-worktree-push.sh when ahead-count>N, no new daemon), then pm decomposes + cross-service implements. Off-market-safe / market-independent.")
    }
  else . end

# metadata bump
| ._meta = ((._meta // {}) + { last_writer: "po-s102", last_write_at: $now })
