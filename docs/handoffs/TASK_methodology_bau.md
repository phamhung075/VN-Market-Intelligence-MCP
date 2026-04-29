# Handoff — Báu Methodology Implementation
# PO Product Vision + Sprint Definition

**Created:** 2026-04-29
**PO decision:** APPROVED with phased scope
**Next agent:** architect
**Sprint:** 1423 (Phase 1 — Macro Intelligence Upgrade)

---

## PO Decision: APPROVED

The Trần Ngọc Báu framework is approved for implementation. The top-down cascade
(Global → VN Macro → Banking Liquidity → Asset Valuation → Action Timing) is the
correct analytical model for this system. Without it, the system produces stock-level
signals without a regime context, which is dangerous — a correct technical signal in
the wrong macro regime produces losses.

---

## Brownfield Inventory (what already exists — do NOT rebuild)

Confirmed by code review before writing this handoff:

| Component | Status | Location |
|-----------|--------|----------|
| DXY (DX-Y.NYB) | FETCHED, STORED — but NOT displayed in macro snapshot output | `yahooFinance.ts` SYMBOLS + `schema-macro.ts` commodity_prices.dxy |
| VIX | FETCHED, STORED | same |
| S&P 500 | FETCHED, STORED | same |
| Gold, Brent, USD/VND | FETCHED, STORED, DISPLAYED | same |
| SBV refi rate | FETCHED, STORED, DISPLAYED | `sbv.ts` + sbv_rates table |
| SBV overnight rate | FETCHED, STORED, DISPLAYED | same |
| macro_indicators table | EXISTS — CPI, GDP, PMI columns all present | schema-macro.ts |
| imf_indicators table | EXISTS | schema-macro.ts |
| US 10Y Yield (^TNX) | NOT fetched | gap — no SYMBOLS entry |
| Fed Funds Rate | NOT fetched | gap — no FRED fetcher |
| Carry Trade Signal | NOT computed | gap — no domain service |
| Policy Regime State | NOT tracked | gap — no state machine |
| OMO Tracker | NOT implemented | gap — VPS scrape needed |
| Market Earning Yield | NOT computed | gap — requires VN-Index P/E |
| G-Bond Yield Curve | NOT implemented | gap — HNX scrape needed |
| GSO CPI/GDP parsed | NOT stored structurally | macro_indicators exists but is not populated from GSO |

---

## Product Vision

**North Star:** Every agent recommendation in this system must be answerable against
the 5-question Báu checklist. Currently 0 of 5 questions can be answered from
structured data. After this implementation, all 5 can be answered automatically.

**The 5 Questions (acceptance criteria for the full implementation):**

```
1. THIEN THOI: Fed position? DXY trend? US 10Y level?
   → Global liquidity: EXPANSIVE / NEUTRAL / TIGHTENING

2. DIA LOI: VN CPI vs target? OMO net? Carry spread?
   → VN regime: GROWTH PRIORITY / FX STABILITY PRIORITY

3. THANH KHOAN: Interbank rate? Bank NOP? Excess reserves?
   → Banking liquidity: AMPLE / NEUTRAL / TIGHT

4. DINH GIA: VN Earning Yield vs deposit rate? G-Bond yield?
   → Equity: CHEAP / FAIRLY VALUED / EXPENSIVE

5. NHAN HOA: Policy catalyst in next 1-2 months?
   → Action: ENTER / HOLD / REDUCE / AVOID
```

**Phase 1 (Sprint 1423) closes Questions 1 and partial Question 2.**
**Phase 2 closes Question 4.**
**Phase 3 closes Questions 2 (OMO), 3, and 5.**

---

## Phase 1 — Sprint 1423 (APPROVED TO START)

**Goal:** Wire the global inputs layer. Cost = zero new infrastructure. All data
is accessible without VPS (Yahoo Finance + FRED API, no geo-block).

### Task 1423a — Add US 10Y Yield to Yahoo Finance fetcher

**Scope:** Add `^TNX` to `SYMBOLS` constant in `yahooFinance.ts`. Add `us10yYield`
field to `CommoditySnapshot` interface. Persist to `commodity_prices` +
`commodity_prices_history` tables (add column `us10y_yield REAL DEFAULT 0`).
Schema migration: idempotent ALTER TABLE for existing production DB.

**Test:** unit test verifying the new field is populated when `^TNX` resolves,
zero-safe when it fails. No new cron job needed — existing commodity refresh job
already runs on schedule.

