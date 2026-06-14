# Router dev-team — VN-MACRO-TOOLING VMT-8-MACRO-GRACEFUL-FAILCLOSE: BACKLOG -> dispatched to dev-macro-indicators + head po->dev.
# PO (agent a4c7a9bf) triaged dev-team tick 20260615T0036Z, minted VMT-8 to .task_board.backlog (id-line +0 tasks net here — status flip only).
# ROUTER RAW-VERIFY (not the PO badge):
#   - orch-state working-tree diff from PO = +41/-0 PURE append of VMT-8 to backlog[169]; .head + VN-MACRO-TOOLING active_sprint + ARCH-CRON UNTOUCHED (raw git diff confirmed).
#   - PO RAW-verified root cause at CODE level + CORRECTED the router premise: errorLiquidityResponse ALSO returns non-nil error -> /liquidity-state would 500 on its error path too; it only serves 200 in the live incident because its providers read LOCAL market.db (happy path), not because of graceful error handling. Fix is genuinely generic across ALL 5 use-cases (trade/bop/macro/cpi/liquidity), not 4.
#   - DJ-GATE: decision-journal entry for VMT-8 present in docs/agent-memory/decisions/sprint-2026-06-14-po.md (journal-before-DONE satisfied).
#   - VMT-8 independent_of_F1=true: code resilience fix, no VPS dependency to author/verify (G5 forced-failure fixture verifies even while proxy dark). Zone-A serial chain A1-A5 CLOSED -> single serial dev-macro-indicators task, no concurrent Zone-A writer.
# This write (ONE atomic temp->rename): VMT-8 status BACKLOG->dispatched + dispatch markers; head po->dev (next_agent=dev, active_task_id=VMT-8). 0 new id-lines (status flip only).
# GUARD: refuse unless head.next_agent=="po" AND VMT-8 status=="BACKLOG".
# Usage: jq --arg now "$NOW" -f scripts/router-d32-vmt8-dispatch-dev-macro-failclose-20260615.jq docs/data/orch/orch-state.json
def VMT8: "VMT-8-MACRO-GRACEFUL-FAILCLOSE";
($ARGS.named.now) as $now
| ([.task_board.backlog[]? | select(type=="object" and ((.id // "")==VMT8))][0]) as $v8
| if (.head.next_agent != "po") then error("head.next_agent != po (\(.head.next_agent)) — refuse")
  elif ($v8 == null) then error("VMT-8 not found in backlog — refuse")
  elif (($v8.status // "") != "BACKLOG") then error("VMT-8 status != BACKLOG (\($v8.status)) — refuse")
  else . end
| .task_board.backlog = [
    .task_board.backlog[]
    | if (type=="object" and ((.id // "")==VMT8))
        then (. + {status: "dispatched", dispatched_at: $now, dispatch_agent: "dev-macro-indicators",
                   dispatch_note: "Router dev-team dispatch 20260615 (tick 0036Z). Implement per this task's fix_spec + verification_gate G1-G5. GENERIC across all 5 use-cases (usecases_vmt_{trade,bop,macro,cpi,liquidity}.go) — on UPSTREAM-FETCH/parse failure return (populatedDegradedResponse, nil) [Status non-error, every bloc IsEstimate=true, BlockedReason naming the unreachable source per bloc]; KEEP nil-provider/wiring fault -> real error -> 500. Mirror the INTENDED liquidity fail-close. Preserve PERMANENT is_estimate invariants (IRS DD-6, Interbank1W Decision B, VMT-1b bloc_split, VIRA) — NEVER flip permanent true->false. go test ./... GREEN before any rebuild (RED-PREPUSH). Explicit-path commit (apps/macro-indicators/** + your notebook ONLY — NEVER git add -A, NEVER stage orch-state). On done+green router RAW-verifies (independent go build+test, foreign-capture guard, fail-close invariants at cited lines) then dispatches ops to force-recreate macro-indicators + QA LIVE raw verify (200+is_estimate+blocked_reason via forced-failure fixture, NOT badges)."})
        else . end
  ]
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "VMT-8-MACRO-GRACEFUL-FAILCLOSE",
    next_agent: "dev",
    note: "VN-MACRO-TOOLING VMT-8-MACRO-GRACEFUL-FAILCLOSE DISPATCHED -> dev-macro-indicators (router dev-team tick 20260615T0036Z; PO a4c7a9bf triaged F2 /goal#1 best-result gap). /goal#1+#2 resilience fix: 4 dark Zone-A macro endpoints (trade/bop/macro/cpi) + liquidity error-path emit opaque HTTP 500 on upstream-fetch failure instead of degrading honestly (200 + is_estimate=true + per-bloc blocked_reason). PO RAW-verified root cause at code level + CORRECTED premise: errorLiquidityResponse ALSO returns non-nil error (would 500 on error path); /liquidity-state only looks graceful because its providers read LOCAL market.db (happy path) — fix is generic across ALL 5 use-cases, not 4. dev-macro-indicators returns (degradedResp, nil) on upstream-fetch/parse failure, keeps nil-provider/wiring -> 500; preserve permanent is_estimate invariants. G5 verifiable via forced-failure fixture while proxy dark. === PARALLEL IN-FLIGHT: F1 VPS squid :3128 outage -> ops-vps-fetch (a47d92aa) restoring (router dispatched Dockerfile/compose/certs changes are ITS working tree — NOT swept). PO holds VPS-cluster (FIX-SBV-FX-VPS-FETCHER-UNHEALTHY + FIX-NEWS-VPS-CRASH-LOOP + OPS-POLLNEWS-NIGHT-ZERO + VPS-AVAIL-02-FIX) reconcile under one INC until ops-vps-fetch reports. === HELD: F3 gen-project-stats cronJobCount reconcile (dev-mcp-server, low); S2 07-06 methodology brief greenlit but SEQUENCED-after-incident (agent-father, not this cycle); context-bloat ops.md 235L>200 deferred until ops-vps-fetch done (claude-manager-helper prune, write-collision risk). VMT-3a-PMI blocked-probe5 (S&P dev-local). TNB c95 ACK'd no-new-tasks. Commit explicit path only."
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
