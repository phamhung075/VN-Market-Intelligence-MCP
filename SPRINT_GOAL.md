# Sprint Goal

## Current Sprint

status: COMPLETE
sprint_id: 030
started: 2026-04-01
updated: 2026-04-02
completed: 2026-04-02

---

### Theme

**"Quality Before Quantity — Documentation, Disk, and Test Reliability"**

---

### Goal

Sprint 030 is a consolidation sprint. The system has grown from 0 to 53 MCP tools and 1771
tests across 29 sprints. The architecture documentation (CLAUDE.md) is 7 sprints behind
reality. 32 stale worktrees consume disk space and pollute the worktree list. Test isolation
inconsistencies risk flaky failures under parallel Bun test execution. This sprint makes the
project trustworthy to its own agents before adding any new features.

---

### Scope

**IN**

1. **Task 211 — CLAUDE.md sync through Sprint 029 (P0)**

   CLAUDE.md is the single source of truth for every agent in the MAS chain. It is currently
   accurate through Sprint 026. Sprints 027-029 added the following files that are not yet
   documented:

   New domain services (not in CLAUDE.md):
   - `src/domain/services/portfolioPnlCalculator.ts` — P&L calculation per position
   - `src/domain/services/portfolioRiskCalculator.ts` — portfolio risk metrics
   - `src/domain/services/predictionCascadeMapper.ts` — Polymarket event → cascade domain
   - `src/domain/services/predictionSignalDetector.ts` — Polymarket signal detection
   - `src/domain/services/priceAlertChecker.ts` — price alert threshold checker
   - `src/domain/services/rateLimiter.ts` — per-source API rate limiter (token bucket)
   - `src/domain/services/rebalancingCalculator.ts` — portfolio rebalancing signals
   - `src/domain/services/sectorRotationDetector.ts` — sector rotation signal detection
   - `src/domain/services/sparkline.ts` — price sparkline generator
   - `src/domain/services/stockAliases.ts` — Vietnamese company name → stock code aliases
   - `src/domain/services/stockSearch.ts` — stock search by name or code
   - `src/domain/services/sourceHealthTracker.ts` — news source health (ok/degraded/down)

   New infrastructure files (not in CLAUDE.md):
   - `src/infrastructure/db/checkpoint.ts` — WAL checkpoint helper for SQLite
   - `src/infrastructure/db/pnlSnapshotStore.ts` — portfolio P&L snapshot store
   - `src/infrastructure/db/positionStore.ts` — portfolio position CRUD
   - `src/infrastructure/db/predictionStore.ts` — Polymarket prediction data store
   - `src/infrastructure/fetchers/pdfOcrWorker.ts` — OCR fallback for scanned PDF BCTCs
   - `src/infrastructure/fetchers/polymarket.ts` — Polymarket API fetcher
   - `src/infrastructure/fetchers/sbv.ts` — State Bank of Vietnam rates fetcher
   - `src/infrastructure/fetchers/tradingEconomics.ts` — Trading Economics indicators fetcher
   - `src/infrastructure/fetchers/yahooFinance.ts` — Yahoo Finance commodity price fetcher
   - `src/infrastructure/notifiers/telegramCommands.ts` — Telegram command handler (long-poll)

   New application use cases (not in CLAUDE.md):
   - `src/application/usecases/assembleAlertDigest.ts` — daily/weekly alert digest assembly
   - `src/application/usecases/exportPortfolioSnapshot.ts` — portfolio snapshot export
   - `src/application/usecases/runPredictionImpactChain.ts` — Polymarket → cascade chain
   - `src/application/usecases/getPortfolioPnl.ts` — portfolio P&L calculator (Sprint 029)

   New MCP tool files (not in CLAUDE.md):
   - `src/interface/mcp/tools/alertAccuracy.ts` — alert accuracy scoring tool
   - `src/interface/mcp/tools/alertCheckTools.ts` — alert threshold check tools
   - `src/interface/mcp/tools/alertDigestTools.ts` — alert digest MCP tools
   - `src/interface/mcp/tools/correlationTools.ts` — stock correlation tools
   - `src/interface/mcp/tools/dataFreshnessTools.ts` — data freshness check tools
   - `src/interface/mcp/tools/earningsCalendarTools.ts` — earnings calendar tools
   - `src/interface/mcp/tools/exportTools.ts` — portfolio export tools
   - `src/interface/mcp/tools/performanceTools.ts` — portfolio performance tools
   - `src/interface/mcp/tools/portfolioRiskTool.ts` — portfolio risk MCP tool
   - `src/interface/mcp/tools/positionTools.ts` — position tracking tools
   - `src/interface/mcp/tools/predictionTools.ts` — Polymarket prediction tools
   - `src/interface/mcp/tools/priceAlertTools.ts` — price alert management tools
   - `src/interface/mcp/tools/priceHistoryTools.ts` — price history query tools
   - `src/interface/mcp/tools/rateLimitTools.ts` — rate limiter status tool
   - `src/interface/mcp/tools/rebalancingTools.ts` — portfolio rebalancing tools
   - `src/interface/mcp/tools/searchTools.ts` — stock search tool
   - `src/interface/mcp/tools/sectorRotationTools.ts` — sector rotation tools
   - `src/interface/mcp/tools/sourceHealthTools.ts` — source health tools
   - `src/interface/mcp/tools/registry.ts` — central tool registry (task 193)

   New scheduler jobs (not in CLAUDE.md):
   - `src/scheduler/alertDigestJob.ts` — daily/weekly alert digest cron
   - `src/scheduler/dataAuditJob.ts` — nightly data integrity audit cron
   - `src/scheduler/predictionMarketJob.ts` — Polymarket polling cron

   Tool count update: CLAUDE.md says 20 tools (Sprint 012). Current count: 53 tools.

   Current implementation status section must be updated:
   - Mark Sprints 013-029 as complete with correct task lists
   - Remove stale "In Progress" entries (circuit breaker is done as Sprint 015)
   - Update Scheduled Jobs table to include alertDigestJob, dataAuditJob, predictionMarketJob
   - Update Data sources table to include Yahoo Finance, SBV, Trading Economics indicators,
     Polymarket
   - Update tool count references from 20 → 53

   Acceptance criteria:
   - Every file that exists in `src/` is mentioned in CLAUDE.md (domain/infra/app/interface).
   - Sprints 013-029 all appear in the Completed Sprints table.
   - Tool count says 53.
   - `bun tsc --noEmit` → 0 errors (CLAUDE.md change is doc-only, no code impact).
   - No new MCP tools. No new tests. Pure documentation update.

   Files:
   - MODIFY: `CLAUDE.md` — comprehensive sync through Sprint 029

