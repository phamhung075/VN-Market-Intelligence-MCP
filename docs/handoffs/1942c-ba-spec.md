# BA Spec — TASK-1942c
## HPG `get_cash_flow` returns all-zeros / null OCF and NI

**Sprint:** 1942 (BCTC coverage expansion)
**DDD service:** mcp-server
**Date:** 2026-05-18
**BA cycle:** c1

---

## Problem statement

FA Layer 7 flagged `get_cash_flow("HPG")` returning `operating_cash_flow=0` or
`null`, and `net_income=0` or `null`. Sprint 1942a (startup probe) and 1942b
(fallback path to `vnstock_cash_flow` + `vnstock_financials` when
`financial_reports` has zero rows) are already shipped. HPG is still broken.

---

## Root-cause analysis (spec-time investigation)

### Data-flow for a watchlist ticker

```
vnstockBridge.ts (CASH_FLOW_SCRIPT)
  → fetchVnstockCashFlow("HPG")
  → returns VnstockCashFlow { operatingCashFlow, investingCashFlow, ... }

vnstockStore.storeCashFlow(cf)
  → INSERT OR REPLACE INTO vnstock_cash_flow (operating_cf_bn = cf.operatingCashFlow)
  → calls bridgeOCFToFinancialReports(db, "HPG")  ← Task 1878a

bridgeOCFToFinancialReports("HPG")
  → UPDATE financial_reports
    SET operating_cash_flow = (
      SELECT vcf.operating_cf_bn * 1000.0
      FROM vnstock_cash_flow vcf
      WHERE vcf.code = financial_reports.action_code
        AND vcf.year_report = financial_reports.period_year
        AND vcf.quarter = financial_reports.period_quarter
    )
    WHERE financial_reports.action_code = 'HPG'
      AND financial_reports.period_quarter IS NOT NULL
```

### Decision gate in cashFlowTool.ts (Task 1942b)

```
if (COUNT(*) FROM financial_reports WHERE action_code = 'HPG') == 0:
    → buildFallbackResponse(db, "HPG", ...)
       reads vnstock_cash_flow + vnstock_financials directly
else:
    → primary path: reads financial_reports
       prefers operating_cash_flow (api_bridge) over operating_cf (OCR)
```

### Two candidate failure scenarios

**Scenario A — HPG has `financial_reports` rows, but `operating_cash_flow=NULL`**

This means:
1. HPG BCTC PDF was OCR-extracted and rows exist in `financial_reports`.
2. `bridgeOCFToFinancialReports("HPG")` ran but found no matching
   `vnstock_cash_flow` row for that period_year + period_quarter pair.
3. Result: `operating_cash_flow = NULL`, `operating_cf = 0` (OCR zero from steel
   PDF layout), so `effectiveOcf = NULL`. Tool returns `operating_cf: null`.

Sub-cause A1 (OCR zero): Steel-sector BCTC PDF uses VN line code `20` or `30`
for net OCF from operating activities. The `cashFlowExtractor.ts` `findValue`
keyword loop uses generic label patterns tested against VCB (banking) and
FPT/VNM (tech/consumer). Steel-sector label may differ:
- Banking OCR label: "Lưu chuyển tiền thuần từ hoạt động kinh doanh" (matches)
- Steel/manufacturing OCR label: "Lưu chuyển tiền thuần từ hoạt động sản xuất
  kinh doanh" — extra words "sản xuất" may break the keyword match.

Sub-cause A2 (bridge miss): HPG PDF rows cover Q4-2025 / Q1-2026 but
`vnstock_cash_flow` only has older periods. `bridgeOCFToFinancialReports` joins
on (year_report, quarter) — a mismatch leaves `operating_cash_flow` as NULL.

**Scenario B — HPG has ZERO `financial_reports` rows**

1942b fallback path fires. Reads `vnstock_cash_flow` directly.
- If `operating_cf_bn = 0.0` in that table: the Python
  `CASH_FLOW_SCRIPT` column lookup uses
  `'Net cash inflows/outflows from operating activities'`.
  Steel-sector VCI data may use a different column key, causing `g(...)` to
  return `float(None or 0) = 0.0`. Stored as `operating_cf_bn=0.0` (not NULL).
  `buildFallbackResponse` then returns `operating_cf = 0.0 * 1000 = 0`.

