---
task_id: BEQ-3
task_title: "ScalarAggregate column-audit 10 to ~20 (op_profit/ebitda/cash/eps/CF unprojected)"
task_type: SPRINT-S
task_size: M
task_owner: dev-mcp-server
task_zone: apps/mcp-server/
sprint: BCTC-EXTRACT-QUALITY
depends: ["BEQ-1-SPIKE", "BEQ-2"]
acceptance_criteria:
  - "Full column audit: enumerate all ~20 financial_reports columns that parseBctcReport/storeReport writes"
  - "Map each column to a BCTC VAS code/label source or document why it is unmapped"
  - "Add missing scalar fields to ScalarAggregate domain class: operating_profit, ebitda, cash, eps, diluted_eps, operating_cf, investing_cf, financing_cf, capex, free_cash_flow"
  - "Update finalizeBctcRefineTool to SET all new columns (not just the original 10)"
  - "Recurring-bug flag satisfied: full column audit prevents future one-at-a-time point patches on bctcScalarAggregator.ts"
  - "Balance identity verified: sum(refined scalars) still reconciles with the original financial_reports totals (anti-corruption gate)"
success_proof:
  - "Unit test: mock a bctc_table_rows set with operating_profit code 30, ebitda proxy, cash code 110, eps footnote, cash flows 20/30/40 — refine aggregator maps all → new ScalarAggregate fields are populated"
  - "Integration test: direct in-container bun:sqlite read post-BEQ-2 backfill shows FPT 2026-Q1 operating_profit, ebitda, cash, eps NOT zero (not HTTP echo)"
  - "Regression test: FPT/ACB balance_identity still passes; net_profit + ebitda + taxes still reconcile (or document delta)"

---

## Task Context

**Root cause (Symptom B):** `bctcScalarAggregator.ts` defines `ScalarAggregate` with exactly 10 fields:
```
net_revenue, gross_profit, profit_before_tax, net_profit,
total_assets, current_assets, total_liabilities, equity_total,
gross_margin_pct, net_margin_pct
```

The remaining ~10 columns (`operating_profit`, `ebitda`, `cash`, `eps`, `diluted_eps`, `operating_cf`, `investing_cf`, `financing_cf`, `capex`, `free_cash_flow`) are **absent from ScalarAggregate**. `finalizeBctcRefineTool.ts` only issues SET clauses for the 10 resolved scalars. The remaining columns retain the legacy OCR-parse placeholder values (0 or wrong values) forever.

**Evidence from brief:**
```
FPT 2026-Q1 (refine_status=DONE, 145 table_rows):
  financial_reports:
    operating_profit=0 (but code 30 in bctc_table_rows shows 2,747,763,827,050)
    ebitda=0
    cash=0.000001
    eps=1 (wrong OCR placeholder)
```

**Recurring-bug flag:** `bctcScalarAggregator.ts` has ≥5 fix commits in the past 3 weeks. Per the recurring-bug-escalation policy (≥2 fix commits on same module), **this task MUST be a full column audit**, not another incremental patch.

---

## Code Locations

### 1. Domain Layer: ScalarAggregate Definition
**File:** `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts`

**Current definition (lines 76–87):**
```typescript
export interface ScalarAggregate {
  net_revenue: number;
  gross_profit: number;
  profit_before_tax: number;
  net_profit: number;
  total_assets: number;
  current_assets: number;
  total_liabilities: number;
  equity_total: number;
  gross_margin_pct: number;
  net_margin_pct: number;
}
```

**ADD these fields:**
```typescript
operating_profit: number;        // BCTC code 30: "Lợi nhuận thuần từ hoạt động kinh doanh"
ebitda: number;                   // Derived: operating_profit + depreciation_amortization (from CF)
cash: number;                      // BCTC code 110: "Tiền và các khoản tương đương tiền" (balance sheet)
eps: number;                       // EPS = net_profit / shares_outstanding (if stored) or BCTC footnote
diluted_eps: number;              // Similar to EPS
operating_cf: number;              // Cash flow code 20: "Lưu lượng tiền từ hoạt động kinh doanh"
investing_cf: number;              // Cash flow code 30: "Lưu lượng tiền từ hoạt động đầu tư"
financing_cf: number;              // Cash flow code 40: "Lưu lượng tiền từ hoạt động tài chính"
capex: number;                     // Capital expenditure (derived from CF or asset change)
free_cash_flow: number;            // = operating_cf - capex
```

### 2. Aggregator Logic: bctcScalarAggregator.ts
**Function:** AggregateScalarsFromTableRows (or equivalent)

**Audit & Add Mappings:**
For each new field in ScalarAggregate, map it to a `bctc_table_rows.code` and/or label pattern:

