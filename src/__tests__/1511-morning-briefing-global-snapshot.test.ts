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

// ─── Minimal DDL (commodity_prices only) ─────────────────────────────────────
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
    // Import the type — if GlobalSnapshot does not exist this import will fail
    const mod = await import("../application/usecases/assembleBriefing.js");
    // The interface manifests at runtime via a real object produced by assembleBriefing.
    // We verify the shape by checking the exported symbol exists.
    // RED: GlobalSnapshot is not exported yet — this assertion fails.
    expect(typeof (mod as Record<string, unknown>)["GlobalSnapshot"]).not.toBe("undefined");
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
    const mod = await import("../scheduler/morningBriefingJob.js");
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
    const { formatBriefingMessage } = await import("../scheduler/morningBriefingJob.js");

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
});
