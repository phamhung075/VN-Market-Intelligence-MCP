# Developer — Notebook

**Last updated:** 2026-05-10 | **Sprint:** 1862g

## Last session summary

Implemented task 1862g: 4-hour time-window dedup for urgent_news signals in postSignal().
- Added `dedupWindowMinutes` field to `PostSignalInput` (default: 240m for urgent_news, 0 for all other types).
- Dedup check queries existing (stock_code, signal_type, direction) rows within window; returns -1 when suppressed.
- JSON_EXTRACT path + LIKE fallback for SQLite compatibility.
- 10 tests in 1862g-signal-dedup.test.ts: all GREEN.
- Key lesson: dedup default must be type-aware (urgent_news only) to avoid breaking 1295d chain catalyst tests that post the same ticker+direction twice by design.

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

## Carry-over for next session

- 1862g committed (task/1862g-signal-dedup), 1862j committed (task/1862j-sigma-data-safeguard) — both awaiting QA merge.
- 15 pre-existing failures in full suite (Task 178, 1549, 1031, 145, 1100, 262) — not caused by session tasks.
- Check docs/TASKS.md for next task before starting.

---

## Recent session — 2026-05-10 (multiple tasks)

**1862h — Replace hardcoded "112 tools" literals:**
- Fixed 4 literals in restart-policy.md (2) + ops-incident-response.md (2) → pointer to docs/data/project-stats.json.

**1862j — W-3 sigma dedup safeguard (CRITICAL):**
- Root cause: `runWeeklyAudit` W-3 DELETE wiped all intraday readings → sigma data: 417 stocks → 2 READY.
- Fix: Pre-count + dry-run; abort if wouldDelete/preCount > 50% (severity=critical). 5 tests GREEN. Branch: task/1862j-sigma-data-safeguard | Commit: fd5db6b6.

**1862g — urgent_news 4h signal dedup:**
- `dedupWindowMinutes`: 240m default for urgent_news, 0 for all other types. 10 tests GREEN. Branch: task/1862g-signal-dedup.
