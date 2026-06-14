# Router dev-team — VN-MACRO-TOOLING A3 (VMT-1a-TRADE-BALANCE + VMT-1b-BLOC-SPLIT) DONE (router RAW-verified) -> open A3->A4 merge gate, dispatch A4.
# dev-macro-indicators (agent aa0aa147, commit a3bbc866) implemented BOTH VMT-1a + VMT-1b in one pass (reused getOrFetchNSOMonthlyExcel cache, NO new excelize).
# ROUTER INDEPENDENT RAW-VERIFY (not the dev badge):
#   git show a3bbc866 --stat = EXACTLY 12 files, ALL apps/macro-indicators/** (11) + dev-macro-indicators notebook (1);
#   FOREIGN-CAPTURE GUARD passed (grep -vE macro-indicators|dev-notebook = NONE; no orch-state/ops.md/signal sweep) — hygiene HELD.
#   go build ./... PASS (independent); go test ./... -count=1 ALL GREEN (11 pkgs incl pkg/domain + pkg/infrastructure where anchors live).
#   ANCHORS: VMT-1a TradeBalance May-2026 export=27400 import=24100 balance=+3300 M USD; VMT-1b FDIRegistered=24810,
#   bloc_split.is_estimate ALWAYS true (5 cases incl zero-exports + FDI-missing fail-closed); golangci-lint 0; G12 sandbox 18/18 + 2/2.
#   CONTRACT CONFORMANCE: excelize STILL single v2.8.1 (NO new dep), CGO-FREE (zero import "C"); single shared NSOExcelFetcher
#   (main.go:88) serves GSO(92)+CPI(96)+TradeBalance(102) = cache REUSE, no redundant fetch; route POST /trade-balance wired
#   (router.go:95) serving BOTH VMT-1a (trade totals + HS, is_estimate=false primary) + VMT-1b (bloc_split, is_estimate=true PERMANENT);
#   fail-closed error path (usecases_vmt_trade.go:155-159) keeps BlocSplit.FDI/Domestic.IsEstimate=true on error (ARCH Decision A).
# A3 merge gate SATISFIED (committed to main, build/tests green — NO branches policy: commit-to-main == merge).
# This write (ONE atomic temp->rename):
#   (1) VMT-1a + VMT-1b status dispatched->done + done markers + router_dev_reverify_verdict.
#   (2) Open A3->A4 (per BOARD serial_dispatch_order SSOT, NOT stale narrative): VMT-5a (ready) -> dispatched as A4 (SINGLE task,
#       liquidity-state policy_rates + SJC-gold-gap + fx_coupling; SBV Liferay HTML + market.db reads; IRS is_estimate=true DD-6).
#       VMT-5b stays TODO (A5, FINAL, gated A4->A5; depends VMT-5a + PROBE-4 — both prereqs met but serial-gated).
#   (3) head note refresh; next_agent stays dev (A4 is dev work). 0 new id-lines.
# GUARD: refuse unless head.next_agent=="dev" AND VMT-1a=="dispatched" AND VMT-1b=="dispatched" AND VMT-5a=="ready".
# Usage: jq --arg now "$NOW" -f scripts/router-d25-vnmacro-A3done-open-A4-gate-20260614.jq docs/data/orch/orch-state.json
def SPRINT: "VN-MACRO-TOOLING";
def A3a: "VMT-1a-TRADE-BALANCE-TOTAL-HS";
def A3b: "VMT-1b-TRADE-BALANCE-BLOC-SPLIT";
def A4:  "VMT-5a-LIQUIDITY-STATE-NO-GATE";
($ARGS.named.now) as $now
| ([.task_board.active_sprints[]? | select(type=="object" and ((.id // "")==SPRINT)) | .tasks[]?]) as $tasks
| ([$tasks[] | select((.id // "")==A3a)][0]) as $a3a
| ([$tasks[] | select((.id // "")==A3b)][0]) as $a3b
| ([$tasks[] | select((.id // "")==A4)][0])  as $a4
| if (.head.next_agent != "dev") then error("head.next_agent != dev (\(.head.next_agent)) — refuse")
  elif ($a3a == null or $a3b == null) then error("VMT-1a or VMT-1b not found — refuse")
  elif (($a3a.status // "") != "dispatched") then error("VMT-1a status != dispatched (\($a3a.status)) — refuse")
  elif (($a3b.status // "") != "dispatched") then error("VMT-1b status != dispatched (\($a3b.status)) — refuse")
  elif ($a4 == null) then error("VMT-5a (A4) not found — refuse")
  elif (($a4.status // "") != "ready") then error("VMT-5a status != ready (\($a4.status)) — refuse")
  else . end
| .task_board.active_sprints = [
    .task_board.active_sprints[] | if (type=="object" and ((.id // "")==SPRINT))
      then ( .tasks = [
        .tasks[]
        | if ((.id // "")==A3a or (.id // "")==A3b)
            then (. + {status: "done", done_at: $now, done_commit: "a3bbc866", done_agent: "aa0aa147",
                       router_dev_reverify_verdict: "RAW-VERIFIED (not the dev badge): git show a3bbc866 --stat = EXACTLY 12 files, ALL apps/macro-indicators/** (11) + dev notebook (1); FOREIGN-CAPTURE GUARD passed (no orch-state/ops.md/signal sweep — hygiene HELD). go build ./... PASS + go test ./... -count=1 ALL GREEN (11 pkgs, independent). Anchors: VMT-1a export=27400/import=24100/balance=+3300 M USD; VMT-1b FDIRegistered=24810, bloc_split.is_estimate ALWAYS true (5 cases incl zero-exports + FDI-missing fail-closed) + error-path usecases:155-159 keeps IsEstimate=true (ARCH Decision A). excelize STILL single v2.8.1 (NO new dep) CGO-FREE; single shared NSOExcelFetcher (main.go:88) serves GSO+CPI+TradeBalance = cache REUSE; route POST /trade-balance wired (router.go:95). golangci-lint 0; G12 sandbox 18/18 + 2/2. A3 merge gate SATISFIED."})
          elif ((.id // "")==A4)
            then (. + {status: "dispatched", dispatched_at: $now, dispatch_agent: "dev-macro-indicators",
                       dispatch_unit: "A4 (SINGLE task — VMT-5a liquidity-state; A3->A4 merge gate SATISFIED). policy_rates (refi/discount/lombard) from www.sbv.gov.vn Liferay HTML (same site as BOP, reachable, --cacert NOT -k, NO VPS proxy). SJC gap = sjc_price - world_price + fx_coupling from EXISTING market.db reads (sbv_rates + commodity_prices tables — DD-7, NO new fetch/crawl). IRS field is_estimate=true PERMANENT (DD-6, HNX OTC IRS not machine-readable — NEVER flip false). probe_sample scripts/probes/vmt-4-sample.json. Files: handlers/usecases/dtos/models/services_vmt_liquidity + adapters_vmt_sjc_fx + 2 tests + router.go/main.go wire. On done+green -> merge gate A4->A5 -> dispatch A5=VMT-5b (interbank permanent-estimate + OMO HTML, FINAL). Explicit-path commit ONLY (apps/macro-indicators/** + your notebook — NEVER git add -A/orch-state/ops.md)."})
          else . end
      ] )
      else . end
  ]
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "BA-VN-MACRO-TOOLING",
    next_agent: "dev",
    note: "VN-MACRO-TOOLING A3=VMT-1a-TRADE-BALANCE + VMT-1b-BLOC-SPLIT DONE (aa0aa147, commit a3bbc866, router RAW-verified: 12 files ALL in-zone + dev notebook, foreign-capture guard passed/hygiene HELD, go build + go test ./... ALL GREEN 11 pkgs, excelize STILL single v2.8.1 cache REUSE, bloc_split is_estimate=true PERMANENT incl error path, route /trade-balance wired, anchors pass export27400/import24100/balance+3300/FDI24810, A3 merge gate SATISFIED). -> A3->A4 GATE OPEN (per BOARD serial_dispatch_order SSOT — corrected stale A4=VMT-5b narrative): A4 = VMT-5a-LIQUIDITY-STATE-NO-GATE DISPATCHED to dev-macro-indicators (SINGLE task: policy_rates SBV Liferay HTML + SJC-gold-gap + fx_coupling from EXISTING market.db reads, NO new crawl; IRS is_estimate=true DD-6 permanent). On A4 done+green -> merge gate A4->A5 -> dispatch A5=VMT-5b-INTERBANK-OMO (FINAL: interbank permanent is_estimate Decision B + OMO HTML tally; depends VMT-5a+PROBE-4 both met, serial-gated). SERIAL Zone-A: one dev-macro-indicators agent at a time. VMT-3a-PMI blocked-probe5 (S&P dev-local). VMT-7a-e + VMT-7-REGISTER (handler-registration wave) still TODO. KINHDICH-HOVER-DETAIL chain CLOSED done_verified (e4e4991b). Commit explicit path only."
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
