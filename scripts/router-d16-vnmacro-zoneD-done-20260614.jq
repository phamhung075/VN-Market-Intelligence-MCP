# Router dev-team — VN-MACRO-TOOLING Zone D (VMT-D-VPSFETCH) DONE (router RAW-verified) -> unblock WAVE-2 ungated parsers.
# dev-macro-indicators (a318eb3f, commit 46095c3d — router RAW-verified 4 files explicit-path: vpsFetch.go 215L + vpsFetch_test.go
#   256L/7 tests + domain/ports.go VpsFetchPort/VpsFetchOptions +28 + cmd/server/main.go composition +8; NO board file in commit;
#   orch-state working==HEAD; DDD Fence-A held [domain/ports.go imports only context+time, zero infra leak]; TLS InsecureSkipVerify
#   ALWAYS false + VPS_CACERT_PATH->x509.CertPool = --cacert posture; go build/vet exit0, go test 12 pkgs pass, G12 18/18 + 2/2).
# HONEST: compile+unit green ONLY — the live VPS proxy path (125.212.251.27:3128) was NOT exercised (no fetch target yet);
#   live-path proof deferred to first Zone A parser integration (VMT-1a). Therefore status=done, NOT done_verified (no false-green).
# This write (ONE atomic temp->rename): in active_sprints[VN-MACRO-TOOLING].tasks set VMT-D-VPSFETCH dispatched->done + stamp;
#   unblock the 3 WAVE-2 UNGATED parsers (dep == [VMT-D-VPSFETCH] only) TODO->ready: VMT-1a, VMT-3a, VMT-5a.
#   (VMT-2 stays TODO — also dep PROBE-2, still running. head next_agent stays dev.)
# GUARD: refuse unless VMT-D-VPSFETCH currently status=="dispatched" in the VN-MACRO sprint.
# Usage: jq --arg now "$NOW" -f scripts/router-d16-vnmacro-zoneD-done-20260614.jq docs/data/orch/orch-state.json
def SPRINT: "VN-MACRO-TOOLING";
def UNBLOCK: ["VMT-1a-TRADE-BALANCE-TOTAL-HS","VMT-3a-MACRO-INDICATORS-PMI","VMT-5a-LIQUIDITY-STATE-NO-GATE"];
($ARGS.named.now) as $now
| ([.task_board.active_sprints[]? | select(type=="object" and ((.id // "")==SPRINT)) | .tasks[]? | select((.id // "")=="VMT-D-VPSFETCH")][0]) as $d
| if ($d == null) then error("VMT-D-VPSFETCH not found in VN-MACRO sprint — refuse")
  elif (($d.status // "") != "dispatched") then error("VMT-D-VPSFETCH status != dispatched (\($d.status)) — refuse")
  else . end
| .task_board.active_sprints = [
    .task_board.active_sprints[] | if (type=="object" and ((.id // "")==SPRINT))
      then ( .tasks = [
        .tasks[]
        | if ((.id // "")=="VMT-D-VPSFETCH")
            then (. + {
              status: "done",
              done_at: $now,
              dev_commit: "46095c3d",
              router_verdict: "RAW-VERIFIED done (NOT done_verified — live VPS path deferred to VMT-1a): 4 files explicit-path, no board in commit, DDD Fence-A held (domain imports context+time only), TLS InsecureSkipVerify=false + VPS_CACERT_PATH->x509 (--cacert), go build/vet exit0 + 12-pkg test pass + G12 18/18+2/2. Compile+unit green; VPS proxy path not exercised live (no fetch target) — first Zone A parser integration proves it. Unblocks all Zone A (VpsFetchPort wired)."
            })
          elif ((.id // "") as $id | UNBLOCK | index($id))
            then (. + {status: "ready", unblocked_at: $now, unblocked_by: "VMT-D-VPSFETCH done (46095c3d)"})
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
    note: "VN-MACRO-TOOLING Zone D VMT-D-VPSFETCH DONE (a318eb3f, commit 46095c3d, router RAW-verified 4 files explicit-path: vpsFetch.go+test+VpsFetchPort domain port+composition; DDD Fence-A held, TLS --cacert posture InsecureSkipVerify=false, go build/vet/test green G12 18/18+2/2). status=done NOT done_verified — live VPS-proxy path deferred to first Zone A parser (compile+unit green only, no fetch target yet, no false-green). UNBLOCKED WAVE-2 ungated parsers (dep=VMT-D only) -> ready: VMT-1a-TRADE-BALANCE-TOTAL-HS (leverage #1), VMT-3a-MACRO-INDICATORS-PMI (S&P not geo-blocked), VMT-5a-LIQUIDITY-STATE-NO-GATE. HOLDING WAVE-2 DISPATCH for ops-vps-fetch probe returns (a3e5e573 running) — Zone A parsers hit the SAME geo-blocked sources the probes characterize live; contract-from-live-payload is a hard rule, dispatch each parser once its source probe lands. Still running: ops-vps-fetch PROBE-1..4 (a3e5e573), dev-mcp-server VMT-6 Zone C (a3290349). ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15. KINHDICH-HOVER-ENRICH-FE done_verified. Commit explicit path only."
  }
