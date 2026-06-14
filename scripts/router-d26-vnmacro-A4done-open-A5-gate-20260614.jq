# Router dev-team — VN-MACRO-TOOLING A4 (VMT-5a-LIQUIDITY-STATE-NO-GATE) DONE (router RAW-verified) -> open A4->A5 merge gate, dispatch A5 (FINAL Zone-A).
# dev-macro-indicators (agent a937e5e2, commit 226be604) implemented VMT-5a: POST /liquidity-state = policy_rates + SJC-gold-gap + fx_coupling + IRS.
# ROUTER INDEPENDENT RAW-VERIFY (not the dev badge):
#   git show 226be604 --stat = EXACTLY 11 files, ALL apps/macro-indicators/** (10: 8 new + router.go + main.go) + dev notebook (1); 1826 insertions.
#   FOREIGN-CAPTURE GUARD passed (grep -vE macro-indicators|dev-notebook = NONE; no orch-state/ops.md/signal sweep) — hygiene HELD 4th commit running.
#   go build ./... PASS (independent); go test ./... -count=1 ALL GREEN (11 pkgs incl pkg/domain + pkg/application where anchors live).
#   LOAD-BEARING INVARIANTS RAW-confirmed in source (not the dev anchor badge):
#     IRS is_estimate=true PERMANENT incl ERROR path: services_vmt_liquidity.go:41 BuildIRSField always true (DD-6, no input dep);
#       usecases_vmt_liquidity.go:180 ALWAYS true; usecases:199,204 error path keeps IsEstimate=true (fail-closed) — DD-6 NEVER flips.
#     SJC gap fail-closed: services:80 IsEstimate=true when SJC absent (DD-7 no crawler row -> true in practice); :91 false only when both DB vals present.
#     market.db = LIVE NAMED VOLUME: adapters_vmt_sjc_fx.go:89-91 + main.go:94 DB_PATH default /app/data/market.db (NOT host ./data decoy), file:%s?mode=ro.
#     NO new crawl/fetch (DD-7: SJCPriceMnVND=0 permanent, no SJC crawler); NO new dep (go.mod UNCHANGED — x/net/html already indirect; HTML+SQLite only).
#     TLS hardened: adapters:404 InsecureSkipVerify:false explicit; zero -k anywhere.
#     Route wired: router.go:106 r.Post("/liquidity-state", ...) guarded cfg.LiquidityState!=nil; main.go:117 NewLiquidityStateUseCase wired.
#   golangci-lint 0 (dev badge). A4 merge gate SATISFIED (committed to main, build/tests green — NO branches policy: commit-to-main == merge).
# This write (ONE atomic temp->rename):
#   (1) VMT-5a status dispatched->done + done markers + router_dev_reverify_verdict.
#   (2) Open A4->A5 (FINAL): VMT-5b (TODO) -> dispatched as A5 (SINGLE task, interbank+OMO; OMO from SBV Liferay HTML net-outstanding tally;
#       interbank_1w is_estimate=true PERMANENT per architect Decision B — dttktt.sbv.gov.vn 100% packet loss from VPS).
#   (3) head note refresh; next_agent stays dev (A5 is dev work). 0 new id-lines.
# GUARD: refuse unless head.next_agent=="dev" AND VMT-5a=="dispatched" AND VMT-5b=="TODO".
# Usage: jq --arg now "$NOW" -f scripts/router-d26-vnmacro-A4done-open-A5-gate-20260614.jq docs/data/orch/orch-state.json
def SPRINT: "VN-MACRO-TOOLING";
def A4: "VMT-5a-LIQUIDITY-STATE-NO-GATE";
def A5: "VMT-5b-LIQUIDITY-STATE-INTERBANK-OMO";
($ARGS.named.now) as $now
| ([.task_board.active_sprints[]? | select(type=="object" and ((.id // "")==SPRINT)) | .tasks[]?]) as $tasks
| ([$tasks[] | select((.id // "")==A4)][0]) as $a4
| ([$tasks[] | select((.id // "")==A5)][0]) as $a5
| if (.head.next_agent != "dev") then error("head.next_agent != dev (\(.head.next_agent)) — refuse")
  elif ($a4 == null) then error("VMT-5a (A4) not found — refuse")
  elif (($a4.status // "") != "dispatched") then error("VMT-5a status != dispatched (\($a4.status)) — refuse")
  elif ($a5 == null) then error("VMT-5b (A5) not found — refuse")
  elif (($a5.status // "") != "TODO") then error("VMT-5b status != TODO (\($a5.status)) — refuse")
  else . end
| .task_board.active_sprints = [
    .task_board.active_sprints[] | if (type=="object" and ((.id // "")==SPRINT))
      then ( .tasks = [
        .tasks[]
        | if ((.id // "")==A4)
            then (. + {status: "done", done_at: $now, done_commit: "226be604", done_agent: "a937e5e2",
                       router_dev_reverify_verdict: "RAW-VERIFIED (not the dev badge): git show 226be604 --stat = EXACTLY 11 files, ALL apps/macro-indicators/** (10) + dev notebook (1), 1826 insertions; FOREIGN-CAPTURE GUARD passed (no orch-state/ops.md/signal sweep — hygiene HELD 4th commit). go build ./... PASS + go test ./... -count=1 ALL GREEN (11 pkgs, independent). INVARIANTS RAW-confirmed in source: IRS is_estimate=true PERMANENT incl error path (services:41 BuildIRSField always true DD-6; usecases:180 ALWAYS; usecases:199,204 error path keeps true); SJC gap fail-closed (services:80 true when SJC absent, DD-7 no crawler row); market.db = LIVE named volume (adapters:89-91 + main.go:94 DB_PATH default /app/data/market.db NOT host ./data, mode=ro); NO new crawl (DD-7 SJCPriceMnVND=0) NO new dep (go.mod UNCHANGED, HTML+SQLite only); TLS hardened (adapters:404 InsecureSkipVerify:false explicit, no -k); route POST /liquidity-state wired (router.go:106 + main.go:117). golangci-lint 0. A4 merge gate SATISFIED."})
          elif ((.id // "")==A5)
            then (. + {status: "dispatched", dispatched_at: $now, dispatch_agent: "dev-macro-indicators",
                       dispatch_unit: "A5 (FINAL serial Zone-A task — VMT-5b interbank+OMO; A4->A5 merge gate SATISFIED). NEW FILE parsers_vmt_sbv_interbank_omo.go ONLY (+ wire into existing liquidity-state usecase/handler from A4 — extend, do not duplicate). OMO from www.sbv.gov.vn nghiep-vu-thi-truong-mo Liferay HTML (Mua ky han add/reverse-repo + Ban ky han absorb + Tin phieu; net_outstanding = sum(add) - sum(absorb), maturity-date aware; --cacert NOT -k, NO VPS proxy — same SBV site as BOP/A4). probe_sample scripts/probes/vmt-4-sample.json (OMO section; June-12-2026 408KB HTML OMO PASS — confirm each month release URL pattern stable). interbank_1w is_estimate=true PERMANENT + rate_1w_pct=null + blocked_reason='dttktt.sbv.gov.vn unreachable from VPS (100% packet loss)' (architect Decision B — NEVER flip false, no public alternative: WiData off-limits, NSO narrative unreliable, no Bloomberg/Refinitiv). irs.is_estimate=true PERMANENT (DD-6, same pattern). On done+green -> A5 is FINAL WAVE-2 task: WAVE-2 serial chain CLOSED -> then VMT-7a-e handler-registration wave + VMT-7-REGISTER. Explicit-path commit ONLY (apps/macro-indicators/** + your notebook — NEVER git add -A/orch-state/ops.md/foreign notebooks)."})
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
    note: "VN-MACRO-TOOLING A4=VMT-5a-LIQUIDITY-STATE-NO-GATE DONE (a937e5e2, commit 226be604, router RAW-verified: 11 files ALL in-zone + dev notebook 1826 ins, foreign-capture guard passed/hygiene HELD 4th commit, go build + go test ./... ALL GREEN 11 pkgs, IRS+SJC is_estimate=true fail-closed incl error path, market.db LIVE named volume /app/data NOT host ./data, NO new crawl/dep, TLS InsecureSkipVerify:false, route /liquidity-state wired, A4 merge gate SATISFIED). -> A4->A5 GATE OPEN (FINAL): A5 = VMT-5b-LIQUIDITY-STATE-INTERBANK-OMO DISPATCHED to dev-macro-indicators (SINGLE task, NEW parsers_vmt_sbv_interbank_omo.go: OMO net-outstanding tally from SBV nghiep-vu-thi-truong-mo Liferay HTML, --cacert; interbank_1w is_estimate=true PERMANENT Decision B dttktt 100% packet loss; irs DD-6 permanent). VMT-5b is the FINAL serial Zone-A task — on done+green WAVE-2 serial chain CLOSED -> VMT-7a-e + VMT-7-REGISTER handler-registration wave next. SERIAL Zone-A: one dev-macro-indicators agent at a time. VMT-3a-PMI blocked-probe5 (S&P dev-local). KINHDICH-HOVER-DETAIL chain CLOSED done_verified (e4e4991b). Commit explicit path only."
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
