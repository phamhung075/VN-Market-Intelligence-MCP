/**
 * Interface — BCTC VPS proxy queue-management routes (Stage 4 of server.ts staged extraction)
 *
 * Extracted from server.ts (~lines 865–1229 pre-extraction)
 * (docs/architecture-briefs/2026-07-04-server-ts-staged-extraction.md §4 Stage 4).
 *
 * Routes:
 *   GET  /api/bctc-fetch-queue   — Task 1112: VPS polls for pending BCTC PDF fetch targets,
 *                                  quarter-boundary calc + source-URL enrichment (Task 1218/1280)
 *   POST /api/enrich-queue-item  — Task 1289: VPS pushes discovered PDF URLs back to the queue
 *
 * DI contract: db + log are injected by the caller (server.ts handleRequest).
 * No getDb() calls here.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import type { createLogger } from "../../../infrastructure/logger.js";
import { requireVpsApiKey } from "./_shared/requireVpsApiKey.js";

type Logger = ReturnType<typeof createLogger>;

// ── GET /api/bctc-fetch-queue ───────────────────────────────────────────────
// Task 1112: BCTC VPS proxy — fetch queue

export async function handleBctcFetchQueue(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: Logger,
): Promise<void> {
  if (!requireVpsApiKey(req, res)) return;

  try {
    // Get current reporting period (most recent quarter)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-indexed

    // 1201: Correct SSC filing deadline boundaries.
    // Vietnamese SSC filing deadlines:
    //   Q4 (Oct–Dec) filings due ~30 Mar  → collect Q4 during Jan–Apr
    //   Q1 (Jan–Mar) filings due ~30 Apr  → collect Q1 during May–Jul
    //   Q2 (Apr–Jun) filings due ~30 Jul  → collect Q2 during Aug–Oct
    //   Q3 (Jul–Sep) filings due ~30 Oct  → collect Q3 during Nov–Dec
    //
    // Bug was: else if (currentMonth <= 6) → Q1, which fired in April (month 4)
    // giving Q1-2026 instead of the correct Q4-2025.
    let targetYear = currentYear;
    let targetQuarter: string;
    if (currentMonth <= 4) {
      // Jan–Apr: collect Q4 of previous year (filed by ~30 March, stragglers through April)
      targetYear = currentYear - 1;
      targetQuarter = "Q4";
    } else if (currentMonth <= 7) {
      // May–Jul: collect Q1 of current year
      targetQuarter = "Q1";
    } else if (currentMonth <= 10) {
      // Aug–Oct: collect Q2 of current year
      targetQuarter = "Q2";
    } else {
      // Nov–Dec: collect Q3 of current year
      targetQuarter = "Q3";
    }

    // Get watchlist tickers
    const watchlistRows = db.prepare("SELECT code FROM watchlist ORDER BY code").all() as { code: string }[];
    const watchlistCodes = watchlistRows.map((r) => r.code);

    // Find tickers missing from financial_reports for the target period
    const existingRows = db.prepare(
      `SELECT action_code FROM financial_reports WHERE period_year = ? AND period_type = ?`,
    ).all(targetYear, targetQuarter) as { action_code: string }[];
    const existing = new Set(existingRows.map((r) => r.action_code));

    const missing = watchlistCodes.filter((c) => !existing.has(c));

    // Revive stale skipped rows so VPS can reattempt discovery.
    // INSERT OR IGNORE would silently ignore existing 'skipped' rows, leaving
    // them permanently blocked. The UPDATE runs first to reset them to 'pending'.
    db.prepare(
      `UPDATE bctc_vps_queue SET status='pending'
       WHERE status='skipped' AND source_url IS NULL`,
    ).run();

    // Upsert queue rows for missing tickers
    const insertStmt = db.prepare(
      `INSERT OR IGNORE INTO bctc_vps_queue (action_code, period_year, period_quarter) VALUES (?, ?, ?)`,
    );
    for (const code of missing) {
      insertStmt.run(code, targetYear, targetQuarter);
    }

    // Return pending queue items (max 10) — include cached source_url
    const pendingRows = db.prepare(
      `SELECT action_code, period_year, period_quarter, source_url FROM bctc_vps_queue
       WHERE status = 'pending' AND attempts < 5
       ORDER BY created_at ASC LIMIT 10`,
    ).all() as { action_code: string; period_year: number; period_quarter: string; source_url: string | null }[];

    // Task 1218: enrich pending items with PDF URLs from SSC portal
    // so VPS can fetch directly without re-discovery.
    // Task 1280: Add skip_enrichment param for emergency VPS timeouts.
    const { buildQueueSourceHints } = await import(
      "../../../application/usecases/bctcQueueEnricher.js"
    );

    // Parse query parameter: skip enrichment if VPS is timing out
    const url = new URL(req.url!, "http://localhost");
    const skipEnrichment = url.searchParams.get("skip_enrichment") === "true";

    let enriched = pendingRows.map((r) => ({
      action_code: r.action_code,
      period_year: r.period_year,
      period_quarter: r.period_quarter,
      source_url: r.source_url,
    }));

    // Only enrich if requested (default behavior for normal VPS operation)
    if (!skipEnrichment) {
      const { enrichQueueWithPdfUrls } = await import(
        "../../../application/usecases/bctcQueueEnricher.js"
      );

      // Injectable listDocs for production (uses listSscDocuments)
      const listDocsForEnrich = async (code: string, quarter: string, year: number) => {
        try {
          const { listSscDocuments } = await import("../../../infrastructure/fetchers/ssc.js");
          return listSscDocuments(code, "quarterly", year);
        } catch {
          return [];
        }
      };

      enriched = await enrichQueueWithPdfUrls(
        enriched,
        listDocsForEnrich,
      );

      // Persist discovered PDF URLs back to the queue table
      const updateSourceUrl = db.prepare(
        `UPDATE bctc_vps_queue SET source_url = ? WHERE action_code = ? AND period_year = ? AND period_quarter = ? AND source_url IS NULL`,
      );
      for (const item of enriched) {
        if (item.source_url) {
          updateSourceUrl.run(item.source_url, item.action_code, item.period_year, item.period_quarter);
        }
      }
    }

    const queue = enriched.map((r) => ({
      action_code: r.action_code,
      period_year: r.period_year,
      period_quarter: r.period_quarter,
      source_hints: buildQueueSourceHints(r),
    }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ queue, total: queue.length }));
  } catch (err) {
    // HOTFIX 1288c: Suppress query errors (main server no longer enriches)
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Server error" }));
  }
  return;
}

// ── POST /api/enrich-queue-item ─────────────────────────────────────────────
// Task 1289 — VPS Queue Enrichment Endpoint.
// VPS scheduler job POSTs discovered PDF URLs here.
// Receives: { action_code, period_year, period_quarter, source_url }
// Updates bctc_vps_queue.source_url for matching item

export async function handleEnrichQueueItem(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: Logger,
): Promise<void> {
  if (!requireVpsApiKey(req, res)) return;

  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    const payload = JSON.parse(body) as Record<string, unknown>;

    const actionCode = payload.action_code;
    const periodYear = payload.period_year;
    const periodQuarter = payload.period_quarter;
    const sourceUrl = payload.source_url;

    if (typeof actionCode !== "string" || !actionCode) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing required field: action_code (string)" }));
      return;
    }
    if (typeof periodYear !== "number" || periodYear < 2000) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing required field: period_year (number)" }));
      return;
    }
    if (typeof periodQuarter !== "string" || !periodQuarter) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing required field: period_quarter (string)" }));
      return;
    }
    if (typeof sourceUrl !== "string" || !sourceUrl) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing required field: source_url (string)" }));
      return;
    }

    const stmt = db.prepare(
      `UPDATE bctc_vps_queue
       SET source_url = ?
       WHERE action_code = ? AND period_year = ? AND period_quarter = ? AND source_url IS NULL`
    );
    const result = stmt.run(sourceUrl, actionCode, periodYear, periodQuarter);

    log.info("[enrich-queue-item] URL enriched", {
      actionCode,
      periodYear,
      periodQuarter,
      sourceUrl,
      updated: (result.changes ?? 0) > 0,
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, updated: (result.changes ?? 0) > 0 }));
  } catch (err) {
    log.error("[enrich-queue-item] error", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Server error" }));
  }
  return;
}
