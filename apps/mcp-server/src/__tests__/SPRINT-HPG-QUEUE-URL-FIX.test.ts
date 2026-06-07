/**
 * SPRINT-HPG-QUEUE-URL-FIX — Guard tests for wrong-period URL data damage
 *
 * Root cause (SPIKE 3012 / BCTC FIX-CTG-1): bctcQueueEnricherJob prior to
 * FIX-CTG-1 defaulted year=currentYear/quarter=Q4 when selecting queue rows
 * for enrichment — corrupting Q3-2025 rows for HPG and PPC with a Q1-2026 URL.
 * The code fix (FIX-CTG-1) is already in production. These tests guard the
 * DATA-fix pattern: a row whose source_url points to a wrong-period document
 * is NOT self-corrected by the enricher (it skips rows with non-null source_url),
 * and must be fixed by setting source_url=NULL + status='pending' so it is
 * re-discovered on the next enricher run.
 *
 * Test cases:
 *   TC-1: Enricher skips a Q3-2025 row that already has a (wrong) source_url —
 *         the bad URL is preserved, no overwrite. Confirms the enricher's
 *         "if (item.source_url) skip" guard prevents silent corruption on
 *         already-enriched rows (intended behaviour).
 *   TC-2: After a data-fix (source_url=NULL, status='pending'), the enricher
 *         picks the row and writes the correct URL for the row's own period.
 *         This validates the fix recipe used on HPG id=1308140 and PPC id=1308151.
 *   TC-3: A row with a period-matching URL is NOT touched (regression guard —
 *         the enricher must not re-overwrite a correct URL).
 *
 * All HTTP calls are mocked — no live network access.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { Database as SqliteDatabase } from "bun:sqlite";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { runBctcQueueEnricherJob } from "../scheduler/financial-reports/bctcQueueEnricherJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function insertQueueItem(
  db: Database,
  opts: {
    action_code: string;
    period_year: number;
    period_quarter: string;
    status?: string;
    source_url?: string | null;
    attempts?: number;
  },
): number {
  const stmt = db.prepare(`
    INSERT INTO bctc_vps_queue
      (action_code, period_year, period_quarter, status, source_url, attempts)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    opts.action_code,
    opts.period_year,
    opts.period_quarter,
    opts.status ?? "pending",
    opts.source_url ?? null,
    opts.attempts ?? 0,
  );
  return Number(result.lastInsertRowid);
}

function getQueueRow(
  db: Database,
  id: number,
): { source_url: string | null; status: string; attempts: number } | undefined {
  return db.query(
    `SELECT source_url, status, attempts FROM bctc_vps_queue WHERE id = ?`,
  ).get(id) as any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants matching the live HPG/PPC scenario from SPIKE_3012
// ─────────────────────────────────────────────────────────────────────────────

const HPG_Q1_2026_URL =
  "https://staticfile.hsx.vn/Uploads/UploadDocuments/2459048/20260429 - HPG - Bao cao tai chinh hop nhat Q1.2026 + giai trinh.pdf";

const HPG_Q3_2025_CORRECT_URL =
  "https://staticfile.hsx.vn/Uploads/UploadDocuments/HPG_Q3_2025_mock.pdf";

// ─────────────────────────────────────────────────────────────────────────────
// TC-1: Enricher SKIPS row that already has a (wrong-period) source_url
// ─────────────────────────────────────────────────────────────────────────────

describe("SPRINT-HPG-QUEUE-URL-FIX TC-1 — enricher skips row with non-null source_url", () => {
  let testDb: Database;

  beforeEach(async () => {
    closeDb();
    testDb = new SqliteDatabase(":memory:");
    testDb.exec("PRAGMA foreign_keys = ON");
    testDb.exec("PRAGMA journal_mode = WAL");
    await initDatabase(testDb);
    testDb.exec("DELETE FROM bctc_vps_queue");
  });

  afterEach(() => {
    try { testDb.close(); } catch { /* ignore */ }
    closeDb();
  });

  it("a Q3-2025 row with a Q1-2026 URL is NOT touched by the enricher", async () => {
    // This mirrors the live data damage: HPG Q3-2025 was given the Q1-2026 URL.
    const id = insertQueueItem(testDb, {
      action_code: "HPG",
      period_year: 2025,
      period_quarter: "Q3",
      status: "pending",
      source_url: HPG_Q1_2026_URL, // wrong-period URL stamped by pre-FIX-CTG-1 enricher
      attempts: 0,
    });

    // Inject a mock fetcher that would supply the correct URL if called.
    // If the enricher calls this, the test would detect an unexpected interaction.
    const fetchCalls: Array<{ ticker: string; year: number; quarter: string | undefined }> = [];
    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async (ticker, year, _timeout, quarter) => {
          fetchCalls.push({ ticker, year, quarter });
          return [HPG_Q3_2025_CORRECT_URL];
        },
      },
    });

    // The enricher must NOT process this row (source_url is non-null → skip)
    expect(result.itemsProcessed).toBe(0);
    expect(result.urlsPopulated).toBe(0);
    expect(fetchCalls.length).toBe(0);

    // The bad URL must remain unchanged
    const row = getQueueRow(testDb, id);
    expect(row?.source_url).toBe(HPG_Q1_2026_URL);
    expect(row?.status).toBe("pending");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-2: After data-fix (source_url=NULL), enricher re-discovers the correct URL
