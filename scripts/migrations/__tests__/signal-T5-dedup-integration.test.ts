// scripts/migrations/__tests__/signal-T5-dedup-integration.test.ts
//
// Integration tests — full SQLite signal dedup drain cycle.
// Tests the logic specified in .claude/flows/dev-team/main.md Step 0a.
//
// Placement decision: scripts/migrations/__tests__/ matches T1 + T2 convention
// (not apps/mcp-server/src/__tests__/) because these tests import from
// scripts/migrations/ helpers and are signal-infrastructure, not MCP server.
// No bunfig.toml preload needed — no DB_PATH env dependency.
//
// All DBs and filesystems are isolated per test (temp paths). No production
// docs/signals/ or docs/signals/signals.db is read or written.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
  unlinkSync,
} from "fs";
import { join, basename } from "path";
import { tmpdir } from "os";
import { createHash } from "crypto";

import { computeFingerprint } from "../backfill-signals-db.ts";
import { SIGNALS_DDL } from "../create-signals-db.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SignalFile {
  from: string;
  to: string;
  type: string;
  priority: string;
  payload: unknown;
  createdAt: string;
  [key: string]: unknown;
}

interface ProcessedSignalFile extends SignalFile {
  fingerprint: string;
  processedAt: string;
  processedBy: string;
  result: string;
}

