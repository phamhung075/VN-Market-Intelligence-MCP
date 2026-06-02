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

// BEQ-8: import the proven BANK-AWARE-BCTC discriminator (DRY — single SSOT)
// Domain→domain import is allowed; both are in domain/services/financial-reports/.
// This replaces the local `findByCode(rows,"10")===null` false-positive proxy.
import { isBankFormFromRows } from "./bctcFormType.js";

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
 *
 * BEQ-3 FULL COLUMN AUDIT — added 10 previously unmapped fields.
 * Section-filter is MANDATORY for codes shared across sections (see VAS-CODE-TABLE below):
 *
 * VAS-CODE-TABLE (confirmed from live FPT 2026-Q1 bctc_table_rows):
 *   income_statement section:
 *     code "10" → net_revenue         (Doanh thu thuần)
 *     code "20" → gross_profit        (Lợi nhuận gộp)
 *     code "30" → operating_profit    (Lợi nhuận thuần từ HĐKD) ← NEW
 *     code "50" → profit_before_tax   (Tổng LN kế toán trước thuế)
 *     code "60" → net_profit          (LN sau thuế TNDN)
 *   cash_flow section:
 *     code "20" → operating_cf        (Lưu chuyển tiền từ HĐKD) ← NEW; section filter req
 *     code "21" → capex               (Tiền chi mua sắm TSCĐ) ← NEW; negative = outflow
 *     code "02" → depreciation_amort  (Khấu hao TSCĐ) ← used for EBITDA derivation
 *     code "30" → investing_cf        (Lưu chuyển tiền từ HĐ đầu tư) ← NEW; section filter
 *     code "40" → financing_cf        (Lưu chuyển tiền từ HĐ tài chính) ← NEW; section filter
 *   general/balance_sheet section:
 *     code "110" → cash               (Tiền và các khoản tương đương tiền) ← NEW
 *   Derived:
 *     ebitda         = operating_profit + depreciation_amortization
 *     free_cash_flow = operating_cf + capex_raw (capex_raw is negative, so result = OCF - |capex|)
 *   Not mappable from standard BCTC codes:
 *     eps / diluted_eps — absent from FPT corpus; kept null (no standard VAS code)
 */
export interface ScalarAggregate {
  // Original 10 fields (unchanged)
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
  // BEQ-3 NEW: previously unmapped scalar columns
  /** Corporate code "30" in income_statement — Lợi nhuận thuần từ hoạt động kinh doanh */
  operating_profit: number | null;
  /** Derived: operating_profit + depreciation_amortization (CF code "02"). Null if either absent. */
  ebitda: number | null;
  /** Balance sheet code "110" — Tiền và các khoản tương đương tiền */
  cash: number | null;
  /** EPS — no standard VAS code in corpus; kept null (BCTC-EPS-FOOTNOTE future work) */
  eps: number | null;
  /** Diluted EPS — no standard VAS code; null */
  diluted_eps: number | null;
  /** Cash flow code "20" in cash_flow section — Lưu chuyển tiền từ hoạt động kinh doanh */
  operating_cf: number | null;
  /** Cash flow code "30" in cash_flow section — Lưu chuyển tiền từ hoạt động đầu tư */
  investing_cf: number | null;
  /** Cash flow code "40" in cash_flow section — Lưu chuyển tiền từ hoạt động tài chính */
  financing_cf: number | null;
  /** Cash flow code "21" in cash_flow section — Tiền chi mua sắm TSCĐ (negative = outflow) */
  capex: number | null;
  /** Derived: operating_cf + capex (capex is negative, so this = OCF - |capex|). Null if either absent. */
  free_cash_flow: number | null;
}

/**
 * ScalarAggregateResult — wraps the scalars with an optional balance-identity
 * violation string and a set of NOT-APPLICABLE column names.
 *
 * When balanceViolation is non-null, the scalars are internally inconsistent and
 * MUST NOT be written to financial_reports. Domain layer stays pure — no logger import.
 *
 * notApplicable: columns that are structurally absent for this report type (NOT a
 * parse miss — the concept simply does not exist). The finalize tool must SET these
 * columns to NULL explicitly to clear any stale legacy value (e.g. ACB gross_profit
 * persisting from the original pdf-parse ingest). Columns NOT in this set and whose
 * scalar is null are SKIPPED (preserve prior value — FU-5 intent for transient misses).
 *
 * FU-6e: bank report type → notApplicable = ["gross_profit", "current_assets",
 * "gross_margin_pct"]. Corporate → notApplicable = [].
 *
 * Report-type detection: bank path is triggered when code "10" (corporate net_revenue)
 * is absent from the row set — the same branch the aggregator uses to fall through to
 * the bank code "I" path. DRY: no separate detector.
 */
