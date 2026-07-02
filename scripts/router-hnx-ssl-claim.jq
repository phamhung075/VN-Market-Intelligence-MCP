# Router board claim: BCTC-HNX-SSL-HARDEN ready[] -> in_progress[] (READY->IN_PROGRESS).
# PO triage 2026-07-02T13:07Z promoted it backlog->ready on the corrected premise (no 2026-07-07 cliff;
# real driver = HNX omits GlobalSign RSA OV SSL CA 2018 intermediate, verify code 21, live curl -k hotfix).
# Type FIX => planning skipped, direct dispatch to ops (route_to from PO BATCH, zone cross-service/).
# WIP guard: refuse if in_progress already holds 2 rows (WIP<=2; parked enricher occupies one slot).
# Sets head in_progress/next_agent=ops so the dispatch is unambiguous on resume.
# REFUSE if BCTC-HNX-SSL-HARDEN not in ready[] (gate guard).
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute — router claim before worker spawn).
# Usage: jq --arg now "$NOW" -f scripts/router-hnx-ssl-claim.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.ready | map(select(.id=="BCTC-HNX-SSL-HARDEN"))[0]) as $t
| if $t == null then error("BCTC-HNX-SSL-HARDEN not in ready[] — refuse to claim")
  elif (.task_board.in_progress | length) >= 2
    then error("WIP limit reached (in_progress has \(.task_board.in_progress | length) rows) — refuse to claim")
  else . end
| .task_board.in_progress += [
    ($t + {
        status: "IN_PROGRESS",
        claimed_at: $now,
        claimed_by: "router",
        next_agent: "ops",
        dispatch_note: "Dispatched ops \($now). FIX (size S) — replace curl -k in vps-scripts/fetch-bctc.sh with --cacert pinned bundle (GlobalSign RSA OV SSL CA 2018 intermediate + root); scripts/deploy-vinahost.sh ships the bundle; redeploy to VPS /root/fetch-bctc.sh. Recon: docs/vps-sources/hnx-tls-chain-2026-07-02.txt. Accepts: fetch OK with verification ON (no -k); openssl verify rc=0 against pinned bundle; leaf valid to 2027-01-03 so no 07-07 race."
       })
  ]
| .task_board.ready |= map(select(.id != "BCTC-HNX-SSL-HARDEN"))
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "BCTC-HNX-SSL-HARDEN",
    next_agent: "ops",
    note: "BCTC-HNX-SSL-HARDEN claimed — ops replaces VPS curl -k hotfix with --cacert pinned GlobalSign bundle + deploy-script ship. Premise corrected 2026-07-02 (no expiry cliff; missing-intermediate driver). Promote -> done on AC pass (verification ON fetch + openssl verify rc=0)."
  }
