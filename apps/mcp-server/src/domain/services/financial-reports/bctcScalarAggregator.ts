/**
 * bctcScalarAggregator.ts — Aggregate bctc_table_rows into financial_reports scalar columns
 *
 * Sprint FU-TRUST-REFRESH, Task FU-5 (BLOCK-1 fix)
 * DDD layer: domain — pure function, zero I/O, zero infrastructure/interface imports.
 *
 * Single responsibility: given an array of BctcTableRow records (code, value_current,
 * unit), return a typed ScalarAggregate matching the financial_reports scalar columns
 * that can be directly written by finalizeBctcRefineTool.
 *
 * UNIT CONVENTION (financial_reports columns are all million VND):
 *   The refined-markdown pipeline always stores unit="billion_vnd" regardless of the
 *   actual scale declared in the source BCTC PDF.  The scale is detected from the
 *   largest absolute value in the row set:
 *     max > 1e11  → values are raw VND (e.g. FPT: 68 trillion)  → divide by 1e6
 *     max ≤ 1e11  → values are million VND (e.g. ACB: 1.03 billion triệu) → use as-is
 *   A row whose value_current is null contributes nothing to the max computation.
 *
 * CODE → COLUMN MAPPING (reused from parseBctcReport/storeReport DRY principle):
 *   Balance sheet (corporate Mẫu B01-DN / bank Mẫu B02-TCTD):
 *     code "270" → total_assets          (corporate: TSNH + TSDH = Tổng tài sản)
 *     code "440" → total_assets          (corporate: 440 = 270 = Tổng cộng nguồn vốn)
 *     code "300" → total_liabilities     (corporate: Nợ phải trả)
 *     code "400" → equity_total          (corporate: Vốn chủ sở hữu)
 *     code "100" → current_assets        (corporate: Tài sản ngắn hạn)
 *   Income statement (corporate):
 *     code "10"  → net_revenue           (Doanh thu thuần)
 *     code "20"  → gross_profit          (Lợi nhuận gộp)
 *     code "50"  → profit_before_tax     (Lợi nhuận trước thuế)
 *     code "60"  → net_profit            (Lợi nhuận sau thuế)
 *   Income statement (bank Mẫu B02-TCTD — no gross profit concept):
 *     code "I"   → net_revenue           (Thu nhập lãi thuần — bank equivalent of net revenue)
 *     code "VIII"→ profit_before_tax     (Lợi nhuận trước thuế)
 *     code "IX"  → net_profit            (Lợi nhuận sau thuế)
 *   Bank balance sheet uses its own label-based approach (no 270/300/400 codes).
 *   When numeric codes are absent, fall back to label matching for bank grand totals.
 *
 * NULL semantics:
 *   A scalar is NULL when the corresponding code is genuinely absent from the row set
 *   (the line item does not exist in this report type or was not extracted).
 *   NULL ≠ 0: writing 0 would be a forced-zero (DT-2 mock signature).
 *   The caller (finalizeBctcRefineTool) must use SET col = ? only for non-null scalars,
 *   leaving columns untouched when the aggregate returns null (see COALESCE pattern).
 *
 * IDEMPOTENCY:
 *   Pure function — given identical inputs, produces identical output.
 *   The caller writes the result inside the same transaction as the row INSERT,
 *   guaranteeing consistency on re-runs.
 *
 * @module domain/services/financial-reports/bctcScalarAggregator
 */

// ── Lightweight row type (DDD-isolated, no application-layer dependency) ──────

export interface AggregatorRow {
  code: string | null;
  label: string;
  value_current: number | null;
  statement_section: string;
  is_summary_row: number;
  unit: string;
}

// ── Output type ───────────────────────────────────────────────────────────────

/**
 * ScalarAggregate — mirrors the scalar columns written by storeReport in parseBctcReport.
 * All values are in million VND, or null if the line item is absent.
 */
export interface ScalarAggregate {
  net_revenue: number | null;
  gross_profit: number | null;
  profit_before_tax: number | null;
  net_profit: number | null;
  total_assets: number | null;
  current_assets: number | null;
  total_liabilities: number | null;
  equity_total: number | null;
  gross_margin_pct: number | null;
  net_margin_pct: number | null;
}

// ── Unit scale detection ──────────────────────────────────────────────────────

/**
 * RAW_VND_THRESHOLD: values above this are considered raw VND and must be
 * divided by 1,000,000 to convert to million VND.
 *
 * Rationale: Vietnam's smallest listed companies have total assets > 100 billion VND
 * = 100,000 million VND in the million-VND scale, which is < 1e11 as a raw-VND number.
 * A raw-VND total-assets of 100 billion = 1e11. Thus 1e11 cleanly splits the two scales.
 */
