# Router dispatch flip: FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK backlog[] -> in_progress[] (dev-team 17:07Z tick).
# type=FIX, zone apps/mcp-server/. Executing agent: dev-mcp-server (owns MCP server tools legalRiskTools.ts / alertVerdictTools.ts).
# Origin: qa a522cb30f finding during FIX-ALERT-COMMANDER-DEAD-NO-SLOT gate — resurrected alert-commander re-fires legal_risk CRITICAL every cycle for ~30d.
# Time-sensitivity: alert-commander-critical (0 */4) first fires ~20:00Z (surfaces PNJ = desired); QUICK tier must land before the 2nd fire (~00:00Z) to stop re-fire accumulation.
# Guards: error if not in backlog[], error if already in in_progress[]. Type-guard backlog string-element.
# Usage: jq --arg now "$NOW" -f scripts/router-dispatch-legalrisk-dedup-inprogress-20260703T1707.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.backlog | map(select(type=="object" and .id=="FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK"))[0]) as $t
| if $t == null then error("FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK not in backlog[] — refuse to dispatch")
  elif ((.task_board.in_progress | map(select(type=="object" and .id=="FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK")) | length) > 0) then error("already in in_progress[] — refuse dup")
  else . end
| .task_board.in_progress += [
    ($t + {
      status: "IN_PROGRESS",
      owner: "dev-mcp-server",
      dispatched_at: $now,
      dispatched_by: "router",
      tick: "2026-07-03T17:07Z",
      router_dispatch_note: "[router 2026-07-03T17:07Z] FIX dispatched to dev-mcp-server. TWO-TIER: (QUICK/no-deploy) add hours_back bound to get_legal_risk_signals() call in docs/agents/alert-commander/flow/stage-bootstrap.md so a stale 30-day legal_risk stops re-firing — effective immediately (flow read live); (ROBUST/deploy) bound default lookback + add already-alerted dedup/read-state in legalRiskTools.ts (getLegalRiskSignals) + dedup in write_alert_verdict (alertVerdictTools.ts) so each legal_risk fires CRITICAL once. Preserve alert-policy.md no-suppression intent for NEW legal_risk. Add a repeat-fire-suppression test. On completion: router RAW-verify -> in_progress->review -> qa."
    })
  ]
| .task_board.backlog |= map(select(type != "object" or .id != "FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK"))
| .head += {
    status: "in_progress",
    active_task_id: "FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK",
    next_agent: "dev-mcp-server",
    next_action: "dev-mcp-server: (QUICK, no-deploy) bound get_legal_risk_signals lookback in alert-commander/flow/stage-bootstrap.md; (ROBUST, deploy) legalRiskTools.ts default-lookback + already-alerted dedup + write_alert_verdict dedup; repeat-fire test. Index-only commit, explicit paths, no board touch, no push. On completion: router RAW-verify -> review -> qa.",
    updated_at: $now,
    updated_by: "router",
    note: "17:07Z dev-team tick: dispatched FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK (HIGH, qa-found flood gap) to dev-mcp-server. WIP=1. FEAT-SEVERITY-OVERRIDE-SURFACING remains backlog."
  }
