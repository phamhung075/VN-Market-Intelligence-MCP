# po-s103-gatherer-umbrella-rootA-done-dms-zone-free-promote.jq
#
# Single-pass STALE-HEAD RECONCILE + UMBRELLA-CLOSE + ZONE-FREE-PROMOTE (idempotent):
#   M1 RELOCATE the design umbrella DESIGN-GATHERER-DOUBLEFIRE-DEDUP-CLUSTER
#      in_progress[] -> done[] with status=DONE, done_verified:false (the design pass
#      + Root A code shipped; full done_verified is GATED on all 3 children's behavioral
#      gates — only Root A is shipped, Roots B/C ship via the DMS child below). Carries
#      a done_verified_deferred_note. Guarded by done[] membership (re-run relocates 0).
#   M2 PROMOTE the held follow-on DMS-DOUBLEFIRE-SIBLING-DEDUP-CORROBORATION
#      backlog[] -> ready[] (status=READY, next_agent=dev-mcp-server, drop held flag) —
#      its blocker ARCH-CRON-SCHEDULER-RELIABILITY is now done_verified:true so the
#      apps/mcp-server/ zone collision named in hold_reason is CLEARED. Skipped if the id
#      is already in ANY non-backlog lane (re-run promotes 0).
#   M3 REPOINT the canonical top-level .head off the STALE agent-father dispatch (Root A
#      already shipped 69babf46 — agent-father work is DONE, must NOT be re-dispatched)
#      onto the DMS dev-mcp-server lane, ONLY if M2 promote happened.
#
# WHY (PO decision, 2026-06-18 dev-team tick 20260618T093056Z): the .head pointed at
# next_agent=agent-father for DESIGN-GATHERER but agent-father ALREADY COMPLETED its
# portion — Root A committed 69babf46 (leader-lock AF-1 defer gate) + 6f306bfa closed
# Root A and routed Roots B/C fix_spec to dev-mcp-server (docs/handoffs/
# FIX-DMS1-DMS2-SIBLING-DEDUP-CORROBORATION-spec.md). The umbrella row's
# agent_father_done_at is already stamped. So the head is dangling/stale. Reconcile:
# close the umbrella (Root A done, design done; done_verified deferred to children),
# and because the DMS hold's named blocker ARCH-CRON-SCHEDULER-RELIABILITY is NOW
# done_verified:true the apps/mcp-server/ zone is free — promote DMS to ready for the
# router to dispatch dev-mcp-server. Active coding WIP stays <=2 (the only in_progress
# was this multi/design umbrella; the 2 apps/mcp-server review[] rows are QA-gated, not
# active dev lanes). fix root cause not symptom; do NOT re-dispatch agent-father.
#
# CONSERVATION: in_progress -1, done +1, backlog -1, ready +1; review/done_verified
#   LENGTHS byte-stable. total unchanged.
# IDEMPOTENT: M1 guarded by done[] membership; M2 guarded by absence in all
#   non-backlog lanes; M3 guarded by M2-happened. Re-run mutates 0.
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-s103-gatherer-umbrella-rootA-done-dms-zone-free-promote.jq \
#   docs/data/orch/orch-state.json
#   (atomic temp -> [ -s ] -> jq empty -> conservation -> rename; commit orch-state by EXPLICIT PATH; PUSH HELD — PO out-of-band)

def UMBRELLA: "DESIGN-GATHERER-DOUBLEFIRE-DEDUP-CLUSTER";
def DMS:      "DMS-DOUBLEFIRE-SIBLING-DEDUP-CORROBORATION";

