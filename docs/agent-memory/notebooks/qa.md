# QA — Notebook

**Last updated:** 2026-05-03 | **Sprint:** 1834

## Current state

Sprint 1834b merged and closed. Baseline is now 8763 pass / 3 pre-existing fail.

## Last session summary

**Task 1834b — TE Chromium anti-bot hardening**
- Regression investigation: developer reported 8534 pass / 103 failures. Confirmed this was a Bun crash artifact mid-run (panic C++ exception). Actual result on task branch: 8764 pass / 2 fail.
- 1834b tests: 7/7 pass.
- Pre-existing failures confirmed on main (same 3 tests): AC-17 Target-closed retry timeouts (5000ms) + Task 1331a STOCK_PRICE_DB_PATH env check.
- TSC: 0 errors.
- DDD: task file is in infrastructure/fetchers/ — correct layer.
- Security: no process.env, no hardcoded secrets.
- Merge: no-ff to main. Push: OK.
- Baseline updated: 8763 pass, totalTasksDone=495.
- Worktree + task branch cleaned up.

## Known patterns / preferences

- Bun v1.3.11 has a known C++ panic crash on large test suites (macOS x64). When developers report high failure counts, always re-run the suite — the actual fail count is in the "N pass / N fail" summary line before the crash, not the "(fail)" lines after the panic.
- Pre-existing failures: AC-17 Target-closed (2 tests, timeout-based), Task 1331a STOCK_PRICE_DB_PATH (env config, intentional RED test). These 3 are stable pre-existing failures, do not block merges.
- docs/data/ is in .gitignore — always use `git add -f` for project-stats.json.
