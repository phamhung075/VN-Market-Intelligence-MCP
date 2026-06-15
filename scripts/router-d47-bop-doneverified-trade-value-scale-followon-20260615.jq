# Router dev-team — macro pair LIVE-VERIFY outcome (router independent re-probe 2026-06-15T04:07Z, NOT ops badge).
#  BOP LIVE-GREEN (plausible Q4-2025 data) -> F-BOP-QUERY-RECON + F-BOP-ENCODING done_verified.
#  TRADE: sheet-selection LIVE-confirmed (data flows) BUT values IMPLAUSIBLE (June import 212000mn > 60% of YTD 358000mn;
#         -138000mn/month balance) -> FIX-NSO-TRADE-SHEET KEEP done, WITHHOLD done_verified; mint FIX-NSO-TRADE-VALUE-SCALE.
# CI-RED-d20468c0-FIX PROMOTED done_verified here — CI run 27524085066 on 04e1ebb7 conclusion=success (router watched, rc=0).
# GUARD: refuse unless F-BOP-QUERY-RECON==done AND F-BOP-ENCODING==done AND FIX-NSO-TRADE-SHEET==done AND CI-RED==done AND value-scale not already minted.
# Usage: jq --arg now "$NOW" -f scripts/router-d47-...jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([..|objects|select(.id?=="F-BOP-QUERY-RECON")][0]) as $bop
| ([..|objects|select(.id?=="F-BOP-ENCODING")][0]) as $enc
| ([..|objects|select(.id?=="FIX-NSO-TRADE-SHEET")][0]) as $nso
| ([..|objects|select(.id?=="CI-RED-d20468c0-FIX")][0]) as $ci
| if ($bop==null or ($bop.status//"")!="done") then error("F-BOP-QUERY-RECON not done (\($bop.status//"missing")) — refuse")
  elif ($enc==null or ($enc.status//"")!="done") then error("F-BOP-ENCODING not done (\($enc.status//"missing")) — refuse")
  elif ($nso==null or ($nso.status//"")!="done") then error("FIX-NSO-TRADE-SHEET not done (\($nso.status//"missing")) — refuse")
  elif ($ci==null or ($ci.status//"")!="done") then error("CI-RED-d20468c0-FIX not done (\($ci.status//"missing")) — refuse")
  elif ([..|objects|select(.id?=="FIX-NSO-TRADE-VALUE-SCALE")]|length>0) then error("FIX-NSO-TRADE-VALUE-SCALE already minted — refuse")
  else . end
| ("LIVE-VERIFIED (router independent re-probe 04:07:24Z via gateway call_tool, NOT ops badge): get_vn_bop status=ok quarter quyIV/2025-12-25; current_account_total 7654mn, goods_exports 126318, goods_imports 117183, goods_net 9135, financial_account 7076, fdi_net 6850, overall_balance 2355, errors_omissions -12375, is_estimate=false; source 'SBV Liferay headless article API (PROBE-2 PASS)'. Magnitudes plausible for a VN quarter; stable across ops 2 windows + router re-probe. macro-indicators force-recreated (image sha256:01ae9e0a, commit 4c2fcb5c, 11 peers healthy). Fix live: JSON key items->articles + drop quarter date-range + dedup articleId + articles[0].") as $VB
| ("LIVE re-probe 04:07:26Z (router, NOT ops badge): get_vn_trade_balance status=ok period 2026-06, sheets selected by A1-header content (data FLOWS — not 'sheet not found' degraded). SHEET-SELECTION fix CONFIRMED LIVE. BUT VALUES IMPLAUSIBLE (separate root /goal#1): export_total 74000mn vs export_ytd 529000mn; import_total 212000mn for June ALONE = 59% of import_ytd 358000mn (impossible — monthly cannot exceed half the half-year-YTD); trade_balance -138000mn/month (VN runs near-balance ~±2-3bn). => column/row/unit misparse on the now-correctly-selected sheets. done_verified WITHHELD; raised FIX-NSO-TRADE-VALUE-SCALE.") as $VN
| {
    id:"FIX-NSO-TRADE-VALUE-SCALE", type:"FIX",
    title:"FIX-NSO-TRADE-VALUE-SCALE — get_vn_trade_balance VALUES implausible after sheet-selection fix (June import 212000mn = 59% of YTD 358000mn; -138000mn/mo balance): column/row/unit misparse on selected NSO sheets",
    zone:"apps/macro-indicators/", owner:"dev-macro-indicators", owner_agent:"dev-macro-indicators",
    status:"READY", priority:"high", size:"M", recon_first:true,
    root_cause:"FIX-NSO-TRADE-SHEET (4c2fcb5c) correctly SELECTS export/import/FDI sheets by A1-header content -> data flows. But the VALUE parse (row/column/unit mapping in parsers_vmt_trade.go) yields impossible magnitudes: June import 212000mn ($212bn) vs full-half-year-YTD 358000mn; June export 74000mn vs YTD 529000mn (529bn YTD > VN full-year-2025 ~405bn); balance -138000mn/month (VN ~near-balance). Likely reads a cumulative/total-of-totals row, wrong column (luy ke vs thang), or a unit-scale error (nghin/trieu/ty).",
    fix_spec:"RECON-FIRST: inspect the SELECTED sheets' actual cell grid — locate the correct CURRENT-MONTH export/import cells (vs YTD/cumulative columns) + the unit row; cross-check parsed monthly figure against plausible band (VN monthly export/import ~30-40bn USD). THEN fix row/column/unit mapping in parsers_vmt_trade.go. Add a relationship/plausibility guard test (monthly<=YTD; |balance| within sane band), fail-loud on out-of-band. Generic /goal#2.",
    verification_gate:"get_vn_trade_balance returns plausible monthly export/import (each ~tens of bn USD, monthly<=YTD, balance within sane band) LIVE post-rebuild.",
    baseline_pass:"4c2fcb5c",
    source:"router LIVE re-probe 04:07:26Z (FIX-NSO-TRADE-SHEET done_verified WITHHELD on value implausibility)",
    created_at:$now, created_by:"dev-team", triaged_by:"dev-team",
    status_note:"Continuation of FIX-NSO-TRADE-SHEET (sheet-selection done_verified-withheld; this peels the value-accuracy layer). dev-macro-indicators zone; SERIALIZE with other macro tasks (parsers_vmt_trade.go files-risk). Next-tick PO/dev-team dispatch."
  } as $vscale
| ("CI-GREEN VERIFIED (router watched run 27524085066 to completion, gh run watch --exit-status rc=0): GitHub Actions 'CI' workflow on origin/main 04e1ebb7 (SHA != d20468c0 RED) conclusion=success; full bun-test suite green (12929+ pass / 0 fail). The original fix c79ce6bd reconciled 4 test files (1138/1352a/239c/FIX-BCTC-ENRICHER) but its subset-only verify MISSED a 5th red 1837a-pipeline-state.test.ts (AC-2 head.status enum lacked the dev-team flow's canonical 'active'); dev-mcp-server 728ef563 added 'active'+'qa' (live-writer-derived; router RAW-verified file-scope=1837a only + isolation 5/5 + tsc green). c79ce6bd + 728ef563 = full reconciliation. verification_gate ci_green_on_subsequent_push SATISFIED.") as $VC
| walk(
    if (type=="object" and (.id?=="F-BOP-QUERY-RECON"))
      then . + {status:"done_verified", done_verified_at:$now, live_verify_verdict:$VB}
    elif (type=="object" and (.id?=="F-BOP-ENCODING"))
      then . + {status:"done_verified", done_verified_at:$now, live_verify_verdict:("Real BOP data restored downstream of encoding fix (400610e5) — \($VB)")}
    elif (type=="object" and (.id?=="FIX-NSO-TRADE-SHEET"))
      then . + {live_verify_verdict:$VN, done_verified_withheld_reason:$VN, followon:"FIX-NSO-TRADE-VALUE-SCALE"}
    elif (type=="object" and (.id?=="CI-RED-d20468c0-FIX"))
      then . + {status:"done_verified", done_verified_at:$now, done_commit:"c79ce6bd+728ef563", ci_green_run:"27524085066", ci_green_sha:"04e1ebb7", live_verify_verdict:$VC}
    else . end )
| .task_board.ready = (.task_board.ready + [ $vscale ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:"FIX-NSO-TRADE-VALUE-SCALE", next_agent:"po",
    note:"DEV-TEAM TICK 2026-06-15 COMPLETE — 4 fixes landed + CI restored green. (1) get_vn_bop LIVE-GREEN plausible Q4-2025 (router re-probe 04:07Z, NOT ops badge; macro-indicators force-recreated image sha256:01ae9e0a / 4c2fcb5c / 11 peers healthy) -> F-BOP-QUERY-RECON + F-BOP-ENCODING done_verified; F-NSO-SELECTOR stays done_verified. (2) get_vn_trade_balance sheet-SELECTION fix LIVE-confirmed (data flows, period 2026-06) BUT VALUES IMPLAUSIBLE (June import 212000mn = 59% of YTD 358000mn; export 74000 vs ytd 529000; balance -138000mn/mo) -> FIX-NSO-TRADE-SHEET done, done_verified WITHHELD; minted FIX-NSO-TRADE-VALUE-SCALE (READY, high, recon-first /goal#1 — NEXT-TICK dispatch). (3) FIX-CHEF-INTRADAY-MARKER-CADENCE done_verified (agent-father 7843045c, flow-doc). (4) CI-RED-d20468c0-FIX done_verified — original c79ce6bd fixed 4 test files but its subset-only verify MISSED a 5th red (1837a-pipeline-state.test.ts head.status enum lacked 'active'); dev-mcp-server 728ef563 added 'active'+'qa'; pushed origin 04e1ebb7; router WATCHED CI run 27524085066 -> conclusion=success (full suite green, SHA != d20468c0). === SF-1 dev-team-cron-singleton RELEASED at clean tick-end. === NEXT-TICK QUEUE: FIX-NSO-TRADE-VALUE-SCALE (READY high); ZOMBIE SWEEP (ARCH-CRON-SCHEDULER-RELIABILITY >16h no-heartbeat + BA-VN-MACRO-TOOLING parked). === HELD (unchanged): S2 07-06 methodology brief; F3 cronJobCount; VMT-3a-PMI; ops/infra lane (FIX-SBV-FX-VPS-FETCHER-UNHEALTHY + FIX-NEWS-VPS-CRASH-LOOP + OPS-POLLNEWS-NIGHT-ZERO + tinyproxy ACL-open); 2x context-bloat; FIX-FB-POSTER-NOARG-MARKET-TOOLS; Monday market-day gate (ARCH-CRON G1/G2/G3 + F-EOD); release batch CTG/VCB/D2D BLOCKED on bug #2776. Commit explicit path only."
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
