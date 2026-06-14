# Router board-integrity repair: revert the FALSE promotion of DOCLANG-T2..T6 review[REVIEW] -> backlog[TODO].
# Provenance: dev-pdf-extractor (a30fff66) committed ccaf937f "promote T1-T6 -> REVIEW" but its OWN report
# claimed only T1 was implemented; there are ZERO implementation commits for T2..T6 (only T1 has 2d79baed).
# A review stage means "a dev completed it, awaiting QA" — T2..T6 have no dev pass, so review placement is
# false and skips the pm's per-task gates. The architect SCAFFOLD code (5d121989) stays committed in the repo;
# this repair only corrects the BOARD status. Each Tn will later be dispatched to dev-pdf-extractor in order
# (fast if the scaffold already covers its AC, as T1 was a 1-line gap) then QA-gated -> done_verified.
# T1-DOMAIN stays in review (legit: implemented + committed 2d79baed). head/ALLZERO untouched.
# GUARD: refuse unless ALL FIVE of T2..T6 are currently in review[] with status REVIEW, T1 is in review, and
#        none of T2..T6 carries a claimed_by/implemented marker (best-effort: assert status==REVIEW only — no
#        per-task impl field exists). Refuse if any Tn missing from review.
# Pointer: docs/agents/dev-team/flow/main.md (Step 0b — router reconciles board integrity on pipeline forward).
# Usage: jq --arg now "$NOW" -f scripts/router-doclang-revert-false-review.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (["DOCLANG-T2-SERIALIZER","DOCLANG-T3-ADAPTERS","DOCLANG-T4-USECASE","DOCLANG-T5-WIRING","DOCLANG-T6-TESTS"]) as $false5
| (.task_board.review // []) as $rev
| ([$rev[] | select(type=="object" and (.id as $i | $false5 | index($i)))]) as $found
| ([$rev[] | select(type=="object" and .id=="DOCLANG-T1-DOMAIN")][0]) as $t1
| if ($found | length) != 5 then error("expected all 5 of T2..T6 in review[], found \($found|length) — refuse")
  elif ([$found[] | select(.status != "REVIEW")] | length) != 0 then error("a T2..T6 not in REVIEW status — refuse")
  elif ($t1 == null) then error("DOCLANG-T1-DOMAIN not in review[] — unexpected, refuse")
  else . end
# pull T2..T6 out of review[]
| .task_board.review |= map(select((type=="object" and (.id as $i | $false5 | index($i))) | not))
# push them back to backlog[] as TODO, stripping the false review-stage fields
| .task_board.backlog += ([$found[]
    | del(.promoted_at, .promoted_by, .promote_note)
    | . + {
        status: "TODO",
        next_agent: "dev-pdf-extractor",
        reverted_at: $now,
        reverted_by: "router",
        revert_note: "Reverted from a FALSE review promotion (dev commit ccaf937f bulk-promoted T1-T6 but only implemented T1; no impl commit exists for this task). Architect scaffold (5d121989) remains in repo. Dispatch in dependency order after the prior Tn is done_verified; dev hardens scaffold to this task's AC (docs/handoffs/TASK-<id>.md) then QA-gates."
      }])
