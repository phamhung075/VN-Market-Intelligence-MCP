/**
 * LF-OVERLAY — POST /api/push-bctc-layout handler
 *
 * Sprint BCTC-LAYOUT-FIRST §3.2 service-boundary contract.
 * Receives layout-first extraction output from pdf-extractor and writes to:
 *   - bctc_layout_units  (one row per logical unit per report)
 *   - bctc_page_zones    (one row per page per report)
 *
 * mcp-server is the SOLE WRITE OWNER of market.db (architecture invariant).
 * Zero writes to bctc_table_rows, bctc_balance_checks, or bctc_md_tables.
 *
 * Request body: see §3.2 JSON contract in the architecture brief.
 * Response:  { ok: true, units_stored: N, pages_stored: M }
 *            { error: string }  on 400/500
 *
 * Security: report_id validated as UUID before any DB write. Parameterized SQL only.
 * DI contract: db injected by caller (server.ts). No getDb() here.
 * Persistence guard: rows_stored / pages_stored reflect DB-verified COUNT after
 * write — never echo input length (write-wedge detection).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { isValidUuid } from "./bctcInspectHandler.js";

// ── Types (§3.2 contract) ──────────────────────────────────────────────────────

interface DocumentMapUnit {
  unit_id: string;
  schema_page: number;
  pages: number[];
  page_type: string;
}

interface DocumentMap {
  total_pages?: number;
  units: DocumentMapUnit[];
}

interface LayoutUnitInput {
  unit_id: string;
  stitched_markdown: string;
  row_count: number;
  quarantined: boolean;
  quarantine_reason: string | null;
  page_row_spans?: unknown[];
}

interface PageZoneInput {
  page_number: number;
  unit_id: string;
  page_type: string;
  is_schema_page: boolean;
  is_continuation_page: boolean;
  schema_inherited_from_page: number | null;
  zones: unknown;
}

interface PushBctcLayoutBody {
  report_id: string;
  document_map: DocumentMap;
  units: LayoutUnitInput[];
  page_zones: PageZoneInput[];
  pass_rate_report?: unknown;
}

// ── Handler ────────────────────────────────────────────────────────────────────

/**
 * handlePushBctcLayout — ingest layout-first extraction payload.
 *
 * Idempotent: DELETE-before-INSERT within a single transaction.
 * DELETE FROM bctc_layout_units/bctc_page_zones WHERE report_id = ? runs first,
 * then all units are re-inserted. This handles the case where pdf-extractor
 * generates new unit_id UUIDs on every extraction run (INSERT OR REPLACE would
 * only fire on a matching unit_id — it would not remove stale rows with old UUIDs).
 * Re-pushes are safe: a mid-write failure rolls back completely (report never empty).
 *
 * @param req  Incoming request
 * @param res  Server response
 * @param db   Injected database instance
 * @param body Pre-parsed body (test injection path; omit in production)
 */
export async function handlePushBctcLayout(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  body?: PushBctcLayoutBody,
): Promise<void> {
  try {
    // ── Parse body ─────────────────────────────────────────────────────────
    let parsed: PushBctcLayoutBody;
    if (body !== undefined) {
      parsed = body;
    } else {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      try {
        parsed = JSON.parse(raw) as PushBctcLayoutBody;
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_json" }));
        return;
      }
    }

    // ── Validate report_id ─────────────────────────────────────────────────
    const reportId = parsed.report_id;
    if (typeof reportId !== "string" || !isValidUuid(reportId)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_report_id: must be UUID", report_id: reportId }));
      return;
    }

    // ── Validate payload structure ─────────────────────────────────────────
    if (!parsed.document_map || typeof parsed.document_map !== "object") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "document_map is required" }));
      return;
    }
    if (!Array.isArray(parsed.units)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "units must be an array" }));
      return;
    }
    if (!Array.isArray(parsed.page_zones)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "page_zones must be an array" }));
      return;
    }

    const documentMapJson = JSON.stringify(parsed.document_map);

    // Build a lookup: unit_id → schema_page from document_map
    const schemaPagesById = new Map<string, number>();
    const pageNumbersById = new Map<string, number[]>();
    for (const dmUnit of parsed.document_map.units) {
      schemaPagesById.set(dmUnit.unit_id, dmUnit.schema_page);
      pageNumbersById.set(dmUnit.unit_id, dmUnit.pages ?? []);
    }

    // ── Transactional write (zero cross-writes) ────────────────────────────
    db.transaction(() => {
      // ── IDEMPOTENCY: delete all prior rows for this report before re-inserting ─
      // pdf-extractor generates new unit_id UUIDs on every extraction run, so
      // INSERT OR REPLACE on (report_id, unit_id) would NOT fire the REPLACE path —
      // it would just append. Deleting first guarantees a re-push REPLACES the
      // report's units atomically (delete + insert in one transaction; a mid-write
      // failure rolls back completely, never leaving the report empty).
      db.prepare("DELETE FROM bctc_layout_units WHERE report_id = ?").run(reportId);
      db.prepare("DELETE FROM bctc_page_zones WHERE report_id = ?").run(reportId);

      // ── bctc_layout_units ──────────────────────────────────────────────
      const insertUnit = db.prepare(`
        INSERT INTO bctc_layout_units
          (report_id, unit_id, schema_page, page_numbers_json, page_type,
           stitched_markdown, row_count, quarantined, quarantine_reason,
           document_map_json, extracted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      for (const unit of parsed.units) {
        const schemaPage = schemaPagesById.get(unit.unit_id) ?? 0;
        const pageNums = pageNumbersById.get(unit.unit_id) ?? [];

        // Determine page_type from document_map (fallback to 'table')
        const dmUnit = parsed.document_map.units.find((u) => u.unit_id === unit.unit_id);
        const pageType = dmUnit?.page_type ?? "table";

        insertUnit.run(
          reportId,
          unit.unit_id,
          schemaPage,
          JSON.stringify(pageNums),
          pageType,
          unit.stitched_markdown ?? "",
          unit.row_count ?? 0,
          unit.quarantined ? 1 : 0,
          unit.quarantine_reason ?? null,
          documentMapJson,
        );
      }

      // ── bctc_page_zones ────────────────────────────────────────────────
      const insertZone = db.prepare(`
        INSERT INTO bctc_page_zones
          (report_id, page_number, unit_id, page_type,
           is_schema_page, is_continuation_page, schema_inherited_from_page,
           zones_json, extracted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      for (const zone of parsed.page_zones) {
        insertZone.run(
          reportId,
          zone.page_number,
          zone.unit_id,
          zone.page_type ?? "table",
          zone.is_schema_page ? 1 : 0,
          zone.is_continuation_page ? 1 : 0,
          zone.schema_inherited_from_page ?? null,
          JSON.stringify(zone.zones),
        );
      }
    })();

    // ── DB-verified counts (write-wedge detection — never echo input length) ─
    const unitsStored = db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) AS cnt FROM bctc_layout_units WHERE report_id = ?",
      )
      .get(reportId)?.cnt ?? 0;

    const pagesStored = db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) AS cnt FROM bctc_page_zones WHERE report_id = ?",
      )
      .get(reportId)?.cnt ?? 0;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, units_stored: unitsStored, pages_stored: pagesStored }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[pushBctcLayoutHandler] error:", msg);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "server_error" }));
  }
}