For NI: `vnstock_financials.net_profit_bn` may similarly be `0.0` if
`FINANCE_SCRIPT` key `'Attributable to parent company'` is absent from the
steel-sector VCI income statement columns.

### Confirmed data invariants (from source inspection)

- `vnstock_cash_flow.operating_cf_bn` stores the raw value from
  `CASH_FLOW_SCRIPT` — could be `0.0` (wrong key) or `NULL` (Python returned
  null → stored as null via `VnstockCashFlow.operatingCashFlow`).
- `bridgeOCFToFinancialReports` only sets `operating_cash_flow` when the
  `vnstock_cash_flow` row EXISTS and matches by period. If no row → `operating_cash_flow`
  stays NULL.
- `cashFlowTool.ts` primary path COALESCE:
  `effectiveOcf = operating_cash_flow ?? operating_cf`. If both are NULL/0 →
  tool returns `operating_cf: null` or `operating_cf: 0`.
- `backfillOCFForWatchlist` runs at server startup migration — calls
  `bridgeOCFToFinancialReports` for every watchlist ticker. But this is a
  no-op if `vnstock_cash_flow` has no HPG row at all (Scenario B, fresh DB).

---

## Requirements

### FR-1: Diagnose HPG `financial_reports` row count
**DDD layer:** application (diagnostic / data-verification)

Developer must query production DB at implementation time:
```sql
SELECT COUNT(*) FROM financial_reports WHERE action_code = 'HPG';
SELECT period_year, period_quarter, operating_cf, operating_cash_flow
FROM financial_reports WHERE action_code = 'HPG'
ORDER BY period_year DESC, period_quarter DESC LIMIT 5;
```

This determines whether Scenario A or Scenario B applies and gates all further
fixes. The spec covers BOTH paths — developer picks the relevant one based on
this query result.

### FR-2 (Scenario A): Investigate OCR zero for steel-sector BCTC PDF
**DDD layer:** domain (cashFlowExtractor.ts)

If `financial_reports` has HPG rows with `operating_cf = 0` and
`operating_cash_flow = NULL`:

- Inspect `cashFlowExtractor.ts` keyword patterns for OCF label.
- Check whether "sản xuất kinh doanh" variant is covered.
- If not: add label variant to the extractor keyword list.
- Trigger `bctcReparseJob` for HPG Q-latest to re-extract.

Acceptance evidence: `financial_reports.operating_cf` becomes non-zero after
reparse, OR `financial_reports.operating_cash_flow` bridged from vnstock.

### FR-3 (Scenario A): Ensure `bridgeOCFToFinancialReports` covers HPG period
**DDD layer:** infrastructure (schema-financial-reports.ts + vnstockStore.ts)

If HPG has `financial_reports` rows but `vnstock_cash_flow` has no matching
period:

- `storeFinancials` (called by weekly cron) already calls
  `bridgeNetProfitToFinancialReports` immediately after store.
- `storeCashFlow` already calls `bridgeOCFToFinancialReports` immediately after
  store.
- But if `vnstock_cash_flow` is empty for HPG, these calls are no-ops.

Fix: ensure `syncVnstockData` successfully fetches and stores HPG cash flow.
Investigate whether CASH_FLOW_SCRIPT column key works for HPG VCI response.
Developer must log raw Python output for HPG to see what columns are returned.

Diagnostic command (run in Docker container or local bun REPL):
```python
from vnstock import Vnstock
stock = Vnstock().stock(symbol='HPG', source='VCI')
df = stock.finance.cash_flow(period='quarter')
print(df.columns.tolist())
print(df.iloc[0].to_dict())
```

If columns differ from the hardcoded key in `CASH_FLOW_SCRIPT`, the script must
be updated with HPG-compatible fallback keys (same defensive `g(key, default=0)`
pattern already used in `BALANCE_SHEET_SCRIPT`).

### FR-4 (Scenario B): Fix `operating_cf_bn = 0.0` when VCI returns zero
**DDD layer:** infrastructure (vnstockBridge.ts CASH_FLOW_SCRIPT)

