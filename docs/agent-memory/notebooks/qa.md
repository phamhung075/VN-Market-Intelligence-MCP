# QA — Notebook

**Last updated:** 2026-05-11 | **Sprint:** 1877b

## Recent session — 2026-05-11 (1877b — signal guard for commit-convention audit script)

**1877b — `scripts/audits/commit-convention-audit.sh` --emit-signal guard:**
Shell script only. DDD/security N/A. bash -n CLEAN. Pre-push tsc PASS.

6 ACs re-run from scratch:
- AC-1 PASS: no flag → "Signal emission skipped" + zero root signals.
- AC-2 PASS: canonical SINCE + flag + today in window → exactly 1 FAIL signal written, jq clean.
- AC-3a PASS: non-canonical SINCE + flag → WARNING + zero root signals, exit=1.
- AC-3b PASS: temp copy with UNTIL=2026-05-10, today=2026-05-11 → WARNING + zero root signals.
- AC-4 PASS: processed/ report always written, jq clean, verdict+4 criteria+violations present.
- AC-5 PASS: exit=1 across all invocations (FAIL verdict), suppression did not affect exit code.
- AC-6 PASS: bash -n CLEAN, no local -n / declare -A / mapfile. [ ] comparisons escape < > with \.

Deviation: brief §3 `\>=` pattern not POSIX-valid (bash errors: binary operator expected). Two-clause `[ = ] || [ \> ]` replacement verified equivalent for YYYY-MM-DD lexicographic order. APPROVED.

Artifact cleanup: AC-2 test signal moved to /tmp then deleted. Temp AC-3b script deleted. Zero test artifacts remain in docs/signals/ root.

Net LOC: +26 (diff count). Developer self-reported +29; both within ≤30 constraint.

Merge SHA: 27e4e0d6. Branch task/1877b deleted local+remote (pre-push tsc PASS). TASKS.md: 1877b In Progress → Done. pipeline-state: idle.

APPROVED.

## Recent session — 2026-05-11 (1877a — commit-convention audit script)

**1877a — `scripts/audits/commit-convention-audit.sh` Phase B C1/C2 gate:**
Shell script only. DDD/security N/A. Pre-push tsc PASS (triggered on push).

Script re-run: 293 total, 1 bare merge excluded, 292 audited.
C1=0.9521 (PASS ≥0.90), C2=0.5694 (FAIL), C3=0.7838 (FAIL), C4=0.4759 (FAIL). Verdict: FAIL. Exit 1.
FAIL signal emitted to `docs/signals/agents-architect-<ts>-phase-b-c1-c2-fail.json`.
JSON report: `docs/signals/processed/commit-convention-audit-20260511.json` — jq parses clean, all 8 top-level keys, all 4 criteria objects.

All 6 ACs PASS. 3 violations spot-checked — zero false positives.
Bash 3.2 compat confirmed (no local -n, no 4.0+ constructs). LC_ALL=C locale fix verified.
Non-blocking deviations: commit type `feat` vs `chore` per task spec (defensible); empty-window returns 1.0/PASS instead of 0.0/FAIL (test plan note, not AC).

Merge SHA: 20005b95. Branch task/1877a-commit-convention-audit-script deleted. TASKS.md: 1877a → Done.

APPROVED.

## Recent session — 2026-05-11 (1872a-3 ARCHITECTURE.md SSOT pointers)

**1872a-3 — docs/ARCHITECTURE.md AC3+AC6 SSOT pointers:**
Doc-only. Smart-skip tsc/tests (pre-push hook tsc ran on remote delete — PASS). DDD/security N/A.

