# Router cowork-team tick — mint FIX-CHEF-FABRICATED-TA-NUMBERS into ready[] after RAW-verifying a LIVE
# MARKET post that republished fabricated single-digit RSI (the user's exact flagged bug, recurring).
#
# RAW EVIDENCE (router gateway call_tool, 2026-06-15T06:21-06:25Z, NOT agent badge):
#   * get_unreviewed_market_messages -> id 753 from_agent=mcp-user sent 2026-06-15 06:21:50 published to LIVE MARKET:
#       "Nhóm bất động sản chịu sức ép quá bán (VHM RSI 9.8, VIC RSI 7.4) ..." — single-digit RSI = the EXACT
#       corrupt values the user flagged ("RSI is bad calcul"), now recurring through the CHEF (unified-agent) path.
#     (prior dish id 750 05:25:52 carried the same "TA quá bán (VHM, VIC)" oversold claim w/o explicit numbers.)
#   * CHEF flow (docs/agents/unified-agent/flow/chef.md) calls ONLY get_market_hexagram, get_portfolio_conviction,
#       get_macro_snapshot — NONE return an RSI field. So 9.8/7.4 had NO live source => FABRICATED/recited stale.
#   * get_portfolio_conviction LIVE 06:25:14Z characterizes the same names as MIXED, NOT oversold:
#       VHM MODERATE 0.46 "Hỗn hợp - tín hiệu mâu thuẫn, thận trọng"; VIC MODERATE 0.51 "Hỗn hợp".
#       (its `trend` array 0.45-0.55 is a normalized conviction series, NOT RSI — easy mis-read source.)
#   * Live report-path RSI (defaultComputeTa, the now-fixed briefing source) = VHM 36.73 / VIC 35.09 (mid-band).
#   => The fabricated "quá bán -> phục hồi" (oversold -> recovery) thesis is contradicted by every live source.
#
# This is /goal#1 ("many code not give best result") + the user's original RSI flag RECURRING via a DIFFERENT
# consumer than the one fixed (ed77b9b0 fixed the briefing path; CHEF is a separate cowork agent that invents TA).
# Root = unified-agent flow/prompt permits emitting numeric TA citations it has no tool to source.
# Fixer MUST go through agent-md-factory skill before editing the agent .md (SSOT/DRY rule). recon_first.
#
# GUARD: refuse if FIX-CHEF-FABRICATED-TA-NUMBERS already exists anywhere on the board.
# Usage: jq --arg now "$NOW" -f scripts/router-d52-...jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| if ([..|objects|select(.id?=="FIX-CHEF-FABRICATED-TA-NUMBERS")]|length>0)
    then error("FIX-CHEF-FABRICATED-TA-NUMBERS already minted — refuse")
  else . end
