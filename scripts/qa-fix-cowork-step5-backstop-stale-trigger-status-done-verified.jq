# Board flip: FIX-COWORK-STEP5-BACKSTOP-TRUSTS-STALE-TRIGGER-STATUS REVIEW -> DONE_VERIFIED
# QA standard review (not Docker Close Gate; rebuild_required:false, doc+JSON only) of
# agents-architect's brief (docs/architecture-briefs/2026-07-08-cowork-step5-stale-trigger-status.md,
# commit 8a627771f) + agent-father's implementation (commit 287b181ee):
# - Confirmed BACKSTOP_SLOTS/NO_BACKSTOP_SLOTS (spawn-fanout.md Step 5.0 L19-20) are still an
#   exhaustive partition of WON_SLOTS: NO_BACKSTOP_SLOTS's condition
#   (trigger_id==null OR _superseded_by!=null) is the exact De Morgan negation of BACKSTOP_SLOTS's
#   (trigger_id!=null AND _superseded_by==null) — every slot lands in exactly one set, including
#   slots that never carried a `_superseded_by` key at all (missing key == null under jq semantics,
#   and those slots also carry trigger_id:null so they fall to NO_BACKSTOP_SLOTS via that arm
#   regardless).
# - `git grep -n trigger_status` across the whole tracked tree (not just cowork-team/): only two
#   live-code hits remain, both non-discriminating: (1) spawn-fanout.md's own DEPRECATED-marker
#   comment (no longer branches on the field); (2) docs/protocols/cowork-master-cron-runbook.md's
#   jq *display* examples (fields shown for human read, doc explicitly states "no longer drive any
#   live behavior" — pre-existing text, not touched or contradicted by this fix).
#   scripts/router-cowork-backstop-trigger-writeback.jq WRITES trigger_status="active" but is a
#   historical one-off manual tool (not referenced by any live flow/cron file, not auto-invoked) —
#   not a reader/discriminator, does not violate the brief's "no other live consumer" claim.
#   All remaining hits are prose/history: architecture-briefs (historical, incl. the superseded
#   2026-06-18 brief that originally introduced the now-replaced pseudocode), decision journals,
#   notebooks, orch-state board text, processed signals, archived backlog/orch snapshots,
#   docs/TASKS.md.bak, docs/handoffs/TASK_1951d.md (references a `cowork_schedule` SQL table that
#   was never actually built — confirmed via grep, the live SSOT is the JSON file only).
# - F1-CLOUD-TRIGGER-DECOMMISSION confirmed still plain BACKLOG, title/gate criterion
#   (2 launchd fires/slot -> "decommissioned") untouched by this fix — disjoint target value
#   ("superseded" here vs "decommissioned" there), no duplication.
# - `git show 05a8bffa6 -- docs/data/cowork-schedule.json` confirmed that commit's only edit was
#   `._notes.layer_a_deletion_locked` (true->false) + `._notes.layer_a_deletion_gate` text +
#   unrelated last_fired timestamp bumps; `git show 287b181ee -- docs/data/cowork-schedule.json`
#   confirmed this fix's diff touches ONLY the 9 targeted `.slots[].trigger_status` fields, zero
#   `._notes.*` lines — the two commits are provably disjoint on this file.
# - `jq empty docs/data/cowork-schedule.json` clean; re-ran all 4 brief §5 DoD jq checks myself
#   (raw, not trusted from agent-father's or router's report): trigger_status=="active" count=0;
#   5 real-trigger slots all "superseded"; 4 never-had-one slots has("trigger_status")==false.
# - Both commits (8a627771f, 287b181ee) confirmed ancestors of origin/main.
#
# GUARD: refuse unless FIX-COWORK-STEP5-BACKSTOP-TRUSTS-STALE-TRIGGER-STATUS is in review[] with
# status REVIEW. Board-only move — deliberately does NOT touch .head (currently tracks an
# unrelated in_progress task, FACTORY-INFRA-split-telegramCommands; refuses if that has changed
# to point at THIS task, since that would mean a different write pattern is expected).
# Usage: jq --arg now "$NOW" --arg note "<qa_review_note text>" \
#          -f scripts/qa-fix-cowork-step5-backstop-stale-trigger-status-done-verified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FIX-COWORK-STEP5-BACKSTOP-TRUSTS-STALE-TRIGGER-STATUS")][0]) as $t
| if $t == null then error("FIX-COWORK-STEP5-BACKSTOP-TRUSTS-STALE-TRIGGER-STATUS not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FIX-COWORK-STEP5-BACKSTOP-TRUSTS-STALE-TRIGGER-STATUS status != REVIEW (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id == "FIX-COWORK-STEP5-BACKSTOP-TRUSTS-STALE-TRIGGER-STATUS") then
    error("head.active_task_id now points at this task — re-check whether a .head write is expected instead of a board-only move")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    next_agent: "router",
    review_note: ($t.review_note + " | " + $note),
    updated_at: $now,
    updated_by: "qa"
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FIX-COWORK-STEP5-BACKSTOP-TRUSTS-STALE-TRIGGER-STATUS")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
