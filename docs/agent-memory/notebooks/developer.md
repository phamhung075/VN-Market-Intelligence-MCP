# Developer — Notebook

**Last updated:** 2026-05-13 | **Sprint:** macro-external-allsettled-timeout

## Last session summary

Task macro-external-allsettled-timeout — fix POST /macro/external orchestration timeout in macro-indicators.

**Problem:** Route fanned out to 6 scrapers with a combined timeout that broke when slow sources (FRED remote API, calendar Python subprocess) exceeded the budget. The old code used try/catch around calendar but other 5 scrapers were unguarded (any throw would propagate).

**Fix applied:**
- `apps/macro-indicators/src/application/fetch-external-macro.ts`: replaced bare per-source calls with `withTimeout()` wrapper using `Promise.race` against a timeout sentinel. Each source gets an independent budget (8s fast scrapers, 30s calendar). `execute()` now returns `ExternalMacroEnvelope` with `sources` map, `fetchedAt`, and `summary: { ok, failed, totalLatencyMs }`. Never throws.
- `apps/macro-indicators/src/interface/handlers.ts`: updated POST+GET `/macro/external` handlers — HTTP 200 when `summary.ok >= 1`, HTTP 502 only when all 6 fail. Removed try/catch wrapping (use case never throws).
- `apps/macro-indicators/__tests__/unit/fetch-external-macro.test.ts`: NEW — 11 unit tests covering all-ok, one-fail, one-timeout (worldBank, calendar), all-fail, never-throws. Configurable per-source budgets for fast tests (100ms).
- `apps/macro-indicators/__tests__/unit/scrapers/investing-economic-calendar.test.ts`: UPDATED — migrated 5 old tests from `ExternalMacroResult` shape to new `ExternalMacroEnvelope` shape (6 tests, coverage preserved + improved).

**Test results:** 85 pass / 0 fail / 12 skip (was 74 pass pre-task). New tests: +11.

**Type check:** Zero errors in my changed files. Pre-existing `global.fetch = mock(...)` `preconnect` TS errors remain in scraper test files — not introduced by this task, confirmed by stash comparison.

**Container smoke test (POST http://localhost:5004/macro/external):**
- Latency: 8s (tight to per-source budget — expected, fast scrapers geo-blocked from outside VN)
- worldBank/yahoo/cnbc/tradingEconomics: `timeout` (8001-8002ms) — geo-blocked, correct
- fred: `ok` (7248ms) — FRED API reachable
- calendar: `ok` (6481ms) — calendar reachable
- summary: `{ ok: 2, failed: 4, totalLatencyMs: 45735 }`
- HTTP 200 returned (ok >= 1) — contract verified

**Commit:** 12a7221e | Branch: task/macro-external-allsettled-timeout

**Key decisions:**
- `withTimeout()` uses `setTimeout` resolving to Symbol sentinel (not `AbortController`) — no new deps, pure TS/Bun, DDD-compliant (stays in application layer).
- `SourceTimeouts` optional constructor param allows test-speed budgets (100ms) without touching production defaults.
- `fredAvailable` field removed from envelope — callers can inspect `sources.fred.status` instead. Old `ExternalMacroResult` type removed entirely.
- Calendar runs concurrently now (no longer sequential) — budget is 30s which covers Python subprocess warm-up.

**Zone health:** macro-indicators 85/97 tests pass (12 skip = integration/live scraper tests, expected). Pre-existing `global.fetch` TS errors in scraper unit tests not addressed (out of scope, pre-existing). HEALTHY.

## Previous last session summary

Task qa-cleanup-2026-05-13 — Task A + Task B (2 atomic items):

**Task A — DDD layer violation fix (macro-indicators):**
- Moved DEFAULT_SYMBOLS + DEFAULT_CNBC_SYMBOLS from infrastructure scrapers to new domain/defaults.ts.
- application/fetch-external-macro.ts now imports from domain/defaults.js — zero application→infrastructure imports.
- Infrastructure scrapers re-export constants from domain for backward-compat (test call sites unchanged).
- New test: __tests__/unit/domain-defaults.test.ts — 4 tests GREEN.
- Full macro-indicators suite: 74 pass / 0 fail.
- Branch: task/qa-bug-ddd-macro-defaults | Commit: e7a21d60 | merged to main (fast-forward).
- Bug signal archived: docs/signals/processed/qa-bug-2026-05-13T12-30-00Z.json.

**Task B — merge task/push-path-fix-vps-contract-tests:**
- Branch diverged from main (Task A landed first) → standard merge used (not fast-forward).
- File preserved on main: apps/mcp-server/src/__tests__/1892b-vps-contract-push.test.ts.
- Post-merge test: 10 pass / 0 fail (bun test src/__tests__/1892b-vps-contract-push.test.ts).

**Key decisions:**
- domain/defaults.ts over domain/models.ts — models.ts has value-object types; defaults.ts is a clean separate concern.
- tsc errors in __tests__/ (preconnect missing on Mock) are pre-existing, not introduced by this task.
- graphify skipped — no knowledge files changed (pure code + test).

## Known patterns / preferences

- TDD cycle is mandatory: write failing test first, then minimum code to pass. Never write code without a RED test first.
- Before every commit: `bun tsc --noEmit` must exit 0. Do not hand off to QA with type errors.
- Repository pattern (U-4): domain services must use injected repository interfaces — never call `getDb()` directly inside domain/. The DDD rule `domain/ has ZERO imports from infrastructure/` is enforced by QA grep check.
- Default-param injection for repos: `constructor(private repo: IRepo = new SqliteRepo())` — allows unit tests to inject mocks without DI framework.
- Never modify `server.ts` without a Phase plan reviewed by Architect. server.ts bootstraps all MCP tools — unplanned edits cause cascading regressions.
- `docs/data/` is in `.gitignore` — use `git add -f docs/data/project-stats.json` when updating stats.
- Path for test files: `apps/mcp-server/src/__tests__/NNN-task-name.test.ts`. Never at root or in `apps/mcp-server/reports/`.
- Semble search before grep: use `mcp__semble__search` for exploration, grep only for exhaustive literal matching.
- When adding dedup/gate logic to postSignal(), use type-aware defaults — don't apply spam suppression to chain_catalyst/price_confirmation signals by default or you will break enrichment-chain tests.
- UTC timestamp guards in flow files must cover ALL timestamp-writing steps (session log AND notebook commit), not just the first one.
- `withTimeout()` pattern for microservice use-case fan-outs: Promise.race against Symbol sentinel (not AbortController). SourceTimeouts optional ctor param for test speed.

## Carry-over for next session

- Branch task/macro-external-allsettled-timeout ready for QA.
- Pre-existing `global.fetch` TS errors in scraper unit tests — file follow-up task if QA requires full tsc clean.
