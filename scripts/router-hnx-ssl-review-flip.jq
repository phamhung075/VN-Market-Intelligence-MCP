# Router board flip: BCTC-HNX-SSL-HARDEN in_progress[] -> review[] (IN_PROGRESS->REVIEW, deploy-pending).
# Worker dev-vps-crawls returned REVIEW 2026-07-02: commits 073fa27f (bundle + de-k + deploy wiring) and
# 638fba89 (journal/notebook). Router RAW-verified: openssl verify rc=0 reproduced locally against recon
# leaf, zero -k/--insecure left in vps-scripts/fetch-bctc.sh, deploy-vinahost.sh ships bundle, DJ-GATE-1
# journal present, no push / no SSH / orch-state untouched by worker.
# NOT done: live VPS deploy is user-gated (permission classifier denied delegated remote prod writes).
# Unpark condition = user runs ./scripts/deploy-vinahost.sh, then ops verifies fetch OK with verification ON.
# REFUSE if BCTC-HNX-SSL-HARDEN not in in_progress[] (gate guard).
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute — router flip after worker return + RAW verify).
# Usage: jq --arg now "$NOW" -f scripts/router-hnx-ssl-review-flip.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.in_progress | map(select(.id=="BCTC-HNX-SSL-HARDEN"))[0]) as $t
| if $t == null then error("BCTC-HNX-SSL-HARDEN not in in_progress[] — refuse to flip") else . end
| .task_board.review += [
    ($t + {
        status: "REVIEW",
        updated_at: $now,
        updated_by: "router",
        review_note: "Repo scope COMPLETE \($now): commits 073fa27f (vps-scripts/hnx-ca-bundle.pem GlobalSign intermediate+root, fetch-bctc.sh curl -k -> --cacert /root/hnx-ca-bundle.pem, deploy-vinahost.sh ships bundle) + 638fba89 (DJ-GATE-1 journal). RAW-verified by router: openssl verify -CAfile bundle <recon leaf> = OK rc=0 reproduced; grep confirms no -k/--insecure; live probe evidence: TLS verify ok on owa.hnx.vn (HTTP 403 = WAF, app-layer). DEPLOY PENDING (user-gated): user must run ./scripts/deploy-vinahost.sh (ships bundle + fetch-bctc.sh to VPS /root/). Post-deploy AC: HNX fetch OK with verification ON."
       })
  ]
| .task_board.in_progress |= map(select(.id != "BCTC-HNX-SSL-HARDEN"))
| .head = {
    status: "idle",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: null,
    next_agent: null,
    note: "BCTC-HNX-SSL-HARDEN repo scope shipped (073fa27f) -> review lane, deploy-pending on user-gated ./scripts/deploy-vinahost.sh. WIP now 1/2 (parked enricher). Tick 2026-07-02T13:07Z closed."
  }
