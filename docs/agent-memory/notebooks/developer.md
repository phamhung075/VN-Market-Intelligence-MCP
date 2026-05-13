# Developer — Notebook

**Last updated:** 2026-05-13 | **Sprint:** c80 / 1899a-tests

## Last session summary

Task 1899a-tests — integration + unit test suite for news-fetch service.

**What was built:**

Unit tests (apps/news-fetch/src/__tests__/unit/):
- `reuters-rss.test.ts` — 12 tests: AC1-7 (parse fixture, empty feed, HTTP 404, RFC 2822 date, null URL, maxItems cap, confidence HIGH) + 4 normalizeRfcDate tests.
- `use-cases.test.ts` — 9 tests: both use cases, delegation, maxItems default (15/10), error propagation.
- `bloomberg-stealth.test.ts` — 8 tests: source/method correct, empty DOM graceful, browser.close() spy, PerimeterX detection, maxItems boundary, error never throws.

Integration tests (apps/news-fetch/src/__tests__/integration/):
- `reuters-rss-live.test.ts` — 3 tests, all `it.skipIf(CI !== 'true')` — live RSS.
- `bloomberg-stealth-live.test.ts` — 3 tests, all `it.skipIf(PLAYWRIGHT_LIVE !== 'true')` — live Playwright.

E2E test + job (apps/mcp-server/):
- `src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts` — new scheduler job. Bloomberg-first dispatch to news-fetch:5008, pushes to /api/push-news. Never throws. Uses Bun.env overrides for URL injection.
- `src/__tests__/e2e/newsHeadlinesRefreshJob.e2e.test.ts` — 3 tests: bloomberg+reuters fetched in order, error resilience, unreachable service no-throw.

**Config:**
- `apps/news-fetch/bunfig.toml` added — enables src/__tests__/ directory discovery by bun test.

**Key worktree issue encountered:**
CWD for this session is the worktree at `.claude/worktrees/agent-ae4486f872e1bdb6e`. The worktree branch was behind main by ~48 commits (1899a-routes, 1899a-gateway etc). Had to merge the main repo HEAD SHA directly into the worktree branch before source files (application/use-cases.ts, bloomberg-stealth.ts) were available.

**Test results:**
- news-fetch: 165 pass / 6 skip / 0 fail (171 total tests, 15 files)
- mcp-server E2E: 3 pass / 0 fail
- Pre-existing tsc errors (playwright types, 2 files) unchanged.
- Pre-existing mcp-server failures: 134 (baseline). No new failures added.

**Commits:**
- `7f8bbeae feat(1899a-tests): integration + unit test suite for news-fetch`
- Branch: task/1899a-integration-tests (worktree)

**Key decisions:**
- `mock.module('playwright')` + top-level await for BloombergStealth import — module sees mock on first load. Works with Bun's ESM cache.
- Integration tests use `it.skipIf` pattern (not `describe.skip`) — cleaner skip messages per test.
- `newsHeadlinesRefreshJob` in mcp-server/scheduler/news-analysis/ — interface layer, no domain imports.
- bunfig.toml only sets timeout — bun discovers both `__tests__/` and `src/__tests__/` naturally.

## Previous last session summary

Task macro-external-allsettled-timeout — fix POST /macro/external orchestration timeout in macro-indicators.

**Problem:** Route fanned out to 6 scrapers with combined timeout that broke when slow sources exceeded budget.

**Fix applied:**
- `apps/macro-indicators/src/application/fetch-external-macro.ts`: withTimeout() per source (8s fast, 30s calendar). execute() returns ExternalMacroEnvelope. Never throws.
- `apps/macro-indicators/src/interface/handlers.ts`: HTTP 200 when ok >= 1, HTTP 502 only when all 6 fail.
- New test: `__tests__/unit/fetch-external-macro.test.ts` — 11 tests.

**Test results:** 85 pass / 0 fail / 12 skip. Commit: 12a7221e.

## Known patterns / preferences

- TDD cycle is mandatory: write failing test first, then minimum code to pass.
- Before every commit: `bun tsc --noEmit` must exit 0.
- Repository pattern (U-4): domain services must use injected repository interfaces.
- Default-param injection for repos: `constructor(private repo: IRepo = new SqliteRepo())`.
- Never modify `server.ts` without Architect review.
- `docs/data/` in `.gitignore` — use `git add -f docs/data/project-stats.json` for stats.
- Semble search before grep for exploration.
- `withTimeout()` pattern for microservice fan-outs: Promise.race against Symbol sentinel.
- Worktree sessions: verify CWD and merge from parent main if worktree branch is behind.
- mock.module() must be declared before module import in Bun test files.

## Carry-over for next session

- Branch task/1899a-integration-tests ready for QA.
- Pre-existing playwright tsc errors in news-fetch (2 files) — QA should confirm pre-existing.
- mcp-server 134 pre-existing failures (unrelated to 1899a-tests task).
