# VN Market Intelligence MCP — System Upgrade Plan

> Created: 2026-05-03 | Owner: PO | Updated by: PO each sprint close
> Status values: PENDING | IN_PROGRESS | DONE | DEFERRED | BLOCKED

---

## Summary Table

| ID  | Title                                   | Tier | Size    | Status     | Sprint |
|-----|-----------------------------------------|------|---------|------------|--------|
| U-1 | Bun Runtime Upgrade                     | 1    | SPRINT-S | DONE        | 1836  |
| U-2 | Fix 3 Pre-Existing Failing Tests        | 1    | SPRINT-S | DONE        | 1836  |
| U-3 | GitHub Actions CI Pipeline              | 1    | SPRINT-M | DONE        | 1836  |
| U-4 | getDb() Repository Pattern Refactor     | 1    | SPRINT-L | DONE        | 1838b (Phase 1), 1839a (Phase 2) |
| U-5 | Prediction Calibration Feedback Loop    | 2    | SPRINT-M | PENDING    | TBD   |
| U-6 | RAG Service Utilization Audit + Wiring  | 2    | SPRINT-M | PENDING    | TBD   |
| U-7 | Agent Notebook Population Protocol      | 2    | SPRINT-S | IN_PROGRESS | 1839b |
| U-8 | Portfolio Backtesting Engine            | 3    | SPRINT-L | PENDING    | TBD   |
| U-9 | Read-Only Health Dashboard              | 3    | SPRINT-M | PENDING    | TBD   |
| U-10| Quarterly BCTC Batch Sweep             | 3    | SPRINT-M | PENDING    | TBD   |

---

## Tier 1 — Reliability (Highest ROI, Do First)

### U-1: Bun Runtime Upgrade

| Field       | Value |
|-------------|-------|
| Status      | DONE |
| Sprint      | 1836 |
| Size        | SPRINT-S |
| Dependency  | None |

**Problem**
Bun v1.3.11 has a known C++ crash on large test suites (macOS x64). It truncates pass/fail counts and corrupts QA automation. QA works around it manually — this is unreliable and creates false confidence in test results.

**Fix**
Upgrade Bun to latest stable in all Dockerfiles and local version config files. Re-validate the 8764-test baseline after upgrade.

**Files affected**
- `apps/*/Dockerfile`
- `package.json` (engines field)
- `.tool-versions` or `.bunfv` if present

**Acceptance Criteria**
- `bun test` completes without crash
- Correct pass/fail count reported (no truncation)
- 8764+ tests pass after upgrade

---

### U-2: Fix 3 Pre-Existing Failing Tests

| Field       | Value |
|-------------|-------|
| Status      | DONE |
| Sprint      | 1836 |
| Size        | SPRINT-S |
| Dependency  | None (can run in parallel with U-1) |

**Problem**
3 tests have been failing for many sprints. They appear in every QA report as pre-existing failures and create ambiguity: future regressions can hide behind them. The stat `testBaselineFail` is currently 0 in project-stats.json — but the actual test run reports 3 failures. This discrepancy is a data integrity issue.

**Fix**
Run `bun test --reporter=verbose 2>&1 | grep FAIL` to identify the 3 tests. For each: fix the test if the underlying code is correct, or delete the test with a documented reason (comment + commit message). Update `testBaselineFail=0` in project-stats.json to reflect truth.

**Acceptance Criteria**
- Zero failing tests after fix
- `testBaselineFail=0` in project-stats.json reflects actual zero failures
- All 3 tests are either fixed (code corrected) or deleted (reason documented in commit)

---

### U-3: GitHub Actions CI Pipeline

| Field       | Value |
|-------------|-------|
| Status      | DONE |
| Sprint      | 1836 |
| Size        | SPRINT-M |
| Dependency  | U-1 (Bun must be stable before CI is trustworthy) |

**Problem**
No automated test run on push or pull request. Regression safety exists only in QA's local worktree. A single unreviewed merge can silently break production. The test suite (8764 tests) provides strong coverage but only if it runs automatically.

**Fix**
Create `.github/workflows/ci.yml`. On push and PR to `main`: checkout code, install correct Bun version, run `bun test`, report pass/fail count as CI status.

