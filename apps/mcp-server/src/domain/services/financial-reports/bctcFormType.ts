/**
 * bctcFormType — canonical bank-form discriminator (BANK-ARCH-2 revision).
 *
 * Sprint BANK-AWARE-BCTC | BANK-DEV-2
 * DDD layer: domain (isBankFormFromRows) + application (isBankFormFromDb — I/O).
 *
 * CORRECTED SIGNAL: structural (3-digit code presence), NOT domain string.
 * Reason: financial_reports.domain = "other" for ALL 12 tickers in live DB.
 * The domain column is mis-populated at ingest and cannot be used as discriminator.
 *
 * Bank reports (Mẫu B02-TCTD) use Roman-numeral codes (I–XIII) and short
 * alphabetic codes (A, B) exclusively. Corporate (Mẫu B01-DN) always have
 * codes in the 100-440 range (current_assets=100, total_assets=270/280, etc.).
 * The 3-digit code presence is the clean structural boundary — verified across
 * all 12 live tickers (FPT/HPG/DHG = corporate with 3-digit codes;
 * ACB/SHB/EIB = bank with zero 3-digit codes).
 *
 * Old export `isBankForm(domain)` is DELETED intentionally. TypeScript compile
 * errors at any surviving `isBankForm(...)` call site are the fleet-wide safety
 * net proving every site was migrated to the structural signal.
 *
 * @module domain/services/financial-reports/bctcFormType
 */

/**
 * Row shape required for structural bank detection.
 * Subset of bctc_table_rows columns — only `code` is needed.
 */
export interface BctcCodeRow {
  code: string | null;
}

/**
 * isBankFormFromRows — canonical bank-form discriminator.
 *
 * BANK-ARCH-3 revision: POSITIVE bank evidence required.
 * Returns true when the row set contains at least one code with a letter
 * character (Roman numerals I–XIII, section headers A/B, sub-codes I.1/I.2
 * used exclusively by Mẫu B02-TCTD bank reports). Corporate Mẫu B01-DN codes
 * (10-60 income; 100-440 balance) are entirely numeric — no letters.
 *
 * WHY positive evidence: absence of 3-digit codes is necessary but not
 * sufficient — a partial corporate extraction with income-only 2-digit rows
 * (code "10","60") also has zero 3-digit codes, breaking the prior signal.
 * A letter-containing code is ONLY produced by Mẫu B02-TCTD. Never by B01-DN.
 *
 * Fail-loud contract: if rows is empty, returns false (fail-safe: no bank
 * promotion without positive evidence). Consistent with BANK-DEV-2.
 *
 * @param rows   All bctc_table_rows for the report (full set or code-only projection).
 * @returns true if the report follows Mẫu B02-TCTD (bank form); false for corporate.
 */
export function isBankFormFromRows(rows: BctcCodeRow[]): boolean {
  if (rows.length === 0) return false; // fail-safe: no rows → assume corporate
  return rows.some((r) => /[A-Za-z]/.test(r.code ?? ""));
}

/**
 * isBankFormFromDb — convenience wrapper for consumers that have a DB handle
 * and a report_id but not a pre-loaded row set.
 *
 * Issues a minimal SELECT code FROM bctc_table_rows WHERE report_id = ?
 * query and delegates to isBankFormFromRows. Consumers that already have
 * rows loaded MUST use isBankFormFromRows directly to avoid a second query.
 *
 * bun:sqlite convention: plain new Database(path) — never better-sqlite3,
 * never {create:false}.
 *
 * @param db        Bun SQLite Database instance (open handle, caller owns lifecycle).
 * @param reportId  financial_reports.id (UUID).
 */
export function isBankFormFromDb(
  db: import("bun:sqlite").Database,
  reportId: string,
): boolean {
  const rows = db
    .query<BctcCodeRow, [string]>(
      "SELECT code FROM bctc_table_rows WHERE report_id = ?",
    )
    .all(reportId);
  return isBankFormFromRows(rows);
}
