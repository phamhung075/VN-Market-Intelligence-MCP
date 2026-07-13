Bun.env["DB_PATH"] = ":memory:";
/**
 * FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN
 *
 * Second call site of the same class of bug fixed by FIX-BCTC-D1-STABILIZE-
 * REPORT-ID (docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md §D1).
 * `tryNewsChainFallback()` used `INSERT OR REPLACE INTO financial_reports`
 * with a fresh `randomUUID()` on every call — SQLite resolves the
 * UNIQUE(action_code, sort_key) conflict via DELETE-then-INSERT, minting a
 * brand-new `id` on every re-run. Downstream PEK tables (bctc_layout_units,
 * bctc_page_zones) reference financial_reports.id via a plain TEXT column
 * (no real FK), so a replaced id silently orphans any rows already written
 * against the old id.
 *
 * The fix: `INSERT ... ON CONFLICT(action_code, sort_key) DO UPDATE SET
 * <all columns except id>` — the existing row is updated in place, `id` is
 * never touched by the DO UPDATE clause, so it survives every re-run.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { tryNewsChainFallback } from "../application/usecases/bctc/newsChainFallback.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

const ACTION_CODE = "NEWSIDSTBL";
const YEAR = 2024;
const QUARTER = "Q1" as const;
const SORT_KEY = `${YEAR}-${QUARTER}`;

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}
function daysFromNow(d: number): string {
  return new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString();
}

function seedTwoConfirmingSignals(): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "news_scout",
    "market_watcher",
    "chain_catalyst",
    ACTION_CODE,
    "{}",
    JSON.stringify({
      event_type: "earnings",
      direction: "bullish",
      confidence: 0.8,
      affected_stocks: [ACTION_CODE],
      affected_sectors: ["banking"],
      headline: `${ACTION_CODE} Revenue Growth Outperforms Expectations`,
      source: "reuters",
      newsSentiment: 0.6,
    }),
    hoursAgo(2),
    daysFromNow(7),
  );
  db.prepare(`
    INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "market_watcher",
    "alert_commander",
    "price_confirmation",
    ACTION_CODE,
    "{}",
    JSON.stringify({
      price_change_pct: 2.5,
      volume_ratio: 1.8,
      confirms_direction: true,
      fully_priced: false,
      confidence: 0.75,
    }),
    hoursAgo(1),
    daysFromNow(7),
  );
}

beforeAll(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  Bun.env["BCTC_FALLBACK_SIGNAL_MAX_AGE_DAYS"] = "30";
  await initDatabase();
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
  delete Bun.env["BCTC_FALLBACK_SIGNAL_MAX_AGE_DAYS"];
});

describe("FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN — financial_reports.id survives re-run", () => {
  it("keeps the SAME id and preserves child FK rows across two fallback runs for the identical (action_code, sort_key)", async () => {
    seedTwoConfirmingSignals();

    // ── Run #1 — first-ever fallback write for this (action_code, sort_key) ──
    const first = await tryNewsChainFallback(ACTION_CODE, YEAR, QUARTER);
    expect(first.fallback).toBe(true);
    expect(first.report).toBeDefined();
    const firstId = first.report!.id;
    expect(firstId).toBeTruthy();

    const db = getDb();
    const row1 = db
      .prepare("SELECT id FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get(ACTION_CODE, SORT_KEY) as { id: string } | null;
    expect(row1).not.toBeNull();
    expect(row1!.id).toBe(firstId);

    // Simulate a PEK layout-extraction pass that landed child rows keyed to
    // this fallback row's id (the exact scenario a replaced id would orphan).
    db.prepare(`
      INSERT INTO bctc_layout_units (report_id, unit_id, schema_page, page_numbers_json)
      VALUES (?, ?, ?, ?)
    `).run(firstId, "unit-1", 1, JSON.stringify([1]));

    const childCountBefore = db
      .prepare("SELECT COUNT(*) AS cnt FROM bctc_layout_units WHERE report_id = ?")
      .get(firstId) as { cnt: number };
    expect(childCountBefore.cnt).toBe(1);

    // ── Run #2 — re-run of the SAME (action_code, sort_key) ──────────────────
    const second = await tryNewsChainFallback(ACTION_CODE, YEAR, QUARTER);
    expect(second.fallback).toBe(true);
    const secondId = second.report!.id;

    // ── Core assertion: id UNCHANGED across the re-run ──────────────────────
    expect(secondId).toBe(firstId);

    const row2 = db
      .prepare("SELECT id FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get(ACTION_CODE, SORT_KEY) as { id: string } | null;
    expect(row2).not.toBeNull();
    expect(row2!.id).toBe(firstId);

    // ── Exactly one row for this (action_code, sort_key) — no duplicate ─────
    const countRow = db
      .prepare("SELECT COUNT(*) AS cnt FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get(ACTION_CODE, SORT_KEY) as { cnt: number };
    expect(countRow.cnt).toBe(1);

    // ── Child FK rows from run #1 are STILL joinable — not orphaned ────────
    const childCountAfter = db
      .prepare("SELECT COUNT(*) AS cnt FROM bctc_layout_units WHERE report_id = ?")
      .get(firstId) as { cnt: number };
    expect(childCountAfter.cnt).toBe(1);
  });

  it("a genuinely different sort_key for the same action_code gets its own id (no cross-period bleed)", async () => {
    const otherQuarter = "Q2" as const;
    const otherSortKey = `${YEAR}-${otherQuarter}`;

    const result = await tryNewsChainFallback(ACTION_CODE, YEAR, otherQuarter);
    expect(result.fallback).toBe(true);

    const db = getDb();
    const q1Row = db
      .prepare("SELECT id FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get(ACTION_CODE, SORT_KEY) as { id: string } | null;
    const q2Row = db
      .prepare("SELECT id FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get(ACTION_CODE, otherSortKey) as { id: string } | null;

    expect(q1Row).not.toBeNull();
    expect(q2Row).not.toBeNull();
    expect(q2Row!.id).toBe(result.report!.id);
    expect(q2Row!.id).not.toBe(q1Row!.id);
  });
});