2. **Task 212 — Stale worktree cleanup (P1)**

   The `.claude/worktrees/` directory contains 34 entries: 32 stale agent-named directories
   (e.g. `agent-a0511eb6`, `agent-aed24f9a`) plus 2 active ones (`heuristic-payne`,
   `infallible-blackburn`). The stale entries are not registered as git worktrees — they are
   leftover directories from agent sub-processes. They pollute `ls` output and consume disk.

   Approach:
   - Check each `agent-*` directory: if it is NOT a registered git worktree
     (`git worktree list` does not show its path), delete it.
   - Keep `heuristic-payne` and `infallible-blackburn` only if they appear in
     `git worktree list`; otherwise delete them too.
   - The main worktree (project root) and `task/doc-001-claude-md-update` branch worktree
     (if registered) must NOT be touched.
   - After cleanup: `ls .claude/worktrees/` should return 0-2 entries (only active worktrees).

   Acceptance criteria:
   - All 32 `agent-*` directories removed from `.claude/worktrees/`.
   - `git worktree list` shows only the main worktree (and any legitimately registered ones).
   - No test files, source files, or git history are touched.
   - `bun test` full suite → 0 failures after cleanup (worktrees do not affect test suite).

   Files:
   - DELETE: `.claude/worktrees/agent-*` (32 directories)
   - DELETE (if unregistered): `.claude/worktrees/heuristic-payne`,
     `.claude/worktrees/infallible-blackburn`, `.claude/worktrees/jovial-cori`,
     `.claude/worktrees/zealous-poitras`

