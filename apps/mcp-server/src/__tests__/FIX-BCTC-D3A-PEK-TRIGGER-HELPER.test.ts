/**
 * FIX-BCTC-D3A-PEK-TRIGGER-HELPER
 *
 * Unit tests for the extracted `triggerPekExtractionForReport()` helper
 * (infrastructure/fetchers/pekExtractTrigger.ts) — pure DRY refactor out of
 * `handleTriggerPekExtract` (bctcVpsIngestHandler.ts). Behavior-preserving:
 * these tests assert the SAME outcome discrimination the inline handler code
 * previously produced (202 queued / 503 market-hours / non-OK error / network
 * unreachable), now expressed as a return-value discriminated union instead
 * of direct res.writeHead()/res.end() calls.
 *
 * All HTTP calls are mocked via global fetch override — no real network access.
 * DDD layer: infrastructure/fetchers unit test.
 */

import { describe, it, expect, afterEach } from "bun:test";

// Test isolation: mirrors pek-render-seam.test.ts convention — suppresses the
// shared infra logger's file/DB sinks (isTestMode gate in logger.ts).
Bun.env["DB_PATH"] = ":memory:";

import { triggerPekExtractionForReport } from "../infrastructure/fetchers/pekExtractTrigger.js";

const REPORT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const PDF_PATH = "/app/data/pdfs/FPT/FPT_Q4_2025.pdf";

function makeMockFetch(status: number, textBody: string): typeof fetch {
  return (async (_input: string | URL | Request, _init?: RequestInit) => {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => textBody,
    } as Response;
  }) as unknown as typeof fetch;
}

function makeThrowingFetch(err: Error): typeof fetch {
  return (async () => {
    throw err;
  }) as unknown as typeof fetch;
}

/** Captures info/error calls without touching the shared singleton logger. */
function makeSpyLogger() {
  const info: Array<{ msg: string; meta?: Record<string, unknown> }> = [];
  const error: Array<{ msg: string; meta?: Record<string, unknown> }> = [];
  return {
    log: {
      info: (msg: string, meta?: Record<string, unknown>) =>
        info.push(meta === undefined ? { msg } : { msg, meta }),
      error: (msg: string, meta?: Record<string, unknown>) =>
        error.push(meta === undefined ? { msg } : { msg, meta }),
    },
    info,
    error,
  };
}

describe("triggerPekExtractionForReport", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns outcome:queued (status 202) on a successful pdf-extractor response", async () => {
    globalThis.fetch = makeMockFetch(202, "");
    const { log, info } = makeSpyLogger();

    const result = await triggerPekExtractionForReport(REPORT_ID, PDF_PATH, log);

    expect(result.outcome).toBe("queued");
    expect(result.status).toBe(202);
    expect(result.reportId).toBe(REPORT_ID);
    expect(result.pdfPath).toBe(PDF_PATH);
    expect(info).toHaveLength(1);
    expect(info[0]!.msg).toBe("[trigger-pek-extract] extraction triggered");
  });

  it("returns outcome:market_hours (status 503) verbatim, without logging an error", async () => {
    const marketHoursBody = JSON.stringify({ error: "market_open", detail: "VN market hours guard" });
    globalThis.fetch = makeMockFetch(503, marketHoursBody);
    const { log, error } = makeSpyLogger();

    const result = await triggerPekExtractionForReport(REPORT_ID, PDF_PATH, log);

    expect(result.outcome).toBe("market_hours");
    expect(result.status).toBe(503);
    if (result.outcome === "market_hours") {
      expect(result.body).toBe(marketHoursBody);
    }
    // 503 is a deliberate guard outcome, not an error — no log.error call.
    expect(error).toHaveLength(0);
  });

  it("returns outcome:pdf_extractor_error (status 502) on non-OK, non-503 response and logs an error", async () => {
    globalThis.fetch = makeMockFetch(500, "internal pdf-extractor failure");
    const { log, error } = makeSpyLogger();

    const result = await triggerPekExtractionForReport(REPORT_ID, PDF_PATH, log);

    expect(result.outcome).toBe("pdf_extractor_error");
    expect(result.status).toBe(502);
    if (result.outcome === "pdf_extractor_error") {
      expect(result.pekStatus).toBe(500);
      expect(result.body).toBe("internal pdf-extractor failure");
    }
    expect(error).toHaveLength(1);
    expect(error[0]!.msg).toBe("[trigger-pek-extract] pdf-extractor error");
    expect(error[0]!.meta?.status).toBe(500);
  });

  it("returns outcome:unreachable (status 502) when fetch throws a network error", async () => {
    globalThis.fetch = makeThrowingFetch(new Error("ECONNREFUSED"));
    const { log, error } = makeSpyLogger();

    const result = await triggerPekExtractionForReport(REPORT_ID, PDF_PATH, log);

    expect(result.outcome).toBe("unreachable");
    expect(result.status).toBe(502);
    if (result.outcome === "unreachable") {
      expect(result.error).toBe("ECONNREFUSED");
    }
    expect(error).toHaveLength(1);
    expect(error[0]!.msg).toBe("[trigger-pek-extract] fetch error");
  });

  it("forwards report_id and pdf_path verbatim in the POST body to pdf-extractor:5001/pek-extract", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedBody = String(init?.body ?? "");
      return { ok: true, status: 202, text: async () => "" } as Response;
    }) as unknown as typeof fetch;
    const { log } = makeSpyLogger();

    await triggerPekExtractionForReport(REPORT_ID, PDF_PATH, log);

    expect(capturedUrl).toBe("http://pdf-extractor:5001/pek-extract");
    expect(JSON.parse(capturedBody)).toEqual({ report_id: REPORT_ID, pdf_path: PDF_PATH });
  });

  it("defaults to the shared infra logger when no logger override is supplied (no throw)", async () => {
    globalThis.fetch = makeMockFetch(202, "");

    // No third argument — exercises the default-param path used by the
    // forthcoming D3B automatic caller (bctcPdfPullJob.ts), which has no
    // injected per-request logger.
    const result = await triggerPekExtractionForReport(REPORT_ID, PDF_PATH);

    expect(result.outcome).toBe("queued");
  });
});
