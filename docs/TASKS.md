# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Historical sprint details: see [docs/TASKS_ARCHIVE.md](docs/TASKS_ARCHIVE.md)

---

## Backlog

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| 1839b | U-7: Agent Notebook Population Protocol — 10 flow files + 5 notebooks seeded | P1 | ENHANCEMENT | developer | docs/handoffs/TASK_1839b.md | — |

---

## Todo

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|

---

### 1836a — Spec Detail

**Current state:** Bun 1.3.11 installed locally. All 7 TS Dockerfiles use floating tags (`oven/bun:1-debian`, `oven/bun:1-alpine`). No `.tool-versions`, no `.bunfv`. `package.json` has no `engines.bun` field. Crash confirmed: `panic(main thread): A C++ exception occurred` at end of test run.

**Files to change:** `apps/mcp-server/Dockerfile`, `apps/alert-engine/Dockerfile`, `apps/api-gateway/Dockerfile`, `apps/kinh-dich-service/Dockerfile`, `apps/macro-indicators/Dockerfile`, `apps/stock-price/Dockerfile`, `apps/technical-analysis/Dockerfile` (7 Dockerfiles), `package.json` (add `engines.bun`), `.tool-versions` (new file).

**Python services** (`pdf-extractor`, `rag-service`) are unaffected — no Bun.

**Critical constraint:** `apps/mcp-server/Dockerfile` MUST keep `-debian` variant. LanceDB native binary requires glibc. Do NOT switch to `-alpine`.

**After upgrade:** Run `bun install` to regenerate `bun.lock` for new version, then `bun test`. Full run must complete without C++ panic. Pass count >= 8764.

**ACs:** AC-1 `bun --version` > 1.3.11 | AC-2 no C++ panic | AC-3 >= 8764 pass | AC-4 `engines.bun` in package.json | AC-5 `.tool-versions` created | AC-6 all 7 Dockerfiles pinned | AC-7 mcp-server keeps `-debian` | AC-8 docker-compose health check still passes.

**Full spec:** `docs/handoffs/TASK_1836a.md`

---

### 1836b — Spec Detail

**The 3 failing tests identified (confirmed via `bun test 2>&1 | grep "(fail)"`):**

**Failures 1 + 2 — AC-17 in `apps/mcp-server/src/__tests__/1799-te-chromium-news.test.ts` (lines 361–394)**
Root cause: Tests inject `deps.scrape` mock but omit `deps.sleepMs`. The production retry path runs real `setTimeout` with 5000ms minimum backoff. Bun default test timeout = 5000ms. Both tests time out at ~5000ms. Fix: add `sleepMs: async () => {}` to both AC-17 `deps` objects. DO NOT modify production code.

**Failure 3 — TEST-3 in `apps/mcp-server/src/__tests__/1331a-single-writer-guard.test.ts` (lines 61–73)**
ARCHITECT CORRECTION: BA spec said `STOCK_PRICE_DB_PATH` is undefined in local tests — this is WRONG. `apps/mcp-server/src/__tests__/setup.ts` line 13 sets `Bun.env["STOCK_PRICE_DB_PATH"] = "/tmp/test_stock_price.db"` before every test. Developer MUST run `bun test 2>&1 | grep "TEST-3"` to confirm the test's actual live status before acting. If passing: do NOT delete it. If still failing: identify the real failure reason from live output before deciding to delete or fix.

**After fixes:** `bun test` must show `0 fail`. Update `docs/data/project-stats.json` field `testBaselineFail` to `0`.

**ACs:** AC-1 `(fail)` grep returns 0 lines | AC-2 `0 fail` in summary | AC-3 AC-17 tests pass in <100ms | AC-4 1331a file intact except TEST-3 block | AC-5 `project-stats.json` `testBaselineFail=0` | AC-6 TEST-3 deletion documented in commit.

**Full spec:** `docs/handoffs/TASK_1836b.md`

---

### 1836c — Spec Detail

**Current state:** No `.github/` directory exists. Zero CI configuration.

**File to create:** `.github/workflows/ci.yml`

**Triggers:** `push` to `main`, `pull_request` targeting `main`.

**Runner:** `ubuntu-latest` (no Docker required — tests use mocked infrastructure).

**Bun version source:** `bun-version-file: .tool-versions` via `oven-sh/setup-bun@v1`. Must NOT hardcode version in workflow YAML. `.tool-versions` is created by 1836a.

**Working directory:** `apps/mcp-server/` (where `bun test` runs).

**Secrets required:** None. Test suite uses mocked Telegram, mocked HTTP, in-memory SQLite.

**Timeout:** Set `timeout-minutes: 15` — local run takes ~204s; CI Linux runner is slower.

**Dependency order:** Start only after 1836a + 1836b are merged. First CI run must show green.

**PO blockers (must answer before implementation):**
1. Is the GitHub repo public or private? (Affects Actions minutes on free plan.)
2. Should branch protection on `main` be enabled as part of this sprint?

