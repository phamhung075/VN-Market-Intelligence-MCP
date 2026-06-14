# Router dev-team — VN-MACRO-TOOLING WAVE-1 PROBE-1..4 DONE (router RAW-verified) -> architect probe-fold.
# ops-vps-fetch (a3e5e573, commit f70d1b5a — router RAW-verified 13 files explicit-path: ops-vps-fetch.md notebook +
#   4 recon.md (customs/sbv-bop/nso-monthly/sbv-interbank-omo) + 4 sample.json + 4 probe.sh; NO board file in commit;
#   orch-state working==HEAD; .head UNTOUCHED [next_agent=dev]; NO KINHDICH/ARCH-CRON task touched) ran the 4 VPS recon probes.
# PROBE OUTCOMES (router records verbatim from probe RETURN, for the architect fold):
#   PROBE-1 customs.gov.vn = BLOCKED_JS_RENDER (SPA shell only; bridge API HTTP400; backend DNS NXDOMAIN). VMT-1b.bloc_split
#     unblockable by direct fetch -> probe proposes FALLBACK: NSO FDI Excel 12.FDI cross-ref export total -> bloc share ESTIMATE.
#     ARCHITECT DECISION REQUIRED before any dev codes bloc_split (fallback = derived estimate, is_estimate semantics).
#   PROBE-2 SBV BOP = PASS. Live recipe + Q4-2025 payload captured (loiVaSaiSot E&O negative=outflow BPM6, VN number format
#     period=thousands comma=decimal, quarter field Date48362898/Select02257401). VMT-2 has a LIVE contract now.
#   PROBE-3 NSO/GSO monthly Excel = PASS. 3-step fetch + GlobalSign intermediate cacert one-time VPS setup; 19-sheet ZIP parse
#     by sheet NAME (2.IIPthang/12.FDI/13.Tongmuc/16.CPI); CPI 15 categories. VMT-3b + VMT-4 have LIVE contracts now.
#   PROBE-4 SBV OMO+interbank = PARTIAL. OMO=PASS (Liferay HTML table, Mua/Ban ky han add/absorb, net outstanding NOT published
#     -> parser maintains rolling tally). interbank dttktt.sbv.gov.vn = BLOCKED (100% packet loss from VPS, Oracle WebCenter).
#     VMT-5b.omo has a LIVE contract; VMT-5b.interbank ARCHITECT ESCALATION (3 opts: alt endpoint / permanent is_estimate / SBV IP-whitelist).
# This write (ONE atomic temp->rename): in active_sprints[VN-MACRO-TOOLING].tasks set PROBE-1..4 dispatched->done + stamp probe_verdict.
#   Advance parent BA-VN-MACRO-TOOLING in in_progress[] next_agent dev->architect (probe-fold pass). head -> active/next=architect.
#   NO parser task status changed here (architect folds the live contracts into per-parser handoffs before dev dispatch — the
#   contract-from-live-payload hard rule: dev consumes the probe recipe, never a schema-comment guess). 0 new id-lines.
# GUARD: refuse unless ALL of PROBE-1..4 currently status=="dispatched" in the VN-MACRO sprint AND head.next_agent=="dev".
# Usage: jq --arg now "$NOW" -f scripts/router-d18-vnmacro-probes-done-to-architect-20260614.jq docs/data/orch/orch-state.json
def SPRINT: "VN-MACRO-TOOLING";
def PARENT: "BA-VN-MACRO-TOOLING";
def PROBES: ["PROBE-1","PROBE-2","PROBE-3","PROBE-4"];
def VERDICT:
  { "PROBE-1": "BLOCKED_JS_RENDER (customs.gov.vn SPA shell, bridge API HTTP400, backend DNS NXDOMAIN). Direct fetch impossible. Probe proposes FALLBACK NSO FDI Excel 12.FDI cross-ref export total -> bloc share ESTIMATE. ARCHITECT must confirm fallback design + is_estimate=true before VMT-1b dev. recon docs/vps-sources/vmt-customs-probe/recon.md."
  , "PROBE-2": "PASS. Live recipe captured (SBV o/article v1.0 articles scopeKey=20117 contentStructureId=10063168, system cacert OK). Q4-2025 payload: 10+ BOP components, loiVaSaiSot E&O negative=outflow (BPM6 no sign flip), VN number format period=thousands comma=decimal, quarter Date48362898/Select02257401. VMT-2 LIVE contract ready. recon docs/vps-sources/vmt-sbv-bop-probe/recon.md + scripts/probes/vmt-2-sample.json."
  , "PROBE-3": "PASS. 3-step fetch (nso.gov.vn monthly report -> press page -> xlsx) + GlobalSign intermediate cacert one-time VPS setup (gsrsaovsslca2018). 19-sheet Excel ZIP, parse by sheet NAME (2.IIPthang/12.FDI/13.Tongmuc/16.CPI), CPI 15 categories. May-2026 live data captured. VMT-3b + VMT-4 LIVE contract ready (Excel parse openpyxl/excelize, NOT HTML). recon docs/vps-sources/vmt-nso-monthly-probe/recon.md + scripts/probes/vmt-3-sample.json."
  , "PROBE-4": "PARTIAL. OMO=PASS (SBV nghiep-vu-thi-truong-mo Liferay 408KB HTML table; Mua ky han=ADD reverse-repo, Ban ky han/Tin phieu=ABSORB; net outstanding NOT published -> parser rolling add/absorb tally w/ maturity dates; June-12-2026 sample). interbank dttktt.sbv.gov.vn (202.58.245.101)=BLOCKED 100% packet loss from VPS (Oracle WebCenter). IRS permanently is_estimate=true (DD-6). VMT-5b.omo LIVE contract ready; VMT-5b.interbank ARCHITECT ESCALATION 3 opts (alt endpoint / permanent is_estimate / SBV IP-whitelist). recon docs/vps-sources/vmt-sbv-interbank-omo-probe/recon.md + scripts/probes/vmt-4-sample.json."
  };
