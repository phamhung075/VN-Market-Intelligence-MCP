# router-ind-p1-mcp-rest-gauges-gate-close.jq
#
# Router gate-closure for IND-P1-MCP-REST-GAUGES-ENDPOINT (sprint MARKET-INDICATOR-DEPTH-P0).
# Stamps done_verified=true + provenance IN-PLACE on the QA-APPROVED row already in done[]
# (additive scalars only — no lane move; the done_verified[] LANE stays empty per convention).
#
# RAW-verified by router 2026-06-30 (NOT relayed from QA badge):
#   - commit c890728a real + HEAD: TASK_REPORT (+118L), coverage-map (32 lines changed),
#     orch-state (review->done), qa decision (+21), qa notebook (+4).
#   - board: IND-P1-MCP-REST-GAUGES-ENDPOINT count=1 across ALL lanes, in done[] only,
#     status=DONE, qa_verdict=APPROVED, done_verified UNSET, done_at=2026-06-30T04:10:00Z.
#   - frontend-data-coverage-map.json: all 5 /dashboard/indicator-gauges section rows = LIVE
#     (volatility, sentiment, breadth, foreign_room, liquidity); LIVE 30->35; the lone remaining
#     GAP is "(NEW) cheb-synthesis" (CHEF-SYNTHESIS) — NOT a gauge row.
#   - project-stats.json#toolCount = 182 UNCHANGED (REST endpoint, not an MCP tool — no drift).
#   - endpoint live: mcp-server image 6c3bb23e healthy (PRE d358dd058a9e), router's OWN probe
#     GET :3000/api/indicator-gauges -> HTTP 200, 5 sections present, volatility+sentiment real,
#     breadth/foreign_room/liquidity honest-null + null_reason, foreign_room has NO tickers[] key.
#   - tsc 0; bun test 35/35; DDD interface->application+infrastructure (no domain logic, reuses
#     the 5 P0 usecases/clients — not re-implemented, not re-invoked via MCP tool layer);
#     security 0 process.env + mock-guard exit 0; Promise.allSettled -> HTTP 200 on partial fail.
#
# Idempotent guard: aborts if the row is absent from done[] OR already done_verified==true,
# so a re-run cannot double-stamp.
#
# Invocation (NEVER raw mv/cp/>; timestamp injected so no stale baked value):
#   jq --arg TS "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#      -f scripts/router-ind-p1-mcp-rest-gauges-gate-close.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def isTarget: (.id // "") == "IND-P1-MCP-REST-GAUGES-ENDPOINT";

((.task_board.done // []) | map(select(isTarget)) | .[0]) as $row
| if $row == null
  then error("IND-P1-MCP-REST-GAUGES-ENDPOINT not found in done[] — QA move missing/reverted; aborting")
  elif ($row.done_verified == true)
  then error("IND-P1-MCP-REST-GAUGES-ENDPOINT already done_verified=true — aborting to avoid double-stamp")
  else . end
| .task_board.done = ((.task_board.done // []) | map(
    if isTarget then
      .done_verified = true
      | .done_verified_at = $TS
      | .done_verified_by = "router"
      | .gate_result = "PASS — router RAW-verified QA APPROVED gate (commit c890728a, not relayed). tsc 0; bun test 35/35; DDD interface->application+infrastructure (no domain logic; reuses 5 P0 usecases/clients, not re-impl, not re-invoked via MCP); security 0 process.env + mock-guard 0; honest-NULL all 5 sections (foreign_room .market-only, NO tickers[]; liquidity endpoint-assigned source_tier); Promise.allSettled -> HTTP 200 on partial. Endpoint live: mcp-server image 6c3bb23e healthy; router OWN probe GET :3000/api/indicator-gauges -> 200, 5 sections, breadth/foreign_room/liquidity honest-null+reason. toolCount 182 unchanged; coverage-map 5 indicator-gauges GAP->LIVE (LIVE 30->35); board single-occurrence no cross-lane dup."
    else . end))
| ._updated_at = $TS
| ._updated_by = "router:gate-close:IND-P1-MCP-REST-GAUGES-ENDPOINT"
