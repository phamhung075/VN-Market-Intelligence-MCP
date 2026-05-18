---
sprint: 1942
branch: task/1942b-cashflow-fallback-path
size: M
zone: apps/mcp-server/
depends_on: [1942a]
blocks: [1942c]
---

# Handoff: TASK_1942b — cashFlowTool Fallback Read Path + backfillOCFForWatchlist

**Task ID:** 1942b-cashflow-fallback-path
**Sprint:** 1942
**Status:** Ready-for-Dev
**Owner:** dev-mcp-server
**DDD Zone:** `apps/mcp-server/` — interface/mcp/tools + infrastructure/db layers

---

## TLDR

Add a fallback read path to `cashFlowTool.ts`: if `financial_reports` has zero rows for a ticker, query `vnstock_cash_flow` + `vnstock_financials` directly and synthesize a response with `data_source: "vnstock_direct"`. Add `backfillOCFForWatchlist()` to the migration block in `schema-financial-reports.ts` to populate `operating_cash_flow` for tickers that already have `financial_reports` rows. Two files modified, no new files, no schema changes beyond a helper function addition.

---

## [PM] Planning Context

### Zone
**`apps/mcp-server/`** — two file modifications: interface/mcp/tools layer + infrastructure/db layer.

### Acceptance Criteria — Primary Path (cashFlowTool fallback)

| ID | Criterion | Verifiable via |
|----|-----------|---|
| AC-1 | Financial reports path unchanged (no regression) — returns same fields + `data_source: "financial_reports"` | Unit test: financial_reports rows exist → same response shape + data_source field |
| AC-2 | Fallback activates on zero `financial_reports` rows for ticker (not specific period) | Unit test: zero rows for ticker → fallback SELECT from vnstock_cash_flow/vnstock_financials |
| AC-3 | Output field `data_source` is `"financial_reports"` or `"vnstock_direct"` in `CashFlowFound` | Inspect response envelope, inspect type definition |
| AC-4 | Fallback field mapping: operating_cf/investing_cf/financing_cf from vnstock × 1000 (tỷ → triệu) | Unit test: mock vnstock row with operating_cf_bn=100 → response operating_cf=100000 |
| AC-5 | "Loading for first time" message when both tables empty: `loading: true`, `period: "Đang tải dữ liệu lần đầu"` | Unit test: both tables empty → loading message + period text |
| AC-6 | OCF/NI ratio reuses `computeOcfNiRatio()` helper unchanged | Code review: no new ratio logic, reuse existing |
| AC-7 | Period filter behavior: if year/period supplied → filter; if neither → latest quarter; if year only → latest in year | Unit test: TC1 (no period, latest), TC2 (year+period match), TC3 (specific period absent → not_found) |
| AC-8 | Success signal: `get_cash_flow(VNM)` returns `found: true, data_source: "vnstock_direct"` after 1942a sweep | Integration: call tool after startup probe completes |

### Acceptance Criteria — Secondary Path (backfillOCFForWatchlist)

| ID | Criterion | Verifiable via |
|----|-----------|---|
| AC-B1 | Function signature: `export function backfillOCFForWatchlist(db: Database): void` | Code review: signature match |
| AC-B2 | Reads watchlist from `docs/data/stock-classification.json` (SSOT) and calls `bridgeOCFToFinancialReports()` per ticker | Code review: file read, loop, bridge call |
| AC-B3 | Running multiple times produces same result (idempotent) | Unit test: mock DB, call twice, verify same row count updated |
| AC-B4 | Log at INFO level: `[backfillOCFForWatchlist] updated operating_cash_flow for N tickers (watchlist sweep)` where N = tickers with updates | Code review: log line in function |
| AC-B5 | Called in migration block after `backfillAllOCF()` and `backfillAllNetProfit()` | Code review: call location in `initFinancialReportsTables()` |
| AC-B6 | No schema changes — uses existing columns/tables | Code review: no ALTER TABLE, no INSERT, UPDATE only |

### Files to Read First

- `apps/mcp-server/src/interface/mcp/tools/financial-reports/cashFlowTool.ts` — current impl, `CashFlowFound` type, query logic, ratio computation
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — `financial_reports` table definition, `bridgeOCFToFinancialReports()`, existing migration calls (`backfillAllOCF()`, `backfillAllNetProfit()`)
- `apps/mcp-server/src/infrastructure/db/queries/vnstockQueries.ts` — `vnstock_cash_flow` and `vnstock_financials` table schemas
- `docs/data/stock-classification.json` — watchlist SSOT (30 tickers)
- `docs/architecture-briefs/2026-05-18-watchlist-fundamentals-cadence.md` — architect brief, COALESCE decision rationale

