#!/usr/bin/env bun
// scripts/migrations/backfill-signals-db.ts
// One-time (re-runnable) backfill: reads docs/signals/processed/*.json and
// inserts each signal into signals_processed via INSERT OR IGNORE.
//
// Usage: bun scripts/migrations/backfill-signals-db.ts
// Runs on Bun runtime — uses bun:sqlite (zero external deps).
// AC: idempotent — safe to re-run; no duplicates due to UNIQUE fingerprint + INSERT OR IGNORE.
// AC5: if docs/signals/processed/ is missing, throws with a clear message.

import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join, basename } from "path";
import { createHash } from "crypto";

import { SIGNALS_DDL } from "./create-signals-db.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BackfillResult {
  scanned: number;
  inserted: number;
  skipped: number;
  errors: number;
}

// Signal JSON shape from processed files (both old and new format)
interface SignalJson {
  from?: string;
  to?: string;
  type?: string;
  priority?: string;
  payload?: unknown;
  createdAt?: string;
  processedAt?: string;
  processedBy?: string;
  result?: string;
  fingerprint?: string;
  [key: string]: unknown;
}

// ── Fingerprint ───────────────────────────────────────────────────────────────

/**
 * Computes sha256(from + type + JSON.stringify(payload) + createdAt).
 * Matches the algorithm used by the dev-team drain (spec §4).
 */
export function computeFingerprint(
  from: string,
  type: string,
  payload: unknown,
  createdAt: string
): string {
  const raw = from + type + JSON.stringify(payload) + createdAt;
  return createHash("sha256").update(raw).digest("hex");
}

// ── Core backfill logic (exported for tests) ──────────────────────────────────

/**
 * Scans `processedDir` for *.json files and INSERT OR IGNOREs each into
 * the signals_processed table in `db`.
 *
 * @param processedDir  Absolute path to docs/signals/processed/ (or test temp dir)
 * @param db            Open bun:sqlite Database with signals_processed schema
 * @returns             Counts: scanned, inserted, skipped, errors
 */
export function backfillFromDir(processedDir: string, db: Database): BackfillResult {
  // AC5: fail loud if directory is missing
  if (!existsSync(processedDir)) {
    throw new Error(
      `[backfill-signals-db] ERROR: directory does not exist: ${processedDir}\n` +
        "  docs/signals/processed/ must exist before running this backfill."
    );
  }

  const files = readdirSync(processedDir).filter((f) => f.endsWith(".json"));

  const result: BackfillResult = { scanned: 0, inserted: 0, skipped: 0, errors: 0 };

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO signals_processed
      (fingerprint, from_agent, to_agent, type, priority, payload,
       created_at, processed_at, processed_by, result, source_filename)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const file of files) {
    result.scanned++;
    const filePath = join(processedDir, file);

    let sig: SignalJson;
    try {
      const rawSync = readFileSync(filePath, "utf-8");
      sig = JSON.parse(rawSync) as SignalJson;
    } catch (err) {
      console.error(`[backfill-signals-db] ERROR parsing ${file}: ${String(err)}`);
      result.errors++;
      continue;
    }

    try {
      // Determine fingerprint: use existing one from JSON, or compute from fields
      const fingerprint =
        typeof sig.fingerprint === "string" && sig.fingerprint.length > 0
          ? sig.fingerprint
          : computeFingerprint(
              sig.from ?? "",
              sig.type ?? "",
              sig.payload,
              sig.createdAt ?? ""
            );

      // from_agent is NOT NULL — mandatory field.
      // Non-signal JSON files (audit reports, etc.) legitimately lack 'from'.
      // Classify as skipped (not error) — they are valid files, just not agent signals.
      if (!sig.from) {
        console.warn(
          `[backfill-signals-db] SKIP: ${file} missing 'from' field (not a signal file)`
        );
        result.skipped++;
        continue;
      }

      // Normalise payload to JSON string
      const payloadStr =
        sig.payload !== undefined ? JSON.stringify(sig.payload) : null;

      // processed_at fallback: use file createdAt or now
      const processedAt =
        sig.processedAt ?? sig.createdAt ?? new Date().toISOString();

      // created_at is NOT NULL — use createdAt or processedAt or now
      const createdAt =
        sig.createdAt ?? sig.processedAt ?? new Date().toISOString();

      // result field NOT NULL — default 'routed-to-po' for legacy files
      const resultVal = sig.result ?? "routed-to-po";

      // processedBy default from schema 'dev-team'; explicit file value wins
      const processedBy = sig.processedBy ?? "dev-team";

      const info = insertStmt.run(
        fingerprint,
        sig.from,
        sig.to ?? null,
        sig.type ?? null,
        sig.priority ?? null,
        payloadStr,
        createdAt,
        processedAt,
        processedBy,
        resultVal,
        basename(file)
      );

      // bun:sqlite: info.changes === 1 → inserted; 0 → ignored (duplicate)
      if (info.changes === 1) {
        result.inserted++;
      } else {
        result.skipped++;
      }
    } catch (err) {
      console.error(`[backfill-signals-db] ERROR inserting ${file}: ${String(err)}`);
      result.errors++;
    }
  }

  return result;
}

// ── CLI entry point ───────────────────────────────────────────────────────────

const SIGNALS_DIR = join(import.meta.dir, "../../docs/signals");
const PROCESSED_DIR = join(SIGNALS_DIR, "processed");
const DB_PATH = join(SIGNALS_DIR, "signals.db");

function main(): void {
  // Ensure signals.db exists with correct schema
  const db = new Database(DB_PATH);
  for (const stmt of SIGNALS_DDL) {
    db.exec(stmt);
  }

  console.log(`[backfill-signals-db] scanning: ${PROCESSED_DIR}`);
  console.log(`[backfill-signals-db] db: ${DB_PATH}`);

  let result: BackfillResult;
  try {
    result = backfillFromDir(PROCESSED_DIR, db);
  } finally {
    db.close();
  }

  console.log(`[backfill-signals-db] done.`);
  console.log(`  scanned : ${result.scanned}`);
  console.log(`  inserted: ${result.inserted}`);
  console.log(`  skipped : ${result.skipped} (already in DB)`);
  console.log(`  errors  : ${result.errors}`);

  if (result.errors > 0) {
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
