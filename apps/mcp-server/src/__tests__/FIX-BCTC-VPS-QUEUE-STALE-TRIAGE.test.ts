/**
 * FIX-BCTC-VPS-QUEUE-STALE-TRIAGE (2026-06-08)
 *
 * Tests:
 *   AC-1: queryBctcCounts returns deferred_infra count (historical non-drainable rows)
 *   AC-2: queryBctcCounts returns blocked_pdf_extractor count (Q1-2026 gated rows)
 *   AC-3: deferred_infra rows are NOT included in pending count (C-16 auditor gate)
 *   AC-4: blocked_pdf_extractor rows are NOT included in pending count
 *   AC-5: handleFetchStatus response includes deferred_infra and blocked_pdf_extractor fields
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleFetchStatus } from "../interface/mcp/routes/fetchStatusHandler.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_vps_queue (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code      TEXT NOT NULL,
      period_year      INTEGER NOT NULL,
      period_quarter   TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'pending',
      source_url       TEXT,
      attempts         INTEGER NOT NULL DEFAULT 0,
      last_attempt     TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      source_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      data_env TEXT
);
    CREATE TABLE vps_service_health (
      service        TEXT NOT NULL,
      last_push_at   TEXT,
      pushes_24h     INTEGER DEFAULT 0,
      errors_24h     INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS vps_push_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      service     TEXT NOT NULL,
      pushed_at   TEXT NOT NULL,
      items_count INTEGER DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'ok',
      error_msg   TEXT,
      duration_ms INTEGER DEFAULT 0
    );
  `);
  return db;
}

function insertQueueRow(
  db: Database,
  actionCode: string,
  periodYear: number,
  periodQuarter: string,
  status: string,
  attempts = 0,
): void {
  db.run(
    `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
     VALUES (?, ?, ?, ?, ?)`,
    [actionCode, periodYear, periodQuarter, status, attempts],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-VPS-QUEUE-STALE-TRIAGE — queryBctcCounts new statuses", () => {
  it("AC-1: deferred_infra rows appear in deferred_infra count", () => {
    const db = makeDb();
    insertQueueRow(db, "ACB", 2024, "Q1", "deferred_infra");
    insertQueueRow(db, "BID", 2024, "Q2", "deferred_infra");
    insertQueueRow(db, "CTG", 2023, "Q4", "deferred_infra");

    // Use the handler's response shape to verify via handleFetchStatus
    let capturedBody: string | null = null;
    const mockReq = {} as IncomingMessage;
    const mockRes = {
      writeHead: () => {},
      end: (body: string) => { capturedBody = body; },
    } as unknown as ServerResponse;

    handleFetchStatus(mockReq, mockRes, db, new Date("2026-06-08T10:00:00Z"));

    const result = JSON.parse(capturedBody!) as { bctcPipeline: { deferred_infra: number; blocked_pdf_extractor: number; pending: number } };
    expect(result.bctcPipeline.deferred_infra).toBe(3);
    db.close();
  });

  it("AC-2: blocked_pdf_extractor rows appear in blocked_pdf_extractor count", () => {
    const db = makeDb();
    insertQueueRow(db, "VNM", 2026, "Q1", "blocked_pdf_extractor", 420);
    insertQueueRow(db, "SAB", 2026, "Q1", "blocked_pdf_extractor", 0);

    let capturedBody: string | null = null;
    const mockReq = {} as IncomingMessage;
    const mockRes = {
      writeHead: () => {},
      end: (body: string) => { capturedBody = body; },
    } as unknown as ServerResponse;

    handleFetchStatus(mockReq, mockRes, db, new Date("2026-06-08T10:00:00Z"));

    const result = JSON.parse(capturedBody!) as { bctcPipeline: { blocked_pdf_extractor: number } };
    expect(result.bctcPipeline.blocked_pdf_extractor).toBe(2);
    db.close();
  });

  it("AC-3: deferred_infra rows NOT counted in pending (C-16 gate)", () => {
    const db = makeDb();
    insertQueueRow(db, "ACB", 2024, "Q1", "deferred_infra");
    insertQueueRow(db, "VNM", 2026, "Q1", "pending", 420); // still genuinely pending

    let capturedBody: string | null = null;
    const mockReq = {} as IncomingMessage;
    const mockRes = {
      writeHead: () => {},
      end: (body: string) => { capturedBody = body; },
    } as unknown as ServerResponse;

    handleFetchStatus(mockReq, mockRes, db, new Date("2026-06-08T10:00:00Z"));

    const result = JSON.parse(capturedBody!) as { bctcPipeline: { pending: number; deferred_infra: number } };
    // Only VNM counts as pending; ACB is deferred_infra
    expect(result.bctcPipeline.pending).toBe(1);
    expect(result.bctcPipeline.deferred_infra).toBe(1);
    db.close();
  });

  it("AC-4: blocked_pdf_extractor rows NOT counted in pending", () => {
    const db = makeDb();
    insertQueueRow(db, "VNM", 2026, "Q1", "blocked_pdf_extractor", 420);
    insertQueueRow(db, "SAB", 2026, "Q1", "pending", 0); // genuinely pending

    let capturedBody: string | null = null;
    const mockReq = {} as IncomingMessage;
    const mockRes = {
      writeHead: () => {},
      end: (body: string) => { capturedBody = body; },
    } as unknown as ServerResponse;

    handleFetchStatus(mockReq, mockRes, db, new Date("2026-06-08T10:00:00Z"));

    const result = JSON.parse(capturedBody!) as { bctcPipeline: { pending: number; blocked_pdf_extractor: number } };
    expect(result.bctcPipeline.pending).toBe(1);
    expect(result.bctcPipeline.blocked_pdf_extractor).toBe(1);
    db.close();
  });

  it("AC-5: handleFetchStatus response includes both new status fields", () => {
    const db = makeDb();
    insertQueueRow(db, "ACB", 2024, "Q1", "deferred_infra");
    insertQueueRow(db, "VNM", 2026, "Q1", "blocked_pdf_extractor", 420);
    insertQueueRow(db, "SAB", 2026, "Q1", "done", 1);

    let capturedBody: string | null = null;
    const mockReq = {} as IncomingMessage;
    const mockRes = {
      writeHead: () => {},
      end: (body: string) => { capturedBody = body; },
    } as unknown as ServerResponse;

    handleFetchStatus(mockReq, mockRes, db, new Date("2026-06-08T10:00:00Z"));

    const result = JSON.parse(capturedBody!) as {
      bctcPipeline: {
        pending: number;
        done: number;
        failed: number;
        deferred_infra: number;
        blocked_pdf_extractor: number;
      };
    };

    // All five fields present
    expect(typeof result.bctcPipeline.pending).toBe("number");
    expect(typeof result.bctcPipeline.done).toBe("number");
    expect(typeof result.bctcPipeline.failed).toBe("number");
    expect(typeof result.bctcPipeline.deferred_infra).toBe("number");
    expect(typeof result.bctcPipeline.blocked_pdf_extractor).toBe("number");

    // Correct values
    expect(result.bctcPipeline.pending).toBe(0);
    expect(result.bctcPipeline.done).toBe(1);
    expect(result.bctcPipeline.deferred_infra).toBe(1);
    expect(result.bctcPipeline.blocked_pdf_extractor).toBe(1);
    db.close();
  });
});
