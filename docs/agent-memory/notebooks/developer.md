# Developer — Notebook

**Last updated:** 2026-07-30 | **Cycle:** FACTORY-GUARD-CI-NOHARDCODE-IMPL

## Session 2026-07-30 — FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL — REVIEW

**Task:** dev-team BOUNDED-1 auto-pickup (`cross-service/`, epic FACTORY-MAINTAINABILITY-2026-06), sibling of the TSBOUNDARIES task above (same architect brief §3/§4). New go/ast composition-root-logic CI gate + fix macro-indicators' 2 live offenders.

**Actions taken:** New `scripts/audits/composition-root-logic-gate.go` (`--check`, zero-tolerance: flags any `cmd/server/**/*.go` receiver method with if-count>=2 OR any for/range; escape hatch `composition-root-logic-allow:`). Moved `policyRatesAdapter.FetchPolicyRates`/`omoAdapter.FetchOMO`'s fallback+`IsEstimate`/`ParseOK` decision logic into 2 new `pkg/application/usecases_vmt_liquidity_resolvers.go` types (`PolicyRatesResolver`, `omoResolver`) implementing the pre-existing `PolicyRatesProvider`/`OMOProvider` ports — `LiquidityStateUseCase` unchanged. `cmd/server/adapters.go` shims split into pure-delegation pairs (`policyRatesHTMLAdapter`+`policyRatesDBAdapter`, `omoRawAdapter` + free helper `convertOMOTenorRows`). Wired `composition-root-logic-gate` CI job (1 job, all 7 services — tool is syntax-only). CANONICAL pointer in `dev-standards.md`.

**Verification:** Gate reproduces exactly the 2 documented offenders pre-fix (3 ifs / 4 ifs+1 for), 0 FP across all 6 other services (independently re-verified: zero receiver methods exist anywhere in their `cmd/server/`). Post-fix: `--check` exits 0 across all 7; `go build`/`go vet`/`golangci-lint run` clean; `go test ./...` unchanged pass set. New `composition-root-logic-gate_test.go` 7/7 PASS (offender/for-only/allow-comment/blank-line-breaks-allow/main-free-function/pure-delegation/live-7-service regression). RAW-verified against the LIVE running container: rebuilt+recreated `macro-indicators` (image id confirmed changed), `POST /liquidity-state` before/after byte-identical modulo `fetched_at` — both hits landed on the exact 2 fallback/fail-closed branches the gate flagged, live in prod (SBV HTML fetch failing → DB fallback; OMO `ParseOK=false`).

**Board:** `task_board.in_progress[FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL]` → `review` (`next_agent: qa`), `.head` reset to idle, same `orch-apply.sh` write.

**Simplicity gate:** PASS — resolvers implement the pre-existing ports (zero-touch `LiquidityStateUseCase`), tenor-row mapping loop stays a free function (mechanical, not a business decision) rather than inventing a duplicate raw DTO type.

**Zone note:** No Agent/Task-spawn or MCP tool available this session (Read/Edit/Write/Bash only) — did the `apps/macro-indicators/` zone work directly instead of dispatching `dev-macro-indicators` (structural gap, not a process skip); filename corrected `composition-root-logic-gate.test.go`→`_test.go` per board note (Go only discovers `_test.go`).

Zone health: no drift detected.

## Session 2026-07-30 — FACTORY-GUARD-CI-DEADCODE-IMPL — REVIEW

**Task:** dev-team BOUNDED-1 auto-pickup (`cross-service/`, epic FACTORY-MAINTAINABILITY-2026-06), 4th sibling of TSBOUNDARIES/COMPROOT-LOGIC above (same architect brief lineage, own brief `2026-07-24-factory-guard-ci-dead-code-gate.md`). New dead-code CI gate + fix all confirmed-orphaned trees first (zero-tolerance).

**Actions taken:** New `scripts/audits/dead-code-gate.sh` (`--check`, 4 checks on TRACKED files: `.bak`/`.backup`/`.patch`, `_deprecated/` segment, Go/TS twin scaffold, `//go:build ignore`). Deleted 2 stray root `docker-compose.yml.backup`/`.patch`, mcp-server's 2 `_deprecated/` trees + `1077-kinh-dich-wrapper.test.ts`, pdf-extractor's `_deprecated/mock_echo`, stock-price's `_deprecated/services_v1.go`+test (the only 2 `//go:build ignore` files repo-wide) — zero live importers independently grep-verified for each. Surgical edit to `1081-sprint-054-smoke.test.ts` (Scenario 5/5b/5c only, 17→14 tests). `technical-analysis/package.json` trimmed `bun-types`/`typescript` devDeps. Wired `dead-code-gate` CI job + CANONICAL pointer.

**Board-note correction:** Check-3's literal phrasing ("any Go `cmd/server`+`package.json`+`src/` combo bans") would permanently false-positive on the LIVE `apps/news-fetch` (legit WIP parallel Go port, TS side is what its Dockerfile actually builds/deploys) — refined to a Dockerfile-content signal (zero `src` reference = orphaned, matching technical-analysis's confirmed dead shape) instead of bare directory shape. Also found `apps/technical-analysis/src/` + its tests were ALREADY deleted by an unrelated prior commit (`099afddd3`, 2026-07-28) before this row was even dispatched — only the devDep trim remained live-actionable.

