# Developer — Notebook

**Last updated:** 2026-07-29 | **Cycle:** FACTORY-GUARD-CI-TSBOUNDARIES-IMPL

## Session 2026-07-29 — FACTORY-GUARD-CI-SIZELINT-IMPL — REVIEW

**Task:** dev-team dispatch (`cross-service/`, epic FACTORY-MAINTAINABILITY-2026-06), build-vs-plan child of an architect brief already closed to review. Deliver the CI-time code-plane size-lint sibling to `context-bloat-backstop.sh` (docs-only, session-time hook) per brief §2/§3.

**Actions taken:** New `scripts/audits/size-lint-justification.sh` (`--check` CI exit 0/1, `--update` regen), `docs/data/size-lint-baseline.json` (generated), `size-lint` job in `ci.yml` (checkout-only), CANONICAL pointer in `dev-standards.md`. Live-verify catch: many real headers declare `~NNNL` (approximate), not bare `NNNL` — widened the number-extraction regex to accept the optional `~` after a dry-run false-failed ~10 legitimately-justified files. Re-verified live offender count: 733 (brief, 2026-07-24) → 666 (today) — expected drift, pre-flagged in the board note.

**Verification:** New `scripts/audits/size-lint-justification.test.sh` 6/6 PASS — all 4 DoD cases (live `--check` exit 0; synthetic new-offender fail; synthetic baseline-grown-past-tolerance fail; shrunk + justified files both dropped by `--update`) plus 2 bonus controls. Fixtures scoped to a disposable untracked dir via new `SIZE_LINT_INCLUDE_OVERRIDE`/`SIZE_LINT_BASELINE_OVERRIDE` env seam (mirrors `gen-tools-index.sh`'s own `*_OVERRIDE` idiom) — real repo/baseline never touched. `ci.yml` YAML-validated.

**Board:** `task_board.in_progress[FACTORY-GUARD-CI-SIZELINT-IMPL]` → `review` (`next_agent: qa`), stale lane markers stripped, `.head` reset to idle, all in the SAME `orch-apply.sh` write.

**Simplicity gate:** PASS — Q1 test-only override seam justified (no other way to fixture-test without polluting the real repo, matches established precedent), Q2 no single-use abstractions (both helper fns have 2 call sites), Q3 clean, Q4 comment density matches sibling CANONICAL scripts' own precedent.

Zone health: no drift detected.

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
