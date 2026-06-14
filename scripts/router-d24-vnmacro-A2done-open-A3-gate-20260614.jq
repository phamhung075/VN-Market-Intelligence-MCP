# Router dev-team — VN-MACRO-TOOLING A2 (VMT-3b-GSO + VMT-4-CPI) DONE (router RAW-verified) -> open A2->A3 merge gate, dispatch A3.
# dev-macro-indicators (commit 5b2d4af1) implemented BOTH VMT-3b + VMT-4 in one pass (shared getOrFetchNSOMonthlyExcel cache).
# ROUTER INDEPENDENT RAW-VERIFY (not the dev badge):
#   git show 5b2d4af1 --stat = EXACTLY 22 files, ALL apps/macro-indicators/** + dev-macro-indicators notebook;
#   FOREIGN-CAPTURE GUARD passed (grep -vE macro-indicators|dev-notebook = NONE) — hygiene reminder HELD, no ops.md sweep this time.
#   go build ./... PASS (independent); go test ./... -count=1 ALL GREEN (11 pkgs, independent re-run incl. pkg/infrastructure +
#   pkg/domain where anchor tests live: IIP iip_all_industry YoY=103.27/YTD=108.79/MoM=109.08; CPI cpi_total MoM=0.29/AvgYTD=4.31/YoY=5.60).
#   CONTRACT CONFORMANCE: excelize v2.8.1 direct require, CGO-FREE (zero import "C"); CPI WeightPct *float64 ALWAYS nil +
#   WeightsIsEstimate ALWAYS true INCLUDING error path (usecases_vmt_cpi.go:137) = fail-closed honest; single shared
#   NSOExcelFetcher instance (main.go:82) serves BOTH usecases (Entry 11, no redundant fetch, macro_vmt_cache 6h TTL);
#   TLS via VPS_CACERT_PATH (NEVER -k), no InsecureSkipVerify present. golangci-lint 0 (dev badge).
# A2 merge gate SATISFIED (committed to main, build/tests green — NO branches policy: commit-to-main == merge).
# This write (ONE atomic temp->rename):
#   (1) VMT-3b + VMT-4 status dispatched->done + done markers + router_dev_reverify_verdict.
#   (2) Open A2->A3: VMT-1a (ready) + VMT-1b (TODO) -> dispatched as a SINGLE A3 unit (one dev-macro-indicators agent does
#       BOTH — bundled per contract; share router.go/main.go + REUSE the now-existing getOrFetchNSOMonthlyExcel cache, no new excelize).
#   (3) head note refresh; next_agent stays dev (A3 is dev work). 0 new id-lines.
# GUARD: refuse unless head.next_agent=="dev" AND VMT-3b=="dispatched" AND VMT-4=="dispatched" AND VMT-1a=="ready" AND VMT-1b=="TODO".
# Usage: jq --arg now "$NOW" -f scripts/router-d24-vnmacro-A2done-open-A3-gate-20260614.jq docs/data/orch/orch-state.json
def SPRINT: "VN-MACRO-TOOLING";
def G3b: "VMT-3b-MACRO-INDICATORS-GSO";
def G4: "VMT-4-CPI-COMPONENTS";
def A3a: "VMT-1a-TRADE-BALANCE-TOTAL-HS";
def A3b: "VMT-1b-TRADE-BALANCE-BLOC-SPLIT";
($ARGS.named.now) as $now
| ([.task_board.active_sprints[]? | select(type=="object" and ((.id // "")==SPRINT)) | .tasks[]?]) as $tasks
| ([$tasks[] | select((.id // "")==G3b)][0]) as $g3b
| ([$tasks[] | select((.id // "")==G4)][0]) as $g4
| ([$tasks[] | select((.id // "")==A3a)][0]) as $a3a
| ([$tasks[] | select((.id // "")==A3b)][0]) as $a3b
| if (.head.next_agent != "dev") then error("head.next_agent != dev (\(.head.next_agent)) — refuse")
  elif ($g3b == null or $g4 == null) then error("VMT-3b or VMT-4 not found — refuse")
  elif (($g3b.status // "") != "dispatched") then error("VMT-3b status != dispatched (\($g3b.status)) — refuse")
  elif (($g4.status // "") != "dispatched") then error("VMT-4 status != dispatched (\($g4.status)) — refuse")
  elif ($a3a == null or $a3b == null) then error("VMT-1a or VMT-1b not found — refuse")
  elif (($a3a.status // "") != "ready") then error("VMT-1a status != ready (\($a3a.status)) — refuse")
  elif (($a3b.status // "") != "TODO") then error("VMT-1b status != TODO (\($a3b.status)) — refuse")
  else . end
| .task_board.active_sprints = [
    .task_board.active_sprints[] | if (type=="object" and ((.id // "")==SPRINT))
      then ( .tasks = [
        .tasks[]
        | if ((.id // "")==G3b or (.id // "")==G4)
            then (. + {status: "done", done_at: $now, done_commit: "5b2d4af1", done_agent: "a472d000",
                       router_dev_reverify_verdict: "RAW-VERIFIED (not the dev badge): git show 5b2d4af1 --stat = EXACTLY 22 files, ALL apps/macro-indicators/** + dev notebook; FOREIGN-CAPTURE GUARD passed (no ops.md/board/orch-state sweep — hygiene reminder HELD). go build ./... PASS + go test ./... -count=1 ALL GREEN (11 pkgs, independent). Anchors: IIP YoY=103.27/YTD=108.79/MoM=109.08; CPI MoM=0.29/AvgYTD=4.31/YoY=5.60. excelize v2.8.1 direct CGO-FREE (zero import C); CPI WeightPct *float64 ALWAYS nil + WeightsIsEstimate ALWAYS true incl error path (fail-closed); single shared NSOExcelFetcher serves both usecases (macro_vmt_cache 6h TTL, no redundant fetch); TLS VPS_CACERT_PATH no InsecureSkipVerify. A2 merge gate SATISFIED."})
          elif ((.id // "")==A3a)
            then (. + {status: "dispatched", dispatched_at: $now, dispatch_agent: "dev-macro-indicators",
                       dispatch_unit: "A3 (single agent implements VMT-1a + VMT-1b together — bundled per contract; share router.go/main.go + REUSE getOrFetchNSOMonthlyExcel cache from A2, NO new excelize). VMT-1a = NSO Excel sheets 14.XK (exports) + 15.NK (imports); trade_balance = export - import; hs_attribution sector rows; anchor May-2026 export 27.4bn/import 24.1bn/balance +3.3bn. merge gate A3->A4 after BOTH done."})
          elif ((.id // "")==A3b)
            then (. + {status: "dispatched", dispatched_at: $now, dispatch_agent: "dev-macro-indicators",
                       dispatch_unit: "A3 (bundled with VMT-1a in ONE agent). VMT-1b = bloc_split FDI share: sheets 12.FDI (registered capital) + 14.XK (total exports, SAME Excel as VMT-1a — cache hit). fdi_export_share_pct = fdi_registered / total_export * 100. bloc_split.fdi.is_estimate=true AND bloc_split.domestic.is_estimate=true PERMANENT (ARCH Decision A: Customs SPA inaccessible — NEVER flip false without machine-readable Customs enterprise-type column)."})
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
    note: "VN-MACRO-TOOLING A2=VMT-3b-GSO + VMT-4-CPI DONE (a472d000, commit 5b2d4af1, router RAW-verified: 22 files ALL in-zone + dev notebook, foreign-capture guard passed/hygiene HELD, go build + go test ./... ALL GREEN 11 pkgs, excelize v2.8.1 CGO-free, CPI weights null+is_estimate=true incl error path, single shared NSOExcelFetcher cache, TLS no -k, anchors pass, A2 merge gate SATISFIED). -> A2->A3 GATE OPEN: A3 = VMT-1a-TRADE-BALANCE + VMT-1b-BLOC-SPLIT DISPATCHED as ONE dev-macro-indicators agent (share router.go/main.go + REUSE getOrFetchNSOMonthlyExcel cache, NO new excelize/fetch; VMT-1a sheets 14.XK+15.NK trade balance + hs_attribution; VMT-1b bloc_split FDI share sheets 12.FDI+14.XK, is_estimate=true PERMANENT per ARCH Decision A). On A3 done + green -> merge gate A3->A4 -> dispatch A4=VMT-5b.omo. SERIAL Zone-A: one dev-macro-indicators agent at a time. VMT-3a-PMI blocked-probe5 (S&P dev-local). VMT-5b.interbank+irs permanent is_estimate (no parser). KINHDICH-HOVER-DETAIL chain CLOSED done_verified (e4e4991b). Commit explicit path only."
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