| ScalarAggregate Field | BCTC Code | Label Pattern | Source |
|---|---|---|---|
| operating_profit | 30 | "Lợi nhuận thuần từ hoạt động kinh doanh" | income_statement section |
| ebitda | (derived) | N/A | = operating_profit + depreciation_amortization (requires CF row code) |
| cash | 110 | "Tiền và các khoản tương đương tiền" | balance_sheet section |
| eps | (footnote) | Pattern: "EPS" or "Lợi nhuận trên mỗi cổ phiếu" | income_statement footnote or calculated |
| diluted_eps | (footnote) | Pattern: "Diluted EPS" or similar | income_statement |
| operating_cf | 20 | "Lưu lượng tiền từ hoạt động kinh doanh" | cash_flow section |
| investing_cf | 30 | "Lưu lượng tiền từ hoạt động đầu tư" | cash_flow section |
| financing_cf | 40 | "Lưu lượng tiền từ hoạt động tài chính" | cash_flow section |
| capex | (derived) | "Chi tiêu vốn" or asset-change delta | capex line or CapEx from CF |
| free_cash_flow | (derived) | N/A | = operating_cf - capex |

**Audit step:** For each field, trace the code path:
1. Does the BCTC code exist in `parseBctcReport`'s regex extractors?
2. Is the code already being extracted into `bctc_table_rows`?
3. If yes, add the mapping to `AggregateScalarsFromTableRows` (language: iterate bctc_table_rows, filter by code, sum/take value_current)

### 3. Finalization: finalizeBctcRefineTool.ts
**File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`

**Current logic (lines 446–456):** Only sets the 10 original fields:
```typescript
const updates = {
  net_revenue: finalScalars.net_revenue,
  gross_profit: finalScalars.gross_profit,
  ...
  net_margin_pct: finalScalars.net_margin_pct,
};

await db.exec(`UPDATE financial_reports SET ${setClause} WHERE ...`);
```

**ADD:** SET clauses for all 10 new fields:
```typescript
const updates = {
  // Original 10:
  net_revenue: finalScalars.net_revenue,
  ...
  // NEW 10:
  operating_profit: finalScalars.operating_profit,
  ebitda: finalScalars.ebitda,
  cash: finalScalars.cash,
  eps: finalScalars.eps,
  diluted_eps: finalScalars.diluted_eps,
  operating_cf: finalScalars.operating_cf,
  investing_cf: finalScalars.investing_cf,
  financing_cf: finalScalars.financing_cf,
  capex: finalScalars.capex,
  free_cash_flow: finalScalars.free_cash_flow,
};
```

---

## Audit Workflow

### Step 1: Column Inventory (PLAN-ONLY, document findings)
1. Open `apps/mcp-server/src/domain/services/financial-reports/parseBctcReport.ts`
2. Find function `storeReport` (writes initial values to financial_reports table)
3. List every column that is written via `db.run()` or prepared statement
4. Cross-reference with the financial_reports schema (via `describe financial_reports` or schema SQL file)
5. **Document:** Column list with their regex extractor functions (e.g., `extractIncomeStatement`, `extractBalanceSheet`, `extractCashFlow`)

### Step 2: BCTC Code Mapping (PLAN-ONLY, document findings)
For each column, determine its BCTC code source:
- **Income statement codes (100-series):** Revenue (10), COGS (15), Operating profit (30), EBIT (20), Profit before tax (35), Tax (38), Net profit (40), EPS (400–409)
- **Balance sheet codes (unit 100):** Assets (A-total, 100), Current assets (110), Cash (111), AR (112), Inventory (115), Fixed assets (200), Liabilities (L-total, 300), Equity (E-total, 500)
- **Cash flow codes:** Operating (20), Investing (30), Financing (40), FX effects (50)
- **Not mappable:** Derived metrics (gross_margin %, ebitda, free_cash_flow)

### Step 3: Mapping Definition (PLAN-ONLY, document findings)
Create a mapping table (in commit message or code comment):
```
Column              | BCTC Code | Extractor          | Status
net_revenue         | 10        | extractIncomeStmt  | DONE (current)
gross_profit        | 15        | extractIncomeStmt  | DONE
operating_profit    | 30        | extractIncomeStmt  | TODO — add to bctcScalarAggregator
cash                | 110       | extractBalanceStmt | TODO — add to bctcScalarAggregator
operating_cf        | 20        | extractCashFlow    | TODO — add
...
```

### Step 4: Implementation
Update the three files in the Code Locations section above with the full mapping.

### Step 5: Balance Identity Verification
The refine pipeline should NOT corrupt the fundamental balance identity: `Assets = Liabilities + Equity`. After mapping the new scalars, verify that this identity still holds for a sample ticker (FPT, ACB):
```
FPT 2026-Q1: total_assets = 12,345,678,900 (from balance sheet code 100)
FPT 2026-Q1: total_liabilities = 6,789,012,345 (from code 300)
FPT 2026-Q1: equity_total = 5,555,666,555 (from code 500)
Identity check: total_liabilities + equity_total ≈ total_assets (allow <1% rounding)
```

If identity fails, it indicates a parsing bug in the new mappings or a data-quality issue in the BCTC source.

---

## Testing & Verification

### DV-1: Unit test — aggregator maps all new fields
```typescript
// Mock bctc_table_rows with codes 30 (operating_profit), 110 (cash), 20 (operating_cf), etc.
const mockRows = [
  { code: 10, value_current: 1000, ... },  // revenue
  { code: 30, value_current: 500, ... },   // operating_profit
  { code: 110, value_current: 200, ... },  // cash
  { code: 20, value_current: 300, ... },   // operating_cf
  ...
];

