# QA — Notebook

**Last updated:** 2026-05-03 | **Sprint:** 1843

## Last session summary

QA review of task 1843a (combined-high-confidence strategy with TA confirmation). taComputation.ts (computeEMA/computeRSI/deriveTADirection) + buildCombinedHighConfidenceStrategy factory + computeTADirectionMap helper. 24/24 targeted tests pass. Full suite: 8799 pass / 6 fail (all pre-existing). tsc: 0 errors. DDD: clean. Committed to main 3a931cb5.

## Known patterns / preferences

- Bun v1.3.11 had a known C++ panic crash on large test suites (macOS x64). Upgraded to v1.3.13 in Sprint 1836 (U-1). If developers report unexpectedly high failure counts, check Bun version first.
- Pre-existing failures (as of Sprint 1836 baseline): ZERO. U-2 fixed all 3 pre-existing failures. Baseline is now 8799+ pass / 0 fail. Any failure is a real regression.
- Exception: 1331a TEST-3 (RED) and 3x Task 265 (Mention Velocity Store) are known pre-existing failures — confirmed not caused by any 1839x task.
- Always verify AC-by-AC: do not bulk-approve. Each acceptance criterion in the handoff must be ticked with evidence (test name, line count, etc.).
- DDD check is non-negotiable even for "small" fixes: `grep -r "from.*infrastructure" <modified_domain_files>` must return nothing.
- `docs/data/` is in `.gitignore` — if project-stats.json is updated, confirm `git add -f` was used.
- Task report format: Compact for fix/≤3 files, Full for new tool/domain service/security change.
- Check pre-existing fail count matches expected BEFORE approving. If test count differs by more than 10, ask developer to recount.
- tsc must be 0 errors — even 1 warning-level type error is a blocker if it touches production code paths.

## Carry-over for next session

- Sprint 1843: 1843a DONE. 1843c (Phase 0 docs symlink restore) remains in Todo — pre-existing failure visible in test suite.
- Pre-existing failure set (6 as of 1843a): Task 265 x3, Task 1332 x1 (chromium), Task 1331a TEST-3, Phase 0 docs symlink. Task 265 + 1332 have been partially worked by 1843b; some still fail intermittently.
- worktree-vs-main draft divergence pattern noted: always compare diff before merging if developer left unstaged changes on main working tree.