interface DrainResult {
  pendingSignals: SignalFile[];
  processed: Array<{
    filename: string;
    result: "routed-to-po" | "skipped-duplicate-replay" | "skipped-stale" | "skipped-duplicate";
  }>;
  warnLogged: boolean;
  dbUnavailable: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Open an in-memory DB with the full signals_processed schema. */
function makeSignalsDb(path: string = ":memory:"): Database {
  const db = new Database(path);
  for (const stmt of SIGNALS_DDL) {
    db.exec(stmt);
  }
  return db;
}

/** Write a signal JSON to inbox dir. Returns the file path. */
function writeInboxSignal(
  inboxDir: string,
  filename: string,
  signal: SignalFile
): string {
  const path = join(inboxDir, filename);
  writeFileSync(path, JSON.stringify(signal, null, 2));
  return path;
}

/** Build a valid signal fixture. Override any field via the overrides param. */
function makeSignal(overrides: Partial<SignalFile> = {}): SignalFile {
  return {
    from: "agents-architect",
    to: "po",
    type: "architecture-handoff",
    priority: "high",
    payload: { brief: "docs/architecture-briefs/test-2026-05-12.md" },
    createdAt: "2026-05-12T10:00:00Z",
    ...overrides,
  };
}

/**
 * Core drain logic extracted from .claude/flows/dev-team/main.md Step 0a.
 *
 * Accepts a pre-opened DB (or null to simulate DB-unavailable).
 * Returns drain results for assertion.
 *
 * Implements:
 * - Step 0a-1: glob + fingerprint SELECT
 * - Step 4a: filesystem move to processed/ (with metadata appended)
 * - Step 4b: DB INSERT
 * - Step 5a: DB prune (DELETE WHERE processed_at < -7 days)
 * - Step 5b: filesystem prune (delete processed files older than 7 days)
 * - Stale skip: createdAt older than 24h → skipped-stale
 */
function runDrainCycle(
  inboxDir: string,
  processedDir: string,
  db: Database | null
): DrainResult {
  const result: DrainResult = {
    pendingSignals: [],
    processed: [],
    warnLogged: false,
    dbUnavailable: db === null,
  };

  // DB-unavailable degraded path (Step 0a-fallback)
  if (db === null) {
    result.warnLogged = true;
    // Do NOT move files; leave inbox intact for retry
    return result;
  }

  // Step 0a-1: glob inbox *.json files
  const files = readdirSync(inboxDir)
    .filter((f) => f.endsWith(".json"))
    .sort(); // sort for determinism

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const selectStmt = db.prepare(
    "SELECT 1 FROM signals_processed WHERE fingerprint = ? LIMIT 1"
  );

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO signals_processed
      (fingerprint, from_agent, to_agent, type, priority, payload,
       created_at, processed_at, processed_by, result, source_filename)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 'dev-team', ?, ?)
  `);

  for (const filename of files) {
    const filePath = join(inboxDir, filename);
    let sig: SignalFile;

    try {
      sig = JSON.parse(readFileSync(filePath, "utf-8")) as SignalFile;
    } catch {
      continue; // skip unreadable files
    }

    // Stale check (AC-T5.6): createdAt older than 24h → skipped-stale
    const createdAt = new Date(sig.createdAt);
    if (!isNaN(createdAt.getTime()) && createdAt < twentyFourHoursAgo) {
      const staleSuffix = filename.replace(/\.json$/, "-stale.json");
      const processedPath = join(processedDir, staleSuffix);
      const enriched: ProcessedSignalFile = {
        ...(sig as SignalFile),
        fingerprint: computeFingerprint(
          sig.from ?? "",
          sig.type ?? "",
          sig.payload,
          sig.createdAt ?? ""
        ),
        processedAt: now.toISOString(),
        processedBy: "dev-team",
        result: "skipped-stale",
      };
      writeFileSync(processedPath, JSON.stringify(enriched, null, 2));
      unlinkSync(filePath);
      result.processed.push({ filename, result: "skipped-stale" });
      continue;
    }

    // Fingerprint check (Step 3b)
    const fingerprint = computeFingerprint(
      sig.from ?? "",
      sig.type ?? "",
      sig.payload,
      sig.createdAt ?? ""
    );

    const match = selectStmt.get(fingerprint);

    if (match !== null) {
      // Duplicate replay: move with -replay suffix
      const replaySuffix = filename.replace(/\.json$/, "-replay.json");
      const processedPath = join(processedDir, replaySuffix);
      const enriched: ProcessedSignalFile = {
        ...(sig as SignalFile),
        fingerprint,
        processedAt: now.toISOString(),
        processedBy: "dev-team",
        result: "skipped-duplicate-replay",
      };
      writeFileSync(processedPath, JSON.stringify(enriched, null, 2));
      unlinkSync(filePath);
      result.processed.push({ filename, result: "skipped-duplicate-replay" });
      continue;
    }

    // New signal — dual-record write (Steps 4a + 4b)
    // 4a: filesystem move
    const processedPath = join(processedDir, filename);
    const enriched: ProcessedSignalFile = {
      ...(sig as SignalFile),
      fingerprint,
      processedAt: now.toISOString(),
      processedBy: "dev-team",
      result: "routed-to-po",
    };
    writeFileSync(processedPath, JSON.stringify(enriched, null, 2));
    unlinkSync(filePath);

    // 4b: DB INSERT
    try {
      insertStmt.run(
        fingerprint,
        sig.from ?? "",
        sig.to ?? null,
        sig.type ?? null,
        sig.priority ?? null,
        sig.payload !== undefined ? JSON.stringify(sig.payload) : null,
        sig.createdAt ?? new Date().toISOString(),
        "routed-to-po",
        basename(filename)
      );
    } catch (err) {
      // Non-fatal: file move is canonical; DB insert failure is logged but does not block
      // (In real implementation: log to notebook stream)
    }

    result.pendingSignals.push(sig);
    result.processed.push({ filename, result: "routed-to-po" });
  }

  // Step 5a: DB prune
  db.exec(
    "DELETE FROM signals_processed WHERE processed_at < datetime('now', '-7 days')"
  );

  // Step 5b: filesystem prune (files with processedAt older than 7 days)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (existsSync(processedDir)) {
    for (const f of readdirSync(processedDir).filter((f) =>
      f.endsWith(".json")
    )) {
      const procPath = join(processedDir, f);
      try {
        const data = JSON.parse(readFileSync(procPath, "utf-8")) as {
          processedAt?: string;
        };
        if (data.processedAt) {
          const procAt = new Date(data.processedAt);
          if (!isNaN(procAt.getTime()) && procAt < sevenDaysAgo) {
            unlinkSync(procPath);
          }
        }
      } catch {
        // skip unreadable
      }
    }
  }

  return result;
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe("signal-T5 — SQLite signal dedup drain cycle (integration)", () => {
  let tmpRoot: string;
  let inboxDir: string;
  let processedDir: string;
  let db: Database;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "signal-T5-"));
    inboxDir = join(tmpRoot, "inbox");
    processedDir = join(tmpRoot, "processed");
    mkdirSync(inboxDir, { recursive: true });
    mkdirSync(processedDir, { recursive: true });
    db = makeSignalsDb();
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // already closed in DB-unavailable test
    }
    // Clean up temp directories
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  // ── AC-T5.1: SELECT path — fresh signal ──────────────────────────────────

  it("AC-T5.1 — fresh signal: included in pendingSignals and DB row created", () => {
    const signal = makeSignal();
    writeInboxSignal(inboxDir, "fresh-signal.json", signal);

    const result = runDrainCycle(inboxDir, processedDir, db);

    // pendingSignals contains the new signal
    expect(result.pendingSignals).toHaveLength(1);
    expect(result.pendingSignals[0].from).toBe("agents-architect");
    expect(result.pendingSignals[0].type).toBe("architecture-handoff");

    // result entry: routed-to-po
    const entry = result.processed.find((p) => p.filename === "fresh-signal.json");
    expect(entry).toBeDefined();
    expect(entry?.result).toBe("routed-to-po");

    // Inbox file consumed
    expect(existsSync(join(inboxDir, "fresh-signal.json"))).toBe(false);

    // Processed file written
    expect(existsSync(join(processedDir, "fresh-signal.json"))).toBe(true);

    // DB row created
    const fp = computeFingerprint(
      signal.from,
      signal.type,
      signal.payload,
      signal.createdAt
    );
    const row = db
      .query<{ fingerprint: string; result: string }, [string]>(
        "SELECT fingerprint, result FROM signals_processed WHERE fingerprint = ?"
      )
      .get(fp);
    expect(row).not.toBeNull();
    expect(row?.result).toBe("routed-to-po");
  });

  // ── AC-T5.2: SELECT path — replay duplicate ───────────────────────────────

  it("AC-T5.2 — replay duplicate: second cycle skips, -replay suffix, no new DB row", () => {
    const signal = makeSignal();
    const filename = "dup-signal.json";

    // First cycle: fresh signal
    writeInboxSignal(inboxDir, filename, signal);
    const first = runDrainCycle(inboxDir, processedDir, db);
    expect(first.pendingSignals).toHaveLength(1);
    expect(first.processed[0].result).toBe("routed-to-po");

    // Confirm 1 row in DB
    const countAfterFirst = db
      .query<{ n: number }, []>("SELECT COUNT(*) as n FROM signals_processed")
      .get();
    expect(countAfterFirst?.n).toBe(1);

    // Re-drop the same signal in inbox (simulating re-emission from same agent)
    writeInboxSignal(inboxDir, filename, signal);

    // Second cycle: replay
    const second = runDrainCycle(inboxDir, processedDir, db);
    expect(second.pendingSignals).toHaveLength(0);

    const replayEntry = second.processed.find(
      (p) => p.filename === filename
    );
    expect(replayEntry).toBeDefined();
    expect(replayEntry?.result).toBe("skipped-duplicate-replay");

    // Inbox file consumed (moved with -replay suffix)
    expect(existsSync(join(inboxDir, filename))).toBe(false);
    expect(existsSync(join(processedDir, "dup-signal-replay.json"))).toBe(true);

    // DB row count unchanged (no new row for duplicate)
    const countAfterSecond = db
      .query<{ n: number }, []>("SELECT COUNT(*) as n FROM signals_processed")
      .get();
    expect(countAfterSecond?.n).toBe(1);
  });

  // ── AC-T5.3: INSERT OR IGNORE idempotency ────────────────────────────────

  it("AC-T5.3 — INSERT OR IGNORE: double-insert same fingerprint → no throw, count stays 1", () => {
    const signal = makeSignal();
    const fp = computeFingerprint(
      signal.from,
      signal.type,
      signal.payload,
      signal.createdAt
    );

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO signals_processed
        (fingerprint, from_agent, to_agent, type, priority, payload,
         created_at, processed_at, processed_by, result, source_filename)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 'dev-team', ?, ?)
    `);

    // First insert
    expect(() => {
      stmt.run(
        fp,
        signal.from,
        signal.to ?? null,
        signal.type ?? null,
        signal.priority ?? null,
        JSON.stringify(signal.payload),
        signal.createdAt,
        "routed-to-po",
        "test-signal.json"
      );
    }).not.toThrow();

    // Second insert — identical fingerprint
    expect(() => {
      stmt.run(
        fp,
        signal.from,
        signal.to ?? null,
        signal.type ?? null,
        signal.priority ?? null,
        JSON.stringify(signal.payload),
        signal.createdAt,
        "routed-to-po",
        "test-signal-clone.json"
      );
    }).not.toThrow();

    // Exactly 1 row — IGNORE prevented the duplicate
    const row = db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) as n FROM signals_processed"
      )
      .get();
    expect(row?.n).toBe(1);
  });

  // ── AC-T5.4: Prune TTL 7d ────────────────────────────────────────────────

  it("AC-T5.4 — prune TTL: rows older than 7d deleted; ≤7d rows survive; old files pruned", () => {
    // Seed: 2 old rows (>7d ago) + 1 recent row (<7d ago)
    const oldTimestamp = "2026-05-04T00:00:00Z"; // 8 days ago from 2026-05-12
    const recentTimestamp = "2026-05-11T00:00:00Z"; // 1 day ago

    const oldFp1 = "old-fingerprint-aaa-001";
    const oldFp2 = "old-fingerprint-bbb-002";
    const recentFp = "recent-fingerprint-ccc-003";

    const seedStmt = db.prepare(`
      INSERT INTO signals_processed
        (fingerprint, from_agent, to_agent, type, priority, payload,
         created_at, processed_at, processed_by, result, source_filename)
      VALUES (?, 'agent-a', 'po', 'task', 'high', '{}', ?, ?, 'dev-team', 'routed-to-po', ?)
    `);

    seedStmt.run(oldFp1, oldTimestamp, oldTimestamp, "old-signal-1.json");
    seedStmt.run(oldFp2, oldTimestamp, oldTimestamp, "old-signal-2.json");
    seedStmt.run(recentFp, recentTimestamp, recentTimestamp, "recent-signal.json");

    // Write corresponding processed/ files so filesystem prune can also act
    const oldFileContent = JSON.stringify({ processedAt: oldTimestamp });
    writeFileSync(join(processedDir, "old-signal-1.json"), oldFileContent);
    writeFileSync(join(processedDir, "old-signal-2.json"), oldFileContent);
    writeFileSync(
      join(processedDir, "recent-signal.json"),
      JSON.stringify({ processedAt: recentTimestamp })
    );

    // 3 rows before prune
    const beforeCount = db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) as n FROM signals_processed"
      )
      .get();
    expect(beforeCount?.n).toBe(3);

    // Run drain (empty inbox — prune still runs)
    runDrainCycle(inboxDir, processedDir, db);

    // After prune: only the recent row remains
    const afterCount = db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) as n FROM signals_processed"
      )
      .get();
    expect(afterCount?.n).toBe(1);

    const surviving = db
      .query<{ fingerprint: string }, []>(
        "SELECT fingerprint FROM signals_processed"
      )
      .all();
    expect(surviving[0].fingerprint).toBe(recentFp);

    // Filesystem prune: old files removed
    expect(existsSync(join(processedDir, "old-signal-1.json"))).toBe(false);
    expect(existsSync(join(processedDir, "old-signal-2.json"))).toBe(false);

    // Recent file still present
    expect(existsSync(join(processedDir, "recent-signal.json"))).toBe(true);
  });

  // ── AC-T5.5: DB-unavailable degraded path ────────────────────────────────

  it("AC-T5.5 — DB unavailable: WARN logged, inbox files untouched, no DB write", () => {
    const signal = makeSignal();
    const filename = "preserved-signal.json";
    writeInboxSignal(inboxDir, filename, signal);

    // Pass null db to simulate DB open failure
    const result = runDrainCycle(inboxDir, processedDir, null);

    // WARN flag set
    expect(result.warnLogged).toBe(true);
    expect(result.dbUnavailable).toBe(true);

    // No signals routed to PO
    expect(result.pendingSignals).toHaveLength(0);

    // Inbox file preserved (not moved) — retry next cycle
    expect(existsSync(join(inboxDir, filename))).toBe(true);

    // Processed dir is empty — nothing moved
    const processedFiles = readdirSync(processedDir);
    expect(processedFiles).toHaveLength(0);
  });

  // ── AC-T5.6: Stale skip (24h) ────────────────────────────────────────────

  it("AC-T5.6 — stale signal (createdAt >24h ago): skipped-stale, -stale suffix, no PO routing", () => {
    // createdAt 48 hours ago
    const staleTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const staleSignal = makeSignal({ createdAt: staleTime });
    const filename = "stale-signal.json";
    writeInboxSignal(inboxDir, filename, staleSignal);

    const result = runDrainCycle(inboxDir, processedDir, db);

    // Not routed to PO
    expect(result.pendingSignals).toHaveLength(0);

    // Marked stale
    const entry = result.processed.find((p) => p.filename === filename);
    expect(entry).toBeDefined();
    expect(entry?.result).toBe("skipped-stale");

    // Inbox file consumed (moved with -stale suffix)
    expect(existsSync(join(inboxDir, filename))).toBe(false);
    expect(existsSync(join(processedDir, "stale-signal-stale.json"))).toBe(true);

    // No DB row inserted for stale signals
    const row = db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) as n FROM signals_processed"
      )
      .get();
    expect(row?.n).toBe(0);
  });
});
