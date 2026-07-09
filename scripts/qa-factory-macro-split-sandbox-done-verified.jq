# Board flip: FACTORY-MACRO-split-sandbox REVIEW -> DONE_VERIFIED
# Final RAW-verify gate (qa), independently reproduced beyond the router's
# mechanical checks (build/vet/test/lint/line-counts/gitignore-root-cause/
# Dockerfile-scope/head-sync already confirmed by router, not re-litigated):
# - Read the full diff (git show 60c9a880a) + reconstructed the pre-split
#   main.go (git show 60c9a880a^:apps/macro-indicators/cmd/sandbox/main.go,
#   831L) line-by-line against primitives.go/module.go: compareFields/
#   formatVal genuinely preserve the original per-field %q(string)/%v(number)
#   formatting and error-message text (`scenario %q: [...]`, `classification[N]:
#   [...]`) for all 6 primitive comparators + both module-tier diff sites
#   (executeMacroSignalsBatch's per-item loop, executeMacroSignalsBuild's
#   19-field comparison) — no silent logic change found.
# - Independently reproduced the before/after parity claim from scratch (did
#   not trust the dev's git-stash report): `git worktree add` at 60c9a880a^,
#   built both old and new sandbox binaries, ran both against the identical
#   live 20-scenario fixture suite (docs/scenarios/macro-indicators/**) from
#   the same repo root — byte-identical output (timestamps excluded) + exit 0
#   both. Constructed 2 of my own forced-mismatch probes (one primitive-tier:
#   VN_CPI_indicator score 8->999; one module-tier: build_macro_signals
#   yieldSpread.label CHEAP->__FORCED_WRONG__) and ran both old and new
#   binaries against each — byte-identical FAIL reason text + exit 1, both
#   before and after.
# - Read dispatch_test.go in full (8 top-level test funcs, matches claim):
#   real dispatch-routing tests (unknown-primitive/unknown-module error paths,
#   missing-field filename-inference paths, build-vs-legacy-batch scenario_type
#   routing distinguished by error-wrap shape) — not tautological. One
#   observed limitation: the 6-way primitive dispatch subtest uses
#   shouldPass=false (graceful-degradation, always true/nil) for all 6 cases,
#   so it would not catch a same-package swap between two of the six
#   structurally-similar primitive cases specifically (would catch totally-
#   unknown/totally-missing routing breaks). Non-blocking: DoD explicitly
#   asked for "light coverage of the dispatch" (backlog-detail.json), not
#   exhaustive; the real 20-scenario fixture suite (run manually, confirmed
#   above) does have per-primitive discriminating assertions and would catch
#   a within-group swap, just not via `go test` alone. Flagged as a non-
#   blocking follow-up observation, not a defect in delivered behavior.
# - Repo-wide grep for external references to every moved identifier
#   (executeMacroInvestmentClock/OilImpact/GoldDirection/UsdVndDirection/
#   CarryTrade/YieldSpread, executeMacroSignalsBatch/Build/executeMacroSignals,
#   executePrimitive/executeModule, findRepoRoot/discoverScenarios,
#   compareFields/formatVal/concreteClock): zero cross-package references —
#   package main cannot be imported by design; same-named symbols in
#   api-gateway/alert-engine/stock-price/technical-analysis cmd/sandbox and in
#   pkg/application/usecases.go are pre-existing independent definitions in
#   other packages, unrelated to and untouched by this diff.
# - Full macro-indicators zone test suite (not just cmd/sandbox): `go build
#   ./...`, `go vet ./...`, `go test ./... -count=1` (uncached, forced) all
#   green across all 11 packages; `golangci-lint run ./...` 0 issues zone-wide.
# - `.gitignore` anchor fix verified live via `git check-ignore`:
#   cmd/sandbox/foo.go correctly NOT ignored; apps/macro-indicators/sandbox
#   (compiled binary) correctly still ignored by the new `/sandbox` pattern.
#
# GUARD: refuse unless FACTORY-MACRO-split-sandbox is in review[] with status
# REVIEW, and .head.active_task_id still points at it.
# Usage: jq --arg now "$NOW" -f scripts/qa-factory-macro-split-sandbox-done-verified.jq \
#          docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FACTORY-MACRO-split-sandbox")][0]) as $t
| if $t == null then error("FACTORY-MACRO-split-sandbox not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FACTORY-MACRO-split-sandbox status != REVIEW (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FACTORY-MACRO-split-sandbox") then
    error("head.active_task_id drifted away from FACTORY-MACRO-split-sandbox (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    qa_verify_at: $now,
    qa_verify_by: "qa",
    updated_at: $now,
    updated_by: "qa",
    status_note: "qa RAW-verify PASS (\($now)): read full diff (60c9a880a) against reconstructed pre-split main.go line-by-line -- compareFields/formatVal genuinely preserve original %q/%v formatting + error text for all 6 primitive comparators + both module-tier diff sites, no silent logic change. Independently reproduced before/after parity from scratch (git worktree at parent commit, built both binaries, ran identical 20-scenario fixture suite -- byte-identical output+exit 0 both; 2 own forced-mismatch probes, primitive+module tier -- byte-identical FAIL text+exit 1 both). Read dispatch_test.go in full: 8 real dispatch-routing tests, not tautological (one non-blocking limitation noted: 6-way primitive subtest cannot distinguish a within-group case swap via go test alone -- DoD asked for light coverage only, real fixture suite would catch it). Repo-wide grep confirms zero external references to any moved identifier (package main). Full zone test suite (go build/vet/test -count=1 all 11 packages + golangci-lint) green beyond router's cmd/sandbox-only checks. .gitignore anchor fix verified live via git check-ignore. done_verified."
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FACTORY-MACRO-split-sandbox")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .head.status = "done"
| .head.active_task_id = null
| .head.next_agent = "router"
| .head.next_action = "FACTORY-MACRO-split-sandbox DONE_VERIFIED (qa RAW-verify PASS \($now) -- independently re-derived comparator-collapse parity from source diff + own before/after binary reproduction (not just trusting dev's git-stash report) + own 2 forced-mismatch probes, read dispatch_test.go in full (real, not tautological; one non-blocking light-coverage gap noted), repo-wide grep confirms zero external references to moved identifiers, full zone test suite green beyond cmd/sandbox-only). No genuine defect found; task complete."
| .head.updated_at = $now
| .head.updated_by = "qa"
