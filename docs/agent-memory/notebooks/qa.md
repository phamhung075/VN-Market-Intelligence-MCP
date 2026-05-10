# QA — Notebook

**Last updated:** 2026-05-11 | **Sprint:** 1867

## Last session summary

Task 1863e-RECONCILE — Tier 3 alert-commander wiring. Commit 4286c150. Target test: 5/5 pass (happy/missing-ticker/bad-direction/conviction>1/store-throws). Full suite 9266 pass / 16 fail / 38 skip — 16 failures all pre-existing Task 178 (unrelated DB-less environment issue). tsc 0 errors. DDD PASS (alertVerdictTools imports infra only, no domain). Security PASS. AC1 PASS: write_alert_verdict in tools_packages. AC2 PASS: cycle.md Step 4a calls write_alert_verdict after send_telegram + mark_alert_read, before Step 4b. AC3 PASS: tools/package row present with full params. AC4 PASS: 5 test cases confirmed. AC5 PASS: import path correct, no circular dep. AC6 PASS: 5/5. AC7 PASS: 0 new regressions. AC8 PASS: tsc 0 errors. AC9 PASS (1864a): error path routes channel="work". Extra: Step 0 cycle-bootstrap probe present (MAT regression clean). WORK-vs-MARKET routing cleanly stated. APPROVED + merged to main. Branch deleted.

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

- Sprint 1867 active. 1863a + 1863b + 1863c + 1863e + 1863f RECONCILE APPROVED and merged. 1863d/g/h pending.
- Pre-existing failure set: 15 failures (current bun test baseline). Stable.
- Pre-existing TSC errors: present (H3-urgent-news, dailyDashboardJob, regimeConfidenceThreshold, watchdog 1557/1567, 1850e, 1854b) — all pre-existing.
- Branch merge strategy: if branch has extra unrelated commits causing doc conflicts, cherry-pick production commit only.
- Remaining Todo: 1863g (knowledge updates), 1862c (Cowork MCP access — architect), 1862h.
- 1862i CLOSED 2026-05-11. QA fix applied (lastSuccessfulCycle timestamp was 24h future).

---

## Recent session — 2026-05-10 (multiple tasks)

**1862j — sigma dedup safeguard:** 5/5 tests pass. Full suite: 8945 pass (102 worktree ENOENT noise). tsc branch EXIT:0. DDD PASS. Security PASS. APPROVED + merged.

**1862f — RSS retry backoff:** 10/10 pass. Full suite: 9069/15 (all pre-existing). DDD PASS. Circuit breaker logic verified (base→double→cap→reset). APPROVED + merged.

**1862g — urgent_news 4h dedup:** 10/10 pass. Full suite 9137, 0 failures (Bun OOM crash = known bug). DDD PASS. APPROVED + merged.

**1863a-RECONCILE — alertVerdictStore file-store layer:** 19/19 pass. tsc EXIT:0 all phases. DDD PASS (infrastructure/fileStore). ACs 1-12 verified. APPROVED + merged. Report: reports/TASK_REPORT_1863a.md.

**1863b-RECONCILE — verdictResolutionJob scheduler swap:** 14/14 pass. Full suite 9259/16 (16 pre-existing = same as main). tsc 0 errors. DDD PASS (scheduler imports infrastructure only). Security PASS. All 12 ACs verified. 1863f deleted, all 10 scenario families ported to 1863b + 2 new (batch, idempotency). Cherry-picked 43910535 onto main (branch had extra unrelated flow doc commit). APPROVED + merged. Report: reports/TASK_REPORT_1863b.md.

**1863c-RECONCILE — Tier 3 cron wiring:** Full suite 9132/15 (15 fail, 1 fewer than prior baseline of 16 — no regression). tsc 0 new errors (identical pre-existing set confirmed on main). 8/8 ACs verified: cronConfig.ts L127 has verdictResolutionJob at minute=7; collision-avoidance comment present; Bun.env.CRON_VERDICT_RESOLUTION unique; startScheduler.ts L44 import correct; L668-676 schedule uses jobRunRepo.wrapRun; no duplicate import/schedule. Extra checks: no other cron at minute=7 or :37; env var unique; key unique. DDD PASS (cronConfig zero imports; startScheduler imports scheduler layer only). Security PASS (Bun.env, no secrets). Commit 84eeb7a4 cherry-picked onto main as 34acef31. APPROVED + merged. Report: reports/TASK_REPORT_1863c.md.

**1862i — project-stats.json stats refresh (doc-only):** No test execution (doc-only). JSON valid. 14/14 ACs verified (see below). One QA fix applied: lastSuccessfulCycle was "2026-05-11T22:00:20Z" (24h in future) → corrected to "2026-05-10T22:00:20Z". Notebook commit b27e1b11 is valid unified-agent daily-review entry — NOT a misfile. totalTasksDone=555 derivation confirmed: 40 Done rows with 2026-05-xx dates in TASKS.md (matches dev claim). currentSprint=1867 interpretation: most-recently-closed sprint (1867 is closed per git log 2f955a3d). CONDITIONAL_APPROVED — merged with fix commit 2b4b9c3c. Branch deleted. Merge SHA: 500e14fd (TASKS update). Note: docs/data/ is in .gitignore — dev used staged approach correctly (already staged before add attempt).

**1863f-RECONCILE — signal_feedback 1864b regression guard:** Verify-only (no code changes). 4 cited file:line refs confirmed on main: agentSignalTools.ts:41 imports SignalFeedbackFindingDataSchema; agentSignalTools.ts:72-79 SIGNAL_TYPE_VALIDATORS includes signal_feedback; agentSignalStore.ts:37-47 SignalTypeSchema z.enum includes "signal_feedback" at line 46; signalTypes.ts:306 exports SignalFeedbackFindingDataSchema = z.record(z.unknown()), line 320 in SignalSchemas barrel. Full suite: 9134 pass / 15 fail (exact match to self-reported baseline). tsc errors all pre-existing. DDD PASS (no infra imports in domain/signals/). Security PASS. Branch diff: 2 commits only — task report (0b502df1) + memory notebook — zero production code on branch. APPROVED + merged.