### Files to Create

None. Two-file modification task.

### Files to Modify

| File | Purpose |
|------|---------|
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/cashFlowTool.ts` | Add fallback SELECT logic, `data_source` field, `loading` field |
| `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` | Add `backfillOCFForWatchlist()` function + call in migration block |

### Dependencies

- TASK_1942a (startup probe) must be live before integration testing (ensures vnstock tables are populated)
- Blocks TASK_1942c (HPG cash flow extraction fix, depends on this fallback being live)

### Knowledge Needed

- `docs/policies/dev-standards.md` — naming, error handling, logging conventions
- `docs/protocols/fail-loud-protocol.md` — escalation rules
- `docs/handoffs/1942b-ba-spec.md` — full BA spec (10 ACs, 6 edge cases, COALESCE decision tree, DDD mapping)
- DDD microservices pattern: interface/mcp/tools → application/usecases → infrastructure/db
- SQLite unit conversion: tỷ VND (billions) × 1000 → triệu VND (millions)

---

## Implementation Notes from BA Spec

### Primary Path — Fallback Logic (AC-2, AC-3, AC-4)

COALESCE-style decision tree in `cashFlowTool.ts`:

```typescript
const countResult = db.prepare(
  'SELECT COUNT(*) as cnt FROM financial_reports WHERE action_code = ?'
).get(ticker);

if (countResult.cnt > 0) {
  // Primary path: return from financial_reports (unchanged)
  // data_source: "financial_reports"
} else {
  // Fallback path: query vnstock_cash_flow + vnstock_financials
  // data_source: "vnstock_direct"
  const vcfRow = db.prepare(
    'SELECT * FROM vnstock_cash_flow WHERE code = ? AND quarter BETWEEN 1 AND 4 ORDER BY year_report DESC, quarter DESC LIMIT 1'
  ).get(ticker);
  
  if (vcfRow) {
    // Synthesize response: operating_cf_bn * 1000, etc.
    // Apply ratio logic via computeOcfNiRatio()
  } else {
    // Both tables empty: return loading message
    return { found: false, loading: true, period: "Đang tải dữ liệu lần đầu" };
  }
}
```

### Unit Conversion (AC-4)

vnstock columns are in tỷ VND (billions). Convert to triệu VND (millions) by multiplying by 1000:

| Output field | Source column | Conversion |
|---|---|---|
| `operating_cf` | `vnstock_cash_flow.operating_cf_bn` | × 1000 |
| `investing_cf` | `vnstock_cash_flow.investing_cf_bn` | × 1000 |
| `financing_cf` | `vnstock_cash_flow.financing_cf_bn` | × 1000 |
| `capex` | `null` (no capex column in vnstock) | — |
| `free_cash_flow` | `null` (cannot compute) | — |
| `net_profit` | `vnstock_financials.net_profit_bn` | × 1000 |

### Output Envelope Additions

```typescript
interface CashFlowFound {
  // ... existing fields ...
  data_source: "financial_reports" | "vnstock_direct"; // NEW
}

