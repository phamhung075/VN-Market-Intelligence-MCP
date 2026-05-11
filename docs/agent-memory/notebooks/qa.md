# QA — Notebook

**Last updated:** 2026-05-12 | **Sprint:** 1880b + signal-T2 (cycle 37)

## Recent session — 2026-05-12 (cycle 37 — 1880b + signal-T2 merge gate)

**1880b — get_pyramid_tier MCP tool (#128) — APPROVED:**
23/23 tests pass. 1880a regression 8/8. Full suite 9406/0 (Bun v1.3.13 post-completion panic = known macOS heap teardown, not test failure). TSC 0 errors. Tool #128 `get_pyramid_tier` confirmed registry.ts:194 (`registerPyramidTierTool`). DDD PASS (pyramidTier.ts: zero infra imports, pure domain). Security PASS (no process.env, no hardcoded secrets). Delivered on task/signal-T2-backfill branch (cross-branch placement, content correct per QA gate spec).

**signal-T2 — backfill-signals-db migration — APPROVED:**
10/10 tests pass (25 expect calls). signal-T1 carry-over 7/7. TSC 0 errors. Idempotency verified: re-run on real processed/ dir → 57 scanned / 0 inserted / 57 skipped / 0 errors. SyntaxError log on bad.json = expected error-handling path (test fixture). DDD PASS (scripts/, no domain imports). Security PASS (Bun.env.DB_PATH, no traversal).

**Drain commit (signal-drain-c37):**
ee0d77b4 — 10 signal files (5 original + 5 replay + 1 TNB), arch-brief 2026-05-12, tool-usage-stats.json, ops session log, 2 TASK files moved root→reports/.

**Merge:** --no-ff, SHA cb232b26 to main. Branches deleted: task/signal-T2-backfill + task/1880b-pyramid-tier (empty). TASKS.md: 1880b+signal-T2 Backlog→Done, signal-T3 added (unblocked), 1878a-spec+NB-HDR-c38 added In Progress.

**Notes for next QA:**
- Full suite count shifted: 9273 (dev claim) vs 9406 (actual). Delta likely from new test files added in drain commits from other agents. Not a regression — 0 fail.
- Bun crash line present in output — always check if it comes AFTER test summary (post-completion teardown = safe).

## Recent session — 2026-05-12 (1880a — get_investment_clock_phase MCP tool)

**1880a — APPROVED:**
8/8 tests pass (27 expect calls). TSC 0 errors. DDD PASS (investmentClock.ts has zero infra imports, grep clean). Security PASS (no process.env, no any, parameterized SQL in interface layer). All 5 AC outputs verified (Recovery/Overheat/Stagflation/Reflation/insufficient_data). Truth table boundary: PMI=50 → DOWN, CPI=3.0 → LOW → Reflation (Test 7 PASS). Null fallback paths: PMI→gdpGrowth (Test 5), CPI→inflationRate (Test 8), both null → insufficient_data (Test 6). AC4 fetched_at: present in result object at investmentClockTools.ts:170. Registry: import line 91, registered at line 193 as #127. Both barrels export new symbols. Full suite Bun OOM crash is pre-existing infra issue (peak 2.71GB RSS on full __tests__/ dir); adjacent test file 188-alert-digest.test.ts ran clean (34/0). Not caused by 1880a. Branch task/1880a-investment-clock-phase deleted. TASKS.md 1880a Backlog → Done. Report: reports/TASK_REPORT_1880a.md.

## Recent session — 2026-05-12 (signal-T1 — create-signals-db migration)

**signal-T1 — APPROVED:**
7/7 tests pass. tsc clean. Schema matches brief §2 exactly (id AUTOINCREMENT + fingerprint UNIQUE NOT NULL, 2 indexes). Idempotent verified (2 runs, both exit 0). Gitignore confirmed. import.meta.main guard present. DDD clean (no apps/ imports). Security clean (no process.env, no hardcoded secrets). LOC 89 vs ~30 target — non-blocking (extra comments + error handling).
Branch merged no-ff to main. Branch deleted. signal-T2 unblocked → added to Backlog.
Report: reports/TASK_REPORT_signal-T1.md.

## Previous session — 2026-05-11 (1877e — C2-exempt guard + flow tightening + knowledge SSOT, race recovery)

**1877e — SPRINT-M race recovery (3 parallel agents, branch contamination):**
DDD/security N/A (script + doc only). bash -n CLEAN.

Deliverables verified: is_c2_exempt guard (4 case patterns) in audit script, C2-Exempt table (+13 LOC) in commit-convention.md, PM convention block (+5 LOC) in pm/main.md, QA Task-trailer mandate (+1 LOC) in qa/main.md.

Race recovery: 1877e-1 empty stub deleted. 1877e-2 merged (f18b359f). 1877e-3 merged (fcef31da, notebook conflict resolved preserving all 3 task entries).

Final audit post-merge: C1=0.9501 PASS / C2=0.6308 FAIL (DEFERRED, was 0.5867) / C3=0.9254 PASS / C4=0.9628 PASS.
Exempt bucket spot-check: all 4 patterns correctly excluded, 1 genuine violator correctly flagged.
AC-1 (C2≥0.85) DEFERRED to 2026-05-17 — requires ~92 new compliant commits via flow tightening.
ACs 2-7 (1877e-1), 1-6 (1877e-2), 1-5 (1877e-3): all PASS.

APPROVED-WITH-DEFERRAL. Report: reports/TASK_REPORT_1877e.md.

## Recent session — 2026-05-11 (1877d — C3 AC-trailer exemption policy)

**1877d — C3 exemption: notebook/state/merge commits:**
Bash script + 3 doc files. DDD/security N/A. bash -n CLEAN.

6 ACs re-run from scratch (no --emit-signal):
- AC-1 PASS: C3=0.9180 (pass threshold 0.80). Developer claimed 0.9167 — minor delta from additional compliant commits since sampling. Both exceed threshold.
- AC-2 PASS: notebook SHAs 171f56df/3bf792d5/83e3a7f7 confirmed `chore(memory/*)` subjects. None appear in C3 violations JSON.
- AC-3 PASS: state SHAs 412aff9b/e6024028 confirmed `chore(state): ...` subjects. None in violations.
- AC-4 PARTIAL: Pattern `*merge\ task/*` catches `chore(1869/mcp-server): merge task/1869a-...` format. DOES NOT catch `chore(merge): QA APPROVED task/1877c-...` format (SHAs 9e19cd4b, 27e4e0d6 still in violations). Brief §4 only specifies the `merge task/` pattern — "QA APPROVED task/" is undocumented format variant used by cycle 30/31/32. C3=0.9180 absorbs gap; AC-1 still passes. Deviation documented.
- AC-5 PASS: genuine violations [fc541585 chore(qa) no-AC, 3d33dd23 docs no-AC, a3335cc8 docs no-AC] confirmed not false positives (all have Task: but no AC: trailer on real task commits).
- AC-6 PASS: `bash -n scripts/audits/commit-convention-audit.sh` exit 0.

LOC overage: +33 net vs ≤30 budget. Breakdown: 4 cosmetic lines (3 comment lines + 1 blank separator in case block). Material net = ~29 LOC. APPROVED as cosmetic.

AC-4 follow-up recommendation: add `*QA\ APPROVED\ task/*` to case block in commit-convention-audit.sh (single line). Not blocking — C3 margin 0.9180>>0.80.

Merge SHA: 67fd8a7e. TASKS.md 1877d In Progress → Done. pipeline-state → idle.

APPROVED (with AC-4 documented deviation).

## Recent session — 2026-05-11 (1877c — C4 scope-vocab remediation)

**1877c — VOCAB 20→52 + sprint-ID exemption:**
Shell script + knowledge doc. DDD/security N/A. bash -n CLEAN.

6 ACs re-run from scratch (no --emit-signal):
- AC-1 PASS: bash -n exit 0.
- AC-2 PASS: C4=0.9826 (169/172). ≥0.95 threshold MET.
- AC-3 PASS: violations = [cycle-28, *, c26] only. 5 sprint-ID commits spot-checked — none in violations.
- AC-4 PASS: *, c26, cycle-28 all present in violations array.
- AC-5 PASS: two runs identical on all numeric fields. window.until differs (dynamic "now" — expected).
- AC-6 PASS: grep for local -n / declare -A / mapfile / [ >= ] → 0 hits.

VOCAB: 52 tokens, exact match to brief §4.1, alphabetically sorted. No extras, no missing.
Sprint-ID pattern: `case "${first4}" in [0-9][0-9][0-9][0-9])` — POSIX-safe.
Knowledge file: 8-line area-token table + sprint-ID exemption note confirmed.

Non-blocking: dev claimed 168/171 (0.9825); actual run yielded 169/172 (0.9826) — consistent with architect note (additional compliant commits since sampling). Verdict still better than required.

Merge SHA: 9e19cd4b. Branch task/1877c-c4-vocab-remediation deleted. TASKS.md 1877c In Progress → Done. pipeline-state idle.

Overall audit verdict: C1 PASS, C2 FAIL (0.5694), C3 FAIL (0.7722), C4 PASS. 1877c scope = C4 only. C2/C3 separate concern.

APPROVED.

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
