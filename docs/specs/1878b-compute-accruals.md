# Spec 1878b — `compute_accruals` MCP Tool

**Sprint:** 1878b
**SSOT layer:** Layer 7 — Cash-Flow Reality
**Status:** SPEC COMPLETE — ready for dev-mcp-server
**Owner:** dev-mcp-server
**Date:** 2026-05-12
**Depends on:** 1878a (merged 1fb5282b — `operating_cash_flow` column live in `financial_reports`)

---

## 1. Objective

Expose a new MCP tool `compute_accruals` that returns a time-series of Sloan Accruals Ratios for a given ticker over the last N quarterly periods.

Formula (canonical — do not deviate):

```
Accruals_t = (NetIncome_t - OperatingCashFlow_t) / TotalAssets_t
```

All three inputs are read from `financial_reports` (VND millions). The tool is a pure read — no writes, no caches, no side effects.

Sign semantics (must appear verbatim in tool description):
- Positive: NI > OCF — earnings elevated relative to cash generation (potential inflation signal)
- Negative: OCF > NI — conservative earnings, cash-backed

This is Layer 7 building block 1 of the forensic methodology sprint (1878b → 1885a Beneish → 1885b Piotroski → 1886a BTN).

---

## 2. Domain Placement Decision

**Decision: co-locate in existing `domain/services/financial-reports/` as `accruals.ts`.**

Rationale:
- ARCH-1884 brief (2026-05-12) explicitly resolved this: pure-function calculators (accruals, M-Score variables, F-Score variables) belong in `domain/services/financial-reports/`, the same subfolder as `ratioComputer.ts` and `periodDeltaComputer.ts`.
- `accruals.ts` is structurally identical to `ratioComputer.ts`: takes typed inputs, applies arithmetic, returns typed output. No I/O, no infrastructure import.
- A new `domain/forensic/` subdirectory is NOT justified at this stage. The `forensic/` split applies to BTN heuristic detectors (Sprint 1886a) which require multi-quarter state machines. Accruals is a single-period ratio computation.
- Extending `financial-reports/` avoids creating a new barrel export and keeps the domain surface minimal.

**No new domain directory is created for this sprint.**

---

## 3. Tool Registration Decision

**Decision: new file `interface/mcp/tools/financial-reports/computeAccrualsTool.ts`.**

Rationale:
- The `financial-reports/` tool group already owns BCTC-adjacent tools (`reports.ts`, `bctcFullTools.ts`, `bctcBatchSweepTool.ts`, `earningsCalendarTools.ts`). Accruals reads from `financial_reports` — same table, same group.
- A new file avoids bloating `reports.ts` (already 430+ LOC with 3 tools). Consistent with the backtesting group pattern (separate files per tool family).
- `index.ts` barrel of `financial-reports/` must export `registerComputeAccrualsTool`.
- `registry.ts` gets one new import + one entry in `toolRegistry[]`. No `server.ts` changes required (registry pattern in place since Task 308).

---

## 4. Input Contract

**Decision: `ticker: string` + `quarters: number` (last-N pattern).**

Rejected: `from_year + from_quarter` pair. Rationale: the sibling tools that use a range pair (`compare_financials`, `get_financial_summary`) are single-period point lookups. Time-series forensic tools in this codebase use `limit` / `days` / window-count parameters (see: `priceHistoryTools.ts`, `insiderTools.ts`, `bondMaturityTools.ts`, `legalRiskTools.ts`). Last-N is more ergonomic for trend analysis and consistent with the majority pattern.

**Schema (Zod):**

```
ticker:   z.string().min(1).max(10).toUpperCase()
          .describe("VN stock ticker (e.g. VCB, FPT). Case-insensitive.")

quarters: z.coerce.number().int().min(1).max(20).optional().default(8)
          .describe("Number of most-recent quarters to include (default: 8, max: 20).")
```

**Validation rules:**
- `ticker` empty string → fail-loud: return MCP error `"ticker is required"` — do not query DB.
- `ticker` normalized to uppercase before DB query (e.g. `"vcb"` → `"VCB"`).
- `quarters` must be integer 1–20. Zod coerces and validates; out-of-range values return validation error before DB access.

---

## 5. Output Contract

**Shape:**

