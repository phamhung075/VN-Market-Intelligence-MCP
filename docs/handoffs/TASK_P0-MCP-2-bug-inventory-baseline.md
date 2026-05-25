---
title: "Bug-Inventory Baseline — mcp-server (P0-MCP-2)"
date: "2026-05-25"
author: "qa"
task: "P0-MCP-2"
pilot: "mcp-server"
status: "COMPLETE"
zone: "apps/mcp-server/"
---

# Bug-Inventory Baseline — `mcp-server` (P0-MCP-2)

**Purpose:** PRE-REFACTOR baseline so post-refactor regressions are detectable. Read-only analysis — no source edits, no pilot-status edits.

**Context:** Phase-0 OPEN (PO UNBLOCK 2026-05-25T08:40:43Z). Runs in parallel with architect P0-MCP-1 brownfield scan (both are read-only, zero write contention).

---

## 1. Test Baseline

**Command:** `bun test` (run from `apps/mcp-server/`, host-side, NOT a Docker build)

**Results (two independent runs — 2026-05-25):**

| Run | Pass | Fail | Skip | Errors | Total Tests | Files |
|-----|------|------|------|--------|-------------|-------|
| Run 1 | 9411 | 345 | 35 | 12 | 9791 | 911 |
| Run 2 | 9408 | 348 | 35 | 14 | 9791 | 911 |

**Observations:**
- The ±3 variance in pass/fail between runs is consistent with flaky BCTC/fixture tests. Total test count (9791) and skip count (35) are stable across both runs.
- **Bun v1.3.13 crashes with a C++ exception AFTER test results print.** Both runs completed and emitted full results before crashing. The crash is a pre-existing Bun runtime bug (same URL pattern seen in QA cycles 103–108 and 112–113 in the notebook). It does NOT indicate a test failure — results are complete.
- `expect()` calls: ~28,941–28,948 across both runs (stable).

**Drift vs project-stats.json SSOT:**

The SSOT (`docs/data/project-stats.json`) records baseline as `testBaselinePass: 9277 / testBaselineFail: 34` (Sprint 1912a reconciliation). The live suite NOW runs **9791 tests (9408-9411 pass, ~345-348 fail, 35 skip)**.

| Metric | SSOT (project-stats.json) | Live (2026-05-25) | Delta | Status |
|--------|--------------------------|-------------------|-------|--------|
| Total tests | 9311 | 9791 | +480 | GROWTH (new tests added since 1912a) |
| Pass | 9277 | ~9409 | +132 | GROWTH |
| Fail | 34 | ~346 | +312 | DRIFT — see note |
| Skip | N/A | 35 | +35 | NEW |

**SSOT DRIFT FLAG:** The 34-fail baseline in project-stats.json is stale. QA notebook confirms across cycles 106–108 that ~345–364 failures are "pre-existing (BCTC/fixture)" tech debt — they existed before the current Phase-0 analysis. The QA notebook (cycle-108, cycle-107, cycle-106) consistently labels these as "pre-existing, 0 [task] regressions." The correct live pre-refactor fail baseline is **~345–348**.

**Honest Pre-Refactor Baseline (binding for post-refactor comparison):**

```
bun test result: ~9408–9411 pass | ~345–348 fail | 35 skip | 9791 total | 911 files
```

A post-refactor run that shows MORE than 348 fail OR fewer than 9408 pass is a regression signal.

---

## 2. Tool Count

**SSOT pointer:** `docs/data/project-stats.json#toolCount` = **146**

**Live grep (2026-05-25):**
```bash
grep -rn "server\.tool(" apps/mcp-server/src --include="*.ts" | grep -v "//" | wc -l
# Result: 146
```

**Result: 146 (matches SSOT — no drift)**

The architect's P0-MCP-1 brownfield inventory also confirms 146 (§2, Tool Surface). The 12 barrel modules span: system (21 files), sector (15), macro (14), market-data (9), news-analysis (9), alerts (9), financial-reports (8), portfolio (7), briefings (5), backtesting (2), analysis (1), kinhdich (1).

Note: `docs/data/system-map.json` lists 125 MCP tools — this is a curation lag (system-map is not auto-updated). Trust `project-stats.json` as the live SSOT.

**Binding baseline:** 146 tools. Post-refactor must equal 146 (or the delta must be explicitly accounted for by G5-inverse deletions).

---

## 3. Scheduler Count

