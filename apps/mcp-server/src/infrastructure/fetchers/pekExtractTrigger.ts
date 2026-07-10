/**
 * Infrastructure — PEK extraction trigger (shared HTTP-call helper)
 *
 * FIX-BCTC-D3A-PEK-TRIGGER-HELPER: pure DRY extraction of the fetch +
 * market-hours-handling logic that previously lived inline inside
 * `handleTriggerPekExtract` (interface/mcp/routes/bctcVpsIngestHandler.ts:240-278).
 * Behavior-preserving — no new logic, same URL, same timeout, same status-code
 * discrimination (503 market-hours guard / !ok / network-unreachable).
 *
 * Two call sites reuse this helper:
 *   1. `handleTriggerPekExtract` (manual MCP-tool route, existing) — translates
 *      the returned outcome into the exact same HTTP response shapes it always did.
 *   2. `bctcPdfPullJob.ts`'s forthcoming automatic post-pull trigger (D3B,
 *      still BACKLOG) — will call this directly (no HTTP req/res in a cron
 *      context) to fire `/pek-extract` right after the PDF/shell-row land.
 *
 * Layer: infrastructure/fetchers — may use HTTP, never imports from domain/.
 * DI: `log` defaults to the shared infra `logger` singleton (matches
 * `pdfExtractorClient.ts` and `bctcPdfPullJob.ts`'s own convention) but callers
 * with an injected per-request logger (e.g. the interface-layer HTTP handler)
 * may pass their own to preserve identical log call-sites/behavior.
 */

import { logger as defaultLogger } from "../logger.js";
import { withDeadline } from "./fetchDeadline.js";

const PEK_EXTRACT_URL = "http://pdf-extractor:5001/pek-extract";
const PEK_EXTRACT_DEADLINE_MS = 30_000;

/** Minimal logger shape — matches both the infra singleton and interface-layer injected loggers. */
export interface PekTriggerLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
}

export type PekTriggerOutcome =
  | { outcome: "queued"; status: 202; reportId: string; pdfPath: string }
  | { outcome: "market_hours"; status: 503; reportId: string; pdfPath: string; body: string }
  | {
      outcome: "pdf_extractor_error";
      status: 502;
      reportId: string;
      pdfPath: string;
      pekStatus: number;
      body: string;
    }
  | { outcome: "unreachable"; status: 502; reportId: string; pdfPath: string; error: string };

/**
 * Fire `POST http://pdf-extractor:5001/pek-extract` for a single report and
 * classify the result. Never throws — all failure modes (503 market-hours
 * guard, non-OK HTTP status, network/fetch error) are represented in the
 * returned discriminated union so callers (HTTP handler or cron job) can
 * branch without a try/catch of their own.
 *
 * @param reportId  `financial_reports.id` — forwarded verbatim to pdf-extractor.
 * @param pdfPath   Resolved PDF path — forwarded verbatim to pdf-extractor.
 * @param log       Optional logger override (defaults to the infra singleton).
 */
export async function triggerPekExtractionForReport(
  reportId: string,
  pdfPath: string,
  log: PekTriggerLogger = defaultLogger,
): Promise<PekTriggerOutcome> {
  try {
    const pekResp = await withDeadline(
      (signal) =>
        fetch(PEK_EXTRACT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report_id: reportId, pdf_path: pdfPath }),
          signal,
        }),
      PEK_EXTRACT_DEADLINE_MS,
      "triggerPekExtract",
    );

    // Propagate 503 (market hours guard) verbatim
    if (pekResp.status === 503) {
      const pekBody = await pekResp.text();
      return { outcome: "market_hours", status: 503, reportId, pdfPath, body: pekBody };
    }

    if (!pekResp.ok) {
      const pekBody = await pekResp.text();
      log.error("[trigger-pek-extract] pdf-extractor error", {
        status: pekResp.status,
        reportId,
        body: pekBody,
      });
      return {
        outcome: "pdf_extractor_error",
        status: 502,
        reportId,
        pdfPath,
        pekStatus: pekResp.status,
        body: pekBody,
      };
    }

    log.info("[trigger-pek-extract] extraction triggered", { reportId, pdfPath });
    return { outcome: "queued", status: 202, reportId, pdfPath };
  } catch (fetchErr) {
    const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    log.error("[trigger-pek-extract] fetch error", { error: errMsg, reportId });
    return { outcome: "unreachable", status: 502, reportId, pdfPath, error: errMsg };
  }
}