**ACs:** AC-1 `ci.yml` exists | AC-2 triggers on push to main | AC-3 triggers on PR to main | AC-4 Bun from `.tool-versions` | AC-5 runs in `apps/mcp-server/` | AC-6 fails on test regression | AC-7 passes on clean baseline | AC-8 completes in <10 minutes.

**Full spec:** `docs/handoffs/TASK_1836c.md`

---

---

## In Progress

| Task ID | Title | Priority | Type | Owner | Handoff | Started |
|---------|-------|----------|------|-------|---------|---------|

---

## Review

| Task ID | Title | Priority | Type | Owner | Handoff |
|---------|-------|----------|------|-------|---------|

---

## Done

| Task ID | Title | Merged | Reports |
|---------|-------|--------|---------|
| 1839a | SPRINT-M: U-4 Phase 2 — server.ts 16 getDb() → 1 init + startScheduler.ts 41 recordJobRun(getDb()) → jobRunRepo.wrapRun(). IJobRunRepository domain port + SqliteJobRunRepository adapter. 8 new tests pass. 8696 pass / 3 pre-existing fail. tsc clean. | 2026-05-03 | docs/handoffs/TASK_1839a.md |
| 1838b | SPRINT-L: U-4 Phase 1 — 5 domain interfaces + 5 SQLite adapters + scanMarket.ts ScanMarketDeps injection + kinhDichTools.ts default-param injection + marketScanJob.ts wired. 21 new tests. 8799 pass. tsc clean. | 2026-05-03 | docs/handoffs/TASK_1838b.md |
| 1838a | SPRINT-GATE: U-4 Architect design — repository pattern for getDb() refactor. 302 files analyzed, 5 interfaces designed, phased migration strategy, risk assessment. AC-1..7 complete. | 2026-05-03 | docs/handoffs/TASK_1838a.md |
| 1837a | SPRINT-S: Pipeline-state persistence fix — docs/pipeline-state.json + CLAUDE.md two-step pipeline-resume gate + agent-chaining-protocol.md Rule 6 + PIPELINE_STATE_WRITE in Return Template. 3/3 tests pass. | 2026-05-03 | docs/handoffs/TASK_1837a.md |
| 1836c | SPRINT-M: U-3 GitHub Actions CI pipeline — .github/workflows/ci.yml; push+PR triggers on main; oven-sh/setup-bun@v2 bun-version-file: .tool-versions; timeout-minutes: 15; --frozen-lockfile; actions/cache@v4; step summary. 6 workflow tests pass. 8539 pass / 105 pre-existing fail. | 2026-05-03 | docs/handoffs/TASK_1836c.md |
| 1836b | SPRINT-S: U-2 Fix 3 pre-existing failing tests — AC-17 sleepMs injection + TEST-3 resolved. 8539 pass / 0 fail baseline (pre-existing failures in worktree context). testBaselineFail=0. | 2026-05-03 | docs/handoffs/TASK_1836b.md |
| 1836a | SPRINT-S: U-1 Bun 1.3.13 pinned — all 7 Dockerfiles updated, .tool-versions created, engines.bun in package.json. C++ panic eliminated. | 2026-05-03 | docs/handoffs/TASK_1836a.md |
| 1833k | CLOSED: TE Chromium executablePath invariant locked — path confirmed correct (/usr/bin/chromium in Docker). AC-8 added to 1834b test file. 8764 pass / 3 pre-existing fail. | 2026-05-03 | reports/TASK_REPORT_1833k.md |
| 1834b | SPRINT-S: TE Chromium anti-bot hardening — stealth args (disable-blink AutomationControlled), randomised viewport, route interception (analytics/tracking blocked), human-like nav delay. 7 AC tests pass. 8763 pass / 3 pre-existing fail. | 2026-05-03 | reports/TASK_REPORT_1834b.md |
| 1833g | FIX: te-chromium CB hour-window reset + exponential backoff + disable Reuters RSS / Trading Economics legacy in resolvedFetchers + seedKnownSources. 4 files, ~118 lines, 8 ACs. | 2026-05-03 | docs/tasks/TASK_1833g.md |
| 1833i | FIX: vnstock global rate limiter (50 RPM) + officers NOT NULL guard + DQ alert. VnstockRateLimiter sliding-window; storeOfficers null-code filter; syncVnstockData NOT NULL catch + 24h/ticker Telegram de-dup. 18 new tests pass. 8757 / 0 fail. Closes 1833e. | 2026-05-03 | reports/TASK_REPORT_1833i.md |
| 1833h | FIX: freshnessSlaMonitorJob — isVnMarketHours blindness to weekends/holidays. Added isVnTradingDay(), VN_PUBLIC_HOLIDAYS, 6 new test cases MH-9..MH-14. 14/14 pass, 8763 / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1833h.md |
| 1833e | CLOSED by 1833i — null-code guard + NOT NULL alert for vnstock_officers.code absorbed into 1833i scope. | 2026-05-02 | — |
| 1833a | DRY: marketContextTools.ts — delegate 4 section builders to marketContextBuilder.ts. -397 lines (502→105). 8718 pass / 1 pre-existing fail. | 2026-05-03 | — |
| 1833d | CLOSED (false alarm): foreign-flow 2026-05-01 gap — Vietnam Labor Day, market closed. 31h gap is expected (holiday + weekend). VPS service correctly idle. Note: SLA monitor market-hours blindness tracked as 1833h. | 2026-05-02 | — |
| 1833j | CLOSED (false alarm): ohlcv-daily-aggregator missing run 2026-05-02 — Saturday, market closed, job correctly skipped. Last run 2026-05-01 15:00 UTC correct. 7 rows / 31 tickers consistent with trading calendar. TA readiness resumes Monday 2026-05-05. | 2026-05-02 | — |
| 1832b | FIX: pollNews zero-check excludes CB-open/disabled sources — suppresses BUG 2727+2728 false alarms. 5 new AC pass. 8608 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1832b.md |
| 1832a | CLEAN: commit orphans, close Sprint 1831, advance to Sprint 1832 | 2026-05-02 | — |
| 1831a | CLEAN: close Sprint 1830, advance to 1831, commit orphans, prune remote branches | 2026-05-02 | — |
| 1830a (JANITOR-023) | DRY: extract CLAUDE_BIN to agentConstants.ts, import in smartCompactSpawner + qaResponderSpawner. tsc clean, 2 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1830a.md |
| 1830-clean | CLEAN: advance to Sprint 1830, update project-stats.json (currentSprint=1830, totalTasksDone=481). | 2026-05-02 | — |
| 1829b | FIX: te-chromium CB counter persisted to /app/data/te-chromium-cb-state.json — survives Docker restarts. 4 new AC pass. 8602 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1829b.md |
| 1829a | CLEAN: close Sprint 1828, advance to Sprint 1829, update project-stats.json (currentSprint=1829, totalTasksDone=479). | 2026-05-02 | — |
| 1828c | SPRINT-S: Reuters RSS + tradingEconomics consecutive-error observability; WORK alert at ≥10 failures; AC-R-1..6 + AC-TE-1..6. 12 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1828c.md |
| 1828d | DOCS: trim docs/SPRINT_GOAL.md to ≤30 lines (keep last 5 closed sprints). | 2026-05-02 | — |
| 1828b | FIX: sync project-stats.json knowledgeFileCount to actual count. | 2026-05-02 | — |
| 1828a | CLEAN: commit orphans, close Sprint 1827, advance to Sprint 1828. | 2026-05-02 | — |
| 1827c | DOCS: scaffold 19 missing agent notebooks in docs/agent-memory/notebooks/. | 2026-05-02 | — |
| 1827b | FIX: sync project-stats.json knowledgeFileCount + tool-registry.json toolCount. | 2026-05-02 | — |
| 1827a | CLEAN: commit orphan files, close Sprint 1826, advance SPRINT_GOAL.md to Sprint 1827. | 2026-05-02 | — |
| 1826b | FIX: GSO HTML parser observability — Variant 1/2 regex + console.error on parse fail; AC-12a/b/c. 15 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1826b.md |
| 1826a | CLEAN: commit orphan files, close Sprint 1825, advance SPRINT_GOAL.md to Sprint 1826. | 2026-05-02 | — |
| 1825b | FIX: GSO HTML parser — parseGsoHtml regex extractor replaces JSON.parse(HTML); AC-11a/11b. 12 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1825b.md |
| 1825a | CLEAN: commit orphan files (agent-memory fixtures, briefing output, notebook, flows). Advance sprint to 1825. totalTasksDone=469. | 2026-05-02 | — |
| 1824f | CLEAN: commit orphan untracked files + delete stale remote branch task/1824a-deploy-market-hours-guard. tsc clean. | 2026-05-02 | — |
| 1824e | FIX: GSO macro — remove VPS_ENDPOINT skip guard, Source 3 fetch attempted natively with graceful fallback. 11 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1824e.md |
| 1823d | FIX: te-chromium crash-loop circuit breaker — 3-strike limit on "Target closed", WORK alert fires once at threshold, auto-recovery on success. 5 new AC tests. 8582 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1823d.md |
| 1822g | CLEAN: delete stale task/1822a-news-fetcher-fixes branch; commit orphan session/handoff/report files. | 2026-05-02 | — |
| 1821b | Wire smartCompactSpawner as MCP tool `smart_compact` (tool #118). tsc clean, 8565 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1821b.md |
| 1815d | FIX: docker-compose.yml mcp-server healthcheck — replace curl with bun fetch. 8647 pass / 19 fail (all pre-existing). | 2026-05-02 | reports/TASK_REPORT_1815d.md |
| 1815c | FIX: tradingEconomicsChromium.ts — retry-on-Target-closed Playwright crash. 8646 pass / 19 fail (all pre-existing). | 2026-05-02 | reports/TASK_REPORT_1815c.md |
| 1810a | FIX: BCTC income statement — sci-notation guard in vnNumberParser, GUARD_MAX 500T→2T, multi-field magnitude sentinel. 33 tests pass. | 2026-05-01 | reports/TASK_REPORT_1810a.md |
| 1777–1824 | Sprints 1777–1824 archived — see docs/TASKS_ARCHIVE.md | 2026-05-02 | — |

---
