Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/ohlcv-backfill-done-subtask-b.test.ts
// SUBTASK-B — TDD: depth-probe + re-queue + retry-cap logic in POST /api/ohlcv-backfill-done
//
// Tests:
//   BT-1: POST with {bars_pushed_total: N} body → 200 ok, body parsed (no parse error)
//   BT-2: POST with empty body → 200 ok (idempotent secondary poll path)
//   BT-3: shallow watchlist code (cnt<252), retry_count=0 → re-queue inserted (done=0, retry_count=1)
//   BT-4: shallow watchlist code, last done row retry_count=5 → NO re-queue (cap enforced)
//   BT-5: watchlist code with >=252 bars → no re-queue (success path)
//
// ALPHA-S1-OHLCV-BACKFILL-DONE-BUG (inserted-count verification, added 2026-07-13):
//   BT-6: bars_pushed_total:0, retry_count=0 pending row → re-queue inserted (retry_count:1),
//         bars_inserted persisted as 0 on the closed row, depth-probe NOT independently fired
//   BT-7: empty body (barsPushedTotal=null), retry_count=0 pending row, NO shallow watchlist
//         code seeded → re-queue inserted anyway (retry_count:1) — proves a full-universe
//         zero-insert failure is caught even when watchlist itself is deep
//   BT-8: bars_pushed_total:0, retry_count=5 → escalate, no new row (cap enforced, same as BT-4)

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { createBunServer } from "../interface/mcp/server.js";

const VALID_KEY = "subtask-b-test-key";

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
  db.exec("DELETE FROM ohlcv_backfill_queue");
  db.exec("DELETE FROM watchlist");
  db.exec("DELETE FROM daily_ohlcv");
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function seedWatchlistCode(code: string): void {
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO watchlist (code, exchange, added_at) VALUES (?, 'HOSE', datetime('now'))"
  ).run(code);
}