| {
    id:"FIX-CHEF-FABRICATED-TA-NUMBERS", type:"FIX",
    title:"FIX-CHEF-FABRICATED-TA-NUMBERS — CHEF (unified-agent) publishes fabricated numeric RSI/TA to LIVE MARKET (id 753 06:21:50: 'VHM RSI 9.8, VIC RSI 7.4') with NO tool that returns RSI; reproduces the user-flagged single-digit corruption and drives a wrong oversold thesis",
    zone:"docs/agents/unified-agent/", owner:"agent-father", owner_agent:"agent-father",
    status:"READY", priority:"high", size:"M", recon_first:true,
    root_cause:"CHEF flow (docs/agents/unified-agent/flow/chef.md) sources TA only from get_portfolio_conviction (+ get_market_hexagram, get_macro_snapshot). NONE of those return an RSI/indicator number — get_portfolio_conviction emits conviction score, price, sector, a normalized `trend` array (0.45-0.55, NOT RSI), Kinh Dịch. CHEF nonetheless published precise 'VHM RSI 9.8, VIC RSI 7.4' to LIVE MARKET (id 753, 2026-06-15 06:21:50) — values it had no live source for => fabricated/recited stale (they equal the user's original corrupt single-digit RSI). The numbers contradict the live conviction tool (VHM/VIC = MIXED/caution, not oversold) AND the fixed report path (VHM 36.73/VIC 35.09 mid-band). Likely failure modes: (a) prompt allows quantitative TA citation without a tool gate; (b) `trend` array mis-read as RSI; (c) recited from prior-dish/context memory.",
    fix_spec:"Harden the unified-agent flow/prompt (VIA agent-md-factory skill — SSOT/DRY, do NOT hand-edit the .md): FORBID emitting any numeric indicator value (RSI/MACD/BB/σ) unless it came verbatim from a live tool call THIS cycle; CHEF has no RSI tool, so it may only speak QUALITATIVELY from get_portfolio_conviction's real fields (conviction, trend-direction, kinh dich, alert count) — never invent indicator numbers, never restate prior-cycle numbers as current. If a real RSI is required, it must come from get_technical_indicators (currently N/A pending FIX-TA-GOSVC-NA-DESPITE-DEPTH) — until then CHEF omits numeric TA. Add an explicit anti-fabrication rule + a self-check gate in chef.md Step 7 (pre-publish) that strips/blocks any 'RSI <n>' / 'σ' token not traceable to a cycle tool result. GENERIC across all tickers (/goal#2). Cross-ref [[FIX-TA-GOSVC-NA-DESPITE-DEPTH]] (real RSI source) — pairs with this.",
    verification_gate:"LIVE: trigger a CHEF intraday dish; RAW-read the MARKET post via get_unreviewed_market_messages — it MUST contain NO numeric RSI/σ/indicator value (qualitative only) OR only numbers that match a concurrent get_technical_indicators call. Re-confirm get_portfolio_conviction shows VHM/VIC MIXED (not oversold) and the dish narrative agrees. No single-digit RSI anywhere.",
    source:"router LIVE RAW verify during cowork-team chef-intraday tick 2026-06-15T06:21-06:25Z — CHEF dish id 753 republished user-flagged corrupt single-digit RSI with no live source",
    created_at:$now, created_by:"cowork-team", triaged_by:"cowork-team",
    status_note:"Peeled from the chef-intraday cowork tick. Distinct from FIX-CHEF-INTRADAY-MARKER-CADENCE (cadence) and FIX-TA-GOSVC-NA-DESPITE-DEPTH (real RSI source). HIGH because it republished the user's exact flagged bug to the LIVE MARKET group. Edit agent .md ONLY via agent-md-factory. PO triage next tick — pair-schedule with FIX-TA-GOSVC-NA-DESPITE-DEPTH so CHEF gets a real RSI source as the anti-fabrication rule lands. Do NOT spam a MARKET correction (compounds noise); fix root so it stops recurring."
  } as $chef
| .task_board.ready = (.task_board.ready + [ $chef ])
| .head = {
    status:"active", updated_at:$now, updated_by:"cowork-team",
    active_task_id:null, next_agent:null,
    note:"COWORK-TEAM TICK 2026-06-15T06:2x — chef-intraday dispatched (unified-agent, bg). RAW-VERIFY caught a LIVE-DATA-INTEGRITY DEFECT: CHEF dish id 753 (06:21:50) republished FABRICATED single-digit RSI 'VHM 9.8 / VIC 7.4' (the user's exact flagged bug) to the LIVE MARKET group — CHEF has NO tool that returns RSI (get_portfolio_conviction = conviction/trend/kinhdich only, shows VHM/VIC MIXED not oversold; fixed report path = VHM 36.73/VIC 35.09). => minted FIX-CHEF-FABRICATED-TA-NUMBERS (READY, high, agent-father via agent-md-factory, recon_first) — pair with FIX-TA-GOSVC-NA-DESPITE-DEPTH. NOTE: the ed77b9b0 RSI fix was correct for the BRIEFING path; CHEF is a separate consumer that invents TA — the user-flagged class is NOT fully closed until CHEF stops fabricating. FLAG PO: 3 coupled RSI-integrity tasks now ready (GOSVC N/A + CHEF fabrication + marker cadence). No MARKET correction spam. Head idle; held for PO triage."
  }
| ._updated_at=$now | ._updated_by="cowork-team"
| .task_board._updated_at=$now | .task_board._updated_by="cowork-team"
