# Board flip: FACTORY-TECHANALYSIS-go-livepath-tests REVIEW -> DONE_VERIFIED
# QA independent re-verify (not rubber-stamp) of dev-technical-analysis's
# addition of pkg/application/usecases_test.go + pkg/interface/http/router_test.go
# (commit ed739aa59), closing the test-coverage gap that was blocking
# FACTORY-TECHANALYSIS-delete-orphaned-ts-service:
# - Ran `go test ./... -count=1` myself uncached (bypassing cache): 12/12
#   packages GREEN, matches the claim exactly.
# - `go vet ./...`: clean. `golangci-lint run ./...` (repo .golangci.yml):
#   0 issues.
# - Ran `bash dashboard/build.sh` myself fresh: 35/35 sandbox scenarios green
#   (25 primitive + 5 module + 5 service — counted the actual scenario JSON
#   files on disk, matches) + headless verify-render.mjs PASS (0 red, 0
#   pending, 0 JS errors).
# - Read both new test files in full AND the usecases.go/router.go they
#   exercise: every assertion matches production semantics exactly
#   (period<=0 -> 14 default, "closes or symbol required" error text
#   identical in both the usecase-level and router-level duplicate
#   validation, GetCandles(symbol,60) call contract, 500-on-calculator-error
#   and 500-on-repo-error are two genuinely distinct code paths both
#   covered).
# - Verified the doc self-heal (commit b3ff85582, claiming -module and
#   -scenario=all do not exist on cmd/sandbox) by running
#   `go run ./cmd/sandbox -h` myself: flag set is exactly
#   -audit/-scenario/-tier, no -module flag, and grepped main.go for any
#   "all" special-case handling on -scenario — none found. Self-heal is
#   accurate.
# - `git diff --stat ed739aa59~1 6224a7277` (full pre-task-state ->
#   final-commit range) confirms only the 2 new _test.go files plus
#   docs/notebook/journal/orch-state.json were touched — zero non-test
#   apps/technical-analysis files, matching the "purely additive" claim.
# - DJ-GATE-1 confirmed: sprint-SYSTEMIC-REMAKE-P1-dev-technical-analysis.md
#   STEP dev-technical-analysis-S1 carries
#   `task-id:** FACTORY-TECHANALYSIS-go-livepath-tests` with a substantive
#   what-done/what-considered/why-decision/why-change body.
# - FACTORY-TECHANALYSIS-delete-orphaned-ts-service confirmed still correctly
#   BACKLOG (not touched by this task) — remains blocked on sibling
#   FACTORY-TECHANALYSIS-reconcile-ta-contract per its own revert_note; this
#   task only clears one of its two depends_on prerequisites.
#
# GUARD: refuse unless FACTORY-TECHANALYSIS-go-livepath-tests is in review[]
# with status REVIEW, and .head.active_task_id still points at it.
# Usage: jq --arg now "$NOW" --arg note "<qa_review_note text>" \
#          -f scripts/qa-factory-technalysis-go-livepath-tests-done-verified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FACTORY-TECHANALYSIS-go-livepath-tests")][0]) as $t
| if $t == null then error("FACTORY-TECHANALYSIS-go-livepath-tests not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FACTORY-TECHANALYSIS-go-livepath-tests status != REVIEW (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FACTORY-TECHANALYSIS-go-livepath-tests") then
    error("head.active_task_id drifted away from FACTORY-TECHANALYSIS-go-livepath-tests (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    qa_review_note: $note,
    updated_at: $now,
    updated_by: "qa"
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FACTORY-TECHANALYSIS-go-livepath-tests")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .head.status = "done"
| .head.active_task_id = null
| .head.next_agent = "router"
| .head.next_action = ("FACTORY-TECHANALYSIS-go-livepath-tests DONE_VERIFIED (qa independent re-verify PASS \($now) — fresh go test -count=1 12/12 packages GREEN, go vet clean, golangci-lint 0 issues, sandbox 35/35 GREEN via dashboard/build.sh + headless render-check PASS, test-content read confirms assertions match production semantics exactly, doc self-heal (go run ./cmd/sandbox -h) reproduced firsthand, zero production code touched across full commit range, DJ-GATE-1 journal confirmed substantive. FACTORY-TECHANALYSIS-delete-orphaned-ts-service remains correctly BACKLOG, still blocked on sibling FACTORY-TECHANALYSIS-reconcile-ta-contract).")
| .head.updated_at = $now
| .head.updated_by = "qa"
