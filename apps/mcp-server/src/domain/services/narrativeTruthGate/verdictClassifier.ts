/**
 * CCATO-MCP-T1-DOMAIN-ENGINE — Verdict classifier
 *
 * TS port of scripts/narrative-truth-gate.sh's python engine, lines 251-278
 * (flatten_text / classify / summarize). Classifies a tool probe response
 * into NON_NULL (contradiction — the tool returned real data while the
 * agent claimed absence), NULL (honest gap — the tool's own no-data marker
 * matched), or ERROR (probe could not be evaluated at all).
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.2
 *
 * Pure functions, zero I/O. Domain layer only.
 */

export type VerdictClass = "NON_NULL" | "NULL" | "ERROR";

// ─────────────────────────────────────────────────────────────────────────────
// flattenText — TS port of script L253-259
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flatten a tool response value into a single searchable/printable string.
 *
 * Plain object (not array, not null) → join its own values with " | ",
 * stringifying any non-string value. Anything else (array, string, number,
 * null, undefined, ...) → JSON.stringify the whole value — byte-faithful
 * port of python's `isinstance(resp_obj, dict)` branch (python dicts never
 * include lists, matching JS's `typeof === "object" && !Array.isArray`).
 */
export function flattenText(respObj: unknown): string {
  if (respObj !== null && typeof respObj === "object" && !Array.isArray(respObj)) {
    const parts = Object.values(respObj as Record<string, unknown>).map((v) =>
      typeof v === "string" ? v : JSON.stringify(v),
    );
    return parts.join(" | ");
  }
  return JSON.stringify(respObj) ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// classifyVerdict — TS port of script L261-273
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True when `respObj` is the script's `{"_probe_error": "<message>"}` error
 * wrapper convention — the bash/python engine's way of threading a probe
 * failure through the same `resp_obj` slot as a real response (script
 * L216-218, L347-348). Kept here for byte-faithful classify() parity;
 * infrastructure/probes/narrativeTruthProbeAdapters.ts (T3) is expected to
 * normalize its own adapter failures into this exact shape when calling
 * classifyVerdict(), rather than inventing a second error convention.
 */
function isProbeErrorWrapper(respObj: unknown): respObj is { _probe_error: unknown } {
  return (
    respObj !== null &&
    typeof respObj === "object" &&
    !Array.isArray(respObj) &&
    "_probe_error" in respObj
  );
}

/**
 * Classify a probe response against the SSOT `tool_null_markers` list
 * (docs/data/claim-tool-map.json).
 *
 * - `null` / `undefined` / `{_probe_error: ...}` → "ERROR" (probe failed —
 *   never classify a failed probe as either PASS or FAIL).
 * - Empty/blank flattened text → "NULL" (honest gap).
 * - Flattened text contains any `tool_null_markers` substring
 *   (case-insensitive) → "NULL" (honest gap, no contradiction).
 * - Otherwise → "NON_NULL" (the tool returned real data — CCATO contradiction).
 */
export function classifyVerdict(respObj: unknown, toolNullMarkers: readonly string[]): VerdictClass {
  if (respObj === null || respObj === undefined) return "ERROR";
  if (isProbeErrorWrapper(respObj)) return "ERROR";

  const text = flattenText(respObj);
  if (text.trim().length === 0) return "NULL";

  const lowered = text.toLowerCase();
  if (toolNullMarkers.some((marker) => lowered.includes(marker.toLowerCase()))) return "NULL";

  return "NON_NULL";
}

// ─────────────────────────────────────────────────────────────────────────────
// summarizeVerdict — TS port of script L275-278
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collapse a probe response's flattened text to single-spaced whitespace and
 * truncate to `maxLen` characters — used to build the `[FAIL]`/`[PASS]`
 * report line's `returned="..."` field.
 */
export function summarizeVerdict(respObj: unknown, maxLen = 220): string {
  const text = flattenText(respObj);
  const collapsed = text.split(/\s+/).filter((s) => s.length > 0).join(" ");
  return collapsed.slice(0, maxLen);
}