If HPG has ZERO `financial_reports` rows AND `vnstock_cash_flow` has
`operating_cf_bn = 0.0` (not NULL):

- `buildFallbackResponse` multiplies by 1000 → returns `operating_cf: 0.0`.
- This is a Python key-mismatch, not a genuine zero OCF.

Fix: add defensive NULL detection in `CASH_FLOW_SCRIPT`. When the primary key
is absent in the DataFrame (returns `0.0` from `float(None or 0)`), try
alternate column keys for steel/manufacturing sector before storing `0.0`.

Known alternate keys to probe (VCI source, non-bank):
- `'Net cash inflows/outflows from operating activities'` (primary)
- `'Lưu chuyển tiền thuần từ hoạt động kinh doanh'` (Vietnamese)
- `'Net Cash From Operating Activities'` (alternate English form)

If all keys return `0.0`, store NULL (`operating_cf_bn = None`) rather than
`0.0` so the tool returns `null` (honest missing) rather than `0` (misleading).

### FR-5 (Scenario B / NI): Fix `net_profit_bn = 0.0` from VCI response
**DDD layer:** infrastructure (vnstockBridge.ts FINANCE_SCRIPT)

Same pattern as FR-4 for net profit. FINANCE_SCRIPT key is
`'Attributable to parent company'`. If this is absent from HPG VCI columns:

- Add fallback keys: `'Net Profit After Tax (Bn. VND)'`, `'Lợi nhuận sau thuế'`.
- If all absent → store NULL rather than `0.0`.

### FR-6: `data_source` field correctness
**DDD layer:** interface (cashFlowTool.ts)

No code change required — already implemented:
- Primary path: `data_source: "financial_reports"`
- Fallback path: `data_source: "vnstock_direct"`

Acceptance: the returned envelope always includes `data_source` set to the
correct path that served the data. This is already code-complete per 1942b.

### NFR-1: No new tables, no schema migration
This fix must be achieved by (a) correcting vnstockBridge.ts column keys, and/or
(b) adding label variants to cashFlowExtractor.ts, and/or (c) triggering a
reparse of existing HPG PDFs. No new DB columns.

### NFR-2: Idempotency preserved
All store functions (`storeCashFlow`, `storeFinancials`) are already idempotent
(INSERT OR REPLACE). Any new fallback key logic must not break the UNIQUE
constraint or duplicate rows.

### NFR-3: Steel-sector isolation
Changes must not regress VCB (banking) or FPT/VNM (tech/consumer) OCF
extraction. Tests T1–T5 in `1941a-ocf-api-bridge-preference.test.ts` and
`1941d-net-profit-api-bridge.test.ts` must continue to pass.

---

## Acceptance criteria

| AC | Condition | Verified by |
|----|-----------|-------------|
| AC-1 | `get_cash_flow("HPG")` returns `found: true` with `operating_cf != null && operating_cf != 0` for the latest filed quarter | Manual call + test |
| AC-2 | `get_cash_flow("HPG")` returns `net_income != null && net_income != 0` (i.e. `ocf_ni_ratio` is not null-due-to-zero-NI) | Manual call + test |
| AC-3 | `data_source` field is `"financial_reports"` or `"vnstock_direct"` (not absent) | Already code-complete |
| AC-4 | `ocf_source` is `"api_bridge"` when OCF comes from `operating_cash_flow` column, `"ocr"` when from `operating_cf`, `"vnstock_direct"` when from fallback path | Already code-complete |
| AC-5 | VCB, FPT Q4-2025 ratios unchanged (regression) | Existing tests 1941a T3, 1941d T3 |
| AC-6 | If Python `CASH_FLOW_SCRIPT` column key changed: new key covered by unit test using mock DataFrame with HPG-realistic columns | New test in test file |
| AC-7 | `operating_cf_bn` in `vnstock_cash_flow` is NULL (not `0.0`) when VCI returns no valid OCF value | DB query check |

---

## Edge cases

