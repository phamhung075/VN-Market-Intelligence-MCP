/**
 * Task 1315 — TDD test for taAlertNotifierJob (Task 1314)
 *
 * TDD: all tests written before implementation.
 * Tests use an in-memory SQLite database with full alerts DDL.
 *
 * AC coverage:
 *   AC-1: Empty/notified-only table → sendFn not called; returns { sent:0, skipped:0 }
 *   AC-2: One ta_overbought row → sendFn called once; message contains ticker + "quá mua"; starts "TA Alert"
 *   AC-3: Mark notified_telegram=1 after send → DB updated; returns { sent:1, skipped:0 }
 *   AC-4: sendFn throws → notified_telegram stays 0; returns { sent:0, skipped:0 }
 *   AC-5: Non-TA type (position-danger) → sendFn not called; row unchanged
 *   AC-6: Already notified (notified_telegram=1) → sendFn not called
 *   AC-7: Three tickers (mixed types) → sendFn called once; message contains all 3 codes; returns { sent:3, skipped:0 }
 *   AC-8: ta_bb_breakout_up + ta_bb_breakout_down → both in message; returns { sent:2, skipped:0 }
 *   AC-9: Any non-empty batch → message begins "TA Alert"
 *   AC-10: CRONS.taAlertNotifier key present
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runTaAlertNotifier,
  type TaAlertNotifierResult,
} from "../scheduler/market-data/taAlertNotifierJob.js";
import { CRONS } from "../scheduler/jobs.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB setup — full alerts DDL including notified_telegram column
// Pattern from src/__tests__/1133-foreign-flow-alert-job.test.ts
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");

  db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,
      signals_json          TEXT,
      affected_actions_json TEXT,
      analysis_ids_json     TEXT,
      message               TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      user_note             TEXT,
      notified_telegram     INTEGER NOT NULL DEFAULT 0,
      sent_by               TEXT NOT NULL DEFAULT 'server',
      resolved_at           TEXT,
      resolution_notes      TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent   TEXT NOT NULL,
      to_agent     TEXT NOT NULL,
      signal_type  TEXT NOT NULL,
      stock_code   TEXT,
      payload      TEXT NOT NULL DEFAULT '{}',
      status       TEXT NOT NULL DEFAULT 'unread',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at   TEXT NOT NULL,
      outcome      TEXT,
      outcome_at   TEXT,
      outcome_detail TEXT
    )
  `);

  return db;
}

// ── agent_signals seed helper ─────────────────────────────────────────────────

interface SignalSeed {
  id?: number;
  stockCode: string;
  signalType: string;
  createdAt?: string; // SQLite datetime string, defaults to 'now'
  outcome?: string | null;
}

function seedSignal(db: Database, seed: SignalSeed): number {
  const { stockCode, signalType, createdAt, outcome = null } = seed;
  const createdAtValue = createdAt ?? new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
  const result = db.run(
    `INSERT INTO agent_signals
       (from_agent, to_agent, signal_type, stock_code, payload, status,
        created_at, expires_at, outcome)
     VALUES ('market-watcher', 'alert-commander', ?, ?, '{}', 'unread', ?, datetime('now', '+2 hours'), ?)`,
    [signalType, stockCode, createdAtValue, outcome],
  );
  return Number(result.lastInsertRowid);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface AlertSeed {
  id: string;
  signalType: string;
  code: string;
  message: string;
  notified?: number;
  severity?: string;
}

function seedAlert(db: Database, seed: AlertSeed): void {
  const {
    id,
    signalType,
    code,
    message,
    notified = 0,
    severity = "warning",
  } = seed;

  const signalsJson = JSON.stringify([
    {
      type: signalType,
      actionCode: code,
      message,
      confidence: 0.75,
      detectedAt: new Date().toISOString(),
    },
  ]);
  const affectedActionsJson = JSON.stringify([{ code }]);

  db.run(
    `INSERT INTO alerts
      (id, triggered_at, severity, signals_json, affected_actions_json,
       analysis_ids_json, message, read, user_note, notified_telegram, sent_by)
     VALUES (?, datetime('now'), ?, ?, ?, NULL, ?, 0, NULL, ?, 'server')`,
    [id, severity, signalsJson, affectedActionsJson, message, notified],
  );
}

function makeNoopSendFn(): {
  sendFn: (msg: string, opts: unknown) => Promise<void>;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    sendFn: async (msg: string) => {
      calls.push(msg);
    },
    calls,
  };
}

function makeThrowingSendFn(): (msg: string, opts: unknown) => Promise<void> {
  return async () => {
    throw new Error("Telegram network error");
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1314/1315 — taAlertNotifierJob", () => {

  describe("AC-10: CRONS key", () => {
    it("CRONS.taAlertNotifier = '*/15 2-8 * * 1-5' (15-min VN market hours, UTC)", () => {
      const expected = Bun.env.CRON_TA_ALERT_NOTIFIER ?? "*/15 2-8 * * 1-5";
      expect(CRONS.taAlertNotifier).toBe(expected);
    });
  });

  describe("AC-1: Empty alerts table — no-op", () => {
    it("returns { sent: 0, skipped: 0 } when alerts table is empty", async () => {
      const db = makeDb();
      const { sendFn, calls } = makeNoopSendFn();

      const result = await runTaAlertNotifier({ db, sendFn });

      expect(result).toEqual({ sent: 0, skipped: 0 });
      expect(calls.length).toBe(0);
    });

    it("returns { sent: 0, skipped: 0 } when only already-notified TA rows exist", async () => {
      const db = makeDb();
      seedAlert(db, {
        id: "alert-1",
        signalType: "ta_overbought",
        code: "VCB",
        message: "VCB: RSI(14) = 74.2 — quá mua",
        notified: 1,
      });
      const { sendFn, calls } = makeNoopSendFn();

      const result = await runTaAlertNotifier({ db, sendFn });

      expect(result).toEqual({ sent: 0, skipped: 0 });
      expect(calls.length).toBe(0);
    });
  });

  describe("AC-2: Sends Telegram for one unnotified ta_overbought alert", () => {
    let db: Database;
    let calls: string[];
    let result: TaAlertNotifierResult;

    beforeEach(async () => {
      db = makeDb();
      seedAlert(db, {
        id: "alert-vcb-overbought",
        signalType: "ta_overbought",
        code: "VCB",
        message: "VCB: RSI(14) = 74.2 — quá mua",
      });
      const noop = makeNoopSendFn();
      calls = noop.calls;
      result = await runTaAlertNotifier({ db, sendFn: noop.sendFn });
    });

    it("sendFn called exactly once", () => {
      expect(calls.length).toBe(1);
    });

    it("message contains ticker code 'VCB'", () => {
      expect(calls[0]).toContain("VCB");
    });

    it("message contains Vietnamese label 'quá mua'", () => {
      expect(calls[0]).toContain("quá mua");
    });

    it("message starts with 'TA Alert'", () => {
      expect(calls[0]).toMatch(/^TA Alert/);
    });

    it("returns { sent: 1, skipped: 0 }", () => {
      expect(result).toEqual({ sent: 1, skipped: 0 });
    });
  });

  describe("AC-3: Marks notified_telegram=1 after successful send", () => {
    it("notified_telegram becomes 1 after successful send", async () => {
      const db = makeDb();
      seedAlert(db, {
        id: "alert-mark-test",
        signalType: "ta_overbought",
        code: "HPG",
        message: "HPG: RSI(14) = 71.0 — quá mua",
      });
      const { sendFn } = makeNoopSendFn();

      await runTaAlertNotifier({ db, sendFn });

      const row = db
        .query<{ notified_telegram: number }, [string]>(
          "SELECT notified_telegram FROM alerts WHERE id = ?",
        )
        .get("alert-mark-test");
      expect(row).not.toBeNull();
      expect(row!.notified_telegram).toBe(1);
    });
  });

  describe("AC-4: Does NOT mark notified_telegram=1 if sendFn throws", () => {
    it("notified_telegram stays 0 when sendFn throws", async () => {
      const db = makeDb();
      seedAlert(db, {
        id: "alert-throw-test",
        signalType: "ta_overbought",
        code: "FPT",
        message: "FPT: RSI(14) = 72.5 — quá mua",
      });

      const result = await runTaAlertNotifier({
        db,
        sendFn: makeThrowingSendFn(),
      });

      const row = db
        .query<{ notified_telegram: number }, [string]>(
          "SELECT notified_telegram FROM alerts WHERE id = ?",
        )
        .get("alert-throw-test");
      expect(row!.notified_telegram).toBe(0);
      expect(result).toEqual({ sent: 0, skipped: 0 });
    });
  });

  describe("AC-5: Skips non-TA alert types", () => {
    it("position-danger row with notified_telegram=0 is not sent", async () => {
      const db = makeDb();
      seedAlert(db, {
        id: "alert-position-danger",
        signalType: "position-danger",
        code: "VNM",
        message: "VNM: stop-loss breached",
        severity: "high",
      });
      const { sendFn, calls } = makeNoopSendFn();

      const result = await runTaAlertNotifier({ db, sendFn });

      expect(calls.length).toBe(0);
      expect(result).toEqual({ sent: 0, skipped: 0 });

      // Row should remain unnotified
      const row = db
        .query<{ notified_telegram: number }, [string]>(
          "SELECT notified_telegram FROM alerts WHERE id = ?",
        )
        .get("alert-position-danger");
      expect(row!.notified_telegram).toBe(0);
    });
  });

  describe("AC-6: Skips already-notified rows", () => {
    it("notified_telegram=1 row is not re-sent", async () => {
      const db = makeDb();
      seedAlert(db, {
        id: "alert-already-notified",
        signalType: "ta_overbought",
        code: "MWG",
        message: "MWG: RSI(14) = 75.0 — quá mua",
        notified: 1,
      });
      const { sendFn, calls } = makeNoopSendFn();

      await runTaAlertNotifier({ db, sendFn });

      expect(calls.length).toBe(0);
    });
  });

  describe("AC-7: Batches multiple tickers into one message", () => {
    let db: Database;
    let calls: string[];
    let result: TaAlertNotifierResult;

    beforeEach(async () => {
      db = makeDb();
      seedAlert(db, {
        id: "alert-vcb-ob",
        signalType: "ta_overbought",
        code: "VCB",
        message: "VCB: RSI(14) = 74.2 — quá mua",
      });
      seedAlert(db, {
        id: "alert-hpg-os",
        signalType: "ta_oversold",
        code: "HPG",
        message: "HPG: RSI(14) = 27.8 — quá bán",
      });
      seedAlert(db, {
        id: "alert-fpt-bb-up",
        signalType: "ta_bb_breakout_up",
        code: "FPT",
        message: "FPT: giá 88000 vượt BB trên 86500 — bứt phá tăng",
      });
      const noop = makeNoopSendFn();
      calls = noop.calls;
      result = await runTaAlertNotifier({ db, sendFn: noop.sendFn });
    });

    it("sendFn called exactly once", () => {
      expect(calls.length).toBe(1);
    });

    it("message contains 'VCB'", () => {
      expect(calls[0]).toContain("VCB");
    });

    it("message contains 'HPG'", () => {
      expect(calls[0]).toContain("HPG");
    });

    it("message contains 'FPT'", () => {
      expect(calls[0]).toContain("FPT");
    });

    it("returns { sent: 3, skipped: 0 }", () => {
      expect(result).toEqual({ sent: 3, skipped: 0 });
    });
  });

  describe("AC-8: Handles ta_bb_breakout_up and ta_bb_breakout_down types", () => {
    let db: Database;
    let result: TaAlertNotifierResult;
    let calls: string[];

    beforeEach(async () => {
      db = makeDb();
      seedAlert(db, {
        id: "alert-bb-up",
        signalType: "ta_bb_breakout_up",
        code: "VNM",
        message: "VNM: giá 78000 vượt BB trên 76500 — bứt phá tăng",
      });
      seedAlert(db, {
        id: "alert-bb-down",
        signalType: "ta_bb_breakout_down",
        code: "TCB",
        message: "TCB: giá 22000 dưới BB dưới 23100 — bứt phá giảm",
      });
      const noop = makeNoopSendFn();
      calls = noop.calls;
      result = await runTaAlertNotifier({ db, sendFn: noop.sendFn });
    });

    it("both rows included in the single Telegram message", () => {
      expect(calls.length).toBe(1);
      expect(calls[0]).toContain("VNM");
      expect(calls[0]).toContain("TCB");
    });

    it("message contains BB breakout Vietnamese labels", () => {
      expect(calls[0]).toContain("bứt phá tăng");
      expect(calls[0]).toContain("bứt phá giảm");
    });

    it("returns { sent: 2, skipped: 0 }", () => {
      expect(result).toEqual({ sent: 2, skipped: 0 });
    });
  });

  describe("AC-9: Message header contains 'TA Alert'", () => {
    it("message starts with 'TA Alert' for any non-empty batch", async () => {
      const db = makeDb();
      seedAlert(db, {
        id: "alert-header-test",
        signalType: "ta_overbought",
        code: "SSI",
        message: "SSI: RSI(14) = 73.5 — quá mua",
      });
      const { sendFn, calls } = makeNoopSendFn();

      await runTaAlertNotifier({ db, sendFn });

      expect(calls[0]).toMatch(/^TA Alert/);
    });
  });

  describe("Batch cap: sends first 10 rows when >10 unnotified", () => {
    it("marks exactly 10 rows notified when 12 unnotified rows exist", async () => {
      const db = makeDb();
      for (let i = 1; i <= 12; i++) {
        seedAlert(db, {
          id: `alert-batch-${i}`,
          signalType: "ta_overbought",
          code: `T${String(i).padStart(2, "0")}`,
          message: `T${String(i).padStart(2, "0")}: RSI(14) = 74.0 — quá mua`,
        });
      }
      const { sendFn, calls } = makeNoopSendFn();

      const result = await runTaAlertNotifier({ db, sendFn });

      // sendFn called once
      expect(calls.length).toBe(1);
      // sent = 10 (batch cap)
      expect(result.sent).toBe(10);

      // 10 rows marked notified, 2 still at 0
      const notifiedCount = db
        .query<{ cnt: number }, []>(
          "SELECT COUNT(*) AS cnt FROM alerts WHERE notified_telegram = 1",
        )
        .get()!.cnt;
      const pendingCount = db
        .query<{ cnt: number }, []>(
          "SELECT COUNT(*) AS cnt FROM alerts WHERE notified_telegram = 0",
        )
        .get()!.cnt;
      expect(notifiedCount).toBe(10);
      expect(pendingCount).toBe(2);
    });
  });

  describe("ta_oversold type formatting", () => {
    it("message contains 'quá bán' for ta_oversold alert", async () => {
      const db = makeDb();
      seedAlert(db, {
        id: "alert-oversold",
        signalType: "ta_oversold",
        code: "HPG",
        message: "HPG: RSI(14) = 27.8 — quá bán",
      });
      const { sendFn, calls } = makeNoopSendFn();

      await runTaAlertNotifier({ db, sendFn });

      expect(calls[0]).toContain("quá bán");
      expect(calls[0]).toContain("HPG");
    });
  });

  // ── Task 1382b — agent_signals 'fired' outcome wiring ────────────────────

  describe("AC-B1: Writes 'fired' outcome to agent_signals after successful send", () => {
    it("matching signal_type=price_anomaly row gets outcome='fired'", async () => {
      const db = makeDb();
      seedAlert(db, {
        id: "alert-b1-vcb",
        signalType: "ta_overbought",
        code: "VCB",
        message: "VCB: RSI(14) = 74.2 — quá mua",
      });
      const sigId = seedSignal(db, { stockCode: "VCB", signalType: "price_anomaly" });
      const { sendFn } = makeNoopSendFn();

      await runTaAlertNotifier({ db, sendFn });

      const row = db
        .query<{ outcome: string | null }, [number]>(
          "SELECT outcome FROM agent_signals WHERE id = ?",
        )
        .get(sigId);
      expect(row?.outcome).toBe("fired");
    });

    it("matching signal_type=urgent_news row gets outcome='fired'", async () => {
      const db = makeDb();
      seedAlert(db, {
        id: "alert-b1-hpg",
        signalType: "ta_oversold",
        code: "HPG",
        message: "HPG: RSI(14) = 27.8 — quá bán",
      });
      const sigId = seedSignal(db, { stockCode: "HPG", signalType: "urgent_news" });
      const { sendFn } = makeNoopSendFn();

      await runTaAlertNotifier({ db, sendFn });

      const row = db
        .query<{ outcome: string | null }, [number]>(
          "SELECT outcome FROM agent_signals WHERE id = ?",
        )
        .get(sigId);
      expect(row?.outcome).toBe("fired");
    });
  });

  describe("AC-B2: Does NOT overwrite signals with outcome already set", () => {
    it("signal with outcome='suppressed' is not changed to 'fired'", async () => {
      const db = makeDb();
      seedAlert(db, {
        id: "alert-b2-vcb",
        signalType: "ta_overbought",
        code: "VCB",
        message: "VCB: RSI(14) = 74.2 — quá mua",
      });
      const sigId = seedSignal(db, {
        stockCode: "VCB",
        signalType: "price_anomaly",
        outcome: "suppressed",
      });
      const { sendFn } = makeNoopSendFn();

      await runTaAlertNotifier({ db, sendFn });

      const row = db
        .query<{ outcome: string | null }, [number]>(
          "SELECT outcome FROM agent_signals WHERE id = ?",
        )
        .get(sigId);
      expect(row?.outcome).toBe("suppressed");
    });
  });

  describe("AC-B3: Does NOT touch signals older than 4 hours", () => {
    it("signal created 5 hours ago is not marked 'fired'", async () => {
      const db = makeDb();
      seedAlert(db, {
        id: "alert-b3-fpt",
        signalType: "ta_overbought",
        code: "FPT",
        message: "FPT: RSI(14) = 73.0 — quá mua",
      });
      // created_at 5 hours ago — outside the -4h window
      const fiveHoursAgo = new Date(Date.now() - 5 * 3_600_000)
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d{3}Z$/, "");
      const sigId = seedSignal(db, {
        stockCode: "FPT",
        signalType: "price_anomaly",
        createdAt: fiveHoursAgo,
      });
      const { sendFn } = makeNoopSendFn();

      await runTaAlertNotifier({ db, sendFn });

      const row = db
        .query<{ outcome: string | null }, [number]>(
          "SELECT outcome FROM agent_signals WHERE id = ?",
        )
        .get(sigId);
      expect(row?.outcome).toBeNull();
    });
  });

  describe("AC-B4: Does NOT call recordOutcome when sendFn throws", () => {
    it("signal outcome stays NULL when sendFn throws", async () => {
      const db = makeDb();
      seedAlert(db, {
        id: "alert-b4-mwg",
        signalType: "ta_overbought",
        code: "MWG",
        message: "MWG: RSI(14) = 76.0 — quá mua",
      });
      const sigId = seedSignal(db, { stockCode: "MWG", signalType: "price_anomaly" });

      await runTaAlertNotifier({ db, sendFn: makeThrowingSendFn() });

      const row = db
        .query<{ outcome: string | null }, [number]>(
          "SELECT outcome FROM agent_signals WHERE id = ?",
        )
        .get(sigId);
      expect(row?.outcome).toBeNull();
    });
  });
});
