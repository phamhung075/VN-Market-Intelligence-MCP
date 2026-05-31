/**
 * bctcFormType — canonical bank-form discriminator (SSOT).
 *
 * Sprint BANK-AWARE-BCTC | BANK-DEV-1
 * DDD layer: domain — pure function, zero I/O, zero imports.
 *
 * isBankForm is the ONE authoritative expression used at every consumer call site.
 * Zero independent re-implementations. Computed from the `domain` column of
 * financial_reports (e.g. "banking" for VCB, ACB, BID, TCB, MBB, VPB, STB, HDB, MSB, TPB).
 *
 * Bank reports (Mẫu B02-TCTD) differ structurally from corporate (Mẫu B01-DN):
 *   1. No gross_profit / COGS concept.
 *   2. No current_assets concept (no code-100 subdivision).
 *   3. Roman-numeral codes (I, VIII, IX…) — CAST to NULL for BETWEEN checks.
 *   4. All balance-sheet rows land in statement_section='general'.
 *
 * @module domain/services/financial-reports/bctcFormType
 */

/**
 * isBankForm — returns true when the financial_reports.domain value indicates
 * a banking entity.
 *
 * @param domain  Value of financial_reports.domain column (may be null/undefined
 *                when domain was not set at ingest time).
 * @returns true if the report follows Mẫu B02-TCTD (bank form); false for corporate.
 */
export function isBankForm(domain: string | null | undefined): boolean {
  return /bank/i.test(domain ?? "");
}
