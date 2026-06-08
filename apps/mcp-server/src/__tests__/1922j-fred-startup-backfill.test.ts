/**
 * Task 1922j — FRED startup backfill for fred_series_daily
 *
 * Tests that:
 * 1. fetchFredEffrIorb populates fred_series_daily when called with mocked HTTP
 * 2. INSERT OR IGNORE guarantees idempotency (re-run inserts 0 new rows)
 * 3. Both EFFR and IORB series are written with correct columns
 * 4. The backfill function returns null when HTTP fails for both series
 *
 * Note: DB_PATH=:memory: is enforced by setup.ts preload.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { fetchFredEffrIorb } from "../infrastructure/fetchers/fredEffrIorb.js";

// ── DDL (mirror of schema-macro.ts subset) ────────────────────────────────────

function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS fred_series_daily (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      series     TEXT NOT NULL,
      date       TEXT NOT NULL,
      value      REAL NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (series, date)
    );
  `);
  return db;
}

// ── Minimal CSV fixture matching FRED public endpoint format ──────────────────

const EFFR_CSV = `DATE,VALUE
2026-05-12,5.33
2026-05-13,5.33
2026-05-14,5.33
`;

const IORB_CSV = `DATE,VALUE
2026-05-12,5.40
2026-05-13,5.40
2026-05-14,5.40
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function countRows(db: Database, series: string): number {
  return (
    db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) AS cnt FROM fred_series_daily WHERE series = ?",
      )
      .get(series) ?? { cnt: 0 }
  ).cnt;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Task 1922j — FRED startup backfill: fred_series_daily population", () => {
  let db: Database;

  beforeEach(() => {
    db = buildDb();
  });

  it("AC-1: populates EFFR and IORB rows on first call (empty table)", async () => {
    // Precondition: table is empty
    expect(countRows(db, "EFFR")).toBe(0);
    expect(countRows(db, "IORB")).toBe(0);

    const mockClient = {
      async get(url: string): Promise<string> {
        if (url.includes("EFFR")) return EFFR_CSV;
        if (url.includes("IORB")) return IORB_CSV;
        throw new Error("unexpected URL");
      },
    };

    const result = await fetchFredEffrIorb(mockClient, db, async () => {});

    expect(result).not.toBeNull();
    // 3 new EFFR rows
    expect(result!.effrRows).toBe(3);
    // 3 new IORB rows
    expect(result!.iorbRows).toBe(3);
    expect(countRows(db, "EFFR")).toBe(3);
    expect(countRows(db, "IORB")).toBe(3);
  });

  it("AC-2: INSERT OR IGNORE — re-run inserts 0 new rows (idempotent)", async () => {
    const mockClient = {
      async get(url: string): Promise<string> {
        if (url.includes("EFFR")) return EFFR_CSV;
        if (url.includes("IORB")) return IORB_CSV;
        throw new Error("unexpected URL");
      },
    };

    // First run — inserts 3+3
    await fetchFredEffrIorb(mockClient, db, async () => {});

    // Second run — should see 0 new rows each (idempotency)
    const result2 = await fetchFredEffrIorb(mockClient, db, async () => {});
    expect(result2).not.toBeNull();
    expect(result2!.effrRows).toBe(0);
    expect(result2!.iorbRows).toBe(0);

    // Row count unchanged
    expect(countRows(db, "EFFR")).toBe(3);
    expect(countRows(db, "IORB")).toBe(3);
  });

  it("AC-3: correct series + date + value stored for EFFR", async () => {
    const mockClient = {
      async get(url: string): Promise<string> {
        if (url.includes("EFFR")) return EFFR_CSV;
        if (url.includes("IORB")) return IORB_CSV;
        throw new Error("unexpected URL");
      },
    };
    await fetchFredEffrIorb(mockClient, db, async () => {});

    const row = db
      .prepare<{ series: string; date: string; value: number }, [string]>(
        "SELECT series, date, value FROM fred_series_daily WHERE series = ? ORDER BY date DESC LIMIT 1",
      )
      .get("EFFR");

    expect(row).not.toBeNull();
    expect(row!.series).toBe("EFFR");
    expect(row!.date).toBe("2026-05-14");
    expect(row!.value).toBeCloseTo(5.33, 2);
  });

  it("AC-4: returns null when HTTP fails for both EFFR and IORB", async () => {
    const failClient = {
      async get(_url: string): Promise<string> {
        throw new Error("network error");
      },
    };

    // Inject no-op sleep so backoff doesn't slow down the test
    const result = await fetchFredEffrIorb(failClient, db, async () => {});

    // Both failed → null
    expect(result).toBeNull();
    // No rows inserted
    expect(countRows(db, "EFFR")).toBe(0);
    expect(countRows(db, "IORB")).toBe(0);
  });
});
