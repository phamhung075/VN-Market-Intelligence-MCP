# Sprint Goal

## Current Sprint

status: PLANNING
sprint_id: 027
started: 2026-04-01
updated: 2026-04-01

---

### Theme

**"Stability First — Fix the Cracks Before Adding More Floors"**

---

### Goal

The platform is feature-rich at 46 tools and 1672 tests. Before extending it further, three
structural cracks must be sealed:

1. A flaky test in the Polymarket fetcher fires randomly in the full suite, eroding CI
   confidence. Every red run wastes developer investigation time and masks real failures.

2. Every worktree merge produces conflicts in `server.ts` and `tools/index.ts` because all
   27 tool registration calls are hardcoded in a flat list. One developer adds a line; a
   second developer adds a different line; Git cannot reconcile them. Dynamic auto-discovery
   eliminates the conflict surface permanently.

3. CLAUDE.md documents the architecture through Sprint 021. Sprints 022-026 added 14 new
   tools, 4 new domain services, and 3 new use cases. New agents and contributors
   onboarding after Sprint 021 have an incomplete map of the codebase.

The fourth task adds direct investor value: a rebalancing signal tool that tells the
investor when any position's weight has drifted more than a configurable threshold from
its target, and suggests the corrective trade size.

---

### Scope

**IN**

1. **Task 192 — Fix flaky test: `164-polymarket-fetcher.test.ts` mock timing (P0)**

   The test passes in isolation but fails randomly when the full suite runs concurrently.
   Root cause: the mock for `Bun.fetch` is set up globally and a racing test resets it
   between the timer fire and the assertion. Fix: scope the mock to the test file only,
   use `vi.isolateModules` or equivalent Bun test isolation, and add a deterministic timer
   mock that does not rely on wall-clock timing.

   Acceptance criteria:
   - `bun test src/__tests__/164-polymarket-fetcher.test.ts` passes 10/10 consecutive runs.
   - `bun test` full suite passes 3/3 consecutive runs with no flaky failures in task 164.
   - No other test files are modified except `src/__tests__/164-polymarket-fetcher.test.ts`
     and any shared test helper it extracts.
   - `bun tsc --noEmit` → 0 errors.
   - >= 1 new test or assertion added that pins the previously-flaky behaviour.

   Files:
   - MODIFY: `src/__tests__/164-polymarket-fetcher.test.ts`
   - MODIFY (optional): shared test helper if mock isolation is extracted

2. **Task 193 — Dynamic tool registration: eliminate server.ts merge conflicts (P0)**

   Replace the current flat list of `register*Tools(server, db)` calls in
   `src/interface/mcp/server.ts` with an auto-discovery pattern. Each tool module exports
   a `register` function with a consistent signature. `server.ts` iterates an array of
   modules and calls `register` on each. Adding a new tool requires editing only the new
   tool file and appending one line to the module array — not modifying the shared
   `server.ts` body.

   Design constraints (locked at PO level):
   - The module array lives in `src/interface/mcp/tools/registry.ts` (new file). This is
     the ONLY file that changes when a new tool module is added.
   - `server.ts` imports `toolRegistry` from `registry.ts` and calls
     `toolRegistry.forEach(r => r.register(server, db))`. No other change to `server.ts`.
   - Each existing tool module (`watchlist.ts`, `alerts.ts`, etc.) gains a named export:
     `export function register(server: McpServer, db: Database): void` that contains the
     existing registration logic.
   - `tools/index.ts` is NOT changed — it continues to re-export the register functions
     for consumers that import them directly (backward compatible).
   - Existing tool behaviour does not change — this is purely a structural refactor.
   - No new MCP tools are added in this task.

   Acceptance criteria:
   - `src/interface/mcp/tools/registry.ts` exists and exports `toolRegistry` as an array
     of objects with a `register(server, db)` method.
   - `src/interface/mcp/server.ts` no longer contains individual `register*Tools(...)` call
     sites — only the `toolRegistry.forEach(...)` loop.
   - All 46 existing tools remain registered and functional.
   - `bun test` full suite → 0 failures.
   - `bun tsc --noEmit` → 0 errors.
   - A new tool can be added by editing only its own file + appending one entry to
     `registry.ts`. Verified by adding a stub tool in the test.

   Files:
   - CREATE: `src/interface/mcp/tools/registry.ts`
   - MODIFY: `src/interface/mcp/server.ts` — replace call list with forEach loop
   - MODIFY: each tool module file — add `export function register(...)` named export
   - CREATE: `src/__tests__/193-tool-registry.test.ts`