// Call AggregateScalarsFromTableRows(mockRows)
const result = AggregateScalarsFromTableRows(mockRows);

// Assert all new fields are populated
assert(result.operating_profit === 500);
assert(result.cash === 200);
assert(result.operating_cf === 300);
assert(result.ebitda > 0);  // derived
assert(result.free_cash_flow > 0);  // derived
```

### DV-2: Integration test — post-BEQ-2 backfill, new fields are non-zero
After BEQ-2 refine backfill completes:
1. Connect to mcp-server: `docker exec -it mcp-server /bin/bash`
2. Query: 
   ```sql
   SELECT code, sort_key, operating_profit, ebitda, cash, eps, operating_cf, investing_cf, financing_cf, capex, free_cash_flow 
   FROM financial_reports 
   WHERE code='FPT' AND refine_status='DONE' 
   ORDER BY sort_key DESC 
   LIMIT 1
   ```
3. **Expected:** All new columns are non-zero (or NULL only if code/label not found in table_rows)
4. **NOT expected:** All zero (that would indicate the mapping did not work)

### DV-3: Balance identity test
```sql
-- For a sample DONE ticker
SELECT code, sort_key, 
       total_assets, total_liabilities, equity_total,
       (total_liabilities + equity_total) AS liab_plus_equity
FROM financial_reports
WHERE code='FPT' AND refine_status='DONE' AND sort_key=(SELECT MAX(sort_key) FROM financial_reports WHERE code='FPT' AND refine_status='DONE')
```
**Expected:** `total_assets` ≈ `liab_plus_equity` (within 1% rounding tolerance)

### Anti-false-green (regression test)
- Verify that the original 10 fields (net_revenue, gross_profit, etc.) are STILL correctly populated after the change
- FPT 2026-Q1 net_profit should NOT change (it's already correct from the original 10-field mapping)

---

## Serialization

**Zone:** apps/mcp-server (single git tree)
**Dependencies:**
- Must complete AFTER BEQ-2 (refine backfill) — so that new field mappings can be tested against actual refined data
- Can run in parallel with BEQ-4a/4b (different files, no mutation conflict)

**Blocking relationship:**
- Unblocks downstream code that needs operating_profit, ebitda, etc. (e.g., analyst tools, ratios)

---

## DoD Checklist

- [ ] Column inventory completed (parseBctcReport audit: all columns listed)
- [ ] BCTC code mapping documented (100/200/300 series codes identified for each column)
- [ ] ScalarAggregate interface extended (10 new fields added with proper types)
- [ ] bctcScalarAggregator mapping logic implemented (all 10 new fields mapped from bctc_table_rows codes)
- [ ] finalizeBctcRefineTool updated (all 10 new fields SET in DB update statement)
- [ ] DV-1 unit test added (mock rows with new codes → aggregator populates all fields)
- [ ] DV-2 integration test run (post-BEQ-2, new fields non-zero, not HTTP echo)
- [ ] DV-3 balance identity verified (total_assets = liabilities + equity, within 1%)
- [ ] Regression test passed (original 10 fields still correct, FPT/ACB net_profit unchanged)
- [ ] mcp-server rebuilt + tests green
- [ ] Commit message references architect brief 2026-06-02-bctc-extract-quality.md § FIX-2
- [ ] Commit message documents BCTC code mappings (or includes link to mapping table in code)
- [ ] Commit message notes recurring-bug escalation closure (full audit prevents future point patches)
- [ ] orch-state.json task marked DONE with commit SHA

---

## Related Artifacts

- **Architect Brief:** docs/architecture-briefs/2026-06-02-bctc-extract-quality.md § FIX-2 + recurring-bug escalation note
- **Codebase context:** docs/references/tree-map.md (domain layer structure)
- **Sprint:** BCTC-EXTRACT-QUALITY
- **Blocks:** Nothing (enables downstream usage of new fields)
- **Blocked by:** BEQ-1-SPIKE (analysis), BEQ-2 (refine backfill must complete to populate test data)

---

## Implementation Notes

### Derived Field Calculation Rules
- **EBITDA:** operating_profit + depreciation_amortization (usually found in cash flow statement as a reconciliation line)
- **Free Cash Flow:** operating_cf - capex (capex from balance sheet fixed asset delta or cash flow line)
- **EPS:** net_profit / shares_outstanding (if shares are stored; otherwise try to extract from BCTC footnote labels with pattern "Lợi nhuận trên mỗi cổ phiếu")

### Edge Cases
- **Missing codes:** If a code (e.g., 30) is not present in bctc_table_rows for a particular ticker, the mapped field should be 0 or NULL (document the choice in code comment)
- **Multiple matches:** If a label matches multiple rows (e.g., two "Tiền" entries), sum them or document the disambiguation rule
- **Unit mismatch:** If a code's value_current is in different units (VND vs millions), the original OCR-parse bug (symptom D) may recur — ensure unit normalization is applied consistently

