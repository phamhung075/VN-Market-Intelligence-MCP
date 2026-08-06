/**
 * FIX-AUDITOR-C08-UNSATISFIABLE-TTL-WINDOW-AND-ISO8601-STRCMP
 *
 * system-auditor's C-08 check (docs/agents/system-auditor/flow/main.md) was a
 * broken detector, not a real defect signal — two independent faults:
 *
 * (A) UNSATISFIABLE THRESHOLD: `agent_signals` correlation stubs co-written
 *     by alertStore.ts's storeAlerts()/storeAlertsFromCommander() carry a
 *     FIXED 2h TTL (`datetime(alert.createdAt, '+2 hours')`, alertStore.ts:223)
 *     and are hard-purged by cleanExpired() — invoked from exactly ONE call
 *     site (dataAuditJob.ts:274, the once-daily off-hours `dataAuditJob:daily`
 *     cron). A 24h alerts window made `expected=0` mathematically unsatisfiable:
 *     any alert older than the 2h TTL necessarily has an expired stub, and
 *     once the daily GC sweep has run since, a physically-purged row.
 * (B) ISO8601 STRCMP BYPASS: `alerts.triggered_at` is a raw JS
 *     `.toISOString()` string ("...T...Z"), which sorts LEXICOGRAPHICALLY
 *     GREATER than SQLite's own `datetime('now', ...)` space-separated render
 *     at the very first differing byte ('T'=0x54 vs ' '=0x20) — an unwrapped
 *     `col > datetime('now', ...)` predicate over-captures every row sharing
 *     the bound's date-part, regardless of its actual time-of-day. Already
 *     fixed once in the code-plane twin (checkStaleAlerts.ts:19-30,
 *     feedback_sqlite_iso8601_datetime_strcompare_bypass) but never
 *     propagated to this flow-doc SQL (feedback_fix_landed_in_the_pregate_not
 *     _the_probe_the_agent_actually_runs).
 *
 * Fix (docs/agents/system-auditor/flow/main.md C-08 row): rebind the alerts
 * window to 2h (the SAME literal as the correlation-stub TTL — satisfiable by
 * construction, AC-1) and wrap BOTH sides in datetime() (AC-2).
 *
 * This suite is DOC-DRIVEN (AC-4): it reads the LIVE C-08 SQL directly out of
 * the flow doc's table row (not a hardcoded copy) so a future silent revert
 * of either fix is caught by the SAME mechanism that let the original bug
 * ship — the remedy landing somewhere OTHER than the SQL the agent actually
 * runs.
 *
 * All timestamp arithmetic below is anchored to a FIXED reference clock
 * (FIXED_NOW) substituted for the doc SQL's `datetime('now', ...)` calls —
 * deterministic, no wall-clock/day-boundary flakiness.
 *
 * AC (acceptance criteria — this file covers AC-4):
 *   T1 (source contract): extracted C-08 SQL wraps `a.triggered_at` in
 *      datetime() and binds the window to '-2 hours' (not '-24 hours'),
 *      and contains no bare (unwrapped) `a.triggered_at > datetime` form.
 *   T2 (satisfiability, AC-4 first assertion): an alerts row older than the
 *      correlation-stub TTL with its stub already purged (no agent_signals
 *      row at all) is NOT flagged — outside the rebound 2h window.
 *   T3 (strcmp-bypass exclusion, AC-4 second assertion): a row whose
 *      date-part matches the bound's date-part but which is genuinely
 *      OUTSIDE the 2h window (~5 min past the boundary) is EXCLUDED by the
 *      fixed (wrapped) query — and, for contrast, DEMONSTRATED to be
 *      wrongly INCLUDED by the original unwrapped predicate, proving T3
 *      fails loudly if the wrap is ever reverted.
 *   T4 (detection preserved — real positive): a row WITHIN the 2h window
 *      with no matching agent_signals row IS flagged (writer-guard failure
 *      still caught).
 *   T5 (detection preserved — real negative): a row WITHIN the 2h window
 *      WITH a matching agent_signals row is NOT flagged (no false positive
 *      on a healthy co-write).
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Doc-driven SQL extraction ─────────────────────────────────────────────

const FLOW_DOC_PATH = join(
  import.meta.dir,
  "../../../../docs/agents/system-auditor/flow/main.md",
);

function extractC08Sql(): string {
  const doc = readFileSync(FLOW_DOC_PATH, "utf-8");
  const row = doc.match(/\|\s*C-08\s*\|\s*market\.db\s*\|\s*`([^`]+)`/);
  if (!row || !row[1]) {
    throw new Error(
      "C-08 table row not found in docs/agents/system-auditor/flow/main.md — " +
        "flow doc structure changed, update this test's extraction regex",
    );
  }
  return row[1];
}

// Deterministic reference clock substituted for the doc SQL's `datetime('now', ...)`
// calls — removes ALL wall-clock/day-boundary dependency from the assertions below.
const FIXED_NOW = "2026-06-15 12:00:00";

function withFixedClock(sql: string): string {
  return sql.replace(/'now'/g, `'${FIXED_NOW}'`);
}

// ── Minimal fixture DB (only the columns C-08's query touches) ─────────────

function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE alerts (
      id           TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL
    );
    CREATE TABLE agent_signals (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_id TEXT
    );
  `);
  return db;
}

function runQuery(db: Database, sql: string): number {
  const row = db.query<{ [k: string]: number }, []>(sql).get() as
    | Record<string, number>
    | null;
  if (!row) return 0;
  return Object.values(row)[0] ?? 0;
}

/** The ORIGINAL, buggy predicate (pre-fix) — hardcoded here ONLY as a negative
 * control to prove the strcmp bug reproduces under it (T3 contrast). NOT read
 * from the doc; the doc no longer contains this form. */
