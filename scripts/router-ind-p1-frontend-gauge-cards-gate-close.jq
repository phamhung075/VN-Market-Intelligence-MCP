# router-ind-p1-frontend-gauge-cards-gate-close.jq
#
# Router gate-closure for IND-P1-FRONTEND-GAUGE-CARDS (sprint MARKET-INDICATOR-DEPTH-P0):
# the 6 P0 indicator gauge-cards dashboard route + transparent /api/indicator-gauges proxy.
#
# QA (commit 42fe866f) already moved the row review[] -> done[] with qa_verdict=APPROVED but
# left done_verified UNSET (the router-level gate stamp). This transform applies the router
# done_verified:true + RAW-verification provenance IN PLACE on the existing done[] row
# (additive scalars only — no lane move, no schema-shape change).
#
# Router RAW-verified 2026-06-30 (NOT relayed from QA badge):
#   - commit 42fe866f real (qa decision doc + notebook + orch-state + 69L TASK_REPORT).
#   - 4 task test files green (45 + 13 + 26 + 15); tsc --noEmit 0 errors.
#   - the 2 full-suite failures are PRE-EXISTING QUE-TOOLTIP (commit d7167c0a, unrelated
#     files — RAW-confirmed via git show), not introduced by this task.
#   - DDD: api.indicator-gauges.tsx + dashboard.indicator-gauges.tsx are interface-layer
#     only (zero domain/infra imports).
#   - honest-NULL LIVE: frontend image c693445f, GET :3001/dashboard/indicator-gauges
#     HTTP 200 with 17 "Chua co du lieu" markers across all 6 cards; no fabrication.
#   - coverage-map 6-cards/5-rows mapping intentional + documented (row5 l3b_note: 2 cards
#     from 1 liquidity section).
#   - upstream :3001/api/indicator-gauges -> mcp-server :3000 returns 404 (endpoint not yet
#     deployed); page degrades to honest-NULL. DoD = frontend-layer honest-NULL-when-absent
#     (QA decision, verified against acceptance criteria). Backend REST aggregator is a
#     TRACKED follow-up gap (coverage-map status:GAP), NOT a DoD blocker for this task.
#   - no cross-lane duplicate of the id (BA defect class did not recur).
#
# Sprint umbrella MARKET-INDICATOR-DEPTH-P0 stays ACTIVE — momentum P1 tasks still in flight.
#
# Invocation (NEVER raw mv/cp/>):
#   jq -f scripts/router-ind-p1-frontend-gauge-cards-gate-close.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def isTarget: (.id // "") == "IND-P1-FRONTEND-GAUGE-CARDS";

.task_board.done = ((.task_board.done // []) | map(
    if isTarget then
      .done_verified = true
      | .done_verified_at = "2026-06-30T04:35:00Z"
      | .done_verified_by = "router"
      | .gate_result = "PASS — router RAW-verified QA APPROVED gate 2026-06-30T04:35Z (not relayed). Commit 42fe866f real. 4 task test files green (45+13+26+15); tsc 0 errors; 2 full-suite fails PRE-EXISTING QUE-TOOLTIP (d7167c0a, unrelated). DDD interface-only. Honest-NULL LIVE on image c693445f: :3001/dashboard/indicator-gauges HTTP 200, 17 honest-NULL markers / 6 cards, no fabrication. Coverage-map 6c/5r mapping documented. Upstream /api/indicator-gauges 404 -> honest-NULL = frontend DoD; backend REST aggregator is a tracked follow-up gap, not a blocker. No cross-lane dup."
    else . end))
| ._updated_at = "2026-06-30T04:35:00Z"
| ._updated_by = "router:gate-close:IND-P1-FRONTEND-GAUGE-CARDS"
