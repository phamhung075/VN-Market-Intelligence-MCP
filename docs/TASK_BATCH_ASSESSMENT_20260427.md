# Task Batch Assessment — 2026-04-27

**PO Assessment:** 4 open reports + 1 new DB pollution bug

---

## BATCH SUMMARY

| Task ID | Type | Size | Impact | Owner | Related Reports |
|---------|------|------|--------|-------|-----------------|
| **1347a** | **FIX** | **S** | **CRITICAL** | **Developer** | **NEW** |
| **1347b** | **FIX** | **S** | **HIGH** | **Developer** | **1319** |
| **1346e** | **BACKLOG** | **M** | **MEDIUM** | **BA** | **1314, 1315** |

---

## Task 1347a: Test DB Isolation — Remove Production Writes (NEW)

**Priority:** CRITICAL
**Size:** S (1–2h)
**Owner:** Developer
**Related Reports:** NEW (discovered during sprint 1345 integration)

### Problem
Tests are writing real rows into production `telegram_reports` table (100+ fixture rows accumulated). This breaks report integrity:
- Real PO/PM/QA workflows see ghost reports from test runs
- `read_telegram_reports(status="new")` returns test noise
- If tests run during live analysis cycles, cascade/sentiment signals misfire
- Manual cleanup required; no test teardown

### Root Cause
Tests must use `:memory:` DB or mock the store. Currently:
- Some tests correctly use `:memory:`
- Some tests create temp `.db` files (tmpfile-based tests can leak to production if DB_PATH not overridden)
- Production DB `data/market.db` is file-based, shared across test/dev/prod

### Solution (RED-GREEN)
1. **Audit:** Find all test files that touch `telegram_reports`
2. **1347a (FIX):**
   - Wrap `telegramReportStore` CRUD helpers in test mocks or mock at MCP tool layer
   - Ensure all tests use `:memory:` DB OR set `Bun.env.DB_PATH = ":memory:"` before test
   - Add `afterEach()` cleanup to clear fixture rows if production DB used
   - Run full suite: verify 0 new rows in `telegram_reports` table after tests

### Acceptance
- No new rows in `telegram_reports` after full test run
- All 7371+ tests pass
- No regression in test coverage

### Technical Notes
- Store signature: `insertReport(db, text, fromAgent, messageId?, priority?)` — db is explicit param
- Tests can mock `insertReport` at call site or use in-memory db
- Check: `telegramReportTools.ts` (MCP interface) for any global DB references

---

## Task 1347b: Stock Classification Data Gap (1319)

**Priority:** HIGH
**Size:** S (1h max)
**Owner:** Developer
**Related Reports:** 1319

### Problem
`docs/data/stock-classification.json` covers only 5 tickers (VNM, FPT, VCB, HPG, VEA).
Watchlist has 30 tickers (restored in Sprint 1343):
- BID, SHB, EIB, VHM, VIC, KBC, HUT, DIG, DXG, KDH, PDR, NVL, VRE, MSN, FRT, KDC, SAB, DPM, SSI, VIX, VND, VCI, DGC, VJC, GEX, BSR (26 missing)

Without `tradeExposure` mapping for these 26 tickers:
- Cascade routing ignores geographic news (Japan/China/US) for 86% of portfolio
- Global macro signals cannot reach ~87% of watchlist
- Analysis pipeline loses key context

### Solution
Update `docs/data/stock-classification.json`:
1. Add all 30 watchlist tickers to `watchlist` array (with sector, exchange, company name from watchlist.md)
2. Populate `tradeExposure` for each ticker (geographic revenue %, estimated from industry/peer analysis)
   - Banks: Vietnam 85–95%, US/Japan/China 1–5%
   - Real estate: Vietnam 95%+, minimal FX exposure
   - Retail: Vietnam 80–90%, some ASEAN/US
   - Steel/Chemicals: More China/ASEAN exposure (10–30%)
   - Tech: More Japan/US exposure (20–40%)
3. Update `reverseMap` with new events that cascade to these 26 tickers (e.g., "ASEAN trade war" → real estate peers)
4. Update `sectorPeers` to include peer tickers for each sector
5. Update `lastUpdated` timestamp

### Acceptance
- All 30 watchlist tickers present in `watchlist` array
- All tickers have `tradeExposure` entry (no null/missing)
- Geographic percentages sum to 100% per ticker
- Reverse map covers ≥5 macro events with ≥2 stocks each
- Sector peers include 3–5 tickers per sector
- No regressions: cascade-engine.ts still passes all tests

