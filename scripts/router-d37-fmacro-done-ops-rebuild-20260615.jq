# Router dev-team — F-MACRO-FETCH-DEADLINE in_progress->done (router RAW-verified gates GREEN) + head dev->ops (REBUILD + LIVE-verify).
# dev-macro-indicators (agent a1df1c0dd70c226a7, commit 94b49f44) bounded all VPS fetches to domain.FetchBudgetSec=8 across all 5 use-cases.
# ROUTER INDEPENDENT RAW-VERIFY (not the dev badge):
#   G1 94b49f44 on main (NO branches — commit-to-main == merge gate).
#   G2 git show --name-only = 10 files ALL apps/macro-indicators/** + dev notebook; NO orch-state; foreign-capture NONE.
#   G3 working-tree clean (no dangling macro .go, orch-state unstaged).
#   G4 independent UNCACHED go build rc=0 + go vet rc=0 + go test ./pkg/... ALL 11 packages PASS (re-run, not the dev badge).
#   G5 fix correct+generic at code level: const FetchBudgetSec=8 SSOT in domain/ports.go; applied across infra (vpsFetch zero-fallback + cache_vmt_nso discoverAndFetch chain budgeted WHOLE via context.WithTimeout, not 3x) + all 4 fetch use-cases (macro/trade/bop/cpi) context.WithTimeout wrap; liquidity needs none (local market.db). VMT-8 degrade builders UNTOUCHED (only an added comment references degradedBOPResponse — the intended ctx.DeadlineExceeded->fetchRecord error->degrade wiring). /goal#2 generic.
#   Unit gate: 9 new tests (fetch_deadline_test.go 7 + cache_vmt_nso_deadline_test.go 2) assert hanging-fetcher -> bounded to 8s -> degraded-200 (NOT gateway-timeout) for bop + NSO-chain trade/macro/cpi + already-expired ctx + const sanity. PASS.
# CONTEXT: container macro-indicators-1 = pre-94b49f44 image -> CODE merge gate satisfied but fix NOT LIVE.
# This write (ONE atomic temp->rename): F-MACRO-FETCH-DEADLINE in_progress->done + done markers + router_reverify_verdict; head dev->ops. 0 new id-lines (status flip only).
# GUARD: refuse unless head.next_agent=="dev" AND F-MACRO-FETCH-DEADLINE status=="in_progress".
# Usage: jq --arg now "$NOW" -f scripts/router-d37-fmacro-done-ops-rebuild-20260615.jq docs/data/orch/orch-state.json
def FM: "F-MACRO-FETCH-DEADLINE";
($ARGS.named.now) as $now
| ([.task_board.ready[]?,.task_board.backlog[]? | select(type=="object" and ((.id // "")==FM))][0]) as $fm
| if (.head.next_agent != "dev") then error("head.next_agent != dev (\(.head.next_agent)) — refuse")
  elif ($fm == null) then error("F-MACRO-FETCH-DEADLINE not found — refuse")
  elif (($fm.status // "") != "in_progress") then error("F-MACRO-FETCH-DEADLINE status != in_progress (\($fm.status)) — refuse")
  else . end
| .task_board.ready = [ .task_board.ready[]?
    | if (type=="object" and ((.id // "")==FM))
        then (. + {status:"done", done_at:$now, done_commit:"94b49f44", done_agent:"a1df1c0dd70c226a7",
          router_reverify_verdict:"RAW-VERIFIED (not dev badge) — gates GREEN: 94b49f44 on main; 10 files all apps/macro-indicators/** + notebook, foreign-capture NONE, orch-state unstaged; independent UNCACHED go build/vet rc=0 + go test ./pkg/... all 11 pkgs PASS. const FetchBudgetSec=8 SSOT in domain/ports.go applied across vpsFetch fallback + cache_vmt_nso chain (budgeted WHOLE via context.WithTimeout, not 3x) + all 4 fetch use-cases; VMT-8 degrade builders UNTOUCHED. 9 new hang-fetcher tests -> degraded-200 within 8s (bop+NSO-chain trade/macro/cpi+expired-ctx+const) PASS. Generic /goal#2. CODE merge gate satisfied; LIVE-verify pending ops rebuild (container pre-94b49f44)."})
        else . end ]
| .task_board.backlog = [ .task_board.backlog[]?
    | if (type=="object" and ((.id // "")==FM))
        then (. + {status:"done", done_at:$now, done_commit:"94b49f44", done_agent:"a1df1c0dd70c226a7"})
        else . end ]
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: FM,
    next_agent: "ops",
    note: "F-MACRO-FETCH-DEADLINE DONE (dev-macro-indicators a1df1c0dd70c226a7, commit 94b49f44, router RAW-verified GREEN: on-main; 10 files all apps/macro-indicators/** + notebook; foreign-capture NONE; independent UNCACHED go build/vet rc=0 + go test ./pkg/... all 11 pkgs PASS; const FetchBudgetSec=8 SSOT domain/ports.go across vpsFetch+NSO-chain-budgeted-whole+all 4 fetch use-cases; VMT-8 degrade UNTOUCHED; 9 hang-fetcher tests -> degraded-200<=8s PASS; generic /goal#2). CODE merge gate satisfied BUT NOT LIVE — container macro-indicators-1 holds pre-94b49f44 image. === -> head dev->ops: FORCE-RECREATE macro-indicators single service (memory: rebuild after dev change; NEVER compose down — kills peers ~21min); verify new image ID + 94b49f44 on HEAD + 12 peers stay healthy. Then LIVE-verify via gateway re-probe (NOT badges) ACROSS >=2 TIMING WINDOWS (fast-fail-window trap): get_vn_trade_balance + get_vn_macro_indicators + get_cpi_components + get_vn_bop must each return 200 (real OR degraded: status=degraded+is_estimate=true+blocked_reason) WITHIN the gateway deadline — NO raw gateway-timeout/HANG (this is the whole point: a slow origin must now yield a fast ctx.DeadlineExceeded->degraded-200, not a hang); get_vn_liquidity_state stays 200 honest. On ops live-result -> ROUTER re-probes each tool ITSELF across timing (not ops badge) + disambiguates proxy-down (curl :3128) vs upstream-slow. If router live-green (no raw timeout): promote F-MACRO-FETCH-DEADLINE done_verified AND VMT-8-MACRO-GRACEFUL-FAILCLOSE done_verified (this is VMT-8's blocking live gate) + release the HELD-sequenced pair F-BOP-ENCODING + F-NSO-SELECTOR (accuracy, same files, serialize) + release SF-1. === SEQUENCED-AFTER (still HELD): F-BOP-ENCODING + F-NSO-SELECTOR (rebase 94b49f44 first — cache_vmt_nso.go + usecases_vmt_bop.go touched). Commit explicit path only."
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
