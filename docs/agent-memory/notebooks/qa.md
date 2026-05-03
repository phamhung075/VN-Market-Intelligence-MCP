# QA — Notebook

**Last updated:** 2026-05-03 | **Sprint:** 1839b

## Last session summary

QA review of task 1839b (U-7 notebook protocol). Flow files updated and notebooks seeded. Test suite: 5 assertions GREEN. tsc: 0 errors. DDD: markdown-only changes, no layer violations possible. Verdict: APPROVED.

## Known patterns / preferences

- Bun v1.3.11 had a known C++ panic crash on large test suites (macOS x64). Upgraded to v1.3.13 in Sprint 1836 (U-1). If developers report unexpectedly high failure counts, check Bun version first.
- Pre-existing failures (as of Sprint 1836 baseline): ZERO. U-2 fixed all 3 pre-existing failures. Baseline is now 8799+ pass / 0 fail. Any failure is a real regression.
- Always verify AC-by-AC: do not bulk-approve. Each acceptance criterion in the handoff must be ticked with evidence (test name, line count, etc.).
- DDD check is non-negotiable even for "small" fixes: `grep -r "from.*infrastructure" <modified_domain_files>` must return nothing.
- `docs/data/` is in `.gitignore` — if project-stats.json is updated, confirm `git add -f` was used.
- Task report format: Compact for fix/≤3 files, Full for new tool/domain service/security change.
- Check pre-existing fail count matches expected BEFORE approving. If test count differs by more than 10, ask developer to recount.
- tsc must be 0 errors — even 1 warning-level type error is a blocker if it touches production code paths.

## Carry-over for next session

- Sprint 1839 tasks still in progress. Confirm all 1839b ACs before marking sprint complete.
- Next sprint may include U-5 (prediction calibration) — review calibration tool signatures before QA of that sprint.
