# Router dev-team — VN-MACRO-TOOLING A1 (VMT-2-BOP) DONE (router RAW-verified) -> open A1->A2 merge gate, dispatch A2.
# dev-macro-indicators (a6d8f1d1, commit dae7e68d) implemented VMT-2-BOP.
# ROUTER INDEPENDENT RAW-VERIFY (not the dev badge):
#   git show dae7e68d --stat = 8 new BOP files (models/services/parsers/dtos/usecases/handlers + 2 _test) + router.go +
#   main.go + 2 in-zone test fixups (handlers_snapshot_contract_test.go, router_test.go) + dev-macro-indicators notebook.
#   NO orch-state/.head/board capture; NO cowork notebook capture EXCEPT ops.md (-96 lines = context-bloat archival trim,
#   211->115, benign + git-recoverable) swept in via a NON-EXPLICIT git add — COMMIT-HYGIENE finding for dev-macro-indicators
#   (use explicit-path add; do NOT git add foreign notebooks). NON-BLOCKING: code correct, history preserved, no data loss;
#   not amending published main. CONTRACT CONFORMANCE: NO excelize in go.mod (direct JSON, PROBE-2); offshore_parked ALWAYS
#   IsEstimate=true (domain ComputeOffshoreParked) while primary E&O IsEstimate=false (correct fail-closed); E&O BPM6 sign
#   loiVaSaiSot=-12375=outflow no-flip; VN-number 7.654=7654 M USD; go build + go test ./... ALL PASS (4 pkgs green).
# A1 merge gate SATISFIED (committed to main, build/tests green — NO branches policy: commit-to-main == merge).
# This write (ONE atomic temp->rename):
#   (1) VMT-2-BOP status dispatched->done + done markers + router_dev_reverify_verdict.
#   (2) Open A1->A2: VMT-3b-GSO + VMT-4-CPI status TODO->dispatched as a SINGLE A2 unit (one dev-macro-indicators agent does
#       BOTH — they share router.go/main.go + the getOrFetchNSOMonthlyExcel() cache; parallel agents would conflict on router).
#   (3) head note refresh; next_agent stays dev (A2 is dev work). 0 new id-lines.
# GUARD: refuse unless head.next_agent=="dev" AND VMT-2-BOP status=="dispatched" AND VMT-3b status=="TODO" AND VMT-4 status=="TODO".
# Usage: jq --arg now "$NOW" -f scripts/router-d23-vnmacro-A1done-open-A2-gate-20260614.jq docs/data/orch/orch-state.json
def SPRINT: "VN-MACRO-TOOLING";
def A1: "VMT-2-BOP";
def G3b: "VMT-3b-MACRO-INDICATORS-GSO";
def G4: "VMT-4-CPI-COMPONENTS";
($ARGS.named.now) as $now
| ([.task_board.active_sprints[]? | select(type=="object" and ((.id // "")==SPRINT)) | .tasks[]?] ) as $tasks
| ([$tasks[] | select((.id // "")==A1)][0]) as $a1
| ([$tasks[] | select((.id // "")==G3b)][0]) as $g3b
| ([$tasks[] | select((.id // "")==G4)][0]) as $g4
| if (.head.next_agent != "dev") then error("head.next_agent != dev (\(.head.next_agent)) — refuse")
  elif ($a1 == null) then error("VMT-2-BOP not found — refuse")
  elif (($a1.status // "") != "dispatched") then error("VMT-2-BOP status != dispatched (\($a1.status)) — refuse")
  elif ($g3b == null or $g4 == null) then error("VMT-3b or VMT-4 not found — refuse")
  elif (($g3b.status // "") != "TODO") then error("VMT-3b status != TODO (\($g3b.status)) — refuse")
  elif (($g4.status // "") != "TODO") then error("VMT-4 status != TODO (\($g4.status)) — refuse")
  else . end
| .task_board.active_sprints = [
    .task_board.active_sprints[] | if (type=="object" and ((.id // "")==SPRINT))
      then ( .tasks = [
        .tasks[]
        | if ((.id // "")==A1)
            then (. + {status: "done", done_at: $now, done_commit: "dae7e68d", done_agent: "a6d8f1d1",
                       router_dev_reverify_verdict: "RAW-VERIFIED (not the dev badge): git show dae7e68d --stat = 8 in-zone BOP files + router.go + main.go + 2 in-zone test fixups + dev notebook; NO board/.head capture. CONTRACT: NO excelize (direct JSON PROBE-2); offshore_parked ALWAYS IsEstimate=true while primary E&O IsEstimate=false (fail-closed correct); E&O BPM6 sign loiVaSaiSot=-12375=outflow no-flip; VN-number 7.654=7654 M USD; go build + go test ./... ALL PASS. HYGIENE FINDING (non-blocking): commit swept ops.md -96L (context-bloat archival trim 211->115, benign+git-recoverable) via non-explicit git add — dev-macro-indicators must use explicit-path add for foreign notebooks. A1 merge gate SATISFIED."})
          elif ((.id // "")==G3b)
            then (. + {status: "dispatched", dispatched_at: $now, dispatch_agent: "dev-macro-indicators",
                       dispatch_unit: "A2 (single agent implements VMT-3b + VMT-4 together — shared router.go/main.go + getOrFetchNSOMonthlyExcel cache). VMT-3b = NSO Excel sheet 2.IIPthang IIP; consume live_contract; --cacert GlobalSign; merge gate A2->A3 after BOTH done."})
          elif ((.id // "")==G4)
            then (. + {status: "dispatched", dispatched_at: $now, dispatch_agent: "dev-macro-indicators",
                       dispatch_unit: "A2 (bundled with VMT-3b in ONE agent). VMT-4 = NSO Excel sheet 16.CPI 15 categories; reuse the VMT-3b NSO Excel cache (getOrFetchNSOMonthlyExcel, 6h TTL — first fetch caches, second reads); weights null+is_estimate=true; consume live_contract."})
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
    note: "VN-MACRO-TOOLING A1=VMT-2-BOP DONE (a6d8f1d1, commit dae7e68d, router RAW-verified: 8 in-zone BOP files + router/main wired, NO excelize, offshore_parked IsEstimate=true always / primary E&O false, go test ./... ALL PASS, A1 merge gate SATISFIED). Hygiene finding logged: commit swept ops.md -96L context-bloat trim via non-explicit git add (non-blocking, git-recoverable). -> A1->A2 GATE OPEN: A2 = VMT-3b-GSO + VMT-4-CPI DISPATCHED as ONE dev-macro-indicators agent (shared router.go/main.go + getOrFetchNSOMonthlyExcel NSO-Excel cache — single agent avoids router conflict + redundant fetch; NSO 3-step discovery, --cacert GlobalSign, parse by sheet NAME 2.IIPthang + 16.CPI). On A2 done + green -> merge gate A2->A3 -> dispatch A3=VMT-1a+VMT-1b. SERIAL Zone-A: one dev-macro-indicators agent at a time. VMT-3a-PMI blocked-probe5 (S&P dev-local). VMT-5b.interbank+irs permanent is_estimate. KINHDICH-HOVER-DETAIL chain CLOSED done_verified (e4e4991b). Commit explicit path only."
  }
