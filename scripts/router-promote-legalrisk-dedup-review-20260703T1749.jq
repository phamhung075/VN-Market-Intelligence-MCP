# Router promote: FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK in_progress[] -> review[], dispatch qa.
# dev-mcp-server aefe093fec COMPLETE + router RAW-verified PASS (2026-07-03T17:49Z tick handling):
#   commits 3badf5fe5 (main fix, 9 files) + ce4051a7b (notebook, AMENDED from 9967785e4 to scrub a
#   session-UUID leak the agent wrote into the notebook **Session:** line — see systemic signal).
#   QUICK tier LIVE now (stage-bootstrap.md get_legal_risk_signals(days=1, hours_back=6), was bare).
#   ROBUST tier DEPLOY-GATED (legalRiskTools.ts computeCutoffIso+hours_back opt-in both sources;
#   alertVerdictTools.ts writeAlertVerdict (ticker,alertSource) pending-dedup). shared days=30 default
#   PRESERVED (5 other callers). New test FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK.test.ts (7 tests, 240L).
#   orch-state untouched by dev commits; not pushed.
# Guards: error if not in in_progress[], error if already in review[]. Type-guard string elements.
# Usage: jq --arg now "$NOW" -f scripts/router-promote-legalrisk-dedup-review-20260703T1749.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.in_progress | map(select(type=="object" and .id=="FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK"))[0]) as $t
| if $t == null then error("FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK not in in_progress[] — refuse to promote")
  elif ((.task_board.review | map(select(type=="object" and .id=="FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK")) | length) > 0) then error("already in review[] — refuse dup")
  else . end
| .task_board.review += [
    ($t + {
      status: "REVIEW",
      owner: "qa",
      promoted_at: $now,
      promoted_by: "router",
      dev_agent: "dev-mcp-server",
      dev_commits: ["3badf5fe5", "ce4051a7b"],
      raw_verify: "PASS",
      raw_verify_note: "[router 2026-07-03T17:49Z] dev-mcp-server aefe093fec COMPLETE, RAW-verified PASS. 3badf5fe5 (9 files) + ce4051a7b (notebook). QUICK tier LIVE (stage-bootstrap.md days=1,hours_back=6). ROBUST tier deploy-gated (legalRiskTools.ts computeCutoffIso+hours_back opt-in both alerts+agent_signals sources L75/94/163/274; alertVerdictTools.ts (ticker,alertSource) pending-verdict dedup returns duplicate:true). shared days=30 default PRESERVED — 5 other callers (bctc-analyst/digest-predict/unified-agent x2/fb-market-poster x2) rely on 30d breadth. New test 7 tests/240L. orch-state untouched by dev commits; not pushed. SECURITY: agent leaked session-UUID into notebook **Session:** line -> router scrubbed via amend (9967785e4->ce4051a7b) + filed systemic signal.",
      qa_scope: "Run FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK.test.ts + adjacent legalRisk/alertVerdict suites; confirm tsc clean; confirm QUICK-tier flow bound is honored by currently-deployed server (days=1 today, hours_back forward-compat); confirm ROBUST-tier dedup logic + that shared days=30 default is NOT lowered; confirm no regression in the 5 non-alert callers; note ROBUST tier lands only on next mcp-server rebuild (deploy-gated)."
    })
  ]
| .task_board.in_progress |= map(select(type != "object" or .id != "FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK"))
| .head += {
    status: "review",
    active_task_id: "FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK",
    next_agent: "qa",
    next_action: "qa gate FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK: run new test + adjacent legalRisk/alertVerdict suites, tsc clean, verify QUICK-tier live behavior (days=1 honored by deployed server, hours_back forward-compat) + ROBUST-tier dedup correctness + shared days=30 preserved for 5 non-alert callers. On qa PASS: router promote review->done_verified; ROBUST tier remains deploy-gated (batch with pending mcp-server rebuild items). FEAT-SEVERITY-OVERRIDE-SURFACING still backlog for next dev-team tick.",
    updated_at: $now,
    updated_by: "router",
    note: "17:49Z: FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK in_progress->review (dev-mcp-server aefe093fec RAW-verified PASS, notebook UUID-leak scrubbed). Dispatched qa. dev WIP=0."
  }
