# po-s111-dbintegrity-trail-gitreset-p1-promote-dispatch.jq
# Single-pass PROMOTE+ESCALATE+DISPATCH (idempotent) — INCIDENT EXPEDITE.
#
# Origin 2026-06-23T04:28Z: FIX-DB-INTEGRITY-TRAIL-GITRESET-DATALOSS MATERIALIZED for
# real — docs/data/db-integrity-history.json dropped 38→10 entries when a fleet
# `git reset --hard` during an ~11.5h system-auditor hang wiped ~28 uncommitted scan
# appends (06-21/06-22). Router applied a STOPGAP commit (5be25914) of the surviving
# 10-entry trail but that only survives `reset --hard HEAD`, NOT `reset --hard
# origin/main` — not the durable fix. The tracked P2 task predicted this exact failure
# mode; real data loss → escalate P2→P1 + dispatch NOW.
#
# M1 PROMOTE backlog→ready: FIX-DB-INTEGRITY-TRAIL-GITRESET-DATALOSS, escalate
#    priority P2→P1, set blocking:true + next_agent="developer" (cross-service/ git
#    config + .gitignore work routes to the generic developer per the zone rule), stamp
#    incident provenance + the broader reset-wipe awareness note (user ask #2). Idempotent:
#    skipped entirely if the id is already in ANY non-backlog lane.
# M2 REPOINT canonical top-level .head at the task (status=in_progress, next_agent=
#    "developer") so dev-team Step-0b head-resume FIRES this tick. Guarded: only when head
#    is idle (active_task_id==null) AND the promote happened — never steps on active WIP.
#
# Harness (run by caller): CONSERVATION (backlog −1, ready +1, in_progress/review/done/
# done_verified byte-stable) + PLACEMENT (task in ready[] P1/blocking/developer; head on it
# in_progress/developer) + IDEMPOTENCY re-run (delta 0). Atomic temp→[ -s ]→jq empty→
# conservation→placement→rename; commit orch-state by EXPLICIT PATH.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s111-dbintegrity-trail-gitreset-p1-promote-dispatch.jq \
#      docs/data/orch/orch-state.json

def TASK_ID: "FIX-DB-INTEGRITY-TRAIL-GITRESET-DATALOSS";

# Is the id present in any non-backlog board lane already? (idempotency guard)
def already_promoted:
  ([ .task_board.ready[]?, .task_board.in_progress[]?, .task_board.review[]?,
     .task_board.done[]?, .task_board.done_verified[]? ]
   | map(select(type=="object" and .id==TASK_ID)) | length) > 0;

# The backlog row, escalated + stamped for ready.
def escalated_row($row):
  $row
  | .status        = "READY"
  | .priority      = "P1"
  | .blocking      = true
  | .next_agent    = "developer"
  | .promoted_at   = $now
  | .promoted_by   = "po"
  | .promoted_from = "backlog"
  | .escalation    = "P2->P1: defect MATERIALIZED 2026-06-23T04:28Z and destroyed real telemetry (db-integrity-history.json 38->10; ~28 uncommitted 06-21/06-22 scan appends wiped by a fleet `git reset --hard` during an ~11.5h system-auditor hang). Router STOPGAP commit 5be25914 (surviving 10 entries) survives `reset --hard HEAD` only, NOT `reset --hard origin/main` — durable fix per fix_spec: git rm --cached + .gitignore so any reset target leaves the rolling trail untouched."
  | .incident_ref  = "router-verified live 2026-06-23T04:28Z; stopgap=5be25914; data lost=28 scan entries (06-21+06-22)"
  | .broader_risk_note = "User ask #2 — same reset-wipe class also exposes other uncommitted router/auditor telemetry (e.g. orch-state signal_queue appends, currently 53 in working tree). This task's .out_of_scope already flags the SECONDARY surgical-reset scope (reset only specific staged paths, never whole-tree --hard) as a separate larger fix. Developer scope here = ONLY the trail untrack+gitignore (PRIMARY); do NOT bundle the broad surgical-reset work. A broader .gitignore-of-rolling-telemetry policy / commit-on-write hook is a deferred PO call, NOT this lane."
  | .dispatched    = true;

# ---- M1: promote (only if in backlog AND not already promoted) ----
(.task_board.backlog | map(select(type=="object" and .id==TASK_ID)) | length) as $in_backlog
| (already_promoted) as $done

| if ($in_backlog > 0) and ($done | not) then
    (.task_board.backlog | map(select(type=="object" and .id==TASK_ID)) | .[0]) as $row
    | .task_board.backlog |= map(select((type=="object" and .id==TASK_ID) | not))
    | .task_board.ready    = ((.task_board.ready // []) + [ escalated_row($row) ])
    # ---- M2: repoint head ONLY if idle ----
    | (if (.head.active_task_id == null) then
        .head = {
          status:         "in_progress",
          active_task_id: TASK_ID,
          next_agent:     "developer",
          next_action:    "INCIDENT EXPEDITE: dispatch FIX-DB-INTEGRITY-TRAIL-GITRESET-DATALOSS (P1, escalated from P2 after real telemetry loss this tick). Generic developer: `git rm --cached docs/data/db-integrity-history.json` + add it to .gitignore. Writer scripts/db-integrity-history-append.sh recreates the file if missing (untracking is safe). done_verified = appends survive a real `git reset --hard` tick (file PRESERVED, not reverted to HEAD count). No rebuild. See ready[] row fix_spec/verification_gate.",
          wip:            ((.head.wip // 0) + 1),
          wip_max:        (.head.wip_max // 2),
          updated_at:     $now,
          updated_by:     "po",
          last_tick:      (.head.last_tick // null),
          router_note:    "po-s111: P2->P1 escalate + dispatch of the trail-gitreset data-loss fix after the predicted failure MATERIALIZED (38->10 entries, ~28 appends lost). Head was idle (WIP=0) — safe to repoint. cross-service git+gitignore work → generic developer."
        }
      else . end)
  else . end