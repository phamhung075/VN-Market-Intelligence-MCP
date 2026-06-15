# Router dev-team — F-NSO-SELECTOR done->done_verified (selector root LIVE-verified, router independent 3rd-timepoint raw re-probe, NOT ops badge)
#   + unblock F-BOP-QUERY-RECON (sequence_after satisfied) + append PO signal to mint FIX-NSO-TRADE-SHEET (distinct newly-exposed root) + head ops->po.
# OPS (ae38b62f2b59e8633): force-recreated + REBUILT macro-indicators single svc (image 27b2ccd5d2c3 -> 45ba10db1717, NEW; CA cert globalsign-rsa-ov-ssl-ca-2018.crt in-image 1554B + merged into ca-certificates.crt; 13 peers healthy; NO compose down). 2-window probe: macro+cpi REAL, trade degraded.
# ROUTER INDEPENDENT RAW RE-PROBE (3rd distinct timepoint 01:58:19-20Z, NOT the ops badge):
#   get_vn_macro_indicators -> status=ok, is_estimate=false, REAL (IIP all_industry 103.3/108.8/109.1 + manufacturing + electricity all real), source sheet '2.IIPthang' PROBE-3 PASS.
#   get_cpi_components       -> status=ok, is_estimate=false, REAL (CPI mom 105.6 / avg_ytd_yoy 103.61), source sheet '16.CPI' PROBE-3 PASS (weights honestly is_estimate=true — from methodology PDF not Excel; not a degradation).
#   get_vn_trade_balance     -> status=degraded, is_estimate=true, ALL ZERO, blocked_reason="trade_parser: sheet \"14.XK\" not found or unreadable: sheet 14.XK does not exist".
#   STABLE across 3 consistent timepoints (ops w1 ~01:55, ops w2 01:56:53, router 01:58:19) -> NOT a fast-fail-window artifact.
# VERDICT: F-NSO-SELECTOR stated root (stale bai-top DISCOVERY selector + missing CA intermediate) = FIXED + LIVE-verified. PROOF: macro + cpi restored to REAL data through the EXACT discovery->download->parse path the fix (74dfdb0a) repaired (0 matches before -> real now; CA cert lets the HTTPS xlsx fetch complete). The selector root is definitively resolved -> done_verified.
#   trade_balance remains degraded on a CATEGORICALLY DISTINCT, NEWLY-EXPOSED root: customs sheets '14.XK'(exports)+'15.NK'(imports) absent from the current NSO monthly Excel = trade_parser sheet-name mismatch (DOWNSTREAM of discovery). It was MASKED by the opaque-500 (when discovery returned 0 ALL 3 degraded identically; now discovery works, trade reveals its OWN parse bug). NOT a selector regression nor selector incompleteness -> a SECOND root = new task FIX-NSO-TRADE-SHEET (PO to mint; generic: derive customs sheet by content/pattern, NOT hardcode '14.XK'/'15.NK' — file the live xlsx is now reachable so recon = list its actual sheet names). honest: done_verified the selector scope, carry the distinct root forward, NEVER over-claim 'all 3 real'.
# This write (ONE atomic temp->rename): F-NSO done->done_verified + live_verify fields; F-BOP-QUERY-RECON sequence_after cleared (now actionable); append ONE PO signal; head ops->po. 0 new task id-lines (PO mints FIX-NSO-TRADE-SHEET).
# GUARD: refuse unless head.next_agent=="ops" AND F-NSO-SELECTOR status=="done" AND done_commit=="74dfdb0a".
# Usage: jq --arg now "$NOW" --arg sigid "$SIGID" -f scripts/router-d44-fnso-doneverified-trade-sheet-followon-20260615.jq docs/data/orch/orch-state.json
def NSO: "F-NSO-SELECTOR";
def FBOP: "F-BOP-QUERY-RECON";
($ARGS.named.now) as $now
| ($ARGS.named.sigid) as $sigid
| ([.. | objects | select(.id?==NSO)][0]) as $n
| if (.head.next_agent != "ops") then error("head.next_agent != ops (\(.head.next_agent)) — refuse")
  elif ($n==null) then error("F-NSO-SELECTOR not found — refuse")
  elif (($n.status//"")!="done") then error("F-NSO-SELECTOR status != done (\($n.status//"missing")) — refuse")
  elif (($n.done_commit//"")!="74dfdb0a") then error("F-NSO-SELECTOR done_commit != 74dfdb0a (\($n.done_commit//"missing")) — refuse")
  else . end
| ("LIVE-VERIFIED (router independent 3rd-timepoint raw re-probe 01:58:19-20Z, NOT ops badge; ops ae38b62f rebuilt macro-indicators 27b2ccd5d2c3->45ba10db1717, CA cert in-image, 13 peers healthy). SELECTOR ROOT FIXED: get_vn_macro_indicators status=ok is_estimate=false REAL (IIP 103.3/108.8/109.1 sheet 2.IIPthang PROBE-3 PASS) + get_cpi_components status=ok is_estimate=false REAL (CPI 105.6/103.61 sheet 16.CPI PROBE-3 PASS) — restored through the exact bai-top discovery->download->parse path 74dfdb0a repaired (0 matches before; CA intermediate lets HTTPS xlsx fetch complete). STABLE 3 timepoints. trade_balance STILL degraded on a DISTINCT downstream root (customs sheet 14.XK/15.NK absent from current NSO Excel — trade_parser sheet-name mismatch, masked by the prior opaque-500) -> carried to FIX-NSO-TRADE-SHEET (PO to mint, generic sheet-by-pattern). done_verified = selector scope ONLY; trade explicitly NOT restored.") as $lv
| def promote($id):
    if (type=="object" and ((.id // "")==$id))
      then (. + {status:"done_verified", done_verified_at:$now, done_verified_by:"dev-team(router-raw-reprobe-3tp)", live_verify_result:$lv, live_verify_followup:"FIX-NSO-TRADE-SHEET (PO to mint; distinct root — customs sheet 14.XK/15.NK parse)"})
      else . end;
  def unblock($id):
    if (type=="object" and ((.id // "")==$id))
      then (. + {sequence_after:null, unblocked_at:$now, unblocked_note:"F-NSO-SELECTOR done_verified (selector root live-fixed) -> sequence_after satisfied. F-BOP-QUERY-RECON now actionable: recon-first ops-vps-fetch curls SBV Liferay OData endpoint (scopeKey 20117 / contentStructureId 10063168 / filter field Date48362898 / status eq 0 / date-range) until real BOP articles return, THEN dev-macro-indicators fixes parsers_vmt_bop.go query params. PO triage next tick (WIP: CI-RED still in flight)."})
      else . end;
  .task_board = ( .task_board | walk(
      if (type=="object" and (.id?==NSO)) then promote(NSO)
      elif (type=="object" and (.id?==FBOP)) then unblock(FBOP)
      else . end) )
| .signal_queue.rows += [ {
    id: $sigid,
    from: "dev-team",
    to: "po",
    type: "live-verify-partial-bundle + new-root follow-on — /goal#1 accuracy + /goal#2 generic",
    severity: "MEDIUM",
    status: "NEW",
    summary: "F-NSO-SELECTOR DONE_VERIFIED (selector root live-fixed: get_vn_macro_indicators + get_cpi_components REAL across 3 router-raw timepoints, image 45ba10db1717). BUT get_vn_trade_balance STILL degraded on a DISTINCT newly-exposed root: blocked_reason='trade_parser: sheet 14.XK not found ... sheet 14.XK does not exist'. The selector fix exposed (un-masked) trade's own customs-sheet parse bug — sheets '14.XK'(exports)/'15.NK'(imports) are absent from the current NSO monthly Excel (the file downloads fine now — macro/cpi parse it). PO ACTION: MINT FIX-NSO-TRADE-SHEET (zone apps/macro-indicators; root = trade_parser sheet-name mismatch in NSO customs Excel). RECON-CHEAP: the xlsx is now reachable in-container, so first step = list the actual sheet names in the current NSO monthly Excel (dev-macro-indicators can inspect the live file, or ops-vps-fetch recon). FIX must be GENERIC /goal#2: derive the customs export/import sheet by content/pattern (e.g. fuzzy 'XK'/'NK' or position), NOT hardcode '14.XK'/'15.NK' (the numeric prefix evidently drifts month-to-month). ALSO: F-BOP-QUERY-RECON now UNBLOCKED (sequence_after cleared) — triage/dispatch next tick (recon-first ops-vps-fetch SBV Liferay OData). Hold both for WIP — CI-RED-d20468c0-FIX still in flight (dev-mcp-server ad7c357d).",
    payload_ref: "ops ae38b62f (image 45ba10db1717, CA cert in-image, 13 peers, 2-window macro+cpi REAL / trade degraded); router raw 3rd-timepoint 01:58:19-20Z concurs (macro ok/real, cpi ok/real, trade degraded 'sheet 14.XK not found'); F-NSO commit 74dfdb0a",
    disposition: "",
    ts: $now
  } ]
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "",
    next_agent: "po",
    note: "F-NSO-SELECTOR DONE_VERIFIED (router independent 3rd-timepoint raw re-probe 01:58:19-20Z, NOT ops badge). ops (ae38b62f2b59e8633) force-recreated + REBUILT macro-indicators single svc (image 27b2ccd5d2c3->45ba10db1717 NEW, CA cert globalsign-rsa-ov-ssl-ca-2018.crt in-image 1554B + merged, 13 peers healthy, NO compose down). SELECTOR ROOT LIVE-FIXED: get_vn_macro_indicators (IIP 103.3/108.8/109.1 sheet 2.IIPthang) + get_cpi_components (CPI 105.6/103.61 sheet 16.CPI) BOTH status=ok is_estimate=false REAL across 3 consistent timepoints — restored through the exact bai-top discovery->download->parse path 74dfdb0a repaired (absolute-URL regex + CA intermediate). /goal#1 RELIABILITY+ACCURACY achieved for the 2 discovery-only NSO tools; /goal#2 generic (regex captures any YYYY/MM). === REMAINING (distinct root, NOT a selector regression): get_vn_trade_balance still degraded — blocked_reason='trade_parser: sheet 14.XK not found ... does not exist'. Customs sheets '14.XK'(exports)/'15.NK'(imports) absent from current NSO monthly Excel (downstream parse bug, MASKED by the prior opaque-500, exposed now that discovery works). -> head ops->po: PO MINT FIX-NSO-TRADE-SHEET (apps/macro-indicators; trade_parser sheet-name mismatch; GENERIC /goal#2 derive sheet by content/pattern NOT hardcode 14.XK/15.NK; recon-cheap — xlsx reachable in-container, list actual sheet names first). === ALSO UNBLOCKED: F-BOP-QUERY-RECON (sequence_after=F-NSO-SELECTOR cleared) — recon-first ops-vps-fetch SBV Liferay OData; PO triage next tick. === OTHER LANE STILL IN FLIGHT (untouched): CI-RED-d20468c0-FIX in_progress/dev-mcp-server (agent ad7c357d49c10d38e) — on return router RAW-verify gates -> ops REBUILD mcp-server (force-recreate single svc, NEVER compose down) -> CI-green-on-push (SHA != d20468c0) -> done_verified. SF-1 dev-team-cron-singleton HELD until CI-RED resolves (tick still active). === F-BOP-ENCODING stays done (done_verified WITHHELD pending F-BOP-QUERY-RECON real-data). HELD (unchanged): S2 07-06 methodology brief (agent-father); F3 cronJobCount (dev-mcp-server low); VMT-3a-PMI blocked-probe5; FIX-SBV-FX-VPS-FETCHER-UNHEALTHY + FIX-NEWS-VPS-CRASH-LOOP + OPS-POLLNEWS-NIGHT-ZERO + tinyproxy ACL-open hardening (ops/infra lane); 2x context-bloat (maintenance lane); FIX-FB-POSTER-NOARG-MARKET-TOOLS; Monday 2026-06-15 market-day gate (ARCH-CRON G1/G2/G3 + F-EOD LIVE re-verify); release batch CTG/VCB/D2D BLOCKED on undeployed bug #2776 (signal #6120). Commit explicit path only."
  }
| .signal_queue._updated_at = $now
| .signal_queue._updated_by = "dev-team"
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