($ARGS.named.now) as $now
| ([.task_board.active_sprints[]? | select(type=="object" and ((.id // "")==SPRINT)) | .tasks[]? | select((.id // "")|IN(PROBES[]))]) as $pr
| ([.task_board.in_progress[]? | select(type=="object" and ((.id // "")==PARENT))][0]) as $parent
| if (.head.next_agent != "dev") then error("head.next_agent != dev (\(.head.next_agent)) — refuse")
  elif (($pr | length) != 4) then error("expected 4 PROBE tasks, found \($pr|length) — refuse")
  elif ([$pr[] | select((.status // "") != "dispatched")] | length) > 0
    then error("not all PROBE-1..4 are status=dispatched — refuse")
  elif ($parent == null) then error("BA-VN-MACRO-TOOLING not in in_progress[] — refuse")
  else . end
# 1. mark PROBE-1..4 done + stamp verdict
| .task_board.active_sprints = [
    .task_board.active_sprints[] | if (type=="object" and ((.id // "")==SPRINT))
      then ( .tasks = [
        .tasks[]
        | if ((.id // "")|IN(PROBES[]))
            then (. + {status: "done", done_at: $now, probe_commit: "f70d1b5a",
                       probe_verdict: (VERDICT[(.id)] // "done")})
          else . end
      ] )
      else . end
  ]
# 2. advance parent -> architect probe-fold pass
| .task_board.in_progress = [
    .task_board.in_progress[] | if (type=="object" and ((.id // "")==PARENT))
      then (. + {
        next_agent: "architect",
        probes_done_at: $now,
        probe_fold_pass: "PROBE-1..4 returned (f70d1b5a): 2 PASS (BOP/NSO-monthly) + OMO PASS provide LIVE contracts for VMT-2/3b/4/5b.omo; PROBE-1 customs BLOCKED -> VMT-1b fallback design (NSO FDI cross-ref estimate) needs architect; PROBE-4 interbank BLOCKED -> VMT-5b.interbank 3-option architect decision. Architect to fold each recon into a per-parser live contract + resolve the 2 blockers before dev WAVE-2/3 fan-out (contract-from-live-payload hard rule). Ungated VMT-1a/3a/5a confirm their live source-map in the same pass.",
        router_probe_reverify_verdict: "RAW-VERIFIED done: git show f70d1b5a --stat = 13 files explicit-path (ops-vps-fetch.md notebook + 4 recon.md + 4 sample.json + 4 probe.sh), NO board/orch-state/signal_queue in commit, working tree clean, .head untouched, no KINHDICH/ARCH-CRON touch. 3 PASS 1 BLOCKED_JS_RENDER 1 interbank-BLOCKED matches probe RETURN."
      })
      else . end
  ]
# 3. head -> architect
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "BA-VN-MACRO-TOOLING",
    next_agent: "architect",
    note: "VN-MACRO-TOOLING WAVE-1 PROBE-1..4 DONE (ops-vps-fetch a3e5e573, commit f70d1b5a, router RAW-verified 13 files explicit-path: 4 recon.md + 4 sample.json + 4 probe.sh + notebook; no board in commit; .head untouched; no KINHDICH/ARCH-CRON touch). OUTCOMES: PROBE-2 SBV-BOP PASS + PROBE-3 NSO-monthly-Excel PASS + PROBE-4 OMO PASS = LIVE contracts for VMT-2/VMT-3b/VMT-4/VMT-5b.omo. PROBE-1 customs.gov.vn BLOCKED_JS_RENDER -> VMT-1b.bloc_split FALLBACK (NSO FDI 12.FDI cross-ref export total -> bloc share ESTIMATE is_estimate=true) needs ARCHITECT confirm. PROBE-4 interbank dttktt.sbv.gov.vn BLOCKED (100% packet loss from VPS) -> VMT-5b.interbank ARCHITECT ESCALATION 3 opts (alt endpoint / permanent is_estimate / SBV IP-whitelist). -> architect: fold each recon into a per-parser LIVE contract (contract-from-live-payload hard rule — dev consumes probe recipe not schema comment), resolve the 2 BLOCKED sub-fields, confirm ungated VMT-1a/3a/5a live source-map, emit dispatch-ready WAVE-2/3 handoffs. SERIALIZE same-service dev-macro-indicators parsers (Zone-A MED recurring-bug guard). VMT-D-VPSFETCH done (46095c3d) + VMT-6 done (105b07c4). ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15. KINHDICH-HOVER-DETAIL sprint active (BA-KINHDICH-HOVER-DETAIL in flight, separate chain). Commit explicit path only."
  }
