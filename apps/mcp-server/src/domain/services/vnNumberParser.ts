/**
 * Vietnamese Number Parser
 *
 * Converts Vietnamese-formatted number strings to JavaScript numbers.
 *
 * Vietnamese financial conventions:
 *   - Dot (.) is the thousands separator: 1.234.567
 *   - Comma (,) is the decimal separator: 1.234,56
 *   - Parentheses indicate negative: (456.789)
 *   - Dash prefix also indicates negative: -1.234.567
 *
 * Also handles English-format numbers (comma as thousands separator)
 * when the pattern is unambiguous (e.g. 1,234,567).
 *
 * Returns null for non-numeric inputs (empty, N/A, dashes, etc.)
 *
 * Domain layer — pure function, zero I/O, zero external imports.
 */

/**
 * Parse a Vietnamese-formatted number string into a JS number.
 *
 * @param input - The raw string from a financial report cell
 * @returns The parsed number, or null if the input is not numeric
 */
export function parseVnNumber(input: string): number | null {
  if (typeof input !== "string") return null;

  let s = input.trim();

  // Empty or common non-numeric placeholders
  if (s === "" || s === "—" || s === "–" || s === "-" || s === "N/A" || s === "n/a") {
    return null;
  }

  // Detect and strip parentheses (negative)
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1).trim();
  } else if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1).trim();
    // After stripping dash, if nothing left it was just "-"
    if (s === "") return null;
  }

  // Determine format: Vietnamese (dot=thousands, comma=decimal) vs English (comma=thousands, dot=decimal)
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // Both present — determine which is the decimal separator (it appears last)
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      // Vietnamese: dots are thousands, comma is decimal → e.g. 1.234,56
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // English: commas are thousands, dot is decimal → e.g. 1,234.56
      s = s.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    // Only commas — could be Vietnamese decimal (0,5 / 12,5) or English thousands (1,234,567)
    // Heuristic: if multiple commas, or comma followed by exactly 3 digits at end → thousands separator
    const commaCount = (s.match(/,/g) || []).length;
    if (commaCount > 1 || /,\d{3}$/.test(s)) {
      // English thousands separator
      s = s.replace(/,/g, "");
    } else {
      // Vietnamese decimal separator
      s = s.replace(",", ".");
    }
  } else if (hasDot && !hasComma) {
    // Only dots — could be Vietnamese thousands (1.234.567) or English decimal (1.5)
    // Heuristic: if multiple dots, or dot followed by exactly 3 digits → thousands separator
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1) {
      // Multiple dots → thousands separators
      s = s.replace(/\./g, "");
    } else if (/\.\d{3}$/.test(s)) {
      // Single dot followed by exactly 3 digits → Vietnamese thousands (e.g. 1.000)
      s = s.replace(".", "");
    }
    // Otherwise keep dot as decimal (e.g. 1.5)
  }

  // Final parse
  const result = Number(s);
  if (isNaN(result) || s === "") return null;

  return negative ? -result : result;
}
