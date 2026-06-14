# Router board claim: ARCH-DOCLANG-SERIALIZE backlog[] -> in_progress[] (TODO -> IN_PROGRESS) as WIP slot 2.
# SPRINT-S architect design pass for DocLangSerializer Phase 1. BA-DOCLANG-SERIALIZE is DONE (spec
# docs/handoffs/BA-DOCLANG-SERIALIZE.md present) so depends_on satisfied. Zone apps/pdf-extractor/ (design
# -> docs/architecture-briefs/) does NOT collide with the in-flight ALLZERO apps/mcp-server/ slot.
# head stays on ALLZERO (primary chart-bug pipeline); this 2nd slot is tracked by its in_progress entry +
# live architect agent + completion notification.
# GUARD: refuse unless ARCH-DOCLANG in backlog[] status TODO; BA-DOCLANG-SERIALIZE present & DONE;
#        in_progress[] has EXACTLY 1 entry (ALLZERO) -> adding keeps WIP at 2 (<=2); and that lone
#        in-flight entry's zone != apps/pdf-extractor/ (non-collision assertion).
# Pointer: docs/agents/dev-team/flow/main.md (Step 2 SPRINT-S -> architect; Step 3 router claim before spawn).
# Usage: jq --arg now "$NOW" -f scripts/router-arch-doclang-claim.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.backlog | map(select(type=="object" and .id=="ARCH-DOCLANG-SERIALIZE"))[0]) as $t
| ([.task_board | to_entries[] | select(.value|type=="array") | .value[]
     | select(type=="object" and .id=="BA-DOCLANG-SERIALIZE")][0]) as $ba
| (.task_board.in_progress // []) as $wip
| if $t == null then error("ARCH-DOCLANG-SERIALIZE not in backlog[] — refuse")
  elif ($t.status != "TODO") then error("ARCH-DOCLANG status != TODO (got \($t.status)) — refuse")
  elif ($ba == null) then error("BA-DOCLANG-SERIALIZE not found — dependency missing, refuse")
  elif ($ba.status != "DONE") then error("BA-DOCLANG status != DONE (got \($ba.status)) — depends unmet, refuse")
  elif (($wip|length) != 1) then error("in_progress[] count \($wip|length) != 1 — WIP guard, refuse (expect only ALLZERO)")
  elif (($wip[0].zone // "") == "apps/pdf-extractor/") then error("in-flight slot already in apps/pdf-extractor/ zone — collision, refuse")
  else . end
| .task_board.in_progress += [
    ($t + {
      status: "IN_PROGRESS",
      claimed_at: $now,
      claimed_by: "router",
      next_agent: "architect",
      dispatch_note: "Dispatched architect \($now) as WIP slot 2 (non-colliding apps/pdf-extractor/ design; ALLZERO holds apps/mcp-server/). SPRINT-S: technical design for DocLangSerializer Phase 1 per spec docs/handoffs/BA-DOCLANG-SERIALIZE.md. Resolve blockers B-1..B-4 (<location> bbox omit+future-hook; cross-page DTO shape 1-merged-vs-2-continuation; doclang PyPI pin + pip check; cross-page golden fixture real-vs-synthetic). Output brief -> docs/architecture-briefs/ + handoff so pm can atomize/unblock DOCLANG-T1..T6 (already on board, sequential, owner dev-pdf-extractor). Promote -> next_agent=pm on design complete. NO code in this pass (design only). Run pnpm check only if any TS touched (none expected)."
    })
  ]
| .task_board.backlog |= map(select((type=="object" and .id=="ARCH-DOCLANG-SERIALIZE") | not))