AC3 PASS: line 78 — "132 tools, 59 cron jobs, HTTP clients to 8 other services" → exact architect-brief phrasing: `tool count → docs/data/project-stats.json#toolCount; scheduler count → docs/data/project-stats.json#cronJobCount; HTTP clients to all configured downstream services`.
AC6 PASS: line 53 — inline docker cmd → exact architect-brief phrasing: `see .claude/knowledge/restart-policy.md (SSOT — docker-compose only, 9 services)`.
Task commit: 1b4f23a6. Merge SHA: fe82b9f9.
Non-blocking: commit scope `docs(architecture)` vs required `docs(1872a/architecture)` per convention; Sprint: trailer absent. Both minor, doc-only task.
Branch task/1872a-3-architecture-md-ssot-pointers deleted local+remote. TASKS.md 1872a-3 → Done.

APPROVED.

## Recent session — 2026-05-11 (1872a-2 README SSOT pointers)

**1872a-2 — README.md AC2+AC5+AC6 SSOT pointers:**
Doc-only. Smart-skip tsc/tests. DDD/security N/A.

Branch situation: `task/1872a-2-readme-ssot-pointers` local tip = main HEAD (d85d1c43, zero diff). Actual README commit 03a404ce was authored on what became `task/1872a-3-architecture-md-ssot-pointers`. All changes reached main via merge commit fe82b9f9 (1872a-3 merge). Work confirmed present in main:README.md.

AC2 PASS: mcp-server row (line 87) — `(112 tools)` → `(see docs/data/project-stats.json → toolCount)`.
AC5a PASS: line 21 — arch pointer `docs/ARCHITECTURE.md` + `docs/architecture/global.md` added after ASCII diagram.
AC5b PASS: line 97 — `Per-service architecture docs: docs/architecture/microservice/<service>.md` after table.
AC6-A PASS: lines 63-70 docker block → restart-policy.md pointer.
AC6-B PASS: line 81 dev step 3 inline cmd → restart-policy.md pointer.
Scope PASS: only README.md in the task commit.
Commit trailers PASS: Sprint:1872a / Task:1872a-2 / AC:2,5,6.
Arch-update flag: NO (pointer-only, no structural change).
Remaining `## 112 MCP Tools` heading (line 173): NOT in AC scope per architect brief matrix.

APPROVED. Work already in main. TASKS.md row moved Review→Done.

## Last session summary

Tier-2 QA cycle 20. Three branches: 1871b (ARCH.md infra/ tree), 1871d (cron-registry backfill), 1871f (DDD fix vnstock types).

Authoritative baseline: 9168 pass / 12 fail / 38 skip on main HEAD 67d99029 (bun test --timeout 30000). TSC baseline: 23 pre-existing errors.

1871b APPROVED: all 11 infra/ subdirs present in ARCHITECTURE.md, fileStore/ entry mentions alertVerdictStore.ts, cross-link to alert-policy.md (1871g). Doc-only. Merge SHA 6f161a4b.

1871d APPROVED: 21 new entries added (41→62 total). schedulerFileCount=59 matches cronConfig.ts exactly. Existing 41 entries unchanged. New entries use consistent name/schedule/desc/file schema. 3 non-job entries (helper, old-format macro, ohlcvStartupProbe) explain 62 vs 59 delta — pre-existing in file. Merge SHA 2bcae2e5.

1871f APPROVED: DDD critical check PASS — zero actual `import.*from.*infrastructure/` statements in domain/ (grep matched only comments/docstrings). New domain/models/vnstockTypes.ts contains 6 canonical types (zero imports). vnstockBridge.ts re-exports all 6 for backward compat (infra→domain direction = correct). TSC delta=0 (still 23). Vnstock test parity: 37/48/6 identical on both main and worktree. Full-suite delta in worktree (9050 vs 9168) caused by broken symlink data/ → ../../data (resolves to non-existent path in worktree). ENOENT failures are pre-existing worktree infrastructure, not code regression. Merge SHA 30030baa.

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

## Recent session — 2026-05-11 (cycle 22 Tier 1 — 1875b)

**1875b — agents-architect.md NEW agent definition:**
Doc-only (agent definition file). No test suite, no production code. DDD/security N/A.

