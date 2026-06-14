# Router dev-team dispatcher — VN-MACRO-TOOLING architect blueprint DONE (router RAW-verified) -> pm task breakdown.
# architect (a4384d65, commit 675891163d — router RAW-verified 3 files explicit-path: docs/handoffs/ARCH-VN-MACRO-TOOLING.md
#   348L/11 sections + decisions/sprint-VN-MACRO-TOOLING.md 57L + architect.md notebook 20/-1; orch-state UNTOUCHED working==HEAD;
#   NO board mutation in commit, NO foreign sweep) produced the multi-zone technical blueprint.
# CONFIRMED BA zone-split A-D. Per-VMT zones: VMT-1..5 = Zone A (macro-indicators Go domain+app+handlers) + Zone D dep;
#   VMT-6 = Zone C (creditFlowTools.ts extend, ships immediately, BLOCKER-6 degraded is_estimate=true, NOT probe-gated);
#   VMT-7 = Zone B (mcp-server TS handlers + registry); Zone D (pkg/infrastructure/vpsFetch.go, VpsFetchPort in pkg/domain/ports.go)
#   = FIRST, hard prereq to all Zone A parsers.
# 6 blocker resolutions: BLOCKER-1 (FDI/domestic split) PROBE-1 gates VMT-1 bloc_split sub-field only;
#   BLOCKER-2 (SBV BOP) PROBE-2 gates VMT-2; BLOCKER-3+4 (GSO monthly/CPI) PROBE-3 gates VMT-3 GSO fields + VMT-4;
#   BLOCKER-5 (SBV interbank/OMO/IRS) PROBE-4 gates VMT-5 interbank+OMO fields only (IRS permanently is_estimate=true);
#   BLOCKER-6 (VIRA/VARA) NO probe — VMT-6 ships degraded immediately. PROBE-1..4 via ops-vps-fetch (VN geo-blocked, Vinahost VPS).
# DDD risk: Zone D LOW, Zone A MED (parser-F1/div-by-zero/partial-series/cache-atomic; recurring-bug escalation at 2+ commits/file),
#   Zone B LOW (Zod AFTER Zone A DTO commit), Zone C LOW (additive field; PR diff must confirm no is_estimate removed).
# Exec order: WAVE-1 = fan out PROBE-1..4 (ops-vps-fetch) + Zone D vpsFetch + Zone C VMT-6 in PARALLEL (no blocking deps);
#   Zone A parsers follow each probe return; Zone B wires to Zone A after endpoints live; VMT-7 register = final gate before QA skill switch-on.
# This write (ONE atomic temp->rename): advance BA-VN-MACRO-TOOLING in in_progress[]; status ba-spec-done->architect-design-done;
#   next_agent architect->pm; stamp arch_commit + arch_handoff_path + arch_zone_assignments + arch_blocker_resolutions +
#   arch_exec_order + arch_ddd_verdict + router_arch_reverify_verdict. head -> active/next=pm.
# GUARD: refuse unless head.next_agent=="architect" AND BA-VN-MACRO-TOOLING in in_progress[] with next_agent=="architect".
# Usage: jq --arg now "$NOW" -f scripts/router-d14-vnmacro-architect-to-pm-20260614.jq docs/data/orch/orch-state.json
def TASK: "BA-VN-MACRO-TOOLING";
($ARGS.named.now) as $now
| ([.task_board.in_progress[]? | select(type=="object" and ((.id // "")==TASK))][0]) as $t
| if (.head.next_agent != "architect") then error("head.next_agent != architect (\(.head.next_agent)) — refuse")
  elif ($t == null) then error("BA-VN-MACRO-TOOLING not in in_progress[] — refuse")
  elif (($t.status // "") != "ba-spec-done") then error("task status != ba-spec-done (\($t.status)) — refuse")
  elif (($t.next_agent // null) != "architect") then error("task next_agent != architect (\($t.next_agent)) — refuse")
  else . end
| .task_board.in_progress = [
    .task_board.in_progress[] | if (type=="object" and ((.id // "")==TASK))
      then (. + {
        status: "architect-design-done",
        next_agent: "pm",
        arch_design_done_at: $now,
        arch_commit: "675891163d",
        arch_handoff_path: "docs/handoffs/ARCH-VN-MACRO-TOOLING.md",
        arch_zone_assignments: "VMT-1..5=Zone A (apps/macro-indicators Go domain+app+handlers) + Zone D dep; VMT-6=Zone C (creditFlowTools.ts extend, ships immediately degraded is_estimate=true, NOT probe-gated); VMT-7=Zone B (mcp-server TS handlers + registry.ts); Zone D=apps/macro-indicators/pkg/infrastructure/vpsFetch.go (VpsFetchPort in pkg/domain/ports.go) = FIRST, hard prereq to all Zone A parsers.",
        arch_blocker_resolutions: "BLOCKER-1 FDI/domestic split PROBE-1 gates VMT-1 bloc_split sub-field ONLY (total+hs_attribution NOT gated); BLOCKER-2 SBV BOP PROBE-2 gates VMT-2; BLOCKER-3+4 GSO monthly/CPI MERGED into PROBE-3 gates VMT-3 GSO fields + VMT-4 (PMI not gated, S&P not geo-blocked); BLOCKER-5 SBV interbank/OMO/IRS PROBE-4 gates VMT-5 interbank 1w + OMO outstanding ONLY (IRS permanently is_estimate=true, policy_rates/SJC/fx_coupling not gated); BLOCKER-6 VIRA/VARA NO probe — VMT-6 ships degraded is_estimate=true immediately. PROBE-1..4 ALL via ops-vps-fetch (VN geo-blocked -> Vinahost VPS).",
        arch_exec_order: "WAVE-1 (parallel, no blocking deps): PROBE-1..4 via ops-vps-fetch + Zone D vpsFetch.go + Zone C VMT-6. WAVE-2: Zone A parsers follow each probe return. WAVE-3: Zone B MCP handlers wire to Zone A after endpoints live. FINAL GATE: VMT-7 register -> QA skill switch-on verification (macro-health-read + trade-fx-pressure-decomp flip is_estimate=false).",
        arch_ddd_verdict: "Zone D LOW (identical to SBVRateSQLiteAdapter pattern, pure proxy, TLS --cacert not -k); Zone A MED (parser-F1 probe-gate enforced; div-by-zero processing-margin domain unit test mandatory; partial-series per-series is_estimate not whole-response; cache atomic SQL txn; recurring-bug escalation at 2+ commits same file); Zone B LOW (thin proxy, Zod AFTER Zone A DTO commit, tsc --noEmit parity VMT-7); Zone C LOW (additive field; PR diff confirms no is_estimate removed; VIRA/VARA fetch in infrastructure/fetchers/ not handler).",
        router_arch_reverify_verdict: "RAW-RE-VERIFIED INDEPENDENTLY (not the architect badge): git show 675891163d --stat = EXACTLY 3 files explicit-path (docs/handoffs/ARCH-VN-MACRO-TOOLING.md +348/11 sections, decisions/sprint-VN-MACRO-TOOLING.md +57, architect.md notebook +20/-1); NO orch-state/task_board/signal_queue in commit (grep CLEAN); orch-state working==HEAD (architect left board for router); handoff doc 31875 bytes, sections Zone-Split Rationale/Verified Paths/Design Decisions/Blocker Design Resolutions(x6)/DDD Risk Review/BUILD-STANDARD/Probe Dispatch Plan/Execution Order/Scan Clean/RETURN, VMT-1..7 x41 + BLOCKER-1..6 x17. READY for pm: break into per-zone atomic dev tasks, enforce probe-gate before parser commits."
      })
      else . end
  ]
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "BA-VN-MACRO-TOOLING",
    next_agent: "pm",
    note: "VN-MACRO-TOOLING architect blueprint DONE (a4384d65, commit 675891163d, router RAW-verified 3 files explicit-path: docs/handoffs/ARCH-VN-MACRO-TOOLING.md 348L/11 sections + decisions journal + architect notebook; orch-state untouched; NO board mutation/foreign sweep). CONFIRMED zone-split A-D. VMT-1..5=Zone A macro-indicators Go +Zone D dep; VMT-6=Zone C creditFlowTools.ts (ships degraded immediately); VMT-7=Zone B mcp-server TS+registry; Zone D vpsFetch.go FIRST. 6 blockers resolved: PROBE-1..4 via ops-vps-fetch gate VMT-1 bloc_split/VMT-2/VMT-3+4/VMT-5 interbank+OMO; BLOCKER-6 VIRA/VARA NO probe VMT-6 degraded. DDD: Zone A MED, others LOW. -> pm: break into per-zone atomic dev tasks, enforce probe-gate-before-parser, WIP limit, WAVE-1 parallel (PROBE-1..4 + Zone D + Zone C). Chain SPRINT-M ba->architect->pm DONE at pm. VN sources GEO-BLOCKED -> Vinahost VPS; fail-closed never fabricate (is_estimate/confidence); contract from LIVE payload not schema comment; HNX TLS --cacert. ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15. KINHDICH-HOVER-ENRICH-FE done_verified. WIP=2 (this + ARCH-CRON passive). Commit explicit path only."
  }