function seedOhlcvBars(code: string, count: number): void {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES (?, ?, 100000, 105000, 95000, 100000, 1000, datetime('now'))"
  );
  db.transaction(() => {
    for (let i = 0; i < count; i++) {
      // Use dates going back from today
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      stmt.run(code, dateStr);
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

function getLastQueueRow(): { done: number; retry_count: number } | null {
  const db = getDb();
  return db.prepare<{ done: number; retry_count: number }, []>(
    "SELECT done, retry_count FROM ohlcv_backfill_queue ORDER BY id DESC LIMIT 1"
  ).get();
}

function getAllQueueRows(): { id: number; done: number; retry_count: number; bars_inserted: number | null }[] {
  const db = getDb();
  return db.prepare<{ id: number; done: number; retry_count: number; bars_inserted: number | null }, []>(
    "SELECT id, done, retry_count, bars_inserted FROM ohlcv_backfill_queue ORDER BY id ASC"
  ).all();
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
  const json = await res.json();
  return { status: res.status, json };
}

// ── BT-1: JSON body with bars_pushed_total parsed without error ───────────────

describe("SUBTASK-B BT-1: body with bars_pushed_total accepted", () => {
  it("POST with {bars_pushed_total: 500} → 200 {ok:true}, no parse error", async () => {
    seedQueueRow(0, 0);
    const { status, json } = await postBackfillDone(JSON.stringify({ bars_pushed_total: 500 }));
    expect(status).toBe(200);
    expect((json as { ok: boolean }).ok).toBe(true);
  });
});

// ── BT-2: Empty body (secondary poll) — idempotent ───────────────────────────

describe("SUBTASK-B BT-2: empty body → idempotent 200", () => {
  it("POST with no body (secondary poll) → 200 {ok:true}", async () => {
    // Seed a queue row that is already done (simulates secondary poll after primary)
    seedQueueRow(1, 0);
    const { status, json } = await postBackfillDone();
    expect(status).toBe(200);
    expect((json as { ok: boolean }).ok).toBe(true);
  });
});

// ── BT-3: Shallow code → re-queue with incremented retry_count ───────────────

describe("SUBTASK-B BT-3: shallow code → re-queue inserted", () => {
  it("watchlist code with 10 bars (<252), retry_count=0 → re-queue row inserted with retry_count=1", async () => {
    seedWatchlistCode("VTST");
    seedOhlcvBars("VTST", 10);
    seedQueueRow(0, 0); // pending row, first attempt

    const pending_before = countPendingQueueRows();
    expect(pending_before).toBe(1); // the seeded pending row

    const { status, json } = await postBackfillDone(JSON.stringify({ bars_pushed_total: 10 }));
    expect(status).toBe(200);
    expect((json as { ok: boolean }).ok).toBe(true);

    // The pending row is now done=1; a NEW done=0 row should exist
    const pending_after = countPendingQueueRows();
    expect(pending_after).toBe(1);

    // The new re-queued row should have retry_count=1
    const lastRow = getLastQueueRow();
    expect(lastRow).not.toBeNull();
    expect(lastRow!.done).toBe(0);
    expect(lastRow!.retry_count).toBe(1);
  });
});

// ── BT-4: Retry cap at 5 → no re-queue ───────────────────────────────────────

describe("SUBTASK-B BT-4: retry_count >=5 → cap enforced, no new queue row", () => {
  it("watchlist code with 10 bars, last done row retry_count=5 → no re-queue inserted", async () => {
    seedWatchlistCode("VTST");
    seedOhlcvBars("VTST", 10);
    seedQueueRow(0, 5); // pending row with retry_count=5 (will be marked done → triggers cap)

    const { status, json } = await postBackfillDone();
    expect(status).toBe(200);
    expect((json as { ok: boolean }).ok).toBe(true);

    // After handler: original row marked done=1 (retry_count=5); cap fires → NO new done=0 row
    const pending_after = countPendingQueueRows();
    expect(pending_after).toBe(0);
  });
});

// ── BT-5: All codes >=252 bars (incl. VNINDEX) → no re-queue (success path) ──

describe("SUBTASK-B BT-5: all codes >=252 bars → no re-queue", () => {
  it("watchlist code with 300 bars (>=252) AND VNINDEX with 300 bars → depth verified, no re-queue inserted", async () => {
    seedWatchlistCode("VTST");
    seedOhlcvBars("VTST", 300);
    // FR-B2: VNINDEX must also be >=252 for depth probe to report no shortfall
    seedOhlcvBars("VNINDEX", 300);
    seedQueueRow(0, 0);

    const { status, json } = await postBackfillDone(JSON.stringify({ bars_pushed_total: 300 }));
    expect(status).toBe(200);
    expect((json as { ok: boolean }).ok).toBe(true);

    // No new pending queue row — depth verified
    const pending_after = countPendingQueueRows();
    expect(pending_after).toBe(0);
  });
});

// ── BT-6: bars_pushed_total:0 → re-queue + bars_inserted persisted on closed row ─────

describe("ALPHA-S1-OHLCV-BACKFILL-DONE-BUG BT-6: zero-insert report → re-queue, bars_inserted=0 recorded", () => {
  it("bars_pushed_total:0, retry_count=0 pending row → re-queue inserted (retry_count:1), bars_inserted=0 on the closed row, depth-probe NOT independently re-triggered", async () => {
    seedQueueRow(0, 0); // pending row, first attempt

    const { status, json } = await postBackfillDone(JSON.stringify({ bars_pushed_total: 0 }));
    expect(status).toBe(200);
    expect((json as { ok: boolean }).ok).toBe(true);

    const rows = getAllQueueRows();
    expect(rows.length).toBe(2); // original closed row + 1 new re-queued row
    expect(rows[0]!.done).toBe(1);
    expect(rows[0]!.bars_inserted).toBe(0); // authoritative zero persisted, not swallowed
    expect(rows[1]!.done).toBe(0);
    expect(rows[1]!.retry_count).toBe(1);

    // Mutual-exclusion: exactly one re-queued row — the depth probe did not ALSO
    // re-queue independently (would produce a 3rd row if double-fired).
    const pending_after = countPendingQueueRows();
    expect(pending_after).toBe(1);
  });
});

// ── BT-7: empty body (no report), deep watchlist → still re-queues (full-universe gap) ─

describe("ALPHA-S1-OHLCV-BACKFILL-DONE-BUG BT-7: no completion report → re-queue even when watchlist depth looks fine", () => {
  it("empty body, retry_count=0 pending row, NO shallow watchlist code seeded → re-queue inserted (retry_count:1)", async () => {
    // Deliberately do NOT seed any watchlist/daily_ohlcv rows — proves this path is
    // independent of the pre-existing depth-shortfall diagnostic.
    seedQueueRow(0, 0);

    const { status, json } = await postBackfillDone(); // empty body -> barsPushedTotal=null
    expect(status).toBe(200);
    expect((json as { ok: boolean }).ok).toBe(true);

    const rows = getAllQueueRows();
    expect(rows.length).toBe(2);
    expect(rows[0]!.done).toBe(1);
    expect(rows[0]!.bars_inserted).toBeNull(); // no authoritative report ever landed
    expect(rows[1]!.done).toBe(0);
    expect(rows[1]!.retry_count).toBe(1);
  });
});

// ── BT-8: bars_pushed_total:0, retry_count=5 → escalate, no new row ──────────────────

describe("ALPHA-S1-OHLCV-BACKFILL-DONE-BUG BT-8: zero-insert + retry cap reached → escalate, no re-queue", () => {
  it("bars_pushed_total:0, last done row retry_count=5 → cap enforced, no new queue row", async () => {
    seedQueueRow(0, 5); // pending row already at the R-5 cap

    const { status, json } = await postBackfillDone(JSON.stringify({ bars_pushed_total: 0 }));
    expect(status).toBe(200);
    expect((json as { ok: boolean }).ok).toBe(true);

    const rows = getAllQueueRows();
    expect(rows.length).toBe(1); // only the original row — no re-queue
    expect(rows[0]!.done).toBe(1);
    expect(rows[0]!.bars_inserted).toBe(0);

    const pending_after = countPendingQueueRows();
    expect(pending_after).toBe(0);
  });
});
