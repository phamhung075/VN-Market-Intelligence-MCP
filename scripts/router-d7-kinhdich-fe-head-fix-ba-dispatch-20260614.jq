# Router dev-team dispatcher — fix STALE head after PO closed KINHDICH-HOVER-ENRICH + dispatch BA for the follow-up.
# PO (ae636dab) ruled (commit 039306f5, RAW-verified 2 files): closed KINHDICH-HOVER-ENRICH -> done[]
#   (status partial-ssot-done-wrong-surface, SSOT groundwork kept) + opened KINHDICH-HOVER-ENRICH-FE in ready[]
#   (zone apps/frontend/, owner dev-frontend, next_agent=ba, parent KINHDICH-HOVER-ENRICH). BUT head was left STALE pointing at the
#   CLOSED task (active_task_id=KINHDICH-HOVER-ENRICH, next_agent=po). This write repoints head at the live follow-up + records
#   the BA dispatch. The FE task STAYS in ready[] (PO's lane placement) — BA's own flow advances it; we only correct head + stamp.
# GUARD: refuse unless head.active_task_id=="KINHDICH-HOVER-ENRICH" (the stale value) AND KINHDICH-HOVER-ENRICH-FE present in ready[].
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — ready task with next_agent -> dispatch that agent).
# Usage: jq --arg now "$NOW" -f scripts/router-d7-kinhdich-fe-head-fix-ba-dispatch-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([.task_board.ready[]? | select(type=="object" and ((.id // "")=="KINHDICH-HOVER-ENRICH-FE"))][0]) as $fe
| if (.head.active_task_id != "KINHDICH-HOVER-ENRICH")
    then error("head.active_task_id != KINHDICH-HOVER-ENRICH (\(.head.active_task_id)) — already advanced, refuse")
  elif ($fe == null) then error("KINHDICH-HOVER-ENRICH-FE not in ready[] — refuse")
  elif (($fe.next_agent // null) != "ba") then error("FE next_agent != ba (\($fe.next_agent)) — refuse")
  else . end
| .task_board.ready = [
    .task_board.ready[] | if (type=="object" and ((.id // "")=="KINHDICH-HOVER-ENRICH-FE"))
      then (. + {ba_dispatched_at: $now, ba_dispatched_by: "dev-team"})
      else . end
  ]
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "KINHDICH-HOVER-ENRICH-FE",
    next_agent: "ba",
    note: "KINHDICH-HOVER-ENRICH CLOSED by PO (ae636dab, commit 039306f5, router RAW-verified 2 files) -> done[] partial-ssot-done-wrong-surface (hoverSummary x64 SSOT groundwork in que-reference.js + hexagram_reference.go KEPT). Follow-up KINHDICH-HOVER-ENRICH-FE OPENED ready[] (zone apps/frontend/, owner dev-frontend) — corrects the surface to the REAL user hover: Remix :3001 QueName.tsx tooltip <- que-descriptions.generated.ts. Router fixed stale head + dispatched BA. Chain po->BA->architect->dev-frontend->ops->qa->po. Scope: extend scripts/gen-que-descriptions.ts to emit hoverSummary -> QueName.tsx render (coreMeaning fallback) -> regen que-descriptions.generated.ts -> rebuild frontend :3001. DRY constraint: preserve QUE-TOOLTIP-DRY single-SSOT/single-codegen/single-QueName mechanism; only swap which field the one shared tooltip renders. BA reuses docs/handoffs/KINHDICH-HOVER-ENRICH-BA-spec.md (64 pre-authored VI/EN strings). ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15. ARCH-SHIP-WAVE-REAUDIT PARKED. WIP=1 active. Commit explicit path only."
  }