# is the DMS id already live somewhere other than backlog? (idempotency guard)
def dms_already_live:
  (.task_board.ready    // []) + (.task_board.in_progress // [])
  + (.task_board.review // []) + (.task_board.done        // [])
  + (.task_board.done_verified // [])
  | any(.id? == DMS);

. as $root
| (.task_board.done // [] | any(.id? == UMBRELLA)) as $umbrella_already_done
| (.task_board.in_progress // [] | any(.id? == UMBRELLA)) as $umbrella_in_progress
| ($umbrella_in_progress and ($umbrella_already_done | not)) as $do_close
| (dms_already_live) as $dms_live
| (.task_board.backlog // [] | any(.id? == DMS)) as $dms_in_backlog
| ($dms_in_backlog and ($dms_live | not)) as $do_promote

# M1 CLOSE umbrella in_progress -> done (done_verified:false)
| if $do_close then
    ( .task_board.in_progress | map(select(.id? == UMBRELLA)) | .[0] ) as $row
    | .task_board.in_progress |= map(select(.id? != UMBRELLA))
    | .task_board.done += [
        $row
        + { status: "DONE",
            done_verified: false,
            closed_at: $now,
            closed_by: "po-s103",
            done_verified_deferred_note: "Design pass complete (architect_done_at 2026-06-16T20:39:40Z) + Root A SHIPPED (agent-father, commit 69babf46 leader-lock AF-1 backstop-window defer gate; closed 6f306bfa). Roots B/C fix_spec written to docs/handoffs/FIX-DMS1-DMS2-SIBLING-DEDUP-CORROBORATION-spec.md and routed to dev-mcp-server as DMS-DOUBLEFIRE-SIBLING-DEDUP-CORROBORATION (promoted ready[] this tick — zone now free). done_verified is GATED on all 3 children's behavioral gates: Root A defer-gate live-sim + DMS-1 zero-dup concurrent-sibling + DMS-2 no-false-gateway-down-when-sibling-succeeded. agent-father portion is DONE — do NOT re-dispatch."
          }
      ]
  else . end

# M2 PROMOTE DMS backlog -> ready (zone collision cleared)
| if $do_promote then
    ( .task_board.backlog | map(select(.id? == DMS)) | .[0] ) as $drow
    | .task_board.backlog |= map(select(.id? != DMS))
    | .task_board.ready += [
        ( $drow
          | del(.held) | del(.held_on) | del(.hold_reason) )
        + { status: "READY",
            next_agent: "dev-mcp-server",
            promoted_at: $now,
            promoted_by: "po-s103",
            promotion_note: "Blocker ARCH-CRON-SCHEDULER-RELIABILITY is now done_verified:true -> apps/mcp-server/ zone collision (the sole hold_reason) is CLEARED. fix_spec ready (docs/handoffs/FIX-DMS1-DMS2-SIBLING-DEDUP-CORROBORATION-spec.md §DMS-1 + §DMS-2). Active coding WIP <=2: the only in_progress was the multi/design umbrella (now closed); the 2 apps/mcp-server review[] rows are QA-gated not active dev lanes, so no 2nd concurrent dev lane opens. Router dispatches dev-mcp-server. RAW-verify gate: 2 concurrent sibling fires -> 0 dup signal_bus rows on named-volume market.db; timeout+sibling-success -> no BUG row."
          }
      ]
  else . end

# M3 REPOINT canonical head off the STALE agent-father dispatch onto DMS dev-mcp-server
| if $do_promote then
    .head = {
      status: "dispatch",
      active_task_id: DMS,
      next_agent: "dev-mcp-server",
      updated_at: $now,
      updated_by: "po-s103",
      note: ("PO reconcile+dispatch (po-s103, " + $now + "): prior head was STALE — pointed at next_agent=agent-father for DESIGN-GATHERER-DOUBLEFIRE-DEDUP-CLUSTER, but agent-father ALREADY shipped Root A (commit 69babf46, closed 6f306bfa) — that work is DONE, NOT re-dispatched. Umbrella closed in_progress->done (done_verified:false, gated on 3 children). DMS-DOUBLEFIRE-SIBLING-DEDUP-CORROBORATION (Roots B/C) promoted backlog->ready: its blocker ARCH-CRON-SCHEDULER-RELIABILITY is now done_verified:true so the apps/mcp-server/ zone is free. Router mutex-wraps the dev-mcp-server spawn (apps/mcp-server/ zone; fix_spec docs/handoffs/FIX-DMS1-DMS2-SIBLING-DEDUP-CORROBORATION-spec.md). PUSH HELD — PO out-of-band call.")
    }
  else . end

# metadata bump
| ._meta = ((._meta // {}) + { last_writer: "po-s103", last_write_at: $now })
