# Router board completion: FIX-BCTC-VPS-FETCH-LEG-DEAD -> done (ops return, RAW-verified 2026-07-02).
# Pairs with scripts/dev-team-vps-fetch-leg-dispatch.jq (dispatch leg of same task).
# - Moves the row in_progress[] -> done[] with resolution + anti-churn triage note.
# - Marks backlog BCTC-HNX-SSL-HARDEN deps satisfied + corrects its stale cert-expiry premise
#   (HNX renewed leaf Jun 18 2026 -> NotAfter Jan 3 2027; evidence docs/vps-sources/hnx-tls-chain-2026-07-02.txt).
# - .head -> idle (WIP drops to 1: FIX-BCTC-ENRICHER-STUCK-BACKLOG parked on user-gated rebuild).
# Guard: refuse unless exactly one matching in_progress row exists.
# Usage: jq --arg now "$NOW" -f scripts/dev-team-vps-fetch-leg-complete.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
([.task_board.in_progress[]? | select(.id=="FIX-BCTC-VPS-FETCH-LEG-DEAD")] | length) as $n
| if $n != 1 then error("complete-guard: expected exactly 1 in_progress row FIX-BCTC-VPS-FETCH-LEG-DEAD, found " + ($n|tostring)) else . end
| ([.task_board.in_progress[] | select(.id=="FIX-BCTC-VPS-FETCH-LEG-DEAD")][0]) as $row
| .task_board.in_progress = [.task_board.in_progress[] | select(.id != "FIX-BCTC-VPS-FETCH-LEG-DEAD")]
| .task_board.done += [$row + {
    status: "DONE",
    completed_at: $now,
    completed_by: "ops",
    verified_by: "router",
    resolution: "Root cause = config drift: VPS ran stale discover-bctc-urls-browser.py without FIX-BCTC-SSC-503-RETRY (repo fix 6da9b030); SSC 503 maintenance killed discovery outright -> empty queue since 06-16. Ops scp-deployed repo version + live-tested retry path (503 -> 60s retry -> graceful fail). Transport leg confirmed alive (prices/news/sbv fresh). AC 'fresh bctc push <24h' NOT observable yet: queue legitimately empty (Q2 2026 reports unfiled + SSC maintenance) -> auto-recovers when filings start. Router RAW-verified: get_vps_proxy_health probe, commit c5dc17f1 journal-only scope, DJ-GATE-1 entry present, TLS evidence docs/vps-sources/hnx-tls-chain-2026-07-02.txt. TRIAGE NOTE: do NOT re-open on bctc staleness alone while queue is empty and SSC 503s persist; re-open only if queue non-empty with no push, or staleness persists >48h after Q2 filings appear."
  }]
| .task_board.backlog = [.task_board.backlog[] | if .id == "BCTC-HNX-SSL-HARDEN" then . + {
    deps_satisfied_at: $now,
    recon_note: "[router 2026-07-02] Dependency FIX-BCTC-VPS-FETCH-LEG-DEAD DONE -> dispatchable (route ops). PREMISE CORRECTED by recon evidence (docs/vps-sources/hnx-tls-chain-2026-07-02.txt): HNX renewed leaf cert Jun 18 2026, NotAfter Jan 3 2027 -> NO 2026-07-07 expiry cliff. Remaining driver: server omits GlobalSign RSA OV SSL CA 2018 intermediate (openssl verify code 21) -> curl -k workaround still live in /root/fetch-bctc.sh. Deadline pressure removed; PO may re-rank priority."
  } else . end]
| .head = {
    status: "idle",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: null,
    next_agent: null,
    note: "FIX-BCTC-VPS-FETCH-LEG-DEAD -> done (ops, RAW-verified by router 2026-07-02T11:20Z). WIP=1 (FIX-BCTC-ENRICHER-STUCK-BACKLOG parked on user-gated mcp-server rebuild). Next dev-team tick may dispatch TOKEN-ECONOMY-TICK-PREFLIGHT (ready) and/or BCTC-HNX-SSL-HARDEN (backlog top, deps satisfied, premise-corrected)."
  }
