# Board flip: FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE REVIEW -> DONE_VERIFIED
# QA independent re-verify (not rubber-stamp) of the depends_on eligibility
# gate added to scripts/devteam-backlog-promote-bounded1.jq (commit 70bb222f6):
# - Read the full diff at 70bb222f6: eligibility filter (`select(.value |
#   deps_satisfied(...))`) runs INSIDE the candidate list-comprehension,
#   BEFORE `sort_by([.rank, .idx])` — confirmed applied during candidate
#   selection, not a post-hoc check on the already-chosen top pick.
# - `effective_depends_on` confirmed to resolve BOTH shapes: inline
#   `.depends_on` on the board row (non-empty wins), and — for `detail_ref`'d
#   rows — the lookup in `docs/data/orch/archive/backlog-detail.json`
#   `.items[<id>].depends_on`, normalized via `as_dep_array` (handles the
#   7/321 bare-string real-data-drift rows too).
# - `deps_satisfied` confirmed: a dep counts satisfied ONLY at
#   `status == "DONE_VERIFIED"` (plain `DONE` insufficient — proven by the
#   test's Bonus case); a dep id resolving in NO task_board lane maps to the
#   sentinel `"MISSING"`, which never equals `"DONE_VERIFIED"`, so it is
#   correctly treated as UNSATISFIED (conservative-skip), not silently
#   ignored.
# - Ran `bash scripts/test-devteam-bounded1-depends-on.sh` myself directly:
#   17/17 PASS (re-confirmed, not trusted from the developer's report).
# - Own independent read-only dry-run against LIVE `docs/data/orch/orch-state.json`
#   + LIVE `docs/data/orch/archive/backlog-detail.json` (piped to a scratch
#   file only, never through orch-apply.sh, never touched the live doc):
#   confirmed the fixed script now SKIPS
#   FACTORY-TECHANALYSIS-delete-orphaned-ts-service (both prerequisites still
#   plain BACKLOG, unmet) and promotes FACTORY-TECHANALYSIS-go-livepath-tests
#   instead (`depends_on: []`, the actual next-eligible P1 row) — exactly the
#   fix's stated claim.
# - Confirmed `--slurpfile detail docs/data/orch/archive/backlog-detail.json`
#   threaded through BOTH invocation call sites: `docs/agents/dev-team/flow/main.md`
#   (BOUNDED-1 block ~L505 + step-description ~L518 + tools-list pointer ~L651)
#   and `docs/policies/dev-standards.md` (canonical pointer ~L211).
# - Confirmed `scripts/devteam-backlog-claim-bounded1.jq` genuinely unchanged
#   across the task's commit range (`git diff 1fe8e6a40..3a006db69 --
#   scripts/devteam-backlog-claim-bounded1.jq` = empty) and re-read it: it
#   only claims whichever `ready[]` row carries
#   `promoted_by == "dev-team (bounded-1 auto-pickup)"`, so it structurally
#   needs no depends_on logic of its own (promote already gates eligibility
#   before claim ever runs).
# - Confirmed DJ-GATE-1: `docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-developer.md`
#   STEP developer-S5 carries `task-id:** FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE`
#   with a substantive what-done/what-considered/why-decision/why-change body
#   (not boilerplate).
# - Scope check: `git diff --stat 1fe8e6a40..3a006db69` touches only the
#   expected files (the .jq fix, the two doc pointers, the new test script,
#   developer memory, and this task's own orch-state.json board rows —
#   including the pre-existing manual revert_note on
#   FACTORY-TECHANALYSIS-delete-orphaned-ts-service that was already applied
#   live at 07:55:12Z, before this fix task started, and only got swept into
#   a later commit alongside the routine board-flip write). Confirmed
#   FACTORY-TECHANALYSIS-go-livepath-tests is STILL plain `BACKLOG` in the
#   live board right now (PO explicitly declined manual promotion this cycle
#   — the fix only corrects future auto-pickup ticks, promotes nothing
#   itself).
#
# GUARD: refuse unless FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE is in review[]
# with status REVIEW, and .head.active_task_id still points at it.
# Usage: jq --arg now "$NOW" --arg note "<qa_review_note text>" \
#          -f scripts/qa-fix-devteam-bounded1-depends-on-gate-done-verified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE")][0]) as $t
| if $t == null then error("FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE status != REVIEW (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE") then
    error("head.active_task_id drifted away from FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    qa_review_note: $note,
    updated_at: $now,
    updated_by: "qa"
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .head.status = "done"
| .head.active_task_id = null
| .head.next_agent = "router"
| .head.next_action = ("FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE DONE_VERIFIED (qa independent re-verify PASS \($now) — filter confirmed applied during candidate selection not post-hoc; both depends_on shapes (inline + detail_ref/backlog-detail.json) confirmed resolved; DONE_VERIFIED-only + conservative-skip-on-missing confirmed; test-devteam-bounded1-depends-on.sh re-run 17/17 PASS; own read-only dry-run against live data confirmed correct skip of FACTORY-TECHANALYSIS-delete-orphaned-ts-service + correct pick of FACTORY-TECHANALYSIS-go-livepath-tests; --slurpfile detail confirmed threaded through both invocation call sites; claim script confirmed genuinely unchanged; DJ-GATE-1 journal confirmed substantive; scope confirmed clean, nothing auto-promoted live).")
| .head.updated_at = $now
| .head.updated_by = "qa"
