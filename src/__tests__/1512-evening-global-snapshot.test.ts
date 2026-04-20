import { describe, test, expect, beforeEach } from "bun:test";
import Database from "bun:sqlite";

function setupDb(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS commodity_prices (
      source     TEXT PRIMARY KEY,
      vix        REAL NOT NULL DEFAULT 0,
      dxy        REAL NOT NULL DEFAULT 0,
      sp500      REAL NOT NULL DEFAULT 0,
      hang_seng  REAL NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rag_analyses (id INTEGER PRIMARY KEY, ticker TEXT, title TEXT, summary TEXT, level TEXT, impact_score REAL, published_at TEXT, source_url TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY, ticker TEXT, alert_type TEXT, severity TEXT, message TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS watchlist (ticker TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS market_prices (ticker TEXT PRIMARY KEY, change_pct REAL, price REAL, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS prediction_signals (id INTEGER PRIMARY KEY, ticker TEXT, signal_type TEXT, confidence TEXT, rationale TEXT, source TEXT, created_at TEXT, expires_at TEXT);
    CREATE TABLE IF NOT EXISTS market_messages (id INTEGER PRIMARY KEY, from_agent TEXT, message_type TEXT, sent_at TEXT);
    CREATE TABLE IF NOT EXISTS portfolio_positions (id INTEGER PRIMARY KEY, ticker TEXT, quantity INTEGER, avg_price REAL, opened_at TEXT, closed_at TEXT);
    CREATE TABLE IF NOT EXISTS daily_ohlcv (ticker TEXT, date TEXT, open REAL, high REAL, low REAL, close REAL, volume INTEGER, foreign_buy_vol INTEGER, foreign_sell_vol INTEGER, PRIMARY KEY (ticker, date));
  `);
}

describe("1512 evening-global-snapshot", () => {
  let db: Database;
  beforeEach(() => {
    db = new Database(":memory:");
    setupDb(db);
  });

  // AC-1
  test("AC-1: EveningSummary interface has globalSnapshot field", async () => {
    const mod = await import("../application/usecases/assembleEveningSummary.js");
    // Field not present yet — verify by calling assembleEveningSummary and checking key exists
    const summary = await (mod.assembleEveningSummary as Function)({ db });
    // RED: globalSnapshot key absent → fails hasOwnProperty or toBeDefined
    expect("globalSnapshot" in summary).toBe(true);
  });

  // AC-2
  test("AC-2: assembleEveningSummary populates globalSnapshot from commodity_prices", async () => {
    db.exec(`INSERT INTO commodity_prices VALUES ('yahoo', 19.5, 103.8, 5200.0, 17500.0, '2026-04-20T22:00:00Z')`);
    const { assembleEveningSummary } = await import("../application/usecases/assembleEveningSummary.js");
    const summary = await assembleEveningSummary({ db });
    expect(summary.globalSnapshot).toBeDefined();
    expect(summary.globalSnapshot!.vix).toBeCloseTo(19.5);
    expect(summary.globalSnapshot!.dxy).toBeCloseTo(103.8);
    expect(summary.globalSnapshot!.sp500).toBeCloseTo(5200.0);
    expect(summary.globalSnapshot!.hangSeng).toBeCloseTo(17500.0);
    expect(typeof summary.globalSnapshot!.fetchedAt).toBe("string");
  });

  // AC-3
  test("AC-3: assembleEveningSummary sets globalSnapshot=undefined when commodity_prices empty", async () => {
    const { assembleEveningSummary } = await import("../application/usecases/assembleEveningSummary.js");
    const summary = await assembleEveningSummary({ db });
    expect(summary.globalSnapshot).toBeUndefined();
  });

  // AC-4 — reuse formatter from morningBriefingJob (should already pass post-1511)
  test("AC-4: formatGlobalSnapshotSection returns header + 4 metric lines", async () => {
    const mod = await import("../scheduler/morningBriefingJob.js");
    const formatGlobal = (mod as Record<string, unknown>)["formatGlobalSnapshotSection"] as (
      snap: { vix: number; dxy: number; sp500: number; hangSeng: number; fetchedAt: string }
    ) => string[];
    const lines = formatGlobal({ vix: 19.5, dxy: 103.8, sp500: 5200.0, hangSeng: 17500.0, fetchedAt: "2026-04-20T22:00:00Z" });
    expect(lines[0]).toBe("🌐 Thị trường toàn cầu:");
    expect(lines.some((l) => l.includes("VIX"))).toBe(true);
    expect(lines.some((l) => l.includes("DXY"))).toBe(true);
    expect(lines.some((l) => l.includes("S&P500"))).toBe(true);
    expect(lines.some((l) => l.includes("Hang Seng"))).toBe(true);
  });

  // AC-5 — extracted formatter includes global block
  test("AC-5: formatEveningSummaryLines includes global snapshot section when present", async () => {
    const mod = await import("../scheduler/eveningSummaryJob.js");
    // RED: formatEveningSummaryLines not exported yet
    const formatLines = (mod as Record<string, unknown>)["formatEveningSummaryLines"] as (
      summary: Record<string, unknown>
    ) => string[];
    expect(typeof formatLines).toBe("function"); // RED: export missing
    const lines = formatLines({
      date: "2026-04-20",
      topAlerts: [],
      topStories: [],
      watchlistMovers: [],
      predictionSignals: [],
      predictionDiag: { total: 0, high: 0, critical: 0 },
      taDiag: { total: 0, rsi: 0, ma: 0 },
      taSummary: [],
      newsCount: 0,
      generatedAt: "2026-04-20T22:00:00Z",
      portfolioPnl: null,
      foreignFlowMovers: [],
      globalSnapshot: { vix: 19.5, dxy: 103.8, sp500: 5200.0, hangSeng: 17500.0, fetchedAt: "2026-04-20T22:00:00Z" },
    });
    const msg = lines.join("\n");
    expect(msg).toContain("Thị trường toàn cầu");
    expect(msg).toContain("VIX");
    expect(msg).toContain("S&P500");
  });
});