// ─────────────────────────────────────────────────────────────────────────────

describe("SPRINT-HPG-QUEUE-URL-FIX TC-2 — after NULL reset, enricher repopulates correct URL", () => {
  let testDb: Database;

  beforeEach(async () => {
    closeDb();
    testDb = new SqliteDatabase(":memory:");
    testDb.exec("PRAGMA foreign_keys = ON");
    testDb.exec("PRAGMA journal_mode = WAL");
    await initDatabase(testDb);
    testDb.exec("DELETE FROM bctc_vps_queue");
  });

  afterEach(() => {
    try { testDb.close(); } catch { /* ignore */ }
    closeDb();
  });

  it("row with source_url=NULL is picked up and gets the correct period URL", async () => {
    // This validates the fix recipe: clear the bad URL, reset to pending.
    const id = insertQueueItem(testDb, {
      action_code: "HPG",
      period_year: 2025,
      period_quarter: "Q3",
      status: "pending",
      source_url: null, // data-fix applied: wrong URL cleared
      attempts: 0,
    });

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async (ticker, year, _timeout, quarter) => {
          // Verify the enricher is calling with the row's OWN period (2025/Q3)
          expect(ticker).toBe("HPG");
          expect(year).toBe(2025);
          expect(quarter).toBe("Q3");
          return [HPG_Q3_2025_CORRECT_URL];
        },
      },
    });

    expect(result.itemsProcessed).toBe(1);
    expect(result.urlsPopulated).toBe(1);

    const row = getQueueRow(testDb, id);
    expect(row?.source_url).toBe(HPG_Q3_2025_CORRECT_URL);
    expect(row?.status).toBe("pending");
  });

  it("two rows (HPG Q3-2025 and PPC Q3-2025) both reset — each gets its own period URL", async () => {
    // Simulates fixing both live rows: id=1308140 (HPG) and id=1308151 (PPC).
    const hpgId = insertQueueItem(testDb, {
      action_code: "HPG",
      period_year: 2025,
      period_quarter: "Q3",
      status: "pending",
      source_url: null,
      attempts: 0,
    });
    const ppcId = insertQueueItem(testDb, {
      action_code: "PPC",
      period_year: 2025,
      period_quarter: "Q3",
      status: "pending",
      source_url: null,
      attempts: 0,
    });

    const PPC_Q3_2025_URL = "https://staticfile.hsx.vn/Uploads/UploadDocuments/PPC_Q3_2025_mock.pdf";

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async (ticker, year, _timeout, quarter) => {
          expect(year).toBe(2025);
          expect(quarter).toBe("Q3");
          if (ticker === "HPG") return [HPG_Q3_2025_CORRECT_URL];
          if (ticker === "PPC") return [PPC_Q3_2025_URL];
          return [];
        },
      },
    });

    expect(result.itemsProcessed).toBe(2);
    expect(result.urlsPopulated).toBe(2);

    const hpgRow = getQueueRow(testDb, hpgId);
    const ppcRow = getQueueRow(testDb, ppcId);

    expect(hpgRow?.source_url).toBe(HPG_Q3_2025_CORRECT_URL);
    expect(ppcRow?.source_url).toBe(PPC_Q3_2025_URL);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-3: Row with correct period-matching URL is not overwritten (regression guard)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPRINT-HPG-QUEUE-URL-FIX TC-3 — row with correct source_url not re-enriched", () => {
  let testDb: Database;

  beforeEach(async () => {
    closeDb();
    testDb = new SqliteDatabase(":memory:");
    testDb.exec("PRAGMA foreign_keys = ON");
    testDb.exec("PRAGMA journal_mode = WAL");
    await initDatabase(testDb);
    testDb.exec("DELETE FROM bctc_vps_queue");
  });

  afterEach(() => {
    try { testDb.close(); } catch { /* ignore */ }
    closeDb();
  });

  it("HPG Q4-2025 with a correct source_url is not touched by the enricher", async () => {
    const HPG_Q4_2025_URL =
      "https://staticfile.hsx.vn/Uploads/UploadDocuments/HPG_Q4_2025_correct.pdf";

    const id = insertQueueItem(testDb, {
      action_code: "HPG",
      period_year: 2025,
      period_quarter: "Q4",
      status: "done",
      source_url: HPG_Q4_2025_URL,
      attempts: 1,
    });

    const fetchCalls: string[] = [];
    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async (ticker) => {
          fetchCalls.push(ticker);
          return [];
        },
      },
    });

    // Enricher only processes pending rows with source_url=NULL — status=done + non-null URL = skip
    expect(fetchCalls).not.toContain("HPG");

    const row = getQueueRow(testDb, id);
    expect(row?.source_url).toBe(HPG_Q4_2025_URL);
    expect(row?.status).toBe("done");
    expect(row?.attempts).toBe(1); // unchanged
  });
});
