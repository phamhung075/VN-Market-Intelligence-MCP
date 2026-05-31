// Standalone script — run once: bun scripts/purge-phantom-reports.ts
// Deletes phantom rows in telegram_reports where created_at < 1000000
// (epoch before 1970-01-12 — all real production rows are ~1,700,000,000)
//
// ENV-ISOLATION guard (EI-P1-2):
//   APP_ENV must be "production" (or unset, treated as production).
//   If APP_ENV is anything else, the script refuses to run unless --force-dev
//   is passed — prevents accidental purge of a dev/test datastore.
//   Resolved DB path and APP_ENV are always printed before any write (fail-loud).
import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const PROJECT_ROOT = resolve(import.meta.dir, "..");
const DB_PATH = resolve(PROJECT_ROOT, "data", "market.db");

const APP_ENV = process.env.APP_ENV ?? "production";
const FORCE_DEV = process.argv.includes("--force-dev");

// --- ENV-ISOLATION GUARD (fail-loud per docs/protocols/fail-loud-protocol.md) ---
console.log(`[purge] APP_ENV=${APP_ENV}`);
console.log(`[purge] DB_PATH (resolved)=${DB_PATH}`);

if (APP_ENV !== "production") {
  if (!FORCE_DEV) {
    console.error(
      `[purge] REFUSED: APP_ENV="${APP_ENV}" is not "production".` +
        ` Pass --force-dev to override and run against a non-production datastore.`
    );
    process.exit(1);
  }
  console.warn(
    `[purge] WARNING: APP_ENV="${APP_ENV}" — running against non-production datastore (--force-dev supplied).`
  );
}
// ---------------------------------------------------------------------------------

if (!existsSync(DB_PATH)) {
  console.warn(`[purge] data/market.db not found — skip`);
  process.exit(0);
}

const db = new Database(DB_PATH);
const result = db
  .prepare("DELETE FROM telegram_reports WHERE created_at < 1000000")
  .run();
console.log(`[purge] deleted ${result.changes} phantom rows (created_at < 1000000)`);
db.close();
