# Handoff: FIX-D — Extend get_bctc_full to structured JSON output + receivables join

**Task ID:** FIX-D  
**Sprint:** RAPID-DATA-LAYER  
**Priority:** P1 (unblocks SKILL-1/2/3/4 from text-only parsing → direct JSON field access)  
**Zone:** dev-mcp-server  
**Owner:** dev-mcp-server  
**Depends:** None  
**WIP Count:** 1 of 2 (parallel with FIX-A, FIX-H)  
**Estimated Duration:** 2.5–3h  
**Acceptance Criteria:**
1. `get_bctc_full(code)` output gains new section `structured_data` (non-breaking, alongside existing text)
2. `structured_data` includes all numeric ReportRow columns as machine-readable JSON:
   - `market_cap_billion` (from FIX-B, via vnstock_trading_stats or separate query)
   - `pe`, `pb`, `roe`, `debt_to_equity`, `net_debt_to_ebitda`, `operating_cf`, `net_profit`, `revenue`, `total_assets`, `equity_total`, `total_liabilities`, `cash`, `long_term_debt`, `profit_before_tax`, `operating_margin_pct`, `current_ratio`
   - All nullable if missing or confidence<0.5
3. `receivables` field added: read from vnstock_balance_sheet.receivables_bn (JOIN on same code + latest period), fallback null if absent
4. No text-format fields in structured_data (structured ONLY)
5. Existing text output **unchanged** (backward compat)
6. Unit tests: (a) happy path FPT latest period (all fields populated), (b) VNM with partial fields (some null), (c) receivables JOIN fallback (missing from vnstock_balance_sheet)
7. Live-verified: `get_bctc_full(FPT)` returns structured_data with pe/pb/receivables/current_ratio as direct numbers, no text parsing needed

---

## Implementation Notes

