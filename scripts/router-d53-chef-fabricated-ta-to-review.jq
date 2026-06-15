# Router dev-team — move FIX-CHEF-FABRICATED-TA-NUMBERS in_progress -> review after router RAW-verified the
# STRUCTURAL fix (agent-father commit a925e89a). NOT done_verified: the LIVE behavioral gate (a CHEF dish must
# emit ZERO fabricated numeric RSI) fires only on the next chef-intraday cowork tick (~07:13 UTC) reading the new
# chef.md. Router will NOT force a dish (feedback_chef_dryrun_publishes: CHEF bypasses dedup -> double-posts live).
#
# ROUTER RAW VERIFY (git + grep, NOT agent badge), 2026-06-15T06:36Z:
#   * commit a925e89a touched chef.md ONLY (55+/2-); dirty cowork notebooks left unstaged (clean hygiene).
#   * chef.md now carries: Step 6.7 ANTI-FABRICATION GATE (AF-1 no numeric indicator w/o live cycle source;
#     AF-2 qualitative-only vocab; pre-publish self-check strip+log), line-120 orphan RSI threshold CLOSED
#     (gated on get_technical_indicators THIS cycle), Step-7 format-prohibition line, FIX-TA-GOSVC dependency note.
#   => structural root-cause fix present & verified. Awaiting LIVE behavioral confirmation on next CHEF dish.
#
# GUARD: refuse unless FIX-CHEF-FABRICATED-TA-NUMBERS is currently in in_progress[] and not already in review[].
# Usage: jq --arg now "$NOW" -f scripts/router-d53-chef-fabricated-ta-to-review.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([.task_board.in_progress[]? | select(.id=="FIX-CHEF-FABRICATED-TA-NUMBERS")][0]) as $t
| if ($t==null) then error("FIX-CHEF-FABRICATED-TA-NUMBERS not in in_progress[] — refuse")
  elif ([.task_board.review[]? | select(.id=="FIX-CHEF-FABRICATED-TA-NUMBERS")]|length>0) then error("already in review[] — refuse")
  else . end
| ("STRUCTURAL-VERIFIED (router RAW git+grep re-probe 2026-06-15T06:36Z, NOT agent-father badge): commit a925e89a touched docs/agents/unified-agent/flow/chef.md ONLY (dirty cowork notebooks left unstaged). chef.md now enforces an anti-fabrication gate: Step 6.7 AF-1 (CHEF may emit NO numeric RSI/MACD/BB/σ/MA unless get_technical_indicators was called THIS cycle and returned that exact value — none of CHEF's cycle tools do today, so ZERO numeric indicators permitted), AF-2 qualitative-only TA vocabulary, a pre-publish self-check that strips any 'RSI <n>'/'σ' token without a tool source and logs [AF-GATE: stripped...]. Line-120 orphan RSI threshold closed; Step-7 format rules add the RSI/MACD/BB/σ/MA prohibition; FIX-TA-GOSVC-NA-DESPITE-DEPTH named as the future real source. ROOT CAUSE addressed (orphan threshold + get_portfolio_conviction plain-text 'RSI 70+' editorial mis-read + format-gap). PENDING LIVE GATE: next chef-intraday dish (~07:13 UTC) must post to MARKET with NO numeric RSI — router RAW-reads via get_unreviewed_market_messages then promotes review->done_verified. Router will NOT force a dish (double-post risk).") as $V
| .task_board.in_progress = [ .task_board.in_progress[]? | select(.id!="FIX-CHEF-FABRICATED-TA-NUMBERS") ]
| .task_board.review = (.task_board.review + [ $t + {
      status:"review", reviewed_at:$now, reviewed_by:"dev-team",
      review_commit:"a925e89a", structural_verify_verdict:$V,
      pending_live_gate:"next chef-intraday cowork dish (~07:13 UTC) RAW-read for zero numeric RSI" } ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:null, next_agent:null,
    note:"DEV-TEAM TICK 2026-06-15T06:30Z — RSI-integrity pair dispatched. FIX-CHEF-FABRICATED-TA-NUMBERS -> REVIEW: structural anti-fabrication gate VERIFIED (router RAW git+grep, commit a925e89a, chef.md-only) — Step 6.7 AF-1/AF-2 + pre-publish self-check forbid CHEF emitting numeric RSI with no live tool source (the user-flagged single-digit fabrication path). LIVE behavioral gate PENDING next chef-intraday dish ~07:13 UTC (router RAW-reads MARKET for zero numeric RSI, NOT forcing a dish — double-post risk). FIX-TA-GOSVC-NA-DESPITE-DEPTH still IN_PROGRESS (dev-technical-analysis, recon-first; supplies CHEF's real RSI source). Holds: ARCH-CRON-SCHEDULER-RELIABILITY (QA observe gate, no dev WIP), BA-VN-MACRO-TOOLING (queued behind RSI pair). KEEP-PARK: ARCH-SHIP-WAVE-REAUDIT (mcp-server lane load-bearing)."
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