**Acceptance:** `commodity_prices.us10y_yield` populated on next commodity refresh.

---

### Task 1423b — FRED API fetcher for Fed Funds Rate

**Scope:** New fetcher `apps/mcp-server/src/infrastructure/fetchers/fred.ts`.
Endpoint: `https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&api_key=...&file_type=json&limit=1&sort_order=desc`
FRED offers a free tier with no API key required for public series (confirm at
implementation time — if key required, use env var `FRED_API_KEY` defaulting to
the anonymous public endpoint `https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS`).
Store result in `tracked_indicators` table (indicator=`fed_funds_rate`, source=`fred`,
unit=`%`). Hourly dedup via existing hour_bucket trigger.

**Test:** unit test with mocked HTTP, verifies indicator row written to
tracked_indicators.

**Acceptance:** `tracked_indicators` has a `fed_funds_rate` row with source=`fred`
after fetcher runs.

---

### Task 1423c — Carry Trade Signal domain service

**Scope:** New domain service `apps/mcp-server/src/domain/services/macro/carryTradeSignal.ts`.

```
Carry Spread = SBV max_deposit_rate_pct - fed_funds_rate
```

Input: reads `sbv_rates.max_deposit_rate_pct` (latest) + `tracked_indicators`
where indicator=`fed_funds_rate`.

Output interface:
```typescript
interface CarryTradeSignal {
  vndDepositRate: number;      // SBV max_deposit_rate_pct
  fedFundsRate: number;        // from FRED
  carrySpread: number;         // difference in pct points
  regime: "HOT_MONEY_INFLOW" | "NEUTRAL" | "FII_OUTFLOW_RISK";
  // HOT_MONEY_INFLOW: spread > 2.5%
  // NEUTRAL: 0.5% <= spread <= 2.5%
  // FII_OUTFLOW_RISK: spread < 0.5%
  reasoning: string;           // human-readable one-liner
  computedAt: string;          // ISO timestamp
}
```

No DB table needed — computed on demand (stateless signal). Cached in
`tracked_indicators` as `carry_spread_pct` for history.

**Test:** unit tests for all 3 regime branches.

---

### Task 1423d — Surface DXY + US10Y + Carry in get_macro_snapshot output

**Scope:** `macroTools.ts` `formatMacroSnapshot` currently fetches DXY but does
NOT display it. Add a new output section:

```
[Global Macro Inputs — Thien Thoi]
  DXY:           104.2 (+0.3% vs 30d avg) — USD STRENGTHENING → EM pressure
  US 10Y Yield:  4.52% — RISK-OFF threshold (>4.5%) — PE compression signal
  Fed Funds Rate: 5.33% (FRED)
  VND Carry Spread: +2.1% (VND 5.5% - Fed 5.33%) — NEUTRAL
  Global Liquidity: TIGHTENING
```

Signal rules (hard-coded thresholds matching methodology doc):
- DXY > 30d mean by +2%: USD STRENGTHENING
- DXY < 30d mean by -2%: USD WEAKENING
- US 10Y > 4.5%: RISK-OFF
- US 10Y < 4.0%: RISK-ON
- Carry spread > 2.5%: HOT_MONEY_INFLOW
- Carry spread < 0.5%: FII_OUTFLOW_RISK

Global Liquidity label derived from: (DXY trend) + (10Y level) + (carry spread)
using simple majority voting across 3 signals.

**Test:** snapshot tests covering each regime combination.

---

### Task 1423e — Macro Calendar tool

**Scope:** New MCP tool `get_macro_calendar`. Static data (no scraping needed for
Phase 1). Returns upcoming GSO + SBV policy windows for the next 60 days.

```typescript
// Static config — architect to confirm implementation approach
// Monthly: GSO CPI (first week of month)
// Quarterly: GSO GDP (~day 15 of month after quarter end: Apr 15, Jul 15, Oct 15, Jan 15)
// Monthly: SBV pivot windows: months 3, 6, 9, 12
// Monthly: PMI (days 2-3 of each month, S&P Global)
```

Output: list of upcoming events with `daysUntil`, `type`, `importance` (HIGH/MEDIUM).
No VPS needed. No scraping. Pure calendar logic.

**Test:** verify events generated correctly for a fixed reference date.

---

## Phase 2 — Sprint 1424 (spec after Phase 1 ships)

**Goal:** Market Valuation signal (Question 4). Requires VN-Index P/E computation
from existing BCTC earnings data.

