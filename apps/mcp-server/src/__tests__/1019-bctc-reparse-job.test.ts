/**
 * Task 1019 — BCTC Stranded-PDF Auto-Reparse Job
 *
 * Covers:
 *   - parseStrandedDetail()              — JSON payload extraction
 *   - parseYearQuarterFromFilename()     — Vietnamese BCTC filename patterns
 *   - runBctcReparseJob() happy path     — resolves feedback on success
 *   - runBctcReparseJob() failure path   — increments reparse_attempts
 *   - Escalation at 3 attempts           — priority → 'high'
 *   - Alert at 5 attempts                — WORK-channel notify fires once
 *   - CRONS.bctcReparseJob registered    — wired in jobs.ts
 *   - Dead-row termination (VCB-MISSING-PDFS) — file confirmed missing past
 *     DEAD_AT_ATTEMPTS (10) retires the row to status='dead' and stops the
 *     `WHERE status='new'` query from selecting it again
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  parseStrandedDetail,
  parseYearQuarterFromFilename,
  runBctcReparseJob,
} from "../scheduler/financial-reports/bctcReparseJob.js";

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_feedback (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      agent             TEXT NOT NULL,
      category          TEXT NOT NULL,
      title             TEXT NOT NULL,
      detail            TEXT NOT NULL DEFAULT '',
      priority          TEXT NOT NULL DEFAULT 'medium',
      status            TEXT NOT NULL DEFAULT 'new',
      created_at        TEXT NOT NULL,
      reparse_attempts  INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

function seedStranded(
  db: Database,
  ticker: string,
  filename: string,
  attempts = 0,
): number {
  const payload = {
    ticker,
    filename,
    filePath: `/tmp/${filename}`,
  };
  const detail = `${ticker}:${filename} ${JSON.stringify(payload)}`;
  const result = db
    .prepare(
      `INSERT INTO agent_feedback
         (agent, category, title, detail, priority, status, created_at, reparse_attempts)
       VALUES (?, ?, ?, ?, 'medium', 'new', datetime('now'), ?)`,
    )
    .run(
      "data-auditor",
      "other",
      `[AUDIT] stranded_bctc_pdf — financial_reports (1 rows)`,
      detail,
      attempts,
    );
  return Number(result.lastInsertRowid);
}

describe("Task 1019 — parseStrandedDetail()", () => {
  it("extracts ticker/filename/filePath from the new JSON detail format", () => {
    const detail =
      'VNM:BCTC VNM 31.12.2025.pdf {"ticker":"VNM","filename":"BCTC VNM 31.12.2025.pdf","filePath":"/tmp/foo.pdf"}';
    const parsed = parseStrandedDetail(detail);
    expect(parsed).not.toBeNull();
    expect(parsed!.ticker).toBe("VNM");
    expect(parsed!.filename).toBe("BCTC VNM 31.12.2025.pdf");
    expect(parsed!.filePath).toBe("/tmp/foo.pdf");
  });

  it("returns null when the JSON lacks required fields", () => {
    expect(parseStrandedDetail('VNM {"ticker":"VNM"}')).toBeNull();
  });

  // Report 1055 regression: legacy feedback rows created before task 1019
  // slice 1 have no JSON payload and look like
  //   "Stranded PDFs (need re-parse): VNM:BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf"
  // The reparse job must reconstruct the payload and default filePath to
  // data/pdfs/<filename> so these stuck rows can be drained on the next run.
  it("parses the legacy TICKER:filename format and defaults filePath to data/pdfs/", () => {
    const detail =
      "Stranded PDFs (need re-parse): VNM:BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf";
    const parsed = parseStrandedDetail(detail);
    expect(parsed).not.toBeNull();
    expect(parsed!.ticker).toBe("VNM");
    expect(parsed!.filename).toBe("BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf");
    expect(parsed!.filePath).toContain("data/pdfs/");
    expect(parsed!.filePath).toContain("BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf");
  });
});

describe("Task 1019 — parseYearQuarterFromFilename()", () => {
  it("parses 31.12.2025 → {2025, Q4}", () => {
    expect(parseYearQuarterFromFilename("BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf")).toEqual({
      year: 2025,
      quarter: "Q4",
    });
  });

  it("parses 30.09.2025 → {2025, Q3}", () => {
    expect(parseYearQuarterFromFilename("FPT 30.09.2025.pdf")).toEqual({
      year: 2025,
      quarter: "Q3",
    });
  });

  it("parses 30.06.2024 → {2024, Q2}", () => {
    expect(parseYearQuarterFromFilename("VCB-30.06.2024.pdf")).toEqual({
      year: 2024,
      quarter: "Q2",
    });
  });

  it("parses explicit Q3 2025 token when no date present", () => {
    expect(parseYearQuarterFromFilename("BCTC_FPT_Q3_2025.pdf")).toEqual({
      year: 2025,
      quarter: "Q3",
    });
  });

  it("returns null for unrecognised filenames", () => {
    expect(parseYearQuarterFromFilename("random-report.pdf")).toBeNull();
  });

  // Bug fix: YYYYMMDD prefix was matching partial year "0130" instead of "2025"
  // from filenames like "20260130-VCB-CBTT-&-BCTC-Hop-nhat-Q4.2025.pdf"
  it("parses YYYYMMDD-TICKER-...-Q4.2025.pdf without year confusion (bug fix)", () => {
    expect(
      parseYearQuarterFromFilename("20260130-VCB-CBTT-&-BCTC-Hop-nhat-Q4.2025.pdf"),
    ).toEqual({ year: 2025, quarter: "Q4" });
  });

  it("parses Vietnamese Quy-4-2025 pattern (FPT style)", () => {
    expect(
      parseYearQuarterFromFilename("20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf"),
    ).toEqual({ year: 2025, quarter: "Q4" });
  });

  it("parses YYYYMMDD prefix with Quy-1-nam-YYYY trailing year (VCB Q1 style)", () => {
    expect(
      parseYearQuarterFromFilename(
        "20250429-VCB-Bao-cao-tai-chinh-hop-nhat-Quy-1-nam-2025_signed.pdf",
      ),
    ).toEqual({ year: 2025, quarter: "Q1" });
  });
});

describe("Task 1019 — runBctcReparseJob() happy path", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("resolves feedback row on successful reparse", async () => {
    const id = seedStranded(db, "VNM", "BCTC VNM 31.12.2025.pdf");

    const result = await runBctcReparseJob({
      db,
      notify: async () => undefined,
      reparseFn: async () => true, // stub success
    });

    expect(result.examined).toBe(1);
    expect(result.resolved).toBe(1);
    expect(result.failed).toBe(0);

    const row = db
      .query<{ status: string; reparse_attempts: number }, [number]>(
        "SELECT status, reparse_attempts FROM agent_feedback WHERE id = ?",
      )
      .get(id);
    expect(row?.status).toBe("resolved");
    // On success we do not touch attempts (they stay at seed value 0).
    expect(row?.reparse_attempts).toBe(0);
  });

  it("ignores already-resolved rows", async () => {
    seedStranded(db, "VNM", "BCTC VNM 31.12.2025.pdf");
    db.exec("UPDATE agent_feedback SET status = 'resolved'");

    const result = await runBctcReparseJob({
      db,
      notify: async () => undefined,
      reparseFn: async () => true,
    });

    expect(result.examined).toBe(0);
  });
});

describe("Task 1019 — runBctcReparseJob() failure path", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("increments reparse_attempts without resolving on failure", async () => {
    const id = seedStranded(db, "VNM", "BCTC VNM 31.12.2025.pdf");

    const result = await runBctcReparseJob({
      db,
      notify: async () => undefined,
      reparseFn: async () => false,
    });

    expect(result.resolved).toBe(0);
    expect(result.failed).toBe(1);

    const row = db
      .query<{ status: string; reparse_attempts: number; priority: string }, [number]>(
        "SELECT status, reparse_attempts, priority FROM agent_feedback WHERE id = ?",
      )
      .get(id);
    expect(row?.status).toBe("new");
    expect(row?.reparse_attempts).toBe(1);
    expect(row?.priority).toBe("medium");
  });

  it("escalates to high priority at the 3rd attempt", async () => {
    const id = seedStranded(db, "VNM", "BCTC VNM 31.12.2025.pdf", 2);

    const result = await runBctcReparseJob({
      db,
      notify: async () => undefined,
      reparseFn: async () => false,
    });

    expect(result.escalated).toBe(1);

    const row = db
      .query<{ priority: string; reparse_attempts: number }, [number]>(
        "SELECT priority, reparse_attempts FROM agent_feedback WHERE id = ?",
      )
      .get(id);
    expect(row?.priority).toBe("high");
    expect(row?.reparse_attempts).toBe(3);
  });

  it("fires a WORK-channel alert at the 5th attempt (one-shot)", async () => {
    const id = seedStranded(db, "VNM", "BCTC VNM 31.12.2025.pdf", 4);

    const sent: string[] = [];
    const result = await runBctcReparseJob({
      db,
      notify: async (msg: string) => {
        sent.push(msg);
        return true;
      },
      reparseFn: async () => false,
    });

    expect(result.alerted).toBe(1);
    expect(sent.length).toBe(1);
    expect(sent[0]).toContain("bctc-reparse");
    expect(sent[0]).toContain("VNM");

    // Running again must not fire a second alert (attempts = 6, past the boundary)
    sent.length = 0;
    await runBctcReparseJob({
      db,
      notify: async (msg: string) => {
        sent.push(msg);
        return true;
      },
      reparseFn: async () => false,
    });
    expect(sent.length).toBe(0);

    const row = db
      .query<{ reparse_attempts: number }, [number]>(
        "SELECT reparse_attempts FROM agent_feedback WHERE id = ?",
      )
      .get(id);
    expect(row?.reparse_attempts).toBe(6);
  });
});

describe("VCB-MISSING-PDFS — dead-row termination", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("retires a row to status='dead' once attempts reach DEAD_AT_ATTEMPTS(10) AND the file is confirmed missing", async () => {
    // Seed at 9 prior attempts so this run's failure lands exactly on the
    // 10th attempt (matches the VCB_2025_Q4.pdf production row shape).
    const id = seedStranded(db, "VCB", "VCB_2025_Q4.pdf", 9);

    const result = await runBctcReparseJob({
      db,
      notify: async () => undefined,
      reparseFn: async () => false, // stub: reparse still fails (file gone)
      fileExistsFn: () => false,    // confirmed missing from disk
    });

    expect(result.deadMarked).toBe(1);
    expect(result.failed).toBe(0);

    const row = db
      .query<{ status: string; reparse_attempts: number }, [number]>(
        "SELECT status, reparse_attempts FROM agent_feedback WHERE id = ?",
      )
      .get(id);
    expect(row?.status).toBe("dead");
    expect(row?.reparse_attempts).toBe(10);
  });

  it("does NOT retire a row before DEAD_AT_ATTEMPTS even when the file is missing (escalate/alert budget preserved)", async () => {
    const id = seedStranded(db, "VCB", "VCB_2025_Q4.pdf", 8); // → nextAttempts = 9, below threshold

    const result = await runBctcReparseJob({
      db,
      notify: async () => undefined,
      reparseFn: async () => false,
      fileExistsFn: () => false,
    });

    expect(result.deadMarked).toBe(0);
    expect(result.failed).toBe(1);

    const row = db
      .query<{ status: string; reparse_attempts: number }, [number]>(
        "SELECT status, reparse_attempts FROM agent_feedback WHERE id = ?",
      )
      .get(id);
    expect(row?.status).toBe("new");
    expect(row?.reparse_attempts).toBe(9);
  });

  it("does NOT retire a row past DEAD_AT_ATTEMPTS when the file still exists (a different, still-open failure mode)", async () => {
    const id = seedStranded(db, "NVL", "NVL.pdf", 9);

    const result = await runBctcReparseJob({
      db,
      notify: async () => undefined,
      reparseFn: async () => false,
      fileExistsFn: () => true, // file present — extraction is failing for some other reason
    });

    expect(result.deadMarked).toBe(0);
    expect(result.failed).toBe(1);

    const row = db
      .query<{ status: string }, [number]>(
        "SELECT status FROM agent_feedback WHERE id = ?",
      )
      .get(id);
    expect(row?.status).toBe("new");
  });

  it("a dead row is never re-selected by a subsequent run (examined stays 0)", async () => {
    seedStranded(db, "VCB", "VCB_2025_Q4.pdf", 9);

    await runBctcReparseJob({
      db,
      notify: async () => undefined,
      reparseFn: async () => false,
      fileExistsFn: () => false,
    });

    const result2 = await runBctcReparseJob({
      db,
      notify: async () => undefined,
      reparseFn: async () => {
        throw new Error("must not be called for a dead row");
      },
      fileExistsFn: () => false,
    });

    expect(result2.examined).toBe(0);
  });
});

describe("Task 1019 — CRONS.bctcReparseJob wiring", () => {
  it("is registered in jobs.ts with a daily schedule", async () => {
    const { CRONS } = await import("../scheduler/jobs.js");
    const expr = (CRONS as Record<string, string | undefined>)["bctcReparseJob"] ?? "";
    expect(typeof expr).toBe("string");
    expect(expr.length).toBeGreaterThan(0);
    // default "30 9 * * *" — not every-minute
    expect(expr).not.toMatch(/^\*/);
  });
});
