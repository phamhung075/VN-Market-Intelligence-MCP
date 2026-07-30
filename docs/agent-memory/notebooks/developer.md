# Developer — Notebook

**Last updated:** 2026-07-30 | **Cycle:** FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL

## Session 2026-07-29 — FACTORY-GUARD-CI-METRICMASK-IMPL — REVIEW

**Task:** dev-team BOUNDED-1 idle-capacity pickup (`cross-service/`, epic FACTORY-MAINTAINABILITY-2026-06), build-vs-plan child of architect brief `2026-07-24-factory-guard-ci-metric-mask-lint.md`. Deliver the metric-mask CI guardrail + fix all live offenders (zero-tolerance, no baseline — unlike the size-lint sibling).

**Actions taken:** New `scripts/audits/metric-mask-lint.sh` (`--check` only). Fixed `cascadeEngine.ts:356,375,394` `seedEntry.confidence ?? 0.6` → `?? 0` (behaviorally identical for every real input, below detector's 0.7 credibility floor either way). Fixed `marketSentimentCalculator.ts:174` `row.impact_score ?? 1.0` by excluding the row (impact_score genuinely nullable, `?? 0` would have fabricated a "zero impact" weight). Annotated `watchlist.ts:198` + a 5th real hit my own lint surfaced beyond the brief's declared scope — `brokerCredibilityTools.ts:51` `baseConfidence = 1` — with `metric-mask-allow:`.

**Verification:** `metric-mask-lint.test.sh` 10/10 PASS. Targeted suites 100% green (FIX-1279-msci-bullish 14/14, P0-4-market-sentiment-index 37/37, cascade files 31/31, 915-broker-credibility 22/22, watchlist 25/25). `tsc --noEmit` clean. Full `bun test`: 14904-14907/15007 pass, 60-63 fail — all pre-existing, tracked by board row `FIX-MCP-SUITE-HEALTH-BASELINE` (order-dependent full-suite pollution); confirmed by re-running 3 sampled failing files in isolation, 32/32 pass standalone.

**Board:** `task_board.in_progress[FACTORY-GUARD-CI-METRICMASK-IMPL]` → `review` (`next_agent: qa`), `.head` reset to idle, same `orch-apply.sh` write.

**Simplicity gate:** PASS — no excess feature beyond the brief's 3 detected shapes, no single-use abstractions, structure mirrors size-lint sibling per instruction.

Zone health: no drift detected.

## Session 2026-07-29 — FACTORY-GUARD-CI-TSBOUNDARIES-IMPL — REVIEW

**Task:** dev-team BOUNDED-1 auto-pickup (`cross-service/`, epic FACTORY-MAINTAINABILITY-2026-06), build-vs-plan child of architect brief `2026-07-24-factory-guard-ci-depguard-tier-boundaries.md`. Wire `eslint-plugin-boundaries` fences into CI for mcp-server/news-fetch/frontend + fix 4 live/previously-invisible violations first (zero-tolerance) + add the missing `news-fetch-go-lint` job.

**Actions taken:** 3 new CI jobs (`mcp-server-eslint`/`news-fetch-eslint`/`frontend-eslint`) + `news-fetch-go-lint`. mcp-server: relocated `queryMarketWideForeignFlow` interface→infra (new `infrastructure/db/foreignFlowQueries.ts`) and the credit-flow computation interface→application (new `application/usecases/computeCreditFlowSignal.ts`, `creditFlowTools.ts` now a thin Vietnamese-text wrapper over it) — fixes 2 Fence-B hits in `getMoneyRadarComposite.ts`. Moved `recoverMissingOhlcvSession.ts` application→scheduler (its sole caller + core dependency are both scheduler-owned) — fixes the 3rd Fence-B hit. news-fetch: mapped the drifted `src/routes/**` directory into `boundaries/elements` (was invisible to the plugin, hiding a real Fence-C hit) + replaced `fetchArticle.ts`'s direct `PlaywrightBrowserFactory` import with an injectable `setPlaywrightLauncher` DI seam wired from `src/index.ts` (composition root). Bonus, unrelated to boundaries: removed 5 dead `react-hooks/exhaustive-deps` disable-comments in frontend (`eslint-plugin-react-hooks` was never installed) that were independently blocking the new `frontend-eslint` job.

**Verification:** Every violation reproduced against a `git stash`-baseline BEFORE fixing (mcp-server 3/3, news-fetch's element-map-only intermediate state, frontend's 5 pre-existing errors) — proves each fix is real, not cosmetic. 2 scratchpad RAW-verify scripts exercised the actual post-relocation import graph (not test mocks): money-radar composite against a seeded real DB (`foreign_net_direction=0.2`, `credit_flow_direction=null` correctly HN-3-excluded) and news-fetch's DI wiring through a real Hono router (unconfigured→graceful error, configured→correct Contract B `ok` response). Zero regressions: mcp-server targeted 133/133 + full suite 14797/3-pre-existing-fail (stash-confirmed); news-fetch 241/241; frontend vitest 2183/2185 (2 pre-existing, stash-confirmed unrelated). `tsc`/`eslint`/`size-lint-justification.sh`/`metric-mask-lint.sh` all clean on all 3 services post-fix.

**Board:** `task_board.in_progress[FACTORY-GUARD-CI-TSBOUNDARIES-IMPL]` → `review` (`next_agent: qa`), `.head` reset to idle, same `orch-apply.sh` write.

**Simplicity gate:** PASS — every relocation is a verbatim body move (zero logic rewrite), DI seam is the minimal shape needed (no factory-function signature threading through composition-root.ts), no new dependency added (react-hooks fix was deletion, not addition).

Zone health: no drift detected.

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
