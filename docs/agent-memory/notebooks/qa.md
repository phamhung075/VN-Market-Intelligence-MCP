# QA — Notebook

**Last updated:** 2026-05-04 | **Sprint:** 1844

## Last session summary

QA review of task 1844a (backtest retrieval tools). getAllRuns() + get_backtest_runs (#121) + get_backtest_run (#122). 14/14 targeted tests pass. Full suite: worktree had 106 pre-existing failures (missing data/ dir, not regressions). tsc: 0 errors. DDD: clean. Merged to main d3170f27.

## Known patterns / preferences

- Bun v1.3.11 had a known C++ panic crash on large test suites (macOS x64). Upgraded to v1.3.13 in Sprint 1836 (U-1). If developers report unexpectedly high failure counts, check Bun version first.
- Bun v1.3.13 still crashes with OOM on the full 791-file suite when run from the root `apps/mcp-server` directory (peak 1.97 GB). Run targeted tests from apps/mcp-server with `bun test <filter>` for reliable results.
- IMPORTANT: tests must be run from `apps/mcp-server/` to pick up `bunfig.toml` preload (setup.ts sets DB_PATH=:memory:). Running from repo root causes SQLiteError: unable to open database file for all tests.
- `apps/mcp-server/data/` is git-ignored and not created in worktrees. Tests requiring this directory (Task 105, 1322) will fail with ENOENT in worktrees unless the directory is pre-created. These are NOT regressions — always cross-check against main.
- Pre-existing failures (as of Sprint 1844 baseline): 1 (Task 1331a TEST-3 RED guard). Task 265 x3 and Task 1332 x1 were fixed in Sprint 1843.
- Always verify AC-by-AC: do not bulk-approve. Each acceptance criterion in the handoff must be ticked with evidence (test name, line count, etc.).
- DDD check is non-negotiable even for "small" fixes: `grep -r "from.*infrastructure" <modified_domain_files>` must return nothing (comments only are fine).
- `docs/data/` is in `.gitignore` — if project-stats.json is updated, confirm `git add -f` was used.
- Task report format: Compact for fix/≤3 files, Full for new tool/domain service/security change.
- Check pre-existing fail count matches expected BEFORE approving. If test count differs by more than 10, ask developer to recount.
- tsc must be 0 errors — even 1 warning-level type error is a blocker if it touches production code paths.
- worktree project-stats.json may be stale (worktree branched from old commit). Always compare with main's version and keep the more current one during conflict resolution.

## Carry-over for next session

- Sprint 1844 DONE: 1844a APPROVED and merged. toolCount=123, totalTasksDone=514.
- Pre-existing failure set (1 as of 1844): Task 1331a TEST-3 (RED guard — intentional).
- Next task unknown — pipeline-state.json status=idle, waiting for PO.
