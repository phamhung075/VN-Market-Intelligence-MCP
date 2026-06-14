# Router dev-team — VMT-8-MACRO-GRACEFUL-FAILCLOSE: dispatched -> done (router RAW-verified) + head dev->ops (REBUILD macro-indicators + LIVE-verify).
# dev-macro-indicators (agent a174dacb, code commit 7a176a44 + notebook a06a1873) implemented graceful fail-close across all 5 Zone-A use-cases.
# ROUTER INDEPENDENT RAW-VERIFY (not the dev badge — gates ALL GREEN):
#   G1 7a176a44 on main (HEAD=a06a1873 notebook; both on main; NO branches — commit-to-main == merge gate).
#   G2 git show 7a176a44 --name-only = 14 files ALL apps/macro-indicators/** (5 dtos + 5 usecases + 4 tests); handlers UNCHANGED (existing if-err-500/else-200 already correct — fix is use-case layer returning (degradedResp,nil)).
#   G3 FOREIGN-CAPTURE NONE; orch-state NOT staged; working-tree VMT-8 .go files = 0 (all committed).
#   G4 independent `go build ./...` rc=0, `go vet ./...` rc=0, `go test ./...` all packages ok (re-run, not the dev badge).
#   G5 FAIL-CLOSE invariants confirmed at CODE level (read func bodies) + uncached tests (-count=1):
#      - all 5 degraded*Response return `}, nil` [Status="degraded", IsEstimate=true, BlockedReason set] -> handler emits HTTP 200 on upstream-fetch/parse failure. G2 HTTP tests (trade/macro/bop/cpi DegradedUpstream->HTTP200) PASS.
#      - nil-provider/wiring fault: error*Response return `}, fmt.Errorf("%s",msg)` (non-nil) -> HTTP 500 preserved. G3 tests (NilProvider->HTTP500 / StillErrors) PASS.
#      - PERMANENT is_estimate held on degraded path: BlocShare FDI/Domestic IsEstimate=true (Decision A); CPI WeightsIsEstimate=true; liquidity Rate1WPct=nil + IsEstimate=true (Decision B) even on degraded. NEVER flipped true->false. G4 PermanentInvariants table PASS.
#   GENERICITY (/goal#2): identical (degradedResp,nil) pattern applied across ALL 5 use-cases, no per-endpoint hardcode.
#   209 PASS / 0 FAIL (dev badge, corroborated by router uncached re-run of G1-G4 subset).
# CONTEXT: container vn-market-intelligence-mcp-macro-indicators-1 = ops 0608f6aa image (Up 18m), PRE-7a176a44 -> code merge gate satisfied but fix NOT LIVE.
# This write (ONE atomic temp->rename): VMT-8 dispatched->done + done markers + router_reverify_verdict; head dev->ops. 0 new id-lines (status flip only).
# GUARD: refuse unless head.next_agent=="dev" AND VMT-8 status=="dispatched".
# Usage: jq --arg now "$NOW" -f scripts/router-d34-vmt8-done-dispatch-ops-rebuild-20260615.jq docs/data/orch/orch-state.json
def VMT8: "VMT-8-MACRO-GRACEFUL-FAILCLOSE";
($ARGS.named.now) as $now
| ([.task_board.backlog[]? | select(type=="object" and ((.id // "")==VMT8))][0]) as $v8
| if (.head.next_agent != "dev") then error("head.next_agent != dev (\(.head.next_agent)) — refuse")
  elif ($v8 == null) then error("VMT-8 not found in backlog — refuse")
  elif (($v8.status // "") != "dispatched") then error("VMT-8 status != dispatched (\($v8.status)) — refuse")
  else . end
| .task_board.backlog = [
    .task_board.backlog[]
    | if (type=="object" and ((.id // "")==VMT8))
        then (. + {
          status: "done",
          done_at: $now,
          done_commit: "7a176a44",
          done_agent: "a174dacb",
          router_reverify_verdict: "RAW-VERIFIED bundle (not the dev badge) — gates GREEN: 7a176a44 on main; git show --name-only 14 files ALL apps/macro-indicators/** (5 dtos+5 usecases+4 tests), handlers UNCHANGED (fix in use-case layer); foreign-capture NONE, orch-state not staged; independent go build/vet rc=0, go test all ok. FAIL-CLOSE invariants confirmed at code level + uncached tests: 5 degraded*Response return `}, nil` (Status=degraded, IsEstimate=true, BlockedReason set) -> G2 HTTP200 on upstream-fetch failure PASS; error*Response return fmt.Errorf (non-nil) -> G3 nil-provider HTTP500 preserved PASS; PERMANENT is_estimate held on degraded (BlocShare Decision A, CPI Weights, liquidity Rate1WPct=nil+IsEstimate Decision B) never flipped -> G4 PermanentInvariants PASS. Generic across ALL 5 use-cases (/goal#2). 209 PASS/0 FAIL. CODE merge gate satisfied; LIVE-verify pending ops rebuild (container = pre-7a176a44 0608f6aa image)."
        })
        else . end
  ]
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "VMT-8-MACRO-GRACEFUL-FAILCLOSE",
    next_agent: "ops",
    note: "VMT-8-MACRO-GRACEFUL-FAILCLOSE DONE (dev-macro-indicators a174dacb, commit 7a176a44, router RAW-verified gates GREEN: on-main; 14 files all apps/macro-indicators/** handlers-unchanged; foreign-capture NONE; independent go build/vet rc=0 + go test ok; fail-close invariants at code level — 5 degraded*Response return (resp,nil) Status=degraded+IsEstimate=true+BlockedReason -> G2 HTTP200; error*Response fmt.Errorf -> G3 nil-provider HTTP500 preserved; PERMANENT is_estimate held on degraded path G4 — never flipped; generic across all 5 use-cases /goal#2; 209 PASS/0 FAIL). CODE merge gate satisfied BUT NOT LIVE — container macro-indicators-1 holds ops 0608f6aa image (Up ~18m), pre-7a176a44. === -> head dev->ops: FORCE-RECREATE macro-indicators single service (memory: rebuild after dev change; NEVER compose down — kills peers ~21min) + LIVE-verify via gateway re-probe (NOT badges): get_vn_trade_balance + get_vn_bop must now return 200 with Status=degraded + is_estimate=true + blocked_reason (was opaque-500 / timeout) while VPS upstream sources stay dark (NSO selector + BOP encoding still unfixed — those are SEPARATE accuracy tasks routed to PO); get_vn_liquidity_state stays 200 honest. On ops live-green -> router RAW re-probes each tool itself (not ops badge) -> VMT-8 done_verified + release task:VMT-8. === PARALLEL: F1 VPS :3128 RESOLVED (VPS-AVAIL-02-FIX resolved, commit b1390d66, proxy RAW-proven 200). PO holds signal dev-team-20260614T225734Z-vps-cluster-reconcile (NEW): reconcile other-3 VPS tasks individually + mint 2 dev-zone accuracy tasks (F-NSO-SELECTOR + F-BOP-ENCODING, COMPLEMENTARY to VMT-8, sequence after) + proxy-ACL security note. HELD: F3 cronJobCount (dev-mcp-server low); S2 07-06 methodology brief (agent-father, greenlit sequenced-after-incident); context-bloat ops.md prune. VMT-3a-PMI blocked-probe5. Commit explicit path only."
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
