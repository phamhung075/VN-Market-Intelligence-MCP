/**
 * bctcScalarAggregator.ts — Aggregate bctc_table_rows into financial_reports scalar columns
 *
 * Sprint FU-TRUST-REFRESH, Task FU-6c (root-cause fix)
 * DDD layer: domain — pure function, zero I/O, zero infrastructure/interface imports.
 *
 * Single responsibility: given an array of BctcTableRow records (code, value_current,
 * unit), return a typed ScalarAggregateResult (scalars + balanceViolation) that can be
 * directly used by finalizeBctcRefineTool.
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
 *     codes 280/270/440 → total_assets (LABEL-CANONICAL: prefer label match first,
 *                          then code as tiebreaker; "280=TỔNG CỘNG TÀI SẢN" preferred
 *                          over "270=V. Tài sản dài hạn khác" which is a sub-section)
 *     code "300" → total_liabilities     (corporate: Nợ phải trả)
 *     code "400" → equity_total          (corporate: Vốn chủ sở hữu)
 *     code "100" → current_assets        (corporate: Tài sản ngắn hạn)
 *   Income statement (corporate):
 *     code "10"  → net_revenue           (Doanh thu thuần)
 *     code "20"  → gross_profit          (Lợi nhuận gộp)
 *     code "50"  → profit_before_tax     (Lợi nhuận trước thuế)
 *     code "60"  → net_profit            (Lợi nhuận sau thuế)
 *   Income statement (bank Mẫu B02-TCTD — no gross profit concept):
 *     code "I" + labelHint=/thu nhập|doanh thu/i → net_revenue
 *     code "VIII"→ profit_before_tax     (Lợi nhuận trước thuế)
 *     code "IX"  → net_profit            (Lợi nhuận sau thuế)
 *   Bank balance sheet uses label-canonical with exclusion filters (no 270/300/400 codes).
 *
 * BALANCE-IDENTITY INVARIANT:
 *   After resolution, enforceBalanceIdentity checks:
 *     |total_liabilities + equity_total − total_assets| / total_assets < 1%
 *   A violation means at least one pick was wrong. balanceViolation is set to a
 *   descriptive string; the caller must NOT write the inconsistent scalars.
 *
 * NULL semantics:
 *   A scalar is NULL when the corresponding code/label is genuinely absent from the row set
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

// ── Output types ──────────────────────────────────────────────────────────────

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

/**
 * ScalarAggregateResult — wraps the scalars with an optional balance-identity
 * violation string. When balanceViolation is non-null, the scalars are internally
 * inconsistent and MUST NOT be written to financial_reports.
 *
 * The caller (finalizeBctcRefineTool) checks this field and logs.error + skips
 * the UPDATE when violation is present. Domain layer stays pure — no logger import.
 */
