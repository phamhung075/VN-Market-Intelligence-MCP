Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/1360-ohlcv-backfill-queue.test.ts
// Task 1360 — TDD: ohlcv-backfill-queue endpoint + probe dedup tests (Sprint 123)
//
// Tests are written FIRST (RED state). Implementations do NOT exist yet:
//   - GET  /api/ohlcv-backfill-queue  → task 1361
//   - POST /api/ohlcv-backfill-done   → task 1361
//   - ohlcv_backfill_queue table DDL  → task 1361
//   - probe queue-insert logic        → task 1361 (extends ohlcvStartupProbe.ts)
//
// 9 test cases:
//   TC-1: GET  /api/ohlcv-backfill-queue — no auth → 401
//   TC-2: GET  /api/ohlcv-backfill-queue — valid auth, no pending rows → { pending: false }
//   TC-3: GET  /api/ohlcv-backfill-queue — valid auth, pending row exists → { pending: true }
//   TC-4: GET  /api/ohlcv-backfill-queue — valid auth, row already done → { pending: false }
//   TC-5: POST /api/ohlcv-backfill-done  — no auth → 401
//   TC-6: POST /api/ohlcv-backfill-done  — valid auth, pending row → 200, row marked done
//   TC-7: POST /api/ohlcv-backfill-done  — valid auth, no pending row → 200 no-op
//   TC-8: probe with sparse tickers, no existing pending row → queue row inserted
//   TC-9: probe with sparse tickers, existing pending row → no duplicate inserted (dedup)

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { createBunServer } from "../interface/mcp/server.js";
import { runOhlcvStartupProbe } from "../scheduler/market-data/ohlcvStartupProbe.js";

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_KEY = "test-vps-key-1360";

// ── Server lifecycle (TC-1 through TC-7) ────────────────────────────────────

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
  try {
    const db = getDb();
    db.exec("DELETE FROM ohlcv_backfill_queue");
  } catch { /* table may not exist yet — RED state */ }
});

// ── TC-1: GET /api/ohlcv-backfill-queue — no auth → 401 ─────────────────────

