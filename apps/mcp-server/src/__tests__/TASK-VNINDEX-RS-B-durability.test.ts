Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/TASK-VNINDEX-RS-B-durability.test.ts
// Zone B durability follow-on (sprint TA-CONSUMER-STALE-INDICATORS RC3, TASK-VNINDEX-RS-B)
//
// FR-B1: push-ohlcv-history handler accepts optional `type` field (default "stock")
//   FR-B1-TC1: type:"index" is read from payload and passed to validateOhlcvUnit
//              → index-range bar (open=50) accepted as "index", rejected as "stock"
//   FR-B1-TC2: no type field → defaults to "stock" (backward compat for existing VPS push)
//   FR-B1-TC3: VNINDEX bars with type:"index" and realistic values (~1200) insert correctly
//
// FR-B2: ohlcv-backfill-done depth probe includes VNINDEX
//   FR-B2-TC1: VNINDEX depth < 252, watchlist all >=252 → VNINDEX in shortfall → re-queue
//   FR-B2-TC2: VNINDEX depth >= 252, watchlist all >=252 → no shortfall (clean path)
//   FR-B2-TC3: VNINDEX depth < 252, empty watchlist → re-queue fires (not silently skipped)

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { createBunServer } from "../interface/mcp/server.js";

const VALID_KEY = "vnindex-rs-b-test-key";

type BunServerInstance = Awaited<ReturnType<typeof createBunServer>>;
let server: BunServerInstance;
let base: string;

beforeAll(async () => {
  process.env["VPS_PUSH_API_KEY"] = VALID_KEY;
  closeDb();
  await initDatabase();
  server = await createBunServer({ port: 0 });
  base = `http://localhost:${server.port}`;
});

