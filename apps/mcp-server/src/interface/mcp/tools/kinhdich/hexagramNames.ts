/**
 * Hexagram Names Reference — Phase 1 P1-F G5-inverse remediation
 *
 * Provides a thin re-export of QUE_META from the kinh-dich domain library
 * as a sanctioned interface-layer reference. This allows other tool files
 * (e.g. portfolioTools.ts) to obtain hexagram name data WITHOUT importing
 * directly from domain/services/kinhDich/hexagramLibrary.ts.
 *
 * // GLUE: intentional — reviewed P0-MCP-1 G5-inverse, kept because
 * // QUE_META is pure static display data (not runtime computation).
 * // Runtime kinh-dich calls must still route via clients.ts HTTP.
 */

// GLUE: intentional — reviewed P0-MCP-1 G5-inverse, kept because QUE_META
// is pure static display data used only for label formatting (not runtime computation).
// Phase 2 may extract this to packages/primitives/hexagram-names.
export { QUE_META } from "../../../../domain/services/kinhDich/hexagramLibrary.js";
