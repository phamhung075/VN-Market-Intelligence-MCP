Bun.env["DB_PATH"] = ":memory:";

/**
 * FIX-FOREIGN-FLOW-MISSING-TRADING-DAY-2026-08-06-NO-BACKFILL
 *
 * Covers:
 *   AC-3: findForeignFlowGapDays finds a VN trading day (per the canonical
 *         holiday-aware calendar) with 0 daily_foreign_flow rows.
 *   AC-3b: a weekend day is never flagged as a gap (canonical calendar, not
 *         a naive weekday check) even when inside the lookback window.
 *   AC-3c: "today" (VN calendar) is never flagged — a same-day partial
 *         session must not be treated as a gap.
 *   AC-3d: multiple simultaneous gap days are all found together (bounded
 *         by MAX_GAP_DAYS_PER_RUN), not just the first/last.
 *   AC-4: an empty/missing daily_foreign_flow table returns no gaps
 *         (first-run honesty guard — never invents a lower bound).
 *   AC-5: checkForeignFlowGap ESCALATES (action="flagged", severity=
 *         "critical") every gap day found — there is no reconstruction path
 *         for this table (unlike conviction_history's daily_ohlcv-derived
 *         backfill), so escalation is the only possible action; confirms
 *         zero rows are ever fabricated for the gap date.
 *   AC-5b: idempotent dedup — a second run against an UNCHANGED gap set does
 *         not file a duplicate agent_feedback row (insertFeedbackIfNew's
 *         title+status='new' guard, reused as-is — no new dedup logic).
 *   AC-6: dataAuditJob.runDailyAudit composes the new check.
 */

import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { checkForeignFlowGap, findForeignFlowGapDays } from "../scheduler/news-analysis/audit-checks/checkForeignFlowGap.js";
import { runDailyAudit } from "../scheduler/news-analysis/dataAuditJob.js";
import { getTodayVnDate } from "../domain/services/vnTradingCalendar.js";

function wipeTables(db: Database) {
  for (const t of ["daily_foreign_flow", "agent_feedback"]) {
    try {
      db.exec(`DELETE FROM ${t}`);
    } catch {
      /* table may not exist yet on first call */
    }
  }
}

function seedForeignFlowRow(db: Database, code: string, date: string) {
  db.exec(
    `INSERT OR REPLACE INTO daily_foreign_flow (code, date, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol, updated_at)
     VALUES ('${code}', '${date}', 1000, 800, 200, 0, datetime('now'))`,
  );
}

beforeAll(async () => {
  (Bun.env as Record<string, string>)["DB_PATH"] = ":memory:";
  closeDb();
  await initDatabase();
});

beforeEach(() => {
  wipeTables(getDb());
});

