/**
 * FIX-SIGNAL-OUTCOMES-RESOLUTION-STALLED.test.ts
 *
 * Regression coverage for the signal_outcomes resolution stall root causes:
 *
 *  1. fetchPriceFromStockService parsed the Go /price/history response as a flat
 *     `{date,close}[]` array — the real response is the envelope `{code, history}`
 *     (same defect class as task 1945a in verdictResolutionJob.ts) — Option B was
 *     dead code in production, and the hardcoded `days=3` window couldn't reach
 *     historical dates.
 *  2. Baseline price capture (`price_at_signal`) had no Option B fallback at all —
 *     market_prices_history is an intraday cache with a rolling ~24h purge, so by
 *     the time the resolution scan first looks at a row (created_at already >=
 *     windowHours old), Option A's window has typically already rolled off.
 *  3. getAccuracyStats used an INNER JOIN against agent_signals, silently dropping
 *     any signal_outcomes row whose parent had been TTL-pruned from sample_count.
 *  4. cleanExpired() threw "FOREIGN KEY constraint failed" (and, being a single
 *     bulk DELETE, rolled back and pruned ZERO rows) whenever any currently-
 *     expired agent_signals row was still referenced by a signal_outcomes child —
 *     silently swallowed by dataAuditJob.ts's catch, jamming the TTL prune.
 *  5. No liveness guard existed to detect a resolver that runs "successfully"
 *     every hour while making zero progress.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import {
  resolveSignalOutcomes,
  getAccuracyStats,
} from "../infrastructure/db/signalOutcomeStore.js";
import { cleanExpired } from "../infrastructure/db/agentSignalStore.js";
import {
  checkStalledResolutionLiveness,
  resetStalledResolverAlertGate,
} from "../scheduler/alerts/signalOutcomeResolutionJob.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  initNewsTables(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      price REAL NOT NULL,
      fetched_at TEXT NOT NULL
    )
  `);
  return db;
}

function insertSignal(
  db: Database,
  opts: { stockCode?: string; createdAt?: string; confidenceScore?: number } = {},
): number {
  const now = opts.createdAt ?? "2026-06-01 10:00:00";
  const result = db
    .prepare(
      `INSERT INTO agent_signals
         (from_agent, to_agent, signal_type, stock_code, payload, status, expires_at,
          created_at, confidence_score, retry_count)
       VALUES (?, ?, 'chain_catalyst', ?, '{}', 'unread', datetime(?, '+2 hours'), ?, ?, 0)`,
    )
    .run(
      "news-scout",
      "alert-commander",
      opts.stockCode ?? "VNM",
      now,
      now,
      opts.confidenceScore ?? 70,
    );
  return Number(result.lastInsertRowid);
}

function insertPendingOutcome(
  db: Database,
  opts: { signalId: number; stockCode: string; direction: string; createdAt: string },
): number {
  const result = db
    .prepare(
      `INSERT INTO signal_outcomes
         (signal_id, stock_code, signal_type, from_agent, predicted_direction, created_at)
       VALUES (?, ?, 'chain_catalyst', 'news-scout', ?, ?)`,
    )
    .run(opts.signalId, opts.stockCode, opts.direction, opts.createdAt);
  return Number(result.lastInsertRowid);
}

beforeEach(() => {
  resetStalledResolverAlertGate();
});

// ── Baseline Option-B fallback (root cause #2) ─────────────────────────────────

describe("resolveSignalOutcomes — baseline Option-B fallback", () => {
  it("captures price_at_signal via injected fetchHistoryFn when market_prices_history has zero rows near created_at", async () => {
    const db = makeDb();
    // Simulates the rolling-24h purge: market_prices_history is completely empty
    // (as if the intraday cache never had — or already rolled off — data for this
    // signal's creation time, which is the normal state for any row older than a day).
    const signalId = insertSignal(db, { stockCode: "PLX", createdAt: "2026-05-10 05:00:00" });
    insertPendingOutcome(db, {
      signalId,
      stockCode: "PLX",
      direction: "BULLISH",
      createdAt: "2026-05-10 05:00:00",
    });

    const calls: Array<{ code: string; targetDate: string }> = [];
    const fetchHistoryFn = async (code: string, targetDate: string) => {
      calls.push({ code, targetDate });
      if (targetDate === "2026-05-10") return 100_000; // baseline
      if (targetDate === "2026-05-11") return 103_000; // T+24h, +3%
      return null;
    };

    const result = await resolveSignalOutcomes(db, 24, { fetchHistoryFn });

    expect(result.resolved).toBe(1);
    expect(calls.length).toBeGreaterThan(0);

    type Row = { price_at_signal: number | null; outcome_24h: string };
    const row = db
      .prepare<Row, [number]>(
        "SELECT price_at_signal, outcome_24h FROM signal_outcomes WHERE signal_id = ?",
      )
      .get(signalId);
    expect(row?.price_at_signal).toBe(100_000);
    expect(row?.outcome_24h).toBe("correct");
  });

  it("without Option-B fallback the row would stay pending forever (documents the pre-fix behaviour)", async () => {
    const db = makeDb();
    const signalId = insertSignal(db, { stockCode: "PLX", createdAt: "2026-05-10 05:00:00" });
    insertPendingOutcome(db, {
      signalId,
      stockCode: "PLX",
      direction: "BULLISH",
      createdAt: "2026-05-10 05:00:00",
    });

    // Injected fetcher that always misses — simulates the fully-broken pre-fix state
    // (Option A empty + Option B dead) to prove the row is correctly left 'pending'
    // (not force-resolved) rather than fabricating an outcome from missing data.
    const result = await resolveSignalOutcomes(db, 24, { fetchHistoryFn: async () => null });

    expect(result.resolved).toBe(0);
    expect(result.skipped).toBe(1);

    type Row = { outcome_24h: string };
    const row = db
      .prepare<Row, [number]>("SELECT outcome_24h FROM signal_outcomes WHERE signal_id = ?")
      .get(signalId);
    expect(row?.outcome_24h).toBe("pending");
  });
});

// ── Envelope-shape + dynamic-days fix (root cause #1), exercised via the REAL
// default fetchPriceFromStockService path (no injected deps) with a mocked
// global fetch returning the actual Go {code,history} envelope shape ────────────

describe("resolveSignalOutcomes — production Option-B path (real envelope, mocked fetch)", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("resolves an old pending row end-to-end via the {code,history} envelope (not a flat array)", async () => {
    const db = makeDb();
    const createdAt = "2026-05-18 05:21:24";
    const signalId = insertSignal(db, { stockCode: "PLX", createdAt });
    insertPendingOutcome(db, { signalId, stockCode: "PLX", direction: "BULLISH", createdAt });

    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = String(input);
      expect(url).toContain("/price/history");
      // Real Go service shape verified live: { code, history: DailyOHLCV[] } — a flat
      // array here would have made the old parser's Array.isArray() check false.
      const body = {
        code: "PLX",
        history: [
          { date: "2026-05-18", open: 30000, high: 30500, low: 29800, close: 30000, volume: 100 },
          { date: "2026-05-19", open: 30100, high: 30900, low: 30000, close: 30900, volume: 120 },
        ],
      };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;

    const result24 = await resolveSignalOutcomes(db, 24);
    expect(result24.resolved).toBe(1);

    type Row = { outcome_24h: string; price_at_signal: number | null };
    const row = db
      .prepare<Row, [number]>(
        "SELECT outcome_24h, price_at_signal FROM signal_outcomes WHERE signal_id = ?",
      )
      .get(signalId);
    expect(row?.price_at_signal).toBe(30000);
    // (30900-30000)/30000 = +3% → BULLISH correct
    expect(row?.outcome_24h).toBe("correct");
  });
});

// ── getAccuracyStats — LEFT JOIN preserves orphaned rows (root cause #3) ────────

describe("getAccuracyStats — orphaned signal_id (missing parent agent_signals row)", () => {
  it("an orphaned resolved row still contributes to sample_count/accuracy_rate", () => {
    const db = makeDb();

    // 2 normal resolved rows with a live parent
    for (let i = 0; i < 2; i++) {
      const sid = insertSignal(db, { stockCode: "VCB", confidenceScore: 70 });
      db.prepare(
        `INSERT INTO signal_outcomes
           (signal_id, stock_code, signal_type, from_agent, predicted_direction,
            outcome_24h, checked_at, created_at)
         VALUES (?, 'VCB', 'chain_catalyst', 'news-scout', 'BULLISH', 'correct', datetime('now'), datetime('now','-1 day'))`,
      ).run(sid);
    }

    // 1 orphaned row: signal_id references a parent that no longer exists (TTL-pruned)
    const orphanSignalId = 999_999;
    db.prepare(
      `INSERT INTO signal_outcomes
         (signal_id, stock_code, signal_type, from_agent, predicted_direction,
          outcome_24h, checked_at, created_at)
       VALUES (?, 'VCB', 'chain_catalyst', 'news-scout', 'BULLISH', 'correct', datetime('now'), datetime('now','-1 day'))`,
    ).run(orphanSignalId);

    // Pre-fix (INNER JOIN) this orphaned row would be silently dropped, giving
    // sample_count=2 (below the HAVING >=3 floor) and an empty result set.
    const stats = getAccuracyStats(db, { stockCode: "VCB" });
    expect(stats).toHaveLength(1);
    expect(stats[0]?.sample_count).toBe(3);
    expect(stats[0]?.accuracy_rate).toBeCloseTo(1.0, 4);
  });
});

// ── cleanExpired — FK-safe TTL prune (root cause #4 / folded_scope_orphan_fk) ──

describe("cleanExpired — does not strand or block on signal_outcomes children", () => {
  it("skips (does not delete, does not throw) an expired parent still referenced by signal_outcomes", () => {
    const db = makeDb();
    db.exec("PRAGMA foreign_keys = ON");

    const referencedSignalId = insertSignal(db, {
      stockCode: "VCB",
      createdAt: "2026-05-01 00:00:00",
    });
    // expire it immediately
    db.prepare("UPDATE agent_signals SET expires_at = datetime('now','-1 hour') WHERE id = ?").run(
      referencedSignalId,
    );
    insertPendingOutcome(db, {
      signalId: referencedSignalId,
      stockCode: "VCB",
      direction: "BULLISH",
      createdAt: "2026-05-01 00:00:00",
    });

    const unreferencedSignalId = insertSignal(db, {
      stockCode: "FPT",
      createdAt: "2026-05-01 00:00:00",
    });
    db.prepare("UPDATE agent_signals SET expires_at = datetime('now','-1 hour') WHERE id = ?").run(
      unreferencedSignalId,
    );

    let removed = -1;
    expect(() => {
      removed = cleanExpired(db);
    }).not.toThrow();
    expect(removed).toBe(1); // only the unreferenced row is prunable

    const stillThere = db
      .query<{ cnt: number }, [number]>("SELECT COUNT(*) AS cnt FROM agent_signals WHERE id = ?")
      .get(referencedSignalId);
    expect(stillThere?.cnt).toBe(1); // referenced row survives — never orphaned, never FK-violates

    const gone = db
      .query<{ cnt: number }, [number]>("SELECT COUNT(*) AS cnt FROM agent_signals WHERE id = ?")
      .get(unreferencedSignalId);
    expect(gone?.cnt).toBe(0); // unreferenced expired row is pruned as before
  });

  it("keeps the parent retained while ANY signal_outcomes child exists — resolved status does not free it (SQLite FK enforcement has no notion of 'resolved')", () => {
    const db = makeDb();
    db.exec("PRAGMA foreign_keys = ON");

    const signalId = insertSignal(db, { stockCode: "VCB", createdAt: "2026-05-01 00:00:00" });
    db.prepare("UPDATE agent_signals SET expires_at = datetime('now','-1 hour') WHERE id = ?").run(
      signalId,
    );
    insertPendingOutcome(db, {
      signalId,
      stockCode: "VCB",
      direction: "BULLISH",
      createdAt: "2026-05-01 00:00:00",
    });

    // Still pending — parent must survive.
    expect(cleanExpired(db)).toBe(0);

    // Resolve both windows WITHOUT deleting the signal_outcomes row. SQLite's FK
    // enforcement blocks the parent DELETE for as long as ANY child row exists,
    // regardless of that child's outcome_24h/48h value — there is no ON DELETE CASCADE
    // and signal_id is NOT NULL, so a resolved child blocks deletion exactly like a
    // pending one. The parent is retained; this is a bounded, intentional trade-off
    // (see cleanExpired()'s doc comment), never a thrown FK error.
    db.prepare(
      `UPDATE signal_outcomes SET outcome_24h = 'correct', outcome_48h = 'correct', checked_at = datetime('now') WHERE signal_id = ?`,
    ).run(signalId);
    expect(cleanExpired(db)).toBe(0);

    // Only once the child row itself is gone (e.g. a future retention policy on
    // signal_outcomes, out of this task's scope) does the parent become prunable.
    db.prepare("DELETE FROM signal_outcomes WHERE signal_id = ?").run(signalId);
    expect(cleanExpired(db)).toBe(1);

    const gone = db
      .query<{ cnt: number }, [number]>("SELECT COUNT(*) AS cnt FROM agent_signals WHERE id = ?")
      .get(signalId);
    expect(gone?.cnt).toBe(0);
  });

  it("falls back gracefully when signal_outcomes table is absent (no FK dependency)", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE agent_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_agent TEXT NOT NULL,
        to_agent TEXT NOT NULL,
        signal_type TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'unread',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      )
    `);
    db.exec(
      `INSERT INTO agent_signals (from_agent, to_agent, signal_type, expires_at)
       VALUES ('a', 'b', 'urgent_news', datetime('now', '-10 minutes'))`,
    );

    const removed = cleanExpired(db);
    expect(removed).toBe(1);
  });
});

// ── checkStalledResolutionLiveness (item 3 — self-alert guard) ────────────────

describe("checkStalledResolutionLiveness", () => {
  it("sends exactly one BUG alert per UTC day when rows are stuck >72h unresolved", async () => {
    const db = makeDb();
    const sid = insertSignal(db, { stockCode: "VCB", createdAt: "2026-05-01 00:00:00" });
    insertPendingOutcome(db, {
      signalId: sid,
      stockCode: "VCB",
      direction: "BULLISH",
      createdAt: "2026-05-01 00:00:00", // >>72h in the past, checked_at still NULL
    });

    const alerts: string[] = [];
    const sendBugFn = async (msg: string) => {
      alerts.push(msg);
      return 1;
    };
    const fixedNow = () => new Date("2026-05-10T00:00:00Z");

    const count1 = await checkStalledResolutionLiveness(db, sendBugFn, fixedNow);
    expect(count1).toBe(1);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("1 signal_outcomes row(s)");

    // Second call same UTC day — deduped, no second alert
    const count2 = await checkStalledResolutionLiveness(db, sendBugFn, fixedNow);
    expect(count2).toBe(1);
    expect(alerts).toHaveLength(1);
  });

  it("sends nothing when there are zero stuck rows", async () => {
    const db = makeDb();
    const alerts: string[] = [];
    const count = await checkStalledResolutionLiveness(
      db,
      async (msg: string) => {
        alerts.push(msg);
        return 1;
      },
      () => new Date("2026-05-10T00:00:00Z"),
    );
    expect(count).toBe(0);
    expect(alerts).toHaveLength(0);
  });
});

// ── checkStalledResolutionLiveness — non-ticker pseudo-code exclusion ─────────
// (FIX-SIGNAL-OUTCOMES-LIVENESS-GUARD-COUNTS-STRUCTURALLY-UNRESOLVABLE-ROWS)
//
// MACRO/MULTI are system-level pseudo `stock_code` values (macro-wide and
// cross-stock signals, see alertStore.ts's `actionCode === "MACRO"` sentinel
// convention) — not real VN tickers, so no price series can ever exist for
// them and `checked_at` can never advance. Live prod shape reproduced here:
// id 49 stock_code=MACRO created 2026-06-06, id 74 stock_code=MULTI created
// 2026-06-25, both permanently checked_at=NULL. Counting them as "stuck"
// fires a false daily BUG alert forever even though the resolver is healthy.

describe("checkStalledResolutionLiveness — non-ticker pseudo-code exclusion", () => {
  it("returns 0 and sends no alert when only MACRO/MULTI rows are stuck >72h (matches the 2 live prod rows)", async () => {
    const db = makeDb();
    const macroSid = insertSignal(db, { stockCode: "MACRO", createdAt: "2026-06-06 00:00:00" });
    insertPendingOutcome(db, {
      signalId: macroSid,
      stockCode: "MACRO",
      direction: "BULLISH",
      createdAt: "2026-06-06 00:00:00",
    });
    const multiSid = insertSignal(db, { stockCode: "MULTI", createdAt: "2026-06-25 00:00:00" });
    insertPendingOutcome(db, {
      signalId: multiSid,
      stockCode: "MULTI",
      direction: "BULLISH",
      createdAt: "2026-06-25 00:00:00",
    });

    const alerts: string[] = [];
    const count = await checkStalledResolutionLiveness(
      db,
      async (msg: string) => {
        alerts.push(msg);
        return 1;
      },
      () => new Date("2026-07-30T00:00:00Z"),
    );

    expect(count).toBe(0);
    expect(alerts).toHaveLength(0);
  });

  it("still counts a real ticker stuck >72h even when MACRO/MULTI noise rows are also stuck — guard not blinded (positive control)", async () => {
    const db = makeDb();
    // Noise: structurally-unresolvable pseudo-code rows, same shape as live id 49/74.
    const macroSid = insertSignal(db, { stockCode: "MACRO", createdAt: "2026-06-06 00:00:00" });
    insertPendingOutcome(db, {
      signalId: macroSid,
      stockCode: "MACRO",
      direction: "BULLISH",
      createdAt: "2026-06-06 00:00:00",
    });
    const multiSid = insertSignal(db, { stockCode: "MULTI", createdAt: "2026-06-25 00:00:00" });
    insertPendingOutcome(db, {
      signalId: multiSid,
      stockCode: "MULTI",
      direction: "BULLISH",
      createdAt: "2026-06-25 00:00:00",
    });

    // Signal: a real ticker genuinely stuck >72h — must still trip the alert.
    const realSid = insertSignal(db, { stockCode: "VNM", createdAt: "2026-07-01 00:00:00" });
    insertPendingOutcome(db, {
      signalId: realSid,
      stockCode: "VNM",
      direction: "BULLISH",
      createdAt: "2026-07-01 00:00:00",
    });

    const alerts: string[] = [];
    const count = await checkStalledResolutionLiveness(
      db,
      async (msg: string) => {
        alerts.push(msg);
        return 1;
      },
      () => new Date("2026-07-30T00:00:00Z"),
    );

    expect(count).toBe(1); // only the real VNM row counted — MACRO/MULTI excluded
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("1 signal_outcomes row(s)");
  });
});