```typescript
{
  ticker: string;
  formula: string;             // human-readable, e.g. "(NetIncome - OCF) / TotalAssets"
  unit: "ratio";               // always literal "ratio"
  quarters_requested: number;
  quarters_returned: number;   // may be < requested if data sparse
  data: AccrualPoint[];
}

interface AccrualPoint {
  period_year: number;
  period_quarter: number;       // 1–4
  net_income_m: number | null;  // VND millions (for transparency / debug)
  ocf_m: number | null;         // VND millions
  total_assets_m: number | null;// VND millions
  accruals_ratio: number | null;// null if any input is null OR total_assets = 0
  missing: string[];            // e.g. ["OCF"] if operating_cash_flow was NULL
  error: string | null;         // "zero_total_assets" | null
}
```

**Sort order:** ascending by `(period_year, period_quarter)` — oldest first. This is chart-friendly (x-axis time progression) and consistent with how backtesting and historical tools return time series in this codebase.

**Unit annotation:** `unit: "ratio"` field is present at the envelope level. Each `AccrualPoint` carries raw inputs in `_m` suffixed fields so downstream callers can audit the computation without re-querying. Field naming `_m` suffix = VND millions, matching the existing `fmtBillions` convention in `reports.ts`.

---

## 6. Null Handling Decision

**Decision: include row with `accruals_ratio: null` + populate `missing: [...]` array.**

Rationale:
- Skipping null rows silently hides data gaps and makes trend charts misleading (gap appears as continuity).
- Including the row with `accruals_ratio: null` and `missing: ["OCF"]` / `missing: ["NET_INCOME", "TOTAL_ASSETS"]` gives the caller full transparency on why the ratio is absent for that quarter.
- The `quarters_returned` count reflects rows returned (including null-ratio rows), not rows with a computable ratio. If the caller needs only computable rows, they filter `accruals_ratio !== null` client-side.
- This is consistent with how `computeFinancialRatios` in `ratioComputer.ts` returns `null` for individual ratio fields rather than omitting them.

---

## 7. Division-by-Zero Decision

**Decision: `total_assets = 0` → `accruals_ratio: null`, `error: "zero_total_assets"`.**

- Zero total assets is economically impossible for a listed VN company; it signals corrupt or placeholder data.
- Do not divide. Do not return `Infinity` or `NaN`.
- The `error` field (separate from `missing`) distinguishes data-absent (`missing`) from data-present-but-invalid (`error`). This enables downstream tools (1885a, 1886a) to filter differently.
- Confirmed: mirrors the `safeDivide()` pattern in `ratioComputer.ts` which returns `null` for zero denominator.

---

## 8. SQL Query Design

Read query (parameterized):

```sql
SELECT
  period_year,
  period_quarter,
  net_profit          AS net_income_m,
  operating_cash_flow AS ocf_m,
  total_assets        AS total_assets_m
FROM financial_reports
WHERE action_code     = :ticker
  AND period_quarter  IS NOT NULL        -- exclude annual rows
  AND period_quarter  BETWEEN 1 AND 4
ORDER BY period_year DESC, period_quarter DESC
LIMIT :quarters
```

Post-query: re-sort ascending (reverse the result array) — DESC limit selects the most-recent N quarters, ASC output satisfies chart-friendly contract.

**No new schema, no migrations.** All three columns (`net_profit`, `operating_cash_flow`, `total_assets`) exist on `financial_reports`. `operating_cash_flow` was added by 1878a migration (verified present in `schema-financial-reports.ts` lines 77-79).

---

## 9. DDD Layer Mapping

| Concern | DDD Layer | File |
|---|---|---|
| Accruals formula + null/zero logic | Domain — service | `domain/services/financial-reports/accruals.ts` |
| Input types (`AccrualPoint`, envelope) | Domain — model | defined in `accruals.ts` (co-located; no separate model file) |
| SQL SELECT + row mapping | Interface — tool | `interface/mcp/tools/financial-reports/computeAccrualsTool.ts` |
| Ticker validation (Zod) | Interface — tool | same file |
| Tool registration (barrel export) | Interface — barrel | `interface/mcp/tools/financial-reports/index.ts` |
| Registry wiring | Interface — registry | `interface/mcp/tools/registry.ts` |
| Tests | — | `src/__tests__/1878b-compute-accruals.test.ts` |

