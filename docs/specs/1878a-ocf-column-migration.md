# Spec 1878a — OCF Column Migration: `operating_cash_flow` in `financial_reports`

**Sprint:** 1878a
**SSOT layer:** Layer 7 — Cash-Flow Reality
**Status:** SPEC COMPLETE — gates 1878b, 1885a, 1886a
**Owner:** dev-mcp-server
**Date:** 2026-05-12

---

## 1. Objective

Add `operating_cash_flow` as a dedicated, first-class scalar column to `financial_reports`, sourced from `vnstock_cash_flow` (API-grade data), distinct from the existing `operating_cf` column (BCTC OCR/PDF extraction).

Why a second column rather than overwriting `operating_cf`?

- `operating_cf` is populated by the BCTC PDF pipeline (OCR, varying confidence, VND millions).
- `operating_cash_flow` is populated by the vnstock API sync (structured, quarterly, higher coverage). Having both allows confidence-ranked selection and audit trails.
- Downstream consumers (1878b accruals formula, 1885a Beneish M-Score, 1885a Piotroski F-Score, 1886a BTN forensics) require a reliable, non-null OCF value with known provenance. `operating_cash_flow` is that value.

Downstream unlock:

| Task | Unblocked by |
|---|---|
| 1878b `compute_accruals` | `operating_cash_flow` + `net_profit` + `total_assets` all non-null |
| 1885a Beneish variable TATA | `operating_cash_flow` vs `net_profit` ratio |
| 1885a Piotroski F6 (CFO/Assets) | `operating_cash_flow` / `total_assets` |
| 1886a BTN forensics | `operating_cash_flow` time series |

---

## 2. Schema Change

### 2.1 New column — `financial_reports.operating_cash_flow`

**Type:** `REAL` (SQLite) — stores VND millions, consistent with all other scalar cash-flow columns in `financial_reports` (`operating_cf`, `net_profit`, `total_assets`).

**Nullable:** YES — `NULLABLE` (no `NOT NULL`, no `DEFAULT`). Rationale: not every ticker has vnstock cash-flow history; a hard `NOT NULL DEFAULT 0` would corrupt the accruals formula (0 is a valid but misleading value, different from absent data).

**Location to add DDL migration:**
`apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts`
in the existing idempotent migration block (lines 29-74).

**Idempotent migration pattern — follow existing convention:**

```sql
-- Inside initFinancialReportsTables(), after existing colNames checks:
if (!colNames.has("operating_cash_flow")) {
  db.exec(
    "ALTER TABLE financial_reports ADD COLUMN operating_cash_flow REAL"
  );
}
```

No index required at this stage (accruals queries filter by `ticker + quarter + year`, not by `operating_cash_flow` value).

### 2.2 No DDL change to `bctc-schema.ts` SQLITE_DDL string

`operating_cash_flow` is a migration-added column, not part of the base `CREATE TABLE` DDL. This is consistent with all prior migrations (`validation_status`, `ocr_confidence`, etc.). Fresh DB installs get it via the migration block on first `initFinancialReportsTables()` call.

---

## 3. Data Sourcing

### 3.1 Source confirmed: `vnstock_cash_flow` table EXISTS

Confirmed in `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` lines 239-253:

```
vnstock_cash_flow.operating_cf_bn  REAL   -- billions VND (tỷ đồng)
vnstock_cash_flow.year_report      INTEGER
vnstock_cash_flow.quarter          INTEGER
vnstock_cash_flow.code             TEXT
```

`storeCashFlow()` in `vnstockStore.ts` already populates this table via INSERT OR REPLACE on `(code, year_report, quarter, source)`.

### 3.2 Bridge mapper — lift vnstock -> financial_reports

Strategy: **bridge mapper** (not full backfill pipeline). The mapper runs:
- (A) On every `storeCashFlow()` call — after inserting into `vnstock_cash_flow`, immediately UPDATE matching `financial_reports` rows.
- (B) As a one-time backfill function for existing data — called once from migration block or a dedicated backfill tool.

Bridge mapper logic (pseudo-SQL):

```sql
UPDATE financial_reports
SET operating_cash_flow = (
  SELECT vcf.operating_cf_bn * 1000.0   -- convert tỷ VND -> triệu VND
  FROM vnstock_cash_flow vcf
  WHERE vcf.code         = financial_reports.action_code
    AND vcf.year_report  = financial_reports.period_year
    AND vcf.quarter      = financial_reports.period_quarter
  ORDER BY vcf.fetched_at DESC
  LIMIT 1
)
WHERE financial_reports.action_code = :ticker
  AND financial_reports.period_quarter IS NOT NULL;  -- skip annual rows
```

Implementation: new function `bridgeOCFToFinancialReports(db, ticker)` in `vnstockStore.ts`.

Trigger: call `bridgeOCFToFinancialReports(db, cf.code)` at the end of `storeCashFlow()`.

Backfill: expose a one-shot function `backfillAllOCF(db)` that loops all distinct codes in `vnstock_cash_flow` and calls the bridge. Called once in migration block or from a CLI/admin tool.

