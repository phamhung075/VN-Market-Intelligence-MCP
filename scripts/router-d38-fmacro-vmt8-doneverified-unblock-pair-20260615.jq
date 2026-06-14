# Router dev-team — LIVE-VERIFY GREEN (router independent raw re-probe, NOT ops badge):
#   F-MACRO-FETCH-DEADLINE done->done_verified + VMT-8 done->done_verified (its blocking live gate satisfied)
#   + unblock HELD-sequenced pair F-BOP-ENCODING + F-NSO-SELECTOR (->READY) + head ops->po.
# OPS (a7e2bcef58e1b043c) rebuilt macro-indicators (image 7df03ef2c0a1 -> c6793a0222e3, HEAD 94b49f44, 11 peers healthy, no compose down) + 2-window probe 5/5 PASS.
# ROUTER INDEPENDENT RAW RE-PROBE (3rd distinct timepoint, not the ops badge):
#   get_vn_trade_balance + get_vn_macro_indicators + get_cpi_components -> 200 degraded, is_estimate=true, blocked_reason=NSO bai-top selector stale (index fetched 85867 bytes -> proxy UP).
#   get_vn_bop -> 200 degraded, is_estimate=true, blocked_reason LITERALLY "context deadline exceeded" = FetchBudgetSec=8s bound firing (the fix working).
#   get_vn_liquidity_state -> 200 ok (local market.db + SBV HTML), honest is_estimate flags.
#   DECISIVE: at d35 PARTIAL these 4 ALL raw-timed-out (hang past gateway); NOW all bounded-200, none hang. Deterministic 8s ctx deadline, not a fast-fail window. Fail-closed honesty preserved (is_estimate never flipped true->false). Proxy UP (NSO index 85867 bytes fetched) -> NOT proxy-down; degrade = honest upstream-unavailability, bounded.
# This write (ONE atomic temp->rename): 2 tasks done->done_verified + live_verify fields; pair HELD-sequenced->READY (sequence_after satisfied); head ops->po. 0 new id-lines.
# GUARD: refuse unless head.next_agent=="ops" AND F-MACRO-FETCH-DEADLINE status=="done" AND VMT-8 status=="done".
# Usage: jq --arg now "$NOW" -f scripts/router-d38-fmacro-vmt8-doneverified-unblock-pair-20260615.jq docs/data/orch/orch-state.json
def FM: "F-MACRO-FETCH-DEADLINE";
def V8: "VMT-8-MACRO-GRACEFUL-FAILCLOSE";
def BOP: "F-BOP-ENCODING";
def NSO: "F-NSO-SELECTOR";
($ARGS.named.now) as $now
| ([.task_board.ready[]?,.task_board.backlog[]? | select(type=="object" and ((.id // "")==FM))][0]) as $fm
| ([.task_board.ready[]?,.task_board.backlog[]? | select(type=="object" and ((.id // "")==V8))][0]) as $v8
| ($now + " ROUTER-RAW-REPROBE: trade/macro/cpi/bop + liquidity ALL HTTP 200 within gateway deadline (none hang; d35 PARTIAL had these 4 raw-timeout). bop blocked_reason='context deadline exceeded' = FetchBudgetSec=8s bound firing. Proxy UP (NSO index 85867 bytes). Fail-closed honesty held. ops 2-window 5/5 + router 3rd window concur.") as $ev
| if (.head.next_agent != "ops") then error("head.next_agent != ops (\(.head.next_agent)) — refuse")
  elif ($fm == null or ($fm.status//"")!="done") then error("F-MACRO-FETCH-DEADLINE not done — refuse")
  elif ($v8 == null or ($v8.status//"")!="done") then error("VMT-8 not done — refuse")
  else . end
| def promote($id; $extra):
    if (type=="object" and ((.id // "")==$id)) then (. + {status:"done_verified", done_verified_at:$now, done_verified_by:"dev-team(router-raw-reprobe)", live_verify_evidence:$ev} + $extra) else . end;
  def unblock($id):
    if (type=="object" and ((.id // "")==$id)) then (. + {status:"READY", sequence_after:null, unblocked_at:$now, unblocked_note:"F-MACRO-FETCH-DEADLINE done_verified -> sequence satisfied. Rebase 94b49f44 before touching cache_vmt_nso.go/usecases_vmt_bop.go. F-NSO-SELECTOR likely needs ops-vps-fetch recon of the NEW NSO WordPress HTML (bai-top selector changed) first."}) else . end;
  .task_board.ready = [ .task_board.ready[]? | promote(FM; {}) | promote(V8; {}) | unblock(BOP) | unblock(NSO) ]
| .task_board.backlog = [ .task_board.backlog[]? | promote(FM; {}) | promote(V8; {}) | unblock(BOP) | unblock(NSO) ]
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "",
    next_agent: "po",
    note: "DONE_VERIFIED x2 (router independent raw re-probe, NOT ops badge): F-MACRO-FETCH-DEADLINE + VMT-8-MACRO-GRACEFUL-FAILCLOSE. ops (a7e2bcef58e1b043c) rebuilt macro-indicators (image 7df03ef2c0a1->c6793a0222e3, HEAD 94b49f44, 11 peers healthy, NO compose down) + 2-window 5/5 PASS; router 3rd-window raw re-probe CONCURS: trade/macro/cpi/bop + liquidity ALL HTTP 200 within gateway deadline, NONE hang (d35 PARTIAL had these 4 raw-timeout). bop blocked_reason='context deadline exceeded' = FetchBudgetSec=8s bound firing. Proxy UP (NSO index 85867 bytes fetched) -> NOT proxy-down; degrade=honest upstream-unavailability, bounded. Fail-closed honesty preserved (is_estimate never flipped). /goal#1 'best result' RELIABILITY layer COMPLETE for the 4 fetch tools (HONEST-on-fast-fail [VMT-8] + RELIABLY-graceful-on-hang [F-MACRO-FETCH-DEADLINE]); /goal#2 generic (single FetchBudgetSec=8 const, all use-cases). === -> head ops->po: ACCURACY pair now UNBLOCKED (READY): F-NSO-SELECTOR (restore real NSO data — bai-top selector stale, index page changed; LIKELY needs ops-vps-fetch recon of new NSO WordPress HTML FIRST, then dev-macro-indicators) + F-BOP-ENCODING (URL-encode SBV Liferay OData filter spaces; usecases_vmt_bop.go). Both rebase 94b49f44; same owner/zone -> SERIALIZE (no parallel dispatch). PO triage next dev-team tick: size + sequence + decide recon-first for NSO. === HELD (unchanged): S2 07-06 methodology brief (agent-father greenlit, sequenced-after-incident); F3 cronJobCount (dev-mcp-server low); VMT-3a-PMI blocked-probe5; FIX-SBV-FX-VPS-FETCHER-UNHEALTHY + FIX-NEWS-VPS-CRASH-LOOP + OPS-POLLNEWS-NIGHT-ZERO (ops/infra lane); tinyproxy ACL-open hardening (ops); 2x context-bloat (maintenance lane); FIX-FB-POSTER-NOARG-MARKET-TOOLS; Monday 2026-06-15 market-day gate (ARCH-CRON G1/G2/G3 + F-EOD LIVE re-verify). Commit explicit path only."
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
