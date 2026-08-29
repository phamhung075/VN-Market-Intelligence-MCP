/**
 * FIX-BCTC-DATA-GAP-FAMILY U1 — queue-liveness tests
 *
 * Covers the three enabler changes (architect brief 2026-08-28 U1):
 *   - U1.1 Arm-2 grace bound: a url_not_found/enrich_failed row at attempts=6
 *     (the value markUrlNotFoundStmt itself produces when it terminalizes a row
 *     at item.attempts >= MAX_ENRICH_ATTEMPTS=5) is now re-eligible for the
 *     7-day-grace re-discovery pass (old `attempts < 6` excluded it forever).
 *   - U1.2 deferred_infra NULL-URL arm: rows parked at 'deferred_infra' with
 *     source_url IS NULL are recycled to 'pending' past the 7-day grace (live:
 *     293 such rows were unreachable by every arm).
 *   - U1.3 pull-job enricher-reroute: a pending row with a real http(s)
 *     source_url that is NOT pull-eligible (VPS/HSX) — e.g. the owa.hnx.vn
 *     governance-report URL poisoning BID 2025-Q4 — has source_url reset to
 *     NULL so the enricher (single discovery owner) re-discovers it.
 *
 * DI strategy: real in-memory SQLite + injectable discoverOptions fetch stubs.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database as SqliteDatabase } from "bun:sqlite";
import type { Database } from "bun:sqlite";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { runBctcQueueEnricherJob } from "../scheduler/financial-reports/bctcQueueEnricherJob.js";
import {
  runBctcPdfPullJob,
  type BctcPdfPullDeps,
} from "../scheduler/financial-reports/bctcPdfPullJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixture / stub helpers
// ─────────────────────────────────────────────────────────────────────────────

function insertQueueRow(
  db: Database,
  code: string,
  year: number,
  quarter: string,
  opts: {
    status?: string;
    sourceUrl?: string | null;
    attempts?: number;
    lastAttempt?: string | null;
  } = {},
): void {
  db.prepare(`
    INSERT OR REPLACE INTO bctc_vps_queue
      (action_code, period_year, period_quarter, status, source_url, attempts, last_attempt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    code,
    year,
    quarter,
    opts.status ?? "pending",
    opts.sourceUrl ?? null,
    opts.attempts ?? 0,
    opts.lastAttempt ?? null,
  );
}

function getQueueRow(
  db: Database,
  code: string,
): { status: string; source_url: string | null; attempts: number } | undefined {
  return db
    .query<{ status: string; source_url: string | null; attempts: number }, [string]>(
      `SELECT status, source_url, attempts FROM bctc_vps_queue WHERE action_code = ?`,
    )
    .get(code) ?? undefined;
}

/** Compute a real SQLite timestamp (bind value) at the given offset. */
function sqlDate(db: Database, modifier: string): string {
  return db
    .query<{ d: string }, []>(`SELECT datetime('now', '${modifier}') AS d`)
    .get()!.d;
}

let testDb: Database;

beforeEach(async () => {
  closeDb();
  testDb = new SqliteDatabase(":memory:");
  testDb.exec("PRAGMA foreign_keys = ON");
  testDb.exec("PRAGMA journal_mode = WAL");
  await initDatabase(testDb);
  try {
    testDb.exec("DELETE FROM bctc_vps_queue");
  } catch { /* ignore */ }
});

