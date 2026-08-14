Bun.env["DB_PATH"] = ":memory:";
/**
 * FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN
 *
 * REWRITTEN per FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET (architect
 * blueprint docs/architecture-briefs/2026-08-07-fix-bctc-newschain-fallback-
 * zeros-write-target-blueprint.md §6, table rows 5-6).
 *
 * Original premise (kept below for context, no longer this test's concern):
 * `tryNewsChainFallback()` used to write into `financial_reports` and needed
 * to protect PEK child-row FKs (bctc_layout_units, bctc_page_zones — plain
 * TEXT columns, not real FKs) from an id that churned on every re-run. That
 * concern is now STRUCTURALLY MOOT: this function no longer writes to
 * financial_reports at all — it persists to the new non-authoritative
 * `bctc_news_fallback_hints` table instead, which nothing else FKs to (PEK
 * tables are populated only by the real PDF/OCR layout pipeline, which a
 * news-inference row never has — pdfPath is hardcoded null in the fallback
 * report). `ON CONFLICT(action_code, sort_key) DO UPDATE` on the new table
 * exists purely for idempotent re-run (no duplicate hint rows), not for
 * orphan-prevention.
 *
 * This suite now asserts: (1) idempotent upsert — two fallback runs for the
 * same (action_code, sort_key) produce exactly ONE bctc_news_fallback_hints
 * row, with `first_seen_at` immutable across the re-run; (2) no cross-period
 * bleed — a genuinely different sort_key gets its own independent row; (3) in
 * both cases, financial_reports never receives a row from this path at all.
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

/** Mirrors the readRow() helper pattern in FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP.test.ts. */
function readHintRow(actionCode: string, sortKey: string): { first_seen_at: string; last_seen_at: string } | null {
  return getDb()
    .query<{ first_seen_at: string; last_seen_at: string }, [string, string]>(
      "SELECT first_seen_at, last_seen_at FROM bctc_news_fallback_hints WHERE action_code = ? AND sort_key = ?",
    )
    .get(actionCode, sortKey);
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

describe("FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN — bctc_news_fallback_hints idempotent upsert (PEK-FK concern structurally moot)", () => {
  it("two fallback runs for the identical (action_code, sort_key) produce exactly ONE hints row, with first_seen_at immutable across the re-run", async () => {
    seedTwoConfirmingSignals();

    // ── Run #1 — first-ever fallback hint write for this (action_code, sort_key) ──
    const first = await tryNewsChainFallback(ACTION_CODE, YEAR, QUARTER);
    expect(first.fallback).toBe(true);
    expect(first.report).toBeDefined();

    const db = getDb();
    const row1 = readHintRow(ACTION_CODE, SORT_KEY);
    expect(row1).not.toBeNull();
    const firstSeenAt = row1!.first_seen_at;
    expect(firstSeenAt).toBeTruthy();

    // No financial_reports row was ever created by this path.
    const frCount1 = db
      .prepare("SELECT COUNT(*) AS cnt FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get(ACTION_CODE, SORT_KEY) as { cnt: number };
    expect(frCount1.cnt).toBe(0);

    // ── Run #2 — re-run of the SAME (action_code, sort_key) ──────────────────
    const second = await tryNewsChainFallback(ACTION_CODE, YEAR, QUARTER);
    expect(second.fallback).toBe(true);

    // ── Exactly ONE row for this (action_code, sort_key) — idempotent upsert,
    //    no duplicate (ON CONFLICT DO UPDATE, not a fresh INSERT). ─────────
    const countRow = db
      .prepare("SELECT COUNT(*) AS cnt FROM bctc_news_fallback_hints WHERE action_code = ? AND sort_key = ?")
      .get(ACTION_CODE, SORT_KEY) as { cnt: number };
    expect(countRow.cnt).toBe(1);

    // ── first_seen_at is immutable across the re-run (mirrors the original
    //    id-immutability intent, transposed to this table's own immutable
    //    column) — last_seen_at MAY differ, deliberately not asserted here. ──
    const row2 = readHintRow(ACTION_CODE, SORT_KEY);
    expect(row2).not.toBeNull();
    expect(row2!.first_seen_at).toBe(firstSeenAt);

    // Still no financial_reports row after the re-run either.
    const frCount2 = db
      .prepare("SELECT COUNT(*) AS cnt FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get(ACTION_CODE, SORT_KEY) as { cnt: number };
    expect(frCount2.cnt).toBe(0);
  });

  it("a genuinely different sort_key for the same action_code gets its own independent hints row (no cross-period bleed)", async () => {
    const otherQuarter = "Q2" as const;
    const otherSortKey = `${YEAR}-${otherQuarter}`;

    const result = await tryNewsChainFallback(ACTION_CODE, YEAR, otherQuarter);
    expect(result.fallback).toBe(true);

    const db = getDb();
    const q1Row = readHintRow(ACTION_CODE, SORT_KEY);
    const q2Row = readHintRow(ACTION_CODE, otherSortKey);

    expect(q1Row).not.toBeNull();
    expect(q2Row).not.toBeNull();

    // Independent rows — distinct sort_key is the identity now (no more `.id`
    // equality/inequality assertions; `id` is an unconditional fresh
    // randomUUID() per call, purely informational, no longer meaningful here).
    // Two genuinely separate rows exist for this action_code (one per
    // sort_key) — not one row silently reused/bled across periods.
    const hintsCountForAction = db
      .prepare("SELECT COUNT(*) AS cnt FROM bctc_news_fallback_hints WHERE action_code = ?")
      .get(ACTION_CODE) as { cnt: number };
    expect(hintsCountForAction.cnt).toBe(2);

    // financial_reports never receives a row for either period from this path.
    const frCount = db
      .prepare("SELECT COUNT(*) AS cnt FROM financial_reports WHERE action_code = ?")
      .get(ACTION_CODE) as { cnt: number };
    expect(frCount.cnt).toBe(0);
  });
});
