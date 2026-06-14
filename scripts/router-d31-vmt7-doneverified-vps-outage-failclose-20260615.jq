# Router dev-team — VN-MACRO-TOOLING VMT-7 Zone-B wave LIVE-VERIFIED (router RAW-verified ops evidence, not the ops badge) -> done_verified + head ops->po.
# ops (agent a3f8cdf854aaadf90, notebook commit 540a5907) rebuilt mcp-server + macro-indicators and live-probed all 5 new tools.
# ROUTER INDEPENDENT RAW-VERIFY (not the ops badge):
#   - HEAD advanced to 0a77ae34 (bg dev-mcp-server commit reconciled toolCount SSOT 157->163 to live; proper owner, generator). 540a5907 ops notebook scope = ONLY docs/agent-memory/notebooks/ops.md (foreign-capture clean). orch-state NOT swept.
#   - Both containers FRESH: mcp-server Up ~11m (image d5cb413773...), macro-indicators Up ~16m (image 1e950eb65f...) — rebuild confirmed, peers all healthy (no compose down).
#   - MACRO_INDICATORS_URL=http://macro-indicators:5004 wired (compose, pre-existing) — verified in container env by ops; routing confirmed by macro-indicators receiving all 5 endpoint calls (logs).
#   - LIVE toolCount=163 (health endpoint, authoritative) == project-stats SSOT 163 (committed 0a77ae34). All 5 VMT-7 tools enumerable + reachable through the gateway (router re-probed each via call_tool, not ops report).
#   - get_vn_liquidity_state: LIVE-GREEN 200 — honest fail-closed fields surface (policy_rates is_estimate=true DB-fallback; sjc_gap is_estimate=true; irs is_estimate=true DD-6; omo blocked_reason+is_estimate=true; interbank_1w rate_1w_pct=null+is_estimate=true+blocked_reason Decision B). Decision A/B/DD-6 invariants LIVE-confirmed.
#   - get_vn_trade_balance / get_vn_bop / get_vn_macro_indicators / get_cpi_components: ALL return {"error":"macro-indicators service unavailable"} (router re-probed each — reproduced, not ops fabrication). ROOT CAUSE corroborated in macro-indicators logs + router-independent probe: every NSO Excel + SBV-articles fetch routes vpsFetch -> proxy 125.212.251.27:3128 -> connection refused. VPS host ALIVE (ping 0% loss 195ms) but :3128 + :443 REFUSE = squid/proxy SERVICE down on Vinahost VPS (not host outage, not a Zone-B defect, not a per-session false-negative).
# VERDICT: VMT-7 Zone-B PROXY deliverable = VERIFIED done_verified (tools wired, enumerable, routing-correct, liquidity_state fully live-green, honesty invariants surface where the data path is healthy). The proxy correctly PROPAGATES the upstream infra failure for the 4 NSO/SBV-dependent tools — that is correct proxy behavior, not a code defect.
# TWO FOLLOW-UP FINDINGS routed to PO (neither papered over):
#   (F1) ACTIVE INFRA INCIDENT — VPS squid proxy :3128 DOWN. Blast radius = ALL geo-blocked VN fetches (macro trade-balance/bop/macro/cpi NOW dark; LIKELY common root of open FIX-SBV-FX-VPS-FETCHER-UNHEALTHY + FIX-NEWS-VPS-CRASH-LOOP + OPS-POLLNEWS-NIGHT-ZERO + VPS-AVAIL-02-FIX). Router DISPATCHED ops-vps-fetch directly (urgent, infra on-call) to diagnose+restore squid + the per-source fetchers and reconcile the VPS task cluster. PO to track INC.
#   (F2) /goal#1 BEST-RESULT GAP (code) — Zone-A macro-indicators endpoints trade-balance/bop/macro-indicators/cpi-components return HTTP 500 / opaque error on upstream-fetch failure, instead of fail-closing GRACEFULLY like /liquidity-state already does (200 + is_estimate=true + blocked_reason naming the unreachable source). GENERIC across all 4 NSO/SBV endpoints (/goal#2 same-fix-all; mirror the liquidity_state pattern). zone dev-macro-indicators. PO to sequence (proposed VMT-8-MACRO-GRACEFUL-FAILCLOSE) — independent of the infra fix (resilience: even after proxy restored, transient upstream failures must degrade honestly, never opaque-500).
#   (F3 non-blocking) generator gen-project-stats.ts: committed cronJobCount=81 vs _cronJobCountNote grep-derived ~69; a transient working-tree run produced cronJobCount=2 (corrupt) before 0a77ae34 superseded it — dev-mcp-server to reconcile the cron count + harden the generator against partial writes. PO/dev-mcp-server, low priority.
# This write (ONE atomic temp->rename): 6 VMT-7 tasks done->done_verified + shared live_verify markers; head ops->po with F1/F2/F3. 0 new id-lines (no task creation — PO owns sprint task breakdown per dup-key lesson d28).
# GUARD: refuse unless head.next_agent=="ops" AND all 6 VMT-7 status=="done".
# Usage: jq --arg now "$NOW" -f scripts/router-d31-vmt7-doneverified-vps-outage-failclose-20260615.jq docs/data/orch/orch-state.json
def SPRINT: "VN-MACRO-TOOLING";
def is7: ((.id // "") | test("^VMT-7"));
($ARGS.named.now) as $now
| ([.task_board.active_sprints[]? | select(type=="object" and ((.id // "")==SPRINT)) | .tasks[]? | select(is7)]) as $v7
| if (.head.next_agent != "ops") then error("head.next_agent != ops (\(.head.next_agent)) — refuse")
  elif (($v7 | length) < 6) then error("expected >=6 VMT-7 tasks, found \($v7 | length) — refuse")
  elif (($v7 | map(select((.status // "") != "done")) | length) > 0) then error("some VMT-7 task not done (\($v7 | map(.status) | join(","))) — refuse")
  else . end
| .task_board.active_sprints = [
    .task_board.active_sprints[] | if (type=="object" and ((.id // "")==SPRINT))
      then ( .tasks = [
        .tasks[]
        | if is7
            then (. + {status: "done_verified", done_verified_at: $now, live_verify_agent: "a3f8cdf854aaadf90", live_verify_commit: "540a5907",
                       live_verify_verdict: "LIVE-VERIFIED (router RAW re-probed each tool via gateway, not the ops badge): toolCount=163 live==SSOT (0a77ae34); both containers fresh-rebuilt (mcp d5cb413773, macro 1e950eb65f) all peers healthy; MACRO_INDICATORS_URL=http://macro-indicators:5004 wired; all 5 enumerable+routing-correct. get_vn_liquidity_state LIVE-GREEN 200 with honest fail-closed fields (Decision A/B/DD-6 invariants confirmed LIVE: irs is_estimate=true, interbank_1w rate_1w_pct=null+is_estimate=true+blocked_reason, omo blocked_reason, sjc/policy is_estimate=true). Zone-B PROXY layer VERIFIED. get_vn_trade_balance/get_vn_bop/get_vn_macro_indicators/get_cpi_components return opaque error — ROOT CAUSE = VPS squid proxy 125.212.251.27:3128 DOWN (host alive ping195ms, :3128+:443 refuse; macro-indicators logs vpsFetch proxyconnect refused on NSO Excel + SBV-articles) = ACTIVE INFRA INCIDENT, NOT a Zone-B defect (proxy correctly propagates upstream failure). Two follow-ups routed to PO: F1 VPS-proxy outage (router dispatched ops-vps-fetch); F2 Zone-A graceful fail-close gap (4 NSO/SBV endpoints should degrade 200+is_estimate+blocked_reason like liquidity_state — dev-macro-indicators, generic /goal#1+#2)."})
          else . end
      ] )
      else . end
  ]
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "BA-VN-MACRO-TOOLING",
    next_agent: "po",
    note: "VN-MACRO-TOOLING VMT-7 Zone-B wave LIVE-VERIFIED -> done_verified (ops a3f8cdf854aaadf90 rebuilt mcp-server+macro-indicators; router RAW re-probed all 5 tools via gateway, not the ops badge). Zone-B PROXY layer VERIFIED: toolCount=163 live==SSOT (0a77ae34, dev-mcp-server reconciled — head-note toolCount update ALREADY DONE by owner); both containers fresh-rebuilt all peers healthy; MACRO_INDICATORS_URL wired; all 5 enumerable+routing-correct; get_vn_liquidity_state LIVE-GREEN 200 with honest fail-closed fields (Decision A/B/DD-6 LIVE-confirmed). === WAVE-2 Zone-A CLOSED (A1-A5) + VMT-7 Zone-B LIVE-VERIFIED. === BUT 4/5 tools (trade_balance/bop/macro_indicators/cpi_components) live-dark — ROOT CAUSE corroborated (router-independent + macro-indicators logs): VPS squid proxy 125.212.251.27:3128 DOWN (host alive ping195ms, :3128+:443 refuse = service-down on Vinahost VPS). NOT a Zone-B defect (proxy propagates upstream failure correctly). -> head ops->po: TRIAGE 3 findings: (F1) ACTIVE INFRA INCIDENT VPS-proxy :3128 down — router ALREADY DISPATCHED ops-vps-fetch (urgent, infra on-call) to restore squid + per-source fetchers; LIKELY COMMON ROOT of open FIX-SBV-FX-VPS-FETCHER-UNHEALTHY + FIX-NEWS-VPS-CRASH-LOOP + OPS-POLLNEWS-NIGHT-ZERO + VPS-AVAIL-02-FIX — PO reconcile the VPS task cluster under one root once ops-vps-fetch reports. (F2) /goal#1 BEST-RESULT GAP: Zone-A trade-balance/bop/macro-indicators/cpi-components 500/opaque on upstream-fetch fail instead of graceful 200+is_estimate+blocked_reason like liquidity_state — GENERIC across all 4 (/goal#2), mirror liquidity_state pattern, zone dev-macro-indicators (proposed VMT-8-MACRO-GRACEFUL-FAILCLOSE), independent of infra fix (resilience). (F3 non-blocking) gen-project-stats.ts cronJobCount=81 vs note ~69 + transient corrupt-2 partial write — dev-mcp-server reconcile+harden. VMT-3a-PMI still blocked-probe5 (S&P dev-local). Commit explicit path only."
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
