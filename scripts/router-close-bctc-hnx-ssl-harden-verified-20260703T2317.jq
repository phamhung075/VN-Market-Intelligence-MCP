# Router closeout: BCTC-HNX-SSL-HARDEN review[] -> done_verified[].
# ops-vps-fetch (a9634ceb, router-dispatched) completed the PO-requested live VPS verification 2026-07-03T23:17Z + router RAW-verified.
#
# ops LIVE evidence (findings doc docs/handoffs/ops-BCTC-HNX-SSL-HARDEN-verify.md @ fb366a1ec; router-verified: 2 files, 0 UUID, 0 leaked creds):
#   - deploy_shipped=YES: /root/fetch-bctc.sh + /root/hnx-ca-bundle.pem present (mtime Jul 3 11:41, post-hardening); grep confirms ZERO -k/--insecure in live script;
#     live curl line `curl -s --cacert /root/hnx-ca-bundle.pem -L ...` byte-identical to repo vps-scripts/fetch-bctc.sh; CA bundle MD5 17bf45efde60f44e244fda6bdf7d0e89 == repo.
#   - live fetch verify-ON (no -k) on a real HNX Q1/2026 filing (owa.hnx.vn): RC=200 SIZE=536103 EXIT=0, `file` confirms valid PDF v1.3 -> AC MET.
#   - "0 fetch/24h" (PO flag) explained: queue empty most 6h cycles Jun 28-Jul 3 (structurally normal, service active) = metric-visibility gap, not a dead path.
# AC ("bctc fetch succeeds with verification ON, no -k; openssl verify rc=0 against pinned bundle; leaf valid to 2027-01-03") is now INDEPENDENTLY MET on the live VPS.
# Repo scope already RAW-verified by PO (openssl rc=0, no -k, commits 073fa27f+638fba89). No qa merge gate beyond the live ops verification (repo change was RAW-verified at review promotion).
#
# Guard: error if not in review[]; error if already in done_verified[]. Type-guard elements.
# Usage: NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; jq --arg now "$NOW" -f scripts/router-close-bctc-hnx-ssl-harden-verified-20260703T2317.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.review | map(select(type=="object" and .id=="BCTC-HNX-SSL-HARDEN"))[0]) as $t
| if $t == null then error("BCTC-HNX-SSL-HARDEN not in review[] -- refuse to close out")
  elif ((.task_board.done_verified | map(select(type=="object" and .id=="BCTC-HNX-SSL-HARDEN")) | length) > 0) then error("already in done_verified[] -- refuse dup")
  else . end
| .task_board.done_verified += [
    ($t + {
      status: "DONE_VERIFIED",
      done_verified: true,
      verified_by: "router",
      verified_at: $now,
      verifying_agent: "ops-vps-fetch",
      deliverables: ["docs/handoffs/ops-BCTC-HNX-SSL-HARDEN-verify.md@fb366a1ec", "vps-scripts/fetch-bctc.sh@073fa27f", "vps-scripts/hnx-ca-bundle.pem@073fa27f"],
      ops_verify_note: "[router 2026-07-03T23:17Z] ops-vps-fetch LIVE VPS verification COMPLETE + router RAW-verified. deploy_shipped=YES (/root/fetch-bctc.sh + /root/hnx-ca-bundle.pem present, no -k/--insecure, byte-identical to repo, CA MD5 17bf45efde60f44e244fda6bdf7d0e89==repo). Live fetch verify-ON (curl --cacert, no -k) on real HNX Q1/2026 filing: RC=200 SIZE=536103 EXIT=0, valid PDF -> AC MET. PO 'deploy unconfirmed / 0-fetch-24h' concern RESOLVED (deploy confirmed live; 0-fetch = benign metric-visibility gap on empty 6h queues). Security debt eliminated: insecure curl -k no longer on the VPS fetch leg. Findings fb366a1ec (router-verified: 2 files, 0 UUID, 0 leaked VPS creds). NOTE: ops-vps-fetch committed WITHOUT commit-mutex (no gateway binding; INV-GATEWAY-1 specialist exception) AND pushed to origin/main directly (full local backlog now synced, origin==HEAD) -- a fleet-push-boundary deviation, harmless (clean commit) but flagged."
    })
  ]
| .task_board.review |= map(select(type != "object" or .id != "BCTC-HNX-SSL-HARDEN"))
| .head += {
    status: "idle",
    active_task_id: null,
    next_agent: null,
    next_action: "BCTC-HNX-SSL-HARDEN done_verified (ops-vps-fetch live VPS verify: deploy shipped, curl --cacert no -k, RC=200/536KB valid PDF, AC MET; router RAW-verified fb366a1ec). WIP=0 idle. Durable FP fix FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT remains BACKLOG (next_agent=ba, co-fix with B-11). Draining 4 pending signals (GVR ESC-4 deep_dive_result -> PO whitelist + 2 stale price-anomaly + 1 cowork record) -> PO triage this tick.",
    updated_at: $now,
    updated_by: "router",
    note: "23:17Z: BCTC-HNX-SSL-HARDEN review->done_verified (ops live VPS verification, AC MET; router RAW-verified). Proceeding to signal drain + PO triage."
  }