// ─────────────────────────────────────────────────────────────────────────────
// 2026-08-06 (Thu) / 2026-08-05 (Wed) / 2026-08-04 (Tue) / 2026-08-03 (Mon)
// are REAL confirmed VN trading days (live-verified against the named-volume
// DB during this exact incident). 2026-08-01/08-02 (Sat/Sun) are the real
// weekend. 2026-08-10 (Mon) is a real trading day used as a SECOND,
// independent gap in the multi-gap test.
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-FOREIGN-FLOW-MISSING-TRADING-DAY-2026-08-06-NO-BACKFILL — findForeignFlowGapDays", () => {
  const GAP_DATE = "2026-08-06";
  const PRIOR_TRADING_DATE = "2026-08-04";
  const VN_TODAY = "2026-08-08"; // Sat, fixed "now" strictly after the incident window

  it("AC-3: finds a zero-row VN trading day as a gap", () => {
    const db = getDb();
    seedForeignFlowRow(db, "FPT", PRIOR_TRADING_DATE);
    seedForeignFlowRow(db, "FPT", "2026-08-07"); // resumed — present, not a gap

    const gaps = findForeignFlowGapDays(db, VN_TODAY);
    expect(gaps).toContain(GAP_DATE);
  });

  it("AC-3b: never flags a weekend day even inside the lookback window", () => {
    const db = getDb();
    seedForeignFlowRow(db, "FPT", PRIOR_TRADING_DATE);
    seedForeignFlowRow(db, "FPT", "2026-08-07");

    const gaps = findForeignFlowGapDays(db, VN_TODAY);
    expect(gaps).not.toContain("2026-08-01"); // Saturday
    expect(gaps).not.toContain("2026-08-02"); // Sunday
  });

  it("AC-3c: never flags 'today' (VN calendar) even with zero rows", () => {
    const db = getDb();
    const today = getTodayVnDate();
    const seedDate = today === PRIOR_TRADING_DATE ? "2026-08-03" : PRIOR_TRADING_DATE;
    seedForeignFlowRow(db, "FPT", seedDate);

    const gaps = findForeignFlowGapDays(db, today);
    expect(gaps).not.toContain(today);
  });

  it("AC-3d: finds multiple simultaneous gap days together", () => {
    const db = getDb();
    seedForeignFlowRow(db, "FPT", PRIOR_TRADING_DATE); // 2026-08-04
    seedForeignFlowRow(db, "FPT", "2026-08-05");
    seedForeignFlowRow(db, "FPT", "2026-08-07");
    seedForeignFlowRow(db, "FPT", "2026-08-11"); // resumed after the 2nd gap

    // 2026-08-06 (first gap) AND 2026-08-10 (a second, later, independent gap)
    // are both zero-row and both must be found in ONE call.
    const gaps = findForeignFlowGapDays(db, "2026-08-12");
    expect(gaps).toEqual(["2026-08-06", "2026-08-10"]);
  });

  it("AC-4: an empty/missing daily_foreign_flow table returns no gaps (first-run honesty guard)", () => {
    const db = getDb();
    // wipeTables already emptied it — MIN(date) is NULL
    const gaps = findForeignFlowGapDays(db, VN_TODAY);
    expect(gaps).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-FOREIGN-FLOW-MISSING-TRADING-DAY-2026-08-06-NO-BACKFILL — checkForeignFlowGap", () => {
  function seedRealIncidentFixture(db: Database) {
    seedForeignFlowRow(db, "FPT", "2026-08-03");
    seedForeignFlowRow(db, "FPT", "2026-08-04");
    // 2026-08-05 present (real: session truncated at 04:29Z but NOT zero-row)
    seedForeignFlowRow(db, "FPT", "2026-08-05");
    // 2026-08-06 (Thu) — ZERO rows for ANY code, the real incident gap
    seedForeignFlowRow(db, "FPT", "2026-08-07"); // resumed
  }

  it("AC-5: escalates (flagged/critical) with no reconstruction — rowsAffected counts gap DAYS", () => {
    const db = getDb();
    seedRealIncidentFixture(db);

    const findings = checkForeignFlowGap(db);
    expect(findings.length).toBe(1);
    expect(findings[0]!.check).toBe("foreign_flow_day_completeness");
    expect(findings[0]!.action).toBe("flagged");
    expect(findings[0]!.severity).toBe("critical");
    expect(findings[0]!.rowsAffected).toBe(1); // exactly one gap day: 2026-08-06
    expect(findings[0]!.detail).toContain("2026-08-06");
    expect(findings[0]!.detail).toContain("UNRECOVERABLE");

    // Confirms NOTHING was fabricated into daily_foreign_flow for the gap date.
    const rows = db
      .query<{ n: number }, [string]>("SELECT COUNT(*) as n FROM daily_foreign_flow WHERE date = ?")
      .get("2026-08-06");
    expect(rows!.n).toBe(0);

    const fb = db
      .query<{ cnt: number }, []>(
        "SELECT COUNT(*) as cnt FROM agent_feedback WHERE title LIKE '%foreign_flow_day_completeness%'",
      )
      .get();
    expect(fb!.cnt).toBe(1);
  });

  it("AC-5b: idempotent — a second run against an UNCHANGED gap set does not re-file feedback", () => {
    const db = getDb();
    seedRealIncidentFixture(db);
    checkForeignFlowGap(db); // first run files the finding

    const before = db.query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM agent_feedback").get()!.cnt;
    checkForeignFlowGap(db); // second run — same gap set, same title -> deduped
    const after = db.query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM agent_feedback").get()!.cnt;

    expect(after).toBe(before);
  });

  it("AC-5c: a clean run (no gaps) reports action='none', severity='info'", () => {
    const db = getDb();
    seedForeignFlowRow(db, "FPT", "2026-08-04");
    seedForeignFlowRow(db, "FPT", "2026-08-05");
    seedForeignFlowRow(db, "FPT", "2026-08-06");
    seedForeignFlowRow(db, "FPT", "2026-08-07");

    const findings = checkForeignFlowGap(db);
    expect(findings.length).toBe(1);
    expect(findings[0]!.action).toBe("none");
    expect(findings[0]!.severity).toBe("info");
  });

  it("AC-6: dataAuditJob.runDailyAudit composes the new check", async () => {
    const db = getDb();
    seedRealIncidentFixture(db);

    const findings = await runDailyAudit(db, async () => {});
    const mine = findings.filter((f) => f.check === "foreign_flow_day_completeness");
    expect(mine.length).toBe(1);
  });
});