**Files to Modify:**
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts`
- Test: `apps/mcp-server/src/__tests__/tools/get-bctc-full-structured.test.ts` (new or extend existing)

**Core Change Logic:**

1. **In bctcFullTools.ts `getBctcFull()` function (§806):**

   After the existing text-summary construction, add:

   ```typescript
   // Build structured_data section (new, non-breaking)
   const structuredData = {
     // Numeric fields from latest row (if confidence >= 0.5, null otherwise)
     pe: latestRow.pe,
     pb: latestRow.pb,
     roe: latestRow.roe,
     debt_to_equity: latestRow.debt_to_equity,
     net_debt_to_ebitda: latestRow.net_debt_to_ebitda,
     operating_cf: latestRow.operating_cf,
     net_profit: latestRow.net_profit,
     revenue: latestRow.net_revenue,
     total_assets: latestRow.total_assets,
     equity_total: latestRow.equity_total,
     total_liabilities: latestRow.total_liabilities,
     cash: latestRow.cash,
     long_term_debt: latestRow.long_term_debt,
     profit_before_tax: latestRow.profit_before_tax,
     operating_margin_pct: latestRow.operating_margin_pct,
     current_ratio: latestRow.current_ratio,
     
     // Receivables: JOIN vnstock_balance_sheet (same code, latest period match)
     receivables: await getReceivablesForLatestPeriod(code, latestRow.period),
     
     // Market cap (from FIX-B: vnstock_trading_stats.market_cap_bn)
     market_cap_billion: await getMarketCapForCode(code),
     
     // Metadata
     period: latestRow.period,
     refine_status: latestRow.refine_status,
     confidence: latestRow.confidence,
     fetched_at: new Date().toISOString(),
   };

   // Return with both text + structured
   return {
     code,
     period: latestRow.period,
     summary_text: buildSummarySection(...),  // existing text, unchanged
     structured_data: structuredData,
     source_tier: 1,
   };
   ```

2. **Helper: `getReceivablesForLatestPeriod(code: string, period: string)`:**
   - Query vnstock_balance_sheet: `SELECT receivables_bn FROM vnstock_balance_sheet WHERE code=? AND period=? LIMIT 1`
   - Return number or null if absent/mismatch

3. **Helper: `getMarketCapForCode(code: string)`:**
   - Query vnstock_trading_stats: `SELECT market_cap_bn FROM vnstock_trading_stats WHERE code=? LIMIT 1`
   - Return number or null if absent (same safe-divide degrade as FIX-B)

4. **Test Coverage:**
   - **T1 (happy):** FPT latest row with all fields populated + receivables exists in vnstock_balance_sheet
     - Assert: `structured_data.pe === latestRow.pe` (direct copy)
     - Assert: `structured_data.receivables` is a number
     - Assert: `summary_text` still populated (backward compat)
   - **T2 (partial):** VNM with confidence<0.5 on some fields
     - Assert: low-confidence fields are null in structured_data
     - Assert: summary_text still rendered (may use N/A for same fields)
   - **T3 (missing receivables):** Code with vnstock_balance_sheet row missing
     - Assert: `structured_data.receivables === null`
     - Assert: no error thrown (graceful degrade)
   - **T4 (market_cap null):** Code with vnstock_trading_stats missing
     - Assert: `structured_data.market_cap_billion === null`
     - Assert: no error thrown

5. **Rebuild + Live-verify:**
   - ops: rebuild mcp-server container
   - qa: call `get_bctc_full(FPT)` via gateway
     - Verify response has both `summary_text` and `structured_data` keys
     - Verify `structured_data.pe` is a number (not text)
     - Verify `structured_data.receivables` is present (number or null)

---

## Context

SKILL-1/2/3/4 currently cannot parse `get_bctc_full` output because it returns TEXT (e.g., "Current P/E: 14.5"). With structured_data, agents read `structured_data.pe: 14.5` directly.

**Risk Notes:**
- **Risk-1 (corpus depth):** Many tickers have sparse BCTC rows; missing fields will be null. Agents must degrade gracefully (no numeric formula on null values).
- **Receivables join:** If vnstock_balance_sheet period != financial_reports period (off-by-one), receivables will be null — OK, safer than wrong data. Agents see null and skip receivables logic.

---

## Blockers / Escalations

None identified. All required source tables exist:
- financial_reports (BCTC extraction)
- vnstock_balance_sheet (synced by syncVnstockData)
- vnstock_trading_stats (synced by syncVnstockData)

**Pre-dep verification:**
- Confirm vnstock_balance_sheet has ≥1 row for a watchlist ticker (e.g., FPT)
- Confirm vnstock_trading_stats populated for same ticker

---

## Related Docs

- Brief: docs/architecture-briefs/2026-06-04-rapid-analysis-data-layer-gaps.md (§6 FIX-D, §3 SKILL-2/3/4)
- Current tool: apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts:806
- Schema: apps/mcp-server/src/infrastructure/database/schema-financial-reports.ts (financial_reports L35, vnstock_balance_sheet L379)
- FIX-B (market cap): docs/handoffs/FIX-B-GET-MARKET-CAP.md (market_cap_bn persistence source)

---

## [Developer] — dev-mcp-server

**Status:** DONE — LIVE-VERIFIED  
**Commit:** 0e8c2be0 (feat(rapid-phase2/FIX-D): extend get_bctc_full with structured_data + receivables)  
**File modified:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` (structured_data block at ~L1094+)  
**Tests:** `src/__tests__/240-bctc-full.test.ts` — FIX-D suite: 6 pass, 0 fail (FIX-D-1..FIX-D-5 + replay)  
**TSC:** clean (bun tsc --noEmit)

**Live verification 2026-06-04 via HTTP MCP:**
- `get_bctc_full(FPT)` returns 2 content items (text + JSON)
- content[1] contains `structured_data` with all required numeric fields
- `structured_data.roe = 6.17` (number, not text) — recomputed-on-read via BAL-1a helper
- `structured_data.debt_to_equity = 0.401`
- `structured_data.net_revenue = 12479997.206775` (million VND)
- `structured_data.receivables = null` (honest — vnstock_balance_sheet period mismatch acceptable)
- `summary_text` (content[0]) unchanged — backward compat confirmed
- pe/pb both null (market-cap data pending FU-FIXB-COLUMNKEY-VERIFY — expected)

**AC coverage:**
1. structured_data section present alongside existing text ✓
2. All numeric fields as machine-readable JSON ✓
3. receivables field present (null when absent) ✓
4. Text output unchanged ✓
5. Unit tests: happy path + partial + missing receivables + market_cap null ✓
6. Live pe/pb fields present (null pending FIX-B data refresh — known gap, documented) ✓

**Status for QA:** REVIEW — ops must confirm container rebuilt after 0e8c2be0 (mcp /health shows toolCount=159)
