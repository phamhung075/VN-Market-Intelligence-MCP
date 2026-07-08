/**
 * Affected-codes JSON parser.
 *
 * Parses an `affected_actions_json` DB column value into a plain array of
 * stock-code strings. Shared by assembleBriefing.ts and assembleEveningSummary.ts
 * (FACTORY-APP-dedup-date-freshness-helpers — previously duplicated verbatim
 * in both files).
 *
 * Layer: domain/utils — pure JSON parsing, no I/O, no infrastructure imports
 * (same layer as sqlHelpers.ts / safeQuery.ts in this directory).
 */

/**
 * Parse affected_actions_json to extract stock code strings.
 * Handles both `[{ code: "VCB" }]` and `["VCB"]` formats.
 * Returns [] for null input or unparseable/non-array JSON.
 */
export function parseAffectedCodes(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: unknown) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "code" in item) {
          return String((item as { code: unknown }).code);
        }
        return null;
      })
      .filter((v): v is string => v !== null);
  } catch {
    return [];
  }
}
