# Router dev-team — DUAL ADVANCE (two independent chains, ONE atomic temp->rename):
#   CHAIN A (KINHDICH-HOVER-DETAIL): qa APPROVED (commit 69e7a8b0, router RAW-corroborated served-chunk) -> po final signoff.
#   CHAIN B (VN-MACRO-TOOLING): pm WAVE-2 breakdown done (commit 6fa59b18, router RAW-verified) -> advance head pm->dev,
#     mark A1=VMT-2-BOP dispatched, hand dev-macro-indicators the live_contract (SERIALIZED Zone-A, one task at a time).
#
# CHAIN A RAW-VERIFY (not the qa badge):
#   git show 69e7a8b0 --stat = EXACTLY 3 files (qa.md +6, session 2026-06-13-qa.md +4, TASK_REPORT_KINHDICH-HOVER-DETAIL.md +111);
#   NO board/orch-state/foreign capture; qa VERDICT=APPROVE. Served-chunk corroborated: curl :3001/assets/QueName-CweIuF2T.js
#   67523 bytes -> stateInterpretation x2 + favorable x2 + warning x2 + que-descriptions-detail x1 + labels Trạng thái/Cảnh báo/
#   Xem chi tiết each x1; phases=0 (6-hào table correctly ABSENT from tooltip); FR-3 fallback hoverSummary??coreMeaning in chunk;
#   FR-4 deep-link /dashboard/kinh-dich-reference#que-N in chunk; tsc --noEmit EXIT 0; 13 containers Up (12 peers intact).
#   done_verified TECHNICAL bar already MET at served layer; po gives the final product signoff.
#
# CHAIN B RAW-VERIFY (not the pm badge):
#   git show 6fa59b18 --stat = EXACTLY 2 files (pm.md +60, orch-state.json +128/-8); NO foreign capture; id-line count 20->20
#   unchanged in VN-MACRO sprint tasks; .head left on next_agent=pm (router owns .head — pm did NOT touch it, correct).
#   VMT-2-BOP now carries serial_dispatch_order="A1 (first WAVE-2)" + merge_gate="none" + full live_contract (SBV Liferay
#   article JSON API scopeKey=20117, fetch_recipe, probe_sample scripts/probes/vmt-2-sample.json, parse_rules, sample_q4_2025).
#
# This write: (A) backlog[BA-KINHDICH-HOVER-DETAIL] next_agent qa->po + qa_verdict/qa_commit/qa_task_report/router_qa_reverify_verdict.
#   (B) active_sprints[VN-MACRO-TOOLING].tasks[VMT-2-BOP] status TODO->dispatched + dispatch markers; head pm->dev. 0 new id-lines.
# GUARD: refuse unless ALL — (A) BA-KINHDICH-HOVER-DETAIL in backlog[] next_agent=="qa" AND qa_verdict not already set;
#   (B) head.next_agent=="pm" AND VMT-2-BOP status=="TODO" AND serial_dispatch_order startswith "A1".
# Usage: jq --arg now "$NOW" -f scripts/router-d22-dual-advance-hover-qaApprove-to-po-and-vnmacro-pm-to-dev-20260614.jq docs/data/orch/orch-state.json
def HOVER: "BA-KINHDICH-HOVER-DETAIL";
def SPRINT: "VN-MACRO-TOOLING";
def A1: "VMT-2-BOP";
($ARGS.named.now) as $now
# ---- GUARD ----
| ([.task_board.backlog[]? | select(type=="object" and ((.id // "")==HOVER))][0]) as $h
| ([.task_board.active_sprints[]? | select(type=="object" and ((.id // "")==SPRINT)) | .tasks[]? | select((.id // "")==A1)][0]) as $a1
| if ($h == null) then error("CHAIN-A: BA-KINHDICH-HOVER-DETAIL not in backlog[] — refuse")
  elif (($h.next_agent // "") != "qa") then error("CHAIN-A: hover next_agent != qa (\($h.next_agent)) — refuse")
  elif (($h.qa_verdict // "") != "") then error("CHAIN-A: qa_verdict already set (\($h.qa_verdict)) — already advanced, refuse")
  elif (.head.next_agent != "pm") then error("CHAIN-B: head.next_agent != pm (\(.head.next_agent)) — refuse")
  elif ($a1 == null) then error("CHAIN-B: VMT-2-BOP not found in sprint tasks — refuse")
  elif (($a1.status // "") != "TODO") then error("CHAIN-B: VMT-2-BOP status != TODO (\($a1.status)) — refuse")
  elif (($a1.serial_dispatch_order // "") | startswith("A1") | not) then error("CHAIN-B: VMT-2-BOP serial_dispatch_order not A1 (\($a1.serial_dispatch_order)) — refuse")
  else . end
# ---- CHAIN A: hover qa->po ----
| .task_board.backlog = [
    .task_board.backlog[] | if (type=="object" and ((.id // "")==HOVER))
      then (. + {
        next_agent: "po",
        qa_verdict: "APPROVE",
        qa_done_at: $now,
        qa_agent: "a3fb57d5",
        qa_commit: "69e7a8b0",
        qa_task_report: "docs/handoffs/TASK_REPORT_KINHDICH-HOVER-DETAIL.md",
        router_qa_reverify_verdict: "RAW-CORROBORATED INDEPENDENTLY (not the qa badge). git show 69e7a8b0 --stat = EXACTLY 3 files (qa.md +6 + session 2026-06-13-qa.md +4 + TASK_REPORT_KINHDICH-HOVER-DETAIL.md +111); NO board/orch-state/foreign capture; commit isolated from pm 6fa59b18 (no concurrent-commit cross-race). qa VERDICT=APPROVE. Served-chunk LOAD-BEARING proof corroborated: :3001/assets/QueName-CweIuF2T.js 67523 bytes carries stateInterpretation x2 + favorable x2 + warning x2 + que-descriptions-detail import x1 + VN labels Trạng thái/Cảnh báo/Xem chi tiết each x1; phases=0 (6-hào table correctly ABSENT from tooltip — reference-page only); FR-3 fallback hoverSummary??coreMeaning present in chunk; FR-4 deep-link /dashboard/kinh-dich-reference#que-N present; tsc --noEmit EXIT 0; 13 containers Up (12 peers intact). done_verified TECHNICAL bar MET at served layer -> po final product signoff to close done_verified."
      })
      else . end
  ]
# ---- CHAIN B: VMT-2 dispatched ----
| .task_board.active_sprints = [
    .task_board.active_sprints[] | if (type=="object" and ((.id // "")==SPRINT))
      then ( .tasks = [
        .tasks[]
        | if ((.id // "")==A1)
            then (. + {status: "dispatched", dispatched_at: $now, dispatch_agent: "dev-macro-indicators",
                       dispatch_note: "A1 first WAVE-2 serial Zone-A. dev consumes live_contract (SBV Liferay JSON, NO Excel/PDF). On dev-done -> merge gate A1->A2 before VMT-3b+VMT-4 dispatched. SERIALIZE (handlers_vmt/usecases_vmt/dtos_vmt shared, MED recurring-bug)."})
          else . end
      ] )
      else . end
  ]
# ---- CHAIN B: head pm->dev ----
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "BA-VN-MACRO-TOOLING",
    next_agent: "dev",
    note: "VN-MACRO-TOOLING WAVE-2 pm breakdown DONE (ae4d8f2a, commit 6fa59b18, router RAW-verified: pm.md+60 + orch-state+128/-8 ONLY, id-line 20->20 unchanged, .head untouched by pm). Per-parser live_contract attached to each WAVE-2 task; SERIAL order A1=VMT-2 -> [gate] -> A2=VMT-3b+VMT-4 -> [gate] -> A3=VMT-1a+VMT-1b -> [gate] -> A4=VMT-5a -> [gate] -> A5=VMT-5b; excelize added ONCE at A2. -> dev: A1=VMT-2-BOP DISPATCHED to dev-macro-indicators (live_contract: SBV Liferay article JSON API scopeKey=20117, fetch_recipe + probe_sample scripts/probes/vmt-2-sample.json + parse_rules: VN-number period=thousands/comma=decimal, loiVaSaiSot neg=outflow BPM6 no-sign-flip; NO Excel NO PDF). ONE Zone-A task at a time — VMT-3b/4/1a/1b/5a/5b stay TODO behind merge gates. VMT-3a-PMI blocked-probe5 (S&P, dev-local). VMT-5b.interbank+irs permanent is_estimate (no parser). KINHDICH-HOVER-DETAIL separate chain: qa APPROVED (69e7a8b0) -> po final signoff. Commit explicit path only."
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
