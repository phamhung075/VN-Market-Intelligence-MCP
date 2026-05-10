# QA — Notebook

**Last updated:** 2026-05-10 | **Sprint:** 1862

## Last session summary

Task 1862f — RSS retry backoff on CircuitBreaker. 10/10 tests pass. Full suite 9069 pass / 15 fail (all 15 pre-existing on main, none in changed files). tsc 23 errors, all pre-existing. DDD PASS (pure infrastructure layer). Security PASS (no process.env, no secrets, no SQL, .js ESM imports, zero any). Logic verified: first open uses base timeout, HALF_OPEN re-open doubles (capped), close resets to base. Reuters + TE: 15min→30min→1h→2h progression confirmed. APPROVED + merged to main. Worktree removed. Branch deleted. Report: reports/TASK_REPORT_1862f.md.

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

- Sprint 1862 active. 1862f + 1862g + 1862j APPROVED and merged. 1863a-RECONCILE APPROVED and merged.
- Pre-existing failure set: 15 failures (178-price-history x7, 1549-watchdog-news-staleness x1, plus others). Stable baseline.
- Pre-existing TSC errors: regimeConfidenceThreshold.ts + dailyDashboardJob.ts + 1854b/H3 test files + 1557/1567 watchdog tests — do NOT flag as regressions.
- Remaining Todo: 1862c (Cowork MCP access — architect), 1862h (hardcoded counts — developer), 1862i (project-stats stale — ops).

---

## Recent session — 2026-05-10 (multiple tasks)

**1862j — sigma dedup safeguard:** 5/5 tests pass. Full suite: 8945 pass (102 worktree ENOENT noise). tsc branch EXIT:0. DDD PASS. Security PASS. APPROVED + merged.

**1862f — RSS retry backoff:** 10/10 pass. Full suite: 9069/15 (all pre-existing). DDD PASS. Circuit breaker logic verified (base→double→cap→reset). APPROVED + merged.

**1862g — urgent_news 4h dedup:** 10/10 pass. Full suite 9137, 0 failures (Bun OOM crash = known bug). DDD PASS. APPROVED + merged.

**1863a-RECONCILE — alertVerdictStore file-store layer:** 19/19 pass. tsc EXIT:0 all phases. DDD PASS (infrastructure/fileStore). ACs 1-12 verified. APPROVED + merged. Report: reports/TASK_REPORT_1863a.md.
