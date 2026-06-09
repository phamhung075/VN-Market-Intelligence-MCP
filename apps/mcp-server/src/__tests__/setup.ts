/**
 * Bun test preload — loaded before any test file is evaluated.
 *
 * Sets DB_PATH to :memory: so every test run uses an in-memory SQLite
 * database regardless of the local .env file. This eliminates production-DB
 * bleed: no test can accidentally read or write the real on-disk database.
 *
 * Individual test files are responsible for their own beforeEach / afterEach
 * setup (closeDb + initDatabase). This preload only enforces the DB_PATH
 * invariant at the earliest possible point — before any module import.
 *
 * Also ensures apps/mcp-server/data/ subdirectories exist. The entire data/
 * tree is git-ignored so fresh worktrees start without it, causing ENOENT
 * when tests or infrastructure code try to create files inside data/.
 *
 * CI note: apps/mcp-server/data is tracked as a git symlink (mode 120000)
 * pointing to ../../data (repo root /data/, which is git-ignored). In CI the
 * symlink target does not exist. We detect this broken-symlink case, remove
 * the dangling symlink, and create a real directory in its place so that every
 * mkdirSync call below succeeds and tests are fully self-contained in CI.
 */
import fs from "node:fs";
import path from "node:path";

// Anchor to apps/mcp-server/ regardless of where bun test is invoked from.
// import.meta.dir = apps/mcp-server/src/__tests__
const DATA_ROOT = path.resolve(import.meta.dir, "../../data");

// Heal broken symlink: if DATA_ROOT is a symlink but its target does not exist
// (CI checkout — /data/ is git-ignored), replace the dangling symlink with a
// real directory so all mkdirSync calls below succeed.
try {
  const stat = fs.lstatSync(DATA_ROOT);
  if (stat.isSymbolicLink() && !fs.existsSync(DATA_ROOT)) {
    fs.unlinkSync(DATA_ROOT);
  }
} catch {
  // DATA_ROOT does not exist at all — mkdirSync below will create it.
}

for (const subdir of [
  "",          // data/ itself
  "pdfs",
  "lancedb",
  "models",
  "briefings",
  "reports",
  "exports",
]) {
  const target = path.join(DATA_ROOT, subdir);
  try {
    fs.mkdirSync(target, { recursive: true });
  } catch {
    // Tolerate EEXIST (real dir already present, e.g. local dev)
  }
}

Bun.env["DB_PATH"] = ":memory:";
Bun.env["STOCK_PRICE_DB_PATH"] = Bun.env["STOCK_PRICE_DB_PATH"] ?? "/tmp/test_stock_price.db";
