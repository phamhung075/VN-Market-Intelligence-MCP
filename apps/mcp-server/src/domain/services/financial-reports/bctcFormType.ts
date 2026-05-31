/**
 * bctcFormType — canonical bank-form discriminator (BANK-ARCH-4 revision).
 *
 * Sprint BANK-AWARE-BCTC | BANK-DEV-4
 * DDD layer: domain (isBankFormFromRows) + application (isBankFormFromDb — I/O).
 *
 * SIGNAL: hybrid positive-bank + corporate-veto.
 * bank ⟺ hasAnchoredRomanOrSection(rows) AND NOT hasCanonicalThreeDigitBalance(rows)
 *
 * History of signal iterations (recurring-bug-escalation):
 *   BANK-DEV-1: domain="banking" — ALL tickers have domain="other" in live DB → wrong.
 *   BANK-DEV-2: !rows.some(/^[0-9]{3}/) — income-only corporate ["10","60"] has no 3-digit
 *               → false-positive bank for partial extractions.
 *   BANK-DEV-3: rows.some(/[A-Za-z]/) — real VAS sub-codes 411a/420a/420b contain letters
 *               → false-positive bank for FPT (corporate).
 *   BANK-DEV-4: hybrid (this) — anchored Roman/section as positive signal + 3-digit balance
 *               as veto. Correct for all known cases.
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
 * BANK-ARCH-4 revision: HYBRID positive-bank + corporate-veto.
 *
 * Signal: bank ⟺ (row set contains at least one anchored Roman-numeral or
 * section code) AND (row set contains NO canonical 3-digit corporate balance code).
 *
 * Anchored Roman/section pattern: /^(XIII|XII|XI|IX|VIII|VII|VI|IV|III|II|I|X|V)(\.\d+)?$|^[AB]$/
 *   Matches: I, II, III, IV, V, VI, VII, VIII, IX, X, XI, XII, XIII (and decimal
 *   sub-items I.1, I.2, II.1 …), plus exactly A or B (section headers).
 *   Does NOT match: 411a, 420a, 420b, 26b (VAS sub-codes with letter suffix),
 *   Vietnamese prose strings (no prosaic string is an anchored Roman numeral).
 *
 * Corporate veto pattern: /^[0-9]{3}/
 *   Matches any code whose first 3 chars are digits (100, 200, 270, 400, 411a, 420a …).
 *   Banks have zero such codes. A single occurrence rules out bank form.
 *
 * Three mandatory cases verified (BANK-ARCH-4 truth table):
 *   (a) ACB  [A, B, I, I.1, XIII, 01, null] → true  (BANK)
 *   (b) FPT  [100, 270, 440, 411a, 420a]    → false (CORPORATE)
 *   (c) VNM  [10, 60]                        → false (CORPORATE — income-only)
 *
 * WHY both parts are necessary:
 *   Part 1 alone (BANK-DEV-2 negative signal): income-only corporates ["10","60"] have
 *     no 3-digit codes → false-positive bank. Fixed by requiring positive Roman evidence.
 *   Part 2 alone (BANK-DEV-3 any-letter): VAS sub-codes 411a/420a/420b contain letters
 *     → false-positive bank for FPT. Fixed by anchored Roman veto on 3-digit codes.
 *
 * Fail-loud contract: empty rows → false (no bank promotion without positive evidence).
 *
 * History:
 *   BANK-DEV-1: domain="banking" — wrong, all tickers have domain="other"
 *   BANK-DEV-2: !rows.some(/^[0-9]{3}/) — broken on income-only corporates
 *   BANK-DEV-3: rows.some(/[A-Za-z]/) — broken on VAS letter-suffix codes (411a, 420a)
 *   BANK-DEV-4: hybrid (this) — correct for all known cases
 *
 * @param rows  All bctc_table_rows for the report (full set or code-only projection).
 * @returns true if the report follows Mẫu B02-TCTD (bank form); false for corporate.
 */
export function isBankFormFromRows(rows: BctcCodeRow[]): boolean {
  if (rows.length === 0) return false; // fail-safe: no rows → assume corporate
  const ROMAN_SECTION = /^(XIII|XII|XI|IX|VIII|VII|VI|IV|III|II|I|X|V)(\.\d+)?$|^[AB]$/;
  const CORP_BALANCE  = /^[0-9]{3}/;
  const hasRomanOrSection = rows.some(r => ROMAN_SECTION.test(r.code ?? ""));
  const hasCorpBalance    = rows.some(r => CORP_BALANCE.test(r.code ?? ""));
  return hasRomanOrSection && !hasCorpBalance;
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