3. **Task 194 — CLAUDE.md sync through Sprint 026 (P1)**

   CLAUDE.md currently documents through Sprint 021. Sprints 022-026 added:
   - 14 new MCP tools (tools 33-46: stock search, data freshness, portfolio position
     tracking, P&L, VaR, drawdown, alert accuracy, alert digest, sector rotation, earnings
     calendar, performance attribution, correlation matrix, export snapshot, rebalancing)
   - New domain services: `correlationCalculator.ts`, `performanceAttributor.ts`,
     `sectorRotationDetector.ts`
   - New use cases: `exportPortfolioSnapshot.ts`
   - New scheduler job: `alertDigestJob.ts` (from task 188)
   - Updated test count: 604 (Sprint 021) → 1672 (Sprint 026)
   - Updated tool count: 32 → 46

   Update sections:
   - Architecture summary: add all new files to the `src/` tree
   - Current implementation status: add Sprints 022-026 to the Done list
   - Scheduled Jobs: add `alertDigestJob` row to the Core cron jobs table
   - Key data flow: add correlation and performance attribution to the flow diagram
   - In Progress / Deferred: reflect current state accurately

   Acceptance criteria:
   - CLAUDE.md `src/` tree lists all files introduced in Sprints 022-026.
   - "Current implementation status" Done section includes Sprints 022-026 with accurate
     task lists.
   - Tool count stated in CLAUDE.md matches actual registered tool count (46).
   - Test count stated in CLAUDE.md is >= 1672.
   - `bun tsc --noEmit` → 0 errors (no code change, but verify no regression).
   - No task reports or sprint reports are modified — CLAUDE.md only.

   Files:
   - MODIFY: `CLAUDE.md`

4. **Task 195 — Portfolio rebalancing signals: `get_rebalancing_signals` MCP tool (P1)**

   New MCP tool `get_rebalancing_signals` that computes how far each position's current
   weight has drifted from its target weight and outputs the corrective trade needed to
   restore balance. Uses `positions` and `market_prices` tables only — no new schema.

   Rebalancing logic (rule-based, deterministic, no LLM):
   - Load all open positions (closed_at IS NULL) from `positions`.
   - For each position, compute current market value = `quantity * current_price` where
     `current_price` comes from `market_prices` (latest row for that stock code).
   - Compute total portfolio value = SUM of all open position market values.
   - Compute current weight for each position = market_value / total_portfolio_value.
   - Compare current weight to `target_weight` column in `positions` (REAL, 0-1). If the
     column does not exist or is NULL for a position, use equal weight (1 / n_positions).
   - Drift = current_weight - target_weight.
   - Flag positions where |drift| >= threshold (default: 0.05 = 5 percentage points).
     Threshold is an optional MCP tool parameter (0.01 – 0.20, default 0.05).
   - For each flagged position, compute corrective trade:
     - If drift > 0 (overweight): sell `(drift * total_value) / current_price` shares.
     - If drift < 0 (underweight): buy `(|drift| * total_value) / current_price` shares.
   - Round corrective trade quantities to integers (floor for sells, ceil for buys).

   Output (plain text, Vietnamese):
   ```
   TIN HIEU TAI CO CAU DANH MUC (2026-04-01)
   ──────────────────────────────────────────
   Tong gia tri danh muc: 125,000,000 VND
   Nguong chenh lech: 5%

   Co phieu   Ty trong hien tai   Muc tieu   Chenh lech   Hanh dong
   VCB        42%                 25%        +17%         BAN 210 co phieu
   FPT        18%                 25%        -7%          MUA 88 co phieu
   VNM        22%                 25%        -3%          (trong nguong)
   VEA        18%                 25%        -7%          MUA 142 co phieu
   ──────────────────────────────────────────
   Can tai co cau: 3/4 vi the vuot nguong 5%
   ```

   Graceful degradation:
   - No open positions: returns "Khong co vi the nao dang mo."
   - `market_prices` has no price for a stock: that position shows "(thieu du lieu gia)"
     and is excluded from total portfolio value calculation.
   - All positions within threshold: returns full table with "(trong nguong)" for all rows
     plus "Danh muc can bang — khong can hanh dong."
   - Single position: returns full output with diversification note
     "(chi co 1 vi the — nen xem xet da dang hoa)."

   Files:
   - CREATE: `src/domain/services/rebalancingCalculator.ts`
   - CREATE: `src/interface/mcp/tools/rebalancingTools.ts`
   - MODIFY: `src/interface/mcp/tools/registry.ts` — add rebalancing entry (first use of new
     dynamic registration from task 193; tasks 193 and 195 must land in this order)
   - CREATE: `src/__tests__/195-rebalancing-signals.test.ts`

   Acceptance criteria:
   - A position at 42% weight with 25% target produces drift = +17%, action = "BAN".
   - A position at 18% weight with 25% target produces drift = -7%, action = "MUA".
   - A position with |drift| < threshold produces "(trong nguong)".
   - Equal-weight fallback: 4 positions with no `target_weight` each get 25% target.
   - Stock with no `market_prices` row shown as "(thieu du lieu gia)".
   - No open positions → "Khong co vi the nao dang mo".
   - Corrective share quantities are integers (sell = floor, buy = ceil).
   - Threshold parameter 0.10 flags only drifts > 10%.
   - >= 16 tests, 0 failures.
   - `bun tsc --noEmit` → 0 errors.
   - Tool count increases from 46 to 47 (first tool registered via dynamic registry).

