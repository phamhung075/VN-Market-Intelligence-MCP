# Router board dispatch: PO BATCH 2026-07-02T10:37Z tick — two ops-lane FIX tasks.
# Entry 1 FIX-BCTC-VPS-FETCH-LEG-DEAD -> in_progress[] (CRITICAL, takes free WIP slot per PO routing note,
#   ahead of queued TOKEN-ECONOMY-TICK-PREFLIGHT). Sets .head for unambiguous dispatch on resume.
# Entry 2 BCTC-HNX-SSL-HARDEN -> backlog[] top (depends on Entry 1 reviving the leg — NOT dispatchable yet).
# Guards: refuse if either id already on any lane (dup-key), refuse if WIP would exceed 2.
# Pointer: docs/agents/dev-team/flow/main.md Step 2 type matrix (FIX -> direct Step 3) + execute-tier.md.
# Usage: jq --arg now "$NOW" -f scripts/dev-team-vps-fetch-leg-dispatch.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
([.task_board.backlog[]?, .task_board.ready[]?, .task_board.in_progress[]?]
 | map(select(.id=="FIX-BCTC-VPS-FETCH-LEG-DEAD" or .id=="BCTC-HNX-SSL-HARDEN")) | length) as $dups
| if $dups > 0 then error("dup-guard: task id already on board — refuse") else . end
| if (.task_board.in_progress | length) >= 2 then error("WIP guard: in_progress already at 2 — refuse") else . end
| .task_board.in_progress += [{
    id: "FIX-BCTC-VPS-FETCH-LEG-DEAD",
    title: "bctc-discover STALE 384h — VPS bctc FETCH leg dead (recon-first revive)",
    status: "IN_PROGRESS",
    owner: "dev-team",
    next_agent: "ops",
    route_to: "ops",
    type: "FIX",
    zone: "cross-service/",
    priority: "critical",
    size: "S",
    sla_hours: 24,
    created_at: $now,
    created_by: "po",
    origin_signal: "8280",
    origin_report: "3391",
    files: ["vps-scripts/fetch-bctc.sh", "scripts/deploy-vinahost.sh"],
    baseline_pass: true,
    claimed_at: $now,
    claimed_by: "router",
    dispatched_at: $now,
    desc: "CRITICAL. Dispatcher RAW-verified: VPS last bctc push 2026-06-16T18:02:24Z (384h), prices/news/sbv legs healthy -> transport ALIVE, bctc FETCH leg DEAD (isolated). Earnings window Jul 1-14, SLA 24h. RECON FIRST (ops): SSH-probe the VPS bctc leg + raw-trigger ONE on-demand fetch to isolate discovery vs transport vs fetch before any code change. Likely same shape as June-1 HNX TLS incident (owa.hnx.vn incomplete chain; hotfixed curl -k in /root/fetch-bctc.sh, repo copy vps-scripts/fetch-bctc.sh deployed via scripts/deploy-vinahost.sh, commit e22427aa). Apply fix per evidence. AC: fresh VPS bctc push <24h old + get_vps_proxy_health shows bctc leg healthy.",
    dispatch_note: "[dispatcher 2026-07-02 tick 10:37Z] PO BATCH entry 1 — ops-lane (VPS SSH recon + deploy), NOT generic developer. Recon-first per feedback_isolation_probe_before_cluster_triage. Capture TLS chain evidence for follow-up BCTC-HNX-SSL-HARDEN (backlog, sequenced after this) but do NOT harden in this task."
  }]
| .task_board.backlog = ([{
    id: "BCTC-HNX-SSL-HARDEN",
    title: "Replace VPS bctc curl -k with --cacert pinning (HNX leaf cert expires 2026-07-07)",
    status: "BACKLOG",
    owner: "po",
    route_to: "ops",
    type: "FIX",
    zone: "cross-service/",
    priority: "high",
    size: "S",
    depends: ["FIX-BCTC-VPS-FETCH-LEG-DEAD"],
    created_at: $now,
    created_by: "po",
    files: ["vps-scripts/fetch-bctc.sh", "scripts/deploy-vinahost.sh"],
    baseline_pass: true,
    desc: "Follow-up to FIX-BCTC-VPS-FETCH-LEG-DEAD — SEQUENCE AFTER it revives the leg. June-1 hotfix (commit e22427aa) uses insecure curl -k (cert verification off) in vps-scripts/fetch-bctc.sh. HNX leaf cert expires 2026-07-07 (~5d) -> a second break is due within a week even if revived. Harden: replace -k with --cacert pinning against the full HNX CA chain (bundle it). Needs recon output from Entry 1 to confirm TLS path + capture working chain. AC: fetch succeeds with cert verification ON (no -k) and survives past 2026-07-07."
  }] + .task_board.backlog)
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "FIX-BCTC-VPS-FETCH-LEG-DEAD",
    next_agent: "ops",
    note: "FIX-BCTC-VPS-FETCH-LEG-DEAD claimed by router (PO BATCH 10:37Z tick) — ops runs VPS SSH recon-first revive of dead bctc fetch leg. CRITICAL SLA 24h (earnings window Jul 1-14). Promote -> done on AC: fresh VPS bctc push <24h + healthy leg. Follow-up BCTC-HNX-SSL-HARDEN parked in backlog behind it."
  }
