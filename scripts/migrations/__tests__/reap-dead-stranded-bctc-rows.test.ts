// scripts/migrations/__tests__/reap-dead-stranded-bctc-rows.test.ts
//
// VCB-MISSING-PDFS — unit tests for the dead-row-cleanup migration script's
// pure functions (extractFilePath / findDeadCandidates / markDead). All DB
// ops use :memory: — no live/named-volume DB touched.

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  extractFilePath,
  findDeadCandidates,
  markDead,
  DEAD_AT_ATTEMPTS,
} from "../reap-dead-stranded-bctc-rows.ts";

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

function seedRow(
  db: Database,
  opts: {
    title: string;
    ticker: string;
    filename: string;
    filePath: string;
    status?: string;
    attempts?: number;
  },
): number {
  const payload = { ticker: opts.ticker, filename: opts.filename, filePath: opts.filePath };
  const detail = `${opts.ticker}:${opts.filename} ${JSON.stringify(payload)}`;
  const result = db
    .prepare(
      `INSERT INTO agent_feedback
         (agent, category, title, detail, priority, status, created_at, reparse_attempts)
       VALUES ('data-auditor', 'other', ?, ?, 'medium', ?, datetime('now'), ?)`,
    )
    .run(opts.title, detail, opts.status ?? "new", opts.attempts ?? 0);
  return Number(result.lastInsertRowid);
}

describe("reap-dead-stranded-bctc-rows — extractFilePath", () => {
  it("parses filePath from the JSON tail of detail", () => {
    const detail = 'VCB:VCB_2025_Q4.pdf {"ticker":"VCB","filename":"VCB_2025_Q4.pdf","filePath":"/app/data/pdfs/VCB_2025_Q4.pdf"}';
    expect(extractFilePath(detail)).toBe("/app/data/pdfs/VCB_2025_Q4.pdf");
  });

  it("returns null when detail has no JSON body", () => {
    expect(extractFilePath("no json here")).toBeNull();
  });
});

describe("reap-dead-stranded-bctc-rows — findDeadCandidates", () => {
  it("selects a row past DEAD_AT_ATTEMPTS whose file is confirmed missing (VCB_2025_Q4.pdf shape)", () => {
    const db = makeDb();
    const id = seedRow(db, {
      title: "[AUDIT] stranded_bctc_pdf — financial_reports (1 rows) [VCB_2025_Q4.pdf]",
      ticker: "VCB",
      filename: "VCB_2025_Q4.pdf",
      filePath: "/app/data/pdfs/VCB_2025_Q4.pdf",
      attempts: 271,
    });

    const candidates = findDeadCandidates(db, () => false); // fileExistsFn stub: confirmed missing

    expect(candidates.length).toBe(1);
    expect(candidates[0]!.id).toBe(id);
    expect(candidates[0]!.filePath).toBe("/app/data/pdfs/VCB_2025_Q4.pdf");
  });

  it("excludes a row whose file still exists (different, still-open failure mode)", () => {
    const db = makeDb();
    seedRow(db, {
      title: "[AUDIT] stranded_bctc_pdf — financial_reports (1 rows) [NVL.pdf]",
      ticker: "NVL",
      filename: "NVL.pdf",
      filePath: "/app/data/pdfs/NVL.pdf",
      attempts: 100,
    });

    const candidates = findDeadCandidates(db, () => true); // file present

    expect(candidates.length).toBe(0);
  });

  it("excludes a row below DEAD_AT_ATTEMPTS even when the file is missing", () => {
    const db = makeDb();
    seedRow(db, {
      title: "[AUDIT] stranded_bctc_pdf — financial_reports (1 rows) [VCB_2025_Q1.pdf]",
      ticker: "VCB",
      filename: "VCB_2025_Q1.pdf",
      filePath: "/app/data/pdfs/VCB_2025_Q1.pdf",
      attempts: DEAD_AT_ATTEMPTS - 1,
    });

    const candidates = findDeadCandidates(db, () => false);

    expect(candidates.length).toBe(0);
  });

  it("excludes an already-resolved row", () => {
    const db = makeDb();
    seedRow(db, {
      title: "[AUDIT] stranded_bctc_pdf — financial_reports (1 rows) [VCB_2025_Q4.pdf]",
      ticker: "VCB",
      filename: "VCB_2025_Q4.pdf",
      filePath: "/app/data/pdfs/VCB_2025_Q4.pdf",
      status: "resolved",
      attempts: 271,
    });

    const candidates = findDeadCandidates(db, () => false);

    expect(candidates.length).toBe(0);
  });
});

describe("reap-dead-stranded-bctc-rows — markDead", () => {
  it("flips status to 'dead' for the given ids and returns the change count", () => {
    const db = makeDb();
    const id = seedRow(db, {
      title: "[AUDIT] stranded_bctc_pdf — financial_reports (1 rows) [VCB_2025_Q4.pdf]",
      ticker: "VCB",
      filename: "VCB_2025_Q4.pdf",
      filePath: "/app/data/pdfs/VCB_2025_Q4.pdf",
      attempts: 271,
    });

    const changed = markDead(db, [id]);
    expect(changed).toBe(1);

    const row = db
      .query<{ status: string }, [number]>("SELECT status FROM agent_feedback WHERE id = ?")
      .get(id);
    expect(row?.status).toBe("dead");
  });

  it("is idempotent — a second call finds nothing left to change", () => {
    const db = makeDb();
    const id = seedRow(db, {
      title: "[AUDIT] stranded_bctc_pdf — financial_reports (1 rows) [VCB_2025_Q4.pdf]",
      ticker: "VCB",
      filename: "VCB_2025_Q4.pdf",
      filePath: "/app/data/pdfs/VCB_2025_Q4.pdf",
      attempts: 271,
    });

    expect(markDead(db, [id])).toBe(1);
    expect(markDead(db, [id])).toBe(0); // already 'dead', not 'new' — WHERE status='new' guard excludes it
  });

  it("returns 0 for an empty id list without touching the DB", () => {
    const db = makeDb();
    expect(markDead(db, [])).toBe(0);
  });
});
