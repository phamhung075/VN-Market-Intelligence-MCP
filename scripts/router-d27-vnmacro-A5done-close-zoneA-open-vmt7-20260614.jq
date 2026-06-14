# Router dev-team — VN-MACRO-TOOLING A5 (VMT-5b-LIQUIDITY-STATE-INTERBANK-OMO) DONE (router RAW-verified) -> CLOSE WAVE-2 serial Zone-A chain; hand VMT-7 Zone-B wave to pm for sequencing.
# dev-macro-indicators (agent aa62d59b, commit 399b4a36) implemented VMT-5b: extend POST /liquidity-state with OMO net-outstanding + interbank_1w (permanent-blocked) blocs.
# ROUTER INDEPENDENT RAW-VERIFY (not the dev badge):
#   git show 399b4a36 --stat = EXACTLY 10 files, ALL apps/macro-indicators/** (9: parsers_vmt_sbv_interbank_omo + _test new, + 5 extended domain/application/main, + 2 _test) + dev notebook (1); 1484 insertions; FOREIGN-CAPTURE GUARD passed (grep -vE macro-indicators|dev-notebook = NONE; no orch-state/ops.md/signal sweep) — hygiene HELD 5th commit; go.mod UNTOUCHED.
#   HEAD == 399b4a36 (committed to main — NO branches policy: commit-to-main == merge gate satisfied).
#   go build ./... PASS (independent); go test ./... -count=1 ALL GREEN (11 pkgs: 5 core incl pkg/domain+pkg/application+pkg/infrastructure + 6 primitive; cmd/* no test files expected). golangci-lint 0 (dev badge).
#   LOAD-BEARING INVARIANTS RAW-confirmed in source (not the dev anchor badge):
#     interbank_1w fail-closed BOTH paths: usecases_vmt_liquidity.go success :259 Rate1WPct=nil ALWAYS + :260 IsEstimate=true ALWAYS + :261 BlockedReason ALWAYS set; error path (errorLiquidityResponse) :297 nil + :298 IsEstimate=true PERMANENT + :299 BlockedReason="dttktt.sbv.gov.vn unreachable from VPS (100% packet loss)" (architect Decision B — NEVER flip false, no public alternative).
#     IRS is_estimate=true PERMANENT incl error path: services_vmt_liquidity.go:55-56 BuildIRSField always true (DD-6); usecases:245 success ALWAYS true; usecases:282 error path IsEstimate=true (fail-closed) — DD-6 NEVER flips.
#     OMO net_outstanding parse: parsers:131 net = TotalAddBnVND - TotalAbsorbBnVND (maturity-date aware tally); :143 ParseOK guard (Add>0 OR Absorb>0); BuildOMOFailed IsEstimate=true fail-closed on parse failure; BuildOMOSuccess IsEstimate=false from parsed. Anchor June-12-2026: Mua ky han 35d=217.45 + 56d=1000.00 -> net_outstanding=1217.45 bn VND (TestParseSBVOMOHTML_AnchorJune2026 + TestBuildOMOSuccess_NetOutstandingAnchor).
#     TLS hardened + NO VPS: parsers:75-81 VPS_CACERT_PATH pattern, InsecureSkipVerify=false ALWAYS, NEVER -k; OMO fetched DIRECT www.sbv.gov.vn nghiep-vu-thi-truong-mo Liferay HTML (same domain as BOP/A4, NO VPS proxy — confirmed PROBE-4).
#     market.db = LIVE NAMED VOLUME: repositories.go:147-149 DB_PATH env default /app/data/market.db (NOT host ./data decoy), :165 file:%s?mode=ro (SJC/FX/policy reads inherited from A4; OMO bloc HTML-only, no DB read).
#   A5 merge gate SATISFIED. WAVE-2 serial Zone-A chain A1->A2->A3->A4->A5 ALL DONE -> CHAIN CLOSED.
# This write (ONE atomic temp->rename):
#   (1) VMT-5b status dispatched->done + done markers + router_dev_reverify_verdict.
#   (2) CLOSE WAVE-2 serial Zone-A; advance head next_agent dev->pm: VMT-7 Zone-B (apps/mcp-server TS MCP-handler proxies) wave is UNSEQUENCED (serial_dispatch_order=null, merge_gate=null) + NEW ZONE (dev-mcp-server not dev-macro-indicators) -> pm owns breakdown: parallelization of VMT-7a-e (separate handler files in tools/macro/, no shared file among them) vs serial, merge-gate before VMT-7-REGISTER (shared registry.ts), per-handler contract (which Zone-A endpoint each proxies + HTTP path + response shape). Mirrors WAVE-1->WAVE-2 pm-breakdown transition (d22).
#   (3) head note refresh. 0 new id-lines (VMT-7 tasks untouched — pm sequences them).
# GUARD: refuse unless head.next_agent=="dev" AND VMT-5b=="dispatched".
# Usage: jq --arg now "$NOW" -f scripts/router-d27-vnmacro-A5done-close-zoneA-open-vmt7-20260614.jq docs/data/orch/orch-state.json
def SPRINT: "VN-MACRO-TOOLING";
def A5: "VMT-5b-LIQUIDITY-STATE-INTERBANK-OMO";
($ARGS.named.now) as $now
| ([.task_board.active_sprints[]? | select(type=="object" and ((.id // "")==SPRINT)) | .tasks[]?]) as $tasks
| ([$tasks[] | select((.id // "")==A5)][0]) as $a5
| if (.head.next_agent != "dev") then error("head.next_agent != dev (\(.head.next_agent)) — refuse")
  elif ($a5 == null) then error("VMT-5b (A5) not found — refuse")
  elif (($a5.status // "") != "dispatched") then error("VMT-5b status != dispatched (\($a5.status)) — refuse")
  else . end
| .task_board.active_sprints = [
    .task_board.active_sprints[] | if (type=="object" and ((.id // "")==SPRINT))
      then ( .tasks = [
        .tasks[]
        | if ((.id // "")==A5)
            then (. + {status: "done", done_at: $now, done_commit: "399b4a36", done_agent: "aa62d59b",
                       router_dev_reverify_verdict: "RAW-VERIFIED (not the dev badge): git show 399b4a36 --stat = EXACTLY 10 files, ALL apps/macro-indicators/** (9) + dev notebook (1), 1484 insertions; FOREIGN-CAPTURE GUARD passed (no orch-state/ops.md/signal sweep — hygiene HELD 5th commit); go.mod UNTOUCHED; HEAD==399b4a36 on main (merge gate satisfied). go build ./... PASS + go test ./... -count=1 ALL GREEN (11 pkgs, independent re-run). INVARIANTS RAW-confirmed in source: interbank_1w fail-closed BOTH paths (usecases:259-261 success Rate1WPct=nil+IsEstimate=true+BlockedReason; :297-299 error path nil+true+'dttktt.sbv.gov.vn unreachable from VPS 100% packet loss' — architect Decision B); IRS is_estimate=true PERMANENT incl error path (services:55-56 BuildIRSField always; usecases:245 success + :282 error both true, DD-6); OMO net=TotalAdd-TotalAbsorb maturity-aware (parsers:131, ParseOK guard :143, BuildOMOFailed fail-closed true / BuildOMOSuccess false-from-parsed; anchor June-12 35d217.45+56d1000.00=net1217.45 bn VND); TLS InsecureSkipVerify=false ALWAYS no -k, OMO DIRECT www.sbv.gov.vn NO VPS (parsers:75-81); market.db LIVE named volume repositories.go:147-149 DB_PATH /app/data/market.db NOT host ./data, :165 mode=ro. golangci-lint 0. A5 merge gate SATISFIED — WAVE-2 serial Zone-A chain CLOSED."})
          else . end
      ] )
      else . end
  ]
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "BA-VN-MACRO-TOOLING",
    next_agent: "pm",
    note: "VN-MACRO-TOOLING A5=VMT-5b-LIQUIDITY-STATE-INTERBANK-OMO DONE (aa62d59b, commit 399b4a36, router RAW-verified: 10 files ALL in-zone + dev notebook 1484 ins, foreign-capture guard passed/hygiene HELD 5th commit, go.mod UNTOUCHED, HEAD on main, go build + go test ./... ALL GREEN 11 pkgs; interbank_1w is_estimate=true+rate null+blocked_reason BOTH paths Decision B; IRS is_estimate=true DD-6 incl error path; OMO net=add-absorb anchor 1217.45 bn fail-closed; TLS InsecureSkipVerify:false no -k DIRECT www.sbv.gov.vn NO VPS; market.db LIVE named volume; A5 merge gate SATISFIED). === WAVE-2 SERIAL ZONE-A CHAIN CLOSED: A1=VMT-2-BOP -> A2=VMT-3b+VMT-4 -> A3=VMT-1a+VMT-1b -> A4=VMT-5a -> A5=VMT-5b ALL DONE. === -> NEXT PHASE head dev->pm: VMT-7 Zone-B wave (apps/mcp-server/src/interface/mcp/tools/macro/ TS MCP-handler thin proxies to the now-live Zone-A HTTP endpoints) is UNSEQUENCED (serial_dispatch_order=null, merge_gate=null) + NEW ZONE (dev-mcp-server) -> pm breaks down: VMT-7a get_vn_trade_balance / 7b get_vn_bop / 7c get_vn_macro_indicators / 7d get_cpi_components / 7e get_vn_liquidity_state (separate handler files in tools/macro/, no shared file among a-e -> parallelizable WIP-gated) THEN merge gate -> VMT-7-REGISTER (registry.ts + discoverability gate, shared file, runs AFTER all 5 handlers exist). pm attaches per-handler contract (Zone-A endpoint URL + HTTP path + response DTO shape) to each. VMT-3a-PMI blocked-probe5 (S&P dev-local). KINHDICH-HOVER-DETAIL chain CLOSED done_verified (e4e4991b). Commit explicit path only."
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