### 3.3 Period matching rules

| `financial_reports` field | Maps to `vnstock_cash_flow` field |
|---|---|
| `period_year` | `year_report` |
| `period_quarter` | `quarter` |
| `action_code` | `code` |

Annual rows (`period_quarter IS NULL`) are SKIPPED — vnstock provides quarterly cash flow only. Do not set `operating_cash_flow` on annual rows; leave NULL.

---

## 4. Unit and Scale

| Table | Column | Unit | Scale |
|---|---|---|---|
| `vnstock_cash_flow` | `operating_cf_bn` | tỷ VND (billions) | 1e9 VND |
| `financial_reports` | `operating_cash_flow` | triệu VND (millions) | 1e6 VND |
| `financial_reports` | `operating_cf` (existing) | triệu VND (millions) | 1e6 VND |
| `financial_reports` | `net_profit` | triệu VND (millions) | 1e6 VND |
| `financial_reports` | `total_assets` | triệu VND (millions) | 1e6 VND |

**Conversion:** `operating_cash_flow = operating_cf_bn * 1000.0`

This is mandatory — the accruals formula `(NetIncome - OCF) / TotalAssets` requires all three values in the same unit. Using raw `operating_cf_bn` (billions) would produce a 1000x error in accrual ratios.

---

## 5. Period Mapping

`financial_reports` uses `period_year INTEGER` + `period_quarter INTEGER` (1–4, NULL for annual).
`vnstock_cash_flow` uses `year_report INTEGER` + `quarter INTEGER` (1–4).

Mapping is direct equality join. No transformation needed.

Edge case: `quarter = 0` in `vnstock_cash_flow` — treat as annual, do not bridge to `financial_reports` quarterly rows.

---

## 6. Acceptance Criteria

**AC-1: Column exists on live DB**
```sql
PRAGMA table_info(financial_reports);
-- Row with name='operating_cash_flow' and type='REAL' must appear.
```

**AC-2: VCB last 4 quarters non-null**
```sql
SELECT operating_cash_flow
FROM financial_reports
WHERE action_code = 'VCB'
  AND period_quarter IS NOT NULL
ORDER BY period_year DESC, period_quarter DESC
LIMIT 4;
-- Must return 4 rows, all non-NULL, all non-zero.
```

**AC-3: FPT last 4 quarters non-null**
```sql
SELECT operating_cash_flow
FROM financial_reports
WHERE action_code = 'FPT'
  AND period_quarter IS NOT NULL
ORDER BY period_year DESC, period_quarter DESC
LIMIT 4;
-- Must return 4 rows, all non-NULL, all non-zero.
```

**AC-4: Unit consistency check**
For VCB Q4 2024, `operating_cash_flow` (millions) should equal `vnstock_cash_flow.operating_cf_bn * 1000` within floating-point tolerance (< 1 triệu VND difference).

**AC-5: Idempotency**
Calling `initFinancialReportsTables(db)` twice on a DB that already has the column does not throw and does not alter existing data.

**AC-6: Annual rows untouched**
```sql
SELECT operating_cash_flow FROM financial_reports
WHERE action_code = 'VCB' AND period_quarter IS NULL;
-- All rows must be NULL (annual rows not bridged from vnstock quarterly).
```

---

## 7. Out of Scope

- **Accruals formula** (`compute_accruals` MCP tool) — Sprint 1878b.
- **Forensic scoring** (Beneish M-Score, Piotroski F-Score) — Sprint 1885a.
- **BTN detectors** — Sprint 1886a.
- **Investing / financing CF columns** — not needed for accruals formula; deferred.
- **`operating_cf` column changes** — existing BCTC-OCR column is unchanged. No migration or rename.
- **Schema changes outside `financial_reports` and `vnstock_cash_flow`** — out of scope.
- **vnstock API fetch frequency changes** — `storeCashFlow` trigger rate is unchanged.

---

## 8. File List — dev-mcp-server touches

| File | Change |
|---|---|
| `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` | Add idempotent `ALTER TABLE ... ADD COLUMN operating_cash_flow REAL` in migration block |
| `apps/mcp-server/src/infrastructure/db/vnstockStore.ts` | Add `bridgeOCFToFinancialReports(db, ticker)` + call at end of `storeCashFlow()` + add `backfillAllOCF(db)` |
| `apps/mcp-server/src/__tests__/1878a-ocf-column-migration.test.ts` | New test file (see Section 9) |

No changes to `bctc-schema.ts`, `fetchParseAndStoreBctc.ts`, `bctcReparseJob.ts`, or any MCP tool file.

---

## 9. Test Strategy (TDD)

Test file: `apps/mcp-server/src/__tests__/1878a-ocf-column-migration.test.ts`

Tests must be written BEFORE implementation (TDD). All tests use in-memory SQLite.

