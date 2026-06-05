/**
 * FIX-CTG-3 STEP-A — resetCtgWrongSourceUrls: purge cover-letter and wrong-period
 * source_url values from CTG bctc_vps_queue rows.
 *
 * See: docs/architecture-briefs/2026-06-03-bctc-ctg-attachment-fetch-spike.md
 *
 * DoD test cases:
 *
 *   TC-A: Class 1 — CTG row with 'CV_CBTT' cover-letter URL is reset to
 *         pending/null/attempts=0 regardless of period.
 *
 *   TC-B: Class 2 — CTG non-Q1-2026 row with a Q1-2026 URL (wrong period from
 *         Defect B) is reset to pending/null/attempts=0.
 *
 *   TC-C: CTG Q1-2026 row with the CORRECT hsx.vn hop-nhat URL is NOT touched.
 *
 *   TC-D: Non-CTG rows with a 'CV_CBTT' URL are NOT touched (scope: CTG only).
 *
 *   TC-E: Idempotency — calling resetCtgWrongSourceUrls twice returns 0 on
 *         the second call (no rows match after first reset).
 *
 *   TC-F: resetCtgWrongSourceUrls returns total rows changed.
 *
 *   TC-G: A CTG row with source_url = NULL is not modified (no-op on already-clean rows).
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { Database as SqliteDatabase } from "bun:sqlite";

import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { resetCtgWrongSourceUrls } from "../infrastructure/db/schema-financial-reports.js";

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function createTestDb(): Promise<Database> {
  closeDb();
  const db = new SqliteDatabase(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  await initDatabase(db);
  return db;
}

function insertQueueRow(
  db: Database,
  opts: {
    action_code: string;
    period_year: number;
    period_quarter: string;
    status?: string;
    source_url?: string | null;
    attempts?: number;
  },
): void {
  db.prepare(`
    INSERT OR REPLACE INTO bctc_vps_queue
      (action_code, period_year, period_quarter, status, source_url, attempts)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    opts.action_code,
    opts.period_year,
    opts.period_quarter,
    opts.status ?? "done",
    opts.source_url ?? null,
    opts.attempts ?? 0,
  );
}

function getQueueRow(
  db: Database,
  action_code: string,
  period_year: number,
  period_quarter: string,
): { source_url: string | null; status: string; attempts: number } | null {
  return db.query(
    `SELECT source_url, status, attempts
     FROM bctc_vps_queue
     WHERE action_code = ? AND period_year = ? AND period_quarter = ?
     LIMIT 1`,
  ).get(action_code, period_year, period_quarter) as any ?? null;
}

// ---------------------------------------------------------------------------
// Known wrong URLs from spike (arch-brief 2026-06-03)
// ---------------------------------------------------------------------------

const COVER_LETTER_URL =
  "https://owa.hnx.vn/ftp///cims/2026/4_W5/000000016289487_CV_CBTT_BCTC_Quy_I.2026_VI.pdf";

const WRONG_PERIOD_Q1_2026_URL =
  "https://staticfile.hsx.vn/Uploads/UploadDocuments/2457879/" +
  "20260428%20-%20CTG%20-%20BCTC%20hop%20nhat%20Quy%20I.2026%20va%20giai%20trinh_signed.pdf";

const CORRECT_Q1_2026_URL =
  "https://staticfile.hsx.vn/Uploads/UploadDocuments/2457879/" +
  "20260428-CTG-BCTC-hop-nhat-Q1-2026.pdf";

const CORRECT_Q3_2025_URL =
  "https://staticfile.hsx.vn/Uploads/UploadDocuments/2414988/" +
  "20251030-CTG-hop-nhat-Quy-3.2025.pdf";

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let testDb: Database;

beforeEach(async () => {
  testDb = await createTestDb();
  // Clear any seeded CTG rows to control the fixture precisely
  testDb.exec("DELETE FROM bctc_vps_queue WHERE action_code = 'CTG'");
});

afterEach(() => {
  try { testDb.close(); } catch { /* ignore */ }
  closeDb();
});

// ---------------------------------------------------------------------------
// TC-A: Class 1 — cover-letter URL reset
// ---------------------------------------------------------------------------

