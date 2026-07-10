/**
 * Interface — BCTC VPS proxy ingestion routes (Stage 4 of server.ts staged extraction)
 *
 * Extracted from server.ts (~lines 623–1157 pre-extraction)
 * (docs/architecture-briefs/2026-07-04-server-ts-staged-extraction.md §4 Stage 4).
 *
 * Routes:
 *   POST /api/push-bctc-pdf        — Task 1112: VPS pushes a fetched BCTC PDF (multipart),
 *                                    writes to data/pdfs/, fires the extraction+parse pipeline
 *                                    fire-and-forget via setImmediate (Task 1945d GAP-B fix).
 *   POST /api/trigger-pek-extract  — PEK-RENDER-SEAM: trigger PEK re-extraction for a report,
 *                                    cross-service fetch to pdf-extractor:5001/pek-extract.
 *
 * `parseMultipartFields` (Task 1112) moved with its only caller (push-bctc-pdf) to
 * `./_shared/multipartParser.ts`.
 *
 * MUST preserve verbatim: filesystem write to data/pdfs/, the fire-and-forget async
 * pipeline via setImmediate, the cross-service HTTP fetch to pdf-extractor:5001, and the
 * bctc_vps_queue state-machine transitions (pending → fetching → done/failed).
 *
 * DI contract: db + log are injected by the caller (server.ts handleRequest).
 * No getDb() calls here.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import type { createLogger } from "../../../infrastructure/logger.js";
import { requireVpsApiKey } from "./_shared/requireVpsApiKey.js";
import { parseMultipartFields } from "./_shared/multipartParser.js";
import { safeLogVpsPush } from "../../../infrastructure/db/vpsPushLogStore.js";
import { triggerPekExtractionForReport } from "../../../infrastructure/fetchers/pekExtractTrigger.js";

type Logger = ReturnType<typeof createLogger>;

// ── POST /api/push-bctc-pdf ──────────────────────────────────────────────────
// Task 1112: BCTC VPS proxy — push PDF

export async function handlePushBctcPdf(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: Logger,
): Promise<void> {
  if (!requireVpsApiKey(req, res)) return;

  // Size limit: 52 MB
  const contentLength = parseInt(req.headers["content-length"] ?? "0", 10);
  if (contentLength > 52_428_800) {
    res.writeHead(413, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "PDF too large (max 50 MB)" }));
    return;
  }

  try {
    // Read raw body
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of req) {
      totalBytes += chunk.length;
      if (totalBytes > 52_428_800) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "PDF too large (max 50 MB)" }));
        return;
      }
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const body = Buffer.concat(chunks);

    // Parse multipart/form-data
    const contentType = req.headers["content-type"] ?? "";
    const boundaryMatch = contentType.match(/boundary=(.+?)(?:;|$)/);
    if (!boundaryMatch) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing multipart boundary" }));
      return;
    }

    const boundary = boundaryMatch[1]!;
    const fields = parseMultipartFields(body, boundary);

    const actionCode = fields.get("action_code")?.toString().toUpperCase().trim();
    const periodYear = parseInt(fields.get("period_year")?.toString() ?? "", 10);
    const periodQuarter = fields.get("period_quarter")?.toString().toUpperCase().trim();
    const sourceUrl = fields.get("source_url")?.toString() ?? "";
    const pdfBuffer = fields.get("pdf");

    // Validate required fields
    if (!actionCode || !/^[A-Z0-9]{2,10}$/.test(actionCode)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid action_code" }));
      return;
    }
    if (isNaN(periodYear) || periodYear < 2000 || periodYear > 2099) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid period_year" }));
      return;
    }
    if (!periodQuarter || !["Q1", "Q2", "Q3", "Q4"].includes(periodQuarter)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid period_quarter" }));
      return;
    }
    if (!pdfBuffer || !(pdfBuffer instanceof Buffer) || pdfBuffer.length < 10_240) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: `PDF too small: ${pdfBuffer instanceof Buffer ? pdfBuffer.length : 0} bytes (minimum 10240 bytes / 10 KB). Real BCTC PDFs are never under 10 KB.`,
      }));
      return;
    }

    // Check if already done
    const existingRow = db.prepare(
      `SELECT status FROM bctc_vps_queue WHERE action_code = ? AND period_year = ? AND period_quarter = ?`,
    ).get(actionCode, periodYear, periodQuarter) as { status: string } | null;
    if (existingRow?.status === "done") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, skipped: true }));
      return;
    }

    // Write PDF to disk
    const { normaliseFilename } = await import("../../../application/usecases/fetchParseAndStoreBctc.js");
    const filename = normaliseFilename(sourceUrl || `${actionCode}.pdf`, actionCode, periodYear, periodQuarter as any);
    const { resolve } = await import("node:path");
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const pdfDir = resolve(process.cwd(), "data", "pdfs");
    mkdirSync(pdfDir, { recursive: true });
    const pdfPath = resolve(pdfDir, filename);
    writeFileSync(pdfPath, pdfBuffer);

    log.info("[push-bctc-pdf] PDF saved", { actionCode, periodYear, periodQuarter, filename, bytes: pdfBuffer.length });
    safeLogVpsPush({ service: "bctc", itemsCount: 1, status: "ok" }, db);

    // Update queue status
    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url, attempts, last_attempt)
       VALUES (?, ?, ?, 'fetching', ?, 1, datetime('now'))
       ON CONFLICT(action_code, period_year, period_quarter)
       DO UPDATE SET status = 'fetching', source_url = ?, attempts = attempts + 1, last_attempt = datetime('now')`,
    ).run(actionCode, periodYear, periodQuarter, sourceUrl, sourceUrl);

    // Fire-and-forget: trigger BCTC text extraction + parse pipeline.
    // Task 1945d GAP-B fix: the previous implementation called
    // fetchParseAndStoreBctc with only pdfUrl (no pdfTextOverride), which
    // caused it to try downloading from the SSC/VPS URL without auth headers.
    // The geo-blocked download failed silently → financial_reports never written.
    // Fix: extract text locally first via triggerPushBctcExtraction (same
    // pattern as bctcPdfPullJob.triggerExtraction), then call pipeline with
    // pdfTextOverride so the network download step is fully bypassed.
    setImmediate(async () => {
      try {
        const { triggerPushBctcExtraction } = await import("../../../scheduler/financial-reports/pushBctcExtraction.js");
        await triggerPushBctcExtraction({
          actionCode,
          year: periodYear,
          quarter: periodQuarter as "Q1" | "Q2" | "Q3" | "Q4",
          filePath: pdfPath,
          filename,
          pdfUrl: sourceUrl || `file://${pdfPath}`,
        });
        db.prepare(
          `UPDATE bctc_vps_queue SET status = 'done' WHERE action_code = ? AND period_year = ? AND period_quarter = ?`,
        ).run(actionCode, periodYear, periodQuarter);
        log.info("[push-bctc-pdf] pipeline complete", { actionCode, periodYear, periodQuarter });
      } catch (err) {
        db.prepare(
          `UPDATE bctc_vps_queue SET status = 'failed' WHERE action_code = ? AND period_year = ? AND period_quarter = ?`,
        ).run(actionCode, periodYear, periodQuarter);
        log.error("[push-bctc-pdf] pipeline failed", {
          actionCode,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, queued: `${actionCode}-${periodYear}-${periodQuarter}` }));
  } catch (err) {
    // HOTFIX 1288c: Suppress request validation errors (main server just receives)
    // VPS push failures are logged by VPS at line 1415
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Server error" }));
  }
  return;
}

// ── POST /api/trigger-pek-extract ────────────────────────────────────────────
// PEK-RENDER-SEAM: Trigger PEK re-extraction for a report (§5 brief)
// Accepts { report_id }, looks up pdf_path, calls pdf-extractor:5001/pek-extract
// with { report_id, pdf_path }.
// Returns 202 on success, 404 when pdf_path IS NULL, 503 from pdf-extractor (market hours).
// No change to PekExtractRequestSchema — pdf_path stays mandatory on pdf-extractor side.

export async function handleTriggerPekExtract(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: Logger,
): Promise<void> {
  let body = "";
  for await (const chunk of req) body += chunk;

  let payload: { report_id?: unknown } = {};
  try {
    if (body.trim()) payload = JSON.parse(body) as { report_id?: unknown };
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }

  const reportId = typeof payload.report_id === "string" ? payload.report_id.trim() : null;
  if (!reportId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing required field: report_id (string)" }));
    return;
  }

  // Look up pdf_path from financial_reports (mcp-server owns the DB)
  const pdfPathRow = db
    .prepare<{ pdf_path: string | null }, [string]>(
      `SELECT pdf_path FROM financial_reports WHERE id = ?`,
    )
    .get(reportId) as { pdf_path: string | null } | null;

  if (!pdfPathRow) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "report_not_found", report_id: reportId }));
    return;
  }

  const pdfPath = pdfPathRow.pdf_path;
  if (!pdfPath) {
    // Two known cases: VCB Q1/Q4 geo-restricted — never trigger PEK for these
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "pdf_path_null", report_id: reportId, detail: "PDF not downloaded (geo-restricted or not available)" }));
    return;
  }

  // Call pdf-extractor with both report_id and pdf_path (PekExtractRequestSchema requires both).
  // FIX-BCTC-D3A-PEK-TRIGGER-HELPER: fetch + market-hours-handling logic moved to the shared
  // triggerPekExtractionForReport() helper (infrastructure/fetchers/pekExtractTrigger.ts) so the
  // forthcoming D3B automatic post-pull trigger can reuse it — response shapes below are
  // byte-for-byte unchanged from the pre-refactor inline implementation.
  const result = await triggerPekExtractionForReport(reportId, pdfPath, log);

  switch (result.outcome) {
    case "market_hours":
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(result.body || JSON.stringify({ error: "market_open", detail: "pdf-extractor returned 503 (VN market hours guard)" }));
      return;
    case "pdf_extractor_error":
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "pdf_extractor_error", status: result.pekStatus, detail: result.body }));
      return;
    case "unreachable":
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "pdf_extractor_unreachable", detail: result.error }));
      return;
    case "queued":
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, report_id: reportId, pdf_path: pdfPath, status: "extraction_queued" }));
      return;
  }
}
