# Router dev-team — record ops-vps-fetch (a47d92aa) completion: VPS-AVAIL-02-FIX -> resolved + route reconcile package to PO.
# CONTEXT: ops-vps-fetch was router-dispatched (parallel infra track, NOT via head). Head stays on the in-flight VMT-8 dev pipeline
#   (next_agent=dev) — this write does NOT touch .head. PO picks up the signal on the next dev-team triage (after VMT-8 closes).
# ROUTER RAW-VERIFY (not the ops badge):
#   - :3128 RAW-PROVEN live: curl -x http://125.212.251.27:3128 http://example.com -> HTTP 200 from the router's own France host (IPv6 egress), independent of ops report.
#   - commit 0608f6aa scope = EXACTLY 4 files (Dockerfile + certs/globalsign pem + docker-compose.yml + ops-vps-fetch.md notebook); foreign-capture NONE; orch-state NOT swept.
#   - LIVE gateway re-probe (router-independent, not ops claim): get_vn_trade_balance -> {"error":"macro-indicators service unavailable"} (Zone-A opaque 500 STILL — proxy up, upstream NSO selector stale); get_vn_bop -> TIMEOUT/HANG (BOP OData raw-space URL); get_vn_liquidity_state -> 200 honest fail-closed (live reference graceful pattern).
#   - ROOT-CAUSE REVISION of d31 verdict: :3128 was NEVER bound (no squid ever existed — not "service down"); tinyproxy 1.11.1 newly installed. Restoring :3128 did NOT make the 4 tools green — two SEPARATE upstream defects remain (corroborated live).
# This write (ONE atomic temp->rename), head UNTOUCHED:
#   (1) VPS-AVAIL-02-FIX backlog->resolved + resolution evidence (router-dispatched infra task, router RAW-verified).
#   (2) append ONE signal_queue row to PO: cluster reconcile (other 3 tasks NOT :3128-root) + 2 router-corroborated dev-zone root-cause findings (NSO selector + BOP encoding, COMPLEMENTARY to VMT-8) + proxy-ACL security note.
#   0 new task id-lines (signal row id != task id).
# GUARD: refuse unless head.next_agent=="dev" (VMT-8 in flight) AND VPS-AVAIL-02-FIX status=="backlog".
# Usage: jq --arg now "$NOW" --arg sigid "$SIGID" -f scripts/router-d33-vps-avail02-resolved-cluster-reconcile-signal-20260615.jq docs/data/orch/orch-state.json
def V2: "VPS-AVAIL-02-FIX";
($ARGS.named.now) as $now
| ($ARGS.named.sigid) as $sigid
| ([.task_board.backlog[]? | select(type=="object" and ((.id // "")==V2))][0]) as $v2
| if (.head.next_agent != "dev") then error("head.next_agent != dev (\(.head.next_agent)) — refuse (VMT-8 pipeline moved; re-derive)")
  elif ($v2 == null) then error("VPS-AVAIL-02-FIX not found in backlog — refuse")
  elif (($v2.status // "") != "backlog") then error("VPS-AVAIL-02-FIX status != backlog (\($v2.status)) — refuse")
  else . end
| .task_board.backlog = [
    .task_board.backlog[]
    | if (type=="object" and ((.id // "")==V2))
        then (. + {
          status: "resolved",
          resolved_at: $now,
          resolved_by: "ops-vps-fetch",
          resolve_commit: "0608f6aa",
          resolve_evidence: "VPS proxy :3128 was NEVER bound (no squid/forward proxy ever installed — root revision of d31 'service down'). ops-vps-fetch installed tinyproxy 1.11.1 on Vinahost VPS 125.212.251.27 (Port=3128, ACL 127.0.0.1/::1/Docker/private-nets/main-server; backup tinyproxy.conf.bak-20260615) + raised vn-vps-proxy.service MemoryMax 64M->256M (was OOM-killed 16x/day by python3 children). Repo: certs/globalsign-rsa-ov-ssl-ca-2018.pem + Dockerfile update-ca-certificates + compose VPS_HTTP_HOST/PORT env (commit 0608f6aa).",
          router_verify: "RAW (not ops badge): curl -x http://125.212.251.27:3128 http://example.com -> HTTP 200 from router France host (IPv6 egress); commit 0608f6aa scope = 4 files (Dockerfile+certs+compose+ops notebook), foreign-capture NONE, orch-state NOT swept; live gateway re-probe confirms proxy up (liquidity_state 200) while trade_balance/bop still fail on SEPARATE upstream defects -> proxy genuinely restored, not a false-green."
        })
        else . end
  ]
| .signal_queue.rows += [ {
    id: $sigid,
    from: "dev-team",
    to: "po",
    type: "infra-incident-reconcile + dev-zone-rootcause(2) + proxy-acl-security-note",
    severity: "HIGH",
    status: "NEW",
    summary: "OPS-VPS-FETCH (a47d92aa) DONE — router RAW-verified. (A) VPS-AVAIL-02-FIX RESOLVED by router this tick: :3128 was NEVER bound (no squid ever existed — d31 'service down' premise CORRECTED); tinyproxy 1.11.1 installed (commit 0608f6aa) + vn-vps-proxy OOM root-fixed (MemoryMax 64M->256M, was OOM-killed 16x/day). RAW-proven HTTP 200 via 125.212.251.27:3128 from router host. (B) CLUSTER RECONCILE — the OTHER 3 open VPS tasks are NOT :3128-root per ops diag, do NOT fold under one root: FIX-SBV-FX-VPS-FETCHER-UNHEALTHY = vn-sbv-fetch uses DIRECT HTTP push (not proxy) -> separate health-poller bug; FIX-NEWS-VPS-CRASH-LOOP = vn-news-fetch cursor/timestamp (c009 fix still holds, verify still-open); OPS-POLLNEWS-NIGHT-ZERO = separate RSS cadence issue. PO: re-scope/verify each individually, don't auto-close on the proxy fix. (C) TWO NEW dev-zone ROOT-CAUSE findings, router LIVE-CORROBORATED (not relayed): [F-NSO-SELECTOR] NSO WordPress HTML changed -> 'bai-top' selector stale -> get_vn_trade_balance + get_vn_macro_indicators + get_cpi_components return opaque 'service unavailable' (Zone-A 500) LIVE-CONFIRMED even with proxy up; [F-BOP-ENCODING] BOP OData filter passed to vpsFetch with raw spaces ('filter=status eq 0 and ...') -> tinyproxy rejects malformed CONNECT -> get_vn_bop TIMEOUT/HANGS live-confirmed (worse than fail-fast). Both zone=apps/macro-indicators/, owner=dev-macro-indicators. COMPLEMENTARY to in-flight VMT-8: VMT-8 makes these HONEST (degrade 200+is_estimate+blocked_reason), selector/encoding fixes make them ACCURATE (serve real data) — /goal#1 'best result' needs BOTH. PO mint 2 tasks, SEQUENCE AFTER VMT-8 done_verified (same files, serialize to avoid concurrent-commit race). (D) SECURITY note: tinyproxy ACL appears more open than ops documented — router IPv6 egress (NOT in the stated allowlist) got 200 through :3128. ops hardening follow-up (lock ACL to known clients).",
    payload_ref: "commit 0608f6aa; ops notebook docs/agent-memory/notebooks/ops-vps-fetch.md (c011); live re-probe trade_balance=opaque500 / bop=timeout / liquidity_state=200",
    disposition: "",
    ts: $now
  } ]
| .signal_queue._updated_at = $now
| .signal_queue._updated_by = "dev-team"
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
