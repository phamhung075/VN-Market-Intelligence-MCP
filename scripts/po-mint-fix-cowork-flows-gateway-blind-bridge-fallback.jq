# po recurring-bug escalation mint — FIX-COWORK-FLOWS-GATEWAY-BLIND-BRIDGE-FALLBACK -> backlog[].
# Sources: cowork-team 20260708T194500Z (5th guaranteed-slot miss, CRITICAL) + 20260708T091500Z
#          (remediation path) + dev-team 20260708T033700Z (root cause, ESCALATED).
# PLAN-ONLY (anomaly->BACKLOG governance); depends_on the two DONE gateway tasks so it is
# immediately BOUNDED-1-eligible. Does NOT touch .head (left idle from the Step-6 close).
# Invoke:
#   jq -f scripts/po-mint-fix-cowork-flows-gateway-blind-bridge-fallback.jq --arg now "<ISO8601Z>" \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
"FIX-COWORK-FLOWS-GATEWAY-BLIND-BRIDGE-FALLBACK" as $id
| if ([.task_board.backlog, .task_board.ready, .task_board.in_progress, .task_board.review, .task_board.qa, .task_board.done, .task_board.done_verified] | map(.[]?) | any((.id // .task_id) == $id))
  then error("id already exists on the board: " + $id) else . end
| .task_board.backlog = ((.task_board.backlog // []) + [{
    id: $id,
    title: "Retrofit gateway-blind-affected cowork agent flows with scripts/agents-flow/mcp-call.sh curl-bypass fallback",
    type: "FIX",
    priority: "P1",
    status: "BACKLOG",
    zone: "cross-service/",
    recurring: true,
    needs_design: true,
    depends_on: ["FIX-GATEWAY-BLIND-DEGRADED-MODE-PROCEDURE", "SPIKE-GATEWAY-BLIND-CLI-HANDSHAKE"],
    promoted_by: "po (recurring-bug escalation, feedback_recurring_bug_escalation)",
    promoted_at: $now,
    source_signals: [
      "docs/signals/processed/cowork-team-20260708T194500Z.json",
      "docs/signals/processed/cowork-team-20260708T091500Z.json",
      "docs/signals/processed/dev-team-20260708T033700Z-gateway-blind-main-session.json"
    ],
    desc: "RECURRING DEFECT (5th guaranteed-slot miss, multi-day) — per standing recurring-bug-escalation policy (memory feedback_recurring_bug_escalation: 2+ recurrences -> block/escalate). Guaranteed cowork slots keep MISSING (chef-morning 05:15Z, chef-eod 08:45Z, fb-daily 09:15Z, digest-daily 17:30Z, chef-evening 19:45Z) because the affected agent flows call native mcp__gateway__call_tool, which is blind under the per-session Claude Code MCP-client handshake failure (root cause = out-of-repo harness lifecycle, established by SPIKE-GATEWAY-BLIND-CLI-HANDSHAKE DONE; the gateway server itself is proven healthy via raw-curl HTTP 200). The repo-actionable bridge ALREADY EXISTS and is proven live: scripts/agents-flow/mcp-call.sh (mcp_call + mcp_call_gateway_meta, delivered by FIX-GATEWAY-BLIND-DEGRADED-MODE-PROCEDURE DONE_VERIFIED, commit a6031047e) POSTs JSON-RPC-over-curl directly and bypasses the blind native MCP client — which is exactly why cowork-team's OWN dispatcher ticks never miss. GAP: that bridge + the SS6 degraded-mode procedure in docs/standards/gateway-call-contract.md were built but NEVER APPLIED to the guaranteed-slot agent flows (verified: grep -rl mcp-call.sh over docs/agents/unified-agent/ + docs/agents/fb-market-poster/ = zero hits), and NO in-flight retrofit task exists in any lane. SCOPE: retrofit the gateway-blind-affected flows to fall back to the mcp-call.sh curl bypass when native mcp__gateway__call_tool is unavailable/blind. Confirmed-affected (per the cowork-team 7-agent-type tally): docs/agents/unified-agent/flow/chef.md (chef-morning/eod/evening), docs/agents/fb-market-poster/flow/main.md (fb-daily; note it HAS Bash but no bridge reference), plus alert-commander, news-scout, market-watcher, digest, refine_bctc_md. DESIGN NOTE (needs_design): architect design pass for the native-first / curl-bypass-fallback pattern (per-tool coverage matrix already in gateway-call-contract.md SS6b; search_tools raw schema uses {query:} not {keyword:}). MUST respect the standing rule that agent flow-doc edits route through the proper owner (agent-father / owning agent), not edited ad-hoc. DoD: each affected guaranteed slot delivers on a subsequent tick even when the spawning session is gateway-blind (verify against a live blind session or via QA-COWORK-SLOT-SESSION-DOWN-SURVIVAL 7-point test)."
  }])
| ._updated_at = $now
| ._updated_by = "po"
