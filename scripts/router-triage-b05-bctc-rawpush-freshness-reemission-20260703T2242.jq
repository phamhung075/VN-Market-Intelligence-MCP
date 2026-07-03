# Router signal-triage: B-05 re-emission sau-20260703T223423Z (bctc-push stale 432h) -> READ, linked to owning task BCTC-HNX-SSL-HARDEN.
# NOT a pure FP-resolve (would contradict PO's corroborated-real 03:03Z disposition) and NOT a new investigation (owned).
#
# 4-source LIVE RAW corroboration 2026-07-03T22:41Z (analysis-layer RECOVERED since PO's 03:03Z triage of 38-pending/VPS-unhealthy):
#   - get_sla_status(bctc): age 33min / SLA 850min -> OK (authoritative analysis-layer freshness gate).
#   - get_vps_service_health(vn-bctc-fetch): HEALTHY, polled 4m ago -> VPS NOT down (falsifies auditor "8787 binding / VPS unreachable" root).
#   - trigger_bctc_vps_fetch(dry_run): Pending queue 0 items (was 38 at 03:03Z) -> nothing stuck; auditor "36 items" is stale.
#   - get_vps_proxy_health(bctc): raw last-push 06-16 / 0-in-24h -> the ONLY stale metric; benign event-driven quarterly source
#     (Q2-2026 BCTC filings not due until ~late July; 0 pending). B-05 check FPs by applying a 24h continuous SLA to the raw-push
#     layer instead of the analysis-layer SLA gate (two-layer-freshness FP class).
#
# Guard: error if target signal not present. Only mutates the one row (schema-safe keys: status/triaged_by/triaged_at/triage_note/backlog_task_id).
# Usage: NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; jq --arg now "$NOW" -f scripts/router-triage-b05-bctc-rawpush-freshness-reemission-20260703T2242.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.signal_queue.rows | map(select(type=="object" and .id=="sau-20260703T223423Z")) | length) as $n
| if $n == 0 then error("signal sau-20260703T223423Z not in signal_queue.rows[] -- refuse to triage")
  else . end
| .signal_queue.rows |= map(
    if (type=="object" and .id=="sau-20260703T223423Z") then
      . + {
        status: "READ",
        triaged_by: "router",
        triaged_at: $now,
        backlog_task_id: "BCTC-HNX-SSL-HARDEN",
        triage_note: "[router 2026-07-03T22:42Z] Re-emission (4th today) of KNOWN bctc raw-fetch staleness. PO already triaged sau-20260703T024117Z at 03:03Z -> linked BCTC-HNX-SSL-HARDEN (HNX SSL outage root; code-complete/in-review, DEPLOY-PENDING user-gated). Live 4-source RAW corroboration 22:41Z: analysis-layer RECOVERED since PO triage -- get_sla_status(bctc) age 33min/SLA 850min OK; vn-bctc-fetch HEALTHY polled 4m ago; refine/enrich queue drained (38->0 via trigger_bctc_vps_fetch dry_run). ONLY get_vps_proxy_health raw last-push still 06-16/0-in-24h -- BENIGN: event-driven quarterly source, Q2-2026 filings not due until ~late July, 0 pending. B-05 check FPs applying 24h continuous SLA to raw-push layer vs authoritative analysis-layer SLA gate (two-layer-freshness class). Auditor asserted root (headroom-proxy 8787 / VPS down) FALSIFIED by healthy service. NO new investigation -- owned by BCTC-HNX-SSL-HARDEN. ROUTED TO PO: (a) note recovered analysis-layer on that task; (b) mint PLAN-ONLY B-05 check-refinement (read analysis-layer SLA gate, not raw-push, for event-driven bctc); (c) decide if ops post-deploy freshness verification is warranted per spawn-ops-for-user-gate directive. RESOLVE only after BCTC-HNX-SSL-HARDEN deploy + raw-push freshness confirmed green (per PO's own resolution condition)."
      }
    else . end
  )
