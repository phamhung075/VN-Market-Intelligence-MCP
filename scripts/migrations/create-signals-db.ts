#!/usr/bin/env bun
// scripts/migrations/create-signals-db.ts
// Idempotent schema migration: initializes docs/signals/signals.db
// with the signals_processed table and supporting indexes.
//
// Usage: bun scripts/migrations/create-signals-db.ts
// Runs on Bun runtime — uses bun:sqlite (zero external deps).
// AC: IF NOT EXISTS guards ensure second invocation is a no-op.

import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { join } from "path";

// ── DDL (exported for unit tests) ───────────────────────────────────────────

export const SIGNALS_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS signals_processed (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint     TEXT    UNIQUE NOT NULL,
    from_agent      TEXT    NOT NULL,
    to_agent        TEXT,
    type            TEXT,
    priority        TEXT,
    payload         TEXT,
    created_at      TEXT    NOT NULL,
    processed_at    TEXT    NOT NULL,
    processed_by    TEXT    NOT NULL DEFAULT 'dev-team',
    result          TEXT    NOT NULL,
    source_filename TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_signals_fingerprint  ON signals_processed (fingerprint)`,
  `CREATE INDEX IF NOT EXISTS idx_signals_processed_at ON signals_processed (processed_at)`,
];

// ── Main ─────────────────────────────────────────────────────────────────────

const SIGNALS_DIR = join(import.meta.dir, "../../docs/signals");
const DB_PATH = join(SIGNALS_DIR, "signals.db");

function main(): void {
  // AC5: fail loud if docs/signals/ dir is absent (do not auto-create)
  if (!existsSync(SIGNALS_DIR)) {
    console.error(
      `[create-signals-db] ERROR: directory not found: ${SIGNALS_DIR}` +
      "\n  docs/signals/ must exist before running this migration."
    );
    process.exit(1);
  }

  let db: Database;

  try {
    db = new Database(DB_PATH);
  } catch (err) {
    console.error(
      `[create-signals-db] ERROR: failed to open ${DB_PATH}:\n  ${String(err)}`
    );
    process.exit(1);
  }

  try {
    for (const stmt of SIGNALS_DDL) {
      db.exec(stmt);
    }

    const row = db
      .query("SELECT COUNT(*) as cnt FROM signals_processed")
      .get() as { cnt: number };

    console.log(
      `[create-signals-db] signals.db initialized at ${DB_PATH}`
    );
    console.log(`[signal-T1] signals_processed rows: ${row.cnt}`);
  } catch (err) {
    console.error(
      `[create-signals-db] ERROR during schema creation:\n  ${String(err)}`
    );
    db.close();
    process.exit(1);
  }

  db.close();
  process.exit(0);
}

// Only run main when executed directly (not when imported by tests)
if (import.meta.main) {
  main();
}
