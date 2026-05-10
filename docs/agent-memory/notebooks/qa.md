# QA — Notebook

**Last updated:** 2026-05-10 | **Sprint:** 1862

## Last session summary

Task 1862g — urgent_news 4h dedup in postSignal(). 10/10 tests pass. Full suite 9137 tests, 0 failures (Bun OOM crash after all tests complete is known Bun v1.3.13 runtime bug). tsc pre-existing errors only — 0 new errors. DDD PASS (infrastructure layer, no domain imports). Security PASS (parameterized SQL, JSON_EXTRACT + LIKE fallback both safe). APPROVED + merged to main. Branch deleted. Report: reports/TASK_REPORT_1862g.md.

## Known patterns / preferences

- Bun v1.3.11 had a known C++ panic crash on large test suites (macOS x64). Upgraded to v1.3.13 in Sprint 1836 (U-1). If developers report unexpectedly high failure counts, check Bun version first.
- Bun v1.3.13 still crashes with OOM on the full 791-file suite when run from the root `apps/mcp-server` directory (peak 1.97 GB). Run targeted tests from apps/mcp-server with `bun test <filter>` for reliable results.
- IMPORTANT: tests must be run from `apps/mcp-server/` to pick up `bunfig.toml` preload (setup.ts sets DB_PATH=:memory:). Running from repo root causes SQLiteError: unable to open database file for all tests.
- `apps/mcp-server/data/` is git-ignored. Since 1845b (setup.ts mkdirSync fix), main creates these dirs automatically. Worktrees branched BEFORE 1845b will still show 106 ENOENT failures — not regressions.
- Pre-existing failures (as of Sprint 1846 baseline): 1 (Task 1331a TEST-3 RED guard). Stable.
- Always verify AC-by-AC: do not bulk-approve. Each acceptance criterion in the handoff must be ticked with evidence.
- DDD check is non-negotiable even for "small" fixes: `grep -r "from.*infrastructure" <modified_domain_files>` must return nothing (comments only are fine).
- `docs/data/` is in `.gitignore` — if project-stats.json is updated, confirm `git add -f` was used.
- Task report format: Compact for fix/≤3 files, Full for new tool/domain service/security change.
- Check pre-existing fail count matches expected BEFORE approving. If test count differs by more than 10, ask developer to recount.
- tsc must be 0 errors — even 1 warning-level type error is a blocker if it touches production code paths.
- worktree project-stats.json may be stale (worktree branched from old commit). Always compare with main's version and keep the more current one during conflict resolution.
- When branch diverges from an old commit (e.g. 1842d), expect merge conflicts. Pattern: worktree adds features on top of 1842d state; main has 1844a+1845x already. Conflicts are always additive — accept both sides.
- export_backtest_run_csv AC: must return raw text not JSON.stringify. Check line with `return { content: [{ type: "text" as const, text: csvString }] }` — no JSON.stringify wrapper.

## Carry-over for next session

- Sprint 1862 active. 1862g APPROVED and merged.
- Pre-existing failure set: 0 failures on 1862g run (9137 tests, Bun OOM crash post-completion is benign).
- Pre-existing TSC errors: regimeConfidenceThreshold.ts + dailyDashboardJob.ts + 1854b/H3 test files — do NOT flag as regressions.
- Next task: 1862f (Reuters/TE RSS errors regression) or 1862c (Cowork MCP access) — both in Todo.