export interface ScalarAggregateResult {
  scalars: ScalarAggregate;
  balanceViolation: string | null;
  /** Column names that are NOT APPLICABLE for this report type (must be SET NULL, not skipped). */
  notApplicable: string[];
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
 *                       this pattern. When provided and a hinted match is found,
 *                       the hinted row wins. When provided but NO hinted match exists,
 *                       returns null (strict hint — caller's label-based fallback fires).
 *                       This is the correct behavior for bank Roman-code disambiguation:
 *                       if code "VIII" has no "lợi nhuận trước thuế" row, the balance-
 *                       sheet collision row must NOT be returned; the caller's P_PBT
 *                       label lookup should run instead.
 * @param statementSection  Optional: restrict to rows in this section
 *
 * Priority: is_summary_row=1 > is_summary_row=0 (header rows take precedence).
 *
 * FIX (FU-6c): Added labelHint to resolve code "I" collision between bank balance
 * sheet ("Tiền mặt, vàng bạc, đá quý") and income statement ("Thu nhập lãi thuần").
 *
 * FIX (FU-6d BLOCK-B): labelHint is now STRICT — no hinted match → return null,
 * allowing the caller's label-based fallback to run. Previously the un-hinted result
 * was returned as a fallback, which caused balance-sheet collision rows to win when
 * the target income row was absent (e.g., code "VIII" returning "Chứng khoán đầu tư"
 * instead of null when "Lợi nhuận trước thuế" is not in the row set).
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
    // FU-6d BLOCK-B: strict hint — no match → return null so caller's fallback fires.
    // Prevents balance-sheet collision rows from winning when the target income row
    // is absent. The caller should fall through to label-based lookup.
    return null;
  }

  // No hint — use summary preference
  const summaryMatch = candidates.find((r) => r.is_summary_row === 1);
  const best = summaryMatch ?? candidates[0]!;
  return best.value_current ?? null;
}

// ── Label-based lookup helpers ────────────────────────────────────────────────

