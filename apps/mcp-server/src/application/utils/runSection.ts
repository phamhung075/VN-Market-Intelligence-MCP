/**
 * FIX-ERRAUDIT-W2-MCP-DATALAYER — runSection / withSection
 *
 * Composite-brief section runner: FAIL-LOUD on error, no-data ONLY on genuine
 * empty. Used by assembleBriefing / marketContextBuilder so one failing section
 * degrades that section tagged-degraded, not the whole brief.
 *
 * EXPORTS
 *   runSection<T>   — sync section runner: ok:T | degraded marker
 *   runSectionAsync<T> — async variant for dynamic imports (macroSnapshot etc.)
 *   SECTION_DEGRADED — typed sentinel returned on error
 *
 * DDD LAYER: application/utils
 *   - May import from domain/utils — allowed (application → domain).
 *   - Must NOT import from infrastructure/ in this file (layer purity).
 *   - domain/services (marketContextBuilder) may NOT import from application/utils;
 *     for domain-layer callers use safeQuery directly (domain/utils/safeQuery).
 *
 * DISCRIMINATION CONTRACT
 *   { ok: true;  value: T }              — section produced data
 *   { ok: false; reason: 'error'; ctx: string } — section threw (logged by failLoud)
 *   { ok: false; reason: 'no-data'; ctx: string } — section returned null/undefined/[]
 *                                                    (legit-empty path — NOT an error)
 *
 * USAGE (sync)
 *   const result = runSection(() => buildMacroSection(db), 'assembleBriefing.macro');
 *   if (!result.ok) { use DEGRADE_LABEL or skip section entirely }
 *   else { use result.value }
 *
 * USAGE (async)
 *   const result = await runSectionAsync(async () => await fetchMacroSnapshot(), 'macro');
 *
 * @module application/utils/runSection
 */

import { failLoud } from "../../domain/utils/safeQuery.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discriminated section result.
 *
 * ok:true  → section produced a value
 * ok:false, reason:'error'   → section threw; error was logged via failLoud
 * ok:false, reason:'no-data' → section returned null / undefined / [] (legit-empty)
 */
export type SectionResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "error" | "no-data"; ctx: string };

/**
 * Vietnamese user-facing degrade label for UI/text sections.
 * Callers may substitute this into their output instead of an empty string.
 */
export const SECTION_DEGRADE_LABEL = "(lỗi truy vấn)";

// ─────────────────────────────────────────────────────────────────────────────
// isDegrade — type-guard for callers that want a compact check
// ─────────────────────────────────────────────────────────────────────────────

export function isSectionDegrade<T>(
  result: SectionResult<T>,
): result is { ok: false; reason: "error" | "no-data"; ctx: string } {
  return !result.ok;
}

// ─────────────────────────────────────────────────────────────────────────────
// isEmpty — detect null / undefined / empty-array
// ─────────────────────────────────────────────────────────────────────────────

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// runSection<T> — sync
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs a sync section builder with FAIL-LOUD degrade on error.
 *
 * - If fn throws → failLoud + return { ok:false, reason:'error' }
 * - If fn returns null/undefined/[] → { ok:false, reason:'no-data' } (legit-empty, NOT logged)
 * - Otherwise → { ok:true, value }
 *
 * @param fn   Sync section builder function
 * @param ctx  Attribution context for failLoud + result.ctx
 */
export function runSection<T>(fn: () => T, ctx: string): SectionResult<T> {
  try {
    const value = fn();
    if (isEmpty(value)) {
      return { ok: false, reason: "no-data", ctx };
    }
    return { ok: true, value };
  } catch (err) {
    failLoud(err, ctx);
    return { ok: false, reason: "error", ctx };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// runSectionAsync<T> — async variant
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Async variant of runSection — for dynamic imports and async section builders.
 *
 * Same discrimination contract as runSection.
 *
 * @param fn   Async section builder function
 * @param ctx  Attribution context for failLoud + result.ctx
 */
export async function runSectionAsync<T>(
  fn: () => Promise<T>,
  ctx: string,
): Promise<SectionResult<T>> {
  try {
    const value = await fn();
    if (isEmpty(value)) {
      return { ok: false, reason: "no-data", ctx };
    }
    return { ok: true, value };
  } catch (err) {
    failLoud(err, ctx);
    return { ok: false, reason: "error", ctx };
  }
}