### T1 — Column migration idempotent
- Create `financial_reports` table via `SQLITE_DDL`.
- Call `initFinancialReportsTables(db)` twice.
- Assert `PRAGMA table_info` returns `operating_cash_flow` exactly once.

### T2 — Bridge mapper: correct unit conversion
- Insert row into `vnstock_cash_flow` with `operating_cf_bn = 5.0` (tỷ VND).
- Insert matching row into `financial_reports` with matching `action_code`, `period_year`, `period_quarter`.
- Call `bridgeOCFToFinancialReports(db, 'VCB')`.
- Assert `financial_reports.operating_cash_flow = 5000.0` (triệu VND).

### T3 — Bridge mapper: skips annual rows
- Insert `financial_reports` row with `period_quarter = NULL`.
- Call bridge.
- Assert `operating_cash_flow` remains NULL for that row.

### T4 — Bridge mapper: no match leaves NULL
- Insert `financial_reports` row with no matching `vnstock_cash_flow` row.
- Call bridge.
- Assert `operating_cash_flow` is NULL.

### T5 — `storeCashFlow` triggers bridge automatically
- Mock or spy on `bridgeOCFToFinancialReports`.
- Call `storeCashFlow(cf)`.
- Assert bridge was called with the correct ticker.

### T6 — Backfill: covers all tickers
- Insert `vnstock_cash_flow` rows for 3 tickers.
- Insert matching `financial_reports` rows.
- Call `backfillAllOCF(db)`.
- Assert all 3 tickers have non-NULL `operating_cash_flow`.

### T7 — `quarter = 0` edge case
- Insert `vnstock_cash_flow` row with `quarter = 0`.
- Call `bridgeOCFToFinancialReports`.
- Assert no `financial_reports` rows are updated (0 treated as annual, skip).

---

## 10. Risk and Unknowns

| Risk | Severity | Mitigation |
|---|---|---|
| `vnstock_cash_flow` has sparse data — many tickers may have 0 rows | HIGH | `operating_cash_flow` is NULLABLE; accruals tool (1878b) must handle NULL per ticker gracefully with clear error message to caller |
| Scale mismatch bug: dev forgets `* 1000` conversion | HIGH | T2 test catches it; code review checklist item |
| `vnstock_cash_flow.quarter = 0` in legacy data means annual, not Q0 | MEDIUM | T7 test + bridge mapper WHERE clause `quarter BETWEEN 1 AND 4` |
| `storeCashFlow()` is called from scheduler; bridge adds DB write overhead per call | LOW | Bridge is a single `UPDATE` with indexed join on `(action_code, period_year, period_quarter)` — negligible cost |
| `financial_reports` rows inserted BEFORE `vnstock_cash_flow` — bridge won't fire retroactively | MEDIUM | `backfillAllOCF()` is the fix; must be called once after migration |
| `operating_cf` (existing, from OCR) vs `operating_cash_flow` (new, from vnstock) may diverge significantly for low-confidence BCTC extractions | LOW | Not a bug — divergence is expected and useful for 1885a forensics; no reconciliation logic needed in this task |
| `vnstock_cash_flow` `source` column has multiple values (`vnstock`, etc.) — which to prefer? | LOW | Bridge takes `ORDER BY fetched_at DESC LIMIT 1` — latest fetch wins regardless of source tag |

### Open questions for dev-mcp-server

1. Should `backfillAllOCF(db)` be wired into the migration block (runs on every server start for new tickers) or exposed as a one-shot admin CLI command? Recommendation: migration block is safest (idempotent UPDATE, no-op if already populated).
2. Should `bridgeOCFToFinancialReports` update ALL rows for the ticker (all quarters) or only the row matching the just-inserted quarter? Recommendation: update ALL rows for the ticker (one UPDATE covers all, and historical rows may have been missed).
3. Is `storeCashFlow()` called in a transaction context? If yes, the bridge UPDATE must be inside the same transaction to avoid partial state.

### Open question for architect (relevant to ARCH-1884 scope)

Does `bridgeOCFToFinancialReports` belong in `vnstockStore.ts` (infrastructure layer) or in a new application-layer service? Given that it crosses two infrastructure tables (`vnstock_cash_flow` and `financial_reports`), strict DDD would place it in an application use-case. However, since both tables live in the same SQLite DB and this is a data sync not a business rule, infrastructure placement is acceptable for Sprint 1878a. Architect to confirm placement before dev starts.

---

## DDD Layer Mapping

| Requirement | DDD Layer |
|---|---|
| `operating_cash_flow` column definition | Infrastructure — schema |
| Idempotent `ALTER TABLE` migration | Infrastructure — schema init |
| `bridgeOCFToFinancialReports()` function | Infrastructure — DB store (acceptable) OR Application — use case (strict DDD) |
| `backfillAllOCF()` function | Infrastructure — DB store |
| Bridge trigger inside `storeCashFlow()` | Infrastructure — DB store |
| Unit conversion (`* 1000`) | Infrastructure — mapper |
| Period matching logic (annual skip) | Infrastructure — mapper |
| Test coverage | Infrastructure — test |
