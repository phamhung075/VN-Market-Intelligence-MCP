# Router dev-team — F-BOP-ENCODING LIVE-VERIFY (ops a1b951eec29057302 rebuild + ROUTER INDEPENDENT RAW re-probe). Result = PARTIAL.
# Keeps F-BOP-ENCODING status=done (encoding fix correct + merge-gated + LIVE + deadline-exceeded ELIMINATED); does NOT promote done_verified — real-data accuracy NOT achieved.
# head ops->po: PO mints the accuracy follow-on (F-BOP-QUERY-RECON, recon-first ops-vps-fetch) + sequences the recon batch with F-NSO-SELECTOR. Append ONE signal row.
#
# OPS (a1b951eec29057302): force-recreated macro-indicators single svc (image c6793a0222e3 -> 27b2ccd5d2c3, NEW; HEAD 0b8a1de6; 400610e5 ancestor; 11/11 peers healthy; NO compose down). 2-window get_vn_bop = degraded-200, "0 items (empty)", NO deadline-exceeded.
# ROUTER INDEPENDENT RAW RE-PROBE (2 distinct windows, NOT the ops badge):
#   window-1 get_vn_bop{} + window-2 get_vn_bop{quarter:Q3-2025} -> BOTH status=degraded, is_estimate=true, HTTP 200 within gateway deadline (no hang),
#   blocked_reason LITERALLY "SBV Liferay BOP API unreachable via VPS proxy 125.212.251.27:3128: bop_parser: SBV API returned 0 items (empty response)".
#   DECISIVE: pre-fix symptom was blocked_reason="context deadline exceeded" (malformed-URL hang tripping FetchBudgetSec=8s). NOW (4 consistent probes: ops T+0, ops T+90s, router w1, router w2) = "0 items", NO deadline-exceeded. STABLE, not a fast-fail-window artifact.
#   => RELIABILITY layer (/goal#1) CONFIRMED: encoding fix eliminated the malformed-URL hang; the URL now resolves + SBV Liferay responds within deadline.
#   => ACCURACY layer NOT achieved: SBV returns 0 matching articles -> the OData query SEMANTICS (scopeKey 20117 / contentStructureId 10063168 / filter field Date48362898 / status eq 0 / date-range format) don't match what the live SBV Liferay API serves real BOP articles under. Needs ops-vps-fetch LIVE recon (curl the SBV Liferay OData endpoint from VPS with the corrected encoding, vary params, capture what returns real articles) — same recon-first shape as F-NSO-SELECTOR. dev cannot guess this.
# VERDICT: F-BOP-ENCODING = done (encoding fix CORRECT, merge-gated 400610e5, LIVE, deadline-exceeded symptom ELIMINATED, tests green). NOT done_verified — real BOP data BLOCKED on the OData-query-semantics gap. Honest: ship the completion, not the slice. (d35 VMT-8 PARTIAL precedent.)
#
# This write (ONE atomic temp->rename): F-BOP-ENCODING stays done + live_verify_* fields; F-NSO-SELECTOR sequence_after cleared (F-BOP code done+merged -> same-files rebase concern resolved, ready for PO recon-batch triage); head ops->po; append ONE signal row to PO. 0 new task id-lines (PO mints F-BOP-QUERY-RECON).
# GUARD: refuse unless head.next_agent=="ops" AND F-BOP-ENCODING status=="done".
# Usage: jq --arg now "$NOW" --arg sigid "$SIGID" -f scripts/router-d41-fbop-liveverify-partial-queryrecon-20260615.jq docs/data/orch/orch-state.json
def BOP: "F-BOP-ENCODING";
def NSO: "F-NSO-SELECTOR";
($ARGS.named.now) as $now
| ($ARGS.named.sigid) as $sigid
| ([.task_board.ready[]?,.task_board.backlog[]? | select(type=="object" and ((.id // "")==BOP))][0]) as $bop
| if (.head.next_agent != "ops") then error("head.next_agent != ops (\(.head.next_agent)) — refuse")
  elif ($bop == null) then error("F-BOP-ENCODING not found — refuse")
  elif (($bop.status // "") != "done") then error("F-BOP-ENCODING status != done (\($bop.status)) — refuse")
  else . end
| ("PARTIAL. Container RAW-confirmed fresh (image c6793a0222e3->27b2ccd5d2c3, HEAD 0b8a1de6, 400610e5 ancestor, 11/11 peers healthy, NO compose down). RELIABILITY CONFIRMED: pre-fix blocked_reason='context deadline exceeded' (malformed-URL hang tripping FetchBudgetSec=8s) is ELIMINATED across 4 consistent probes (ops T+0, ops T+90s, router w1 get_vn_bop{}, router w2 get_vn_bop{quarter:Q3-2025}) — all degraded-200 within gateway deadline, none hang. The encoding fix (url.Values{}.Encode()) made the SBV Liferay OData URL resolve. BUT real BOP data NOT returned: blocked_reason='SBV API returned 0 items (empty response)', all numeric fields 0, quarter/period empty. ROOT (accuracy gap, SEPARATE from encoding): URL now resolves + SBV responds, but the OData query SEMANTICS (scopeKey 20117 / contentStructureId 10063168 / filter field Date48362898 / status eq 0 / date-range format) match 0 live articles. Needs ops-vps-fetch LIVE recon of the SBV Liferay OData endpoint (recon-first, same shape as F-NSO-SELECTOR). done_verified WITHHELD — encoding fix correct+live (reliability) but real data blocked on query-semantics recon.") as $lv
| def mark($id):
    if (type=="object" and ((.id // "")==$id))
      then (. + {
        live_verify_at:$now,
        live_verify_agent:"ops a1b951eec29057302 + router-raw-reprobe(2 windows)",
        live_verify_result:$lv,
        live_verify_followup:"F-BOP-QUERY-RECON (PO to mint; recon-first ops-vps-fetch)"
      })
      else . end;
  def unhold($id):
    if (type=="object" and ((.id // "")==$id))
      then (. + {sequence_after:null, unblocked_at:$now, unblocked_note:"F-BOP-ENCODING code done+merged (400610e5) -> same-files (macro-indicators parsers) serialization concern resolved. Now part of the accuracy RECON BATCH (both recon-first ops-vps-fetch): F-BOP-QUERY-RECON + F-NSO-SELECTOR. PO to triage/sequence next tick."})
      else . end;
  .task_board.ready = [ .task_board.ready[]? | mark(BOP) | unhold(NSO) ]
| .task_board.backlog = [ .task_board.backlog[]? | mark(BOP) | unhold(NSO) ]
| .signal_queue.rows += [ {
    id: $sigid,
    from: "dev-team",
    to: "po",
    type: "live-verify-partial + accuracy-recon-batch — /goal#1 accuracy layer",
    severity: "MEDIUM",
    status: "NEW",
    summary: "F-BOP-ENCODING LIVE-VERIFY = PARTIAL (router RAW 2-window re-probe, NOT the ops badge). RELIABILITY DONE: encoding fix (400610e5, url.Values{}.Encode()) is LIVE (image 27b2ccd5d2c3) + eliminated the 'context deadline exceeded' malformed-URL hang across 4 consistent probes. BUT ACCURACY NOT achieved: get_vn_bop still degraded — 'SBV API returned 0 items (empty response)', all fields 0. The URL now resolves but the OData query semantics (scopeKey 20117 / contentStructureId 10063168 / filter field Date48362898 / status eq 0 / date-range) match 0 live SBV articles. PO ACTION: mint F-BOP-QUERY-RECON (zone apps/macro-indicators; recon-first ops-vps-fetch to curl the SBV Liferay OData endpoint with corrected encoding + vary params until real BOP articles return, THEN dev-macro-indicators fixes parsers_vmt_bop.go query params; /goal#2 generic). This is the SAME SHAPE as F-NSO-SELECTOR (transport OK, data empty, needs recon of live upstream). SEQUENCE both as an accuracy RECON BATCH on macro-indicators (serialize, same files, recon-first each): F-BOP-QUERY-RECON + F-NSO-SELECTOR. F-BOP-ENCODING itself = done (encoding correct, merge-gated, live, deadline-symptom gone); done_verified WITHHELD pending F-BOP-QUERY-RECON real-data restoration.",
    payload_ref: "ops report a1b951eec29057302 (image 27b2ccd5d2c3, 11/11 peers, 2-window 0-items); router raw re-probe 2 windows (get_vn_bop{} + {quarter:Q3-2025}) both degraded-200 '0 items', no deadline-exceeded; commit 400610e5 / HEAD 0b8a1de6",
    disposition: "",
    ts: $now
  } ]
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "",
    next_agent: "po",
    note: "F-BOP-ENCODING LIVE-VERIFY = PARTIAL (router independent RAW 2-window re-probe, NOT the ops badge). ops (a1b951eec29057302) force-recreated macro-indicators single svc (image c6793a0222e3->27b2ccd5d2c3, HEAD 0b8a1de6, 400610e5 ancestor, 11/11 peers healthy, NO compose down). RELIABILITY CONFIRMED: pre-fix blocked_reason='context deadline exceeded' (malformed-URL hang on 8s FetchBudgetSec) ELIMINATED across 4 consistent probes (ops T+0, ops T+90s, router w1, router w2) — all degraded-200 within gateway deadline, none hang. Encoding fix (400610e5 url.Values{}.Encode()) made the SBV Liferay OData URL resolve. BUT ACCURACY NOT achieved: get_vn_bop still degraded, 'SBV API returned 0 items (empty response)', all fields 0. ROOT (separate from encoding): URL resolves + SBV responds but OData query SEMANTICS (scopeKey 20117 / contentStructureId 10063168 / filter field Date48362898 / status eq 0 / date-range format) match 0 live articles. F-BOP-ENCODING = done (encoding correct, merge-gated 400610e5, LIVE, deadline-symptom gone, tests green); done_verified WITHHELD — real BOP data blocked on OData-query recon. === -> head ops->po: PO TRIAGE (next dev-team tick): (1) MINT F-BOP-QUERY-RECON (apps/macro-indicators; recon-first ops-vps-fetch curls SBV Liferay OData endpoint w/ corrected encoding + varies params until real BOP articles return, THEN dev-macro-indicators fixes parsers_vmt_bop.go query params; generic /goal#2). (2) SEQUENCE the accuracy RECON BATCH on macro-indicators (serialize same files, recon-first each): F-BOP-QUERY-RECON + F-NSO-SELECTOR (both: transport OK, data empty, need live upstream recon). F-NSO-SELECTOR sequence_after cleared (F-BOP code done+merged). === HELD (unchanged): S2 07-06 methodology brief (agent-father); F3 cronJobCount (dev-mcp-server low); VMT-3a-PMI blocked-probe5; FIX-SBV-FX-VPS-FETCHER-UNHEALTHY + FIX-NEWS-VPS-CRASH-LOOP + OPS-POLLNEWS-NIGHT-ZERO + tinyproxy ACL-open hardening (ops/infra lane); 2x context-bloat (maintenance lane); FIX-FB-POSTER-NOARG-MARKET-TOOLS; Monday 2026-06-15 market-day gate (ARCH-CRON G1/G2/G3 + F-EOD LIVE re-verify); release batch CTG/VCB/D2D BLOCKED on undeployed bug #2776 (signal #6120). Commit explicit path only."
  }
| .signal_queue._updated_at = $now
| .signal_queue._updated_by = "dev-team"
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
