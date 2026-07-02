# Dev-team tick 2026-07-02T02:07Z — close FIX-BCTC-ANALYST-ESCALATION-DISPATCH-NO-BASH review → done
# qa worker a082a59635761cbb4 verdict APPROVE, RAW-verified by dispatcher:
#   - journal docs/agent-memory/decisions/sprint-FIX-BCTC-ANALYST-ESCALATION-DISPATCH-NO-BASH-qa.md on disk
#   - no QA commits (HEAD still a439c529); no docs/agents/*.md writes; orch-state read-only
#   - Check 2: all 3 ESC write points now Write(docs/signals/bctc-analyst-*.json); residual bash/orch-apply hits are comments only
#   - Check 3: esc-deep-dive-request routed in drain-signals.md 0a-3 -> drain-esc-dispatch.md (row.source branch);
#     live archived evidence real (processed/bctc-analyst-20260630T151500Z.json GVR ESC-4, ...20260701T151800Z.json HPG)
#   - Check 4: frontmatter line-1 intact on both frontmatter files
# NON-BLOCKING follow-ups (signal row to po minted same tick, see dev-team-signal-qa-followups-20260702-0207.jq):
#   (1) data-coverage-gap->ops and deep_dive_result->po lack dedicated routing rows (generic catch-all only, pre-existing)
#   (2) bctc-analyst/flow/stage-log-notify.md retains bash blocks the no-Bash agent cannot execute (latent, pre-existing)
# Usage: jq --arg now "$NOW" -f scripts/dev-team-close-fix-bctc-esc-nobash-20260702-0207.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# Invariants: idempotent (no-op if row absent from review); lane-scoped writes only.

def fixid: "FIX-BCTC-ANALYST-ESCALATION-DISPATCH-NO-BASH";

([.task_board.review[] | select(.id == fixid)]) as $rows
| if ($rows | length) == 0 then .
  else
    .task_board.review |= map(select(.id != fixid))
    | .task_board.done += [($rows[0]
        + {status: "DONE",
           completed_at: $now,
           completed_by: "qa",
           status_note: (($rows[0].review_note // $rows[0].status_note // "")
             + " | QA APPROVE " + $now + ": commit 881e38f1 verified — 3 ESC write points converted to Write(docs/signals/), tool surface matches no-Bash package, drain routing closed for esc-deep-dive-request, frontmatter intact. Two pre-existing non-blocking gaps signalled to po (routing rows for data-coverage-gap/deep_dive_result; stage-log-notify.md bash blocks).")})]
    | .task_board._updated_at = $now
    | .task_board._updated_by = "dev-team"
  end