3. **Task 213 — Test isolation audit: standardise :memory: DB pattern (P1)**

   The polymarket flaky test was fixed in task 192 by creating a fresh `:memory:` DB per
   test. However the fix introduced a bespoke pattern. The broader test suite may have other
   files that share module-level DB singletons and fail intermittently under parallel Bun
   test execution.

   Audit scope:
   - Read all `src/__tests__/*.test.ts` files that import from `src/infrastructure/db/`.
   - For each test file: confirm it creates a fresh `Database(':memory:')` in a `beforeEach`
     or per-test helper rather than importing the shared module-level DB singleton.
   - Identify any test that uses the shared singleton (`import { db } from
     '../../infrastructure/db'` or similar) without resetting state.

   Fix approach:
   - For each identified non-isolated test: extract a `createTestDb()` helper that returns a
     fresh `:memory:` DB with `initSchema(db)` applied, and inject it into the unit under test.
   - Pattern to enforce:
     ```typescript
     // In each test file that needs DB
     import Database from 'better-sqlite3';
     import { initSchema } from '../../infrastructure/db/schema';
     function makeDb() { const db = new Database(':memory:'); initSchema(db); return db; }
     ```
   - Do NOT change production code DB singletons. Only test files change.
   - If a test file already has the correct pattern, note it as "already isolated" and skip.

   Acceptance criteria:
   - Zero test files import the shared `db` singleton without resetting state.
   - `bun test` run 3 times consecutively → 0 failures each run (stability proof).
   - No production code changes. Only `src/__tests__/*.test.ts` modifications.
   - `bun tsc --noEmit` → 0 errors.
   - Test count stable (no tests added or removed — isolation refactor only).

   Files:
   - MODIFY: any `src/__tests__/*.test.ts` that uses shared DB singleton without reset

**OUT**

- Telegram command interface (already done in Sprint 029 — task 208)
- New MCP tools of any kind (feature freeze for this sprint)
- Polymarket API changes (external service — monitor only)
- LLM-based analysis (permanently out of scope)
- pdfOcrWorker production wiring (deferred — scanned BCTCs are edge case)
- Watchlist expansion with HVN, HPG as FX-sensitive stocks (deferred — PO decision pending)

---

### Success Metrics

1. Every file currently in `src/` is documented in CLAUDE.md. A new agent starting Sprint 031
   can read CLAUDE.md and understand the full system without inspecting the file tree.
   Sprints 013-029 appear in the completed sprints table. Tool count reads 53. (Task 211)

2. `ls .claude/worktrees/` returns 0-2 entries. `git worktree list` is clean. Disk usage
   from `.claude/worktrees/` drops from 34 directories to at most 2. (Task 212)

3. `bun test` run 3 times consecutively produces 0 failures each run. No test file imports the
   shared DB singleton without state reset. The pattern is uniform across all test files that
   touch SQLite. (Task 213)

4. `bun tsc --noEmit` → 0 errors. `bun test` full suite → 0 failures. All 1771 existing tests
   continue to pass after refactor.

5. Tool count: 53 (unchanged — no new tools this sprint).

---

### Task board (Sprint 030)

| # | Title | Priority | Status | Depends on |
|---|-------|----------|--------|------------|
| 211 | CLAUDE.md sync through Sprint 029 | P0 | Backlog | — (doc-only) |
| 212 | Stale worktree cleanup (.claude/worktrees/) | P1 | Backlog | — (independent) |
| 213 | Test isolation audit: standardise :memory: DB pattern | P1 | Backlog | — (independent) |

---

### Dependency chain

```
211 (CLAUDE.md sync)     — P0, no code deps, can start immediately
212 (worktree cleanup)   — P1, independent, mechanical deletion
213 (test isolation)     — P1, independent, test-only changes

All three tasks are independent and can run in parallel.
```

---

### Key technical decisions (locked at PO level)

- **Task 211 is documentation-only**: no source code changes. If a discrepancy is found
  between CLAUDE.md and the actual code, CLAUDE.md is updated to match the code — not the
  other way around. Code is the source of truth.

