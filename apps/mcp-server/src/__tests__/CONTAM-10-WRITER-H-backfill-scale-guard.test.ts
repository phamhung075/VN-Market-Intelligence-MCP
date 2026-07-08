Bun.env["DB_PATH"] = ":memory:";

/**
 * CONTAM-10-WRITER-H — POST /api/push-ohlcv-history scale-guard regression
 * Sprint: OHLCV-UNIT-CONTAM-WHOLEROW-LT1000
 *
 * handlePushOhlcvHistory (the VPS backfill queue push route, ~15-30min cadence) used
 * to write via a raw INSERT...ON CONFLICT DO UPDATE that only ran a naive per-row
 * validateOhlcvUnit check (>=100 VND floor). Whole-row thousand-scale bars (e.g.
 * open=131/close=130 for a stock that trades near 130,000 VND) pass that naive check
 * undetected because every field is individually >=100. This was the actively
 * reproducing leak: 6,533 rows / 27 tickers as of 2026-07-07 (architect live-container
 * probe) — see docs/handoffs/CONTAM-10-WRITER-H.md.
 *
 * Fix: route through writeOhlcvBatch(rows, db, {conflictStrategy:"backfill"}) — the
 * SSOT writer choke-point that additionally runs normalizeOhlcvToVnd +
 * detectAndNormalizeScaleFromPrevClose (cross-day + cleanRef scale guard) ahead of
 * validateOhlcvUnit.
 *
 * These tests exercise the LIVE HTTP route (not writeOhlcvBatch directly — that unit
 * is already covered end-to-end by OHLCV-WHOLEROW-LT1000-writer-guard.test.ts) to
 * prove the handler is actually wired to the guarded writer.
 *
 * 3 scenarios (handoff §[PM] Planning Context):
 *   TC-WH-1: contaminated batch + existing cleanRef history → ×1000 corrected via
 *            fetchCleanReferenceCloseMap
 *   TC-WH-2: brand-new ticker, no prior history → written as-is (documents the
 *            accepted cold-start gap — handoff §Accepted gaps #1)
 *   TC-WH-3: legit cheap stock, all-history close < 1000 → unchanged (no false
 *            positive)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { createBunServer } from "../interface/mcp/server.js";

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_KEY = "test-vps-key-contam10-writer-h";

// ── Server lifecycle ─────────────────────────────────────────────────────────

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
    getDb().exec("DELETE FROM daily_ohlcv");
  } catch { /* ignore — table may not exist if handler not yet implemented */ }
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Vietnam local date (UTC+7), N days before "today" — matches the vnToday
 * computation writeOhlcvBatch uses internally when no vnToday option is injected
 * (new Date(Date.now() + 7*3600_000).toISOString().slice(0,10)).
 */
function vnDateOffset(daysBack: number): string {
  const ms = Date.now() + 7 * 3_600_000 - daysBack * 24 * 3_600_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function seedRow(
  code: string,
  date: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
): void {
  getDb()
    .prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(code, date, open, high, low, close, volume);
}

function readRow(
  code: string,
  date: string,
): { open: number; high: number; low: number; close: number } | null {
  return getDb()
    .prepare<
      { open: number; high: number; low: number; close: number },
      [string, string]
    >("SELECT open, high, low, close FROM daily_ohlcv WHERE code = ? AND date = ?")
    .get(code, date) ?? null;
}

async function pushBars(code: string, bars: unknown[]): Promise<Response> {
  return fetch(`${base}/api/push-ohlcv-history`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": VALID_KEY,
    },
    body: JSON.stringify({ code, bars }),
  });
}

// ── TC-WH-1: contaminated batch + cleanRef history → ×1000 corrected ────────

describe("CONTAM-10-WRITER-H TC-WH-1: contaminated batch + cleanRef history → x1000 corrected", () => {
  it("clean historical anchor (close>=1000) + contaminated prevClose row → incoming contaminated bar corrected x1000 through the live route", async () => {
    const code = "CWH1";
    // Clean historical anchor (fetchCleanReferenceCloseMap fallback): real full-VND price.
    seedRow(code, vnDateOffset(10), 129_000, 131_500, 128_500, 130_000, 1_200_000);
    // Contaminated recent history — this is the naive prevClose the raw INSERT would
    // have accepted at face value (all fields individually >= 100 VND floor).
    seedRow(code, vnDateOffset(3), 129, 131, 128, 130, 900_000);

    const res = await pushBars(code, [
      { date: vnDateOffset(1), open: 131, high: 133, low: 129, close: 130, volume: 1_000_000 },
    ]);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; inserted: number; skipped: number; code: string };
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(1);
    expect(body.skipped).toBe(0);
    expect(body.code).toBe(code);

    const row = readRow(code, vnDateOffset(1));
    expect(row).not.toBeNull();
    expect(row!.close).toBe(130_000);
    expect(row!.open).toBe(131_000);
    expect(row!.high).toBe(133_000);
    expect(row!.low).toBe(129_000);
  });
});

// ── TC-WH-2: brand-new ticker, no prior history → written as-is ─────────────

describe("CONTAM-10-WRITER-H TC-WH-2: brand-new ticker, no prior history → written as-is (accepted gap)", () => {
  it("no prior daily_ohlcv rows for this code → whole-row-contaminated-looking bar has no anchor to scale-detect against → written unchanged", async () => {
    const code = "CWH2";
    // No seed rows at all — a freshly-added watchlist ticker's first-ever backfill.

    const res = await pushBars(code, [
      { date: vnDateOffset(1), open: 131, high: 133, low: 129, close: 130, volume: 1_000_000 },
    ]);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; inserted: number; skipped: number; code: string };
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(1);
    expect(body.skipped).toBe(0);

    const row = readRow(code, vnDateOffset(1));
    expect(row).not.toBeNull();
    // Documents the accepted cold-start gap (handoff §Accepted gaps #1): with zero
    // prior history there is no prevClose AND no cleanRef, so writeOhlcvBatch has no
    // anchor to detect the scale error against — the bar is written exactly as
    // received. Not exploitable for tickers with deep history (VHM/VIC/FPT); only
    // matters for a freshly-added watchlist ticker's very first backfill.
    expect(row!.close).toBe(130);
    expect(row!.open).toBe(131);
    expect(row!.high).toBe(133);
    expect(row!.low).toBe(129);
  });
});

// ── TC-WH-3: legit cheap stock, all-history close < 1000 → unchanged ────────

describe("CONTAM-10-WRITER-H TC-WH-3: legit cheap stock (all-history close <1000) → unchanged", () => {
  it("existing cheap-stock history (close < CLEAN_CLOSE_FLOOR, no clean anchor) → new cheap bar written unchanged, no false-positive x1000", async () => {
    const code = "CWH3";
    // All-history close < 1000 VND — legitimately cheap stock, no clean anchor exists
    // anywhere in its history (fetchCleanReferenceCloseMap returns nothing for it).
    seedRow(code, vnDateOffset(3), 510, 530, 490, 500, 100_000);

    const res = await pushBars(code, [
      { date: vnDateOffset(1), open: 510, high: 530, low: 490, close: 520, volume: 150_000 },
    ]);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; inserted: number; skipped: number; code: string };
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(1);
    expect(body.skipped).toBe(0);

    const row = readRow(code, vnDateOffset(1));
    expect(row).not.toBeNull();
    // No false-positive correction — a legitimately cheap stock is written at face
    // value, same-order-of-magnitude vs its own contamination-free prevClose.
    expect(row!.close).toBe(520);
    expect(row!.open).toBe(510);
    expect(row!.high).toBe(530);
    expect(row!.low).toBe(490);
  });
});