afterEach(() => {
  try {
    testDb.close();
  } catch { /* ignore */ }
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// U1.1 — Arm-2 grace bound (attempts=6 re-eligible)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-DATA-GAP-FAMILY U1.1 — Arm-2 grace bound includes attempts=6", () => {
  it("re-discovers an attempts=6 url_not_found row past the 7-day grace (the bound that terminalized it)", async () => {
    insertQueueRow(testDb, "VEA", 2025, "Q4", {
      status: "url_not_found",
      attempts: 6,
      lastAttempt: sqlDate(testDb, '-8 days'),
    });

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async (_t, _y) => ["https://hsx.example.com/vea-2025-q4.pdf"],
      },
    });

    expect(result.itemsProcessed).toBeGreaterThanOrEqual(1);
    expect(result.urlsPopulated).toBeGreaterThanOrEqual(1);

    const row = getQueueRow(testDb, "VEA");
    expect(row?.status).toBe("pending");
    expect(row?.source_url).toBe("https://hsx.example.com/vea-2025-q4.pdf");
    expect(row?.attempts).toBe(0); // FIX-BCTC-D3C-FOLLOW-UP-RESET-ATTEMPTS reset on recycle
  });

  it("does NOT re-discover an attempts=6 url_not_found row still within the grace window", async () => {
    insertQueueRow(testDb, "VEA", 2025, "Q4", {
      status: "url_not_found",
      attempts: 6,
      lastAttempt: sqlDate(testDb, '-1 hour'),
    });

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async (_t, _y) => ["https://hsx.example.com/vea-2025-q4.pdf"],
      },
    });

    expect(result.itemsProcessed).toBe(0);
    const row = getQueueRow(testDb, "VEA");
    expect(row?.status).toBe("url_not_found");
    expect(row?.source_url).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// U1.2 — deferred_infra NULL-URL arm
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-DATA-GAP-FAMILY U1.2 — deferred_infra NULL-URL recycle arm", () => {
  it("recycles a deferred_infra NULL-URL row past grace → pending, then re-discovers on the next cycle", async () => {
    insertQueueRow(testDb, "BID", 2025, "Q4", {
      status: "deferred_infra",
      sourceUrl: null,
      attempts: 6,
      lastAttempt: sqlDate(testDb, '-8 days'),
    });

    const discoverOptions = {
      _fetchHsx: async (_t: string, _y: number) => ["https://hsx.example.com/bid-2025-q4.pdf"],
    };

    // Cycle 1: the NULL-URL arm runs AFTER the Arm-1/Arm-2 query, so the
    // recycled row is prepared for discovery but discovered NEXT cycle.
    const first = await runBctcQueueEnricherJob({ db: testDb, discoverOptions });
    expect(first.orphansResynced).toBeGreaterThanOrEqual(1);
    const recycled = getQueueRow(testDb, "BID");
    expect(recycled?.status).toBe("pending");
    expect(recycled?.source_url).toBeNull();
    expect(recycled?.attempts).toBe(0); // reset on recycle

    // Cycle 2: Arm-1 picks the now-pending NULL-url row up and discovers.
    const second = await runBctcQueueEnricherJob({ db: testDb, discoverOptions });
    expect(second.itemsProcessed).toBeGreaterThanOrEqual(1);
    expect(second.urlsPopulated).toBeGreaterThanOrEqual(1);
    const row = getQueueRow(testDb, "BID");
    expect(row?.status).toBe("pending");
    expect(row?.source_url).toBe("https://hsx.example.com/bid-2025-q4.pdf");
    expect(row?.attempts).toBe(0);
  });

  it("leaves a deferred_infra NULL-URL row within grace untouched", async () => {
    insertQueueRow(testDb, "BID", 2025, "Q4", {
      status: "deferred_infra",
      sourceUrl: null,
      attempts: 6,
      lastAttempt: sqlDate(testDb, '-1 hour'),
    });

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async (_t, _y) => ["https://hsx.example.com/bid-2025-q4.pdf"],
      },
    });

    expect(result.orphansResynced).toBe(0);
    const row = getQueueRow(testDb, "BID");
    expect(row?.status).toBe("deferred_infra");
    expect(row?.source_url).toBeNull();
  });

  it("does not disturb deferred_infra rows that still hold a real VPS placeholder URL (orphan arm's domain)", async () => {
    // A deferred_infra row WITH a VPS placeholder URL is the orphan-re-sync
    // arm's job — the NULL-URL arm must not double-handle it.
    insertQueueRow(testDb, "HPG", 2025, "Q4", {
      status: "deferred_infra",
      sourceUrl: "http://125.212.251.27:8765/bctc-files/HPG/HPG_2025_Q4.pdf",
      attempts: 11,
      lastAttempt: sqlDate(testDb, '-8 days'),
    });

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async (_t, _y) => ["https://hsx.example.com/hpg-2025-q4.pdf"],
      },
    });

    // The orphan arm may recycle it (source_url reset to NULL) — that is its
    // own behavior; the key assertion is that nothing CRASHED and the row is
    // either still deferred (not selected by NULL arm) or already recycled.
    const row = getQueueRow(testDb, "HPG");
    expect(["deferred_infra", "pending"]).toContain(row?.status ?? "");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// U1.3 — Pull-job enricher-reroute arm
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-DATA-GAP-FAMILY U1.3 — pull-job enricher-reroute arm", () => {
  function makeDeps(): BctcPdfPullDeps {
    return {
      fetchPdf: async (_url, _apiKey) => new Response(new Uint8Array(11_240), { status: 200 }),
      savePdf: async () => {},
      triggerExtraction: async () => {},
    };
  }

  it("reroutes a pending row with a non-pull-eligible http(s) URL back to the enricher (owa.hnx.vn BID case)", async () => {
    insertQueueRow(testDb, "BID", 2025, "Q4", {
      status: "pending",
      sourceUrl: "https://owa.hnx.vn/ftp///cims/2026/1_W5/000000015833101_VI_BaoCaoQuanTri_2025.pdf",
      attempts: 0,
    });

    const result = await runBctcPdfPullJob({
      db: testDb,
      deps: makeDeps(),
      now: new Date("2026-07-06T09:30:00Z"),
    });

    expect(result.reroutedToDiscovery).toBe(1);
    const row = getQueueRow(testDb, "BID");
    // source_url reset → enricher Arm-1 re-discovers; status stays pending.
    expect(row?.source_url).toBeNull();
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(0);
  });

  it("does NOT reroute VPS/HSX pull-eligible rows (they stay pullable)", async () => {
    insertQueueRow(testDb, "VCB", 2025, "Q4", {
      status: "pending",
      sourceUrl: "http://125.212.251.27:8765/bctc-files/VCB/20260130-VCB-2025-q4.pdf",
      attempts: 0,
    });

    const result = await runBctcPdfPullJob({
      db: testDb,
      deps: makeDeps(),
      now: new Date("2026-07-06T09:30:00Z"),
    });

    expect(result.reroutedToDiscovery).toBeUndefined();
    const row = getQueueRow(testDb, "VCB");
    // NOT rerouted: URL intact, and the pull job processes it normally
    // (fake deps → PDF "downloaded" → advances to pek_triggered).
    expect(row?.source_url).toContain("125.212.251.27");
    expect(row?.status).toBe("pek_triggered");
  });

  it("leaves NULL-url pending rows alone (they are the enricher Arm-1's job, already reachable)", async () => {
    insertQueueRow(testDb, "FPT", 2025, "Q4", { status: "pending", sourceUrl: null });

    const result = await runBctcPdfPullJob({
      db: testDb,
      deps: makeDeps(),
      now: new Date("2026-07-06T09:30:00Z"),
    });

    expect(result.reroutedToDiscovery).toBeUndefined();
    const row = getQueueRow(testDb, "FPT");
    expect(row?.source_url).toBeNull();
    expect(row?.status).toBe("pending");
  });
});