const UNWRAPPED_C08_SQL =
  "SELECT count(*) FROM alerts a LEFT JOIN agent_signals s ON a.id = s.alert_id " +
  "WHERE s.id IS NULL AND a.triggered_at > datetime('now','-2 hours')";

describe("FIX-AUDITOR-C08-UNSATISFIABLE-TTL-WINDOW-AND-ISO8601-STRCMP", () => {
  const rawSql = extractC08Sql();

  it("T1: source contract — C-08 SQL wraps triggered_at in datetime(), binds window to -2 hours, no bare unwrapped comparison", () => {
    expect(rawSql).toContain("datetime(a.triggered_at)");
    expect(rawSql).toContain("-2 hours");
    expect(rawSql).not.toContain("-24 hours");
    // Guard against reintroducing the bare (unwrapped) form.
    expect(rawSql).not.toMatch(/a\.triggered_at\s*>\s*datetime/);
  });

  it("T2: satisfiability — alert older than the correlation-stub TTL with stub already purged is NOT flagged", () => {
    const db = makeTestDb();
    // 7h before FIXED_NOW — well outside the rebound 2h window; no agent_signals
    // row at all (simulates the stub having expired AND been swept by cleanExpired()).
    db.query("INSERT INTO alerts (id, triggered_at) VALUES (?, ?)").run(
      "alert-old-purged",
      "2026-06-15T05:00:00.000Z",
    );

    const sql = withFixedClock(rawSql);
    expect(runQuery(db, sql)).toBe(0);
  });

  it("T3: strcmp-bypass exclusion — date-part-matching row genuinely outside the 2h window is EXCLUDED by the fix (and would be WRONGLY INCLUDED by the original unwrapped predicate)", () => {
    const db = makeTestDb();
    // Bound = FIXED_NOW - 2h = "2026-06-15 10:00:00". This row is 5 minutes
    // BEFORE the bound (2h05m before FIXED_NOW) — genuinely outside the
    // window — but shares the bound's date-part ("2026-06-15") and is
    // T-format, which is exactly the strcmp-bypass trigger condition.
    db.query("INSERT INTO alerts (id, triggered_at) VALUES (?, ?)").run(
      "alert-strcmp-bypass",
      "2026-06-15T09:55:00.000Z",
    );

    const fixedSql = withFixedClock(rawSql);
    expect(runQuery(db, fixedSql)).toBe(0);

    // Contrast: the ORIGINAL unwrapped predicate wrongly includes this row
    // (proves the regression would fail loudly if the datetime() wrap were
    // ever reverted).
    const unwrappedSql = withFixedClock(UNWRAPPED_C08_SQL);
    expect(runQuery(db, unwrappedSql)).toBe(1);
  });

  it("T4: detection preserved — row WITHIN the 2h window with no matching agent_signals row IS flagged", () => {
    const db = makeTestDb();
    // 30 min before FIXED_NOW — well within the rebound 2h window.
    db.query("INSERT INTO alerts (id, triggered_at) VALUES (?, ?)").run(
      "alert-recent-orphan",
      "2026-06-15T11:30:00.000Z",
    );

    const sql = withFixedClock(rawSql);
    expect(runQuery(db, sql)).toBe(1);
  });

  it("T5: detection preserved — row WITHIN the 2h window WITH a matching agent_signals row is NOT flagged", () => {
    const db = makeTestDb();
    db.query("INSERT INTO alerts (id, triggered_at) VALUES (?, ?)").run(
      "alert-recent-linked",
      "2026-06-15T11:45:00.000Z",
    );
    db.query("INSERT INTO agent_signals (alert_id) VALUES (?)").run(
      "alert-recent-linked",
    );

    const sql = withFixedClock(rawSql);
    expect(runQuery(db, sql)).toBe(0);
  });
});
