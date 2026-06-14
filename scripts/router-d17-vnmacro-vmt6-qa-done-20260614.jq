# Router dev-team — VN-MACRO-TOOLING VMT-6-CREDIT-FLOW-EXTEND QA-APPROVED (router RAW-verified) -> done.
# qa (af6eb5c5) gate APPROVED the Zone C degraded stub. Router-independent prior RAW-verify of the 2 dev commits already
#   logged (code 105b07c4 purely additive is_estimate-ONLY-added; board 75bd3032 bounded to VMT-6's own task, no .head touch,
#   0 foreign id-lines, working tree clean). QA evidence: bun tsc --noEmit exit0; 6/6 VMT-6 tests + 25/25 full credit-flow
#   suite (3 files, 59 expect) + 19/19 pre-existing non-VMT-6 regression clear; grep-diff proof zero `-` lines touching
#   mortgageIsEstimate/yoyIsEstimate/static_seed (purely additive is_estimate semantics); degradation HONEST — stub all
#   fields null/empty + is_estimate:true + note "VIRA/VARA no machine-readable source confirmed — manual data required",
#   no fabricated numbers, fail-closed intact; mock-guard exit2 CAUTION non-blocking (flagged a // TODO line, not data).
# HONEST: status=done NOT done_verified. The new survey_distribution field is compile+test green but NOT yet served live —
#   creditFlowTools.ts ships in the mcp-server runtime, which is NOT rebuilt here; the field reaches the gateway tool surface
#   only after the mcp-server container rebuild at the VMT-7 register/skill-switch-on gate. No false-green (passive-health lesson).
# This write (ONE atomic temp->rename): in active_sprints[VN-MACRO-TOOLING].tasks set VMT-6 REVIEW->done + stamp qa verdict.
#   .head UNTOUCHED in body except the note refresh below (router owns head). No other task mutated. 0 new id-lines.
# GUARD: refuse unless VMT-6-CREDIT-FLOW-EXTEND currently status=="REVIEW" in the VN-MACRO sprint.
# Usage: jq --arg now "$NOW" -f scripts/router-d17-vnmacro-vmt6-qa-done-20260614.jq docs/data/orch/orch-state.json
def SPRINT: "VN-MACRO-TOOLING";
def TASK: "VMT-6-CREDIT-FLOW-EXTEND";
($ARGS.named.now) as $now
| ([.task_board.active_sprints[]? | select(type=="object" and ((.id // "")==SPRINT)) | .tasks[]? | select((.id // "")==TASK)][0]) as $v
| if ($v == null) then error("VMT-6 not found in VN-MACRO sprint — refuse")
  elif (($v.status // "") != "REVIEW") then error("VMT-6 status != REVIEW (\($v.status)) — refuse")
  else . end
| .task_board.active_sprints = [
    .task_board.active_sprints[] | if (type=="object" and ((.id // "")==SPRINT))
      then ( .tasks = [
        .tasks[]
        | if ((.id // "")==TASK)
            then (. + {
              status: "done",
              done_at: $now,
              qa_agent: "af6eb5c5",
              qa_verdict: "APPROVED",
              router_verdict: "RAW-VERIFIED done (NOT done_verified — runtime not rebuilt; field served only after mcp-server rebuild at VMT-7). Prior router-independent RAW-verify: code 105b07c4 purely additive (is_estimate ONLY added, zero existing flag removed/flipped), board 75bd3032 bounded to VMT-6 task (no .head, 0 foreign id-lines, working tree clean). QA af6eb5c5: bun tsc --noEmit exit0; 6/6 VMT-6 + 25/25 full credit-flow suite + 19/19 pre-existing regression clear; grep-diff zero `-` on mortgageIsEstimate/yoyIsEstimate/static_seed; degradation honest (all fields null/empty, is_estimate:true, note VIRA/VARA manual-data-required, no fabricated numbers, fail-closed intact); mock-guard exit2 CAUTION non-blocking. Compile+unit green; live tool-surface deferred to VMT-7 rebuild — no false-green."
            })
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
    note: "VN-MACRO-TOOLING VMT-6-CREDIT-FLOW-EXTEND DONE (Zone C, dev-mcp-server commit 105b07c4, board 75bd3032, QA af6eb5c5 APPROVED, router RAW-verified). bun tsc --noEmit exit0; 6/6 VMT-6 + 25/25 full credit-flow suite + 19/19 pre-existing regression clear; is_estimate purely additive (zero existing flag removed); degraded stub HONEST (all fields null/empty, is_estimate:true, note VIRA/VARA manual-data-required, fail-closed, no fabricated numbers). status=done NOT done_verified — survey_distribution field served live only after mcp-server container rebuild at VMT-7 register/skill-switch-on gate (no false-green). WAVE-1 now: VMT-D-VPSFETCH done (46095c3d) + VMT-6 done (105b07c4); PROBE-1..4 dispatched (ops-vps-fetch a3e5e573 RUNNING); WAVE-2 ungated parsers VMT-1a/3a/5a ready, HELD for probe returns (contract-from-live-payload hard rule — Zone A parsers hit the SAME geo-blocked sources the probes characterize live). On probe return: dispatch each Zone A parser (dev-macro-indicators) against its probe recipe, VMT-1a first (leverage #1, proves vpsFetch live path), SERIALIZE same-service parsers (Zone-A MED recurring-bug guard). ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15. KINHDICH 1-column FE fix committed (1aa9dc31) — ops a334dc7a frontend rebuild RUNNING (served-bundle verify gate). Commit explicit path only."
  }