/**
 * Find a value by label pattern in a specific statement section.
 * Returns the best match (summary preferred, non-null preferred over null-valued headers).
 *
 * FIX (FU-6d) — NULL-VALUE SKIP (BLOCK-A generalization):
 * Prefer non-null candidates over null-valued section headers.
 * Same policy as findByLabelExcluding — null-valued rows are never a valid pick.
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

  // FU-6d BLOCK-A: prefer non-null candidates over null-valued section headers
  const nonNull = matching.filter((r) => r.value_current !== null);
  const pool = nonNull.length > 0 ? nonNull : matching;

  const summaryMatch = pool.find((r) => r.is_summary_row === 1);
  const best = summaryMatch ?? pool[0]!;
  return best.value_current ?? null;
}

/**
 * Find a value by label with EXCLUSION filter.
 *
 * Returns the best match where the label matches `includePattern`
 * AND does NOT match `excludePattern`.
 *
 * FIX (FU-6c): Used for bank equity resolution to exclude
 * "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" (contains "vốn chủ sở hữu" as substring)
 * from matching the equity pattern, picking only the pure "VỐN CHỦ SỞ HỮU" row.
 *
 * Also used for bank total_assets to exclude rows containing "nợ" or "nguồn vốn"
 * (prevents "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" from matching total_assets pattern).
 *
 * FIX (FU-6d) — NULL-VALUE SKIP (BLOCK-A generalization):
 * A null-valued candidate is a section header with no actual data. It must NEVER win
 * over a non-null candidate, regardless of row_order or is_summary_row.
 * Priority order: (1) is_summary_row=1 AND non-null, (2) any non-null candidate,
 * (3) is_summary_row=1 with null value, (4) null candidate — return null.
 * Applied globally to ALL label-based resolution (bank AND corporate paths).
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

  // FU-6d BLOCK-A: prefer non-null candidates over null-valued section headers.
  // A null-valued row is a section heading with no data — it must never win over
  // a real data row, regardless of row_order.
  const nonNull = matching.filter((r) => r.value_current !== null);
  const pool = nonNull.length > 0 ? nonNull : matching;

  const summaryMatch = pool.find((r) => r.is_summary_row === 1);
  const best = summaryMatch ?? pool[0]!;
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
  // FU-6d BLOCK-C: FAIL-LOUD on partially-unresolved required balance scalars.
  //
  // {total_assets, total_liabilities, equity_total} are REQUIRED for the balance
  // identity check. When ALL three are null, the balance sheet is simply absent
  // from the row set (income-statement-only report) → silently skip the check.
  // But when AT LEAST ONE is non-null (balance sheet partially present), a null
  // among the three means a resolution failure, not structural absence.
  //
  // This distinction handles two cases correctly:
  //   (a) Income-only fixture (DV-FU5-3): all three null → skip check (return null)
  //   (b) ACB live bug: total_assets=1,030,900,741, liabilities=932,149,689, equity=null
  //       → equity null with the other two present = resolution failure → FAIL-LOUD
  //
  // Legitimately-absent fields (bank gross_profit, bank current_assets) are NOT in
  // this set and must NOT trigger the violation — they are separate scalar columns
  // that the balance identity never references.
  //
  // Returning a non-null violation here causes the caller (finalizeBctcRefineTool)
  // to log.error + skip the scalar UPDATE — the stale value persists but is VISIBLE
  // in logs, not silently ignored (fail-loud-on-null vs old fail-open-on-null).
  //
  // OLD behavior: return null when any component is absent (silent pass → stale persists)
  // NEW behavior: if all three absent → null (skip); if any absent but not all → violation
  const allAbsent = total_assets === null && total_liabilities === null && equity_total === null;
  if (allAbsent) {
    return null; // Balance sheet structurally absent — nothing to enforce
  }
  if (total_assets === null || total_liabilities === null || equity_total === null) {
    const missing = (
      [
        total_assets      === null ? "total_assets"      : null,
        total_liabilities === null ? "total_liabilities" : null,
        equity_total      === null ? "equity_total"      : null,
      ] as (string | null)[]
    ).filter((s): s is string => s !== null).join(", ");
    return `REQUIRED SCALARS UNRESOLVED: ${missing} — balance identity cannot be verified`;
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
// FU-6d: "trước" = tr + ư(U+01B0) + ớ(U+1EDB) + c — two codepoints between tr and c.
// Character class [uướ] cannot match TWO codepoints, so old /tr[uướ]c/ failed silently.
// Fix: use non-capturing alternation tr(?:ước|uoc|u[oớ]c) to handle all OCR/encoding variants.
const P_PBT = /l[oợ]i\s+nhu[aậ]n\s+tr(?:ước|uoc|u[oớ]c)\s+thu[eế]|profit\s+before\s+tax/i;

// Both types: net profit (Lợi nhuận sau thuế)
const P_NET_PROFIT = /l[oợ]i\s+nhu[aậ]n\s+sau\s+thu[eế]|net\s+profit|net\s+income/i;

// Bank code "I" labelHint: must match income statement rows, not balance sheet assets
// Excludes "Tiền mặt, vàng bạc, đá quý" (code "I" in bank balance sheet) from matching
const P_BANK_CODE_I_HINT = /thu\s+nh[aậ]p|doanh\s+thu/i;

// FU-6d BLOCK-B: Bank code "VIII" labelHint for profit_before_tax
// ACB uses code "VIII" for BOTH balance-sheet "Chứng khoán đầu tư" (147,029,433M)
// AND income-statement "Lợi nhuận trước thuế" (5,368,138M). Without hint, candidates[0]
// (balance-sheet asset at lower row_order) wins → wrong pick.
// Hint narrows to the income-statement row. If no match, falls through to label lookup.
// FU-6d: use tr(?:ước|uoc|u[oớ]c) — same encoding fix as P_PBT (see P_PBT comment above).
const P_BANK_CODE_VIII_PBT_HINT = /l[oợ]i\s+nhu[aậ]n\s+tr(?:ước|uoc|u[oớ]c)\s+thu[eế]/i;

// FU-6d BLOCK-B: Bank code "IX" labelHint for net_profit
// ACB uses code "IX" for BOTH balance-sheet "Góp vốn, đầu tư dài hạn" (74,311M)
// AND income-statement "Lợi nhuận sau thuế TNDN" (4,320,388M). Without hint,
// the balance-sheet asset at lower row_order wins → net_profit = 74,311M (WRONG).
// Hint narrows to the income-statement row. If no match, falls through to label lookup.
const P_BANK_CODE_IX_NET_PROFIT_HINT = /l[oợ]i\s+nhu[aậ]n\s+sau\s+thu[eế]/i;

// BANK PATH ROMAN-CODE AUDIT (FU-6d) — complete enumeration:
//   Code "I"   → net_revenue:         labelHint = P_BANK_CODE_I_HINT      (done FU-6c)
//   Code "II"  → not used for income: no collision risk (not mapped in aggregator)
//   Code "III" → not used for income: no collision risk
//   Code "IV"  → not used for income: no collision risk
//   Code "V"   → not used for income: no collision risk
//   Code "VI"  → not used for income: no collision risk
//   Code "VII" → not used for income: no collision risk
//   Code "VIII"→ profit_before_tax:   labelHint = P_BANK_CODE_VIII_PBT_HINT  (FU-6d)
//   Code "IX"  → net_profit:          labelHint = P_BANK_CODE_IX_NET_PROFIT_HINT (FU-6d)
//   Code "X"   → not used for income: no collision risk (not mapped in aggregator)
//   Code "XI"  → not used for income: no collision risk
//   Code "XII" → not used for income: no collision risk
//   Code "XIII"→ not used for income: no collision risk (aggregator uses IX for net_profit)
// All mapped bank income codes (I, VIII, IX) now have labelHints. No further rounds needed.

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
    // BEQ-3: new fields
    operating_profit: null,
    ebitda: null,
    cash: null,
    eps: null,
    diluted_eps: null,
    operating_cf: null,
    investing_cf: null,
    financing_cf: null,
    capex: null,
    free_cash_flow: null,
  };

  if (rows.length === 0) {
    return { scalars: emptyScalars, balanceViolation: null, notApplicable: [] };
  }

  const divisor = detectDivisor(rows);

  // ── Bank-path detection (BEQ-8: use proven BANK-AWARE-BCTC discriminator) ────
  // REPLACED: `findByCode(rows, "10") === null` was a false-positive trap for
  // balance-sheet-only corporate rows (FPT/VNM/DHG). Code "10" is an income-stmt
  // code — absent simply because the legacy extractor produced no income rows, NOT
  // because the entity is a bank. This caused VNM/FPT/DHG to be mis-classified as
  // banks, firing the notApplicable null-clear on gross_profit/current_assets.
  //
  // FIX: use isBankFormFromRows (BANK-AWARE-BCTC, BANK-DEV-4 hybrid signal):
  //   bank ⟺ has anchored Roman/section codes AND no 3-digit corporate balance codes.
  //   Balance-sheet-only corporates have codes "100","280","300","400" (3-digit) →
  //   hasCorpBalance=true → isBankFormFromRows returns false → corporate path.
  //   Empty rows → false (fail-safe: no evidence → assume corporate).
  //
  // NOT-APPLICABLE columns for each type (FU-6e):
  //   BANK: gross_profit (no COGS concept), current_assets (no code "100" concept),
  //         gross_margin_pct (derived from gross_profit — invalid without it).
  //   CORPORATE: [] (banks-have-that-corps-lack: none relevant at this time).
  const isBankPath = isBankFormFromRows(rows);
  const notApplicable: string[] = isBankPath
    ? ["gross_profit", "current_assets", "gross_margin_pct"]
    : [];

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

  // profit_before_tax: corporate code "50", bank code "VIII" (with labelHint) or label-based
  let profit_before_tax = scale(findByCode(rows, "50"));
  if (profit_before_tax === null) {
    // Bank: code "VIII" (Roman numeral, Mẫu B02-TCTD)
    // FU-6d BLOCK-B fix: labelHint filters out balance-sheet "Chứng khoán đầu tư"
    // (ACB uses code "VIII" for both balance-sheet assets and income "Lợi nhuận trước thuế").
    // If hint finds no match, findByCode falls back to un-hinted (no ACB collision in that case).
    // Then label-based lookup as second fallback.
    profit_before_tax = scale(findByCode(rows, "VIII", P_BANK_CODE_VIII_PBT_HINT));
  }
  if (profit_before_tax === null) {
    profit_before_tax = scale(
      findByLabel(rows, "income_statement", P_PBT) ??
      findByLabel(rows, "general", P_PBT),
    );
  }

  // net_profit: corporate code "60", bank code "IX" (with labelHint) or label-based
  let net_profit = scale(findByCode(rows, "60"));
  if (net_profit === null) {
    // Bank: code "IX" (Roman numeral, Mẫu B02-TCTD)
    // FU-6d BLOCK-B fix: labelHint filters out balance-sheet "Góp vốn, đầu tư dài hạn"
    // (ACB uses code "IX" for both balance-sheet assets and income "Lợi nhuận sau thuế").
    // If hint finds no match, findByCode falls back to un-hinted.
    // Then label-based lookup as second fallback.
    net_profit = scale(findByCode(rows, "IX", P_BANK_CODE_IX_NET_PROFIT_HINT));
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

  // ── BEQ-3: New scalar mappings (section-filtered to avoid code collisions) ─────

  // operating_profit: corporate code "30" in income_statement section ONLY.
  // ⚠️  code "30" also appears in cash_flow section (= investing_cf) — section filter is mandatory.
  const operating_profit = scale(findByCode(rows, "30", undefined, "income_statement"));

  // cash: balance sheet code "110" — Tiền và các khoản tương đương tiền.
  // Present in "general" section for FPT; try both "general" and "balance_sheet".
  let cash = scale(findByCode(rows, "110", undefined, "general"));
  if (cash === null) {
    cash = scale(findByCode(rows, "110", undefined, "balance_sheet"));
  }
  if (cash === null) {
    cash = scale(findByCode(rows, "110")); // broader search as last resort
  }

  // Cash flow scalars — all filtered to "cash_flow" section to avoid income statement collisions:
  //   code "20" income_statement = gross_profit; code "20" cash_flow = operating_cf
  //   code "30" income_statement = operating_profit; code "30" cash_flow = investing_cf
  //   code "40" income_statement = other_profit; code "40" cash_flow = financing_cf
  const operating_cf = scale(findByCode(rows, "20", undefined, "cash_flow"));
  const investing_cf = scale(findByCode(rows, "30", undefined, "cash_flow"));
  const financing_cf = scale(findByCode(rows, "40", undefined, "cash_flow"));

  // capex: code "21" in cash_flow section — "Tiền chi mua sắm tài sản cố định..."
  // This is a negative number (cash outflow). Stored as-is (negative million VND).
  const capex = scale(findByCode(rows, "21", undefined, "cash_flow"));

  // depreciation_amortization: code "02" in cash_flow — reconciliation item for EBITDA.
  // Only used for EBITDA derivation; not stored as a standalone column.
  const depreciation_amort = scale(findByCode(rows, "02", undefined, "cash_flow"));

  // ebitda: operating_profit + depreciation_amortization.
  // null when either component is absent (pure domain derivation — no partial EBITDA).
  const ebitda: number | null =
    operating_profit !== null && depreciation_amort !== null
      ? operating_profit + depreciation_amort
      : null;

  // free_cash_flow: operating_cf + capex (capex is negative, so result = OCF - |capex|).
  // null when either component is absent.
  const free_cash_flow: number | null =
    operating_cf !== null && capex !== null
      ? operating_cf + capex
      : null;

  // EPS / diluted_eps: no standard VAS code present in FPT/ACB corpus.
  // Kept null — future work BCTC-EPS-FOOTNOTE.
  const eps: number | null = null;
  const diluted_eps: number | null = null;

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
    // BEQ-3: new fields
    operating_profit,
    ebitda,
    cash,
    eps,
    diluted_eps,
    operating_cf,
    investing_cf,
    financing_cf,
    capex,
    free_cash_flow,
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

  return { scalars, balanceViolation, notApplicable };
}