interface CashFlowNotFound {
  found: false;
  loading?: true; // NEW: only when both tables empty
  period: string; // "Đang tải dữ liệu lần đầu" or other
  // no data_source field when not found
}
```

### Secondary Path — backfillOCFForWatchlist (AC-B1 through AC-B6)

Add to `schema-financial-reports.ts`:

```typescript
export function backfillOCFForWatchlist(db: Database): void {
  try {
    const classification = JSON.parse(
      fs.readFileSync('docs/data/stock-classification.json', 'utf-8')
    );
    const tickers = classification.watchlist; // or appropriate key
    
    let count = 0;
    for (const ticker of tickers) {
      const changes = bridgeOCFToFinancialReports(db, ticker);
      if (changes > 0) count++;
    }
    
    logger.info(`[backfillOCFForWatchlist] updated operating_cash_flow for ${count} tickers (watchlist sweep)`);
  } catch (err) {
    logger.warn(`[backfillOCFForWatchlist] failed to read stock-classification.json: ${err.message}`);
  }
}
```

Call in `initFinancialReportsTables()` after `backfillAllNetProfit()`:

```typescript
export function initFinancialReportsTables(db: Database): void {
  // ... existing migrations ...
  backfillAllOCF(db);      // ~line 279
  backfillAllNetProfit(db); // ~line 283
  backfillOCFForWatchlist(db); // NEW: add here
}
```

### Period Filter Behavior (AC-7)

```typescript
if (year && period) {
  // Filter: year_report = year AND quarter = quarterNum
} else if (year && !period) {
  // Filter: year_report = year, ORDER BY quarter DESC
} else {
  // No filters: latest quarter across all years
}
```

If specific period requested and NOT found in fallback → return `{ found: false }` (not loading message).

### Edge Cases

- EC-1 — Ticker in neither table: return loading message
- EC-2 — Ticker has some quarters in financial_reports, others only in vnstock: primary path used for ALL periods (no mixing within same ticker)
- EC-3 — vnstock_cash_flow row found but vnstock_financials row missing: return `CashFlowFound` with `net_profit: null`, ratio fields null, `ni_source: "vnstock_direct"`
- EC-4 — Quarter 0 (annual) in vnstock_cash_flow: exclude via `WHERE quarter BETWEEN 1 AND 4`
- EC-5 — Unit consistency: always multiply by 1000.0 (consistent with bridgeOCFToFinancialReports at schema line 315)
- EC-6 — stock-classification.json unreadable: catch, log WARN, return early (don't crash server on startup)

---

## Success Criteria (Integration Test)

After TASK_1942a startup probe completes:

1. `get_cash_flow(VNM)` returns `found: true, data_source: "vnstock_direct"` (zero financial_reports rows)
2. `get_cash_flow(VCB)` returns `found: true, data_source: "financial_reports"` (has OCR rows, no regression)
3. Distinct tickers returning `found: true` across all 30 watchlist tickers: ≥20/30
4. Logs show `[backfillOCFForWatchlist]` line at server startup (tickers with updates counted)
5. Existing 24-test cashflow suite passes with zero regressions

---

## Testing

Unit tests required:

- TC1: Primary path (financial_reports rows exist) → same response + data_source="financial_reports"
- TC2: Fallback path (zero financial_reports, vnstock_cash_flow has row) → fallback SELECT + data_source="vnstock_direct"
- TC3: Both tables empty → loading=true, period="Đang tải dữ liệu lần đầu"
- TC4: Unit conversion (operating_cf_bn=100 → operating_cf=100000)
- TC5: Period filter (year+period supplied) → matches in fallback
- TC6: Period filter (no period, latest quarter) → ORDER BY DESC LIMIT 1
- TC7: Period filter (year+period not found) → found=false (not loading message)
- TC8: backfillOCFForWatchlist idempotency (call twice, same count)
- TC9: backfillOCFForWatchlist log line
- TC10: stock-classification.json unreadable → catch, log WARN

Integration tests (manual or E2E):

- After 1942a startup probe: call `get_cash_flow(VNM)` → vnstock_direct path
- Verify 24-test cashflow regression suite: all GREEN
- Verify `get_cash_flow(VCB)` → financial_reports path (no regression)

---

## Constraints

- No new cron entries or scheduler changes
- No new database tables
- No schema changes (backfillOCFForWatchlist is a helper function, not an ALTER TABLE)
- No new MCP tools (fallback is transparent to callers)
- `_testDb` injection pattern in `buildGetCashFlowHandler` must be preserved for testability
- `OCF_NI_RATIO_PLAUSIBILITY_LIMIT = 20` constant unchanged
- `computeOcfNiRatio()` helper reused unchanged
- Watchlist SSOT = `docs/data/stock-classification.json` (NOT system-map.json)

---

## Not In Scope

- Extracting fallback logic into a separate application use case (Architect R-7 notes this is a pragmatic choice, deferred to future refactor)
- SSOT consolidation (Sprint 1888 series)
- HPG cash flow extraction fix (TASK_1942c, sequenced after this task)

---

## Handoff to Developer

**Ready to implement.** BA spec fully specced, no blockers, depends on TASK_1942a (startup probe must run first to populate vnstock tables for integration testing).

**Primary path:** Add COALESCE-style decision tree in `cashFlowTool.ts` — if financial_reports empty, query vnstock_cash_flow + vnstock_financials. Apply unit conversion (× 1000). Synthesize response with `data_source: "vnstock_direct"`. Reuse `computeOcfNiRatio()` for ratio logic.

**Secondary path:** Add `backfillOCFForWatchlist()` function to `schema-financial-reports.ts`. Read watchlist from `docs/data/stock-classification.json`. Call `bridgeOCFToFinancialReports()` per ticker. Log count of tickers updated. Call in migration block after `backfillAllNetProfit()`.

Unit tests required (10 tests, moderate complexity: DB mocking, query validation, type checking). Existing 24-test cashflow suite must pass with zero regressions.

AC-8 is an integration test (verify after startup probe completes).

---

**Task created:** 2026-05-18 | **PM:** Claude (Project Manager) | **Handoff source:** docs/handoffs/1942b-ba-spec.md