### Candidate Tasks (not yet spec'd — BA writes after Sprint 1423):

- `compute_market_earning_yield`: aggregate EPS from BCTC watchlist stocks →
  estimate VN-Index P/E → compute earning_yield = 1/PE → compare vs
  `sbv_rates.max_deposit_rate_pct`.
- `get_yield_spread_signal`: earning_yield vs deposit rate → CHEAP / FAIRLY VALUED / EXPENSIVE.
- Surface in `get_macro_snapshot` as `[Dinh Gia — Asset Valuation]` section.

**Blocker:** needs BCTC coverage across all watchlist stocks. Check coverage before
sprint start.

---

## Phase 3 — Sprint 1425+ (requires new VPS scripts)

**Goal:** Close Questions 2 (OMO), 3 (banking liquidity), 5 (policy timing).

### Candidate Tasks:

- **OMO Tracker:** VPS scrape `sbv.gov.vn` weekly HTML → store net OMO position
  (pump/drain) in new table `omo_operations`. New tool `get_omo_signal`.
- **G-Bond Yield Curve:** VPS scrape `hnx.vn` daily → store in new table
  `gbond_yields`. New tool `get_gbond_yield`.
- **GSO Macro Parser:** VPS scrape `gso.gov.vn` monthly → populate
  `macro_indicators` CPI + GDP rows.
- **Policy Regime State Machine:** New domain service that reads OMO net + carry
  spread + CPI → classifies regime as GROWTH_PRIORITY or FX_STABILITY_PRIORITY.
- **New agent: `macro-economist`:** 4h cycle, owns global → VN cascade. Reads
  all global inputs, synthesizes Báu 5-question checklist, posts to WORK channel.

**Blocker:** OMO VPS script + G-Bond VPS script need ops capacity. Do not start
until Phase 1 and Phase 2 are live.

---

## Product Risks

**Risk 1 — DXY fetch reliability (MEDIUM)**
`DX-Y.NYB` is already in the SYMBOLS list and was added in a prior sprint. However
it may return 0 intermittently (low liquidity venue on Yahoo free tier). If DXY=0
frequently, the global liquidity signal will be unreliable. Mitigation: add a
fallback ticker `DX=F` (DXY futures, more liquid on Yahoo). Architect to decide.

**Risk 2 — FRED API rate limits (LOW)**
FRED public endpoint is free and generous (1000 req/day). Fed Funds Rate changes
at most 8 times per year (FOMC meetings). A daily fetch (not hourly) is sufficient
and eliminates rate limit risk. The existing hourly dedup on tracked_indicators
handles this correctly.

**Risk 3 — Carry spread signal quality (MEDIUM)**
`sbv_rates.max_deposit_rate_pct` may not reflect actual market deposit rates if
VPS scraping is stale or the SBV page structure changes. If max_deposit_rate_pct=0,
the carry signal must degrade gracefully (return `UNKNOWN` regime, not crash).
All carry signal code must treat 0 as "data unavailable."

**Risk 4 — Earning Yield computation accuracy (HIGH — Phase 2)**
Aggregating EPS from BCTC data across 30 watchlist stocks to estimate VN-Index P/E
will have coverage gaps (not all 30 stocks have Q4 2025 BCTC parsed). The signal
must disclose coverage percentage and refuse to compute if coverage < 70%.

**Risk 5 — OMO scraping brittleness (HIGH — Phase 3)**
`sbv.gov.vn` HTML structure has changed before. OMO tracker is the highest-value
signal in the methodology but also the most fragile. Architect must design with
schema-version detection and a human-alert fallback when the scraper breaks.

---

## New MCP Tools to Spec (Phase 1)

| Tool name | Returns | Cron? |
|-----------|---------|-------|
| `get_macro_snapshot` (extended) | Adds Thien Thoi section with DXY/10Y/Carry | No (existing tool, extended) |
| `get_carry_trade_signal` | CarryTradeSignal struct | On demand |
| `get_macro_calendar` | Upcoming GSO/SBV/PMI events (60d window) | No (static) |

New MCP Tools to Spec (Phase 2):

| Tool name | Returns | Cron? |
|-----------|---------|-------|
| `get_market_earning_yield` | Earning yield, deposit rate, spread, regime | On demand |
| `get_yield_spread_signal` | CHEAP / FAIRLY VALUED / EXPENSIVE + reasoning | On demand |

New MCP Tools to Spec (Phase 3):

