# Handoff — TASK-1942c

**Sprint:** 1942 (BCTC coverage expansion)  
**Cycle:** c180  
**Owner:** dev-mcp-server  
**Zone:** `apps/mcp-server/`  
**Size:** S (~25 min)  
**Priority:** MEDIUM  

---

## Summary

Fix HPG `get_cash_flow()` all-zeros bug by adding fallback keys to Python data-fetch scripts and steel-sector OCR label pattern. Root cause: VCI column name variations by sector + OCR label mismatch. Both independent fixes ship together (no mutual dependency).

**Depends:** TASK-1942b (already Done)  
**Blocks:** none  

**BA spec:** `docs/handoffs/1942c-ba-spec.md` (full diagnostic + requirements)  
**Architect design:** Sections "[Architect] Brownfield Findings — TASK-1942c" in BA spec (verified paths, design decisions, exact change surface)

---

## Acceptance Criteria

| ID | Condition | Verified by |
|-----|-----------|-------------|
| AC-1 | `get_cash_flow("HPG")` returns `found: true` with `operating_cf != null && operating_cf != 0` for latest filed quarter | Manual call + test T1 |
| AC-2 | `get_cash_flow("HPG")` returns `net_income != null && net_income != 0` (ocf_ni_ratio not null-due-to-zero-NI) | Manual call + test T2 |
| AC-3 | `data_source` field is `"financial_reports"` or `"vnstock_direct"` (always present) | Already code-complete (1942b) |
| AC-4 | `ocf_source` is `"api_bridge"` when from `operating_cash_flow`, `"ocr"` when from `operating_cf`, `"vnstock_direct"` when fallback | Already code-complete (1942b) |
| AC-5 | VCB, FPT Q4-2025 ratios unchanged (regression guard) | Existing tests 1941a T3, 1941d T3 must pass |
| AC-6 | If CASH_FLOW_SCRIPT key changed: new key covered by unit test using mock DataFrame with HPG-realistic columns | Test T3–T5 in 1942c test file |
| AC-7 | `operating_cf_bn` in `vnstock_cash_flow` is NULL (not `0.0`) when VCI returns no valid OCF value | DB query check after sync |

---

## Files to modify

### Primary files (2)

#### 1. `apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts`

**Location:** `CASH_FLOW_SCRIPT` Python string (L831–863)

**Current code (L844):**
```python
operating = g('Net cash inflows/outflows from operating activities') / 1e9
```

**New code:**
```python
# Fallback keys: VCI column name varies by sector (banking, steel, tech)
_ocf_keys = [
    'Net cash inflows/outflows from operating activities',
    'Lưu chuyển tiền thuần từ hoạt động kinh doanh',
    'Net Cash From Operating Activities',
]
operating_raw = next((last.get(k) for k in _ocf_keys if last.get(k) not in (None, 0)), None)
operating = float(operating_raw) / 1e9 if operating_raw is not None else None
```

Also update the result dict (L861–862) to emit `None` for `operatingCashFlow` when `operating is None`:
```python
'operatingCashFlow': round(operating, 2) if operating is not None else None,
```

---

**Location:** `FINANCE_SCRIPT` Python string (L378–434)

**Current code (L395):**
```python
net = float(last.get('Attributable to parent company', 0) or 0)
```

**New code:**
```python
_ni_keys = [
    'Attributable to parent company',
    'Net Profit After Tax (Bn. VND)',
    'Lợi nhuận sau thuế',
]
_ni_raw = next((last.get(k) for k in _ni_keys if last.get(k) not in (None, 0)), None)
net = float(_ni_raw) if _ni_raw is not None else 0  # Keep 0 for ratio math; None only when truly absent
```

Also ensure the result dict emits the correct type:
```python
'netProfit': float(_ni_raw) if _ni_raw is not None else None,  # Allow None for genuinely absent NI
```

---

#### 2. `apps/mcp-server/src/domain/services/financial-reports/cashFlowExtractor.ts`

