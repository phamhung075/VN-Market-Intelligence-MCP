# Router promote: FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK review[] -> done_verified[].
# qa accbf4483 COMPLETE, verdict APPROVED (commit 36fa3932b) + router RAW-verified PASS (2026-07-03T18:37Z):
#   qa commit scope = 3 qa docs ONLY (report + decision journal + qa notebook); orch-state/code/config untouched;
#   0 raw-UUID VALUE leak on added lines. qa independently re-ran: FIX-LEGAL-RISK test 7 pass/0 fail;
#   14-file adjacent net 124 pass/0 fail; tsc 0 errors; full suite 66-69 fail (under ceiling 348, all
#   pre-existing pollNews/VPS/network flake cluster, none import legalRiskTools/alertVerdict); shared days=30
#   PRESERVED (7 call sites / 6 flows); DDD+security+mock-guard PASS. QUICK tier LIVE; ROBUST tier deploy-gated.
# Guards: error if not in review[], error if already in done_verified[]. Type-guard string elements.
# Usage: jq --arg now "$NOW" -f scripts/router-promote-legalrisk-dedup-done-20260703T1837.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.review | map(select(type=="object" and .id=="FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK"))[0]) as $t
| if $t == null then error("FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK not in review[] — refuse to promote")
  elif ((.task_board.done_verified | map(select(type=="object" and .id=="FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK")) | length) > 0) then error("already in done_verified[] — refuse dup")
  else . end
| .task_board.done_verified += [
    ($t + {
      status: "DONE_VERIFIED",
      done_verified: true,
      verified_by: "router",
      verified_at: $now,
      qa_agent: "qa",
      qa_verdict: "APPROVED",
      qa_commit: "36fa3932b",
      signoff_note: "[router 2026-07-03T18:37Z] qa accbf4483 verdict APPROVED (commit 36fa3932b — 3 qa docs ONLY: report+decision-journal+notebook; orch-state/code/config untouched; 0 raw-UUID value leak). Router RAW-verified PASS. qa independently re-ran (not trusting dev numbers): FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK.test.ts 7 pass/0 fail; 14-file adjacent net 124 pass/0 fail; tsc --noEmit 0 errors; full suite run twice 66-69 fail/1170 (under ceiling 348, all pre-existing pollNews/VPS-push/network flake, none import legalRiskTools/alertVerdictTools/alertVerdictStore); shared days=30 default PRESERVED (7 call sites/6 flows); TC4 repeat-fire-suppression scoped to post-fire write_alert_verdict bookkeeping (preserves alert-policy.md no-suppression for NEW legal_risk); DDD+security+mock-guard PASS. QUICK tier LIVE now (stage-bootstrap.md days=1,hours_back=6). ROBUST tier (legalRiskTools.ts computeCutoffIso+hours_back opt-in; alertVerdictTools.ts (ticker,alertSource) pending-verdict dedup) merged but DEPLOY-GATED — inert until next mcp-server rebuild. Fix commits 3badf5fe5+ce4051a7b. Report reports/TASK_REPORT_FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK.md. Non-blocking QA finding: 3 already-merged dev-mcp-server.md notebook entries (85267b624,1a9cda30b,e73a53688) carry unscrubbed raw session UUID predating this task — same leak class now tracked by backlog FIX-AGENT-NOTEBOOK-UUID-PROVENANCE.",
      deploy_gate: "ROBUST tier deploy-gated: batch with pending mcp-server rebuild items (pdfpull-guard, COLUMN-ORDER finalize_bctc_refine CTG)."
    })
  ]
| .task_board.review |= map(select(type != "object" or .id != "FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK"))
| .head += {
    status: "idle",
    active_task_id: null,
    next_agent: null,
    next_action: "FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK done_verified (qa APPROVED, router RAW-verified). QUICK tier LIVE; ROBUST tier DEPLOY-GATED — batch with pending mcp-server rebuild (pdfpull-guard + COLUMN-ORDER finalize_bctc_refine CTG). dev WIP=0. Next dev-team tick: backlog has FIX-BCTC-FULL-BATCH-CONTAMINATION (HIGH, architect-first handler-vs-gateway) + FEAT-SEVERITY-OVERRIDE-SURFACING + CHORE-GITIGNORE-CLAUDE-TMP + FIX-AGENT-NOTEBOOK-UUID-PROVENANCE + FIX-MACRO-SNAPSHOT-REGIME-PARSE-DRIFT.",
    updated_at: $now,
    updated_by: "router",
    note: "18:37Z: FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK review->done_verified (qa APPROVED 36fa3932b, router RAW-verified). ROBUST tier deploy-gated. dev WIP=0 — idle."
  }
