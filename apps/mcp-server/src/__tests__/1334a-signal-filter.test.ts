Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { postSignal, getSignals } from "../infrastructure/db/agentSignalStore.js";

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL, to_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL, stock_code TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
  `);
  return db;
}

describe("Task 1334a — market-wide signal filter", () => {
  it('postSignal with stockCode="unknown" → stock_code stored as NULL', () => {
    const db = makeDb();
    const id = postSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "unknown",          // agent literal string — must be normalized to null
      payload: { title: "VN-Index bearish" },
      ttlMinutes: 60,
    });
    const row = db.query<{ stock_code: string | null }, [number]>(
      "SELECT stock_code FROM agent_signals WHERE id = ?"
    ).get(id);
    expect(row).not.toBeNull();
    expect(row!.stock_code).toBeNull();   // RED: currently stores "unknown"
  });

  it('postSignal with stockCode omitted → stock_code stored as NULL', () => {
    const db = makeDb();
    const id = postSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      // stockCode omitted — defaults to null via destructuring default
      payload: { title: "VN-Index falls" },
      ttlMinutes: 60,
    });
    const row = db.query<{ stock_code: string | null }, [number]>(
      "SELECT stock_code FROM agent_signals WHERE id = ?"
    ).get(id);
    expect(row!.stock_code).toBeNull();   // already passes — regression guard
  });

  it('postSignal with stockCode=null → stock_code stored as NULL', () => {
    const db = makeDb();
    const id = postSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: null,
      payload: { title: "Macro event" },
      ttlMinutes: 60,
    });
    const row = db.query<{ stock_code: string | null }, [number]>(
      "SELECT stock_code FROM agent_signals WHERE id = ?"
    ).get(id);
    expect(row!.stock_code).toBeNull();   // already passes — regression guard
  });

  it('valid stock code "VCB" is preserved as-is', () => {
    const db = makeDb();
    const id = postSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VCB",
      payload: { title: "VCB earnings beat" },
      ttlMinutes: 60,
    });
    const row = db.query<{ stock_code: string | null }, [number]>(
      "SELECT stock_code FROM agent_signals WHERE id = ?"
    ).get(id);
    expect(row!.stock_code).toBe("VCB");  // must not normalize real tickers
  });
});
