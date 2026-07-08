/**
 * vasPatterns.ts — Canonical shared VAS (Vietnamese Accounting Standard)
 * grand-total label patterns for raw-OCR-text scanning.
 *
 * FACTORY-DOMAIN-extract-bctc-parsing-lib (2026-07-08 audit finding):
 * the total-assets pattern appeared both named (balanceSheetExtractor's
 * P_TOTAL_ASSETS) and re-typed inline (bctcMagnitudeValidator's row-label
 * matcher). This module is the single source of truth for the 3 canonical
 * raw-OCR-text patterns; balanceSheetExtractor imports them (pure
 * relocation — verbatim regex source/flags, zero behavior change).
 *
 * SCOPE NOTE — bctcMagnitudeValidator.ts is deliberately NOT wired to import
 * from here. Its inline patterns operate on a DIFFERENT data shape (cleaned
 * bctc_table_rows labels, post-OCR-refine) and INCLUDE an English
 * alternation branch ("total assets" / "total liabilities" / "equity total")
 * that these OCR-fuzzy patterns do not have. Swapping in the canonical
 * fuzzy-diacritic pattern would silently WIDEN bctcMagnitudeValidator's
 * BLOCK-severity fraud-detection matching (e.g. it would newly match
 * "TỔNG CỘNG TÀI SẢN", which its current literal "tổng tài sản" does not) —
 * a real behavior change to fraud-detection logic that needs its own
 * dedicated verification pass, not a side effect of a mechanical dedup task.
 * See decision journal FACTORY-DOMAIN-extract-bctc-parsing-lib for the full
 * "reconciliation, not a straight merge" rationale (same principle as the
 * findValue 2-arg/4-arg split in lineScan.ts).
 *
 * Domain layer — pure regex constants, zero I/O, zero imports.
 */

/** Matches "Tổng (cộng) tài sản" — total assets grand-total row. */
export const P_TOTAL_ASSETS = /t[ổo]ng\s+(?:c[ộo]ng\s+)?t[àa]i\s+s[ảa]n/i;

/** Matches "Nợ phải trả" — total liabilities (section or grand-total row). */
export const P_TOTAL_LIABILITIES = /n[ợo]\s+ph[ảa]i\s+tr[ảa]/i;

/** Matches "Vốn chủ sở hữu" — total equity (section or grand-total row). */
export const P_EQUITY_TOTAL = /v[ốo]n\s+ch[ủu]\s+s[ởo]\s+h[ữu]u/i;