describe("Task 1360 — GET /api/ohlcv-backfill-queue: auth", () => {
  it("TC-1: no X-API-Key header → 401 Unauthorized", async () => {
    const res = await fetch(`${base}/api/ohlcv-backfill-queue`, {
      method: "GET",
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unauthorized");
  });
});

// ── TC-2 through TC-4: GET with valid auth ───────────────────────────────────

describe("Task 1360 — GET /api/ohlcv-backfill-queue: pending detection", () => {
  it("TC-2: valid auth, no rows in queue → { pending: false }", async () => {
    const res = await fetch(`${base}/api/ohlcv-backfill-queue`, {
      method: "GET",
      headers: { "x-api-key": VALID_KEY },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { pending: boolean };
    expect(body.pending).toBe(false);
  });

  it("TC-3: valid auth, pending row exists → { pending: true }", async () => {
    // Seed a pending (done=0) row directly
    const db = getDb();
    db.exec(`
      INSERT INTO ohlcv_backfill_queue (queued_at, done) VALUES (datetime('now'), 0)
    `);

    const res = await fetch(`${base}/api/ohlcv-backfill-queue`, {
      method: "GET",
      headers: { "x-api-key": VALID_KEY },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { pending: boolean };
    expect(body.pending).toBe(true);
  });

  it("TC-4: valid auth, only done row exists → { pending: false }", async () => {
    // Seed a completed (done=1) row
    const db = getDb();
    db.exec(`
      INSERT INTO ohlcv_backfill_queue (queued_at, done) VALUES (datetime('now'), 1)
    `);

    const res = await fetch(`${base}/api/ohlcv-backfill-queue`, {
      method: "GET",
      headers: { "x-api-key": VALID_KEY },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { pending: boolean };
    expect(body.pending).toBe(false);
  });
});

// ── TC-5: POST /api/ohlcv-backfill-done — no auth → 401 ────────────────────

describe("Task 1360 — POST /api/ohlcv-backfill-done: auth", () => {
  it("TC-5: no X-API-Key header → 401 Unauthorized", async () => {
    const res = await fetch(`${base}/api/ohlcv-backfill-done`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unauthorized");
  });
});

// ── TC-6 through TC-7: POST with valid auth ──────────────────────────────────

describe("Task 1360 — POST /api/ohlcv-backfill-done: mark done", () => {
  it("TC-6: valid auth, pending row exists → 200, row marked done=1", async () => {
    // Seed a pending row
    const db = getDb();
    db.exec(`
      INSERT INTO ohlcv_backfill_queue (queued_at, done) VALUES (datetime('now'), 0)
    `);

    const res = await fetch(`${base}/api/ohlcv-backfill-done`, {
      method: "POST",
      headers: { "x-api-key": VALID_KEY },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    // Verify row was marked done
    const row = db.query<{ done: number }, []>(
      "SELECT done FROM ohlcv_backfill_queue WHERE done = 0"
    ).get();
    expect(row).toBeNull();
  });

  it("TC-7: valid auth, no pending row → 200 no-op (ok: true)", async () => {
    // No rows seeded — table is empty (beforeEach cleared it)
    const res = await fetch(`${base}/api/ohlcv-backfill-done`, {
      method: "POST",
      headers: { "x-api-key": VALID_KEY },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});

// ── TC-8 through TC-9: runOhlcvStartupProbe queue insertion ─────────────────
//
// These tests call runOhlcvStartupProbe directly with an injected db.
// The extended probe (task 1361) will insert a row into ohlcv_backfill_queue
// when sparse tickers are found. Tests confirm insert + dedup.

function makeProbeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY
    ,
    exchange TEXT NOT NULL DEFAULT 'HOSE')
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      code   TEXT NOT NULL,
      date   TEXT NOT NULL,
      open   REAL,
      high   REAL,
      low    REAL,
      close  REAL,
      volume REAL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ohlcv_backfill_queue (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      queued_at  TEXT NOT NULL DEFAULT (datetime('now')),
      done       INTEGER NOT NULL DEFAULT 0
    )
  `);
  return db;
}

function seedWatchlist(db: Database, codes: string[]): void {
  for (const code of codes) {
    db.run("INSERT OR IGNORE INTO watchlist (code) VALUES (?)", [code]);
  }
}

// FPT has 3 rows (<8) → sparse
function seedSparse(db: Database): void {
  seedWatchlist(db, ["FPT"]);
  for (let i = 0; i < 3; i++) {
    db.run(
      "INSERT INTO daily_ohlcv (code, date, close, volume) VALUES (?, ?, ?, ?)",
      ["FPT", `2026-04-${String(i + 1).padStart(2, "0")}`, 100, 1000]
    );
  }
}

// No-op backfill stub — prevents real VNDirect network calls in unit tests
const noopBackfill = async (_db: unknown) => ({ fetched: 0, skipped: 0, errors: [] });

describe("Task 1360 — runOhlcvStartupProbe: queue insertion", () => {
  it("TC-8: sparse tickers found, no existing pending row → queue row inserted (done=0)", async () => {
    const db = makeProbeDb();
    seedSparse(db);

    // No pending row exists initially
    const before = db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM ohlcv_backfill_queue WHERE done = 0"
    ).get();
    expect(before?.count).toBe(0);

    const sendWorkFn = async (_msg: string): Promise<boolean> => true;
    await runOhlcvStartupProbe({ db, sendWorkFn, runBackfillFn: noopBackfill });

    // After probe: row inserted (done=0). The backfill stub immediately resolves,
    // so the UPDATE SET done=1 will have fired — row transitions to done=1.
    // We verify that exactly one row exists (either pending or completed).
    const total = db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM ohlcv_backfill_queue"
    ).get();
    expect(total?.count).toBe(1);
  });

  it("TC-9: sparse tickers found, existing pending row → no duplicate inserted (dedup)", async () => {
    const db = makeProbeDb();
    seedSparse(db);

    // Pre-seed an existing pending row
    db.exec("INSERT INTO ohlcv_backfill_queue (done) VALUES (0)");

    const before = db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM ohlcv_backfill_queue WHERE done = 0"
    ).get();
    expect(before?.count).toBe(1);

    const sendWorkFn = async (_msg: string): Promise<boolean> => true;
    await runOhlcvStartupProbe({ db, sendWorkFn, runBackfillFn: noopBackfill });

    // Still exactly 1 total row — no duplicate inserted
    const after = db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM ohlcv_backfill_queue"
    ).get();
    expect(after?.count).toBe(1);
  });
});
