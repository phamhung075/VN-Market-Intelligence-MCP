# Router: (1) promote FIX-ALERT-COMMANDER-DEAD-NO-SLOT review->done_verified on qa PASS;
#         (2) file qa-discovered follow-up FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK into backlog[] (HIGH).
# qa a522cb30f RAW-verified PASS (router 2026-07-03T16:37Z tick, promotion at ~17:0xZ):
#   - commit 27a41ae5c scoped to 3 qa docs (report/qa-journal/qa-notebook), 0 UUID leak, 0 board/code/config touch.
#   - DoD real evidence: both JSON jq -e exit 0; 2 alert-commander slots field-parity vs news-scout-offhours/bctc-analyst-slot-1 + flow_path exists;
#     cron functionally verified (node cowork-match-slots.test.js 16/16, */15 2-8 * * 1-5 as fixture; 0 */4 byte-identical to news-scout-offhours);
#     system-map:1312 accurate vs alert-policy.md:46 + cycle.md:17 + stage-signals.md:21; DWF-phase1-cadence.test.ts 51/0.
#   - QA FINDING (mandatory follow-up, NOT a block): legal_risk re-alert flood gap -> becomes FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK below.
# Guards: promote errors if not in review[] / already done_verified[]; follow-up errors if id already in backlog[].
# Usage: jq --arg now "$NOW" -f scripts/router-promote-alertcmd-doneverified-and-file-dedup-followup-20260703T1637.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.review | map(select(type=="object" and .id=="FIX-ALERT-COMMANDER-DEAD-NO-SLOT"))[0]) as $t
| if $t == null then error("FIX-ALERT-COMMANDER-DEAD-NO-SLOT not in review[] — refuse to promote")
  elif ((.task_board.done_verified | map(select(type=="object" and .id=="FIX-ALERT-COMMANDER-DEAD-NO-SLOT")) | length) > 0) then error("already done_verified[] — refuse dup")
  elif ((.task_board.backlog | map(select(type=="object" and .id=="FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK")) | length) > 0) then error("FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK already in backlog — refuse dup")
  else . end
| .task_board.done_verified += [
    ($t + {
      status: "DONE_VERIFIED",
      promoted_at: $now,
      promoted_by: "router",
      qa_verdict: "PASS",
      qa_agent: "a522cb30f63265723",
      qa_commit: "27a41ae5c",
      qa_report: "reports/TASK_REPORT_FIX-ALERT-COMMANDER-DEAD-NO-SLOT.md",
      followup_task: "FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK",
      qa_dod_note: "[router 2026-07-03T17:0xZ] qa a522cb30f PASS, RAW-verified: commit 27a41ae5c scoped to 3 qa docs (0 board/code/config, 0 UUID). Both JSON jq -e exit0; 2 alert-commander slots field-parity + flow_path exists; cron functionally verified (cowork-match-slots.test.js 16/16, */15 2-8 fixture; 0 */4 == news-scout-offhours); system-map:1312 accurate; DWF-phase1-cadence 51/0. QA FINDING (mandatory follow-up FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK): legal_risk re-alert flood — get_legal_risk_signals() bare 30-day lookback, no expiry/read-state/already-alerted dedup + write_alert_verdict blind append -> any legal_risk re-fires CRITICAL every cycle for ~30d. Pre-existing, not caused by this fix. alert-commander now LIVE via cowork-schedule (no deploy needed) — first fire surfaces PNJ (desired); dedup follow-up bounds the re-fire."
    })
  ]
| .task_board.review |= map(select(type != "object" or .id != "FIX-ALERT-COMMANDER-DEAD-NO-SLOT"))
| .task_board.backlog += [
    {
      id: "FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK",
      type: "FIX",
      zone: "apps/mcp-server/",
      size: "M",
      priority: "HIGH",
      status: "BACKLOG",
      created_at: $now,
      created_by: "router",
      provenance: "qa a522cb30f63265723 during FIX-ALERT-COMMANDER-DEAD-NO-SLOT gate (2026-07-03)",
      related: "FIX-ALERT-COMMANDER-DEAD-NO-SLOT (done_verified) — resurrecting alert-commander EXPOSED this pre-existing gap; needed to prevent legal_risk alert flood",
      desc: "legal_risk alerts re-fire CRITICAL every cycle (15min market / 4h off-hours) for up to 30 days. Root: (1) alert-commander flow docs/agents/alert-commander/flow/stage-bootstrap.md:42 calls get_legal_risk_signals() BARE (no days/hours_back); tool apps/mcp-server/src/interface/mcp/tools/sector/legalRiskTools.ts:236 defaults to 30-day lookback with NO expiry filter, NO read-state, NO already-alerted tracking; (2) stage-signals.md:21 = unconditional 'legal_risk | any | CRITICAL now'; (3) write_alert_verdict (alertVerdictTools.ts:63-93) is a blind append, no dedup. Two-tier fix: (QUICK, no deploy) bound the lookback in stage-bootstrap.md via get_legal_risk_signals(hours_back=N) so a stale 30-day event stops re-firing; (ROBUST, deploy) add already-alerted dedup / read-state to legalRiskTools + write_alert_verdict so each legal_risk fires CRITICAL once (or on material change). Preserve alert-policy.md no-suppression intent for NEW legal_risk. Add a test for repeat-fire suppression.",
      files: ["docs/agents/alert-commander/flow/stage-bootstrap.md", "apps/mcp-server/src/interface/mcp/tools/sector/legalRiskTools.ts", "apps/mcp-server/src/interface/mcp/tools/sector/alertVerdictTools.ts", "docs/agents/alert-commander/flow/stage-signals.md"]
    }
  ]
| .head += {
    status: "idle",
    active_task_id: null,
    next_agent: null,
    next_action: "FIX-ALERT-COMMANDER-DEAD-NO-SLOT done_verified (qa PASS). alert-commander LIVE via cowork-schedule (fires next matching tick — critical 0 */4, market */15 2-8 wkdays). 2 HIGH backlog follow-ups await dispatch: FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK (qa-found flood gap — prioritize the QUICK no-deploy flow-lookback bound before re-fires accumulate) + FEAT-SEVERITY-OVERRIDE-SURFACING (robustness). Next dev-team tick dispatches.",
    updated_at: $now,
    updated_by: "router",
    note: "17:0xZ: FIX-ALERT-COMMANDER-DEAD-NO-SLOT promoted done_verified (qa a522cb30f PASS). Filed qa follow-up FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK (HIGH). WIP=0."
  }
