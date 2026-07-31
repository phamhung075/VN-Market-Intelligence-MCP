# dev-team-flip-te-t08-review-20260731-0354.jq
# agent-father returned genuinely (commit af63043ae, RAW-verified: pathspec-scoped
# commit gate preserved verbatim in new 82L hot card, 2 stale cross-refs fixed, both
# claimed files match git show --stat). Board row was stale BACKLOG/next_agent:
# agent-father from po's dispatch. Precedent: 5 other completed TE-T## rows
# (T17/T24/T28/T31/T33) all moved backlog->review/next_agent:qa, not done. Following
# that precedent, not inventing a new terminal lane.
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/dev-team-flip-te-t08-review-20260731-0354.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($now) as $now
| "dev-team/te-t08-review-flip-20260731T0354Z" as $src

| (.task_board.backlog[] | select(.id == "TE-T08")) as $row

| .task_board.backlog = [ .task_board.backlog[] | select(.id != "TE-T08") ]

| .task_board.review = ([
    ($row
      | .status = "REVIEW"
      | .next_agent = "qa"
      | .updated_at = $now
      | .updated_by = $src
      | .commit_sha = "af63043ae81475db90c72e3eb66c2b8c6b8f8da2"
      | .return_summary = "82L hot card (was 256L) + 79L reference.md; pathspec-scoped commit gate (po's landmine) preserved verbatim, grep-verified; 2 stale cross-refs fixed in commit-boundary/SKILL.md + commit/SKILL.md; scripts/git-hooks/pre-commit:38 stale 'Step 3c' comment flagged non-blocking (outside agent-father commit zone)"
    )
  ] + .task_board.review)

| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = $src
