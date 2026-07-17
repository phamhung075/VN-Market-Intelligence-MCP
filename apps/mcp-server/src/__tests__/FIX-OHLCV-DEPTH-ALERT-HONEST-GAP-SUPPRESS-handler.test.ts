Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS-handler.test.ts
//
// PO RAW-verified (2026-07-17): the OHLCV-BACKFILL BUG-channel escalation was a false
// alarm re-firing every ~6-7h. Two compounding root causes in handleOhlcvBackfillDone:
//   (1) step-2 misread a benign empty-body idempotent ack as "no completion report /
//       crashed" even when real serving-plane depth was healthy.
//   (2) step-3's depth-shortfall re-queue never excluded permanently-empty/long-delisted
//       "honest gap" watchlist codes (BDI, DLC, JSH, SIS, VDC class), which can never
//       reach the depth floor and so re-triggered forever.
//
// DoD tests:
//   HG-1: delisted-only (honest-gap) depth shortfall → NO new done=0 re-queue, retry_count=0
//         at time of call — proves the shallow-code list is empty, not merely under-cap.
//   HG-2: same scenario but pre-existing retry_count=5 → still NO new row (escalate path
//         never even entered — no shallow codes at all once honest-gap excluded).
//   HG-3: empty-body ack arriving after a real successful count POST, with a SECOND
//         pending row present (simulating the scheduler's own independent trigger racing
//         in) → NO false "no completion report" escalation while real coverage >= 252.
//   HG-4 (regression control): a genuine (fresh, non-honest-gap) shallow code + empty
//         body ack → STILL re-queues — proves the fix does not neuter real detection.
//   HG-5 (regression control): VNINDEX at 0 bars (never honest-gap-exempt) → still
//         counted as a real shortfall.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { createBunServer } from "../interface/mcp/server.js";

const VALID_KEY = "hgap-test-key";

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

/** Seed `count` fresh bars (recent dates going back from today) — a real, recoverable gap. */
function seedFreshBars(code: string, count: number): void {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES (?, ?, 100000, 105000, 95000, 100000, 1000, datetime('now'))"
  );
  db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      stmt.run(code, d);
    }
  })();
}

/** Seed a single long-stale bar (2016-vintage) — DLC-class honest gap (nonzero count, ancient maxDate). */
function seedStaleBar(code: string): void {
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES (?, '2016-06-21', 100000, 105000, 95000, 100000, 1000, datetime('now'))"
  ).run(code);
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

// ── HG-1: delisted-only shortfall, retry_count=0 → no re-queue ──────────────

describe("HG-1: honest-gap-only depth shortfall → no re-queue", () => {
  it("watchlist codes are 0-bar and years-stale only (JSH/SIS/VDC + DLC class), VNINDEX healthy → no new pending row", async () => {
    seedFreshBars("VNINDEX", 300); // VNINDEX healthy, never excluded
    seedWatchlistCode("ZOMBIE1"); // 0 bars ever
    seedWatchlistCode("ZOMBIE2");
    seedStaleBar("ZOMBIE2"); // 1 bar, 2016 — long-stale
    seedQueueRow(0, 0); // pending row, first attempt

    const { status, json } = await postBackfillDone(JSON.stringify({ bars_pushed_total: 500 }));
    expect(status).toBe(200);
    expect((json as { ok: boolean }).ok).toBe(true);

    expect(countPendingQueueRows()).toBe(0);
    const rows = getAllQueueRows();
    expect(rows.length).toBe(1); // only the original row, closed — no re-queue inserted
    expect(rows[0]!.done).toBe(1);
  });
});

// ── HG-2: same, but pre-existing retry_count=5 → still no row (never entered escalate) ──

describe("HG-2: honest-gap-only shortfall at retry_count=5 → still no re-queue/escalate", () => {
  it("no shallow (non-honest-gap) code exists at all → the retry-cap branch is never entered", async () => {
    seedFreshBars("VNINDEX", 300);
    seedWatchlistCode("ZOMBIE1");
    seedQueueRow(0, 5); // pending row already at what WOULD be the R-5 cap if a shortfall existed

    const { status, json } = await postBackfillDone(JSON.stringify({ bars_pushed_total: 500 }));
    expect(status).toBe(200);
    expect((json as { ok: boolean }).ok).toBe(true);

    expect(countPendingQueueRows()).toBe(0);
    const rows = getAllQueueRows();
    expect(rows.length).toBe(1);
  });
});

// ── HG-3: empty-body ack after successful count POST, 2nd pending row present ──

describe("HG-3: empty-body ack does not falsely escalate while real coverage >= 252", () => {
  it("primary count POST closes row A healthily; a 2nd independently-queued row B is then closed by an empty-body ack → no false escalation, no 3rd row", async () => {
    seedFreshBars("VNINDEX", 300);
    seedWatchlistCode("VTST");
    seedFreshBars("VTST", 300); // watchlist genuinely healthy (>=252)

    seedQueueRow(0, 0); // row A
    const first = await postBackfillDone(JSON.stringify({ bars_pushed_total: 500 }));
    expect(first.status).toBe(200);
    expect(countPendingQueueRows()).toBe(0); // depth healthy — no re-queue from row A's close

    // Simulate a 2nd pending row appearing independently (e.g. the scheduler's own
    // depth-gap cron trigger racing in) before the poll script's trailing empty POST.
    seedQueueRow(0, 0); // row B
    expect(countPendingQueueRows()).toBe(1);

    const second = await postBackfillDone(); // empty body → barsPushedTotal=null
    expect(second.status).toBe(200);
    expect((second.json as { ok: boolean }).ok).toBe(true);

    // Row B closed, and — because real coverage is still healthy — NO 3rd row inserted.
    expect(countPendingQueueRows()).toBe(0);
    const rows = getAllQueueRows();
    expect(rows.length).toBe(2); // row A (done) + row B (done) — no phantom 3rd row
    expect(rows[1]!.done).toBe(1);
    expect(rows[1]!.bars_inserted).toBeNull();
  });
});

// ── HG-4 (regression control): genuine shallow code still re-queues on empty-body ack ──

describe("HG-4 regression control: genuine (fresh) shallow code still triggers on null ack", () => {
  it("a fresh, non-honest-gap shallow watchlist code → empty-body ack still re-queues (fix does not neuter real detection)", async () => {
    seedFreshBars("VNINDEX", 300);
    seedWatchlistCode("REALGAP");
    seedFreshBars("REALGAP", 10); // fresh dates, genuinely shallow — NOT honest-gap

    seedQueueRow(0, 0);
    const { status } = await postBackfillDone(); // empty body directly

    expect(status).toBe(200);
    // Real shortfall exists → step-2 null cross-check still treats this as unverified/crash-risk
    expect(countPendingQueueRows()).toBe(1);
    const rows = getAllQueueRows();
    expect(rows.length).toBe(2);
    expect(rows[1]!.retry_count).toBe(1);
  });
});

// ── HG-5 (regression control): stalled VNINDEX is never honest-gap-exempt ──

describe("HG-5 regression control: VNINDEX at 0 bars is never honest-gap-excluded", () => {
  it("VNINDEX unseeded (0 bars), watchlist otherwise healthy → still counted as a real shortfall on null ack", async () => {
    seedWatchlistCode("VTST");
    seedFreshBars("VTST", 300); // watchlist healthy — only VNINDEX is the gap
    seedQueueRow(0, 0);

    const { status } = await postBackfillDone(); // empty body

    expect(status).toBe(200);
    expect(countPendingQueueRows()).toBe(1); // VNINDEX shortfall still triggers re-queue
  });
});