**Location:** OCF pattern definitions (near L118–126, `P_OPERATING_CF` + `P_OPERATING_CF_BANK`)

**Add new pattern for steel/manufacturing sector** (after `P_OPERATING_CF_BANK` definition):
```typescript
// E-2b: steel/manufacturing label variant "sản xuất kinh doanh"
const P_OPERATING_CF_MFG =
  /l[ưu]u\s+chuy[ểe]n\s+ti[ềe]n\s+thu[ầa]n\s+t[ừu]\s+ho[ạa]t\s+[đd][ộo]ng\s+s[ảa]n\s+xu[ấa]t\s+kinh\s+doanh/i;
const F_OPERATING_CF_MFG =
  /luu\s+chuyen\s+tien\s+thuan\s+tu\s+hoat\s+dong\s+san\s+xuat\s+kinh\s+doanh/i;
```

**Location:** `fv()` call for `operatingCF` (L579–582, inside `extractCashFlow()` method)

**Current code:**
```typescript
let operatingCF = fv(
  P_OPERATING_CF, F_OPERATING_CF, "20",
  [P_OPERATING_CF_BANK, F_OPERATING_CF_BANK],
);
```

**New code:**
```typescript
let operatingCF = fv(
  P_OPERATING_CF, F_OPERATING_CF, "20",
  [P_OPERATING_CF_BANK, F_OPERATING_CF_BANK],
  [P_OPERATING_CF_MFG, F_OPERATING_CF_MFG],   // ← add this line
);
```

---

### Secondary file (1 field change)

#### 3. `apps/mcp-server/src/domain/models/vnstockTypes.ts`

**Location:** `VnstockCashFlow` interface

**Current code:**
```typescript
export interface VnstockCashFlow {
  operatingCashFlow: number;  // ← change this line
  investingCashFlow: number;
  financingCashFlow: number;
  // ... other fields
}
```

**New code:**
```typescript
export interface VnstockCashFlow {
  operatingCashFlow: number | null;  // ← allow null when VCI key not found
  investingCashFlow: number;
  financingCashFlow: number;
  // ... other fields
}
```

**Callers:**
- `vnstockStore.storeCashFlow()` (L869): SQLite `?` placeholder accepts `null` natively — no change needed.
- `fetchVnstockSnapshot()`: struct field, no arithmetic — no change needed.
- Type checker will enforce null-checks at call sites — this is correct (honest about missing data).

---

### New test file (1)

#### 4. `apps/mcp-server/src/__tests__/1942c-hpg-cashflow-fix.test.ts`

**Scope:** 6 tests covering Scenario B end-to-end (vnstock data path) and Scenario A OCR label variant. Target ≤200 lines. Follow `1909a-cashflow-extractor-expansion.test.ts` template.

**Test cases:**

| Test ID | Name | Assertion | Scenario |
|---------|------|-----------|----------|
| T1 | Scenario B: non-zero `operating_cf_bn` → tool returns non-zero `operating_cf` | `vcfRow.operating_cf_bn = 3500` (billions) → `buildFallbackResponse()` returns `operating_cf = 3_500_000` (millions) | B (vnstock direct path) |
| T2 | Scenario B: `operating_cf_bn = NULL` in DB → `buildFallbackResponse` returns `operating_cf: null` | Honest missing, not confused with zero | B |
| T3 | Scenario A: OCR text with `"sản xuất kinh doanh"` label → `extractCashFlow()` returns non-zero `operatingCF` | Mock OCR content with steel-sector label + VN line code 20 → regex match + field value extraction | A |
| T4 | Scenario A: existing VCB `"luồng tiền thuần"` still works (regression guard) | `P_OPERATING_CF_BANK` pattern continues matching banking layout | A |
| T5 | Scenario A: existing standard `"hoạt động kinh doanh"` still works (regression guard) | `P_OPERATING_CF` pattern continues matching FPT/tech OCR | A |
| T6 | Edge case EC-1: `operating_cf_bn = 0.0` returns `operating_cf: 0` | Documents that genuine zero (after upstream fix prevents false zeros) is correctly returned as `0`, not `null` | B |