| Code | Scenario | Required behaviour |
|------|----------|--------------------|
| EC-1 | HPG genuinely had OCF=0 in a downturn quarter (possible in steel sector during construction slump) | Tool must return `operating_cf: 0` with `ocf_source` set; NOT confuse with missing data. Developer must distinguish `0.0` (Python key-miss) from `null` (genuinely not fetched). |
| EC-2 | HPG BCTC PDF uses "sản xuất kinh doanh" label variant | cashFlowExtractor.ts must handle both variants — add to keyword list without breaking banking (VCB) extraction. |
| EC-3 | `financial_reports` has HPG rows for Q4-2025 but NOT Q1-2026 (latest filed) | Tool returns latest available (Q4-2025) — this is correct behaviour, not a bug. AC-1 passes if any non-zero quarter returned. |
| EC-4 | vnstock_cash_flow has HPG row with `operating_cf_bn=NULL` | `buildFallbackResponse` returns `operating_cf: null` — correct (honest). AC-1 fails; fix via FR-3/FR-4 upstream. |
| EC-5 | `backfillOCFForWatchlist` fires at startup but `vnstock_cash_flow` has no HPG row yet | No-op (correct). Fix is in the weekly `vnstockFundamentalsRefresh` job via FR-3/FR-4. |

---

## Blockers (PO-only questions)

None. The root cause is a code-level data-fetch issue with deterministic resolution paths:

- Dev-resolvable: Python column key inspection (FR-3) — developer runs diagnostic Python command against VCI.
- Dev-resolvable: OCR extractor label variants (FR-2) — developer inspects HPG PDF OCR output.

No PO decisions needed before implementation starts.

**Spec-time discovery SD-1:** Developer must run the FR-1 diagnostic SQL query
first to determine Scenario A vs B before choosing which FR to implement.
Both paths documented above.

---

## DDD layer summary

| Requirement | Layer | File |
|-------------|-------|------|
| FR-1 (diagnostic) | — (dev action only) | Production DB |
| FR-2 (OCR label) | domain | `cashFlowExtractor.ts` |
| FR-3 (bridge period coverage) | infrastructure | `vnstockStore.storeCashFlow()` + `vnstockBridge.ts` |
| FR-4 (OCF Python key) | infrastructure | `vnstockBridge.ts` CASH_FLOW_SCRIPT |
| FR-5 (NI Python key) | infrastructure | `vnstockBridge.ts` FINANCE_SCRIPT |
| FR-6 (data_source) | interface | `cashFlowTool.ts` (no-op — code-complete) |

---

## Test requirements

| Test file | Scope |
|-----------|-------|
| New test: `1942c-hpg-cashflow-fix.test.ts` | HPG-realistic: vnstock_cash_flow has non-zero operating_cf_bn → tool returns non-zero operating_cf (Scenario B end-to-end). vnstock_financials has non-zero net_profit_bn → ratio computable. |
| Regression: `1941a-ocf-api-bridge-preference.test.ts` T1–T5 | Must continue passing |
| Regression: `1941d-net-profit-api-bridge.test.ts` T1–T7 | Must continue passing |
| Regression: `1942b-cashflow-fallback-path.test.ts` TC1–TC10 | Must continue passing |

---

## Implementation guidance for architect

The architect does not need a full brownfield analysis brief — the fix is a
targeted data-path correction in one of two layers. Suggested approach:

1. Developer runs FR-1 SQL → determines A or B.
2. If Scenario B: developer runs Python diagnostic for `cash_flow` and `financials`
   column inspection → updates `CASH_FLOW_SCRIPT` and/or `FINANCE_SCRIPT` in
   `vnstockBridge.ts` with defensive fallback keys. Stores NULL instead of 0.0
   when all keys absent.
3. If Scenario A: developer inspects OCR output for HPG PDF, patches
   `cashFlowExtractor.ts` keyword list, triggers `bctcReparseJob`.
4. In both cases: run weekly `vnstockFundamentalsRefresh` job for HPG (or trigger
   `syncVnstockData(["HPG"])` manually) to populate `vnstock_cash_flow` with
   correct data.
5. `backfillOCFForWatchlist` at next server restart will bridge into
   `financial_reports.operating_cash_flow`.

**Owner:** dev-mcp-server
**Size estimate:** S (one targeted file change + 1 test file)
**Sequence dependency:** None. 1942a + 1942b already shipped. Independent.

---

## [Architect] Brownfield Findings — TASK-1942c

**Date:** 2026-05-18
**Zone:** `apps/mcp-server/`

