---
task_id: BEQ-4a
task_title: "null-on-PENDING guard in /docs LIST_SQL (stop serving legacy garbage net_profit)"
task_type: FIX
task_size: XS
task_owner: dev-mcp-server
task_zone: apps/mcp-server/
sprint: BCTC-EXTRACT-QUALITY
depends: ["BEQ-1-SPIKE"]
acceptance_criteria:
  - "Guard implemented in handleBctcInspectDocs LIST_SQL to filter PENDING rows from the /docs listing"
  - "PENDING tickers return null for net_profit (not the legacy OCR-parse garbage value)"
  - "Dashboard /docs tab shows null/dash instead of garbage values (CTG=5, EIB=1, VNM=5.1e-05, DIG=18)"
  - "Two-line change, fully separable from BEQ-2 refine trigger"
success_proof:
  - "Query /api/bctc-inspect/docs → response shows CTG, VNM, DIG with net_profit=null instead of garbage scalar"
  - "Integration test: direct in-container bun:sqlite read proves the SQL WHERE clause filters PENDING, not HTTP echo"
  - "No regression: tickers already DONE (FPT, ACB) still show correct refined net_profit values"

---

## Task Context

**Root cause:** The `/docs` listing handler (`bctcInspectHandler.ts:handleBctcInspectDocs`, lines 162–245) reads `net_profit` directly from `financial_reports` with no `refine_status` filter. For PENDING tickers, `net_profit` was written by `parseBctcReport/storeReport` via the legacy regex-based `extractIncomeStatement`, which produces broken values when:

- OCR confidence is low (CTG=0.0625, BSR=0.125)
- The PDF format is unrecognized
- A unit-scale mismatch occurred

**Evidence from brief:**
```
CTG 2026-Q1:  refine_status=PENDING, extraction_method=pdf-parse, net_profit=5
EIB 2026-Q1:  refine_status=PENDING, extraction_method=pdf-parse, net_profit=1
VNM 2025-Q4:  refine_status=PENDING, extraction_method=pdf-parse, net_profit=0.000051
DIG 2025-Q4:  refine_status=PENDING, extraction_method=pdf-parse, net_profit=18
```

These garbage values are displayed in the /docs dashboard listing, confusing the analyst.

---

## Code Location

**File:** `apps/mcp-server/src/interface/mcp/handlers/bctc-inspect/bctcInspectHandler.ts`
**Function:** `handleBctcInspectDocs` (lines 162–245)
**Query:** `LIST_SQL` (lines 119–131)

**Change:**

Current query (line 119):
```sql
SELECT ... net_profit ... FROM financial_reports
WHERE action_code NOT LIKE '%example%' ...
```

**ADD filter:**
```sql
SELECT ... net_profit ... FROM financial_reports
WHERE action_code NOT LIKE '%example%'
  AND refine_status IN ('DONE', 'PARTIAL')
```

Alternative (if NULL semantics preferred):
```sql
SELECT ... 
  CASE 
    WHEN refine_status = 'PENDING' THEN NULL 
    ELSE net_profit 
  END AS net_profit 
FROM financial_reports
WHERE action_code NOT LIKE '%example%' ...
```

**Why XS scope:**
- Single-line SQL condition in WHERE clause
- No schema change, no new columns
- Orthogonal to BEQ-2 (refine trigger) and BEQ-3 (column mapping)

---

## Testing & Verification

### DV-1: Smoke test with CTG, VNM, DIG (live test ticket)
1. Query `/api/bctc-inspect/docs` or call the handler
2. **Before fix:** Response includes CTG net_profit=5, VNM=5.1e-05, DIG=18
3. **After fix:** Same tickers show net_profit=null or omitted
4. **Verify via direct DB query:** 
   ```sql
   SELECT code, sort_key, refine_status, net_profit 
   FROM financial_reports 
   WHERE code IN ('CTG', 'VNM', 'DIG') AND refine_status = 'PENDING'
   ```
   — Confirm query returns rows; handler must filter these out

### DV-2: Integration proof (NO HTTP echo)
- Connect to running mcp-server: `docker exec -it mcp-server /bin/bash`
- Direct DB query: `bun scripts/inspect-db.ts --query "SELECT COUNT(*) FROM financial_reports WHERE refine_status='PENDING'"`
- Confirm PENDING count > 0; then verify handler response does NOT include those rows' net_profit values

### Anti-false-green (unit test)
- Mock a financial_reports row with `refine_status='PENDING'` and `net_profit=999.99`
- Call `handleBctcInspectDocs` 
- Assert response either omits that row or shows `net_profit=null`
- Verify no HTTP 200-OK claiming the value is served

---

## WIP & Serialization

**Zone:** apps/mcp-server (single git tree)
**Serialization:** Orthogonal to BEQ-4b (different file, same handler module). Can ship before or after BEQ-4b, or in parallel if commits are separate.

**No parallel risk:** This task touches only the LIST_SQL in bctcInspectHandler.ts; no shared mutation with BEQ-2 or BEQ-3

---

## DoD Checklist

- [ ] SQL WHERE clause updated (PENDING rows filtered, or CASE expression added for NULL)
- [ ] mcp-server rebuilt + container running
- [ ] DV-1 smoke test (CTG, VNM, DIG tested live, null or filtered as expected)
- [ ] DV-2 integration proof (direct DB query confirms PENDING rows exist; handler output verified to exclude them)
- [ ] Unit test added (mocked PENDING row → null/omitted proven)
- [ ] No regression: DONE tickers (FPT, ACB) still show correct net_profit
- [ ] Commit message references architect brief 2026-06-02-bctc-extract-quality.md § Symptom C
- [ ] orch-state.json task marked DONE with commit SHA

---

## Related Artifacts

- **Architect Brief:** docs/architecture-briefs/2026-06-02-bctc-extract-quality.md § FIX-3 (covers both BEQ-4a and BEQ-4b)
- **Sprint:** BCTC-EXTRACT-QUALITY
- **Blocks:** Nothing (independent guard)
- **Blocked by:** BEQ-1-SPIKE (analysis complete)
