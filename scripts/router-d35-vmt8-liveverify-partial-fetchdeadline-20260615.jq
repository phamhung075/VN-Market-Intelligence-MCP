# Router dev-team — VMT-8 LIVE-VERIFY (ops a3915addef096b8ac rebuild + ROUTER INDEPENDENT RAW re-probe). Result = PARTIAL.
# Keeps VMT-8 status=done (code merge-gated + correct); does NOT promote to done_verified — live endpoint-green BLOCKED on a separate root.
# head ops->po: route F-MACRO-FETCH-DEADLINE (the completion of /goal#1 for these endpoints) + append ONE signal row.
#
# ROUTER INDEPENDENT RAW-VERIFY (not the ops badge — ops claimed 4/5 PASS; router re-probe CONTRADICTS, then disambiguates):
#   - Container RAW-confirmed: macro-indicators running image 7df03ef2c0a1 (NEW, Up ~5m, healthy), 7a176a44 on HEAD; 12 peers healthy; no compose down.
#   - VPS proxy :3128 RAW-PROVEN ALIVE+FAST right now: curl -x 125.212.251.27:3128 -> HTTP 200, connect 0.18s total 0.5s from router France host. So NOT proxy-down.
#   - Router gateway re-probe 23:13Z (independent of ops 23:05Z): get_vn_liquidity_state -> 200 honest (local market.db, no proxy). get_vn_trade_balance + get_vn_macro_indicators + get_cpi_components + get_vn_bop -> ALL TIMEOUT. (ops at 23:05Z caught a fast-fail window where NSO returned its index page quickly -> selector failed fast -> VMT-8 degraded 200; 8min later the NSO/SBV origin is slow -> fetch HANGS.)
#   - ROOT CAUSE (router-diagnosed, corroborates+generalizes ops' own bop note "Fetch blocks indefinitely, exceeding the handler's context deadline"):
#       UNBOUNDED UPSTREAM FETCH. macro-indicators has no per-fetch context deadline shorter than the gateway timeout. When the NSO origin (trade/macro/cpi) or SBV Liferay (bop) is slow, uc.fetcher.Fetch(ctx,...) blocks past the gateway deadline -> gateway TIMEOUT before VMT-8's degrade path can emit its 200. VMT-8 degrades only on a FAST fetch-ERROR; it cannot rescue a HANG.
#   - VMT-8 CODE remains CORRECT + GENERIC: the 500->degraded-200 conversion is proven live (ops captured real degraded-200 JSON for trade/macro/cpi in the fast-fail window) + unit G2 (DegradedUpstream->HTTP200) re-run uncached + liquidity honesty invariants live. VMT-8 did NOT regress; the hang is a pre-existing defect OUT OF VMT-8's authored scope.
# VERDICT: VMT-8 = done (correct fix, merge gate satisfied, degrade path live-demonstrated). NOT done_verified — endpoint live-green for the 4 fetch-dependent tools is BLOCKED on F-MACRO-FETCH-DEADLINE. Honest: ship the completion, not the slice.
#
# This write (ONE atomic temp->rename): VMT-8 stays done + live_verify_* fields; head ops->po; append ONE signal row to PO. 0 new task id-lines.
# GUARD: refuse unless head.next_agent=="ops" AND VMT-8 status=="done".
# Usage: jq --arg now "$NOW" --arg sigid "$SIGID" -f scripts/router-d35-vmt8-liveverify-partial-fetchdeadline-20260615.jq docs/data/orch/orch-state.json
def VMT8: "VMT-8-MACRO-GRACEFUL-FAILCLOSE";
($ARGS.named.now) as $now
| ($ARGS.named.sigid) as $sigid
| ([.task_board.backlog[]? | select(type=="object" and ((.id // "")==VMT8))][0]) as $v8
| if (.head.next_agent != "ops") then error("head.next_agent != ops (\(.head.next_agent)) — refuse")
  elif ($v8 == null) then error("VMT-8 not found in backlog — refuse")
  elif (($v8.status // "") != "done") then error("VMT-8 status != done (\($v8.status)) — refuse")
  else . end
| .task_board.backlog = [
    .task_board.backlog[]
    | if (type=="object" and ((.id // "")==VMT8))
        then (. + {
          live_verify_at: $now,
          live_verify_agent: "ops a3915addef096b8ac + router-raw-reprobe",
          live_verify_result: "PARTIAL. Container RAW-confirmed fresh (image 7df03ef2c0a1, Up~5m, 7a176a44, 12 peers healthy). VMT-8 degrade path LIVE-PROVEN: ops captured real degraded-200 (status=degraded+is_estimate=true+blocked_reason) for trade/macro/cpi in a fast-fail window + liquidity 200 honest + unit G2 DegradedUpstream->HTTP200 re-run. BUT router independent raw gateway re-probe 23:13Z = trade/macro/cpi + bop ALL TIMEOUT (only liquidity 200, local market.db). VPS :3128 RAW-proven alive+fast (curl 200, 0.5s) -> NOT proxy-down. ROOT = UNBOUNDED upstream fetch: no per-fetch ctx deadline < gateway timeout, so slow NSO/SBV origin -> Fetch HANGS past gateway deadline -> timeout before VMT-8 can emit degraded-200 (corroborates ops' own bop diagnosis, generalized to all 4 fetch tools). VMT-8 code correct+generic, did NOT regress; hang is pre-existing + out-of-scope. done_verified WITHHELD — endpoint live-green BLOCKED on F-MACRO-FETCH-DEADLINE.",
          live_verify_followup: "F-MACRO-FETCH-DEADLINE"
        })
        else . end
  ]
| .signal_queue.rows += [ {
    id: $sigid,
    from: "dev-team",
    to: "po",
    type: "live-verify-partial + dev-zone-rootcause(fetch-deadline) — BLOCKING /goal#1",
    severity: "HIGH",
    status: "NEW",
    summary: "VMT-8 LIVE-VERIFY = PARTIAL (router RAW re-probe, NOT the ops 4/5 badge). ops caught a fast-fail window (4/5 degraded-200); router re-probe 8min later = trade/macro/cpi + bop ALL TIMEOUT, only liquidity 200. Container RAW-fresh (7df03ef2c0a1, 7a176a44) + VPS :3128 RAW-alive (curl 200 0.5s) -> NOT proxy-down. NEW ROOT CAUSE [F-MACRO-FETCH-DEADLINE]: macro-indicators upstream fetches (NSO Excel for trade/macro/cpi; SBV Liferay for bop) have NO per-fetch context deadline shorter than the gateway timeout. When the origin is slow, uc.fetcher.Fetch(ctx,...) HANGS past the gateway deadline -> gateway TIMEOUT before VMT-8's degrade path can emit its 200. VMT-8 degrades only on a FAST fetch-ERROR; it cannot rescue a HANG. This is the TRUE completion of /goal#1 'best result' for these endpoints — VMT-8 made them HONEST-on-fast-fail; F-MACRO-FETCH-DEADLINE makes them RELIABLY-graceful-on-hang. PO: mint F-MACRO-FETCH-DEADLINE (zone=apps/macro-indicators, owner=dev-macro-indicators, GENERIC across all 5 use-cases /goal#2 — bound every upstream fetch with an http.Client{Timeout}/context deadline ~8s < gateway timeout so a hang converts to a fast ctx.DeadlineExceeded that VMT-8's existing degrade path catches -> 200). This ABSORBS the standalone bop-timeout from signal dev-team-20260614T225734Z (same root). STACK ORDER on apps/macro-indicators (serialize, same files): VMT-8(done) -> F-MACRO-FETCH-DEADLINE(reliability, this) -> F-BOP-ENCODING + F-NSO-SELECTOR(accuracy, restore real data). VMT-8 itself = done (code correct, merge-gated, degrade path live-proven); done_verified WITHHELD pending F-MACRO-FETCH-DEADLINE.",
    payload_ref: "ops notebook 13630170; router raw re-probe 23:13Z (3x NSO-tool timeout + bop timeout, liquidity 200); VPS :3128 curl 200 0.5s; container image 7df03ef2c0a1 Up~5m",
    disposition: "",
    ts: $now
  } ]
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "VMT-8-MACRO-GRACEFUL-FAILCLOSE",
    next_agent: "po",
    note: "VMT-8-MACRO-GRACEFUL-FAILCLOSE LIVE-VERIFY = PARTIAL (router RAW re-probe, NOT the ops 4/5 badge). Container RAW-fresh (macro-indicators image 7df03ef2c0a1 Up~5m, 7a176a44, 12 peers healthy, no compose down). VMT-8 degrade path LIVE-PROVEN (ops captured real degraded-200 for trade/macro/cpi in fast-fail window + liquidity 200 honest + unit G2 re-run) -> VMT-8 code = done, CORRECT, generic, did NOT regress. BUT router independent gateway re-probe 23:13Z = trade/macro/cpi + bop ALL TIMEOUT (only liquidity 200, local market.db); VPS :3128 RAW-proven alive+fast (curl 200 0.5s) so NOT proxy-down. ROOT = UNBOUNDED upstream fetch (no per-fetch ctx deadline < gateway timeout -> slow NSO/SBV origin -> Fetch HANGS past gateway deadline -> timeout before degrade path emits; corroborates+generalizes ops' bop diagnosis). done_verified WITHHELD. === -> head ops->po: PO TRIAGE (next dev-team tick): (1) MINT F-MACRO-FETCH-DEADLINE (apps/macro-indicators, dev-macro-indicators, GENERIC /goal#2 — bound every upstream fetch http.Client{Timeout}/ctx deadline ~8s < gateway timeout so HANG -> fast ctx.DeadlineExceeded -> VMT-8 degrade path -> 200; ABSORBS the standalone bop-timeout). This is the COMPLETION of /goal#1 'best result' for the 4 fetch tools. (2) STACK ORDER on apps/macro-indicators (serialize same files): VMT-8(done) -> F-MACRO-FETCH-DEADLINE(reliability) -> F-BOP-ENCODING + F-NSO-SELECTOR(accuracy). (3) PO also holds signal dev-team-20260614T225734Z-vps-cluster-reconcile (NEW): reconcile other-3 VPS tasks individually + proxy-ACL security note. === PARALLEL DONE: F1 VPS :3128 RESOLVED (VPS-AVAIL-02-FIX resolved, b1390d66, proxy RAW-proven). === HELD: F3 cronJobCount (dev-mcp-server low); S2 07-06 methodology brief (agent-father greenlit, sequenced-after-incident); context-bloat ops.md prune. VMT-3a-PMI blocked-probe5. Commit explicit path only."
  }
| .signal_queue._updated_at = $now
| .signal_queue._updated_by = "dev-team"
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