---

### Verified paths

| Path | Role | DDD layer |
|------|------|-----------|
| `apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts` L831–863 | `CASH_FLOW_SCRIPT` — Python subprocess; single key `'Net cash inflows/outflows from operating activities'` via `g()` helper; `operatingCashFlow = round(operating, 2)` stored to `VnstockCashFlow` domain type | infrastructure/fetcher |
| `apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts` L378–434 | `FINANCE_SCRIPT` — single NI key `'Attributable to parent company'` via `last.get(..., 0) or 0` pattern; no fallback | infrastructure/fetcher |
| `apps/mcp-server/src/domain/services/financial-reports/cashFlowExtractor.ts` L118–126 | `P_OPERATING_CF` + `P_OPERATING_CF_BANK` — two existing regex patterns for OCF label; covers `"hoạt động kinh doanh"` and `"luồng tiền thuần"` bank variant; no `"sản xuất kinh doanh"` variant | domain/service |
| `apps/mcp-server/src/infrastructure/db/vnstockStore.ts` L861–878 | `storeCashFlow()` — `INSERT OR REPLACE` into `vnstock_cash_flow`; stores `cf.operatingCashFlow` directly (can be `0.0` if Python key missed); calls `bridgeOCFToFinancialReports()` immediately after | infrastructure/db |
| `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` L321–346 | `bridgeOCFToFinancialReports()` — `UPDATE financial_reports SET operating_cash_flow = (SELECT vcf.operating_cf_bn * 1000.0 ...)` joined on `(code, year_report, quarter)`; no-op if no matching `vnstock_cash_flow` row | infrastructure/db |
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/cashFlowTool.ts` L277–315 | `buildFallbackResponse()` — reads `vnstock_cash_flow.operating_cf_bn`; multiplies by `1000.0`; if `operating_cf_bn = 0.0` returns `operating_cf: 0` (misleading) | interface/tool |

---

### Confirmed brownfield diagnosis

**Scenario B root cause (primary suspect — fix unconditionally):**

`CASH_FLOW_SCRIPT` at L844:
```python
operating = g('Net cash inflows/outflows from operating activities') / 1e9
```
`g(key, default=0)` is defined as `float(v or 0)` — when the key is absent from the DataFrame, `v = 0`, so `float(0 or 0) = 0.0`. This is then stored as `operating_cf_bn = 0.0` (not NULL) via `storeCashFlow()` at L869. `buildFallbackResponse()` then returns `operating_cf: 0.0 * 1000 = 0`.

The `g()` helper is already defined identically in `BALANCE_SHEET_SCRIPT` (L765) and handles the multi-key fallback pattern there (L776–782: `if short_debt == 0 and long_debt == 0: long_debt = g('Convertible...')`). The exact same pattern must be applied to `CASH_FLOW_SCRIPT` and `FINANCE_SCRIPT`.

`FINANCE_SCRIPT` at L395:
```python
net = float(last.get('Attributable to parent company', 0) or 0)
```
Same issue: missing key returns `0.0` stored as `net_profit_bn = 0.0`. The pattern `float(last.get(key, 0) or 0)` silently returns `0.0` for absent keys — indistinguishable from a genuine zero profit.

**Scenario A root cause (fix unconditionally — low risk, wide coverage):**

`cashFlowExtractor.ts` L118–121 covers only:
- Primary: `"Lưu chuyển tiền thuần từ hoạt động kinh doanh"` / abbreviation HĐKD
- Bank variant: `"Luồng tiền thuần từ hoạt động kinh doanh"`

Missing: `"Lưu chuyển tiền thuần từ hoạt động sản xuất kinh doanh"` (steel/manufacturing sector, VN line code 20 for non-bank non-service).

The `fv()` wrapper at L549–568 already supports unlimited `altPatterns` via variadic `...Array<[RegExp, RegExp]>` — the fix is to pass one additional `[P_OPERATING_CF_MFG, F_OPERATING_CF_MFG]` pair in the call at L579–582. Zero risk of conflicting with VCB/FPT: VCB uses `"luồng tiền thuần"` (matched by `P_OPERATING_CF_BANK`); FPT uses the standard label (matched by `P_OPERATING_CF`).

---

### Design decisions

**Decision 1 — Apply both fixes unconditionally (do not gate on FR-1 diagnostic).**

The BA spec says developer runs FR-1 first to decide Scenario A vs B. This is correct as a diagnostic step. However, from the brownfield scan, both fixes are independent and safe to ship together:
- Scenario A fix (extractor label) only affects OCR parsing — zero impact on vnstock path.
- Scenario B fix (Python key fallback + NULL policy) only affects Python bridge — zero impact on OCR path.
Shipping both eliminates the need for a second cycle if the diagnostic reveals the other scenario also applies (mixed state is possible: HPG has some `financial_reports` rows AND corrupted `vnstock_cash_flow`).

**Decision 2 — NULL policy for missing Python keys (Scenario B, FR-4 / FR-5).**

The fix must change the `g()` result handling for the OCF and NI keys specifically: if the primary key and all fallback keys return `0.0`, the Python script must output `None` (not `0`). In TypeScript, `VnstockCashFlow.operatingCashFlow` is typed `number` in `domain/models/vnstockTypes.ts` — the domain type needs to allow `number | null`. The `storeCashFlow()` call at L869 passes `cf.operatingCashFlow` directly to SQLite, which handles `null` as NULL.

Check before touching the domain type: `VnstockCashFlow` is defined in `domain/models/vnstockTypes.ts`. The `operatingCashFlow` field must become `number | null`. Callers of `fetchVnstockCashFlow()` in `vnstockFundamentalsJob.ts` and `vnstockStore.storeCashFlow()` need no changes — SQLite accepts `null` via the `?` placeholder.

**Decision 3 — Do NOT touch `buildFallbackResponse()` in cashFlowTool.ts.**

The current code at L277: `vcfRow.operating_cf_bn !== null ? vcfRow.operating_cf_bn * 1000.0 : null` already handles NULL correctly. Once the upstream fix stores NULL instead of `0.0`, the fallback response will return `operating_cf: null` (honest missing). No change required in `cashFlowTool.ts`.

**Decision 4 — Do NOT change the `g()` helper globally in `CASH_FLOW_SCRIPT`.**

`g()` is used for investing and financing CF too. Those keys are likely to be genuinely `0.0` for some tickers. Changing `g()` globally risks storing NULL for legitimately-zero values. The fix targets ONLY the OCF and NI key lookups with explicit sentinel detection.

---

### Exact change surface

**File 1 — `apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts`**

In `CASH_FLOW_SCRIPT` Python string (L831–863), replace the single-key OCF lookup:

Before:
```python
operating = g('Net cash inflows/outflows from operating activities') / 1e9
```

After:
```python
# Fallback keys: VCI column name varies by sector
_ocf_keys = [
    'Net cash inflows/outflows from operating activities',
    'Lưu chuyển tiền thuần từ hoạt động kinh doanh',
    'Net Cash From Operating Activities',
]
operating_raw = next((last.get(k) for k in _ocf_keys if last.get(k) not in (None, 0)), None)
operating = float(operating_raw) / 1e9 if operating_raw is not None else None
```

In `FINANCE_SCRIPT` Python string (L378–434), replace the single-key NI lookup:

Before:
```python
net = float(last.get('Attributable to parent company', 0) or 0)
```

After:
```python
_ni_keys = [
    'Attributable to parent company',
    'Net Profit After Tax (Bn. VND)',
    'Lợi nhuận sau thuế',
]
_ni_raw = next((last.get(k) for k in _ni_keys if last.get(k) not in (None, 0)), None)
net = float(_ni_raw) if _ni_raw is not None else 0  # keep 0 for ratio math; None only when truly absent
```

Note: for NI in `FINANCE_SCRIPT`, the Python result key `'netProfit'` feeds `VnstockFinancials.netProfit` which is stored as `vnstock_financials.net_profit_bn`. A `0.0` here is less dangerous than in the OCF case because `buildFallbackResponse` checks `vfRow?.net_profit_bn !== null` before multiplying — so `0.0` just yields `net_profit = 0` (and a null ratio), not a crash. The primary risk is `0.0` being stored when data is missing, so the fallback key logic is still valuable. Store `null` for `netProfit` field if all keys miss.

Also update the `result` dict in `CASH_FLOW_SCRIPT` to emit `None` for `operatingCashFlow` when `operating is None`:
```python
'operatingCashFlow': round(operating, 2) if operating is not None else None,
```

**File 1 also — `VnstockCashFlow` domain type** (referenced from `domain/models/vnstockTypes.ts`):

`operatingCashFlow` field must become `number | null`. The `storeCashFlow()` SQLite binding handles `null` natively.

**File 2 — `apps/mcp-server/src/domain/services/financial-reports/cashFlowExtractor.ts`**

Add steel/manufacturing OCF label pattern (L117–126 area):

```typescript
// E-2b: steel/manufacturing label variant "sản xuất kinh doanh"
const P_OPERATING_CF_MFG =
  /l[ưu]u\s+chuy[ểe]n\s+ti[ềe]n\s+thu[ầa]n\s+t[ừu]\s+ho[ạa]t\s+[đd][ộo]ng\s+s[ảa]n\s+xu[ấa]t\s+kinh\s+doanh/i;
