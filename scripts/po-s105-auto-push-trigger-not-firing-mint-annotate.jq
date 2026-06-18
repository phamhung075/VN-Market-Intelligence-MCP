# po-s105-auto-push-trigger-not-firing-mint-annotate.jq
#
# Single-pass dual-mutation BOARD-CORRECTION (honesty over a green badge):
#
#   M1  id-guarded MINT of FIX-AUTO-PUSH-TRIGGER-NOT-FIRING -> done[] as
#       status DONE / done_verified:false, carrying the REAL qa gate (the
#       previous gate tested scripts/fleet-worktree-push.sh in ISOLATION 5/5
#       green but NOT the production trigger). New gate = the launchd timer
#       fires AUTONOMOUSLY and origin advances on a tick WITHOUT any
#       human/router invoking it. Skipped if id already in ANY board array.
#
#   M2  ANNOTATE-IN-PLACE (never relocate) the false-done flow-step rows
#       (TASK-AUTO-PUSH-B-PO, TASK-AUTO-PUSH-B-DT, TASK-AUTO-PUSH-C,
#       ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP) with a `trigger_corrected` marker:
#       their tick-exit flow-step placement NEVER fired autonomously (failure
#       mode (a): PO is a bg triage sub-agent, sub-flows RETURN to the router,
#       Step PUSH-BACKSTOP is never reached). Their script/doc work was real
#       and is retained — only the TRIGGER was wrong, now superseded by the
#       dedicated launchd timer. done_verified untouched (these were never
#       done_verified:true; the badge being corrected is the false PROGRAM-level
#       "auto-push works" claim, captured by the new FIX task's honest gate).
#
# IDEMPOTENT: M1 guarded by id-presence across all arrays; M2 guarded by the
#             `trigger_corrected` marker. Re-run mutates 0.
#
# Originated 2026-06-18 (po-s105) after the router RAW-confirmed (twice) the
# auto-push backstop never fires in autonomous ticks despite qa "done_verified"
# on the isolated script. PIVOT: launchd timer com.vn-market.fleet-push replaces
# the structurally-wrong Option-B flow-step-at-tick-exit trigger.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s105-auto-push-trigger-not-firing-mint-annotate.jq \
#      docs/data/orch/orch-state.json
# (atomic temp -> [ -s ] -> jq empty -> rename; commit orch-state by EXPLICIT PATH)

def all_ids:
  [ .task_board
    | (.backlog // [], .ready // [], .in_progress // [], .review // [],
       .done // [], .done_verified // [])
    | .[]? | (.id // .task_id // empty) ];

def new_task($now):
  {
    id: "FIX-AUTO-PUSH-TRIGGER-NOT-FIRING",
    title: "Auto-push backstop never fires autonomously — pivot to dedicated launchd timer (was false-done_verified: qa tested the script in isolation, NOT the production trigger)",
    owner: "po",
    status: "DONE",
    done_verified: false,
    zone: "cross-service/",
    type: "maintenance",
    size: "M",
    priority: "P1",
    depends: ["TASK-AUTO-PUSH-A", "ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP"],
    blocks: [],
    created_at: $now,
    files: [
      "launchd/com.vn-market.fleet-push.plist",
      "docs/standards/cron-jobs.md",
      "scripts/fleet-worktree-push.sh"
    ],
    root_cause: "FAILURE MODE (a) step-never-reached. The */15 cowork dispatcher has NO po/dev-team slot; PO is spawned ONLY by the 7 * * * * dev-team router as a BACKGROUND TRIAGE SUB-AGENT (contract: return BATCH/NOTHING). In that mode po/flow/main.md routes to a triage sub-flow (channel-audit/triage-signals/sprint-kickoff/sprint-signoff), each of which has its OWN ## RETURN block handing control straight back to the dev-team router — never routing back up through main.md Step PUSH-BACKSTOP. The inline ~58L tick-exit step is therefore dead code on the only path the autonomous tick takes. Result: local sat >20 ahead across multiple router-passes (23 -> 32), origin got 0 fleet-push merges.",
    fix: "PIVOT to Option-A: dedicated launchd timer com.vn-market.fleet-push (launchd/com.vn-market.fleet-push.plist), StartInterval 1800s + RunAtLoad, runs bash scripts/fleet-worktree-push.sh directly. Script is fully self-guarding (no-op when ahead<=PUSH_THRESHOLD, worktree-isolated, behind-set code-divergence abort -> BUG telegram, pre-push tsc gate, self-cleaning worktree) so a dumb timer is safe. Flow-step Step PUSH-BACKSTOP (po main.md) + Step 4.8 (dev-team post-cycle.md) retained as SECONDARY best-effort but no longer the primary trigger. cron-jobs.md updated.",
    verification_gate: "AUTONOMOUS-FIRE (the REAL gate, replacing the isolated-script gate): with local >PUSH_THRESHOLD ahead, observe origin/main ADVANCE on a launchd tick WITHOUT any human/router invoking the push — i.e. `launchctl list | grep fleet-push` registered AND `tail docs/agent-memory/sessions/fleet-push.log` shows a real push (not just a no-op) on the next accumulation, AND `git log origin/main` gains a fleet-push merge commit in a window where no human ran the script. NOT satisfied by `bash scripts/fleet-worktree-push.sh` passing in isolation.",
    next_agent: "qa",
    done_by: "po",
    done_at: $now,
    impl_commit: null,
    verify_note: "Router RAW-confirmed the trigger failure twice (local 23->32 ahead across po-ticks 13:37/12:33/12:19 + dev-team ticks 13:43/12:38, origin got 0 fleet-push merges). Diagnosed failure mode (a) by reading dev-team/flow/main.md Step 1 (PO spawned as bg triage sub-agent) + po sub-flow RETURN blocks (hand back to router, never reach main.md PUSH-BACKSTOP) + cowork-schedule.json (no po/dev-team slot). Launchd timer installed + loaded + RunAtLoad fire RAW-verified in fleet-push.log (no-op at ahead=0, correct). done_verified:false WITHHELD until a real autonomous push (ahead>20) is observed advancing origin on a timer tick — qa owns that gate."
  };

def annotate($id; $now):
  if (.id // "") == $id and (.trigger_corrected | not) then
    . + {
      trigger_corrected: $now,
      trigger_corrected_note: "Flow-step tick-exit placement NEVER fired autonomously (failure mode (a): PO is a bg triage sub-agent; triage sub-flows RETURN to the dev-team router and never reach this Step PUSH-BACKSTOP). The script/doc work in this task was real and is RETAINED — only the TRIGGER was structurally wrong. Superseded by dedicated launchd timer com.vn-market.fleet-push. Honest program-level gate captured by FIX-AUTO-PUSH-TRIGGER-NOT-FIRING."
    }
  else . end;

. as $root
| ($root | all_ids) as $ids
| .task_board.done = (
    ( .task_board.done // [] )
    | map(
        annotate("TASK-AUTO-PUSH-B-PO"; $now)
        | annotate("TASK-AUTO-PUSH-B-DT"; $now)
        | annotate("TASK-AUTO-PUSH-C"; $now)
        | annotate("ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP"; $now)
      )
    + ( if ($ids | index("FIX-AUTO-PUSH-TRIGGER-NOT-FIRING")) then []
        else [ new_task($now) ] end )
  )
| ._updated_at = $now
| ._updated_by = "po-s105"
