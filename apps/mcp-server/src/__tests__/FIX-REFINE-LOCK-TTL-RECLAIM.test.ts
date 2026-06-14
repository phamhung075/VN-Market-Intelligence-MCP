/**
 * FIX-REFINE-LOCK-TTL-RECLAIM — Regression tests
 *
 * Root cause: refine_bctc_md flow called task_heartbeat and task_release WITHOUT
 * owner_agent, falling to the legacy owner_session path. After any mcp-server
 * rebuild the SERVER_SESSION_ID changes → heartbeat/release return ok=false →
 * lock row is never deleted → orphaned lock blocks all future refine fires.
 *
 * Fix A: owner_agent: "refine-orchestrator" added to heartbeat + release calls
 *        in docs/agents/refine_bctc_md/flow/main.md.
 * Fix C: ttl_seconds 1000 → 1800 in the same flow's task_claim call.
 *
 * T1: expired lock IS reclaimed by next claimTask (stolen=true)
 * T2: live-heartbeating lock is NOT stolen (claimed=false)
 * T3: heartbeatTask with owner_agent survives a changed owner_session (rebuild sim)
 * T4: releaseTask with owner_agent survives a changed owner_session (rebuild sim)
 * T5: push_bctc_refined_unit double-push is idempotent (INSERT OR REPLACE — no dupe, last-write-wins)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  ensureCoordinationTable,
  claimTask,
  heartbeatTask,
  releaseTask,
  _injectCoordinationDb,
  _resetCoordinationDbState,
} from "../infrastructure/db/coordinationStore";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports";
import { buildPushBctcRefinedUnitHandler } from "../interface/mcp/tools/financial-reports/pushBctcRefinedUnitTool";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createCoordDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  ensureCoordinationTable(db);
  return db;
}

/**
 * Insert a task_locks row directly so we can set arbitrary timestamps
 * (bypasses the TTL-minimum guard in claimTask).
 */
function insertLockRow(
  db: Database,
  opts: {
    task_id: string;
    owner_session: string;
    owner_agent: string;
    expiresAtOffset: number;  // seconds relative to now (negative = already expired)
    heartbeatAtOffset?: number; // seconds relative to now (default -60)
    ttl_seconds?: number;
  },
): void {
  const ttl = opts.ttl_seconds ?? 900;
  const hbOffset = opts.heartbeatAtOffset ?? -60;
  db.prepare(`
    INSERT OR REPLACE INTO task_locks
      (task_id, task_kind, owner_session, owner_agent,
       claimed_at, expires_at, heartbeat_at, ttl_seconds)
    VALUES (?, 'sprint-task', ?, ?,
            unixepoch('now'),
            unixepoch('now') + ?,
            unixepoch('now') + ?,
            ?)
  `).run(opts.task_id, opts.owner_session, opts.owner_agent, opts.expiresAtOffset, hbOffset, ttl);
}

function getLockRow(db: Database, task_id: string): Record<string, unknown> | null {
  return db.prepare("SELECT * FROM task_locks WHERE task_id = ?").get(task_id) as Record<string, unknown> | null;
}

