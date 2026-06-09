/**
 * Task 1173 — TDD red phase: Calibration Label Integration
 *
 * Tests cover AC-1 through AC-9 from REQ-070:
 *
 *   AC-1: getLabelAccuracyReport groups by from_agent, excludes unreviewed (verdict IS NULL)
 *   AC-2: getLabelAccuracyReport respects since_days window (excludes rows outside window)
 *   AC-3: getLabelAccuracyReport returns [] when no reviewed rows exist
 *   AC-4: get_label_accuracy_report MCP tool returns formatted table with correct values
 *   AC-5: get_label_accuracy_report MCP tool returns empty-state Vietnamese message
 *   AC-6: calibrationReportJob WORK post includes label_accuracy block with agent lines
 *   AC-7: calibrationReportJob WORK post shows (no label data yet) when market_messages empty
 *   AC-8: CalibrationJobResult has label_accuracy field (type check + runtime)
 *   AC-9: getLabelAccuracyReport exception is isolated inside calibrationReportJob
 *
 * Test isolation: Bun.env["DB_PATH"] = ":memory:" set before any import.
 * Each describe block resets the DB via closeDb() + initDatabase() in beforeEach/afterEach.
 */

// Must be set before importing any schema module so the module-level DB_PATH is picked up.
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  insertMarketMessage,
  reviewMarketMessage,
  getLabelAccuracyReport,
  type LabelAccuracyRow as LabelAccuracyRowImported,
} from "../infrastructure/db/marketMessageStore.js";
import { handleGetLabelAccuracyReport } from "../interface/mcp/tools/macro/calibrationTools.js";
import {
  runCalibrationReport,
  type TelegramOverrides,
  type CalibrationJobResult as CalibrationJobResultBase,
} from "../scheduler/macro/calibrationReportJob.js";

// LabelAccuracyRow is now imported from marketMessageStore.js (task 1174).
// Re-export local alias so the rest of the test file keeps using the same name.
type LabelAccuracyRow = LabelAccuracyRowImported;

/**
 * Extended CalibrationJobResult — will include label_accuracy in task 1176.
 * Stub extends the base type so TSC compiles; the field will be absent at runtime
 * until task 1176 ships.
 */
