# Router 2026-06-16 — dev-team tick Step 3 close (sibling): FIX-BCTC-SSC-503-RETRY dev-return -> in_progress -> review.
#
# dev-vps-crawls (agent a29ed352) shipped 6da9b030 (HEAD). Router RAW-verified the diff + logic FIRST-HAND
# (NOT relaying the agent badge):
#   (a) 6da9b030 is ancestor of HEAD on main; exactly 2 files (vps-scripts/discover-bctc-urls-browser.py +
#       decision journal) — no scope creep.
#   (b) Step1 retry loop `for _attempt in range(2)`: clean 200 -> _ssc_get returns body -> `break` BEFORE any retry
#       (clean-200-empty never enters the retry path; the 0-rows/non-filing branch is downstream in _ssc_parse_rows,
#       UNCHANGED). Transient (_is_transient_error: HTTPError>=500, URLError ConnReset/Timeout/Refused/"timed out")
#       at attempt 0 -> log + sleep 60s + rebuild opener (_ssc_make_opener, defined L683 — no NameError) + continue.
#       Terminal (4xx/unknown) at attempt 0 OR any error at attempt 1 -> `return None` (no fabrication; honest
#       non-filing path preserved — no-fake-data /goal). Empty body after loop -> return None.
#   (c) Generic /goal#2: classification keys ONLY on error class — no per-ticker / per-exchange branching.
#   (d) Bounded: 1 retry x 60s. py_compile OK (this VPS script is OUTSIDE the pnpm/bun CI path — py_compile is the
#       only syntax gate; router ran it green).
#
# QA-FLAG (carried into review for qa): the 23 simulation tests the agent ran are NOT committed (diff = script +
# decision-journal only). qa should decide whether a persisted test under a vps-scripts test harness is required,
# and may re-run the transient-vs-clean-200 classification by inspection. Router has already confirmed the branch
# logic + py_compile first-hand, so this is a test-PERSISTENCE gap, not a known-correctness gap.
#
# HEAD: NOT touched — the CI-RED lead (FIX-CI-RED-STANDING-1837A-1352A, dev-mcp-server agent a6cc7e5d) is still
# in-flight and remains the active head task for crash-resume. This move is sibling-only.
#
# GUARD: refuse unless the tid is uniquely in in_progress[]. CONSERVATION: total UNCHANGED (in_progress -1, review +1).
# Usage: jq --arg now "$NOW" -f scripts/router-d90-ssc503retry-promote-review-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-BCTC-SSC-503-RETRY" as $tid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done,.task_board.backlog]|map(length)|add) as $before
| ([.task_board.in_progress[]?|select(.id==$tid)]|length) as $ip
| if $ip != 1 then error("tid not uniquely in in_progress[] — refuse promote: " + ($ip|tostring)) else . end
| ([.task_board.in_progress[]?|select(.id==$tid)][0]) as $task
| ($task + {
    status:"REVIEW",
    impl_commit:"6da9b030",
    next_agent:"qa",
    code_verify:"GREEN (router RAW first-hand on 6da9b030): on main, 2 files only; step1 retry loop range(2) — clean-200 breaks before retry, transient(5xx/ConnReset/Timeout/Refused/'timed out') -> 1x60s backoff + opener rebuild (_ssc_make_opener L683), terminal(4xx/unknown) -> return None, retry-exhausted -> return None (no fabrication); generic error-class only (no per-ticker/exchange); py_compile OK (VPS script outside CI path).",
    qa_flag:"23 simulation tests run by agent but NOT committed (diff = script + decision-journal). qa: decide if a persisted vps-scripts test is required; router already confirmed branch logic + py_compile first-hand (test-PERSISTENCE gap, not a correctness gap).",
    promoted_to_review_ts:$now,
    promoted_by:"dev-team"
  }) as $promoted
| .task_board.in_progress = [ .task_board.in_progress[] | select(.id!=$tid) ]
| .task_board.review = ([ $promoted ] + .task_board.review)
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done,.task_board.backlog]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on an in_progress->review move") else . end