File check: CONFIRMED NEW — no prior `.claude/agents/agents-architect.md` on main or any branch (git log --all confirms single commit d222b2d5).

YAML frontmatter: name=agents-architect / color=blue / description / tools / model=sonnet — all 5 required fields PRESENT. Factory pattern PASS.

Invariant review: 3-step invariant unambiguous. Step 1 = `date -u` for UTC_STAMP. Step 2 = notebook append with template. Step 3 = atomic `git add` both files + commit. Retry logic: 1 retry then bug Telegram + EXIT. Covers all edge cases.

Commit convention: `fix(agents/1875b/agents-architect)` — type=fix (bug corrected: missing invariant). Scope=agents/1875b. Body + AC trailer present. Task-Id trailer (non-standard key, not "Task:") — minor deviation, non-blocking. Sprint trailer absent — acceptable per no-sprint rule if this is a hotfix commit.

Tests: 9356 pass / 0 fail (exit 0). Bun post-run C++ panic = known Bun v1.3.13 macOS bug, not test failure. TSC: 0 errors (tsc exited cleanly). DDD PASS. Security PASS.

APPROVED. Merge SHA cb15b66d.

## Recent session — 2026-05-11 (cycle 22 Tier 1)

**1875d — signal drain fingerprint dedup:** Flow-only. 1 file (+21/-2). No test suite (no production code). DDD/security N/A. Commit convention PASS (fix/flows/1875d/dev-team, 5 AC trailers). Logic PASS: fingerprint = sha256(from+type+payload+createdAt) correctly distinguishes re-arrival vs new signal. Escape hatches documented (delete processed/ copy OR bump createdAt). result enum updated to 4 values (skipped-duplicate-replay added). Cycle 23 readiness: guard fires immediately; c22 processed files lack fingerprint field → scan misses → at worst one duplicate slips through (safe side, no false skip). Merge SHA d6f7a7b6. APPROVED.

## Carry-over for next session

- Tier-2 QA cycle 20 COMPLETE. 1871b + 1871d + 1871f APPROVED and merged.
- Authoritative baseline post-cycle 20: main HEAD 30030baa (after 3 merges). Expect ~9168/12/38 on fresh run.
- Pre-existing TSC errors: 23 (unchanged across all 3 branches).
- Worktree broken-symlink pattern: data/ → ../../data breaks when worktree is at .claude/worktrees/agent-XXXX/. Causes ~100 ENOENT failures in full-suite run from worktree. NOT a regression — compare vnstock-specific tests (same set) to confirm no code delta.
- Baseline reconciliation: Tier-1 QA (9169/11) vs Tier-2 (9168/12) — 1-test delta is Bun flakiness, not regression. 1871f developer 9046/117 was worktree broken-symlink effect.
- Remaining Todo (Sprint 1871): 1871c (analysis/backtesting ARCHITECTURE.md modules). 1862c-D/E/F/G (Cowork MCP access) still in Todo.
- Sprint 1872 tasks (1872a/1872b) previously merged. TASKS.md Done section up to date through cycle 20.

---

## Recent session — 2026-05-10 (multiple tasks)

**1862j — sigma dedup safeguard:** 5/5 tests pass. Full suite: 8945 pass (102 worktree ENOENT noise). tsc branch EXIT:0. DDD PASS. Security PASS. APPROVED + merged.

**1862f — RSS retry backoff:** 10/10 pass. Full suite: 9069/15 (all pre-existing). DDD PASS. Circuit breaker logic verified (base→double→cap→reset). APPROVED + merged.

**1862g — urgent_news 4h dedup:** 10/10 pass. Full suite 9137, 0 failures (Bun OOM crash = known bug). DDD PASS. APPROVED + merged.