| Tool name | Returns | Cron? |
|-----------|---------|-------|
| `get_omo_signal` | Net OMO position, pump/drain trend, SBV intent | Daily cron |
| `get_gbond_yield` | G-Bond yield curve (2Y/5Y/10Y) | Daily cron |
| `get_policy_regime` | GROWTH_PRIORITY / FX_STABILITY_PRIORITY + evidence | 4h cron |

---

## Success Criteria — Phase 1 Complete When

1. `get_macro_snapshot` output contains a `[Global Macro Inputs — Thien Thoi]` section
   with non-zero DXY, US10Y, Fed Funds Rate, Carry Spread, and Global Liquidity label.
2. `commodity_prices` table has `us10y_yield` column populated.
3. `tracked_indicators` has `fed_funds_rate` row with source=`fred`.
4. `get_carry_trade_signal` tool returns a valid CarryTradeSignal with regime label.
5. `get_macro_calendar` tool returns at least 3 upcoming events for any call date.
6. All existing 8090 tests continue to pass. New tests added for all new code paths.

---

## Architect Instructions

Design the following for Sprint 1423:

1. **Task 1423a:** Where exactly does `us10y_yield` live in the DB write path?
   The `storeCommoditySnapshot` function in `yahooFinance.ts` must be extended.
   Confirm the column migration is idempotent (try/catch ALTER TABLE pattern
   already used in schema-macro.ts for all prior migrations).

2. **Task 1423b:** FRED API — confirm public endpoint requires no API key.
   Recommend fetch frequency (daily is sufficient). Decide whether to add a
   dedicated scheduler job or piggyback on existing `macroIndicatorRefreshJob`.

3. **Task 1423c:** CarryTradeSignal — confirm it belongs in `domain/services/macro/`
   (no infrastructure imports). The SBV rate read should go through a repo interface,
   not a direct DB query from the domain service.

4. **Task 1423d:** `formatMacroSnapshot` takes a `MacroSnapshotResponse` struct.
   The struct needs a `carrySignal` field added. Confirm the type change is
   backward-compatible with all test injection patterns.

5. **Task 1423e:** Confirm `get_macro_calendar` is pure TypeScript (no DB, no HTTP).
   Static calendar logic only. Consider whether to put release-date config in
   `shared-config/` or inline as constants.

6. **Cross-cut:** All 5 tasks must not break the `8090` test baseline.
   Architect must identify any shared-type changes that would require updating
   existing test fixtures before developer tasks begin.

---

## Blockers Before Sprint 1423 Starts

None. All Phase 1 tasks require zero new VPS work and zero new external API
accounts. Yahoo Finance free tier already handles `^TNX`. FRED public API
requires no key for `FEDFUNDS` series.

---

## [Architect] Brownfield Findings + Technical Design

**Scan date:** 2026-04-29
**Files read:** `yahooFinance.ts`, `schema-macro.ts`, `macroTools.ts`, `policyTools.ts`, `macroIndicatorFetcher.ts`, `fetch-sbv.sh`, `ARCHITECTURE.md`, `mcp-tools.md`, `agent-roster.md`, `dev-standards.md`.

### Pre-existing Coverage Confirmed (do NOT rebuild)

| PO Gap | Architect Finding |
|--------|-------------------|
| DXY — "not displayed" | `SYMBOLS.dxy = "DX-Y.NYB"` already in `yahooFinance.ts` line 64. `commodity_prices.dxy` column exists. The **fetch exists but the `formatMacroSnapshot` output text skips it** — Task 1423d is purely a text-format change, not a data change. |
| US 10Y yield | Confirmed missing from `SYMBOLS`. One line addition. |
| FRED Fed Funds Rate | Confirmed no fetcher exists. `tracked_indicators` table is the correct landing table (has `hour_bucket` dedup trigger, source column, no schema change needed). |
| Carry spread | Confirmed no domain service. `sbv_rates.max_deposit_rate_pct` is populated by `vn-sbv-fetch.service`. |
| GSO CPI/GDP | `macro_indicators` table exists with all columns. Populated from Trading Economics (not GSO directly). Trading Economics already covers these. Phase 3 GSO scraping is a redundancy improvement, not a gap. |

### Answers to PO's 6 Architect Questions