**Fixtures:** Inline mock OCR content + in-memory DB rows (no real PDF files).

---

## Implementation sequence

1. **Developer runs FR-1 diagnostic SQL** (from BA spec L505–532) to gate-check whether HPG has `financial_reports` rows (determines Scenario A vs B for context).

2. **Developer runs Python diagnostic** (FR-3 in BA spec) to confirm actual VCI column names for HPG:
   ```python
   from vnstock import Vnstock
   stock = Vnstock().stock(symbol='HPG', source='VCI')
   df = stock.finance.cash_flow(period='quarter')
   print(df.columns.tolist())
   print(df.iloc[0].to_dict())
   ```
   Confirm fallback keys are appropriate for HPG data.

3. **Update `vnstockBridge.ts`:**
   - Replace `CASH_FLOW_SCRIPT` single-key OCF lookup with multi-key fallback + NULL policy.
   - Replace `FINANCE_SCRIPT` single-key NI lookup with multi-key fallback.
   - Ensure result dicts emit `None` (not `0.0`) when all keys absent.

4. **Update `cashFlowExtractor.ts`:**
   - Add `P_OPERATING_CF_MFG` + `F_OPERATING_CF_MFG` patterns.
   - Wire into `fv()` call for `operatingCF`.

5. **Update `vnstockTypes.ts`:**
   - Change `VnstockCashFlow.operatingCashFlow` to `number | null`.
   - Run tsc to verify no caller breakage.

6. **Write `1942c-hpg-cashflow-fix.test.ts`** (6 tests, ≤200L):
   - T1–T2: Scenario B (vnstock path) — mock vnstock_cash_flow row with non-zero/null values → test `buildFallbackResponse()`.
   - T3–T5: Scenario A (OCR path) — mock OCR content with labels + field extraction → test `extractCashFlow()`.
   - T6: Edge case — genuine zero is correctly returned (documents EC-1).

7. **Run full test suite:**
   ```bash
   npm run test -- src/__tests__/1942c-hpg-cashflow-fix.test.ts
   npm run test -- src/__tests__/1941a-ocf-api-bridge-preference.test.ts (regression)
   npm run test -- src/__tests__/1941d-net-profit-api-bridge.test.ts (regression)
   npm run test -- src/__tests__/1942b-cashflow-fallback-path.test.ts (regression)
   npm run test  # full suite
   ```

8. **Trigger data sync in Docker container:**
   ```bash
   # Inside Docker container or via bun REPL:
   await syncVnstockData(["HPG"]);
   ```
   Verify `vnstock_cash_flow` now has non-zero `operating_cf_bn` for HPG.

9. **If Scenario A applies:** Trigger `bctcReparseJob` for HPG latest quarter to re-extract with new label patterns.

10. **Restart server:**
    ```bash
    docker-compose restart mcp-server
    ```
    `backfillOCFForWatchlist()` (migration block) bridges corrected `operating_cf_bn` into `financial_reports.operating_cash_flow`.

11. **Verify AC-1 and AC-2:**
    ```bash
    mcp_call("get_cash_flow", { "symbol": "HPG" })
    # Expected: operating_cf != null && operating_cf != 0
    #           net_income != null && net_income != 0
    #           data_source ∈ ["financial_reports", "vnstock_direct"]
    ```

---

## Architecture & DDD scope

| Layer | File | Change |
|-------|------|--------|
| Infrastructure (fetcher) | `vnstockBridge.ts` | Python script fallback keys + NULL policy |
| Domain (service) | `cashFlowExtractor.ts` | Add OCF label pattern for steel sector |
| Domain (type) | `vnstockTypes.ts` | `operatingCashFlow: number → number \| null` |
| Interface (tool) | `cashFlowTool.ts` | No change (NULL-check already correct at L277) |
| Infrastructure (DB) | `vnstockStore.ts` | No change (SQLite `?` placeholder handles null) |

