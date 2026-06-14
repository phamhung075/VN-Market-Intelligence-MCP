# Router dev-team dispatcher — sync stale head (architect->dev-frontend) + dispatch dev-frontend for KINHDICH-HOVER-ENRICH-FE.
# Architect (a716bf18, commit c5ee21ae — router RAW-verified 4 files explicit-path: architect.md notebook, sprint-DOCLANG
#   session doc, orch-state, spec +217L; ARCH-RATIFY-FE-1 CONFIRMED) moved the FE task ready[]->in_progress[]
#   (status=in-progress, next_agent=dev-frontend, arch_ratify_fe1=CONFIRMED) but left head.next_agent=="architect" STALE
#   (head.active_task_id already KINHDICH-HOVER-ENRICH-FE). This write ONLY repoints head.next_agent ->dev-frontend + stamps
#   the dev dispatch. The FE task STAYS in in_progress[] (architect's lane placement, next_agent=dev-frontend already set).
# GUARD: refuse unless head.next_agent=="architect" AND FE task in in_progress[] with next_agent=="dev-frontend".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — architect-ratified design -> dispatch dev specialist).
# Usage: jq --arg now "$NOW" -f scripts/router-d9-kinhdich-fe-headsync-dev-dispatch-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([.task_board.in_progress[]? | select(type=="object" and ((.id // "")=="KINHDICH-HOVER-ENRICH-FE"))][0]) as $fe
| if (.head.next_agent != "architect") then error("head.next_agent != architect (\(.head.next_agent)) — already advanced, refuse")
  elif ($fe == null) then error("KINHDICH-HOVER-ENRICH-FE not in in_progress[] — refuse")
  elif (($fe.next_agent // null) != "dev-frontend") then error("FE next_agent != dev-frontend (\($fe.next_agent)) — refuse")
  else . end
| .task_board.in_progress = [
    .task_board.in_progress[] | if (type=="object" and ((.id // "")=="KINHDICH-HOVER-ENRICH-FE"))
      then (. + {dev_dispatched_at: $now, dev_dispatched_by: "dev-team"})
      else . end
  ]
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "KINHDICH-HOVER-ENRICH-FE",
    next_agent: "dev-frontend",
    note: "KINHDICH-HOVER-ENRICH-FE architect DONE (a716bf18, commit c5ee21ae, router RAW-verified 4 files explicit-path; ARCH-RATIFY-FE-1 CONFIRMED — single-codegen extension preserves QUE-TOOLTIP-DRY, hoverSummary added to BLOCK 1 loop w/ backtick-escape, BLOCK 2 detail pipeline untouched; 6 risks all LOW+mitigated). Design blueprint in docs/handoffs/KINHDICH-HOVER-ENRICH-FE-BA-spec.md (+217L). -> dev-frontend: 3-file change (scripts/gen-que-descriptions.ts emit hoverSummary w/ backtick-escape -> regen apps/frontend/app/lib/que-descriptions.generated.ts all 64 -> QueName.tsx:75 {desc.hoverSummary ?? desc.coreMeaning}); reuse 64 pre-authored VI/EN strings from docs/handoffs/KINHDICH-HOVER-ENRICH-BA-spec.md; run tsc --noEmit before commit; explicit-path commit. Chain -> ops(targeted rebuild apps/frontend :3001 only, build+up -d --no-deps frontend, NEVER down) -> qa LIVE :3001 hover -> po signoff -> done_verified. ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15. ARCH-SHIP-WAVE-REAUDIT PARKED. WIP=1 active. Commit explicit path only."
  }
