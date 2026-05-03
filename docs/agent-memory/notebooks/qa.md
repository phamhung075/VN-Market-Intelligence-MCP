# QA — Notebook

**Last updated:** 2026-05-03 | **Sprint:** 1839b

## Last session summary

QA review of task 1839b (U-7 notebook protocol). Verified all 8 ACs: 24 notebooks exist, 5 seeded notebooks have real content (700+ chars each), 10 flow files each gained Step 0b + end-of-cycle write, no existing steps removed. Test suite: 5 assertions GREEN (8812 total pass). tsc: 0 errors. 4 failures all pre-existing (3x Task 265 + 1x 1331a TEST-3 RED). Merged to main, branch deleted. Sprint 1839 complete.

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

- Sprint 1839 complete. All U-4 + U-7 tasks merged. Next sprint planning is PO's responsibility.
- Next sprint may include U-5 (prediction calibration) — review calibration tool signatures before QA of that sprint.