describe("TC-A: Class 1 — cover-letter URL reset", () => {
  it("resets CTG Q1-2026 row with owa.hnx.vn CV_CBTT URL to pending/null/0", () => {
    insertQueueRow(testDb, {
      action_code: "CTG", period_year: 2026, period_quarter: "Q1",
      status: "done", source_url: COVER_LETTER_URL, attempts: 3,
    });

    const changed = resetCtgWrongSourceUrls(testDb);

    expect(changed).toBeGreaterThanOrEqual(1);

    const row = getQueueRow(testDb, "CTG", 2026, "Q1");
    expect(row?.source_url).toBeNull();
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(0);
  });

  it("resets CTG row in any period that has a CV_CBTT cover-letter URL", () => {
    insertQueueRow(testDb, {
      action_code: "CTG", period_year: 2025, period_quarter: "Q3",
      status: "done",
      source_url: "https://owa.hnx.vn/ftp/cims/2025/CV_CBTT_BCTC_Quy_III.2025_VI.pdf",
      attempts: 2,
    });

    const changed = resetCtgWrongSourceUrls(testDb);

    expect(changed).toBeGreaterThanOrEqual(1);

    const row = getQueueRow(testDb, "CTG", 2025, "Q3");
    expect(row?.source_url).toBeNull();
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-B: Class 2 — wrong-period Q1-2026 URL on non-Q1-2026 rows
// ---------------------------------------------------------------------------

describe("TC-B: Class 2 — wrong-period URL on non-Q1-2026 CTG rows", () => {
  it("resets CTG Q3-2025 row pointing at Q1-2026 hop-nhat URL", () => {
    insertQueueRow(testDb, {
      action_code: "CTG", period_year: 2025, period_quarter: "Q3",
      status: "pending", source_url: WRONG_PERIOD_Q1_2026_URL, attempts: 1,
    });

    const changed = resetCtgWrongSourceUrls(testDb);

    expect(changed).toBeGreaterThanOrEqual(1);

    const row = getQueueRow(testDb, "CTG", 2025, "Q3");
    expect(row?.source_url).toBeNull();
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(0);
  });

  it("resets CTG Q2-2025 row pointing at Q1-2026 URL", () => {
    insertQueueRow(testDb, {
      action_code: "CTG", period_year: 2025, period_quarter: "Q2",
      status: "pending", source_url: WRONG_PERIOD_Q1_2026_URL, attempts: 2,
    });

    resetCtgWrongSourceUrls(testDb);

    const row = getQueueRow(testDb, "CTG", 2025, "Q2");
    expect(row?.source_url).toBeNull();
    expect(row?.attempts).toBe(0);
  });

  it("does NOT reset CTG Q1-2026 row with the same Q1-2026 URL (correct period)", () => {
    // A Q1-2026 row that already has the correct URL — the Class 2 WHERE
    // explicitly excludes (period_year=2026 AND period_quarter='Q1').
    insertQueueRow(testDb, {
      action_code: "CTG", period_year: 2026, period_quarter: "Q1",
      status: "done", source_url: CORRECT_Q1_2026_URL, attempts: 0,
    });

    const changed = resetCtgWrongSourceUrls(testDb);

    expect(changed).toBe(0);

    const row = getQueueRow(testDb, "CTG", 2026, "Q1");
    expect(row?.source_url).toBe(CORRECT_Q1_2026_URL);
    expect(row?.status).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// TC-C: CTG Q1-2026 with correct URL is untouched
// ---------------------------------------------------------------------------

describe("TC-C: CTG Q1-2026 with correct hop-nhat URL is NOT reset", () => {
  it("leaves CTG Q1-2026 done row with correct hsx.vn URL untouched", () => {
    insertQueueRow(testDb, {
      action_code: "CTG", period_year: 2026, period_quarter: "Q1",
      status: "done", source_url: CORRECT_Q1_2026_URL, attempts: 0,
    });

    const changed = resetCtgWrongSourceUrls(testDb);

    expect(changed).toBe(0);

    const row = getQueueRow(testDb, "CTG", 2026, "Q1");
    expect(row?.source_url).toBe(CORRECT_Q1_2026_URL);
    expect(row?.status).toBe("done");
  });

  it("leaves CTG Q3-2025 with correct URL untouched", () => {
    insertQueueRow(testDb, {
      action_code: "CTG", period_year: 2025, period_quarter: "Q3",
      status: "done", source_url: CORRECT_Q3_2025_URL, attempts: 0,
    });

    const changed = resetCtgWrongSourceUrls(testDb);

    expect(changed).toBe(0);

    const row = getQueueRow(testDb, "CTG", 2025, "Q3");
    expect(row?.source_url).toBe(CORRECT_Q3_2025_URL);
    expect(row?.status).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// TC-D: Non-CTG tickers are NOT touched
// ---------------------------------------------------------------------------

describe("TC-D: Non-CTG tickers with bad URLs are untouched (scope: CTG only)", () => {
  it("does NOT reset VCB row with a cover-letter URL", () => {
    testDb.exec("DELETE FROM bctc_vps_queue WHERE action_code = 'VCB'");
    insertQueueRow(testDb, {
      action_code: "VCB", period_year: 2026, period_quarter: "Q1",
      status: "done",
      source_url: "https://owa.hnx.vn/ftp/cims/2026/CV_CBTT_VCB_Q1_2026.pdf",
      attempts: 2,
    });

    const changed = resetCtgWrongSourceUrls(testDb);

    expect(changed).toBe(0);

    const row = getQueueRow(testDb, "VCB", 2026, "Q1");
    expect(row?.source_url).toContain("CV_CBTT");
    expect(row?.status).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// TC-E: Idempotency
// ---------------------------------------------------------------------------

describe("TC-E: Idempotency — second call returns 0", () => {
  it("second call on same DB returns 0 changed rows", () => {
    insertQueueRow(testDb, {
      action_code: "CTG", period_year: 2026, period_quarter: "Q1",
      status: "done", source_url: COVER_LETTER_URL, attempts: 3,
    });
    insertQueueRow(testDb, {
      action_code: "CTG", period_year: 2025, period_quarter: "Q3",
      status: "pending", source_url: WRONG_PERIOD_Q1_2026_URL, attempts: 1,
    });

    const first = resetCtgWrongSourceUrls(testDb);
    expect(first).toBe(2);

    const second = resetCtgWrongSourceUrls(testDb);
    expect(second).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-F: Return value matches rows changed
// ---------------------------------------------------------------------------

describe("TC-F: Return value accuracy", () => {
  it("returns the total count of rows reset", () => {
    insertQueueRow(testDb, {
      action_code: "CTG", period_year: 2026, period_quarter: "Q1",
      status: "done", source_url: COVER_LETTER_URL, attempts: 1,
    });
    insertQueueRow(testDb, {
      action_code: "CTG", period_year: 2025, period_quarter: "Q3",
      status: "pending", source_url: WRONG_PERIOD_Q1_2026_URL, attempts: 2,
    });
    insertQueueRow(testDb, {
      action_code: "CTG", period_year: 2025, period_quarter: "Q2",
      status: "pending", source_url: WRONG_PERIOD_Q1_2026_URL, attempts: 1,
    });
    // One clean row — must not be counted
    insertQueueRow(testDb, {
      action_code: "CTG", period_year: 2025, period_quarter: "Q1",
      status: "done", source_url: CORRECT_Q3_2025_URL, attempts: 0,
    });

    const changed = resetCtgWrongSourceUrls(testDb);

    // 1 cover-letter + 2 wrong-period = 3
    expect(changed).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// TC-G: CTG rows with source_url = NULL are not modified
// ---------------------------------------------------------------------------

describe("TC-G: CTG rows with source_url = NULL are not modified", () => {
  it("a pending CTG row with null source_url stays unchanged", () => {
    insertQueueRow(testDb, {
      action_code: "CTG", period_year: 2025, period_quarter: "Q4",
      status: "url_not_found", source_url: null, attempts: 5,
    });

    const changed = resetCtgWrongSourceUrls(testDb);

    expect(changed).toBe(0);

    // Row unchanged — still url_not_found with attempts=5
    const row = getQueueRow(testDb, "CTG", 2025, "Q4");
    expect(row?.status).toBe("url_not_found");
    expect(row?.attempts).toBe(5);
    expect(row?.source_url).toBeNull();
  });
});