**SSOT pointer:** `docs/data/project-stats.json#cronJobCount` = **77**

**Live grep — Gate 2d probe (from `dev-mcp-server` flow):**
```bash
grep -c "cron.schedule" apps/mcp-server/src/scheduler/startScheduler.ts
# Result: 68
```

**Live count — CRON config keys in `cronConfig.ts`:**
```bash
grep -E "^\s+\w+:" apps/mcp-server/src/scheduler/cronConfig.ts | grep "Bun\.env" | wc -l
# Result: 73
```

**Three-way count summary:**

| Source | Count | Notes |
|--------|-------|-------|
| `project-stats.json#cronJobCount` (SSOT) | 77 | Set Sprint 1954 |
| `cronConfig.ts` CRON keys | 73 | Live config — all 73 named in file |
| `startScheduler.ts` `cron.schedule` calls | 68 | Gate 2d probe used by dev-mcp-server flow |
| `dev-mcp-server` flow expected baseline | 68 | Flow text: "Scheduler count: [68 cron.schedule entries]" |

**DRIFT FLAG:** Three-way mismatch: SSOT=77, cronConfig.ts=73, startScheduler.ts/flow=68.

- The SSOT (77) appears to count ALL scheduler-file-level job functions or includes non-cron jobs (disk usage alerts, watchdogs, integrity checks that may be registered via non-`cron.schedule` mechanism).
- `cronConfig.ts` (73) counts named CRON config entries — the authoritative schedule configuration map.
- `startScheduler.ts` (68) counts only lines with the string `cron.schedule` — the narrowest proxy (some jobs may be registered differently or call `cron.schedule` via helper wrappers).
- The `dev-mcp-server` flow uses 68 as its gate check (Gate 2d), making 68 the operative post-refactor comparison target for that gate.

**Binding baselines for post-refactor verification:**
- Gate 2d probe (`grep -c "cron.schedule" startScheduler.ts`) must equal **68** (unchanged).
- `cronConfig.ts` key count must equal **73** (unless schedulers are explicitly added/removed as part of refactor scope).
- `project-stats.json#cronJobCount` must be updated to reflect the real post-refactor count when the SSOT is reconciled.

**Recommendation:** The SSOT (77) is stale. QA should flag this as a TASKS.md tracking item for pm/po — not a blocker for Phase-0.

---

## 4. Known Open Bugs

### BUG-1: Commit-Mutex Enum Drift (OPEN — system-wide)

