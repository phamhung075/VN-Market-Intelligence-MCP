# Board flip: FACTORY-MACRO-delete-dead-ts-tree REVIEW -> DONE_VERIFIED
# Final RAW-verify gate (qa), independently reproduced (not just re-read):
# - All 7 DoD paths confirmed gone from disk (src/_deprecated/,
#   src/infrastructure/scrapers/, __tests__/, package.json, tsconfig.json,
#   bun.lock, node_modules/); src/ collapse to fully-empty was structurally
#   inevitable — git-blamed pre-delete tag macro-pre-delete shows src/ held
#   ONLY _deprecated/ + infrastructure/scrapers/ at the round-2 parent commit
#   (application/domain/interface/index.ts were already gone from an earlier
#   TS->Go migration, well before this task).
# - go build ./... / go vet ./... / go test -count=1 ./... (uncached, forced)
#   all green: 33 _test.go files, 11 packages (6 primitive + domain +
#   application + infrastructure + interface/http + module), 288 top-level
#   tests, 543 incl. subtests, 0 fail. golangci-lint run --config .golangci.yml
#   = 0 issues. G12 sandbox primitive 18/18 PASS + module 2/2 PASS. Fence-A/B/C
#   re-verified via real `go list` import graph (not grep heuristic) = CLEAN.
#   Env-credential audit clean.
# - Whole-repo grep for live importers of any deleted path outside the
#   deletion set = 0 results, excluding the 2 known pre-existing stale
#   doc-comments (apps/mcp-server/src/infrastructure/microservices/clients.ts:571
#   git-blamed 2026-05-16; apps/macro-indicators/pkg/primitive/macro_investment_clock/
#   macro_investment_clock.go:5 git-blamed 2026-05-23 — both pre-date this task).
# - pnpm -r list confirms macro-indicators silently drops out of the pnpm
#   workspace (glob-based apps/* pattern, no explicit enumeration); root
#   pnpm-lock.yaml never had a macro-indicators entry (it used its own
#   bun.lock, now deleted) — no other file required a change. CI bun-test job
#   (.github/workflows/ci.yml:19) is scoped to apps/mcp-server only;
#   macro-indicators CI (lines 85-94) is golangci-lint-only, unaffected.
# - docs/architecture/microservice/macro-indicators/testing.md spot-checked
#   against a fresh `go test -v -count=1 ./...` run: 33 files/288 top-level/
#   543 incl-subtests/0-fail all reproduced exactly; ONE inaccuracy found and
#   fixed directly by qa (doc-only, non-production, non-fabricated-data
#   correction): summary line claimed "8 packages", real count is 11 — fixed
#   in place with an attribution note, not bounced back to dev for a 1-line
#   miscount.
# - No-cache `docker build` of apps/macro-indicators/Dockerfile succeeds
#   clean (verify-only, temp images removed after); live prod container
#   vn-market-intelligence-mcp-macro-indicators-1 confirmed untouched
#   (still Up, healthy, unrebuilt) — rebuild_required=false honored, no
#   deploy/swap performed.
#
# GUARD: refuse unless FACTORY-MACRO-delete-dead-ts-tree is in review[]
# with status REVIEW, and .head.active_task_id still points at it.
# Usage: jq --arg now "$NOW" --rawfile note /path/to/review_note_append.txt \
#          -f scripts/qa-factory-macro-delete-dead-ts-tree-done-verified.jq \
#          docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FACTORY-MACRO-delete-dead-ts-tree")][0]) as $t
| if $t == null then error("FACTORY-MACRO-delete-dead-ts-tree not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FACTORY-MACRO-delete-dead-ts-tree status != REVIEW (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FACTORY-MACRO-delete-dead-ts-tree") then
    error("head.active_task_id drifted away from FACTORY-MACRO-delete-dead-ts-tree (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    qa_review_note: ($t.review_note + $note),
    updated_at: $now,
    updated_by: "qa",
    status_note: "qa RAW-verify PASS (\($now)): all 7 deletion paths confirmed gone; go build/vet/test -count=1 (33 files/11 pkgs/288 top-level/543 incl-subtests, 0 fail, uncached) + golangci-lint (0 issues) + G12 sandbox (18/18 + 2/2) + Fence-A/B/C (real go list import graph) all re-run independently and clean; whole-repo grep confirms zero live importer outside deletion set (only 2 pre-existing stale doc-comments, git-blame confirmed pre-dating task); pnpm -r list + CI scoping sanity-checked (no other file needed changing); no-cache docker build clean, live container untouched; testing.md spot-check found+fixed one doc miscount (8 vs real 11 packages) directly, non-blocking. done_verified."
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FACTORY-MACRO-delete-dead-ts-tree")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .head.status = "done"
| .head.active_task_id = null
| .head.next_agent = "router"
| .head.next_action = "FACTORY-MACRO-delete-dead-ts-tree DONE_VERIFIED (qa RAW-verify PASS \($now) — independently reproduced round-2 TS-tree deletion: all DoD paths gone, go build/vet/test/lint/G12/Fence-A-B-C all green uncached, zero live importer outside deletion set, docker build clean w/ live container untouched, testing.md spot-checked + one doc miscount fixed). No new follow-up bug discovered this cycle beyond the already-flagged optional infrastructure.md/domain-model.md/usecases.md/api-reference.md doc-freshen (dev-macro-indicators noted, out of this task's DoD scope)."
| .head.updated_at = $now
| .head.updated_by = "qa"