const RAW_VND_THRESHOLD = 1e11;

/**
 * Detect the unit divisor from the row set's maximum absolute value.
 *
 * Returns 1_000_000 when values are in raw VND, 1 when in million VND.
 */
function detectDivisor(rows: AggregatorRow[]): number {
  let maxAbs = 0;
  for (const row of rows) {
    if (row.value_current !== null) {
      const abs = Math.abs(row.value_current);
      if (abs > maxAbs) maxAbs = abs;
    }
  }
  return maxAbs > RAW_VND_THRESHOLD ? 1_000_000 : 1;
}

// ── Code-based lookup helpers ─────────────────────────────────────────────────

/**
 * Find the value_current for a specific BCTC code, across all statement sections.
 * Returns null if the code is absent or has a null value.
 *
 * Priority: is_summary_row=1 > is_summary_row=0 (header rows take precedence).
 */
function findByCode(rows: AggregatorRow[], code: string): number | null {
  const matching = rows.filter((r) => r.code?.trim() === code);
  if (matching.length === 0) return null;
  // Prefer summary rows
  const summaryMatch = matching.find((r) => r.is_summary_row === 1);
  const best = summaryMatch ?? matching[0]!;
  return best.value_current ?? null;
}

// ── Label-based lookup helpers (bank fallback) ────────────────────────────────

/**
 * Find a value by label pattern in a specific statement section.
 * Returns the first match (summary preferred).
 */
function findByLabel(
  rows: AggregatorRow[],
  section: string,
  pattern: RegExp,
): number | null {
  const matching = rows.filter(
    (r) => r.statement_section === section && pattern.test(r.label),
  );
  if (matching.length === 0) return null;
  const summaryMatch = matching.find((r) => r.is_summary_row === 1);
  const best = summaryMatch ?? matching[0]!;
  return best.value_current ?? null;
}

// ── Label patterns (banking sector) ──────────────────────────────────────────

// Bank income statement: "Thu nhập lãi thuần" (net interest income → maps to net_revenue)
const P_BANK_NET_REVENUE =
  /thu\s+nh[aậ]p\s+l[aã]i\s+thu[aầ]n|net\s+interest\s+income/i;

// Bank balance sheet: total assets (Tổng tài sản)
const P_BANK_TOTAL_ASSETS = /t[oổ]ng\s+t[aà]i\s+s[aả]n/i;

// Bank balance sheet: total liabilities (Tổng nợ phải trả)
const P_BANK_TOTAL_LIABILITIES = /t[oổ]ng\s+n[oợ]\s+ph[aả]i\s+tr[aả]/i;

// Bank balance sheet: equity (Vốn chủ sở hữu / Tổng vốn chủ sở hữu)
const P_BANK_EQUITY = /v[oố]n\s+ch[uủ]\s+s[oở]\s+h[uữ]u/i;

// Both types: profit before tax
const P_PBT = /l[oợ]i\s+nhu[aậ]n\s+tr[uướ]c\s+thu[eế]|profit\s+before\s+tax/i;

// Both types: net profit (Lợi nhuận sau thuế)
const P_NET_PROFIT = /l[oợ]i\s+nhu[aậ]n\s+sau\s+thu[eế]|net\s+profit|net\s+income/i;

// ── Main aggregator ───────────────────────────────────────────────────────────

/**
 * aggregateScalars — derive financial_reports scalar columns from bctc_table_rows.
 *
 * Step 1: detect unit scale from max value magnitude.
 * Step 2: try numeric BCTC codes (corporate Mẫu B01/B02).
 * Step 3: fall back to label patterns (bank Mẫu B02-TCTD where codes differ).
 * Step 4: compute derived ratios (gross_margin_pct, net_margin_pct) from primary scalars.
 * Step 5: return NULL for any scalar that cannot be determined — never force 0.
 *
 * @param rows  All bctc_table_rows for one report (from finalize INSERT phase)
 * @returns     ScalarAggregate in million VND; null fields = genuinely absent
 */