export interface ScalarAggregateResult {
  scalars: ScalarAggregate;
  balanceViolation: string | null;
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
 * Find the value_current for a specific BCTC code.
 *
 * @param rows           All rows to search
 * @param code           Exact code to match (trimmed)
 * @param labelHint      Optional: filter matches to rows whose label also matches
 *                       this pattern. If no hinted match found, falls back to
 *                       un-hinted result (the hint narrows, never eliminates).
 * @param statementSection  Optional: restrict to rows in this section
 *
 * Priority: is_summary_row=1 > is_summary_row=0 (header rows take precedence).
 *
 * FIX (FU-6c): Added labelHint to resolve code "I" collision between bank balance
 * sheet ("Tiền mặt, vàng bạc, đá quý") and income statement ("Thu nhập lãi thuần").
 */
function findByCode(
  rows: AggregatorRow[],
  code: string,
  labelHint?: RegExp,
  statementSection?: string,
): number | null {
  let candidates = rows.filter((r) => r.code?.trim() === code);
  if (statementSection !== undefined) {
    candidates = candidates.filter((r) => r.statement_section === statementSection);
  }
  if (candidates.length === 0) return null;

  if (labelHint !== undefined) {
    const hinted = candidates.filter((r) => labelHint.test(r.label));
    if (hinted.length > 0) {
      // Among hinted matches, prefer summary row
      const summaryHinted = hinted.find((r) => r.is_summary_row === 1);
      const best = summaryHinted ?? hinted[0]!;
      return best.value_current ?? null;
    }
    // No hinted match — fall through to un-hinted with a note (caller-visible via null risk)
    // The un-hinted fallback ensures backward-compatibility for simpler fixtures.
  }

  // No hint or hint found no match — use summary preference
  const summaryMatch = candidates.find((r) => r.is_summary_row === 1);
  const best = summaryMatch ?? candidates[0]!;
  return best.value_current ?? null;
}

// ── Label-based lookup helpers ────────────────────────────────────────────────

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

/**
 * Find a value by label with EXCLUSION filter.
 *
 * Returns the first summary-preferred match where the label matches `includePattern`
 * AND does NOT match `excludePattern`.
 *
 * FIX (FU-6c): Used for bank equity resolution to exclude
 * "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" (contains "vốn chủ sở hữu" as substring)
 * from matching the equity pattern, picking only the pure "VỐN CHỦ SỞ HỮU" row.
 *
 * Also used for bank total_assets to exclude rows containing "nợ" or "nguồn vốn"
 * (prevents "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" from matching total_assets pattern).
 */
function findByLabelExcluding(
  rows: AggregatorRow[],
  section: string,
  includePattern: RegExp,
  excludePattern: RegExp,
): number | null {
  const matching = rows.filter(
    (r) =>
      r.statement_section === section &&
      includePattern.test(r.label) &&
      !excludePattern.test(r.label),
  );
  if (matching.length === 0) return null;
  const summaryMatch = matching.find((r) => r.is_summary_row === 1);
  const best = summaryMatch ?? matching[0]!;
  return best.value_current ?? null;
}

/**
 * findTotalAssetsCorporate — label-canonical strategy for corporate balance sheet.
 *
 * STRATEGY (FU-6c root-cause fix):
 * Do NOT search by code first. FPT's Mẫu B01-DN uses code 280 for total assets,
 * not code 270 (which maps to "V. Tài sản dài hạn khác" — a sub-section, not the total).
 *
 * 1. Find rows whose label matches the grand-total pattern across ALL sections
 *    (FPT balance sheet rows land in "general" not "balance_sheet" due to layout gap).
 * 2. Among those, prefer rows where code is "280" or "270" over code "440" (equity side).
 * 3. If only code "440" found (Tổng cộng nguồn vốn = same value), accept it.
 * 4. Falls back to null only when no matching label found.
 *
 * The balance-identity invariant will catch any wrong pick downstream.
 */
function findTotalAssetsCorporate(rows: AggregatorRow[]): number | null {
  // Grand-total label pattern: matches "TỔNG CỘNG TÀI SẢN", "TỔNG TÀI SẢN",
  // and OCR-diacritic-degraded variants.
  const TOTAL_ASSETS_LABEL =
    /t[oổ]ng\s+c[oộ]ng\s+t[aà]i\s+s[aả]n|t[oổ]ng\s+t[aà]i\s+s[aả]n/i;

  const candidates = rows.filter((r) => TOTAL_ASSETS_LABEL.test(r.label));
  if (candidates.length === 0) return null;

  // Among candidates, prefer is_summary_row=1
  const summaries = candidates.filter((r) => r.is_summary_row === 1);
  const pool = summaries.length > 0 ? summaries : candidates;

  // Prefer asset-side codes (280, 270) over equity-side (440)
  const assetSide = pool.filter(
    (r) => r.code?.trim() === "280" || r.code?.trim() === "270",
  );
  if (assetSide.length > 0) {
    // If multiple asset-side, prefer code "280" (FPT pattern) over "270"
    const code280 = assetSide.find((r) => r.code?.trim() === "280");
    const best = code280 ?? assetSide[0]!;
    return best.value_current ?? null;
  }

  // No asset-side code match — accept equity-side (440) or any match
  // (Tổng cộng nguồn vốn always equals total assets; same numeric value)
  const best = pool[0]!;
  return best.value_current ?? null;
}

// ── Balance-identity invariant ────────────────────────────────────────────────

/**
 * enforceBalanceIdentity — check total_liabilities + equity_total ≈ total_assets.
 *
 * Returns a violation string when the identity fails (> 1% deviation), or null when ok.
 *
 * The 1% tolerance accommodates VND rounding across thousands of rows.
 * Only enforced when all three values are non-null and total_assets > 0.
 *
 * FU-6c invariant:
 *   FPT wrong-pick: total_assets=3,399,067M vs liabilities=28,464,058M + equity=40,122,037M
 *     → computed=68,586,095M vs total=3,399,067M → deviation=1,917% → VIOLATION
 *   ACB wrong equity: equity=1,030,900,741M vs liabilities=932,149,689M + correct_eq=98,751,052M
 *     → computed=2,063,050,430M vs total=1,030,900,741M → deviation=100% → VIOLATION
 */
function enforceBalanceIdentity(
  total_assets: number | null,
  total_liabilities: number | null,
  equity_total: number | null,
): string | null {
  if (total_assets === null || total_liabilities === null || equity_total === null) {
    return null; // Cannot enforce when any component is absent
  }
  if (total_assets === 0) return null; // Division guard

  const computed = total_liabilities + equity_total;
  const deviation = Math.abs(computed - total_assets) / total_assets;

  if (deviation > 0.01) {
    return (
      `BALANCE IDENTITY VIOLATED: ` +
      `total_assets=${total_assets} ≠ liabilities(${total_liabilities}) + equity(${equity_total}) = ${computed} ` +
      `(deviation=${(deviation * 100).toFixed(2)}%)`
    );
  }

  return null;
}

// ── Label patterns (banking sector) ──────────────────────────────────────────

// Bank income statement: "Thu nhập lãi thuần" (net interest income → maps to net_revenue)
const P_BANK_NET_REVENUE =
  /thu\s+nh[aậ]p\s+l[aã]i\s+thu[aầ]n|net\s+interest\s+income/i;

// Bank balance sheet: total assets (Tổng tài sản)
// NOTE: Used with findByLabelExcluding to avoid matching "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU"
const P_BANK_TOTAL_ASSETS = /t[oổ]ng\s+t[aà]i\s+s[aả]n/i;

// Bank total_assets exclusion: rows containing these must NOT be picked as total_assets
const P_BANK_TOTAL_ASSETS_EXCLUDE = /n[oợ]|ngu[oồ]n\s+v[oố]n|ph[aả]i\s+tr[aả]/i;

// Bank balance sheet: total liabilities (Tổng nợ phải trả)
const P_BANK_TOTAL_LIABILITIES = /t[oổ]ng\s+n[oợ]\s+ph[aả]i\s+tr[aả]/i;

// Bank balance sheet: equity (Vốn chủ sở hữu / Tổng vốn chủ sở hữu)
const P_BANK_EQUITY = /v[oố]n\s+ch[uủ]\s+s[oở]\s+h[uữ]u/i;

// Bank equity exclusion: rows also containing "tổng nợ phải trả" or "nguồn vốn"
// are the combined-line (equity + liabilities) — NOT the pure equity row.
// FU-6c root cause: "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" contains "vốn chủ sở hữu"
// as a substring and matched before the pure "VỐN CHỦ SỞ HỮU" row.
const P_BANK_EQUITY_EXCLUDE = /t[oổ]ng\s+n[oợ]\s+ph[aả]i\s+tr[aả]|ngu[oồ]n\s+v[oố]n/i;

// Both types: profit before tax
const P_PBT = /l[oợ]i\s+nhu[aậ]n\s+tr[uướ]c\s+thu[eế]|profit\s+before\s+tax/i;

// Both types: net profit (Lợi nhuận sau thuế)
const P_NET_PROFIT = /l[oợ]i\s+nhu[aậ]n\s+sau\s+thu[eế]|net\s+profit|net\s+income/i;

// Bank code "I" labelHint: must match income statement rows, not balance sheet assets
// Excludes "Tiền mặt, vàng bạc, đá quý" (code "I" in bank balance sheet) from matching
const P_BANK_CODE_I_HINT = /thu\s+nh[aậ]p|doanh\s+thu/i;

// ── Main aggregator ───────────────────────────────────────────────────────────

/**
 * aggregateScalars — derive financial_reports scalar columns from bctc_table_rows.
 *
 * Step 1: detect unit scale from max value magnitude.
 * Step 2: try numeric BCTC codes (corporate Mẫu B01/B02).
 *   - total_assets: LABEL-CANONICAL via findTotalAssetsCorporate (FU-6c fix)
 *   - net_revenue bank code "I": labelHint=/thu nhập|doanh thu/ (FU-6c fix)
 * Step 3: fall back to label patterns (bank Mẫu B02-TCTD where codes differ).
 *   - equity: findByLabelExcluding excludes "TỔNG NỢ PHẢI TRẢ..." (FU-6c fix)
 *   - total_assets bank: findByLabelExcluding excludes nợ/nguồn vốn (FU-6c fix)
 * Step 4: compute derived ratios (gross_margin_pct, net_margin_pct) from primary scalars.
 * Step 5: enforceBalanceIdentity — returns violation string if inconsistent.
 * Step 6: return ScalarAggregateResult { scalars, balanceViolation }.
 *   - NULL for any scalar that cannot be determined — never force 0.
 *   - balanceViolation != null → caller MUST skip the scalar UPDATE.
 *
 * @param rows  All bctc_table_rows for one report (from finalize INSERT phase)
 * @returns     ScalarAggregateResult in million VND; null fields = genuinely absent
 */
export function aggregateScalars(rows: AggregatorRow[]): ScalarAggregateResult {
  const emptyScalars: ScalarAggregate = {
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

  if (rows.length === 0) {
    return { scalars: emptyScalars, balanceViolation: null };
  }

  const divisor = detectDivisor(rows);

  // ── Helper: apply unit scale and return null for null inputs ─────────────────
  const scale = (v: number | null): number | null =>
    v === null ? null : v / divisor;

  // ── Income statement scalars ──────────────────────────────────────────────────

  // net_revenue: corporate code "10", bank code "I" (with labelHint) or label-based
  let net_revenue = scale(findByCode(rows, "10"));
  if (net_revenue === null) {
    // Bank: code "I" (Roman numeral, Mẫu B02-TCTD)
    // FU-6c fix: labelHint filters out balance sheet "Tiền mặt, vàng bạc, đá quý"
    // which also uses code "I" in ACB's general section.
    net_revenue = scale(findByCode(rows, "I", P_BANK_CODE_I_HINT));
  }
  if (net_revenue === null) {
    // Bank label fallback
    net_revenue = scale(
      findByLabel(rows, "income_statement", P_BANK_NET_REVENUE) ??
      findByLabel(rows, "general", P_BANK_NET_REVENUE),
    );
  }

  // gross_profit: corporate code "20"; banks have no gross profit concept
  const gross_profit = scale(findByCode(rows, "20"));
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

  // total_assets (corporate): LABEL-CANONICAL strategy (FU-6c root-cause fix)
  // FPT uses code "280" not "270" for the grand total. Old code hardcoded "270"
  // and found "V. Tài sản dài hạn khác" (3.4T) instead of "TỔNG CỘNG TÀI SẢN" (68.6T).
  let total_assets = scale(findTotalAssetsCorporate(rows));

  if (total_assets === null) {
    // Bank label fallback with EXCLUSION (FU-6c fix for bank path):
    // Exclude rows whose label also contains "nợ" or "nguồn vốn" to prevent
    // "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" from matching the total-assets pattern.
    total_assets = scale(
      findByLabelExcluding(rows, "balance_sheet", P_BANK_TOTAL_ASSETS, P_BANK_TOTAL_ASSETS_EXCLUDE) ??
      findByLabelExcluding(rows, "general",       P_BANK_TOTAL_ASSETS, P_BANK_TOTAL_ASSETS_EXCLUDE),
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
    // Bank fallback: use findByLabelExcluding to exclude composite rows
    // FU-6c root cause: P_BANK_EQUITY matches "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU"
    // because it contains "vốn chủ sở hữu" as a substring. The composite row
    // appears first in row_order in ACB's general section → wrong pick (1,030,900,741M
    // instead of correct 98,751,052M).
    equity_total = scale(
      findByLabelExcluding(rows, "balance_sheet", P_BANK_EQUITY, P_BANK_EQUITY_EXCLUDE) ??
      findByLabelExcluding(rows, "general", P_BANK_EQUITY, P_BANK_EQUITY_EXCLUDE),
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

  const scalars: ScalarAggregate = {
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

  // ── Balance-identity invariant (fail-loud gate) ───────────────────────────────
  // Enforces: total_liabilities + equity_total ≈ total_assets (1% tolerance).
  // A violation means at least one row pick was wrong. The caller must NOT write
  // inconsistent scalars to financial_reports.
  const balanceViolation = enforceBalanceIdentity(
    total_assets,
    total_liabilities,
    equity_total,
  );

  return { scalars, balanceViolation };
}