**OUT**

- E2E integration test of the full intelligence cycle (task 125 — blocked on test harness
  design; remains deferred)
- New external data sources
- LLM-based recommendations
- Watchlist auto-enrichment with sector peers (deferred to Sprint 028)
- Backtesting / simulation engine

---

### Success Metrics

1. `bun test` full suite passes 3/3 consecutive runs with zero flaky failures in any test
   file. Task 164 flakiness is eliminated permanently.

2. A new MCP tool (task 195 rebalancing) is added by editing only its own file +
   `registry.ts`. `server.ts` body is not touched. Merge conflicts on `server.ts` become
   structurally impossible when two tools are added in parallel worktrees.

3. CLAUDE.md accurately describes the system as of Sprint 026: 46 tools, 1672+ tests,
   all new files listed in the architecture tree. A new agent onboarding from CLAUDE.md
   alone can locate any file without confusion.

4. `get_rebalancing_signals()` with a 4-stock watchlist where one position is 17%
   overweight returns "BAN" for that position and the correct integer share quantity.
   The investor knows the exact corrective trade in one tool call.

5. `bun tsc --noEmit` → 0 errors. All 1672+ existing tests continue to pass.

6. Tool count: 46 → 47 (one new tool in task 195; task 193 is a refactor, no net new tools).

---

### Task board (Sprint 027)

| # | Title | Priority | Status | Depends on |
|---|-------|----------|--------|------------|
| 192 | Fix flaky test: `164-polymarket-fetcher.test.ts` mock timing | P0 | Backlog | — |
| 193 | Dynamic tool registration: eliminate server.ts merge conflicts | P0 | Backlog | — |
| 194 | CLAUDE.md sync through Sprint 026 | P1 | Backlog | — |
| 195 | Portfolio rebalancing signals: `get_rebalancing_signals` MCP tool | P1 | Backlog | 193 |

---

### Dependency chain

```
192 (fix flaky test)      — P0, independent, touches only __tests__/164-*.test.ts
193 (dynamic registry)    — P0, independent, refactor only, touches all tool files
194 (CLAUDE.md sync)      — P1, independent, documentation only
195 (rebalancing signals) — P1, depends on 193 (uses registry.ts as its registration path)

192 + 193 + 194 can run in parallel.
195 must wait for 193 (registry.ts must exist before task 195 appends to it).
```

---

### Key technical decisions (locked at PO level)

- **Task 192 uses mock isolation, not wall-clock timers**: the flakiness is a test
  isolation problem, not a product bug. The fix must not alter production code. Bun's
  `mock.module` or `vi.isolateModules` scopes the mock to the test file so parallel
  tests cannot interfere.

- **Task 193 places the registry in `tools/registry.ts`, not `server.ts`**: this keeps
  `server.ts` as a pure wiring file (one loop) and makes the registry the single point
  of change for tool additions. The existing `tools/index.ts` re-export pattern is
  preserved for backward compatibility.

- **Task 193 does NOT change tool behaviour**: this is a structural refactor. No tool
  logic changes. All 46 tools must pass their existing tests unchanged after the refactor.

- **Task 194 is documentation-only**: no TypeScript files are modified. The CLAUDE.md
  update is a PO-level deliverable because it affects all agents' understanding of the
  system. It is not delegated to BA or Developer.

- **Task 195 `target_weight` column**: the column was introduced for Sprint 023 position
  tracking. If absent (older DB), equal weighting is the safe default. No ALTER TABLE at
  tool call time. The tool degrades gracefully.

- **Task 195 registers via the new dynamic registry** (task 193 prerequisite): this is
  the first real-world validation that the dynamic registry works end-to-end for a new
  tool. It proves the pattern before the team relies on it for future sprints.

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