**Q1 — `us10y_yield` DB write path:**
Add `us10y: "^TNX"` to `SYMBOLS` in `yahooFinance.ts`. Add `us10yYield: number` to `CommoditySnapshot` interface. In `storeCommoditySnapshot`, add the column to all 3 SQL statements (`upsertLatest`, `appendHistory` INSERT column lists). Migration: add `try { db.exec('ALTER TABLE commodity_prices ADD COLUMN us10y_yield REAL NOT NULL DEFAULT 0') } catch {}` inside the `commodity9Cols` loop (or a separate block) in `initMacroTables`. Same try/catch pattern used for all 9 prior columns — confirmed idempotent.

**Q2 — FRED API auth:**
FRED public CSV endpoint `https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS` requires no API key. Confirmed free tier. Daily fetch is correct (FOMC changes ~8x/year). **Decision: piggyback on existing `macroIndicatorRefreshJob.ts`** — add a `fetchFredFundsRate()` call alongside the Yahoo fetch rather than creating a new scheduler job. This avoids adding a cron entry and keeps macro refresh consolidated. The `tracked_indicators` hour_bucket trigger handles dedup naturally.

**Q3 — `carryTradeSignal.ts` layer:**
Belongs in `apps/mcp-server/src/domain/services/macro/carryTradeSignal.ts`. Domain service receives two plain numbers (`vndRate: number, fedRate: number`) — it does NOT read DB. The tool handler at `interface/mcp/tools/macro/` queries `sbv_rates` and `tracked_indicators`, extracts the two rate values, then calls the domain function. This respects the golden rule: `domain/` has zero infrastructure imports.

**Q4 — `MacroSnapshotResponse` backward compatibility:**
`macroTools.ts` builds the output text string internally. `MacroSnapshotResponse` only has `{ commodity, rates, fetchedAt }`. The carry signal and global liquidity label are computed inside `formatMacroSnapshot` (pure function from existing data) — no type change to `MacroSnapshotResponse` is needed. The DXY and US10Y values already exist in `commodity.dxy` and `commodity.us10yYield` (after 1423a). Carry spread is computed inline from `rates.max_deposit_rate_pct` + the `tracked_indicators` row fetched separately. **No test fixture changes required for 1423d** — existing snapshot tests pass unchanged, new tests cover the new output section.

**Q5 — `get_macro_calendar` placement:**
Pure TypeScript, no DB, no HTTP. Release-date logic is static knowledge. **Decision: inline as constants** in `macroCalendar.ts` (new file at `apps/mcp-server/src/domain/services/macro/macroCalendar.ts`). Reason: `shared-config/` is for runtime config loaded from `mcp.config.json`; calendar rules are domain logic (month-3/6/9/12 is a business rule, not an operator-configurable parameter). FOMC dates table (2025-2026) as a static array updated annually.

**Q6 — Test baseline safety:**
Three files modified (not new) carry risk: `yahooFinance.ts`, `schema-macro.ts`, `macroTools.ts`. All have existing tests. Breaking surface:
- `yahooFinance.ts`: adding one symbol to `SYMBOLS` and one field to `CommoditySnapshot` is additive. Existing tests that mock `fetchSymbolPrice` use `Promise.allSettled` — they will still pass since the new result slot defaults to 0. **Risk: zero for existing tests.**
- `schema-macro.ts`: idempotent ALTER TABLE in try/catch. In-memory test DB gets the new column cleanly. **Risk: zero.**
- `macroTools.ts`: new text section added to `formatMacroSnapshot`. Existing snapshot tests check specific substrings not the full text — **verify before implementation** that tests use `toContain` not `toBe` for the full output. If any test does full-text equality, add the new section to its expected value.

### Phase 1 File Map (precise)

