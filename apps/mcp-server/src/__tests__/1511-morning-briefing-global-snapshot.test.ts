/**
 * 1511-morning-briefing-global-snapshot.test.ts — RED phase
 *
 * 5 failing assertions covering:
 *   AC-1: GlobalSnapshot interface shape (vix, dxy, sp500, hangSeng, fetchedAt)
 *   AC-2: assembleBriefing populates globalSnapshot from commodity_prices row
 *   AC-3: assembleBriefing sets globalSnapshot=undefined when table empty
 *   AC-4: formatGlobalSnapshotSection returns correct lines for populated snapshot
 *   AC-5: formatBriefingMessage includes "Thị trường toàn cầu" section header
 *
 * All 5 tests MUST FAIL before GREEN (1511b) starts.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import Database from "bun:sqlite";

// ─── Minimal DDL (all tables assembleBriefing queries) ───────────────────────
function setupDb(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS commodity_prices (
      source          TEXT PRIMARY KEY,
      vix             REAL NOT NULL DEFAULT 0,
      dxy             REAL NOT NULL DEFAULT 0,
      sp500           REAL NOT NULL DEFAULT 0,
      hang_seng       REAL NOT NULL DEFAULT 0,
      fetched_at      TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rag_analyses (
      source_title TEXT, level TEXT NOT NULL DEFAULT 'country',
      sentiment TEXT, impact_score REAL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY, triggered_at TEXT NOT NULL, severity TEXT NOT NULL,
      message TEXT, affected_actions_json TEXT, resolved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY, domain TEXT NOT NULL DEFAULT 'other'
    );
    CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY, action_code TEXT NOT NULL, period_type TEXT,
      period_year INTEGER, parsed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS market_prices (
      code TEXT PRIMARY KEY, price REAL, change_pct REAL, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code TEXT NOT NULL, date TEXT NOT NULL, open REAL, high REAL, low REAL,
      close REAL, volume REAL, PRIMARY KEY (code, date)
    );
  `);
}

// ─── AC-1: GlobalSnapshot interface ──────────────────────────────────────────
describe("1511 briefing-global-snapshot", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    setupDb(db);
  });

  test("AC-1: GlobalSnapshot interface has vix, dxy, sp500, hangSeng, fetchedAt", async () => {
    // GlobalSnapshot is a TS interface (no runtime value). Verify shape by producing a real
    // object via assembleBriefing with a seeded row and checking all 5 fields exist.
    db.exec(`
      INSERT INTO commodity_prices (source, vix, dxy, sp500, hang_seng, fetched_at)
      VALUES ('yahoo', 18.5, 104.3, 5120.75, 17250.0, '2026-04-20T07:00:00Z');
    `);
    const { assembleBriefing } = await import("../application/usecases/assembleBriefing.js");
    const briefing = await assembleBriefing({ db, pollNewsFn: async () => {}, fetchVnIndexFn: async () => null });
    const snap = briefing.globalSnapshot!;
    expect(snap).toBeDefined();
    expect(typeof snap.vix).toBe("number");
    expect(typeof snap.dxy).toBe("number");
    expect(typeof snap.sp500).toBe("number");
    expect(typeof snap.hangSeng).toBe("number");
    expect(typeof snap.fetchedAt).toBe("string");
  });

  // AC-2: assembleBriefing populates globalSnapshot from DB row
  test("AC-2: assembleBriefing populates globalSnapshot when commodity_prices has a row", async () => {
    db.exec(`
      INSERT INTO commodity_prices (source, vix, dxy, sp500, hang_seng, fetched_at)
      VALUES ('yahoo', 18.5, 104.3, 5120.75, 17250.0, '2026-04-20T07:00:00Z');
    `);

    const { assembleBriefing } = await import("../application/usecases/assembleBriefing.js");

    const briefing = await assembleBriefing({
      db,
      pollNewsFn: async () => {},
      fetchVnIndexFn: async () => null,
    });

    // RED: globalSnapshot field does not exist yet
    expect(briefing.globalSnapshot).toBeDefined();
    expect(briefing.globalSnapshot!.vix).toBeCloseTo(18.5);
    expect(briefing.globalSnapshot!.dxy).toBeCloseTo(104.3);
    expect(briefing.globalSnapshot!.sp500).toBeCloseTo(5120.75);
    expect(briefing.globalSnapshot!.hangSeng).toBeCloseTo(17250.0);
    expect(typeof briefing.globalSnapshot!.fetchedAt).toBe("string");
  });

  // AC-3: assembleBriefing sets globalSnapshot=undefined when table empty
  test("AC-3: assembleBriefing sets globalSnapshot=undefined when commodity_prices empty", async () => {
    const { assembleBriefing } = await import("../application/usecases/assembleBriefing.js");

    const briefing = await assembleBriefing({
      db,
      pollNewsFn: async () => {},
      fetchVnIndexFn: async () => null,
    });

    // RED: globalSnapshot key is absent / not handled yet — this check ensures
    // the implementation handles empty table gracefully (undefined, not throws)
    expect(briefing.globalSnapshot).toBeUndefined();
  });

  // AC-4: formatGlobalSnapshotSection returns correct lines
  test("AC-4: formatGlobalSnapshotSection returns header + 4 metric lines", async () => {
    const mod = await import("../scheduler/briefings/morningBriefingJob.js");
    // RED: formatGlobalSnapshotSection not exported yet
    const formatGlobal = (mod as Record<string, unknown>)["formatGlobalSnapshotSection"] as (
      snap: { vix: number; dxy: number; sp500: number; hangSeng: number; fetchedAt: string }
    ) => string[];

    const snap = { vix: 18.5, dxy: 104.3, sp500: 5120.75, hangSeng: 17250.0, fetchedAt: "2026-04-20T07:00:00Z" };
    const lines = formatGlobal(snap);

    expect(lines[0]).toBe("🌐 Thị trường toàn cầu:");
    expect(lines.some((l) => l.includes("VIX"))).toBe(true);
    expect(lines.some((l) => l.includes("DXY"))).toBe(true);
    expect(lines.some((l) => l.includes("S&P500"))).toBe(true);
    expect(lines.some((l) => l.includes("Hang Seng"))).toBe(true);
  });

  // AC-5: formatBriefingMessage includes "Thị trường toàn cầu" header
  test("AC-5: formatBriefingMessage includes global snapshot section when present", async () => {
    const { formatBriefingMessage } = await import("../scheduler/briefings/morningBriefingJob.js");

    const briefing = {
      date: "2026-04-20",
      topStories: [],
      alerts: [],
      watchlistSummary: [],
      newReports: [],
      macroSnapshot: [],
      sensitiveWarnings: [],
      trackedCommodities: [],
      unresolvedAlerts: [],
      topConviction: null,
      predictionSignals: [],
      generatedAt: "2026-04-20T07:00:00Z",
      globalSnapshot: {
        vix: 18.5,
        dxy: 104.3,
        sp500: 5120.75,
        hangSeng: 17250.0,
        fetchedAt: "2026-04-20T07:00:00Z",
      },
    } as Parameters<typeof formatBriefingMessage>[0];

    const msg = formatBriefingMessage(briefing);

    // RED: globalSnapshot block not rendered yet
    expect(msg).toContain("Thị trường toàn cầu");
    expect(msg).toContain("VIX");
    expect(msg).toContain("S&P500");
  });

  // AC-6: formatGlobalSnapshotSection renders ↑ arrows when current > prev
  test("AC-6: formatGlobalSnapshotSection shows ↑ when current > prev", async () => {
    const { formatGlobalSnapshotSection } = await import("../scheduler/briefings/morningBriefingJob.js");
    const snap = {
      vix: 20.0, dxy: 105.0, sp500: 5200.0, hangSeng: 18000.0,
      fetchedAt: "2026-04-28T07:00:00Z",
      prevVix: 18.5, prevDxy: 104.3, prevSp500: 5120.0, prevHangSeng: 17500.0,
    };
    const lines = formatGlobalSnapshotSection(snap);
    expect(lines.find((l) => l.includes("VIX"))).toContain("↑");
    expect(lines.find((l) => l.includes("DXY"))).toContain("↑");
    expect(lines.find((l) => l.includes("S&P500"))).toContain("↑");
    expect(lines.find((l) => l.includes("Hang Seng"))).toContain("↑");
  });

  // AC-7: formatGlobalSnapshotSection renders ↓ arrows when current < prev
  test("AC-7: formatGlobalSnapshotSection shows ↓ when current < prev", async () => {
    const { formatGlobalSnapshotSection } = await import("../scheduler/briefings/morningBriefingJob.js");
    const snap = {
      vix: 17.0, dxy: 103.0, sp500: 5000.0, hangSeng: 17000.0,
      fetchedAt: "2026-04-28T07:00:00Z",
      prevVix: 18.5, prevDxy: 104.3, prevSp500: 5120.0, prevHangSeng: 17500.0,
    };
    const lines = formatGlobalSnapshotSection(snap);
    expect(lines.find((l) => l.includes("VIX"))).toContain("↓");
    expect(lines.find((l) => l.includes("DXY"))).toContain("↓");
    expect(lines.find((l) => l.includes("S&P500"))).toContain("↓");
    expect(lines.find((l) => l.includes("Hang Seng"))).toContain("↓");
  });

  // AC-8: formatGlobalSnapshotSection renders no arrow when prev absent
  test("AC-8: formatGlobalSnapshotSection shows no arrow when prev fields absent", async () => {
    const { formatGlobalSnapshotSection } = await import("../scheduler/briefings/morningBriefingJob.js");
    const snap = { vix: 18.5, dxy: 104.3, sp500: 5120.75, hangSeng: 17250.0, fetchedAt: "2026-04-28T07:00:00Z" };
    const lines = formatGlobalSnapshotSection(snap);
    for (const line of lines.slice(1)) {
      expect(line).not.toContain("↑");
      expect(line).not.toContain("↓");
    }
  });

  // AC-9: assembleBriefing populates prev* fields when two commodity_prices rows exist
  test("AC-9: assembleBriefing populates prev* fields when two rows exist", async () => {
    db.exec(`
      INSERT INTO commodity_prices (source, vix, dxy, sp500, hang_seng, fetched_at)
      VALUES ('yahoo_prev', 18.0, 103.5, 5050.0, 17000.0, '2026-04-27T07:00:00Z');
      INSERT INTO commodity_prices (source, vix, dxy, sp500, hang_seng, fetched_at)
      VALUES ('yahoo', 19.5, 104.8, 5200.0, 17500.0, '2026-04-28T07:00:00Z');
    `);
    const { assembleBriefing } = await import("../application/usecases/assembleBriefing.js");
    const briefing = await assembleBriefing({ db, pollNewsFn: async () => {}, fetchVnIndexFn: async () => null });
    expect(briefing.globalSnapshot).toBeDefined();
    expect(briefing.globalSnapshot!.prevVix).toBeCloseTo(18.0);
    expect(briefing.globalSnapshot!.prevDxy).toBeCloseTo(103.5);
    expect(briefing.globalSnapshot!.prevSp500).toBeCloseTo(5050.0);
    expect(briefing.globalSnapshot!.prevHangSeng).toBeCloseTo(17000.0);
  });
});
