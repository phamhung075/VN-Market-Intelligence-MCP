# Router dev-team dispatcher — sync stale head (ba->architect) + dispatch architect for KINHDICH-HOVER-ENRICH-FE.
# BA (a872da8b) returned spec-done (commit fda7cb82, router RAW-verified 3 files explicit-path: ba.md, orch-state, spec 257L;
#   FR-3 anchor QueName.tsx:75 = {desc.coreMeaning} CONFIRMED). BA advanced the FE ready[] entry next_agent ba->architect but left
#   head.next_agent=="ba" stale (head.active_task_id already KINHDICH-HOVER-ENRICH-FE). This write only repoints head.next_agent
#   ->architect + stamps architect dispatch. FE task STAYS in ready[] (status spec-done, next_agent=architect already set by BA).
# GUARD: refuse unless head.next_agent=="ba" AND FE task in ready[] with next_agent=="architect".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — spec-done -> architect ratify/design).
# Usage: jq --arg now "$NOW" -f scripts/router-d8-kinhdich-fe-headsync-architect-dispatch-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([.task_board.ready[]? | select(type=="object" and ((.id // "")=="KINHDICH-HOVER-ENRICH-FE"))][0]) as $fe
| if (.head.next_agent != "ba") then error("head.next_agent != ba (\(.head.next_agent)) — already advanced, refuse")
  elif ($fe == null) then error("KINHDICH-HOVER-ENRICH-FE not in ready[] — refuse")
  elif (($fe.next_agent // null) != "architect") then error("FE next_agent != architect (\($fe.next_agent)) — refuse")
  else . end
| .task_board.ready = [
    .task_board.ready[] | if (type=="object" and ((.id // "")=="KINHDICH-HOVER-ENRICH-FE"))
      then (. + {architect_dispatched_at: $now, architect_dispatched_by: "dev-team"})
      else . end
  ]
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "KINHDICH-HOVER-ENRICH-FE",
    next_agent: "architect",
    note: "KINHDICH-HOVER-ENRICH-FE BA spec DONE (a872da8b, commit fda7cb82, router RAW-verified 3 files explicit-path; spec docs/handoffs/KINHDICH-HOVER-ENRICH-FE-BA-spec.md 257L; FR-3 anchor QueName.tsx:75={desc.coreMeaning} confirmed). 4 FR + 4 NFR, 3-file frontend change (scripts/gen-que-descriptions.ts emit hoverSummary -> regen que-descriptions.generated.ts -> QueName.tsx:75 {desc.hoverSummary ?? desc.coreMeaning}) + ops rebuild apps/frontend :3001 only. kinh-dich SSOT untouched (groundwork shipped 47fe36e8). -> architect: brownfield apps/frontend zone + ARCH-RATIFY-FE-1 (ratify DRY-preserving codegen extension mechanism — PO already settled the field choice) + tech design for dev-frontend. Chain -> dev-frontend -> ops(frontend rebuild) -> qa LIVE :3001 hover -> po signoff. DRY: single SSOT/codegen/QueName, coreMeaning fallback, QUE_DETAIL detail page untouched. ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15. ARCH-SHIP-WAVE-REAUDIT PARKED. WIP=1 active. Commit explicit path only."
  }
