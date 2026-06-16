# po-s74-sla-test-ts2367-unblock-push-promote.jq
#
# Single-task PUSH-UNBLOCK promote (atomic, idempotent):
#   PROMOTE FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367 backlog[] -> ready[] and
#   ESCALATE P3 -> P2 because it is no longer a latent lint nit: it is the SOLE
#   tsc-red error on main (FIX-SIGNAL-CONFIDENCE-DEFAULT-50.test.ts:270 TS2367,
#   HIGH-vs-CRITICAL no-overlap) and the pre-push hook (pnpm --filter vn-market
#   check) BLOCKS EVERY push on a red tree -> it now strands the whole fleet
#   (red-prepush-strands-fleet lesson), including the RAW-verified W1-PEK-P0
#   sign-off commit + 12 prior local commits. Sets next_agent so the router
#   lock-claims + spawns the dev hop; po does NOT spawn and does NOT write the
#   one-line test fix itself.
#
# Idempotent: skipped entirely if the id is already in ANY non-backlog lane
# (re-run promotes 0).
#
# Also REFRESHES top-level .head to point the router at this push-unblocker as
# the immediate next dispatch (it gates the Wave-2 ba hop's eventual push too).
#
# Origin 2026-06-16: PO push-now decision hit a real red-hook blocker (NOT
# benign cloud-chore divergence as previously assumed) — the red is a
# self-introduced test-code bug in the unpushed chain (commit 4f5192c5).
#
# Harness: CONSERVATION (backlog -1, ready +1, others byte-unchanged, total
# unchanged) + promote-once invariant + head-points-to-promoted.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s74-sla-test-ts2367-unblock-push-promote.jq \
#     docs/data/orch/orch-state.json > /tmp/orch.tmp
#   [ -s /tmp/orch.tmp ] && jq -e . /tmp/orch.tmp >/dev/null \
#     && mv /tmp/orch.tmp docs/data/orch/orch-state.json
#   git commit -m "..." -- docs/data/orch/orch-state.json   # EXPLICIT PATH

def T: "FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367";

( [ .task_board.backlog[]? | select(.id == T) ] | length > 0 ) as $in_backlog |
( [ .task_board | to_entries[] | .key as $k
    | select($k != "backlog")
    | (.value | if type=="array" then .[] else empty end)
    | select(.id == T) ] | length > 0 ) as $elsewhere |

if ($in_backlog and ($elsewhere | not)) then
  ( [ .task_board.backlog[] | select(.id == T) ] ) as $row |
  .task_board.backlog |= map(select(.id != T))
  | .task_board.ready +=
      ( $row | map(
          .status = "READY"
        | .lane = "ready"
        | .priority = "P2"
        | .blocking = true
        | .next_agent = "ba"
        | .escalated_at = $now
        | .escalated_by = "po-s74"
        | .escalation_note =
            "ESCALATED P3->P2: this is the SOLE tsc-red on main (verified: bun tsc --noEmit = 1 error, this line only) and the pre-push hook BLOCKS every push on a red tree -> it now strands the whole fleet including the RAW-verified FIX-ERRAUDIT-W1-PEK-P0 done_verified sign-off commit + 12 prior local commits (red-prepush-strands-fleet lesson). The red is SELF-INTRODUCED by the unpushed chain (commit 4f5192c5), NOT pre-existing weather, NOT benign cloud-chore. One-line fix per the row desc (widen the `severity` annotation so both ternary branches stay reachable). Route ba->architect->pm->dev-mcp-server->qa (or fast-track XS direct FIX per dev-team Step 3 if router opts); router dispatches via lock-claim+spawn -- po did NOT spawn and did NOT write the test fix. PUSH stays HELD until tsc is green."
        | .groomed_at = $now
        | .groomed_by = "po-s74"
        | .promoted_from = "backlog"
        | .promoted_at = $now
        | .promoted_by = "po-s74"
        ) )
  | .head = {
      status: "ready",
      updated_at: $now,
      updated_by: "po-s74",
      active_task_id: T,
      next_agent: "ba",
      note: ("PUSH-UNBLOCKER (P2, escalated po-s74): " + T + " is the SOLE tsc-red on main and the pre-push hook strands the whole fleet's push (incl. the W1-PEK-P0 done_verified sign-off commit). Dispatch this FIRST so the fleet can push. After it reaches done + tsc green, router pushes ALL accumulated local commits; THEN the previously-set Wave-2 ba hop (FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH) proceeds. po did NOT write the one-line test fix. The W1-PEK-P0 sign-off (done_verified) is already committed and stands regardless of push timing.")
    }
else
  .head.updated_at = $now
  | .head.updated_by = "po-s74"
end
