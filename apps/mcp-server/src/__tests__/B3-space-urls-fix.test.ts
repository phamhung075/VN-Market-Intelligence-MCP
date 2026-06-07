/**
 * B3-SPACE-URLS-FIX (2026-06-07) — RED→GREEN tests
 *
 * Two compounding problems:
 *   1. fetchMediafileUrls (Strategy 0 in bctcQueueEnricher) emitted hsx.vn URLs
 *      with literal spaces — invalid in HTTP request-target lines, causes HTTP
 *      400 on fetch.
 *   2. bctcPdfPullJob SQL filter `source_url LIKE 'http://125.212.251.27:8765/bctc-files/%'`
 *      excluded all staticfile.hsx.vn URLs, leaving those rows pending forever.
 *
 * Fixes:
 *   (a) encodeHsxUrl() applied in fetchMediafileUrls after tilde-replace.
 *   (b) Pull job SQL widened to (VPS LIKE ... OR hsx LIKE ...).
 *
 * Test coverage:
 *   TC-ENC-1: spaces encoded to %20
 *   TC-ENC-2: parentheses encoded to %28 / %29
 *   TC-ENC-3: idempotency — calling encodeHsxUrl twice = same result as once
 *   TC-ENC-4: already-percent-encoded sequence not double-encoded
 *   TC-ENC-5: URL with no unsafe chars is returned unchanged
 *   TC-ENC-6: bare % (not part of %XX) encoded to %25
 *   TC-HSX-URL-1: fetchHsxBctcUrls returns percent-encoded URL (spaces gone)
 *   TC-PULL-1: VPS URLs still matched by widened filter
 *   TC-PULL-2: hsx.vn URLs now matched by widened filter
 *   TC-PULL-3: hsx.vn row is downloaded without X-API-Key (blank key)
 *   TC-PULL-4: non-matching URLs (e.g. cafef) still excluded
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { Database as SqliteDatabase } from "bun:sqlite";

import { encodeHsxUrl } from "../infrastructure/fetchers/hsxBctcFetcher.js";
import {
  runBctcPdfPullJob,
  VPS_BCTC_BASE_URL,
  HSX_STATICFILE_BASE_URL,
  MIN_PDF_BYTES,
  type BctcPdfPullDeps,
} from "../scheduler/financial-reports/bctcPdfPullJob.js";
import { initDatabase } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// encodeHsxUrl unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("B3-SPACE-URLS-FIX — encodeHsxUrl", () => {
  // TC-ENC-1
  it("TC-ENC-1: encodes literal spaces to %20", () => {
    const input = "https://staticfile.hsx.vn/Uploads/20260420 - PPC - BCTC Q1 2026.pdf";
    const out = encodeHsxUrl(input);
    expect(out).not.toContain(" ");
    expect(out).toContain("%20");
    expect(out).toBe(
      "https://staticfile.hsx.vn/Uploads/20260420%20-%20PPC%20-%20BCTC%20Q1%202026.pdf",
    );
  });

  // TC-ENC-2
  it("TC-ENC-2: encodes parentheses to %28 / %29", () => {
    const input = "https://staticfile.hsx.vn/Uploads/PPC (TV, English).pdf";
    const out = encodeHsxUrl(input);
    expect(out).not.toContain("(");
    expect(out).not.toContain(")");
    expect(out).toContain("%28");
    expect(out).toContain("%29");
    expect(out).toBe(
      "https://staticfile.hsx.vn/Uploads/PPC%20%28TV,%20English%29.pdf",
    );
  });

  // TC-ENC-3 — idempotency
  it("TC-ENC-3: calling encodeHsxUrl twice yields the same result (idempotent)", () => {
    const input =
      "https://staticfile.hsx.vn/Uploads/20260420 - PPC - CBTT Bao cao tai chinh Quy 1 nam 2026 kem giai trinh bien dong kqsxkd (TV, English).pdf";
    const once = encodeHsxUrl(input);
    const twice = encodeHsxUrl(once);
    expect(twice).toBe(once);
    // Verify the encoded form
    expect(once).not.toContain(" ");
    expect(once).not.toContain("(");
    expect(once).not.toContain(")");
  });

  // TC-ENC-4 — no double-encoding of already-encoded sequences
  it("TC-ENC-4: already-percent-encoded sequences are NOT double-encoded", () => {
    const alreadyEncoded =
      "https://staticfile.hsx.vn/Uploads/PPC%20Q1%202026%20%28TV%29.pdf";
    const out = encodeHsxUrl(alreadyEncoded);
    // Must not double-encode: %20 stays %20, not %2520
    expect(out).not.toContain("%2520");
    expect(out).not.toContain("%2528");
    expect(out).toBe(alreadyEncoded);
  });

  // TC-ENC-5 — clean URL passes through unchanged
  it("TC-ENC-5: URL with no unsafe chars is returned unchanged", () => {
    const clean =
      "https://staticfile.hsx.vn/Uploads/HPG_2025_Q4.pdf";
    expect(encodeHsxUrl(clean)).toBe(clean);
  });

  // TC-ENC-6 — bare % encoded
  it("TC-ENC-6: bare % not part of a valid %XX sequence is encoded to %25", () => {
    const withBarePercent =
      "https://staticfile.hsx.vn/Uploads/report 100% done.pdf";
    const out = encodeHsxUrl(withBarePercent);
    // space → %20, bare % → %25
    expect(out).toContain("%25");
    expect(out).not.toContain(" ");
    // The %25 itself should not be double-encoded (idempotency)
    expect(encodeHsxUrl(out)).toBe(out);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchHsxBctcUrls — confirms encoded output
// ─────────────────────────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;
function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

describe("B3-SPACE-URLS-FIX — fetchHsxBctcUrls returns encoded URL", () => {
  afterEach(() => {
    restoreFetch();
    delete Bun.env["HSX_BCTC_ENABLED"];
  });

  // TC-HSX-URL-1: filePath with spaces → returned URL has no literal spaces
  it("TC-HSX-URL-1: filePath with spaces → returned URL is percent-encoded", async () => {
    (globalThis as unknown as { fetch: typeof globalThis.fetch }).fetch = Object.assign(
      async (input: string | URL | Request): Promise<Response> => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : (input as Request).url;
        if (url.includes("/l/api/v1/1/securities/stock")) {
          return new Response(
            JSON.stringify({ data: { list: [{ id: 99, code: "PPC" }] } }),
            { status: 200 },
          );
        }
        if (url.includes("/m/api/v1/1/mediafiles/5/")) {
          return new Response(
            JSON.stringify({
              data: {
                list: [
                  {
                    fileName: "20260420 - PPC - CBTT Bao cao tai chinh Quy 1 nam 2026 (TV, English).pdf",
                    fileType: ".pdf",
                    filePath:
                      "~/Uploads/UploadDocuments/2454932/20260420 - PPC - CBTT Bao cao tai chinh Quy 1 nam 2026 kem giai trinh bien dong kqsxkd (TV, English).pdf",
                    time: "01.2026",
                    type: "Quý",
                  },
                ],
              },
            }),
            { status: 200 },
          );
        }
        throw new Error(`[test] unmocked URL: ${url}`);
      },
      { preconnect: () => {} },
    ) as typeof globalThis.fetch;

    const { fetchHsxBctcUrls } = await import(
      "../infrastructure/fetchers/hsxBctcFetcher.js"
    );

    const urls = await fetchHsxBctcUrls("PPC", 2026, 5000, "Q1");

    expect(urls.length).toBe(1);
    // No literal spaces in the returned URL
    expect(urls[0]).not.toContain(" ");
    // Spaces encoded
    expect(urls[0]).toContain("%20");
    // Parens encoded
    expect(urls[0]).toContain("%28");
    expect(urls[0]).toContain("%29");
    // Starts with correct base
    expect(urls[0]).toMatch(/^https:\/\/staticfile\.hsx\.vn\//);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// bctcPdfPullJob — widened filter tests
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new SqliteDatabase(":memory:");
  initDatabase(db as unknown as Database);
  return db as unknown as Database;
}

function insertRow(
  db: Database,
  id: number,
  code: string,
  year: number,
  quarter: string,
  sourceUrl: string | null,
  status = "pending",
): void {
  (db as unknown as SqliteDatabase)
    .prepare(
      `INSERT OR REPLACE INTO bctc_vps_queue
         (id, action_code, period_year, period_quarter, status, source_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, code, year, quarter, status, sourceUrl);
}

function makeDeps(opts: {
  fetchResponses: Map<string, { ok: boolean; bytes: number }>;
  capturedKeys: string[];
}): BctcPdfPullDeps {
  return {
    fetchPdf: async (url: string, apiKey: string): Promise<Response> => {
      opts.capturedKeys.push(apiKey);
      const mock = opts.fetchResponses.get(url);
      if (!mock) {
        return new Response("not found", { status: 404 });
      }
      const buf = new Uint8Array(mock.bytes).fill(0x25);
      return new Response(buf, { status: mock.ok ? 200 : 500 });
    },
    savePdf: async (): Promise<void> => {},
    triggerExtraction: async (): Promise<void> => {},
  };
}

describe("B3-SPACE-URLS-FIX — bctcPdfPullJob widened filter", () => {
  // TC-PULL-1: VPS URLs still processed (regression guard)
  it("TC-PULL-1: VPS URL is still matched and downloaded", async () => {
    const db = makeDb();
    const vpsUrl = `${VPS_BCTC_BASE_URL}PPC/PPC_2025_Q4.pdf`;
    insertRow(db, 1, "PPC", 2025, "Q4", vpsUrl);

    const capturedKeys: string[] = [];
    const deps = makeDeps({
      fetchResponses: new Map([[vpsUrl, { ok: true, bytes: MIN_PDF_BYTES }]]),
      capturedKeys,
    });

    const result = await runBctcPdfPullJob({ db, deps, batchSize: 5 });

    expect(result.itemsProcessed).toBe(1);
    expect(result.downloaded).toBe(1);
    expect(result.failed).toBe(0);
  });

  // TC-PULL-2: hsx.vn URL is now matched (was excluded before fix)
  it("TC-PULL-2: hsx.vn URL is now matched and downloaded", async () => {
    const db = makeDb();
    const hsxUrl = `${HSX_STATICFILE_BASE_URL}Uploads/UploadDocuments/2454932/20260420%20-%20PPC%20-%20BCTC%20Q1%202026.pdf`;
    insertRow(db, 2, "PPC", 2026, "Q1", hsxUrl);

    const capturedKeys: string[] = [];
    const deps = makeDeps({
      fetchResponses: new Map([[hsxUrl, { ok: true, bytes: MIN_PDF_BYTES }]]),
      capturedKeys,
    });

    const result = await runBctcPdfPullJob({ db, deps, batchSize: 5 });

    expect(result.itemsProcessed).toBe(1);
    expect(result.downloaded).toBe(1);
    expect(result.failed).toBe(0);
  });

  // TC-PULL-3: hsx.vn row fetched WITHOUT X-API-Key (empty string)
  it("TC-PULL-3: hsx.vn URL fetched with empty api-key (no auth required)", async () => {
    const db = makeDb();
    const hsxUrl = `${HSX_STATICFILE_BASE_URL}Uploads/HPG_2025_Q3.pdf`;
    insertRow(db, 3, "HPG", 2025, "Q3", hsxUrl);

    const capturedKeys: string[] = [];
    const deps = makeDeps({
      fetchResponses: new Map([[hsxUrl, { ok: true, bytes: MIN_PDF_BYTES }]]),
      capturedKeys,
    });

    await runBctcPdfPullJob({ db, deps, batchSize: 5 });

    // API key for hsx.vn row must be empty
    expect(capturedKeys).toHaveLength(1);
    expect(capturedKeys[0]).toBe("");
  });

  // TC-PULL-4: unrelated URLs (e.g. cafef) remain excluded
  it("TC-PULL-4: non-VPS non-hsx URL remains excluded from pull job", async () => {
    const db = makeDb();
    insertRow(db, 4, "VNM", 2025, "Q4", "https://cafef.vn/tai-lieu/vnm-bctc.pdf");

    const capturedKeys: string[] = [];
    const deps = makeDeps({
      fetchResponses: new Map(),
      capturedKeys,
    });

    const result = await runBctcPdfPullJob({ db, deps, batchSize: 5 });

    expect(result.itemsProcessed).toBe(0);
    expect(capturedKeys).toHaveLength(0);
  });
});
