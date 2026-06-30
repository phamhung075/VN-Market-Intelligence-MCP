# router-ind-p1-momentum-suite-gate-close.jq
#
# Router gate-closure for the IND-P1 momentum suite (sprint MARKET-INDICATOR-DEPTH-P0).
# In ONE atomic transform:
#   (1) stamps done_verified=true + provenance IN-PLACE on the 5 QA-APPROVED children in done[]
#       (additive scalars only — no lane move, the done_verified[] LANE stays empty per convention);
#   (2) closes the BA umbrella BA-IND-P1-MOMENTUM-RS: ready[] -> done[], status DONE_VERIFIED.
#
# The 5 children:
#   IND-P1-ROC-MOMENTUM / -RELATIVE-STRENGTH / -52W-HIGH-PROXIMITY (Go TA endpoints),
#   IND-P1-FOREIGN-ACCUM-RANK (Go stock-price endpoint),
#   IND-P1-MCP-PROXY-INDICATORS (4 MCP proxy tools wrapping all of the above).
#
# RAW-verified by router 2026-06-30 (NOT relayed from QA badge):
#   - commit 102fdf6f real + HEAD: orch-state (5 rows review/qa -> done, qa_verdict=APPROVED),
#     project-stats toolCount 178->182, TASK_REPORT 113L, qa decision +16, qa notebook +4.
#   - all 5 ids count=1 in done[], qa=APPROVED, dv unset; NO cross-lane dup (BA defect class clear).
#   - lane deltas: done 37->42 (+5), review 7->3 (-4), qa 1->0 (-1).
#   - tool-count 3-way agreement: live gateway=182, tool-registry.json=182, project-stats.json=182.
#   - mcp-server image d358dd058a9e healthy (PRE 01a447be30e5); 4 MCP tools resolve live honest-NULL
#     via gateway (router's own call_tool probe, not relayed).
#   - Go tests 19 TA + 7 stock-price PASS; MCP 22/0; tsc 0; mock-guard 0; DDD interface-only;
#     honest-NULL ...result transparent passthrough in all 4 proxy tool files.
#   - AC6 P1 consumer-wiring = TRACKED follow-up gap (router-tracked separately), NOT a DoD blocker
#     (same pattern used to close IND-P1-FRONTEND-GAUGE-CARDS).
#
# Idempotent guard: aborts if the umbrella is no longer in ready[] (already closed) so a re-run
# cannot append null / double-close.
#
# Invocation (NEVER raw mv/cp/>; timestamp injected so no stale baked value):
#   jq --arg TS "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#      -f scripts/router-ind-p1-momentum-suite-gate-close.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def isChild: (.id // "")
  | (. == "IND-P1-ROC-MOMENTUM"
     or . == "IND-P1-RELATIVE-STRENGTH"
     or . == "IND-P1-52W-HIGH-PROXIMITY"
     or . == "IND-P1-FOREIGN-ACCUM-RANK"
     or . == "IND-P1-MCP-PROXY-INDICATORS");
def isUmbrella: (.id // "") == "BA-IND-P1-MOMENTUM-RS";

(.task_board.ready // []) as $ready
| ($ready | map(select(isUmbrella)) | .[0]) as $umb
| if $umb == null
  then error("BA-IND-P1-MOMENTUM-RS not found in ready[] — already closed/moved; aborting to avoid double-close")
  else . end
| .task_board.done = ((.task_board.done // []) | map(
    if isChild then
      .done_verified = true
      | .done_verified_at = $TS
      | .done_verified_by = "router"
      | .gate_result = "PASS — router RAW-verified QA APPROVED gate (commit 102fdf6f, not relayed). Go tests 19 TA + 7 stock-price PASS; MCP proxy 22/0; tsc 0; mock-guard 0; DDD interface-only; honest-NULL ...result passthrough. mcp-server image d358dd058a9e healthy; tool resolves live honest-NULL via gateway. tool-count 3-way=182. No cross-lane dup."
    else . end))
| .task_board.ready = ($ready | map(select(isUmbrella | not)))
| .task_board.done = (.task_board.done + [
    $umb + {
      "status": "DONE_VERIFIED",
      "done_verified": true,
      "done_verified_at": $TS,
      "done_verified_by": "router",
      "gate_result": "PASS — BA momentum/RS decomposition umbrella closed: all 5 children (ROC-MOMENTUM, RELATIVE-STRENGTH, 52W-HIGH-PROXIMITY, FOREIGN-ACCUM-RANK, MCP-PROXY-INDICATORS) QA-APPROVED + router done_verified 2026-06-30. AC6 P1 consumer-wiring tracked as follow-up."
    }])
| ._updated_at = $TS
| ._updated_by = "router:gate-close:IND-P1-MOMENTUM-SUITE"
