# router-ind-p1-momentum-frontend-gate-close.jq
#
# Router gate-closure for BA-IND-P1-MOMENTUM-FRONTEND (the user's "add to frontend" deliverable;
# sprint MARKET-INDICATOR-DEPTH-P0, already moved to closed_sprints by the dev-team loop PM).
#
# WHY THIS EXISTS: the dev-team cron loop merged + QA-APPROVED the code (TASK-501 mcp-server
# REST aggregator, TASK-502 frontend 4-card dashboard) and its PM moved the umbrella into the
# done_verified[] LANE with status=DONE_VERIFIED — but left the done_verified SCALAR UNSET and,
# critically, NEVER DEPLOYED. Router RAW-probe found BOTH endpoints 404 (stale containers).
# This script stamps the genuine router gate-close ONLY after the deploy was completed + verified.
#
# Stamps done_verified=true + provenance IN-PLACE on the umbrella row wherever it currently sits
# (done_verified[] lane per the loop; falls back to done[]). Additive scalars only — NO lane move
# (the loop already placed it; fighting that would desync the closed_sprints linkage).
#
# RAW-verified by router 2026-06-30 (NOT relayed from QA badge or ops report):
#   - ops single-service rebuild (NEVER down&&up): mcp-server image 6c3bb23ec345 -> 8b6bc8b9323c,
#     frontend image c693445f7d13 -> 447eda538788; both healthy; all 11 peers + gateway undisturbed.
#   - router OWN curl: GET :3000/api/momentum-indicators -> HTTP 200, 4 sections
#     (roc, relative_strength, proximity_52w, foreign_accum), every reading honest-NULL with explicit
#     null_reason + source_tier:3 (DESIGNED pass state; zero fabrication / default-fill).
#   - router OWN curl: GET :3001/dashboard/momentum -> HTTP 200; SSR body renders all 4 card titles
#     (Sức Mạnh Tương Đối / 52 Tuần / Tích Lũy / momentum_factor), the exact null_reason strings
#     (Insufficient ≥13 bars, N≥5, denominator_ma200=0, ≥5d flow), 10x "—" null placeholders, and
#     "Cập nhật lúc" freshness badges. "ErrorBoundary" tokens are benign Remix route-manifest exports
#     (no "Application Error"/"Unexpected Server Error"/"stack trace" rendered).
#   - GET :3001/api/momentum-indicators (frontend proxy) -> HTTP 200.
#   - coverage-map: 4 /dashboard/momentum rows flipped GAP -> DEPTH_THIN (writer ok, data shallow;
#     NOT LIVE — would overclaim real readings when all values null); summary GAP 5->1, DEPTH_THIN 2->6.
#     Root cause of the all-NULL = shallow OHLCV/flow history (tracked as a separate follow-up; the
#     FRONTEND ship is DONE — it honestly surfaces honest-NULL).
#
# Idempotent guard: aborts if the umbrella is absent OR already done_verified==true (no double-stamp).
#
# Invocation (NEVER raw mv/cp/>; timestamp injected so no stale baked value):
#   jq --arg TS "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#      -f scripts/router-ind-p1-momentum-frontend-gate-close.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def isTarget: (.id // "") == "BA-IND-P1-MOMENTUM-FRONTEND";

# Locate the row in either lane (loop put it in done_verified[]; be robust to done[] too).
(((.task_board.done_verified // []) | map(select(isTarget)) | .[0])
 // ((.task_board.done // []) | map(select(isTarget)) | .[0])) as $row
| if $row == null
  then error("BA-IND-P1-MOMENTUM-FRONTEND not found in done_verified[]/done[] — moved/reverted; aborting")
  elif ($row.done_verified == true)
  then error("BA-IND-P1-MOMENTUM-FRONTEND already done_verified=true — aborting to avoid double-stamp")
  else . end
| .task_board.done_verified = ((.task_board.done_verified // []) | map(
    if isTarget then
      .done_verified = true
      | .done_verified_at = $TS
      | .done_verified_by = "router"
      | .gate_result = "PASS — router RAW-verified DEPLOYMENT (not relayed from QA badge/ops report). Dev-team loop merged+QA-APPROVED TASK-501 (mcp-server GET /api/momentum-indicators aggregator) + TASK-502 (frontend dashboard.momentum 4-card + GaugeCard extract) but PM closed board WITHOUT deploy -> router found both endpoints 404 (stale containers). Remediated via ops single-service rebuild (NEVER down&&up): mcp-server 6c3bb23ec345->8b6bc8b9323c, frontend c693445f7d13->447eda538788, peers undisturbed. Router OWN curl: :3000/api/momentum-indicators 200 (4 sections all honest-NULL+null_reason+source_tier:3, zero fabrication); :3001/dashboard/momentum 200 renders 4 cards + null_reasons + Cập-nhật freshness badges (ErrorBoundary tokens = benign Remix manifest); :3001/api/momentum-indicators 200. coverage-map 4 momentum rows GAP->DEPTH_THIN (writer ok/data shallow — NOT LIVE; honest-NULL never overclaimed), summary GAP 5->1 DEPTH_THIN 2->6. Follow-up: shallow OHLCV/flow depth makes all 4 indicators null — separate data-backfill task to realize real readings (governing intent payoff). FRONTEND ship DONE."
    else . end))
| .task_board.done = ((.task_board.done // []) | map(
    if isTarget then
      .done_verified = true
      | .done_verified_at = $TS
      | .done_verified_by = "router"
      | .gate_result = "PASS — router RAW-verified deployment (see done_verified[] lane provenance)."
    else . end))
| ._updated_at = $TS
| ._updated_by = "router:gate-close:BA-IND-P1-MOMENTUM-FRONTEND"