type CalibrationJobResult = CalibrationJobResultBase & {
  label_accuracy?: LabelAccuracyRow[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — in-memory DB for calibrationReportJob tests (AC-6, AC-7, AC-9)
// Mirrors the makeDb() pattern from 1128-calibration-report-job.test.ts
// but also creates the market_messages table and its indices.
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");

  // prediction_claims table (required by runCalibrationReport Step 1)
  db.run(`
    CREATE TABLE IF NOT EXISTS prediction_claims (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      stock              TEXT    NOT NULL,
      agent_id           TEXT    NOT NULL,
      claim_text         TEXT    NOT NULL,
      direction          TEXT    NOT NULL,
      target_price       REAL,
      resolution_date    TEXT    NOT NULL,
      confidence         REAL    NOT NULL,
      resolution_outcome INTEGER,
      actual_price       REAL,
      brier_score        REAL,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
      resolved_at        TEXT,
      UNIQUE(stock, claim_text, resolution_date)
    )
  `);

  // calibration_snapshots table (required by runCalibrationReport Step 9)
  db.run(`
    CREATE TABLE IF NOT EXISTS calibration_snapshots (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date          TEXT NOT NULL,
      total_resolved         INTEGER NOT NULL,
      avg_brier_score        REAL,
      avg_brier_by_agent     TEXT NOT NULL,
      avg_brier_by_stock     TEXT NOT NULL,
      avg_brier_by_direction TEXT NOT NULL,
      calibration_curve      TEXT NOT NULL,
      trend_delta            REAL,
      top_predictions        TEXT NOT NULL,
      worst_predictions      TEXT NOT NULL,
      computed_at            TEXT NOT NULL
    )
  `);

  // cron_job_runs table (for recordJobRun wrapper)
  db.run(`
    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name     TEXT    NOT NULL,
      status       TEXT    NOT NULL DEFAULT 'running',
      started_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      finished_at  TEXT,
      duration_ms  INTEGER,
      rows_written INTEGER,
      error_msg    TEXT
    )
  `);

  // market_messages table (required by getLabelAccuracyReport in Step 3.5)
  db.run(`
    CREATE TABLE IF NOT EXISTS market_messages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent   TEXT    NOT NULL,
      message_type TEXT    NOT NULL,
      ticker       TEXT,
      content      TEXT    NOT NULL,
      sent_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      verdict      TEXT,
      verdict_note TEXT,
      reviewed_at  TEXT
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_mm_sent_at    ON market_messages(sent_at DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_mm_from_agent ON market_messages(from_agent)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_mm_verdict    ON market_messages(verdict)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_mm_ticker     ON market_messages(ticker)`);

  return db;
}

/** No-op Telegram overrides — prevents real HTTP calls in job tests */
const noopTelegram: TelegramOverrides = {
  sendWork: async () => true,
  sendMarket: async () => true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper — seed a reviewed message directly with a specific reviewed_at date.
// Uses parameterized SQL — no string interpolation.
// ─────────────────────────────────────────────────────────────────────────────

function seedReviewedMessage(
  db: Database,
  opts: {
    from_agent: string;
    verdict: "signal" | "noise";
    reviewed_at: string; // ISO datetime or relative date string SQLite accepts
  },
): void {
  db.run(
    `INSERT INTO market_messages
       (from_agent, message_type, content, verdict, reviewed_at)
     VALUES (?, ?, ?, ?, ?)`,
    [opts.from_agent, "alert", "test content", opts.verdict, opts.reviewed_at],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: getLabelAccuracyReport groups by from_agent, excludes unreviewed rows
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1173 — AC-1: getLabelAccuracyReport groups by from_agent", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns 2 rows for 2 agents; excludes row with verdict IS NULL", () => {
    const db = getDb();

    // ids 1, 2 from alert-commander, verdict signal
    insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "msg1" });
    insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "msg2" });
    // id 3 from alert-commander, verdict noise
    insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "msg3" });
    // id 4 from morning-briefing, verdict signal
    insertMarketMessage(db, { from_agent: "morning-briefing", message_type: "morning_briefing", content: "msg4" });
    // id 5 from alert-commander, verdict NULL (unreviewed) — must be excluded
    insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "msg5" });

    // Review rows 1–4 (row 5 intentionally left unreviewed)
    reviewMarketMessage(db, 1, "signal");
    reviewMarketMessage(db, 2, "signal");
    reviewMarketMessage(db, 3, "noise");
    reviewMarketMessage(db, 4, "signal");

    const rows = getLabelAccuracyReport(db, 90);

    // Exactly 2 groups (id 5 excluded)
    expect(rows.length).toBe(2);

    // morning-briefing should appear first (signal_rate=1.0 > 0.667)
    const mbRow = rows[0];
    expect(mbRow).toBeDefined();
    expect(mbRow!.from_agent).toBe("morning-briefing");
    expect(mbRow!.total_reviewed).toBe(1);
    expect(mbRow!.signal_count).toBe(1);
    expect(mbRow!.noise_count).toBe(0);
    expect(mbRow!.signal_rate).toBeCloseTo(1.0, 5);

    // alert-commander: 3 reviewed, 2 signal, 1 noise
    const acRow = rows[1];
    expect(acRow).toBeDefined();
    expect(acRow!.from_agent).toBe("alert-commander");
    expect(acRow!.total_reviewed).toBe(3);
    expect(acRow!.signal_count).toBe(2);
    expect(acRow!.noise_count).toBe(1);
    expect(acRow!.signal_rate).toBeCloseTo(2 / 3, 4);
  });

  it("rows are ordered by signal_rate DESC", () => {
    const db = getDb();

    // Insert one signal and one noise for alert-commander (rate = 0.5)
    insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "a1" });
    insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "a2" });
    reviewMarketMessage(db, 1, "signal");
    reviewMarketMessage(db, 2, "noise");

    // Insert one signal for morning-briefing (rate = 1.0)
    insertMarketMessage(db, { from_agent: "morning-briefing", message_type: "morning_briefing", content: "m1" });
    reviewMarketMessage(db, 3, "signal");

    const rows = getLabelAccuracyReport(db, 90);
    expect(rows.length).toBe(2);
    // morning-briefing (1.0) before alert-commander (0.5)
    expect(rows[0]!.from_agent).toBe("morning-briefing");
    expect(rows[1]!.from_agent).toBe("alert-commander");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: getLabelAccuracyReport respects since_days window
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1173 — AC-2: getLabelAccuracyReport respects since_days window", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("excludes rows reviewed 95 days ago; includes rows reviewed 5 days ago", () => {
    const db = getDb();

    // Row 10: reviewed 95 days ago — outside 90-day window
    const ninetyFiveDaysAgo = new Date();
    ninetyFiveDaysAgo.setDate(ninetyFiveDaysAgo.getDate() - 95);

    // Row 11: reviewed 5 days ago — inside window
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    db.run(
      `INSERT INTO market_messages
         (from_agent, message_type, content, verdict, reviewed_at)
       VALUES (?, ?, ?, ?, ?)`,
      ["alert-commander", "alert", "old msg", "signal", ninetyFiveDaysAgo.toISOString()],
    );

    db.run(
      `INSERT INTO market_messages
         (from_agent, message_type, content, verdict, reviewed_at)
       VALUES (?, ?, ?, ?, ?)`,
      ["alert-commander", "alert", "recent msg", "noise", fiveDaysAgo.toISOString()],
    );

    const rows = getLabelAccuracyReport(db, 90);

    // Only the recent row is included
    expect(rows.length).toBe(1);
    expect(rows[0]!.from_agent).toBe("alert-commander");
    expect(rows[0]!.total_reviewed).toBe(1);
    expect(rows[0]!.noise_count).toBe(1);
    expect(rows[0]!.signal_count).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: getLabelAccuracyReport returns [] when no reviewed rows
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1173 — AC-3: getLabelAccuracyReport returns [] when no reviewed rows", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns empty array for empty table", () => {
    const db = getDb();
    const rows = getLabelAccuracyReport(db, 90);
    expect(rows).toEqual([]);
  });

  it("returns empty array when all rows have verdict IS NULL", () => {
    const db = getDb();
    // Insert unreviewed rows only
    insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "unreviewed" });
    insertMarketMessage(db, { from_agent: "morning-briefing", message_type: "morning_briefing", content: "also unreviewed" });

    const rows = getLabelAccuracyReport(db, 90);
    expect(rows).toEqual([]);
  });

  it("uses default since_days=90 when parameter is omitted", () => {
    const db = getDb();
    const rows = getLabelAccuracyReport(db);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toEqual([]);
  });

  it("clamps since_days below 1 to 1", () => {
    const db = getDb();
    // Should not throw; clamped to 1 day
    const rows = getLabelAccuracyReport(db, 0);
    expect(Array.isArray(rows)).toBe(true);
  });

  it("clamps since_days above 365 to 365", () => {
    const db = getDb();
    // Should not throw; clamped to 365 days
    const rows = getLabelAccuracyReport(db, 400);
    expect(Array.isArray(rows)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: get_label_accuracy_report MCP tool — formatted table
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1173 — AC-4: get_label_accuracy_report MCP tool returns formatted table", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("tool output contains header with since_days value", async () => {
    const db = getDb();
    // Seed two agents with reviewed messages
    // alert-commander: 42 reviewed, 31 signal, 11 noise
    // Insert rows with exact reviewed_at dates via direct SQL (parameterized)
    // Reset and seed properly
    db.run("DELETE FROM market_messages");

    // alert-commander: 31 signal + 11 noise = 42 total
    for (let i = 0; i < 31; i++) {
      db.run(
        `INSERT INTO market_messages (from_agent, message_type, content, verdict, reviewed_at)
         VALUES (?, ?, ?, ?, datetime('now', '-1 days'))`,
        ["alert-commander", "alert", `ac-signal-${i}`, "signal"],
      );
    }
    for (let i = 0; i < 11; i++) {
      db.run(
        `INSERT INTO market_messages (from_agent, message_type, content, verdict, reviewed_at)
         VALUES (?, ?, ?, ?, datetime('now', '-1 days'))`,
        ["alert-commander", "alert", `ac-noise-${i}`, "noise"],
      );
    }

    // morning-briefing: 9 signal + 5 noise = 14 total
    for (let i = 0; i < 9; i++) {
      db.run(
        `INSERT INTO market_messages (from_agent, message_type, content, verdict, reviewed_at)
         VALUES (?, ?, ?, ?, datetime('now', '-1 days'))`,
        ["morning-briefing", "morning_briefing", `mb-signal-${i}`, "signal"],
      );
    }
    for (let i = 0; i < 5; i++) {
      db.run(
        `INSERT INTO market_messages (from_agent, message_type, content, verdict, reviewed_at)
         VALUES (?, ?, ?, ?, datetime('now', '-1 days'))`,
        ["morning-briefing", "morning_briefing", `mb-noise-${i}`, "noise"],
      );
    }

    const result = await handleGetLabelAccuracyReport(getDb(), 90);
    const text = result.content.map((c) => c.text).join("\n");

    // Header must contain the since_days value
    expect(text).toContain("Label Accuracy Report");
    expect(text).toContain("90 ngày gần nhất");

    // alert-commander row: signal_rate = 31/42 ≈ 73.8%
    expect(text).toContain("alert-commander");
    expect(text).toContain("73.8%");

    // morning-briefing row: signal_rate = 9/14 ≈ 64.3%
    expect(text).toContain("morning-briefing");
    expect(text).toContain("64.3%");

    // Footer: 2 agents, 56 total reviewed
    expect(text).toContain("2 agents");
    expect(text).toContain("56 tin đã review");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: get_label_accuracy_report MCP tool — empty state message
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1173 — AC-5: get_label_accuracy_report MCP tool empty state", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns Vietnamese empty-state message when no reviewed rows", async () => {
    const result = await handleGetLabelAccuracyReport(getDb(), 90);
    const text = result.content.map((c) => c.text).join("\n");

    expect(text).toContain("Không có tin nhắn đã review trong 90 ngày qua");
    expect(text).toContain("Hãy sử dụng batch_review_market_messages để đánh giá tin nhắn");
  });

  it("empty-state message reflects the actual since_days value passed", async () => {
    const result = await handleGetLabelAccuracyReport(getDb(), 30);
    const text = result.content.map((c) => c.text).join("\n");

    expect(text).toContain("30 ngày qua");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6: calibrationReportJob WORK post includes label_accuracy block
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1173 — AC-6: calibrationReportJob WORK post includes label_accuracy block", () => {
  it("WORK message contains label_accuracy section header and agent lines", async () => {
    const db = makeDb();

    // Seed market_messages:
    // alert-commander: 3 signal
    // morning-briefing: 1 signal + 1 noise
    for (let i = 0; i < 3; i++) {
      seedReviewedMessage(db, {
        from_agent: "alert-commander",
        verdict: "signal",
        reviewed_at: new Date().toISOString(),
      });
    }
    seedReviewedMessage(db, {
      from_agent: "morning-briefing",
      verdict: "signal",
      reviewed_at: new Date().toISOString(),
    });
    seedReviewedMessage(db, {
      from_agent: "morning-briefing",
      verdict: "noise",
      reviewed_at: new Date().toISOString(),
    });

    let capturedWork = "";
    const overrides: TelegramOverrides = {
      sendWork: async (msg: string) => { capturedWork = msg; return true; },
      sendMarket: async () => true,
    };

    await runCalibrationReport(db, overrides);

    expect(capturedWork).toContain("Label Accuracy (90 ngay, human labels):");
    // alert-commander: 3/3 signal = 100.0%
    expect(capturedWork).toContain("alert-commander: 3/3 signal (100.0%)");
    // morning-briefing: 1/2 signal = 50.0%
    expect(capturedWork).toContain("morning-briefing: 1/2 signal (50.0%)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7: calibrationReportJob WORK post shows (no label data yet) when no reviews
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1173 — AC-7: calibrationReportJob WORK post shows (no label data yet)", () => {
  it("WORK message contains (no label data yet) when market_messages is empty", async () => {
    const db = makeDb();
    // No market_messages rows at all

    let capturedWork = "";
    const overrides: TelegramOverrides = {
      sendWork: async (msg: string) => { capturedWork = msg; return true; },
      sendMarket: async () => true,
    };

    await runCalibrationReport(db, overrides);

    expect(capturedWork).toContain("Label Accuracy (90 ngay, human labels):");
    expect(capturedWork).toContain("(no label data yet)");
  });

  it("WORK message contains (no label data yet) when all market_messages have verdict NULL", async () => {
    const db = makeDb();
    // Insert unreviewed rows only
    db.run(
      `INSERT INTO market_messages (from_agent, message_type, content) VALUES (?, ?, ?)`,
      ["alert-commander", "alert", "unreviewed msg"],
    );

    let capturedWork = "";
    const overrides: TelegramOverrides = {
      sendWork: async (msg: string) => { capturedWork = msg; return true; },
      sendMarket: async () => true,
    };

    await runCalibrationReport(db, overrides);

    expect(capturedWork).toContain("(no label data yet)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8: CalibrationJobResult has label_accuracy field
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1173 — AC-8: CalibrationJobResult has label_accuracy field", () => {
  it("runCalibrationReport returns object with label_accuracy field of type array", async () => {
    const db = makeDb();
    const result: CalibrationJobResult = await runCalibrationReport(db, noopTelegram);

    // Runtime check: field exists and is an array
    expect(Object.prototype.hasOwnProperty.call(result, "label_accuracy")).toBe(true);
    expect(Array.isArray(result.label_accuracy)).toBe(true);
  });

  it("label_accuracy is empty array when no market_messages rows are reviewed", async () => {
    const db = makeDb();
    const result = await runCalibrationReport(db, noopTelegram) as CalibrationJobResult;

    expect(result.label_accuracy).toEqual([]);
  });

  it("label_accuracy contains LabelAccuracyRow entries when reviewed rows exist", async () => {
    const db = makeDb();

    seedReviewedMessage(db, {
      from_agent: "alert-commander",
      verdict: "signal",
      reviewed_at: new Date().toISOString(),
    });
    seedReviewedMessage(db, {
      from_agent: "alert-commander",
      verdict: "noise",
      reviewed_at: new Date().toISOString(),
    });

    const result = await runCalibrationReport(db, noopTelegram) as CalibrationJobResult;

    expect(result.label_accuracy!.length).toBe(1);

    const row: LabelAccuracyRow = result.label_accuracy![0]!;
    expect(row.from_agent).toBe("alert-commander");
    expect(row.total_reviewed).toBe(2);
    expect(row.signal_count).toBe(1);
    expect(row.noise_count).toBe(1);
    expect(row.signal_rate).toBeCloseTo(0.5, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-9: getLabelAccuracyReport exception is isolated inside calibrationReportJob
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1173 — AC-9: getLabelAccuracyReport exception isolated in calibrationReportJob", () => {
  it("job does not throw when db.prepare throws for verdict IS NOT NULL query", async () => {
    const realDb = makeDb();

    // Create a Proxy that intercepts db.prepare and throws when the SQL contains
    // "verdict IS NOT NULL" (the identifying clause of getLabelAccuracyReport).
    const faultyDb = new Proxy(realDb, {
      get(target, prop) {
        if (prop === "prepare") {
          return (sql: string) => {
            if (typeof sql === "string" && sql.includes("verdict IS NOT NULL")) {
              throw new Error("Simulated getLabelAccuracyReport failure");
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (target as any).prepare(sql);
          };
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (target as any)[prop];
      },
    });

    let capturedWork = "";
    const overrides: TelegramOverrides = {
      sendWork: async (msg: string) => { capturedWork = msg; return true; },
      sendMarket: async () => true,
    };

    // Must not throw
    let result: CalibrationJobResult | undefined;
    await expect(
      (async () => {
        result = await runCalibrationReport(faultyDb as unknown as Database, overrides);
      })()
    ).resolves.toBeUndefined();

    // Result must have label_accuracy = []
    expect(result).toBeDefined();
    expect(result!.label_accuracy).toEqual([]);

    // WORK message must contain the fallback line
    expect(capturedWork).toContain("(no label data yet)");
  });
});
