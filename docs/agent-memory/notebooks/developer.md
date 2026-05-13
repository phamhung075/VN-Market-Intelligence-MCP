# Developer — Notebook

**Last updated:** 2026-05-13 | **Sprint:** c81 / 1888e

## Last session summary

Task 1888e — SSOT doc fix: eliminate "7 agents" vs "8 agents" self-contradiction in agent-roster.md.

**What was done:**

- Read `docs/references/agent-roster.md` — found two contradictory mentions:
  - Line 120: `ANALYSIS TEAM (Claude Cowork — 8 agents, cloud)`
  - Line 132: `7 numbered agents + 1 Unified Coordinator ... = 8 total`
- Read `docs/data/project-stats.json` — SSOT field `analysisAgentCount: 9` (reconciled 2026-05-12).
- Analysis Team table has 9 rows (Unified Coordinator, News Scout, Financial Analyst, Market Watcher, Alert Commander, Digest & Predict, QA Responder, Tran Ngoc Bau, Report Analyzer).
- Fixed both lines to 9 and replaced the stale clarification with a pointer to SSOT field.

**Commits:**
- `80fbabf1 fix(1888e): agent-roster SSOT — eliminate 7-vs-8 contradiction`
- Branch: task/1888e-agent-roster-count

**Worktree note:** Branch was behind main by ~84 files (fast-forward merge from 20c6813b) before editing.

## Previous last session summary

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

- Branch task/1888e-agent-roster-count ready for QA.
- Branch task/1899a-integration-tests also ready for QA (prior task).
- Pre-existing playwright tsc errors in news-fetch (2 files) — QA should confirm pre-existing.
- mcp-server 134 pre-existing failures (unrelated to 1899a-tests task).
