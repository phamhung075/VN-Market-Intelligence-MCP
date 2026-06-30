# router-ind-p1-momentum-ba-handoff-reconcile.jq
#
# Board-coherence reconciliation for the BA->architect hop of
# BA-IND-P1-MOMENTUM-RS (sprint MARKET-INDICATOR-DEPTH-P0, P1 momentum sub-wave).
#
# DEFECT (RAW-observed 2026-06-30T01:48Z): the id BA-IND-P1-MOMENTUM-RS appeared
# in TWO lanes with conflicting status —
#   - ready[]   : status=READY  next_agent=ba   (the original po-s132 promotion;
#                 the BA agent never transitioned it — a half-move / orphan)
#   - backlog[] : status=DONE                    (a SEPARATE record the BA agent
#                 minted in the wrong lane to mark its own work done)
# The BA spec work itself is verified sound (commit ba562100; 295-line handoff
# docs/handoffs/BA-IND-P1-MOMENTUM-RS.md). Only the board write was non-standard.
#
# FIX (idempotent — re-run yields identical state):
#   1. remove the mislaned backlog[] DONE stub (collapse the cross-lane dup).
#   2. advance the single surviving ready[] row to the architect phase:
#      next_agent=architect, owner=architect, carry BA DONE provenance + the
#      5 open ARCH-RATIFY items so nothing from the handoff is lost.
#   Status stays READY in lane ready[] (canonical pairing) — a task queued for
#   architect. The sprint-task lock keeps the same id, held under the router
#   session across the hop (two-tier handshake: architect self-claim sees it).
#
# Invocation (NEVER raw mv/cp/>):
#   jq -f scripts/router-ind-p1-momentum-ba-handoff-reconcile.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def isTarget: (.id // "") == "BA-IND-P1-MOMENTUM-RS";

# 1. drop the backlog DONE stub (the dup in the wrong lane)
.task_board.backlog = ((.task_board.backlog // []) | map(select(isTarget | not)))
# 2. advance the ready[] survivor to architect
| .task_board.ready = ((.task_board.ready // []) | map(
    if isTarget then
      .next_agent = "architect"
      | .owner = "architect"
      | .status = "READY"
      | .ba_spec_complete = true
      | .ba_commit = "ba562100"
      | .ba_handoff = "docs/handoffs/BA-IND-P1-MOMENTUM-RS.md"
      | .ba_completed_at = "2026-06-30T01:50:00Z"
      | .arch_ratify_open = [
          "ARCH-RATIFY-RS-1 (VN-Index cross-sectional RS = daily_ohlcv row only, no runtime fetch; confirm ticker_id)",
          "ARCH-RATIFY-ROC-1 (ROC factor-return = compute-on-read P1)",
          "ARCH-RATIFY-FAR-1 (ADTV unit vol-vs-VND; probe vnstock_trading_stats live)",
          "ARCH-RATIFY-FAR-2 (ADTV normalization basis)",
          "52W-MA200 denominator_ma200 field required (sample transparency for pct_above_ma200)"
        ]
      | .reconciled_by = "router:ba-handoff-dedup"
      | .reconcile_note = "BA minted a duplicate DONE row in backlog[] and left this ready[] row un-transitioned (next_agent=ba). Router removed the dup and advanced this single row to next_agent=architect. BA spec verified sound (commit ba562100; 295-line handoff). Zone split MANDATORY downstream: 3x apps/technical-analysis (ROC, RS, 52W) + 1x apps/stock-price (foreign-accum-rank)."
    else . end))
| ._updated_at = "2026-06-30T01:48:51Z"
| ._updated_by = "router:reconcile:BA-IND-P1-MOMENTUM-RS-handoff"