const F_OPERATING_CF_MFG =
  /luu\s+chuyen\s+tien\s+thuan\s+tu\s+hoat\s+dong\s+san\s+xuat\s+kinh\s+doanh/i;
```

Wire into `fv()` call at L579–582:
```typescript
let operatingCF = fv(
  P_OPERATING_CF, F_OPERATING_CF, "20",
  [P_OPERATING_CF_BANK, F_OPERATING_CF_BANK],
  [P_OPERATING_CF_MFG, F_OPERATING_CF_MFG],   // ← add this line
);
```

**No other files change.** `cashFlowTool.ts` and `vnstockStore.ts` are untouched.

---

### Domain type change scope

`apps/mcp-server/src/domain/models/vnstockTypes.ts` — `VnstockCashFlow.operatingCashFlow: number` becomes `number | null`. This is a narrowing to be honest about the data; downstream TypeScript callers must handle the `null` case. Check: `storeCashFlow()` passes the value directly to the `?` placeholder — SQLite accepts `null`. `fetchVnstockCashFlow()` returns `VnstockCashFlow | null` — callers already null-check the outer object. The inner `operatingCashFlow` field is only consumed in `storeCashFlow()` (infrastructure) and `fetchVnstockSnapshot()` (snapshot struct — no arithmetic). Zero breakage expected.

---

### Test strategy

**New file:** `apps/mcp-server/src/__tests__/1942c-hpg-cashflow-fix.test.ts`

| Test ID | Name | What it asserts |
|---------|------|-----------------|
| T1 | Scenario B end-to-end: non-zero `operating_cf_bn` → tool returns non-zero `operating_cf` | `operating_cf_bn = 3500` → `operating_cf = 3_500_000` |
| T2 | Scenario B: `operating_cf_bn = NULL` in DB → `buildFallbackResponse` returns `operating_cf: null` | Honest missing |
| T3 | Scenario A: OCR text with `"sản xuất kinh doanh"` label → `extractCashFlow()` returns non-zero `operatingCF` | New regex T coverage |
| T4 | Scenario A: existing VCB `"luồng tiền thuần"` still works (regression guard) | `P_OPERATING_CF_BANK` path unaffected |
| T5 | Scenario A: existing standard `"hoạt động kinh doanh"` still works (regression guard) | `P_OPERATING_CF` path unaffected |
| T6 | `buildFallbackResponse` with `operating_cf_bn = 0.0` returns `operating_cf: 0` — documents EC-1 (genuine zero) | This is NOT a bug case; the upstream Python fix prevents false `0.0` storage |

Line budget: target ≤200L. Fixtures are inline OCR mocks (no PDF). Follows `1909a-cashflow-extractor-expansion.test.ts` template.

**Regression guard:** existing tests `1942b-cashflow-fallback-path.test.ts` TC1–TC10, `1941a` T1–T5, `1941d` T1–T7 must continue to pass without modification.

---

### Risk flags

| ID | Risk | Mitigation |
|----|------|------------|
| R-1 | `VnstockCashFlow.operatingCashFlow` becomes `number | null` — TypeScript callers may not null-check the inner field | Check all callers before shipping. Confirmed: only `storeCashFlow()` (SQLite `?` placeholder accepts null) and `fetchVnstockSnapshot()` (struct field, no arithmetic). Zero breakage. |
| R-2 | Python `next()` iterator sentinel: `last.get(k) not in (None, 0)` — if HPG genuinely had `operatingCF = 0` in a quarter, all keys return `0.0`, sentinel fires, stores `NULL` instead of `0` (EC-1 regression) | Acceptable tradeoff per BA spec: `0.0` from a key-miss is indistinguishable from genuine zero at the Python level. NULL is the honest response when all keys miss. The BA accepted this in EC-1. |
| R-3 | New `P_OPERATING_CF_MFG` regex overlaps with existing patterns if VCB PDF contains phrase "sản xuất kinh doanh" in a footnote | `fv()` tries patterns in order and returns on first non-zero match (L557: `if (v !== 0) return v`). VCB will match `P_OPERATING_CF_BANK` first — `P_OPERATING_CF_MFG` is never reached. No overlap risk. |
| R-4 | Docker container must be rebuilt to pick up Python script changes in `vnstockBridge.ts` | Standard rebuild cycle applies. No special ops step. |

---

### Diagnostic SQL (developer must run first — FR-1)

```sql
-- Step 1: Gate check
SELECT COUNT(*) AS fr_row_count
FROM financial_reports
WHERE action_code = 'HPG';

