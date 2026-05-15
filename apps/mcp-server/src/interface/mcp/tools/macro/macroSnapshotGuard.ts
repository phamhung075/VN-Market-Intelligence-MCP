/**
 * Task 1918a — macro snapshot shape guard
 *
 * Validates that a value returned by `get_macro_snapshot` has the expected
 * success shape: `{ text: string, ... }`.
 *
 * Motivation:
 *   `get_macro_snapshot` can occasionally return a system_status payload
 *   (`{ status: "degraded", message: "..." }`) due to a routing mishap in the
 *   MCP gateway. The alert-commander stage-bootstrap retry-once logic treats
 *   any non-error HTTP response as valid, so a wrong-shape response is accepted
 *   and downstream regime inference silently fails.
 *
 * Guard contract:
 *   - Valid:   `{ text: string, [fetchedAt?: string], [source_tier?: number] }`
 *   - Invalid: any object missing a string `text` field (system_status bleed,
 *              error payload, null, primitives, etc.)
 */

/**
 * Returns true when `value` has the shape of a successful `get_macro_snapshot`
 * response: an object with a non-empty `text` string field.
 *
 * On `false` the caller should route through the news-fallback path, identical
 * to the existing call-failure path in stage-bootstrap.md.
 */
export function isMacroSnapshotValidShape(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "text" in value &&
    typeof (value as Record<string, unknown>)["text"] === "string"
  );
}