### Technical Notes
- Data source: user watchlist (from MEMORY.md) + industry research (sector classification)
- Risk: Over-estimating FX exposure for domestic-heavy companies (banks, retail) → tune conservatively
- Consider adding `confidence` field for each tradeExposure estimate (high/medium/low)

---

## Task 1346e: Cascade Architecture Gap — DSC + VPBankS/OKX (BACKLOG → SPRINT-S)

**Priority:** MEDIUM
**Size:** M (4–6h)
**Owner:** BA (spec), then Architect (design), then Developer (impl)
**Related Reports:** 1314, 1315

### Problem
Two related cascade issues blocking SPRINT-S gate:

**Issue 1314:** DSC CEO bearish warning
- Problem: `run_impact_chain("DSC CEO says market risky")` returns impact=4 (narrow) instead of impact=8 (market-wide)
- Root cause: DSC (brokerage sentiment) not cascading to all watchlist stocks
- Expected: Brokerage warnings should broadcast to entire market analysis, not just DSC holders
- Impact: Morning briefing loses macro-sentiment context for 29/30 watchlist tickers

**Issue 1315:** VPBankS/OKX crypto partnership
- Problem: Banking cascade only routes to 4 banks (VCB/BID/SHB/EIB), missing competitive/substitution logic
- Missing: VPBankS crypto pivot → OKX partnership → retail crypto players might see cheaper/faster settlements → potential margin pressure on traditional banking
- Expected: Competitive intelligence should trigger deeper analysis for fintech threat
- Impact: Analysis system misses cross-sector competitive shifts

### Solution (SPRINT-S)
This is an **architecture gap**, not a data issue. Requires:
1. **BA spec (1346e):** Define "market-wide impact chain" policy
   - When does a single-stock news trigger market-wide broadcast? (≥3 peers affected? 50%+ sector? sector leader warning?)
   - Competitive/substitution signals: which sectors cascade "threat" events?
2. **Architect:** Redesign `cascadeEngine.ts` impact routing
   - Add `cascadeScope` field (ticker-specific vs. sector vs. market-wide)
   - New signal: `COMPETITIVE_THREAT` (when one stock's news threatens peer group)
   - Update `SECTOR_RULES` to include substitute sectors (fintech → traditional banking)
3. **Developer:** Implement routing logic, write tests, integrate into alert builder
4. **QA:** Verify DSC warning now reaches all tickers; VPBankS news triggers banking peer analysis

### Acceptance
- DSC CEO warning returns impact=8 (market-wide)
- VPBankS/OKX news signals competitive threat to traditional banks
- All 7371+ tests pass
- No regressions in cascade-engine test suite

### Technical Notes
- `cascadeEngine.ts` god node in system (handles all macro-to-micro routing)
- May need DDD refactor to separate "routing logic" from "impact scoring" (architect decision)
- Consider time-based cascade (DSC warning expires after 24h, fresher warnings override)

---

## Execution Plan

### Sprint 1346 (Active)
- Continue: Task 1346a (remove test stub), 1346d (PDF circuit breaker race fix)
- **New:** Task 1347a (TEST DB isolation) — unblock 1346a integration
- **New:** Task 1347b (stock classification) — 1h data fix, no code

### Sprint 1347 (Next)
- **In Progress:** 1347a, 1347b
- **Backlog (SPRINT-S in future):** 1346e (BA spec → architect → dev)

---

## Decision Log

**Why 1347a before 1346e?**
- Test isolation is infrastructure blocker (affects all future sprints)
- Can't trust test results if production DB polluted
- 1h fix, critical path to quality

**Why 1347b is FIX not BACKLOG?**
- Stock classification affects live cascade routing (1319 is blocking analysis)
- Data-only update, no code review needed
- Unblocks future cascade improvements (1346e)

**Why 1346e is BACKLOG → SPRINT-S?**
- Requires architecture rethink (BA → architect → dev pipeline)
- Can run in parallel with 1347a/1347b
- Medium priority: analysis incomplete but not broken

**Why not fix cascade immediately?**
- Cascade architecture is non-trivial; needs BA spec first (define "market-wide" policy)
- Architect must review impact on other systems (telegram routing, signal builder, analyst)
- 1347b data fix is quick win; cascades can be improved after

---

**Status:** Batch complete. Ready for developer + BA handoff.