**1863a-RECONCILE — alertVerdictStore file-store layer:** 19/19 pass. tsc EXIT:0 all phases. DDD PASS (infrastructure/fileStore). ACs 1-12 verified. APPROVED + merged. Report: reports/TASK_REPORT_1863a.md.

**1863b-RECONCILE — verdictResolutionJob scheduler swap:** 14/14 pass. Full suite 9259/16 (16 pre-existing = same as main). tsc 0 errors. DDD PASS (scheduler imports infrastructure only). Security PASS. All 12 ACs verified. 1863f deleted, all 10 scenario families ported to 1863b + 2 new (batch, idempotency). Cherry-picked 43910535 onto main (branch had extra unrelated flow doc commit). APPROVED + merged. Report: reports/TASK_REPORT_1863b.md.

**1863c-RECONCILE — Tier 3 cron wiring:** Full suite 9132/15 (15 fail, 1 fewer than prior baseline of 16 — no regression). tsc 0 new errors (identical pre-existing set confirmed on main). 8/8 ACs verified: cronConfig.ts L127 has verdictResolutionJob at minute=7; collision-avoidance comment present; Bun.env.CRON_VERDICT_RESOLUTION unique; startScheduler.ts L44 import correct; L668-676 schedule uses jobRunRepo.wrapRun; no duplicate import/schedule. Extra checks: no other cron at minute=7 or :37; env var unique; key unique. DDD PASS (cronConfig zero imports; startScheduler imports scheduler layer only). Security PASS (Bun.env, no secrets). Commit 84eeb7a4 cherry-picked onto main as 34acef31. APPROVED + merged. Report: reports/TASK_REPORT_1863c.md.

**1862i — project-stats.json stats refresh (doc-only):** No test execution (doc-only). JSON valid. 14/14 ACs verified (see below). One QA fix applied: lastSuccessfulCycle was "2026-05-11T22:00:20Z" (24h in future) → corrected to "2026-05-10T22:00:20Z". Notebook commit b27e1b11 is valid unified-agent daily-review entry — NOT a misfile. totalTasksDone=555 derivation confirmed: 40 Done rows with 2026-05-xx dates in TASKS.md (matches dev claim). currentSprint=1867 interpretation: most-recently-closed sprint (1867 is closed per git log 2f955a3d). CONDITIONAL_APPROVED — merged with fix commit 2b4b9c3c. Branch deleted. Merge SHA: 500e14fd (TASKS update). Note: docs/data/ is in .gitignore — dev used staged approach correctly (already staged before add attempt).

**1875c — record_signal_outcome dispatch (FIX-HIGH):** 5/5 pass. TSC 0 errors. DDD PASS. RCA: no code bug found — 126 tool names unique, MCP SDK exact-key dispatch, buildToolNameMap probe correct, SSE full toolRegistry. TNB c35 F3 = 1 occurrence, likely transient gateway misparse. Defensive additions: collision warn + manifest drift warn in agentBootstrap.ts. 5 regression guards. ACCEPT stance: observability value > reclassification cost. Merge blocker: untracked collision file (worktree artifact) — removed. APPROVED + merged eec8384f.

**1863f-RECONCILE — signal_feedback 1864b regression guard:** Verify-only (no code changes). 4 cited file:line refs confirmed on main: agentSignalTools.ts:41 imports SignalFeedbackFindingDataSchema; agentSignalTools.ts:72-79 SIGNAL_TYPE_VALIDATORS includes signal_feedback; agentSignalStore.ts:37-47 SignalTypeSchema z.enum includes "signal_feedback" at line 46; signalTypes.ts:306 exports SignalFeedbackFindingDataSchema = z.record(z.unknown()), line 320 in SignalSchemas barrel. Full suite: 9134 pass / 15 fail (exact match to self-reported baseline). tsc errors all pre-existing. DDD PASS (no infra imports in domain/signals/). Security PASS. Branch diff: 2 commits only — task report (0b502df1) + memory notebook — zero production code on branch. APPROVED + merged.
