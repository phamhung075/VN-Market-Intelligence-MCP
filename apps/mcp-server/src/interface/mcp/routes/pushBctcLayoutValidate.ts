/**
 * LF-OVERLAY — request validation for POST /api/push-bctc-layout.
 *
 * Extracted from pushBctcLayoutHandler.ts (FIX-SIZELINT-PUSHBCTCLAYOUTHANDLER-252L,
 * 2026-08-24). Pure validation: no DB writes. Returns a discriminated result the
 * handler maps directly onto an HTTP response — the status/body shape below is
 * byte-identical to the handler's pre-extraction inline checks (verified against
 * apps/mcp-server/src/__tests__/1272-push-bctc-layout.test.ts, which asserts on
 * exact response status/body for the missing/invalid report_id cases).
 */

import type { Database } from "bun:sqlite";
import type { PushBctcLayoutBody } from "./pushBctcLayoutTypes.js";

export type PushBctcLayoutValidation =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * validatePushBctcLayoutRequest — report_id existence + payload shape checks.
 *
 * report_id: existence check against financial_reports, NOT UUID-format check.
 * FIX-BCTC-FALLBACK-SHELL-REPORTS-UNEXTRACTABLE-write: existence check, NOT
 * UUID-format check. Producers legitimately mint non-UUID ids for
 * fallback-shell reports (`fallback-<TICKER>-<SORTKEY>` — see
 * composition-root.ts, bctcReparseJob.ts insertFallbackRecord). The old
 * format-only gate accepted any syntactically-valid-but-nonexistent UUID (a
 * real orphan-write risk) while rejecting every genuine fallback-shell id.
 * isValidUuid() stays correct for its ~14 OTHER call sites (read side) —
 * untouched by this fix.
 */
export function validatePushBctcLayoutRequest(
  db: Database,
  parsed: PushBctcLayoutBody,
): PushBctcLayoutValidation {
  const reportId = parsed.report_id;
  if (typeof reportId !== "string" || reportId.length === 0) {
    return {
      ok: false,
      status: 400,
      body: { error: "invalid_report_id: must be a non-empty string", report_id: reportId },
    };
  }
  const knownReport = db.prepare("SELECT 1 FROM financial_reports WHERE id = ?").get(reportId);
  if (!knownReport) {
    return {
      ok: false,
      status: 400,
      body: { error: "invalid_report_id: no matching financial_reports row", report_id: reportId },
    };
  }

  if (!parsed.document_map || typeof parsed.document_map !== "object") {
    return { ok: false, status: 400, body: { error: "document_map is required" } };
  }
  if (!Array.isArray(parsed.units)) {
    return { ok: false, status: 400, body: { error: "units must be an array" } };
  }
  if (!Array.isArray(parsed.page_zones)) {
    return { ok: false, status: 400, body: { error: "page_zones must be an array" } };
  }

  return { ok: true };
}