```
MODIFY  apps/mcp-server/src/infrastructure/fetchers/yahooFinance.ts
          — SYMBOLS: add us10y entry
          — CommoditySnapshot: add us10yYield field
          — storeCommoditySnapshot: add column to 2 SQL statements

MODIFY  apps/mcp-server/src/infrastructure/db/schema-macro.ts
          — initMacroTables: ALTER TABLE commodity_prices ADD COLUMN us10y_yield
          — initMacroTables: ALTER TABLE commodity_prices_history ADD COLUMN us10y_yield

NEW     apps/mcp-server/src/infrastructure/fetchers/fredApi.ts
          — fetchFedFundsRate(): Promise<number | null>
          — CSV parse: last row, column index 1
          — stores to tracked_indicators via getDb()

MODIFY  apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts
          — add fetchFedFundsRate() call (alongside existing Yahoo call)

NEW     apps/mcp-server/src/domain/services/macro/carryTradeSignal.ts
          — computeCarryTradeSignal(vndRate, fedRate, dxy?, dxyMom?): CarryTradeSignal
          — pure function, zero infrastructure imports

NEW     apps/mcp-server/src/domain/services/macro/macroCalendar.ts
          — getMacroCalendar(referenceDate?): MacroCalendarResult
          — static FOMC dates array (2025-2026)
          — pure function, zero infrastructure imports

MODIFY  apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts
          — formatMacroSnapshot: add [Thien Thoi] section
          — query tracked_indicators for fed_funds_rate before formatting
          — compute carry spread inline, call computeCarryTradeSignal

NEW     apps/mcp-server/src/interface/mcp/tools/macro/carryTools.ts
          — registers get_carry_trade_signal MCP tool
          — registers get_macro_calendar MCP tool

MODIFY  apps/mcp-server/src/interface/mcp/tools/macro/index.ts
          — export from carryTools.ts

MODIFY  apps/mcp-server/src/interface/mcp/tools/registry.ts
          — register carryTools

MODIFY  apps/mcp-server/src/scheduler/macro/index.ts
          — (no change if fedFunds piggybacked on existing job)

NEW     apps/mcp-server/src/__tests__/1423-bau-phase1.test.ts
          — unit tests: carryTradeSignal all 3 regime branches
          — unit tests: macroCalendar events for fixed reference date
          — unit tests: fredApi CSV parse (mock HTTP)
          — unit tests: yahooFinance us10yYield field
```

### Phase 2 File Map (for PM planning — not Sprint 1423)

```
NEW     vps-scripts/fetch-gbond.sh
NEW     vps-scripts/vn-gbond-fetch.service
NEW     vps-scripts/fetch-omo.sh
NEW     vps-scripts/vn-omo-fetch.service
MODIFY  apps/mcp-server/src/infrastructure/db/schema-macro.ts
          — add vn_bond_yields table
          — add sbv_omo_operations table
NEW     apps/mcp-server/src/domain/services/macro/omoLiquidityAnalyzer.ts
NEW     apps/mcp-server/src/domain/services/macro/marketValuationScorer.ts
NEW     apps/mcp-server/src/domain/services/macro/hotMoneyClassifier.ts
NEW     apps/mcp-server/src/interface/mcp/tools/macro/valuationTools.ts
          — get_market_earning_yield
          — get_yield_spread_signal
          — get_omo_signal
          — get_gbond_yield
```

### Phase 3 File Map (not before Sprint 1425)

```
NEW     apps/mcp-server/src/domain/services/macro/policyRegimeStateMachine.ts
MODIFY  vps-scripts/fetch-browser.py  (add Vietstock interbank scraping)
NEW     cowork-workspace-team-claude-desktop/macro-economist.md
NEW     cowork-workspace-team-claude-desktop/policy-tracker.md
```

Note on Cowork agents: `macro-economist.md` and `policy-tracker.md` are Phase 3 deliverables — they depend on `get_omo_signal` and `get_policy_regime` tools which require Phase 2 data. Do not create the agent files in Sprint 1423 as they would have no useful tools to call yet.

### Risk Register (architect-level)

| Risk | Severity | Sprint Impact |
|------|----------|--------------|
| `DX-Y.NYB` returns 0 intermittently on Yahoo free tier | MEDIUM | Task 1423d must show "unavailable" gracefully when dxy=0, not "0%" |
| `macroTools.ts` tests use full-text equality | LOW | Verify before 1423d; add new section to expected string if needed |
| `fredgraph.csv` URL format change | LOW | FRED is extremely stable; add structured error log if CSV parse returns 0 rows |
| BCTC earnings coverage for P/E computation (Phase 2) | HIGH | PM must check `list_stored_pdfs` coverage before sprint 1424 starts |
| sbv.gov.vn OMO HTML table structure (Phase 3) | HIGH | Design VPS script with HTML schema version detection + WORK channel alert on parse failure |

### DDD Compliance Checklist

- `carryTradeSignal.ts` — domain layer, no infra imports. PASS.
- `macroCalendar.ts` — domain layer, no infra imports. PASS.
- `fredApi.ts` — infrastructure/fetchers layer (has DB write). PASS (correct layer).
- `macroTools.ts` modifications — interface layer queries DB, calls domain. PASS.
- `omoLiquidityAnalyzer.ts` (Phase 2) — receives `OmoDataPoint[]` plain structs. PASS.
- `marketValuationScorer.ts` (Phase 2) — receives plain numbers. PASS.
