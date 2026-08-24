/**
 * LF-OVERLAY — §3.2 contract types for POST /api/push-bctc-layout.
 *
 * Extracted from pushBctcLayoutHandler.ts (FIX-SIZELINT-PUSHBCTCLAYOUTHANDLER-252L,
 * 2026-08-24) — pure type definitions, zero logic, so validation/write modules
 * (and any future consumer of the handler's request shape) can import from here
 * without pulling in the handler's DB/HTTP dependencies.
 */

// ── Types (§3.2 contract) ────────────────────────────────────────────────────

export interface DocumentMapUnit {
  unit_id: string;
  schema_page: number;
  pages: number[];
  page_type: string;
}

export interface DocumentMap {
  total_pages?: number;
  units: DocumentMapUnit[];
}

export interface LayoutUnitInput {
  unit_id: string;
  stitched_markdown: string;
  row_count: number;
  quarantined: boolean;
  quarantine_reason: string | null;
  page_row_spans?: unknown[];
}

export interface PageZoneInput {
  page_number: number;
  unit_id: string;
  page_type: string;
  is_schema_page: boolean;
  is_continuation_page: boolean;
  schema_inherited_from_page: number | null;
  zones: unknown;
}

export interface PushBctcLayoutBody {
  report_id: string;
  document_map: DocumentMap;
  units: LayoutUnitInput[];
  page_zones: PageZoneInput[];
  pass_rate_report?: unknown;
}
