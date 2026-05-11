// Standalone script — run once: bun scripts/purge-phantom-reports.ts
// Deletes phantom rows in telegram_reports where created_at < 1000000
// (epoch before 1970-01-12 — all real production rows are ~1,700,000,000)
import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const PROJECT_ROOT = resolve(import.meta.dir, "..");
const DB_PATH = resolve(PROJECT_ROOT, "data", "market.db");

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