**DDD constraint:** `accruals.ts` (domain) must NOT import from `infrastructure/` or `interface/`. It receives plain TypeScript objects. The tool file (interface layer) handles DB access and calls the domain function.

---

## 10. Acceptance Criteria

**AC-1: Pure function — synthetic fixture correctness**
Given `net_income = 500` (m), `ocf = 200` (m), `total_assets = 10000` (m):
`computeAccruals({ net_income_m: 500, ocf_m: 200, total_assets_m: 10000 })` returns `0.03` (= 300/10000).

**AC-2: Pure function — null input produces null ratio with correct `missing` array**
Given `ocf_m = null`, `net_income_m = 500`, `total_assets_m = 10000`:
`accruals_ratio` is `null`, `missing` contains `"OCF"`, `error` is `null`.

**AC-3: Pure function — zero total assets produces null ratio with `error`**
Given `total_assets_m = 0`, `net_income_m = 500`, `ocf_m = 200`:
`accruals_ratio` is `null`, `missing` is `[]`, `error` is `"zero_total_assets"`.

**AC-4: Sort order — result array is ascending by year+quarter**
For a ticker with data in Q1-2023, Q2-2023, Q3-2023: the returned `data` array index 0 is Q1-2023, index 2 is Q3-2023 (oldest first).

**AC-5: Tool visible in registry**
`toolRegistry` array in `registry.ts` contains `registerComputeAccrualsTool`. The tool name `compute_accruals` is discoverable via MCP tool listing.

**AC-6: Null-row inclusion**
A ticker with 3 quarters of data where Q2 has `operating_cash_flow = NULL` returns 3 `AccrualPoint` rows; the Q2 row has `accruals_ratio: null`, `missing: ["OCF"]`.

**AC-7: Division-by-zero isolation**
A ticker row with `total_assets = 0` returns that quarter's `AccrualPoint` with `accruals_ratio: null`, `error: "zero_total_assets"`, and does not affect adjacent quarters' computations.

**AC-8: Default quarters = 8, max enforced at 20**
Calling the tool without `quarters` returns at most 8 data points. Calling with `quarters: 25` is rejected by Zod validation before DB access (not a server error — a clean MCP validation error).

---

## 11. File List — dev-mcp-server touches

| File | Change type | Notes |
|---|---|---|
| `apps/mcp-server/src/domain/services/financial-reports/accruals.ts` | CREATE | Pure domain function + types. No infrastructure imports. |
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/computeAccrualsTool.ts` | CREATE | MCP tool: Zod schema, DB SELECT, calls domain fn, returns JSON envelope. |
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/index.ts` | MODIFY | Add `export { registerComputeAccrualsTool } from "./computeAccrualsTool.js"` |
| `apps/mcp-server/src/interface/mcp/tools/registry.ts` | MODIFY | Import + add `registerComputeAccrualsTool` to `toolRegistry[]`. One-liner comment with tool name + task ID. |
| `apps/mcp-server/src/__tests__/1878b-compute-accruals.test.ts` | CREATE | TDD test file (see Section 12). |

**Files NOT touched:**
- `schema-financial-reports.ts` — no schema change (1878a complete)
- `vnstockStore.ts` — no bridge change
- `bctc-schema.ts` — no DDL change
- `server.ts` — registry pattern handles wiring automatically
- Any file outside `apps/mcp-server/`

---

## 12. Test Strategy (TDD)

Test file: `apps/mcp-server/src/__tests__/1878b-compute-accruals.test.ts`

All domain function tests use plain objects (no SQLite). Tool-level tests use in-memory SQLite.

### T1 — Domain: correct ratio computation
- Call `computeAccruals({ net_income_m: 300, ocf_m: 100, total_assets_m: 5000 })`.
- Assert result `accruals_ratio === 0.04` (= 200/5000).

### T2 — Domain: null net_income
- Call with `net_income_m: null`.
- Assert `accruals_ratio === null`, `missing` includes `"NET_INCOME"`, `error === null`.

### T3 — Domain: null OCF
- Call with `ocf_m: null`.
- Assert `accruals_ratio === null`, `missing` includes `"OCF"`, `error === null`.

