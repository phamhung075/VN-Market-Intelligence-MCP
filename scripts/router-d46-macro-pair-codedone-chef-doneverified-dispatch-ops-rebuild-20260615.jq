# Router dev-team — Step 3/4: record this tick's outcomes from PO BATCH (a7006b6a triage) + dispatch ops rebuild.
#  Macro pair CODE-DONE bundled in ONE commit 4c2fcb5c (router RAW-verified GREEN, NOT dev badge):
#    F-BOP-QUERY-RECON  : ready[] READY -> done (struct tag items->articles + drop quarter date-range; recon ops-vps-fetch a8e56c95)
#    FIX-NSO-TRADE-SHEET : MINT -> done (content-based A1-header sheet selection; recon ops ac161be3)
#    Both done_verified WITHHELD pending ops macro-indicators force-recreate + LIVE real-data verify.
#  FIX-CHEF-INTRADAY-MARKER-CADENCE : MINT -> done_verified (agent-father 7843045c, flow-doc, no rebuild; router RAW-verified diff).
#  Signals: sau-d4 DISMISS (PO LOW); 3 source signals RESOLVED; cired-push-blocked -> in_progress (PO AUTHORIZED, router executing push this tick).
#  head -> next_agent ops (force-recreate macro-indicators + LIVE-verify get_vn_bop + get_vn_trade_balance >=2 windows).
# GUARD: refuse unless F-BOP-QUERY-RECON status==READY AND neither minted id already present.
# Usage: jq --arg now "$NOW" --arg dev "$DEV" -f scripts/router-d46-...jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ($ARGS.named.dev) as $dev
| ("RAW-VERIFIED (router independent, NOT dev badge): 4c2fcb5c on main HEAD; commit = 4 files apps/macro-indicators/pkg/infrastructure/{parsers_vmt_bop.go,parsers_vmt_bop_test.go,parsers_vmt_trade.go,parsers_vmt_trade_test.go} ONLY, orch-state NOT captured, foreign-capture NONE; independent UNCACHED go build ./... rc=0 + go vet ./pkg/... rc=0 + go test -count=1 ./pkg/infrastructure PASS 8.861s. FIX1 BOP quarter-generic: struct tag items->articles (live SBV Liferay key — THE 0-items cause), BuildBOPFetchURL ignores quarter params -> single URL filter `status eq 0 and Date48362898 gt ''` + sort datePublished:desc, dedup by articleId, articles[0] (TestBuildBOPFetchURL_QuarterParamsIgnored). FIX2 trade sheet-label-generic: selectSheetsByContent matches A1 Vietnamese headers xuat khau/nhap khau/dau tu, NO hardcoded sheet name, fail-loud on 0 match (TestSelectSheetsByContent spaced '14. XK'/'15. NK' + OldNamesNoSpace + FailLoudOnMissingPattern). Recon: BOP ops-vps-fetch a8e56c95 docs/vps-sources/vmt-sbv-bop-probe/recon.md; NSO ops ac161be3 docs/vps-sources/nso-monthly-excel/recon-trade-sheet.md. CODE merge gate satisfied; LIVE-verify pending ops macro-indicators force-recreate (parser change needs new image).") as $V
| ([.task_board.ready[]?|select(.id=="F-BOP-QUERY-RECON")][0]) as $bop
| if ($bop==null or ($bop.status//"")!="READY") then error("F-BOP-QUERY-RECON not READY (\($bop.status//"missing")) — refuse")
  elif ([..|objects|select(.id?=="FIX-NSO-TRADE-SHEET")]|length>0) then error("FIX-NSO-TRADE-SHEET already exists — refuse")
  elif ([..|objects|select(.id?=="FIX-CHEF-INTRADAY-MARKER-CADENCE")]|length>0) then error("FIX-CHEF-INTRADAY-MARKER-CADENCE already exists — refuse")
  else . end
| {
    id:"FIX-NSO-TRADE-SHEET", type:"FIX",
    title:"FIX-NSO-TRADE-SHEET — get_vn_trade_balance: NSO monthly customs Excel sheet labels drift ('14. XK'/'15. NK' spaced) -> select export/import/FDI sheets by A1-header content, not hardcoded label",
    zone:"apps/macro-indicators/", owner:"dev-macro-indicators", owner_agent:"dev-macro-indicators",
    status:"done", priority:"medium", size:"S", recon_first:true,
    root_cause:"parsers_vmt_trade.go hardcoded sheet names 14.XK/15.NK/12.FDI; current NSO Excel labels '14. XK'/'15. NK' (space after period) -> 'sheet 14.XK not found' -> trade degraded. Labels drift month-to-month.",
    fix_spec:"STEP1 ops recon ac161be3 (19 sheets enumerated; A1 headers 'xuat khau'/'nhap khau'/'dau tu'). STEP2 dev-macro 4c2fcb5c selectSheetsByContent — content-match A1 header (diacritic-insensitive), fail-loud on 0 matches. Generic /goal#2 (no hardcoded sheet label).",
    verification_gate:"get_vn_trade_balance returns real export/import (non-zero, real period) LIVE post macro-indicators rebuild.",
    baseline_pass:"4c2fcb5c", done_at:$now, done_commit:"4c2fcb5c", done_agent:$dev, recon_agent:"ac161be391f2c3c6e",
    source_signal:"dev-team-20260615T020049Z-nso-trade-sheet-followon",
    created_at:$now, created_by:"po", triaged_by:"po", router_reverify_verdict:$V,
    status_note:"CODE DONE (bundled 4c2fcb5c with F-BOP-QUERY-RECON). done_verified WITHHELD pending ops macro-indicators force-recreate + LIVE get_vn_trade_balance real data (>=2 timing windows)."
  } as $nso
| {
    id:"FIX-CHEF-INTRADAY-MARKER-CADENCE", type:"FIX",
    title:"FIX-CHEF-INTRADAY-MARKER-CADENCE — chef.md Step 0.5 publish-marker key+TTL derive from slot cron cadence (multi-fire -> per-hour key+cadence TTL; single-fire -> per-date 28h)",
    zone:"docs/agents/", owner:"agent-father", owner_agent:"agent-father",
    status:"done_verified", priority:"low", size:"XS",
    root_cause:"chef.md marker key 'published:'+SLOT+':'+DATE ttl 28h blocks chef-intraday (cron '13 2-8 * * 1-5' = 7 fires/day) after first fire -> 'cadence skip' churn logged every tick; intraday could publish only once/day.",
    fix_spec:"agent-father 7843045c: IS_MULTI_FIRE derived from cron hour field (range/list/step -> multi-fire); multi-fire key+':'+VN_HOUR ttl=cadence(3600); single-fire unchanged. Reads cowork-schedule cron, no chef-intraday name special-case. Generic /goal#2.",
    verification_gate:"chef-intraday publishes per qualifying hourly window next market day (flow-doc — next cron reads chef.md, NO container rebuild).",
    baseline_pass:"7843045c", done_at:$now, done_commit:"7843045c", done_agent:"agent-father",
    done_verified_at:$now,
    done_verified_note:"Flow-doc logic RAW-verified by router: 7843045c = 2 files (chef.md + agent-father.md notebook) ONLY, no orch-state/foreign. Diff: cron-hour-field-derived granularity; 3 daily slots unchanged (chef-morning '5'/eod '8'/evening '19' fixed-hour -> per-date 28h; only chef-intraday '2-8' -> per-hour key + 3600s TTL). No rebuild (next chef-intraday cron reads chef.md). Live-confirm on next chef-intraday tick today.",
    source_signal:"cowork-team-20260615T0324Z-chef-intraday-claim-cadence-churn",
    created_at:$now, created_by:"po", triaged_by:"po",
    status_note:"DONE + done_verified (flow-doc, no rebuild)."
  } as $chef
| .task_board.ready = (
    [ .task_board.ready[]?
      | if .id=="F-BOP-QUERY-RECON"
        then . + {status:"done", done_at:$now, done_commit:"4c2fcb5c", done_agent:$dev, recon_agent:"a8e56c959e0a41a8d", router_reverify_verdict:$V,
                  status_note:"CODE DONE (bundled 4c2fcb5c). BUG1 struct tag items->articles (live SBV Liferay key) = THE 0-items cause; BUG2 drop quarter date-range -> status eq 0 + Date48362898 gt '' + sort datePublished:desc + dedup articleId + articles[0]. done_verified WITHHELD pending ops macro-indicators force-recreate + LIVE get_vn_bop real BOP fields (>=2 timing windows)."}
        else . end ]
    + [ $nso, $chef ]
  )
| .signal_queue.rows = [ .signal_queue.rows[]?
    | if (.id=="sau-d4-202606150300") then . + {status:"RESOLVED", resolved_at:$now, resolved_by:"dev-team", resolution:"DISMISS (PO triage a7006b6a, LOW): task_list_held-empty is expected after router withheld CI-RED done_verified + cleared WIP; head.active_task_id=CI-RED correct; self-resolves on CI-RED done_verified."}
      elif (.id=="dev-team-20260615T020049Z-nso-trade-sheet-followon") then . + {status:"RESOLVED", resolved_at:$now, resolved_by:"dev-team", resolution:"Minted FIX-NSO-TRADE-SHEET; recon ops ac161be3 + code 4c2fcb5c (content-based A1-header sheet selection). done_verified pending ops rebuild + live."}
      elif (.id=="cowork-team-20260615T0324Z-chef-intraday-claim-cadence-churn") then . + {status:"RESOLVED", resolved_at:$now, resolved_by:"dev-team", resolution:"FIX-CHEF-INTRADAY-MARKER-CADENCE done_verified (agent-father 7843045c, flow-doc): cadence-derived marker granularity. No rebuild."}
      elif (.id=="dev-team-20260615T0235Z-cired-done-ci-push-blocked") then . + {status:"in_progress", acked_at:$now, acked_by:"dev-team", resolution:"PO AUTHORIZED (triage a7006b6a): 7-behind = ALL benign cloud chores (6x health + 1x tnb-audit), file-disjoint from local code/orch-state/cowork-schedule -> conflict-free reconcile. Router executing THIS tick: pnpm --filter vn-market check -> git merge origin/main -> push -> GitHub Actions re-runs SHA != d20468c0 green -> THEN promote CI-RED-d20468c0-FIX done_verified."}
      else . end ]
  | .head = {
      status:"active", updated_at:$now, updated_by:"dev-team",
      active_task_id:"F-BOP-QUERY-RECON", next_agent:"ops",
      note:"MACRO ACCURACY PAIR CODE-DONE (dev-macro-indicators \($dev), ONE commit 4c2fcb5c, router RAW-verified GREEN independent: on-main HEAD; 4 files apps/macro-indicators/pkg/infrastructure ONLY; foreign-capture NONE; orch-state NOT captured; UNCACHED go build/vet rc=0 + go test -count=1 ./pkg/infrastructure PASS 8.861s; FIX1 BOP quarter-generic items->articles tag + drop date-range + dedup + articles[0]; FIX2 trade sheet-label-generic selectSheetsByContent A1-header match fail-loud; /goal#2). === -> head dev->ops: FORCE-RECREATE macro-indicators single service (memory rebuild-after-dev-change; NEVER compose down — kills peers ~21min); verify new image ID + 4c2fcb5c on HEAD + peers healthy. Then LIVE-verify via gateway re-probe (NOT badges) ACROSS >=2 TIMING WINDOWS (fast-fail-window trap): get_vn_bop must return REAL BOP fields (canCanTongThe/canCanVangLai etc non-zero, real quarter — NOT blocked_reason=0 items) AND get_vn_trade_balance must return REAL export/import (non-zero, real period — NOT 'sheet not found' degraded). On ops live-result -> ROUTER re-probes each tool ITSELF across timing (not ops badge) + disambiguates proxy-down vs upstream-empty. If router live-green (REAL data): promote F-BOP-QUERY-RECON + FIX-NSO-TRADE-SHEET done_verified + promote F-BOP-ENCODING done_verified (real-data restored) + F-NSO-SELECTOR stays done_verified + release SF-1. If still degraded/empty after rebuild: keep done, WITHHOLD done_verified, route accuracy root to ops-vps-fetch LIVE recon (NOT a dev guess). === FIX-CHEF-INTRADAY-MARKER-CADENCE DONE+done_verified (agent-father 7843045c, flow-doc, NO rebuild — next chef-intraday cron reads chef.md; live-confirm next tick today). === CI-RED-d20468c0-FIX (status done, c79ce6bd): PO AUTHORIZED origin reconcile+push (sig cired-push-blocked -> in_progress); 7-behind ALL benign cloud chores file-disjoint from local -> conflict-free; router executing this tick (pnpm check -> git merge origin/main -> push -> CI re-run SHA != d20468c0 green -> promote done_verified). NOT a force-push. === sau-d4-202606150300 DISMISSED (PO LOW). === ZOMBIE SWEEP (PO RAW-flag): ARCH-CRON-SCHEDULER-RELIABILITY in_progress dispatched_to=null >16h no-heartbeat + BA-VN-MACRO-TOOLING parked architect-probefold-done — neither holds active dev lane; sweep next tick. === HELD (unchanged): S2 07-06 methodology brief (agent-father); F3 cronJobCount (dev-mcp-server low); VMT-3a-PMI blocked-probe5; FIX-SBV-FX-VPS-FETCHER-UNHEALTHY + FIX-NEWS-VPS-CRASH-LOOP + OPS-POLLNEWS-NIGHT-ZERO + tinyproxy ACL-open (ops/infra lane); 2x context-bloat (maintenance lane); FIX-FB-POSTER-NOARG-MARKET-TOOLS; Monday market-day gate (ARCH-CRON G1/G2/G3 + F-EOD LIVE re-verify); release batch CTG/VCB/D2D BLOCKED on undeployed bug #2776 (signal #6120). Commit explicit path only."
    }
  | ._updated_at=$now | ._updated_by="dev-team"
  | .task_board._updated_at=$now | .task_board._updated_by="dev-team"
