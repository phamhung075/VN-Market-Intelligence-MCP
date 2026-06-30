# router-market-indicator-depth-p0-live-verified-flip.jq
#
# Gate-completion transform for sprint MARKET-INDICATOR-DEPTH-P0.
# Run AFTER ops rebuild (3 svcs new image IDs) + router RAW-verified LIVE e2e GREEN.
#
# Effect (idempotent — sets, never toggles; re-run yields identical state):
#   1. done[]            : flip the 7 P0 deliverables done_verified:false -> true,
#                          live_gate WITHHELD_PENDING_LIVE_PROBE -> LIVE_VERIFIED, + provenance.
#   2. active_sprints[]  : umbrella MARKET-INDICATOR-DEPTH-P0 status ACTIVE -> done_verified,
#                          embedded tasks[] mirror flipped, verification_gate.live_e2e_gate -> PASS.
#   (Physical move to closed_sprints[] is deferred to janitor/PM sweep, per board convention.)
#
# Invocation (NEVER raw mv/cp/>):
#   jq -f scripts/router-market-indicator-depth-p0-live-verified-flip.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def isP0Deliverable:
  ((.id // "") | test("^(P0-[0-9]|OHLCV-BACKFILL-P0|BREADTH-TIME-SERIES)"));

def liveVerify:
  .done_verified = true
  | .live_gate = "LIVE_VERIFIED"
  | .live_verified_at = "2026-06-30T00:42:00Z"
  | .live_verified_by = "router"
  | .live_verify_note = "Router RAW-verified LIVE e2e via gateway post-rebuild (3 svcs new image IDs): get_volatility_indicators REAL (rv_20d=14.78, regime=CRISIS, source_tier:3), get_vn_liquidity_state omo present (honest-NULL net_outstanding w/ blocked_reason), get_breadth_thrust honest-NULL (NFR-BR-3, accrual next trading day). No-fake-data contract held.";

.task_board.done = (.task_board.done | map(if isP0Deliverable then liveVerify else . end))
| .task_board.active_sprints = (.task_board.active_sprints | map(
    if .id == "MARKET-INDICATOR-DEPTH-P0" then
      .status = "done_verified"
      | .done_verified_at = "2026-06-30T00:42:00Z"
      | .tasks = ((.tasks // []) | map(liveVerify))
      | .verification_gate.live_e2e_gate = "PASS — router RAW-verified LIVE e2e GREEN 2026-06-30T00:42Z (3 svcs new image IDs 01a447be/d6383e96/f9ef2f18; 3 gateway probes confirmed; honest-NULL contract held)"
    else . end))
| ._updated_at = "2026-06-30T00:42:00Z"
| ._updated_by = "router:gate-completion:MARKET-INDICATOR-DEPTH-P0"