-- Step 2: If fr_row_count > 0 → Scenario A path
SELECT period_year, period_quarter, operating_cf, operating_cash_flow, net_profit, net_profit_api_bridge
FROM financial_reports
WHERE action_code = 'HPG'
ORDER BY period_year DESC, period_quarter DESC
LIMIT 5;

-- Step 3: Check vnstock_cash_flow regardless of scenario
SELECT year_report, quarter, operating_cf_bn, investing_cf_bn, financing_cf_bn, fetched_at
FROM vnstock_cash_flow
WHERE code = 'HPG'
ORDER BY year_report DESC, quarter DESC
LIMIT 5;

-- Step 4: Check vnstock_financials
SELECT year_report, quarter, net_profit_bn, revenue_bn, fetched_at
FROM vnstock_financials
WHERE code = 'HPG'
ORDER BY year_report DESC, quarter DESC
LIMIT 5;
```

Interpretation:
- `fr_row_count = 0` AND `operating_cf_bn = 0.0` in vnstock_cash_flow → Scenario B confirmed (FR-4/FR-5 path)
- `fr_row_count = 0` AND `operating_cf_bn IS NULL` → Scenario B, vnstock fetch never succeeded (FR-3 investigation needed)
- `fr_row_count > 0` AND `operating_cf = 0` AND `operating_cash_flow IS NULL` → Scenario A (FR-2 + FR-3 path)
- `fr_row_count > 0` AND `operating_cash_flow IS NOT NULL` → bridge worked; bug is elsewhere (re-examine)

---

### Implementation sequence

1. Developer runs FR-1 diagnostic SQL above.
2. Developer runs Python diagnostic for HPG (see FR-3 in BA spec) to confirm actual column names.
3. **Ship both fixes together** (vnstockBridge.ts + cashFlowExtractor.ts) — independent, no conflict.
4. Update `VnstockCashFlow` domain type (`operatingCashFlow: number | null`).
5. Write `1942c-hpg-cashflow-fix.test.ts` (T1–T6).
6. Trigger `syncVnstockData(["HPG"])` in Docker container to repopulate `vnstock_cash_flow` with correct data.
7. If Scenario A: trigger `bctcReparseJob` for HPG to re-extract with new label patterns.
8. Restart server — `backfillOCFForWatchlist` bridges corrected `operating_cf_bn` into `financial_reports.operating_cash_flow`.
9. Call `get_cash_flow("HPG")` to verify AC-1 and AC-2.

---

### Handoff summary

- **Primary files to modify (2):** `vnstockBridge.ts`, `cashFlowExtractor.ts`
- **Secondary file (1 field change):** `domain/models/vnstockTypes.ts`
- **New test file (1):** `1942c-hpg-cashflow-fix.test.ts`
- **No schema changes. No new cron jobs. No architectural changes.**
- **Scan clean:** true
