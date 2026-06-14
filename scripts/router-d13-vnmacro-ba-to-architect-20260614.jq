# Router dev-team dispatcher — VN-MACRO-TOOLING BA spec DONE (router RAW-verified) -> architect multi-zone blueprint.
# BA (a1ed1834, commit 11d318ea — router RAW-verified 2 files explicit-path: docs/REQ_VN-MACRO-TOOLING.md 690L/12 sections
#   + ba.md notebook; orch-state UNTOUCHED working==HEAD; no foreign sweep) produced the requirements decomposition.
#   6 blockers ALL require a live VPS probe before parser (BLOCKER-1..6: FDI/domestic split, SBV BOP format, GSO IIP/retail
#   format, GSO CPI 11-basket, SBV interbank/OMO/IRS, VIRA/VARA machine-readable URL). Recommended zone split A-D
#   (A apps/macro-indicators Go endpoints, B apps/mcp-server TS handlers+VMT-7, C creditFlowTools.ts VMT-6 extend,
#   D macro-indicators pkg/infrastructure shared vpsFetch).
# This write (ONE atomic temp->rename): capture BA-VN-MACRO-TOOLING from ready[]/in_progress[], strip from both,
#   append to in_progress[] with status=ba-spec-done, next_agent=architect, stamp ba_commit + ba_req_path +
#   ba_blockers + zone_split + router_ba_reverify_verdict. head -> active/next=architect.
# GUARD: refuse unless head.next_agent=="ba" AND BA-VN-MACRO-TOOLING present (ready[] or in_progress[]) with next_agent=="ba".
# Usage: jq --arg now "$NOW" -f scripts/router-d13-vnmacro-ba-to-architect-20260614.jq docs/data/orch/orch-state.json
def TASK: "BA-VN-MACRO-TOOLING";
($ARGS.named.now) as $now
| ((.task_board.ready // []) + (.task_board.in_progress // []) | map(select(type=="object" and ((.id // "")==TASK))) | first) as $t
| if (.head.next_agent != "ba") then error("head.next_agent != ba (\(.head.next_agent)) — refuse")
  elif ($t == null) then error("BA-VN-MACRO-TOOLING not in ready[]/in_progress[] — refuse")
  elif (($t.next_agent // null) != "ba") then error("BA task next_agent != ba (\($t.next_agent)) — refuse")
  else . end
# strip the task from BOTH arrays (it lives in one; null-safe on the other)
| .task_board.ready       = [ (.task_board.ready // [])       [] | select((type=="object" and ((.id // "")==TASK)) | not) ]
| .task_board.in_progress = [ (.task_board.in_progress // []) [] | select((type=="object" and ((.id // "")==TASK)) | not) ]
# append advanced task to in_progress[]
| .task_board.in_progress += [
    $t + {
      status: "ba-spec-done",
      lane: "in_progress",
      next_agent: "architect",
      ba_spec_done_at: $now,
      ba_commit: "11d318ea",
      ba_req_path: "docs/REQ_VN-MACRO-TOOLING.md",
      ba_blockers: 6,
      ba_zone_split: "A=apps/macro-indicators (Go endpoints+domain), B=apps/mcp-server TS handlers + VMT-7 register, C=creditFlowTools.ts VMT-6 extend, D=macro-indicators pkg/infrastructure shared vpsFetch (first, no deps)",
      router_ba_reverify_verdict: "RAW-RE-VERIFIED INDEPENDENTLY: git show 11d318ea --stat = EXACTLY 2 files (docs/REQ_VN-MACRO-TOOLING.md 690L/12 sections covering 7 tools w/ per-tool skill-switch-on acceptance contracts + ba.md notebook 10L); orch-state.json UNTOUCHED (working==HEAD, BA left board for router); NO concurrent dirty entries swept. 6 blockers ALL flagged needing live VPS probe before parser (the fail-closed-to-empty guard). READY for architect multi-zone blueprint."
    }
  ]
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "BA-VN-MACRO-TOOLING",
    next_agent: "architect",
    note: "VN-MACRO-TOOLING BA spec DONE (a1ed1834, commit 11d318ea, router RAW-verified 2 files explicit-path: REQ_VN-MACRO-TOOLING.md 690L/12 sections/7 tools + ba notebook; orch-state untouched; no sweep). 6 blockers ALL need live VPS probe before parser (FDI/domestic split, SBV BOP fmt, GSO IIP/retail fmt, GSO CPI 11-basket, SBV interbank/OMO/IRS, VIRA/VARA URL). -> architect: multi-zone technical blueprint from docs/REQ_VN-MACRO-TOOLING.md (BA zone-split rec A=macro-indicators Go, B=mcp-server TS handlers+VMT-7, C=creditFlowTools.ts VMT-6, D=macro-indicators pkg/infra shared vpsFetch first). VN sources GEO-BLOCKED -> all fetches via Vinahost VPS; fail-closed never fabricate (is_estimate/confidence). Contract from LIVE payload not schema comment. Then -> pm -> dev specialists. Chain SPRINT-M ba->architect->pm. ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15. KINHDICH-HOVER-ENRICH-FE done_verified. WIP=2 (this + ARCH-CRON passive). Commit explicit path only."
  }
