# po-s79 — TS2367 push-unblocker SIGN-OFF + head advance to Wave-2 frontend hop
#
# Context (2026-06-16 close-out tick, dispatcher stalled — manual recovery):
#   ba FIXED FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367 in commit 6f9b3eba (1-line: widen
#   `severity` to "HIGH"|"CRITICAL" union to defeat const-narrowing) but did NOT advance
#   the board — task still sat ready[]/next=ba, top-level .head still pointed at it.
#   Router AND po RAW-re-verified: `bunx tsc --noEmit` in apps/mcp-server = EXIT 0 (SOLE
#   tsc-red cleared), fix commit 6f9b3eba present on HEAD, tests 22/0. This is a
#   make-tsc-green task fully RAW-verified → done_verified (not merely done).
#
# Head selection: the prior head note (po-s74/po-s76) recorded the planned sequence —
#   TS2367 is the push-unblocker, and "THEN the previously-set Wave-2 ba hop
#   (FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH) proceeds." That P1 row is already in ready[]
#   with next_agent=ba and its dep (W2-MCP-FETCH-DEADLINE) is done_verified. Advancing
#   the head there respects the existing planning chain (not a priority reshuffle).
#
# Mutation 1 (RELOCATE ready[] -> done_verified[]):
#   FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367 with RAW-verify provenance:
#     - ba_fix_commit 6f9b3eba, tsc_green (router + po both re-ran, EXIT 0), tests 22/0,
#       signed_off_by/at. Idempotent: no-op if already in done_verified[].
#
# Mutation 2 (REPOINT top-level .head -> FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH, next_agent=ba):
#   carries a push_note: 13-behind classified ALL benign (8x chore(health), 2x
#   chore(memory) notebook, 1x chore(tasks) signal_queue, 1x docs(reports) TNB, 1x
#   chore(memory/tran-ngoc-bau)) — no code, no conflict. tsc GREEN so pre-push hook no
#   longer strands the fleet. PO green-lit the push (executed separately, not a commit).
#
# Harness: CONSERVATION (ready -1, done_verified +1, all other lanes byte-unchanged,
#   total unchanged) + relocate-once + head-points-to-W2-FRONTEND invariants.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" \
#   -f scripts/po-s79-ts2367-done-verified-head-advance-w2-frontend.jq \
#   docs/data/orch/orch-state.json
# (atomic temp -> [ -s ] -> jq empty -> conservation -> invariant -> rename; commit
#  orch-state by EXPLICIT PATH; the push itself is run by po, not part of this commit.)

def TS2367: "FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367";
def W2FRONTEND: "FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH";

# already-signed-off guard (idempotent re-run)
(.task_board.done_verified // []) as $dv
| ($dv | map(.id) | index(TS2367)) as $already

| if $already != null then .
  else
    # pull the TS2367 row out of ready[]
    (.task_board.ready // []) as $ready
    | ($ready | map(select(.id == TS2367))[0]) as $row
    | if $row == null then .   # nothing to move (defensive)
      else
        .task_board.ready = ($ready | map(select(.id != TS2367)))
        | .task_board.done_verified += [
            $row
            + {
                status: "DONE_VERIFIED",
                lane: "done_verified",
                next_agent: null,
                blocking: false,
                signed_off_by: "po-s79",
                signed_off_at: $now,
                done_verified_evidence: {
                  kind: "make-tsc-green",
                  ba_fix_commit: "6f9b3eba",
                  fix_desc: "widen severity to \"HIGH\"|\"CRITICAL\" union to defeat const-narrowing (FIX-SIGNAL-CONFIDENCE-DEFAULT-50.test.ts:270)",
                  tsc_check: "bunx tsc --noEmit in apps/mcp-server = EXIT 0 (router + po both re-ran)",
                  tsc_was: "SOLE tsc-red on main — its red pre-push hook stranded the whole fleet push",
                  tests: "22/0",
                  verified_at: $now,
                  note: "ba fixed the code in 6f9b3eba but did not advance the board (task stayed ready[]/next=ba). po-s79 close-out relocates it done_verified after RAW tsc-green reconfirm. Fleet push now unblocked."
                }
              }
          ]
      end
  end

# Mutation 2: repoint canonical top-level .head to the Wave-2 frontend hop
| .head = {
    status: "ready",
    updated_at: $now,
    updated_by: "po-s79",
    active_task_id: W2FRONTEND,
    next_agent: "ba",
    note: "Head advanced off the TS2367 push-unblocker (now done_verified, tsc GREEN). Next real priority is the previously-planned Wave-2 frontend hop FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH (P1, ba) — its dep FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE is already done_verified, so the inner-first gate is satisfied. The 3 cowork-doublefire roots (GATHERER/NEWSSCOUT/MARKETWATCHER, all MEDIUM) and the P1 BCTC/HNX/SSC cluster remain in ready[] for subsequent picks. router spawns ba; po does NOT spawn.",
    push_note: "PO green-lit the fleet push this tick. 13-behind origin/main classified ALL benign cloud-chore/docs (8x chore(health) recheck, 2x chore(memory) notebook, 1x chore(tasks) signal_queue append, 1x docs(reports) TNB audit handoff, 1x chore(memory/tran-ngoc-bau)) — zero code, zero mcp-server conflict. tsc GREEN so the red pre-push hook no longer strands. Plan: git pull --rebase origin main (replay 123 work commits atop 13 chores) -> re-verify bunx tsc --noEmit=0 -> git push. The push is executed by po out-of-band and is NOT part of this orch-state commit.",
    reconciled_from: ".head was on FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367 (po-s76 reconcile_note); that task is now signed off."
  }
