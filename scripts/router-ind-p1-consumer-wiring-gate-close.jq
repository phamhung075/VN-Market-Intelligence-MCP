# router-ind-p1-consumer-wiring-gate-close.jq
#
# Gate-completion transform for P1 sub-wave IND-P1-CONSUMER-WIRING-AUDIT
# (sprint MARKET-INDICATOR-DEPTH-P0): wire the 5 LIVE P0 indicator tools into
# the 6 helper-agent flows — the literal core of the user's "more indices so the
# helper agents analyze the market better" intent.
#
# Run AFTER router RAW-verified the 4-criterion verification_gate GREEN:
#   C1 5/5 P0 tools called by >=1 flow, distribution == PO wiring_map
#        (get_volatility_indicators x5, get_breadth_thrust x4,
#         get_market_sentiment_index x3, get_foreign_room x3,
#         get_vn_liquidity_state x2).
#   C2 every flow has a graceful honest-NULL / [SKIP] guard.
#   C3 no fabrication — zero dead field names in the 6 flows
#        (market_sentiment_z_score / sentiment_ema5 / "outflow z-score" /
#         "stress field" / dispersion all absent; "dispersion" hit is in
#         weekly.md, outside this set).
#   C4 additive-only — cumulative 64 ins / 7 del across the 6 flows
#        (commits 8f71ea26 -> 34ef9ec9 -> 7832cc1f); deletions == field-name
#        corrections only; cowork flows still pass their own gates.
#
# Effect (idempotent — pure set, never toggles; re-run yields identical state):
#   - move IND-P1-CONSUMER-WIRING-AUDIT out of ready[] (where it sat at
#     status=REVIEW — a half-move) into done[] with done_verified:true +
#     router gate-closure provenance. Follows the P0 flip-script convention:
#     done[] lane carries a per-row done_verified flag (the done_verified[]
#     array lane stays empty).
#
# Invocation (NEVER raw mv/cp/>):
#   jq -f scripts/router-ind-p1-consumer-wiring-gate-close.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def isTarget: (.id // "") == "IND-P1-CONSUMER-WIRING-AUDIT";

def closeGate:
  .status = "DONE"
  | .done_verified = true
  | .done_verified_at = "2026-06-30T01:23:20Z"
  | .done_verified_by = "router"
  | .gate_result = "PASS — router RAW-verified all 4 verification_gate criteria GREEN 2026-06-30T01:23Z. C1: 5/5 P0 tools wired, per-flow distribution matches PO wiring_map exactly (volatility x5, breadth x4, sentiment x3, foreign_room x3, liquidity_state x2). C2: graceful honest-NULL/[SKIP] guard in every flow. C3: zero dead field names (no fabrication). C4: additive-only 64ins/7del across 6 flows (8f71ea26->34ef9ec9->7832cc1f), deletions=field-name corrections only. Field contract matched to LIVE payloads (probed get_market_sentiment_index/get_vn_liquidity_state/get_foreign_room) + breadth names verified vs getBreadthThrust.ts source.";

# capture + enrich the row (if present), then move ready[] -> done[]
((.task_board.ready // []) | map(select(isTarget)) | (.[0] // null)) as $row
| if $row == null then .
  else
    ($row | closeGate) as $done_row
    | .task_board.ready = ((.task_board.ready // []) | map(select(isTarget | not)))
    | .task_board.done  = ((.task_board.done  // []) | map(select(isTarget | not)) + [$done_row])
    | ._updated_at = "2026-06-30T01:23:20Z"
    | ._updated_by = "router:gate-close:IND-P1-CONSUMER-WIRING-AUDIT"
  end