export function aggregateScalars(rows: AggregatorRow[]): ScalarAggregate {
  if (rows.length === 0) {
    return {
      net_revenue: null,
      gross_profit: null,
      profit_before_tax: null,
      net_profit: null,
      total_assets: null,
      current_assets: null,
      total_liabilities: null,
      equity_total: null,
      gross_margin_pct: null,
      net_margin_pct: null,
    };
  }

  const divisor = detectDivisor(rows);

  // ── Helper: apply unit scale and return null for null inputs ─────────────────
  const scale = (v: number | null): number | null =>
    v === null ? null : v / divisor;

  // ── Income statement scalars ──────────────────────────────────────────────────

  // net_revenue: corporate code "10", bank code "I" or label-based
  let net_revenue = scale(findByCode(rows, "10"));
  if (net_revenue === null) {
    // Bank: code "I" (Roman numeral, often used in Mẫu B02-TCTD)
    net_revenue = scale(findByCode(rows, "I"));
  }
  if (net_revenue === null) {
    // Bank label fallback
    net_revenue = scale(
      findByLabel(rows, "income_statement", P_BANK_NET_REVENUE) ??
      findByLabel(rows, "general", P_BANK_NET_REVENUE),
    );
  }

  // gross_profit: corporate code "20"; banks have no gross profit concept
  let gross_profit = scale(findByCode(rows, "20"));
  // No label fallback for gross_profit — absent for banks → NULL

  // profit_before_tax: corporate code "50", bank code "VIII" or label-based
  let profit_before_tax = scale(findByCode(rows, "50"));
  if (profit_before_tax === null) {
    profit_before_tax = scale(findByCode(rows, "VIII"));
  }
  if (profit_before_tax === null) {
    profit_before_tax = scale(
      findByLabel(rows, "income_statement", P_PBT) ??
      findByLabel(rows, "general", P_PBT),
    );
  }

  // net_profit: corporate code "60", bank code "IX" or label-based
  let net_profit = scale(findByCode(rows, "60"));
  if (net_profit === null) {
    net_profit = scale(findByCode(rows, "IX"));
  }
  if (net_profit === null) {
    net_profit = scale(
      findByLabel(rows, "income_statement", P_NET_PROFIT) ??
      findByLabel(rows, "general", P_NET_PROFIT),
    );
  }

  // ── Balance sheet scalars ─────────────────────────────────────────────────────

  // total_assets: corporate codes "270" (Tổng tài sản) or "440" (Tổng cộng nguồn vốn)
  // Both should equal; prefer "270" as it is the primary asset-side total.
  let total_assets = scale(findByCode(rows, "270"));
  if (total_assets === null) {
    total_assets = scale(findByCode(rows, "440"));
  }
  if (total_assets === null) {
    // Bank label fallback (banks do not use 270/440 scheme)
    total_assets = scale(
      findByLabel(rows, "balance_sheet", P_BANK_TOTAL_ASSETS) ??
      findByLabel(rows, "general", P_BANK_TOTAL_ASSETS),
    );
  }

  // current_assets: corporate code "100" (Tài sản ngắn hạn)
  const current_assets = scale(findByCode(rows, "100"));
  // No label fallback — banks omit this code; NULL is correct

  // total_liabilities: corporate code "300" (Nợ phải trả)
  let total_liabilities = scale(findByCode(rows, "300"));
  if (total_liabilities === null) {
    total_liabilities = scale(
      findByLabel(rows, "balance_sheet", P_BANK_TOTAL_LIABILITIES) ??
      findByLabel(rows, "general", P_BANK_TOTAL_LIABILITIES),
    );
  }

  // equity_total: corporate code "400" (Vốn chủ sở hữu)
  let equity_total = scale(findByCode(rows, "400"));
  if (equity_total === null) {
    equity_total = scale(
      findByLabel(rows, "balance_sheet", P_BANK_EQUITY) ??
      findByLabel(rows, "general", P_BANK_EQUITY),
    );
  }

  // ── Derived ratios ─────────────────────────────────────────────────────────────

  // gross_margin_pct: only meaningful when both gross_profit and net_revenue present and non-zero
  let gross_margin_pct: number | null = null;
  if (gross_profit !== null && net_revenue !== null && net_revenue !== 0) {
    gross_margin_pct = (gross_profit / net_revenue) * 100;
  }

  // net_margin_pct: only when both net_profit and net_revenue present and non-zero
  let net_margin_pct: number | null = null;
  if (net_profit !== null && net_revenue !== null && net_revenue !== 0) {
    net_margin_pct = (net_profit / net_revenue) * 100;
  }

  return {
    net_revenue,
    gross_profit,
    profit_before_tax,
    net_profit,
    total_assets,
    current_assets,
    total_liabilities,
    equity_total,
    gross_margin_pct,
    net_margin_pct,
  };
}
