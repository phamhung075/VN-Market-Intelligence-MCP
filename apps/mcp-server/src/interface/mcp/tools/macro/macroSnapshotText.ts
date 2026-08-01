// ─────────────────────────────────────────────────────────────────────────────
// FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT: generic human-readable text renderer.
//
// get_macro_snapshot.text previously was `JSON.stringify(data)` — raw JSON,
// unlike get_market_snapshot.text which is human-readable prose. A naive
// downstream prose-parser that echoes `.text` verbatim would leak raw JSON to
// the MARKET channel (VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE — no active leak
// found, but the inconsistency made one possible).
//
// generic_mandate: format ALL macro fields generically — no per-field/per-
// ticker hardcode. `renderSection` walks the raw Go-service response object
// recursively and renders every key/value it finds; any field the upstream
// service adds tomorrow is picked up automatically, with zero code change
// here. The raw object is ALSO passed through verbatim as the envelope's
// `data` field (see registerMacroTools in macroTools.ts) so synthesizing
// agents can still read typed values without parsing prose.
//
// FIX-CI-SIZELINT-MACROTOOLS-HUMANIZE-618L: extracted out of macroTools.ts
// into this sibling module — a self-contained generic renderer with no
// coupling to the tool-registration code around it, the natural seam per
// the FIX-CI-SIZELINT-TECHANALYSIS-ROUTER-NEW-OFFENDER-143L precedent
// (file-per-concern extraction, not a size-justification header / baseline
// bump). Zero behaviour change — byte-identical function bodies.
//
// @module interface/mcp/tools/macro/macroSnapshotText
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a camelCase / kebab-case / snake_case field key into a spaced,
 * title-cased label. Purely structural (no per-field dictionary) — works for
 * any key, present or future.
 * e.g. "vndDepositRate" -> "Vnd Deposit Rate", "investment-clock" -> "Investment Clock"
 */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim();
  return spaced
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Render a scalar value for display. Never fabricates — null/undefined is an honest "unavailable". */
function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "unavailable";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/**
 * Recursively render an object into indented "Key: Value" lines, opening a
 * bracketed `[Section]` sub-header for nested objects. Generic over ANY
 * object shape — no field/ticker names are ever referenced by this function.
 */
function renderSection(obj: Record<string, unknown>, indent = 0): string[] {
  const pad = "  ".repeat(indent);
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const label = humanizeKey(key);
    if (value === null || value === undefined) {
      lines.push(`${pad}${label}: unavailable`);
    } else if (Array.isArray(value)) {
      const isScalarArray = value.every((v) => v === null || typeof v !== "object");
      if (value.length === 0) {
        lines.push(`${pad}${label}: (empty)`);
      } else if (isScalarArray) {
        lines.push(`${pad}${label}: ${value.map(formatScalar).join(", ")}`);
      } else {
        lines.push(`${pad}${label}:`);
        for (const item of value) {
          if (item && typeof item === "object") {
            lines.push(...renderSection(item as Record<string, unknown>, indent + 1));
          } else {
            lines.push(`${pad}  - ${formatScalar(item)}`);
          }
        }
      }
    } else if (typeof value === "object") {
      lines.push(`${pad}[${label}]`);
      lines.push(...renderSection(value as Record<string, unknown>, indent + 1));
    } else {
      lines.push(`${pad}${label}: ${formatScalar(value)}`);
    }
  }
  return lines;
}

/**
 * Build the human-readable Macro Snapshot text block — same section-block
 * shape as get_market_snapshot's `text` (bracketed headers, indented fields,
 * trailing `Generated:` line) — generically from the raw macro-indicators
 * response. No per-field/per-ticker hardcode: any field present in `data`
 * (current or future) is rendered automatically.
 */
export function buildMacroSnapshotText(
  data: Record<string, unknown>,
  fetchedAt: string | null,
): string {
  const lines: string[] = ["[Macro Snapshot]", ...renderSection(data ?? {})];
  lines.push("");
  lines.push(`Generated: ${fetchedAt ?? "unavailable"}`);
  return lines.join("\n");
}
