/**
 * FIX-1296 — taAlertNotifierJob sends TA alerts to MARKET channel (not BUG)
 *
 * Acceptance criteria:
 * 1. When unnotified TA alerts exist, the injected sendFn is called (MARKET path).
 * 2. sendTelegramBug is never called for TA alert delivery.
 * 3. Default sendFn resolves to sendTelegramMarket (import check via spy).
 * 4. After successful send, rows are marked notified_telegram=1.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

// Import the module under test AFTER setting up DB env (done in setup.ts)
import { runTaAlertNotifier } from "../scheduler/market-data/taAlertNotifierJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE alerts (
      id TEXT PRIMARY KEY,
      message TEXT,
      signals_json TEXT,
      affected_actions_json TEXT,
      notified_telegram INTEGER NOT NULL DEFAULT 0,
      triggered_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return db;
}

function insertAlert(
  db: Database,
  id: string,
  signalType: string,
  code: string,
  notified = 0,
) {
  db.run(
    `INSERT INTO alerts (id, message, signals_json, affected_actions_json, notified_telegram)
     VALUES (?, ?, ?, ?, ?)`,
    [
      id,
      `${code}: RSI(14) = 72.5 — quá mua`,
      JSON.stringify([{ type: signalType }]),
      JSON.stringify([{ code }]),
      notified,
    ],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-1296 — taAlertNotifierJob MARKET channel routing", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  // ── AC-1: sendFn is called when unnotified TA alerts exist ─────────────────
  it("AC-1: calls sendFn for unnotified ta_overbought alert", async () => {
    insertAlert(db, "alert-001", "ta_overbought", "VCB");

    let calledWith: string | null = null;
    const sendFn = async (msg: string) => {
      calledWith = msg;
    };

    const result = await runTaAlertNotifier({ db, sendFn });

    expect(result.sent).toBe(1);
    expect(calledWith).not.toBeNull();
    expect(calledWith!).toContain("VCB");
    expect(calledWith!).toContain("RSI=");
    expect(calledWith!).toContain("quá mua");
  });

  // ── AC-2: sendTelegramBug is never imported/called for alert delivery ───────
  it("AC-2: sendFn wraps sendTelegramMarket — not sendTelegramBug", async () => {
    // This test verifies the source code contract: the default sendFn in
    // taAlertNotifierJob.ts must reference sendTelegramMarket, not sendTelegramBug.
    // We do this by reading the compiled/source file and checking the import string.
    const src = await Bun.file(
      new URL("../scheduler/market-data/taAlertNotifierJob.ts", import.meta.url)
        .pathname,
    ).text();

    // Must reference sendTelegramMarket in the default sendFn block
    expect(src).toContain("sendTelegramMarket");

    // Must NOT call sendTelegramBug in the default sendFn (the production path)
    // The source may still import the symbol for type checking purposes only,
    // but the default sendFn block must use sendTelegramMarket.
    const defaultSendFnBlock = src.match(
      /deps\?\.sendFn\s*\?\?[\s\S]*?(?=\n\s*\/\/\s*──|await sendFn)/,
    )?.[0] ?? "";
    expect(defaultSendFnBlock).toContain("sendTelegramMarket");
    expect(defaultSendFnBlock).not.toContain("sendTelegramBug");
  });

  // ── AC-3: already-notified rows are skipped ────────────────────────────────
  it("AC-3: already-notified rows (notified_telegram=1) are not re-sent", async () => {
    insertAlert(db, "alert-already", "ta_overbought", "HPG", 1 /* notified */);

    let callCount = 0;
    const sendFn = async () => { callCount++; };

    const result = await runTaAlertNotifier({ db, sendFn });

    expect(result.sent).toBe(0);
    expect(callCount).toBe(0);
  });

  // ── AC-4: rows are marked notified_telegram=1 after successful send ─────────
  it("AC-4: marks notified_telegram=1 after successful send", async () => {
    insertAlert(db, "alert-mark", "ta_oversold", "MBB");

    const sendFn = async () => { /* success */ };

    await runTaAlertNotifier({ db, sendFn });

    const row = db
      .prepare<{ notified_telegram: number }, [string]>(
        "SELECT notified_telegram FROM alerts WHERE id = ?",
      )
      .get("alert-mark");

    expect(row?.notified_telegram).toBe(1);
  });

  // ── AC-5: rows NOT marked if sendFn throws ─────────────────────────────────
  it("AC-5: does NOT mark rows when sendFn throws", async () => {
    insertAlert(db, "alert-fail", "ta_bb_breakout_up", "TCB");

    const sendFn = async () => { throw new Error("network error"); };

    const result = await runTaAlertNotifier({ db, sendFn });

    expect(result.sent).toBe(0);

    const row = db
      .prepare<{ notified_telegram: number }, [string]>(
        "SELECT notified_telegram FROM alerts WHERE id = ?",
      )
      .get("alert-fail");

    expect(row?.notified_telegram).toBe(0);
  });

  // ── AC-6: all four TA signal types are picked up ───────────────────────────
  it("AC-6: picks up all four TA signal types", async () => {
    insertAlert(db, "a1", "ta_overbought", "VCB");
    insertAlert(db, "a2", "ta_oversold", "HPG");
    insertAlert(db, "a3", "ta_bb_breakout_up", "MBB");
    insertAlert(db, "a4", "ta_bb_breakout_down", "TCB");

    let sentMsg: string | null = null;
    const sendFn = async (msg: string) => { sentMsg = msg; };

    const result = await runTaAlertNotifier({ db, sendFn });

    expect(result.sent).toBe(4);
    expect(sentMsg!).toContain("VCB");
    expect(sentMsg!).toContain("HPG");
    expect(sentMsg!).toContain("MBB");
    expect(sentMsg!).toContain("TCB");
  });
});