**No schema migrations. No new cron jobs. No architectural changes.**

---

## Risk mitigation

| Risk | Mitigation |
|------|-----------|
| `operatingCashFlow` becomes `number \| null` — TypeScript callers may miss null-check | Verify all callers: `storeCashFlow()` (SQLite accepts null), `fetchVnstockSnapshot()` (no arithmetic). Zero breakage expected. tsc enforces null-checks. |
| Python `next()` sentinel: if HPG genuinely had `operatingCF = 0`, all keys return `0.0`, sentinel fires, stores NULL instead of 0 (EC-1 regression) | Acceptable per BA spec: `0.0` from key-miss is indistinguishable from genuine zero at Python level. NULL is honest response. EC-1 edge case documented in test T6. |
| New `P_OPERATING_CF_MFG` regex overlaps with existing patterns if VCB PDF contains phrase in footnote | `fv()` tries patterns in order, returns on first non-zero match (L557). VCB matches `P_OPERATING_CF_BANK` first — no overlap. |
| Docker container must rebuild to pick up Python script changes | Standard rebuild cycle applies via `docker-compose up --build`. |

---

## Success definition

- All 6 tests in `1942c-hpg-cashflow-fix.test.ts` GREEN.
- Regression tests (1941a, 1941d, 1942b) GREEN.
- `get_cash_flow("HPG")` returns non-zero OCF + NI (AC-1 and AC-2).
- `data_source` field present (AC-3).
- `ocf_source` field correct (AC-4).
- tsc clean, no new linting issues.
- Full test suite GREEN (9200+ tests).

---

## Notes for developer

1. **FR-1 diagnostic** (SQL query from BA spec) determines context — both fixes ship regardless because they're independent.

2. **Python fallback logic** is defensive: tries multiple keys in order, stops at first non-zero value, returns `None` when all keys fail or return zero/null. This matches the pattern already used in `BALANCE_SHEET_SCRIPT` L776–782.

3. **NULL policy**: Upstream fix (vnstockBridge.ts) stores `None` → downstream (cashFlowTool.ts L277) already handles `null` via `?:` operator. No downstream change needed.

4. **OCR label pattern** (`P_OPERATING_CF_MFG`) is regex-safe: covers Vietnamese diacritical marks (ư/u, ề/e, ầ/a, etc.) + ASCII-only variant (luu, chuyen, etc.). Pattern is conservative — only matches steel/manufacturing sector label, no overlap with banking/tech.

5. **Test coverage**: T1–T2 for vnstock path (Scenario B), T3–T5 for OCR path (Scenario A), T6 for edge case (genuine zero after fix). Follow `1909a-cashflow-extractor-expansion.test.ts` structure (inline fixtures, no external files).

6. **Regression tests**: Existing 1941a/1941d/1942b test suites must pass unchanged — this task only extends patterns, does not remove them.

---

## Handoff checklist

- [ ] Read BA spec (`docs/handoffs/1942c-ba-spec.md`) fully
- [ ] Run FR-1 diagnostic SQL to determine Scenario A or B
- [ ] Confirm Python column names via diagnostic command
- [ ] Modify `vnstockBridge.ts` (CASH_FLOW_SCRIPT + FINANCE_SCRIPT)
- [ ] Modify `cashFlowExtractor.ts` (add MFG pattern + wire into fv() call)
- [ ] Modify `vnstockTypes.ts` (operatingCashFlow: number | null)
- [ ] Run tsc to verify no type breakage
- [ ] Write `1942c-hpg-cashflow-fix.test.ts` (6 tests)
- [ ] Run new tests + regression suites (all GREEN)
- [ ] Docker container rebuild + sync HPG data
- [ ] Restart server + verify backfill migration
- [ ] Manual call `get_cash_flow("HPG")` → verify AC-1 and AC-2
- [ ] Commit per `docs/policies/commit-convention.md`

---

**Handoff created:** 2026-05-18 c180 PM  
**Status:** READY FOR DEV-MCP-SERVER