**Acceptance Criteria**
- Green CI badge visible on main branch
- PRs that introduce test regressions fail CI and are blocked from merge
- Workflow runs on every push to main and every PR targeting main

---

### U-4: getDb() Repository Pattern Refactor

| Field       | Value |
|-------------|-------|
| Status      | DONE |
| Sprint      | 1838b (Phase 1), 1839a (Phase 2) |
| Size        | SPRINT-L |
| Dependency  | Architect design complete (1838a). Phase 1 merged 2026-05-03. Phase 2 merged 2026-05-03. |

**Problem**
`getDb()` has 224 dependency edges — the most connected node in the codebase (per graph report). Domain code reaches directly into SQLite infrastructure, violating DDD rule: `domain/` must have zero imports from `infrastructure/`. This creates tight coupling, makes unit testing difficult, and risks cascading failures on schema changes.

**Fix**
Introduce repository interfaces in `domain/repositories/`. Implement SQLite adapters in `infrastructure/db/repositories/`. Migrate the top 5 highest-coupled files first (identified by graph tool). Full migration follows in subsequent sprints.

**Acceptance Criteria**
- `grep -r "getDb()" src/domain/` returns 0 results
- All existing tests still pass after refactor
- Architect design document approved before implementation starts

**Deferral Reason**
SPRINT-L scope requires Architect design session before implementation. Cannot be batched with U-1/U-2/U-3 without risking scope creep and destabilizing the active sprint.

---

## Tier 2 — Intelligence Quality

### U-5: Prediction Calibration Feedback Loop

| Field       | Value |
|-------------|-------|
| Status      | PENDING |
| Sprint      | TBD |
| Size        | SPRINT-M |
| Dependency  | None |

**Problem**
`create_prediction_claim`, `record_signal_outcome`, and `get_calibration_report` exist as MCP tools but no systematic weekly cycle closes the loop back into agent confidence thresholds. Predictions are recorded but never actioned.

**Fix**
Add a weekly calibration step to the `digest-predict` flow. Step reads the accuracy report, compares against target, and adjusts `kinhDichConfidence` alert threshold in `mcp.config.json` if accuracy drifts more than 10% from target. Log all adjustments to WORK channel.

**Acceptance Criteria**
- After 1 week, `get_calibration_report()` shows outcomes recorded
- At least one threshold adjustment logged if accuracy drift exceeds 10%
- Adjustment audit trail visible in WORK channel

---

### U-6: RAG Service Utilization Audit + Wiring

| Field       | Value |
|-------------|-------|
| Status      | PENDING |
| Sprint      | TBD |
| Size        | SPRINT-M |
| Dependency  | None |

**Problem**
`rag-service` (port 5002, LanceDB 384-dim vectors) is deployed and operational, but agent usage of `search_similar_context` is unverified. It may be dead code at runtime — deployed but never called.

**Fix**
Audit which agents currently call `search_similar_context`. Wire it into News Scout (historical pattern matching on similar news events) and Financial Analyst (similar BCTC quarterly patterns). Confirm non-empty results at runtime.

**Acceptance Criteria**
- News Scout session logs show `search_similar_context` calls with non-empty results
- Financial Analyst session logs show `search_similar_context` calls with non-empty results
- RAG service call volume visible in tool-usage-stats.json

---

### U-7: Agent Notebook Population Protocol

| Field       | Value |
|-------------|-------|
| Status      | IN_PROGRESS |
| Sprint      | 1839b |
| Size        | SPRINT-S |
| Dependency  | None |

**Problem**
Sprint 1827c scaffolded 19 agent notebooks in `docs/agent-memory/notebooks/`. All remain empty. Notebooks are designed as "working memory between sessions" but contain no content — the feature is deployed but non-functional.

**Fix**
Update each agent's flow file to write notebook on cycle end (observations, calibration notes, patterns detected). Add "read notebook at cycle start" as Step 0b in each agent flow. No new infrastructure needed — pure flow update.

**Acceptance Criteria**
- After 3 dev cycles, at least 5 agent notebooks contain real content (not just scaffold headers)
- Each updated agent flow file includes Step 0b (read notebook) and end-of-cycle write step

---

## Tier 3 — New Capabilities (After Tier 1 + Tier 2 Stable)

### U-8: Portfolio Backtesting Engine