**Source:** `feedback_recurring_bug_escalation.md` + TASKS.md §KD-QREF-EXIT + §mcp-server pilot binding notes.
**Description:** `task_claim` MCP tool enum lacks the `commit-mutex` kind. Dev agents cannot acquire a commit-mutex lock — the skill is a no-op. Workaround: agents claim under `sprint-task` kind using key `commit-mutex:main`. Main terminal or po must commit in-tree work at EXIT gates.
**Status:** OPEN — workaround in place across all EXIT gates. Fix requires dev-mcp-server to add `commit-mutex` to the `task_kind` enum in `apps/mcp-server/`. **Affects Phase-1 directly** — every barrel-split commit wave must use the sprint-task workaround. Charter binding: "commit-mutex acquired (kind=`sprint-task` per enum-drift workaround) before any add/commit."
**File reference:** `apps/mcp-server/src/` (task_claim tool implementation — exact file TBD by architect's G5-inverse map). TASKS.md line 107, 246, 264, 270.

### BUG-2: dailyDashboardJob ENOENT Class (OPEN — low coverage)

**Source:** QA notebook context + `docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-charter.md` §Key risks #4.
**Description:** `src/scheduler/system/dailyDashboardJob.ts` has **60% function coverage / 65% line coverage** — large uncovered branches (lines 458–478, 485–487, 494–498, 508–509, 534–566, 580–609). The charter explicitly flags "daily-dashboard ENOENT class" as a regression risk: a refactor regression can silently break a cron (write path to `docs/data/daily-dashboard.json` fails if project root resolution is wrong post-barrel-edit). This is not a current crash — it is low coverage creating an undetected risk zone.
**Status:** OPEN — existing coverage gap, not a test failure. No active incident. Risk class: barrel edit breaks `getProjectRoot()` resolution → ENOENT on write → silently non-fatal (job catches and logs, not alerts). Post-refactor: must verify `dailyDashboard` cron fires and writes file successfully.
**File reference:** `apps/mcp-server/src/scheduler/system/dailyDashboardJob.ts:508–509` (outPath construction), `:534–566` (write path).

### BUG-3: tasksMdJanitorJob Zero Coverage (OPEN — new job, no tests)

**Source:** Live test run (2026-05-25) coverage output.
**Description:** `src/scheduler/system/tasksMdJanitorJob.ts` has **0% function coverage / 4.02% line coverage** (lines 102–151, 169–183, 190–205, 219–258, 269–271, 275, 280, 296–485, 501–566 uncovered). This is a new job (task 1965b, Sprint) that performs TASKS.md/task-lock coherence checks and has no unit tests yet.
**Status:** OPEN — no tests for a job that touches TASKS.md parsing and task_list_held cross-checks. Not a failing test — a missing test gap. Low risk for Phase-0 baseline; flagged for Phase-1 coverage work.
**File reference:** `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts`.

### BUG-4: sscCheckerJob Zero Coverage (OPEN)

**Source:** Live test run (2026-05-25) coverage output.
**Description:** `src/scheduler/news-analysis/sscCheckerJob.ts` has **0% function coverage / 14.29% line coverage** (lines 37–72 uncovered). SSC insider disclosure check has minimal test coverage.
**Status:** OPEN — pre-existing. Not a current test failure. Flagged as coverage debt.
**File reference:** `apps/mcp-server/src/scheduler/news-analysis/sscCheckerJob.ts`.

### BUG-5: kinhDichWrapper Live G5-Inverse Violation (OPEN — architectural debt)

**Source:** P0-MCP-1 brownfield inventory §4 (G5-Inverse Map).
**Description:** `marketTools.ts` and `news-analysis/analysis.ts` import `appendKinhDich()` from local TS domain service (`domain/services/kinhDich/kinhDichWrapper.ts`) — BYPASSING the `kinh-dich-service:5005` HTTP path. `portfolioTools.ts` imports `QUE_META` from `hexagramLibrary.ts`. These are live G5-inverse violations flagged by the architect as "HIGHEST G5-INVERSE RISK."
**Status:** OPEN — architectural debt, not a test failure. Must be remediated in Phase-1 G5-inverse work. Not a pre-refactor blocker.
**File reference:** `apps/mcp-server/src/interface/mcp/tools/market-data/marketTools.ts`, `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts`, `apps/mcp-server/src/domain/services/kinhDich/kinhDichWrapper.ts`.

### BUG-6: Pre-Existing ~345–348 Failing Tests (OPEN — tech debt, not regressions)

**Source:** Live test run + QA notebook (cycles 106–108, 112–113).
**Description:** ~345–348 tests fail in every `bun test` run. QA notebook consistently labels these "pre-existing (BCTC/fixture)" — the failures exist before any refactor work. They are NOT caused by any Phase-0 change. The `project-stats.json` SSOT shows 34 fail (stale Sprint 1912a baseline). The actual current fail count is ~10x higher due to BCTC/fixture test additions since that baseline.
**Status:** OPEN — known tech debt tracked as JANITOR-TBD per SSOT note. Not blocking Phase-1. Post-refactor QA must verify the count stays at ≤348 (not higher).

### BUG-7: DEPLOY-DRIFT — Two MCP Tool Paths 404 (PARTIALLY OPEN)

**Source:** `docs/TASKS.md` §BUG DEPLOY-DRIFT 2026-05-25.
**Description:** `get_macro_calendar` 404s end-to-end through mcp-server (macro-indicators image stale — missing route). Four newer kinh-dich endpoints 404 (kinh-dich container running pre-Go-reboot image). Connectivity root cause fixed (`a5b6203d`, `3bd9e6ae`) but deployed images lag HEAD.
**Status:** OPEN (DRIFT-1 macro, DRIFT-2 kinh-dich, DRIFT-3 CI/CD guard) — DRIFT-QA BLOCKED pending DRIFT-1+2 resolution. These are deployed-container issues, NOT source-code issues. `bun test` does not fail because of these — they are runtime deployment gaps. Phase-0 analysis is not affected. Phase-1 BUILD will resolve DRIFT-1 when mcp-server container is rebuilt.
**File reference:** TASKS.md §BUG DEPLOY-DRIFT. `docs/handoffs/TASK_DEPLOY-DRIFT.md`.

---

## 5. TypeCheck Baseline

**Command:** `bun run check` (which runs `bun tsc --noEmit`)

**Result:** EXIT:0 — **PASS, zero type errors**

TypeScript typecheck is clean. Post-refactor must maintain this.

---

## 6. Regression Tripwires

The following probes MUST be re-run and compared against this baseline after every barrel-split wave during Phase-1. A deviation from any tripwire is a blocking regression.

| Tripwire | Baseline | Probe Command | Block if |
|----------|----------|---------------|----------|
| **Tool count** | 146 | `grep -rn "server\.tool(" apps/mcp-server/src --include="*.ts" \| grep -v "//" \| wc -l` | Count < 146 (tool silenced) or unexpected drop |
| **Gate 2c tool count** | ≥146 | `grep -rc "server.tool\|addTool" apps/mcp-server/src/interface/mcp/tools/ \| awk -F: '{sum+=$2} END {print sum}'` | Count drops vs pre-wave |
| **Scheduler (Gate 2d)** | 68 | `grep -c "cron.schedule" apps/mcp-server/src/scheduler/startScheduler.ts` | ≠ 68 |
| **cronConfig.ts keys** | 73 | `grep -E "^\s+\w+:" apps/mcp-server/src/scheduler/cronConfig.ts \| grep "Bun\.env" \| wc -l` | < 73 (cron deleted) |
| **TypeScript** | EXIT:0 | `cd apps/mcp-server && bun run check` | Non-zero exit |
| **bun test pass count** | ≥9408 | `cd apps/mcp-server && bun test 2>&1 \| grep " pass"` | < 9408 pass |
| **bun test fail count** | ≤348 | `cd apps/mcp-server && bun test 2>&1 \| grep " fail"` | > 348 fail |
| **Dashboard — BCTC inspect** | HTTP 200 | `curl -s http://localhost:3000/api/bctc-inspect \| head -5` | 500 or empty |
| **Dashboard — news-fetch** | HTTP 200 | `curl -s http://localhost:3000/dashboards/news-fetch/ \| head -5` | 500 or empty |
| **Server health** | `{"ok":true}` | `curl -s http://localhost:3000/health` | Non-200 or crash |
| **No new domain→infra import** | 0 matches | `grep -r "from.*infrastructure" apps/mcp-server/src/domain/ --include="*.ts"` | Any match |
| **dailyDashboard file write** | File exists post-run | `ls docs/data/daily-dashboard.json` | Missing/ENOENT after cron runs |

**Post-barrel-wave discipline (from dev-mcp-server flow §G12 DoD Gate):**
Both `bun test` (0 new failures) AND Gate 2 (tool-suite integrity: tsc + server startup + tool count + scheduler count) must pass before any barrel split is declared DONE.

---

## Metadata

```
qa_cycle: P0-MCP-2 (baseline run 2026-05-25)
task: P0-MCP-2
pilot: mcp-server
phase: 0 (analysis/planning only — no source edits)
working_tree_state: CLEAN (git status --porcelain apps/mcp-server/ = empty)
bun_version: 1.3.13
tsc_exit: 0 (PASS)
test_run_1: 9411 pass / 345 fail / 35 skip / 9791 total / 911 files
test_run_2: 9408 pass / 348 fail / 35 skip / 9791 total / 911 files
bun_crash: pre-existing C++ exception AFTER results print (Bun runtime bug, not test failure)
tool_count_live: 146 (matches SSOT)
cron_config_keys: 73
start_scheduler_cron_schedule_lines: 68 (matches dev-mcp-server flow Gate 2d baseline)
ssot_cron_count: 77 (stale — drift flagged)
ssot_test_baseline: stale (9277/34 vs live 9408-9411/345-348)
open_bugs: 7 (BUG-1 commit-mutex enum, BUG-2 dailyDashboard ENOENT class, BUG-3 tasksMdJanitor zero coverage, BUG-4 sscChecker zero coverage, BUG-5 kinhDichWrapper G5 violation, BUG-6 345-348 pre-existing fails, BUG-7 DEPLOY-DRIFT MCP 404s)
blocking_bugs_for_phase1: BUG-1 (workaround required every commit), BUG-5 (G5-inverse remediation required in Phase-1)
non_blocking: BUG-2 BUG-3 BUG-4 BUG-6 BUG-7 (known tech debt / deployment issue)
```

---

*[QA] Bug-Inventory Baseline Record — P0-MCP-2 — 2026-05-25*