afterAll(async () => {
  await server.close();
  closeDb();
  delete process.env["VPS_PUSH_API_KEY"];
});

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM daily_ohlcv");
  db.exec("DELETE FROM ohlcv_backfill_queue");
  db.exec("DELETE FROM watchlist");
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function pushOhlcvHistory(payload: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${base}/api/push-ohlcv-history`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": VALID_KEY },
    body: JSON.stringify(payload),
  });
  return { status: res.status, json: await res.json() };
}

async function postBackfillDone(body?: string): Promise<{ status: number; json: unknown }> {
  const opts: RequestInit = {
    method: "POST",
    headers: body
      ? { "x-api-key": VALID_KEY, "Content-Type": "application/json" }
      : { "x-api-key": VALID_KEY },
  };
  if (body) opts.body = body;
  const res = await fetch(`${base}/api/ohlcv-backfill-done`, opts);
  return { status: res.status, json: await res.json() };
}

function seedWatchlistCode(code: string): void {
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO watchlist (code, exchange, added_at) VALUES (?, 'HOSE', datetime('now'))"
  ).run(code);
}

function seedOhlcvBars(code: string, count: number, closeValue = 100_000): void {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1000, datetime('now'))"
  );
  db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      stmt.run(code, dateStr, closeValue, closeValue * 1.01, closeValue * 0.99, closeValue);
    }
  })();
}

function seedQueueRow(done: 0 | 1, retryCount: number): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO ohlcv_backfill_queue (queued_at, done, retry_count) VALUES (datetime('now'), ?, ?)"
  ).run(done, retryCount);
}

function countPendingQueueRows(): number {
  const db = getDb();
  const row = db.prepare<{ cnt: number }, []>(
    "SELECT COUNT(*) AS cnt FROM ohlcv_backfill_queue WHERE done = 0"
  ).get();
  return row?.cnt ?? 0;
}

function countOhlcvRows(code: string): number {
  const db = getDb();
  const row = db.prepare<{ cnt: number }, [string]>(
    "SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE code = ?"
  ).get(code);
  return row?.cnt ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// FR-B1: push-ohlcv-history type field
// ─────────────────────────────────────────────────────────────────────────────

describe("FR-B1-TC1: type:\"index\" in payload → bar accepted (exempt from stock range guard)", () => {
  it("bar with open=50 (below STOCK_MIN_VND=100) + type:\"index\" → inserted=1 (index exempt)", async () => {
    // open=50 is below STOCK_MIN_VND=100 → would be REJECTED as "stock"
    // With type:"index" → exempt from Rule 2 → should be ACCEPTED
    // This test is RED until the handler reads `type` from payload (currently hardcodes "stock")
    const { status, json } = await pushOhlcvHistory({
      code: "TESTIDX",
      type: "index",
      bars: [{ date: "2025-01-15", open: 50, high: 55, low: 48, close: 52, volume: 0 }],
    });
    expect(status).toBe(200);
    expect((json as { ok: boolean }).ok).toBe(true);
    // Before fix: inserted=0 (rejected as "stock" with open=50 < 100)
    // After fix: inserted=1 (accepted as "index", exempt from stock range guard)
    expect((json as { inserted: number }).inserted).toBe(1);
    expect(countOhlcvRows("TESTIDX")).toBe(1);
  });
});

describe("FR-B1-TC2: no type field → defaults to \"stock\" (backward compat)", () => {
  it("valid stock bar without type field → inserted=1 (type defaults to stock)", async () => {
    const { status, json } = await pushOhlcvHistory({
      code: "VNM",
      // no type field
      bars: [{ date: "2025-01-15", open: 73500, high: 75000, low: 72800, close: 74200, volume: 1_234_567 }],
    });
    expect(status).toBe(200);
    expect((json as { ok: boolean }).ok).toBe(true);
    expect((json as { inserted: number }).inserted).toBe(1);
  });

  it("stock bar with type:\"stock\" explicitly → inserted=1 (same as default)", async () => {
    const { status, json } = await pushOhlcvHistory({
      code: "FPT",
      type: "stock",
      bars: [{ date: "2025-01-15", open: 140_000, high: 142_000, low: 138_000, close: 141_000, volume: 500_000 }],
    });
    expect(status).toBe(200);
    expect((json as { ok: boolean }).ok).toBe(true);
    expect((json as { inserted: number }).inserted).toBe(1);
  });

  it("stock bar without type field, open < STOCK_MIN_VND=100 → inserted=1, whole-row x1000 corrected (CONTAM-10-WRITER-H)", async () => {
    // Verify backward compat: without type → defaults to "stock".
    //
    // CONTAM-10-WRITER-H (2026-07-08): this route now writes via writeOhlcvBatch,
    // which runs normalizeOhlcvToVnd BEFORE validateOhlcvUnit. A bar whose max(OHLC)
    // is < STOCK_MIN_VND(100) is treated as thousand-VND-scale data and corrected by
    // whole-row x1000 — not outright rejected. This is the SAME behavior Writers
    // A/C/D already have via writeOhlcvBatch; Writer H (this route) previously
    // diverged (raw INSERT + validateOhlcvUnit only, no normalization step), which
    // was the CONTAM-10 bug this task closes. Updated 2026-07-08 to match the new,
    // intended, cross-writer-consistent semantics (was: inserted=0 "guard rejects").
    const { status, json } = await pushOhlcvHistory({
      code: "VNM",
      // no type field → "stock" → mag(50,55,48,52)=55 < 100 → normalizeOhlcvToVnd x1000
      bars: [{ date: "2025-01-15", open: 50, high: 55, low: 48, close: 52, volume: 0 }],
    });
    expect(status).toBe(200);
    expect((json as { ok: boolean }).ok).toBe(true);
    expect((json as { inserted: number }).inserted).toBe(1);
    expect(countOhlcvRows("VNM")).toBe(1);

    const db = getDb();
    const row = db.prepare(
      "SELECT open, high, low, close FROM daily_ohlcv WHERE code = ? AND date = ?",
    ).get("VNM", "2025-01-15") as { open: number; high: number; low: number; close: number } | null;
    expect(row).not.toBeNull();
    expect(row!.open).toBe(50_000);
    expect(row!.high).toBe(55_000);
    expect(row!.low).toBe(48_000);
    expect(row!.close).toBe(52_000);
  });
});

describe("FR-B1-TC3: VNINDEX bars with type:\"index\" insert correctly", () => {
  it("VNINDEX bars (open~1200) with type:\"index\" → inserted=3", async () => {
    const { status, json } = await pushOhlcvHistory({
      code: "VNINDEX",
      type: "index",
      bars: [
        { date: "2025-01-15", open: 1200, high: 1220, low: 1180, close: 1210, volume: 0 },
        { date: "2025-01-16", open: 1210, high: 1230, low: 1190, close: 1225, volume: 0 },
        { date: "2025-01-17", open: 1225, high: 1240, low: 1200, close: 1215, volume: 0 },
      ],
    });
    expect(status).toBe(200);
    expect((json as { ok: boolean }).ok).toBe(true);
    expect((json as { inserted: number }).inserted).toBe(3);
    expect((json as { code: string }).code).toBe("VNINDEX");
    expect(countOhlcvRows("VNINDEX")).toBe(3);
  });

  it("VNINDEX push without type → also inserts (1200 passes stock range guard too)", async () => {
    // VNINDEX ~1200 is within [100, 10M] stock range → passes even without type:"index"
    // This test documents the existing passthrough behavior (not a regression)
    const { status, json } = await pushOhlcvHistory({
      code: "VNINDEX",
      // no type — should default to "stock"
      bars: [{ date: "2025-01-15", open: 1200, high: 1220, low: 1180, close: 1210, volume: 0 }],
    });
    expect(status).toBe(200);
    expect((json as { inserted: number }).inserted).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-B2: ohlcv-backfill-done depth probe includes VNINDEX
// ─────────────────────────────────────────────────────────────────────────────

describe("FR-B2-TC1: VNINDEX depth <252, watchlist all >=252 → VNINDEX triggers re-queue", () => {
  it("watchlist code with 300 bars (ok), VNINDEX with 10 bars (<252) → re-queue inserted", async () => {
    seedWatchlistCode("VCB");
    seedOhlcvBars("VCB", 300);
    // VNINDEX has only 10 bars — below DEPTH_FLOOR
    seedOhlcvBars("VNINDEX", 10, 1200);
    seedQueueRow(0, 0);

    const { status, json } = await postBackfillDone(JSON.stringify({ bars_pushed_total: 310 }));
    expect(status).toBe(200);
    expect((json as { ok: boolean }).ok).toBe(true);

    // Before fix: VNINDEX not checked → watchlist all ok → no re-queue (pending=0)
    // After fix: VNINDEX shallow → re-queue inserted (pending=1)
    const pending = countPendingQueueRows();
    expect(pending).toBe(1);
  });
});

describe("FR-B2-TC2: VNINDEX depth >=252, watchlist all >=252 → no re-queue (clean path)", () => {
  it("watchlist code with 300 bars, VNINDEX with 300 bars → depth verified, no re-queue", async () => {
    seedWatchlistCode("VCB");
    seedOhlcvBars("VCB", 300);
    seedOhlcvBars("VNINDEX", 300, 1200);
    seedQueueRow(0, 0);

    const { status, json } = await postBackfillDone(JSON.stringify({ bars_pushed_total: 600 }));
    expect(status).toBe(200);
    expect((json as { ok: boolean }).ok).toBe(true);

    // Both watchlist and VNINDEX >=252 → no shortfall → no re-queue
    expect(countPendingQueueRows()).toBe(0);
  });
});

describe("FR-B2-TC3: VNINDEX depth <252, empty watchlist → re-queue fires (not silently skipped)", () => {
  it("empty watchlist but VNINDEX with 10 bars (<252) → re-queue inserted", async () => {
    // No watchlist codes
    seedOhlcvBars("VNINDEX", 10, 1200);
    seedQueueRow(0, 0);

    const { status, json } = await postBackfillDone();
    expect(status).toBe(200);
    expect((json as { ok: boolean }).ok).toBe(true);

    // Before fix: empty watchlist → "depth probe skipped: watchlist empty" → no re-queue (pending=0)
    // After fix: VNINDEX shallow even with empty watchlist → re-queue (pending=1)
    const pending = countPendingQueueRows();
    expect(pending).toBe(1);
  });
});
