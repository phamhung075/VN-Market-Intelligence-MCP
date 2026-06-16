# po-s73-w1-pek-p0-signoff-w2-frontend-dispatch.jq
#
# Single-pass SIGN-OFF + NEXT-WAVE-DISPATCH triage (atomic, idempotent):
#   1. RELOCATE FIX-ERRAUDIT-W1-PEK-P0  in_progress[] -> done_verified[]
#      with full RAW-verify provenance stamps. Idempotent: no-op if already
#      present in done_verified[] (re-run relocates 0).
#   2. PROMOTE  FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH  backlog[] -> ready[]
#      (status=READY, next_agent=ba) with grooming/promotion stamps so the
#      router can lock-claim + spawn ba for the next-wave first hop. Its
#      sequence_after dep (FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE) is done_verified.
#      Idempotent: skipped if the id is already in ANY non-backlog lane.
#   3. SET top-level .head to dispatch ba for the promoted task (canonical
#      single-head SSOT per docs/standards/orch-state-access.md §4).
#
# Origin 2026-06-16: PO final sign-off of Wave-1 P0 (W1-PEK-P0) for the
# ERROR-AUDIT-2026-06-15 epic + kick off the Wave-2 frontend hop (mcp-server
# Wave-2 deadlines/datalayer already done_verified, so the inner-first
# sequence gate is satisfied).
#
# Reusable pattern: "QA approved coding task N (last of a wave); flip it
# done_verified AND promote the next wave's first unblocked backlog task to
# ready + point the head at its first agent — all atomic, in one pass."
#
# Harness adds: CONSERVATION guard (in_progress -1, done_verified +1,
# backlog -1, ready +1, review/done byte-unchanged, total unchanged) +
# relocate-once / promote-once invariants.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s73-w1-pek-p0-signoff-w2-frontend-dispatch.jq \
#     docs/data/orch/orch-state.json > /tmp/orch.tmp
#   [ -s /tmp/orch.tmp ] && jq -e . /tmp/orch.tmp >/dev/null \
#     && mv /tmp/orch.tmp docs/data/orch/orch-state.json
#   git commit -m "..." -- docs/data/orch/orch-state.json   # EXPLICIT PATH, -m BEFORE --

def W1: "FIX-ERRAUDIT-W1-PEK-P0";
def W2: "FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH";

# ---- guards on current membership ----
( [ .task_board.done_verified[]? | select(.id == W1) ] | length > 0 ) as $w1_already_done    |
( [ .task_board.backlog[]?       | select(.id == W2) ] | length > 0 ) as $w2_in_backlog       |
( [ .task_board | to_entries[] | .key as $k
    | select($k != "backlog")
    | (.value | if type=="array" then .[] else empty end)
    | select(.id == W2) ] | length > 0 ) as $w2_elsewhere |

# ============ MUTATION 1: relocate W1-PEK-P0 -> done_verified ============
( if $w1_already_done then .
  else
    ( [ .task_board.in_progress[] | select(.id == W1) ] ) as $w1row |
    .task_board.in_progress |= map(select(.id != W1))
    | .task_board.done_verified +=
        ( $w1row | map(
            .status = "DONE_VERIFIED"
          | .lane = "done_verified"
          | .next_agent = null
          | .signed_off_at = $now
          | .signed_off_by = "po-s73"
          | .done_verified_evidence =
              "RAW-verified LIVE by router (not relayed badges): named-volume DB bctc_layout_units shows 161 healthy + 14 quarantined table units with REAL computed orphan_rows reasons (varied per row, NOT constants); pytest 42 passed/0 failed via docker exec in the rebuilt container; image .Created 2026-06-16T01:15:49Z > commit b52f5593 01:12:10Z. AC-1..AC-7 + EC-1 met (forced-failure paths verified via pytest _PADDLE_LOAD_FAILED sentinel injection per architect matrix; paddle-load-failure/table-extraction-failure strings absent from prod DB only because PaddleOCR loads fine in prod). Fake-clean-0-row mask removed: MANDATORY layout-model failure re-raises; OPTIONAL PaddleOCR failure quarantines with explicit reason. QA cycle-274 APPROVED."
          ) )
  end ) |

# ============ MUTATION 2: promote W2-FRONTEND-SAFEFETCH -> ready ============
( if ($w2_in_backlog and ($w2_elsewhere | not)) then
    ( [ .task_board.backlog[] | select(.id == W2) ] ) as $w2row |
    .task_board.backlog |= map(select(.id != W2))
    | .task_board.ready +=
        ( $w2row | map(
            .status = "READY"
          | .lane = "ready"
          | .next_agent = "ba"
          | .groomed_at = $now
          | .groomed_by = "po-s73"
          | .promoted_from = "backlog"
          | .promoted_at = $now
          | .promoted_by = "po-s73"
          | .promotion_note =
              "Wave-2 frontend hop. Inner-first sequence gate SATISFIED: sequence_after dep FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE is done_verified (the two unbounded mcp-server hops mcp-interface-01/05 are closed). Wave-1 fully complete (W1-MCP-P0 + W1-PEK-P0 both done_verified). Distinct zone apps/frontend/ — no zone-serialization conflict with the mcp-server lane; WIP<=2 honored (over-parallel-fanout host-starvation lesson). Land safeFetch/proxyUpstream/safeFetchOrNull + one DEADLINE_MS < gateway: fix timeout+duplication+logging in 3 helpers not 55 sites. Route ba->architect->pm->dev-frontend->qa; router dispatches via lock-claim+spawn -- po did NOT spawn. No-push."
          ) )
  else . end ) |

# ============ MUTATION 3: set canonical top-level head -> dispatch ba ====
( if ($w2_in_backlog and ($w2_elsewhere | not)) then
    .head = {
      status: "ready",
      updated_at: $now,
      updated_by: "po-s73",
      active_task_id: W2,
      next_agent: "ba",
      note: ("W1-PEK-P0 done_verified (po-s73 final sign-off) -> Wave-1 of ERROR-AUDIT-2026-06-15 epic COMPLETE. Dispatching next-wave first hop: ba for " + W2 + " (Wave-2 frontend helpers; sequence_after FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE done_verified). Router lock-claims ready->in_progress + spawns ba. W3-MCP-P2 (15 folded bare-catch sites) + W3-PEK-P2 stay in backlog for after W2-FRONTEND. PUSH: PO decided push-now (origin diverged via benign cloud-chore only; local chain RAW-verified green) -- router executes git push.")
    }
  else
    # W1 already done + W2 already promoted/dispatched: just refresh head stamp, keep pointer
    .head.updated_at = $now
    | .head.updated_by = "po-s73"
  end )