| Field       | Value |
|-------------|-------|
| Status      | PENDING |
| Sprint      | TBD |
| Size        | SPRINT-L |
| Dependency  | Architect design required |

**Problem / Opportunity**
All ingredients exist: Kinh Dich confidence scores, signal outcomes, TA indicators, and full price history. No tool exists to replay historical signals against actual prices to validate strategy performance.

**Fix**
New MCP tool: `run_backtest(strategy, start_date, end_date)`. Replays historical signals against actual prices. Returns win rate, average return, max drawdown per strategy.

**Acceptance Criteria**
- `run_backtest("kinh-dich-high-confidence", "2025-01-01", "2025-12-31")` returns a structured report
- Architect design document approved before implementation
- New domain service with zero direct getDb() calls (follow U-4 pattern)

---

### U-9: Read-Only Health Dashboard

| Field       | Value |
|-------------|-------|
| Status      | PENDING |
| Sprint      | TBD |
| Size        | SPRINT-M |
| Dependency  | None |

**Problem / Opportunity**
System observability requires reading Telegram or querying MCP tools. A simple HTML page served by api-gateway would give instant visual status: 9 service health states, last 10 signals, prediction accuracy, active alerts.

**Fix**
Single HTML endpoint served by api-gateway at `/health-dashboard`. Auto-refreshes every 60 seconds. Reads from existing health-check endpoints and MCP tool outputs.

**Acceptance Criteria**
- Dashboard accessible at `http://localhost:<api-gateway-port>/health-dashboard`
- Shows: all 9 service statuses, last 10 signals, current prediction accuracy, active alert count
- Read-only — no mutation actions on the page

---

### U-10: Quarterly BCTC Batch Sweep

| Field       | Value |
|-------------|-------|
| Status      | PENDING |
| Sprint      | TBD |
| Size        | SPRINT-M |
| Dependency  | BCTC pipeline operational (VPS health check required) |

**Problem / Opportunity**
BCTC quarterly comparison is currently manual per-ticker. Earnings season generates 30+ reports simultaneously. A batch sweep triggered by the earnings calendar would make the process systematic and fully automated.

**Fix**
Earnings calendar trigger detects new quarterly filings. Auto-runs full 30-ticker BCTC comparison sweep. Results pushed to MARKET channel as earnings digest.

**Acceptance Criteria**
- On earnings season trigger, all 30 watchlist tickers processed without manual intervention
- MARKET channel receives earnings digest within 2 hours of trigger
- Individual ticker failures are logged to BUG channel and do not abort the batch

---

## Out-of-Plan Fixes

### Fix 1837a: Pipeline-state Persistence

| Field       | Value |
|-------------|-------|
| Status      | DONE |
| Sprint      | 1837 |
| Size        | SPRINT-S |

**Problem**
After `/compact`, the main terminal loses all pipeline state. Agent RETURN blocks live only in conversation context. Compaction replaces messages with a summary — RETURN blocks disappear. Main terminal re-evaluates CLAUDE.md prerequisites, hits the `TASKS.md empty` gate, and asks the user for confirmation instead of resuming the active sprint.

**Fix**
- `docs/pipeline-state.json` created: durable pipeline state store written by every agent at RETURN.
- `CLAUDE.md` precondition block rewritten: Step 1 reads pipeline-state.json before TASKS.md gate. Stale >24h fallback present.
- `agent-chaining-protocol.md` Rule 6 added: mandatory pipeline-state write at every RETURN. PIPELINE_STATE_WRITE added to Agent Return Template.

---

## Appendix — Prioritization Rationale

Tier 1 addresses the test infrastructure before adding features. A CI system with a crashing test runner is not CI. Order within Tier 1:

1. U-1 (Bun upgrade) — unblocks everything else; crashes corrupt all automation
2. U-2 (fix failing tests) — zero ambiguity baseline before CI goes live
3. U-3 (CI pipeline) — locks in regression protection permanently

U-4 deferred: SPRINT-L scope + Architect dependency makes it wrong for a first batch. It is the most impactful architectural item and deserves its own focused sprint.

Tier 2 requires Tier 1 to be stable. Calibration loops and RAG wiring on a flaky test runner create noise. Tier 3 requires Tier 2 signal quality to be validated before building backtesting on top of it.
