Bun.env["DB_PATH"] = ":memory:";

/**
 * FACTORY-INFRA-agentSignal-sql-binding
 *
 * agentSignalStore READ paths previously built SQL via string interpolation
 * for caller-supplied values (getSignals' signalType/hoursBack filters,
 * getSignals' mark-as-read UPDATE...IN(...) clause, getSignalEffectiveness'
 * fromAgent/signalType/days filters). Values containing a single quote broke
 * or were injection-shaped (manual `.replace(/'/g, "''")` escaping instead of
 * bound placeholders). Converted to bound `?` placeholders (generated
 * placeholder count for the IN-list, matching coordinationStore.ts /
 * seedWatchlist.ts precedent).
 *
 * This file proves:
 *   1. A value containing a single quote (`O'Brien` style) round-trips
 *      correctly through the filters that now bind it.
 *   2. A classic injection payload (`' OR '1'='1`, `'; DROP TABLE ...; --`)
 *      passed as a filter value is treated as an opaque literal — it neither
 *      bypasses the filter (returns all rows) nor damages the table.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  postSignal,
  getSignals,
  recordOutcome,
  getSignalEffectiveness,
} from "../infrastructure/db/agentSignalStore.js";

/** Minimal agent_signals schema — base + outcome columns (mirrors 244-signal-outcome.test.ts). */
function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      stock_code TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      outcome TEXT,
      outcome_at TEXT,
      outcome_detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_signals_to ON agent_signals(to_agent, status);
    CREATE INDEX IF NOT EXISTS idx_agent_signals_expires ON agent_signals(expires_at);
  `);
  return db;
}

describe("FACTORY-INFRA-agentSignal-sql-binding — getSignals signalType filter", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("filters correctly on a signal_type value containing a single quote (special-char round-trip)", () => {
    // signal_type is a free TEXT column at the store layer (Zod enum enforcement lives
    // one layer up in agentSignalTools) — a caller can legitimately post/query a
    // non-enum value. "o'clock_alert" exercises the apostrophe path directly.
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "o'clock_alert",
      payload: { title: "quote test" },
      ttlMinutes: 60,
    });
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      payload: { title: "control row" },
      ttlMinutes: 60,
    });

    const filtered = getSignals(db, "alert-commander", {
      status: "all",
      signalType: "o'clock_alert",
    });

    expect(filtered.length).toBe(1);
    // signalType is typed SignalType (enum) on the return shape, but the store layer
    // is a free TEXT column at runtime (see comment above) — cast for the assertion.
    expect(filtered[0]!.signalType as string).toBe("o'clock_alert");
  });

  it("does not let an injection-shaped signal_type value bypass the filter", () => {
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      payload: { title: "row 1" },
      ttlMinutes: 60,
    });
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "price_anomaly",
      payload: { title: "row 2" },
      ttlMinutes: 60,
    });

    // A vulnerable string-interpolated implementation would render:
    //   AND s.signal_type = '' OR '1'='1'
    // which matches every row. A bound placeholder treats the whole string as
    // a literal value to compare — no row has this signal_type, so 0 rows.
    let result: ReturnType<typeof getSignals> = [];
    expect(() => {
      result = getSignals(db, "alert-commander", {
        status: "all",
        signalType: "' OR '1'='1",
      });
    }).not.toThrow();
    expect(result.length).toBe(0);
  });

  it("a DROP TABLE payload as signal_type does not damage the table (literal, not executed)", () => {
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      payload: { title: "survives" },
      ttlMinutes: 60,
    });

    expect(() => {
      getSignals(db, "alert-commander", {
        status: "all",
        signalType: "x'; DROP TABLE agent_signals; --",
      });
    }).not.toThrow();

    // Table must still exist and still contain the original row.
    const survivor = getSignals(db, "alert-commander", { status: "all" });
    expect(survivor.length).toBe(1);
    expect(survivor[0]!.signalType).toBe("urgent_news");
  });

  it("mark-as-read UPDATE...IN(...) still flips status for the exact fetched rows (bound id list)", () => {
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      payload: { title: "a" },
      ttlMinutes: 60,
    });
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      payload: { title: "b" },
      ttlMinutes: 60,
    });

    // Default status filter is "unread" — this both returns the rows AND
    // flips them to 'read' via the bound-placeholder IN(...) clause.
    const first = getSignals(db, "alert-commander");
    expect(first.length).toBe(2);

    // A second unread-only fetch must return nothing — proves the UPDATE
    // actually applied to both rows, not just the first placeholder.
    const second = getSignals(db, "alert-commander");
    expect(second.length).toBe(0);

    const all = getSignals(db, "alert-commander", { status: "all" });
    expect(all.every((s) => s.status === "read")).toBe(true);
  });
});

describe("FACTORY-INFRA-agentSignal-sql-binding — getSignalEffectiveness filters", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  function post(fromAgent: string, signalType: string): number {
    return postSignal(db, {
      fromAgent,
      toAgent: "alert-commander",
      signalType,
      payload: { title: "eff test" },
      ttlMinutes: 60,
    });
  }

  it("filters correctly on a fromAgent value containing a single quote", () => {
    const id1 = post("O'Brien-bot", "price_anomaly");
    const id2 = post("market-watcher", "price_anomaly");

    recordOutcome(db, id1, "confirmed");
    recordOutcome(db, id2, "confirmed");

    const results = getSignalEffectiveness(db, { fromAgent: "O'Brien-bot", days: 30 });

    expect(results.length).toBe(1);
    expect(results[0]!.fromAgent).toBe("O'Brien-bot");
    expect(results[0]!.total).toBe(1);
  });

  it("filters correctly on a signalType value containing a single quote", () => {
    const id1 = post("market-watcher", "o'clock_alert");
    const id2 = post("market-watcher", "urgent_news");

    recordOutcome(db, id1, "confirmed");
    recordOutcome(db, id2, "confirmed");

    const results = getSignalEffectiveness(db, { signalType: "o'clock_alert", days: 30 });

    expect(results.length).toBe(1);
    expect(results[0]!.signalType).toBe("o'clock_alert");
  });

  it("does not let an injection-shaped fromAgent value bypass the filter", () => {
    const id1 = post("market-watcher", "price_anomaly");
    const id2 = post("news-scout", "urgent_news");
    recordOutcome(db, id1, "confirmed");
    recordOutcome(db, id2, "confirmed");

    // A vulnerable implementation renders: from_agent = '' OR '1'='1' → matches all
    // rows and returns 2 groups. A bound placeholder compares literally → 0 groups.
    let results: ReturnType<typeof getSignalEffectiveness> = [];
    expect(() => {
      results = getSignalEffectiveness(db, { fromAgent: "' OR '1'='1", days: 30 });
    }).not.toThrow();
    expect(results.length).toBe(0);
  });

  it("a DROP TABLE payload as fromAgent does not damage the table (literal, not executed)", () => {
    const id1 = post("market-watcher", "price_anomaly");
    recordOutcome(db, id1, "confirmed");

    expect(() => {
      getSignalEffectiveness(db, { fromAgent: "x'; DROP TABLE agent_signals; --", days: 30 });
    }).not.toThrow();

    // Table must still exist and the original row's effectiveness still computable.
    const survivor = getSignalEffectiveness(db, { days: 30 });
    expect(survivor.length).toBe(1);
    expect(survivor[0]!.fromAgent).toBe("market-watcher");
  });

  /**
   * Live differential proof for the `days` field specifically.
   *
   * Unlike fromAgent/signalType (which the pre-fix code manually escaped via
   * `.replace(/'/g, "''")` before interpolating — safe, if non-idiomatic),
   * `days` was interpolated into the SQL text with ZERO escaping:
   *   `created_at >= datetime('now', '-${days} days')`
   * `days` is only a `number` at the TypeScript type level (GetEffectivenessOptions.days),
   * not runtime-validated inside this function — an untyped/any-cast caller (e.g. a
   * boundary that skips Zod) can still reach this code path with an arbitrary string.
   *
   * Empirically verified (scratchpad probe, both pre-fix and post-fix code paths) that
   * feeding this exact payload as `days`:
   *   - PRE-FIX:  broke the SQL text at the embedded `;`/`--`, silently returning a
   *               malformed single row of nulls (total=0, fromAgent=null) instead of
   *               the real 1-row confirmed result — a real, observable injection
   *               footprint (the WHERE clause was corrupted), even though bun:sqlite's
   *               single-statement `prepare()` boundary happened to stop the stacked
   *               `DROP TABLE` from actually executing.
   *   - POST-FIX: `days` is bound as an opaque parameter (`datetime('now', ? || ' days')`),
   *               so the whole payload is just inert string content — SQLite can't parse
   *               a valid datetime modifier from it, the comparison is simply false, and
   *               the query returns a clean empty array. No corruption, no throw.
   */
  it("a stacked-statement payload in the numeric days field cannot corrupt the query (bound, not interpolated)", () => {
    const id1 = post("market-watcher", "price_anomaly");
    recordOutcome(db, id1, "confirmed");

    const maliciousDays = "1'); DROP TABLE agent_signals;--" as unknown as number;

    let results: ReturnType<typeof getSignalEffectiveness> = [];
    expect(() => {
      results = getSignalEffectiveness(db, { days: maliciousDays });
    }).not.toThrow();

    // Post-fix: bound parameter → SQLite can't parse a valid datetime modifier from the
    // literal payload string → comparison is false → clean empty result (not a malformed
    // single row of nulls, which is what the pre-fix interpolated code produced).
    expect(results).toEqual([]);

    // Table intact and a normal query still returns the real row.
    const survivor = getSignalEffectiveness(db, { days: 30 });
    expect(survivor.length).toBe(1);
    expect(survivor[0]!.fromAgent).toBe("market-watcher");
    expect(survivor[0]!.total).toBe(1);
  });
});