- **Task 212 deletes only directories not registered in `git worktree list`**: the check
  against `git worktree list` is mandatory before any deletion. This prevents accidentally
  removing an active development worktree.

- **Task 213 touches only test files**: production singletons (e.g. the module-level `db`
  export in `src/infrastructure/db/index.ts`) are NOT changed. The fix is test-side injection
  only. This avoids introducing test-specific branches in production code.

- **Task 213 does not add new tests**: it refactors existing tests for isolation. Test count
  stays at 1771. If a refactor inadvertently removes coverage, it must be restored before QA
  sign-off.

- **Sprint 030 is a feature-freeze sprint**: no new MCP tools, no new domain services, no new
  use cases. The only allowed changes are documentation updates (211), directory deletions
  (212), and test file refactoring (213).

---

## Completed Sprints

| Sprint | Theme | Completed | Tasks |
|--------|-------|-----------|-------|
| 000 | Foundation | 2026-03-24 | 000 |
| 001 | BCTC Pipeline Wave 1 | 2026-03-25 | 001, 002, 003, 011, 012, 041, 042, 014 |
| 002 | BCTC Pipeline Wave 2 | 2026-03-26 | 043, 044, 013, 045, 046, 047, 029, 030, 048, 085 |
| 003 | News + Alerts | 2026-03-27 | 021, 082, 063, 064, 086 |
| 004 | MCP Wiring + Analysis | 2026-03-27 | 087, 022, 023, 061, 062, 083 |
| 005 | Market Data + Scheduler | 2026-03-28 | 088, 026, 102, 104, 103, 101 |
| 006 | Analytical Depth | 2026-03-28 | 065, 066, 027, 084, 105, 123 |
| 007 | Doc + Tests | 2026-03-28 | DOC-001, 081, 122, 124, 125 |
| 008 | Macro Intelligence | 2026-03-29 | FIX-081, 025, 028, 126, 089 |
| 009 | SSC Automation + Telegram | 2026-03-29 | 031, 034, 106 |
| 010 | Security + Alert Quality | 2026-04-01 | SQL-fix, 131, 132 |
| 011 | Adaptive Signals + Sentiment | 2026-04-01 | 133, 134, 135, 137 |
| 012 | Periodic Summaries | 2026-04-01 | 130 |
| 013 | Fetcher Reliability + Sector Context | 2026-04-01 | 035, 024, 035-TE, sectorPeers, macroThresholds, priceNewsValidator, commodityTracker |
| 014 | Trade Relationships | 2026-04-01 | tradeRelationships, tradeStore |
| 015 | Circuit Breaker | 2026-04-01 | 136 |
| 016 | Conviction Scorer + Portfolio Tools | 2026-04-01 | convictionScorer, portfolioTools, feedbackTools |
| 017 | Production Hardening | 2026-04-01 | 152, 153, 154, 155, 156 |
| 018 | Data Integrity First | 2026-04-01 | 157, 158, 159 |
| 019 | Stock Aliases + Market Broadcast | 2026-04-01 | 160, 161, 162 |
| 020 | Prediction Market Intelligence | 2026-04-01 | 163, 164, 165, 166 (stub), 167, 168, 169 |
| 021 | Close the Loop — Prediction Signals Live | 2026-04-01 | 170, 171, 172, 173 |
| 022 | House in Order | 2026-04-01 | 174, 175, 176, 177 |
| 023 | Close the Investor Loop | 2026-04-01 | 178, 179, 180, 181 |
| 024 | Reliability Hardening and Investor UX Polish | 2026-04-01 | 182, 183, 184, 185 |
| 025 | Daily Investor Intelligence | 2026-04-01 | 186, 187, 188 |
| 026 | Signal Quality and Portfolio Correlation | 2026-04-02 | 189, 190, 191 |
| 027 | Stability First | 2026-04-02 | 194 (CLAUDE.md sync), 195 (rebalancing, in Review), hotfixes 198-205 |
| 028 | Structural Integrity and Investor Safety Net | 2026-04-02 | 192, 193, 206, 207 |
| 029 | Always-On Investor | 2026-04-02 | 208 (Telegram commands), 209 (P&L snapshot), 210 (source health) |