function countLockRows(db: Database, task_id: string): number {
  const row = db.prepare("SELECT COUNT(*) AS c FROM task_locks WHERE task_id = ?").get(task_id) as { c: number };
  return row.c;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let coordDb: Database;

beforeEach(() => {
  _resetCoordinationDbState();
  coordDb = createCoordDb();
  _injectCoordinationDb(coordDb);
});

afterEach(() => {
  _resetCoordinationDbState();
  try { coordDb.close(); } catch { /* already closed */ }
});

// ---------------------------------------------------------------------------
// T1 — Expired lock IS reclaimed by next claimTask (stolen=true)
//
// Proves the steal/no-steal logic is NOT a tautology:
// Step 2 UPDATE WHERE expires_at < unixepoch('now') fires and returns changes=1.
// ---------------------------------------------------------------------------

describe("T1: expired lock is reclaimed via stale-steal", () => {
  it("claimTask returns claimed=true AND stolen=true for an expired lock", () => {
    const TASK_ID = "bctc-refine:T1-expired";

    // Insert a lock that expired 10 seconds ago
    insertLockRow(coordDb, {
      task_id: TASK_ID,
      owner_session: "pid-old-ts-old",
      owner_agent: "refine-orchestrator",
      expiresAtOffset: -10, // expired 10s ago
    });

    const result = claimTask({
      task_id: TASK_ID,
      task_kind: "sprint-task",
      owner_session: "pid-new-ts-new",
      owner_agent: "refine-orchestrator-new",
      ttl_seconds: 1800,
    });

    // Must be claimed via steal path
    expect(result.claimed).toBe(true);
    expect((result as { stolen?: boolean }).stolen).toBe(true);

    // New owner_agent must be written
    const row = getLockRow(coordDb, TASK_ID);
    expect(row).not.toBeNull();
    expect(row!["owner_agent"]).toBe("refine-orchestrator-new");

    // expires_at must be in the future (TTL renewed)
    const now = Math.floor(Date.now() / 1000);
    expect(row!["expires_at"] as number).toBeGreaterThan(now);
  });
});

// ---------------------------------------------------------------------------
// T2 — Live-heartbeating lock is NOT stolen
//
// Proves the no-steal branch: expires_at > now → Step 2 UPDATE returns changes=0
// → Step 3 SELECT returns current_holder → claimed=false.
// ---------------------------------------------------------------------------

describe("T2: live lock is not stolen", () => {
  it("claimTask returns claimed=false for a lock that has not expired", () => {
    const TASK_ID = "bctc-refine:T2-live";

    // Insert a lock that expires 900 seconds in the future, last heartbeat 60s ago
    insertLockRow(coordDb, {
      task_id: TASK_ID,
      owner_session: "pid-worker-session",
      owner_agent: "refine-orchestrator",
      expiresAtOffset: +900,    // not yet expired
      heartbeatAtOffset: -60,    // fresh heartbeat 60s ago
    });

    const result = claimTask({
      task_id: TASK_ID,
      task_kind: "sprint-task",
      owner_session: "pid-new-ts-new",
      owner_agent: "refine-orchestrator-new",
      ttl_seconds: 1800,
    });

    // Must NOT be claimed (live lock still active)
    expect(result.claimed).toBe(false);
    expect((result as { stolen?: boolean }).stolen).toBeUndefined();

    // current_holder must be the original owner
    const holder = (result as { current_holder?: Record<string, unknown> }).current_holder;
    expect(holder).toBeDefined();
    expect(holder!["owner_agent"]).toBe("refine-orchestrator");

    // Row must still belong to original owner (no mutation)
    const row = getLockRow(coordDb, TASK_ID);
    expect(row!["owner_agent"]).toBe("refine-orchestrator");
    expect(row!["owner_session"]).toBe("pid-worker-session");
  });
});

// ---------------------------------------------------------------------------
// T3 — owner_agent heartbeat survives a changed owner_session (rebuild sim)
//
// Setup: row has old owner_session (pre-rebuild).
// Action: heartbeatTask called with same owner_agent but new session (post-rebuild).
// Assert: ok=true, expires_at renewed (agent-path match, session ignored).
// ---------------------------------------------------------------------------

describe("T3: heartbeatTask with owner_agent survives owner_session change", () => {
  it("heartbeat by owner_agent renews lock even when owner_session differs", () => {
    const TASK_ID = "bctc-refine:T3-heartbeat-rebuild";

    // Insert lock with OLD session (as it was before rebuild)
    insertLockRow(coordDb, {
      task_id: TASK_ID,
      owner_session: "pid-99-ts-old",
      owner_agent: "refine-orchestrator",
      expiresAtOffset: +900,  // still active
      ttl_seconds: 1800,
    });

    const rowBefore = getLockRow(coordDb, TASK_ID) as { expires_at: number };

    // Simulate rebuild: heartbeat now called with NEW session but same owner_agent
    const result = heartbeatTask(TASK_ID, "refine-orchestrator", "pid-1-ts-new");

    expect(result.ok).toBe(true);
    expect(result.expires_at).toBeGreaterThan(0);

    // expires_at must be renewed (>= original)
    const rowAfter = getLockRow(coordDb, TASK_ID) as { expires_at: number };
    expect(rowAfter.expires_at).toBeGreaterThanOrEqual(rowBefore.expires_at);
  });
});

// ---------------------------------------------------------------------------
// T4 — owner_agent releaseTask survives a changed owner_session (rebuild sim)
//
// Setup: row has old owner_session (pre-rebuild).
// Action: releaseTask called with same owner_agent but new session (post-rebuild).
// Assert: ok=true, row COUNT()===0 (lock deleted, no zombie).
// ---------------------------------------------------------------------------

describe("T4: releaseTask with owner_agent survives owner_session change", () => {
  it("release by owner_agent deletes lock even when owner_session differs", () => {
    const TASK_ID = "bctc-refine:T4-release-rebuild";

    // Insert lock with OLD session (pre-rebuild)
    insertLockRow(coordDb, {
      task_id: TASK_ID,
      owner_session: "pid-99-ts-old",
      owner_agent: "refine-orchestrator",
      expiresAtOffset: +900,  // still active (would be a zombie under legacy path)
    });

    // Simulate rebuild: release called with NEW session but same owner_agent
    const result = releaseTask(TASK_ID, "refine-orchestrator", "pid-1-ts-new");

    expect(result.ok).toBe(true);

    // Lock row must be deleted (COUNT = 0)
    expect(countLockRows(coordDb, TASK_ID)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T5 — push_bctc_refined_unit double-push is idempotent
//
// INSERT OR REPLACE on UNIQUE(report_id, unit_id): second push of same unit
// with different markdown → last-write-wins, no duplicate row, no constraint error.
// ---------------------------------------------------------------------------

describe("T5: push_bctc_refined_unit double-push idempotency", () => {
  let marketDb: Database;
  let pushHandler: ReturnType<typeof buildPushBctcRefinedUnitHandler>;

  beforeEach(() => {
    marketDb = new Database(":memory:");
    initFinancialReportsTables(marketDb);

    // Seed a minimal financial_reports row so FK constraints pass
    marketDb.prepare(`
      INSERT OR REPLACE INTO financial_reports
        (id, action_code, company_name, exchange, domain,
         period_year, period_quarter, period_type,
         period_start, period_end, sort_key, parsed_at, extraction_confidence,
         pdf_path, text_status, refine_status,
         balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
      VALUES (?, 'VCB', 'VCB Bank', 'HOSE', 'banking',
              2024, 'Q1', 'Q1', '2024-01-01', '2024-03-31', '2024-Q1',
              datetime('now'), 0.9,
              '/app/data/pdfs/VCB_Q1_2024.pdf',
              'COMPLETE', 'PENDING', '{}', '{}', '{}', '{}')
    `).run("T5-report-id");

    pushHandler = buildPushBctcRefinedUnitHandler(marketDb);
  });

  afterEach(() => {
    try { marketDb.close(); } catch { /* already closed */ }
  });

  it("second push of same unit_id with different markdown → last-write-wins, no dupe, no error", async () => {
    const REPORT_ID = "T5-report-id";
    const UNIT_ID = "unit-0000";

    // First push: markdown = "v1"
    const r1 = await pushHandler({
      report_id: REPORT_ID,
      unit_id: UNIT_ID,
      page_numbers: [1],
      markdown: "| Mã số | Chỉ tiêu | Số cuối kỳ |\n|---|---|---|\n| 100 | Tiền v1 | 1.000 |",
      confidence: 0.9,
      flags: [],
      window_status: "DONE",
    });
    const parsed1 = JSON.parse(r1.content[0]!.text) as { ok?: boolean; error?: string };
    expect(parsed1.error).toBeUndefined();

    // Second push: same unit_id, markdown = "v2" (simulates stale-worker re-push)
    const r2 = await pushHandler({
      report_id: REPORT_ID,
      unit_id: UNIT_ID,
      page_numbers: [1],
      markdown: "| Mã số | Chỉ tiêu | Số cuối kỳ |\n|---|---|---|\n| 100 | Tiền v2 | 2.000 |",
      confidence: 0.85,
      flags: [],
      window_status: "DONE",
    });
    const parsed2 = JSON.parse(r2.content[0]!.text) as { ok?: boolean; error?: string };
    expect(parsed2.error).toBeUndefined();

    // No constraint error — INSERT OR REPLACE must succeed silently
    const rowCount = (marketDb.prepare(
      "SELECT COUNT(*) AS c FROM bctc_refined_units WHERE report_id = ? AND unit_id = ?",
    ).get(REPORT_ID, UNIT_ID) as { c: number }).c;
    expect(rowCount).toBe(1); // no duplicate row

    // Last write wins: markdown must be "v2"
    const unitRow = marketDb.prepare(
      "SELECT markdown FROM bctc_refined_units WHERE report_id = ? AND unit_id = ?",
    ).get(REPORT_ID, UNIT_ID) as { markdown: string } | null;
    expect(unitRow).not.toBeNull();
    expect(unitRow!.markdown).toContain("Tiền v2"); // last-write-wins
    expect(unitRow!.markdown).not.toContain("Tiền v1");
  });
});
