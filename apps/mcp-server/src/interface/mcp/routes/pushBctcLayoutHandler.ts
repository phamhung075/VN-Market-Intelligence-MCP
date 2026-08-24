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
 * Security: report_id validated against financial_reports (existence, not UUID
 * format — fallback-shell ids are non-UUID by design). Parameterized SQL only.
 * DI contract: db injected by caller (server.ts). No getDb() here.
 * Persistence guard: rows_stored / pages_stored reflect DB-verified COUNT after
 * write — never echo input length (write-wedge detection).
 *
 * Genuinely split (FIX-SIZELINT-PUSHBCTCLAYOUTHANDLER-252L, 2026-08-24) into:
 *   - pushBctcLayoutTypes.ts    §3.2 contract types
 *   - pushBctcLayoutValidate.ts report_id + payload-shape validation
 *   - pushBctcLayoutWrite.ts    the DELETE-before-INSERT transactional write
 * This file is now the thin HTTP orchestrator: parse body → validate → write → respond.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import type { PushBctcLayoutBody } from "./pushBctcLayoutTypes.js";
import { validatePushBctcLayoutRequest } from "./pushBctcLayoutValidate.js";
import { writeBctcLayoutPayload } from "./pushBctcLayoutWrite.js";

/**
 * handlePushBctcLayout — ingest layout-first extraction payload.
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

    // ── Validate (report_id existence + payload shape) ──────────────────────
    const validation = validatePushBctcLayoutRequest(db, parsed);
    if (!validation.ok) {
      res.writeHead(validation.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(validation.body));
      return;
    }

    // ── Transactional write (zero cross-writes) ──────────────────────────────
    const { unitsStored, pagesStored } = writeBctcLayoutPayload(db, parsed.report_id, parsed);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, units_stored: unitsStored, pages_stored: pagesStored }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[pushBctcLayoutHandler] error:", msg);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "server_error" }));
  }
}