### T4 — Domain: null total_assets
- Call with `total_assets_m: null`.
- Assert `accruals_ratio === null`, `missing` includes `"TOTAL_ASSETS"`, `error === null`.

### T5 — Domain: zero total_assets
- Call with `total_assets_m: 0`, `net_income_m: 500`, `ocf_m: 200`.
- Assert `accruals_ratio === null`, `missing` is empty `[]`, `error === "zero_total_assets"`.

### T6 — Domain: multiple nulls accumulate in `missing`
- Call with `net_income_m: null`, `ocf_m: null`, `total_assets_m: 5000`.
- Assert `missing` contains both `"NET_INCOME"` and `"OCF"`.

### T7 — Tool: sort order ascending
- Seed in-memory SQLite with 4 quarterly rows for ticker `VCB` (Q1-2023 through Q4-2023), out of insertion order.
- Call tool handler with `{ ticker: "VCB", quarters: 8 }`.
- Assert `data[0].period_quarter === 1` and `data[0].period_year === 2023`, `data[3].period_quarter === 4`.

### T8 — Tool: null-row included, not skipped
- Seed 3 rows for `TST` where Q2 has `operating_cash_flow = null`.
- Call tool handler.
- Assert `data.length === 3`, `data[1].accruals_ratio === null`, `data[1].missing` includes `"OCF"`.

### T9 — Tool: empty result for unknown ticker
- Call with ticker `ZZZNONE`.
- Assert envelope returns `quarters_returned: 0`, `data: []` (no error thrown).

### T10 — Tool: ticker normalized to uppercase
- Seed data for `VCB`. Call with `ticker: "vcb"`.
- Assert `quarters_returned > 0` (normalization worked).

### T11 — Tool: `quarters` default is 8
- Seed 12 rows for `FPT`.
- Call without `quarters` param.
- Assert `data.length === 8`.

### T12 — Tool: `quarters` max 20 enforced
- Verify Zod schema rejects `quarters: 25` before DB access (schema parse error, not runtime error).

---

## 13. Risk and Unknowns

| Risk | Severity | Mitigation |
|---|---|---|
| `operating_cash_flow` sparse for small-cap tickers | HIGH | Null-row inclusion (AC-6) + `missing: ["OCF"]` surfaces gaps cleanly. Tool callers must communicate gap to analyst. |
| 1878a backfill incomplete at time of first call | HIGH | Tool returns partial results with null-ratio rows for un-backfilled quarters. Dev must confirm `backfillAllOCF` ran on staging DB before QA tests AC integration. |
| `net_profit` NULL for a period | MEDIUM | T2 covers this. `net_profit` is more reliably populated than `operating_cash_flow` (BCTC OCR pipeline populates it), but gaps are possible for new tickers. |
| `total_assets` zero data entry error | LOW | T5 + AC-3. `error: "zero_total_assets"` is the correct defense. |
| Accruals ratio magnitude interpretation (VAS context) | LOW | Sign semantics documented in tool description verbatim. No VAS/GAAP adjustment needed for Sloan ratio — it is defined on reported figures. |
| Domain function imported from interface layer violates DDD | CRITICAL | Confirmed: tool file is in `interface/`, domain function is in `domain/services/financial-reports/`. Direction is interface → domain (allowed). Reverse never. |

---

## 14. Rollback

This sprint is additive-only:
- New domain file: delete `accruals.ts`.
- New tool file: delete `computeAccrualsTool.ts`.
- Remove export from `financial-reports/index.ts`.
- Remove import + entry from `registry.ts`.
- No schema migration to reverse (no DB changes in this sprint).
- No data mutations — tool is read-only.

Rollback is a 4-file revert with no DB state impact.

---

## DDD Layer Summary

| Layer | Files |
|---|---|
| Domain — service | `domain/services/financial-reports/accruals.ts` |
| Interface — tool | `interface/mcp/tools/financial-reports/computeAccrualsTool.ts` |
| Interface — barrel | `interface/mcp/tools/financial-reports/index.ts` (modified) |
| Interface — registry | `interface/mcp/tools/registry.ts` (modified) |
| Test | `src/__tests__/1878b-compute-accruals.test.ts` |