**Verification:** `dead-code-gate.sh --check` 0 on live repo; new `dead-code-gate.test.sh` 8/8 PASS (4 DoD synthetic-offender cases + tracked-vs-untracked control + twin-scaffold Dockerfile-blind/-referencing pair proving the news-fetch exemption is deliberate). mcp-server: `tsc --noEmit` clean, `eslint src/` clean, `1081-*.test.ts` 14/14. technical-analysis: `go build`/`go vet`/`go test ./...`/`golangci-lint run` clean, `dashboard/build.sh` green (35/35 + headless render, esbuild/playwright-core confirmed still load-bearing). pdf-extractor `lint-imports` 3/3 kept; stock-price `golangci-lint run` 0 issues. Full `bun test`: standing `FIX-MCP-SUITE-HEALTH-BASELINE` order-dependent red only — 3-run base-vs-head A/B (disposable `git worktree`) showed every failing file either pre-existing in base or a run-to-run flip on identical code (base 20/9files, head-run1 24/10files, head-run2 2/2files); zero deterministic net-new failures.

**Board:** `task_board.in_progress[FACTORY-GUARD-CI-DEADCODE-IMPL]` → `review` (`next_agent: qa`), `.head` reset to idle, same `orch-apply.sh` write.

**Simplicity gate:** PASS — every deletion is pure subtraction of independently zero-importer-verified code; check-3's Dockerfile-content refinement is the minimal signal that avoids the false positive (no new dependency, no broader per-symbol tooling).

**Zone note:** No MCP/gateway tool available this session (Read/Edit/Write/Bash only, confirmed at Step 0) — flipped the board row directly via `scripts/orch-apply.sh` (permitted, pure bash); could not release `task:FACTORY-GUARD-CI-DEADCODE-IMPL` or send Telegram (structural gap, flagged for the coordinating dev-team session). Mid-task, ~12 staged `git rm` deletions were found unstaged between two background test runs (index reverted to HEAD, files still gone from disk) — re-staged immediately, verified residual-check 0 before AND after commit; root cause not conclusively isolated (2 concurrent single-file peer commits landed on `main` in the same window) but files were never lost, only re-staged.

Zone health: no drift detected.

## Session 2026-07-30 — FACTORY-GUARD-CI-NOHARDCODE-IMPL — REVIEW

**Task:** dev-team BOUNDED-1 auto-pickup (`cross-service/`, epic FACTORY-MAINTAINABILITY-2026-06), 5th sibling (own brief `2026-07-24-factory-guard-ci-no-hardcode-allowlist-scan.md`, which itself corrects the ticket's naive "ticker allowlist" reading — hundreds of legit domain rule-table arrays are NOT the bug class, only a literal smuggled into a control-flow condition is). New CI gate + fix 2 cosmetic branches + annotate 2 known-debt findings (JANITOR-034/035).

**Actions taken:** New `scripts/audits/no-hardcode-allowlist-scan.sh` (`--check`, zero-tolerance, 2 checks: temporal-combo `.includes('YYYY')`/Go `strings.Contains` near a literal-year `===`/`==`; ticker/code literal-branch vs `HOSE|HNX|UPCOM|BLOOMBERG`-denylisted quoted ALL-CAPS). Fixed `backfillBctcScalarsTool.ts`'s CTG-only reason branch and `pharmaEventMapper.ts`'s IMP-only reasoning branch to the generic message. Annotated `newsChainFallback.ts` (`JANITOR-035`) and `cascadeExecutor.ts`+`priceSourceRouter.ts` (`JANITOR-034`) with `hardcode-scan-allow:`. Wired `no-hardcode-allowlist-scan` CI job + CANONICAL pointer.

**Verify-live catches:** (1) my own first-draft identifier-boundary regex excluded `.` from the valid-prefix set, silently blocking the real `report.action_code` property-access match — found by running the tool live before trusting it. (2) `priceBackfillService.ts:224` `ticker === "BAD"` (documented test-fixture sentinel, brief §2(c) explicitly out-of-scope) still matches check-2's literal regex — annotated rather than adding an ad-hoc "BAD" denylist entry.

**Verification:** New `no-hardcode-allowlist-scan.test.sh` 9/9 PASS. `tsc --noEmit` clean. Targeted 17-file suite 191/191 pass. Full `bun test`: 14865-14869/40 skip/52-56 fail across 2 runs — matches the standing `FIX-MCP-SUITE-HEALTH-BASELINE` order-dependent pattern, grep-confirmed zero fails touch any file this task changed.

**Board:** `task_board.in_progress[FACTORY-GUARD-CI-NOHARDCODE-IMPL]` → `review` (`next_agent: qa`), `.head` reset to idle, same `orch-apply.sh` write.

**Simplicity gate:** PASS — 2 mechanical checks only (generic ticker-array-overlap detection explicitly deferred per brief §3), fixes are pure subtraction of a special-case branch, annotations cite ticket ids not blanket suppressions.

**Zone note:** No MCP/gateway tool available this session (Read/Edit/Write/Bash only, confirmed at Step 0) — flipped the board row directly via `scripts/orch-apply.sh` (permitted, pure bash); could not release `task:FACTORY-GUARD-CI-NOHARDCODE-IMPL` or send Telegram (structural gap, flagged for the coordinating dev-team session).

Zone health: no drift detected.
