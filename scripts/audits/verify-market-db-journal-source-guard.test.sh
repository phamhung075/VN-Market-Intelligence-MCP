#!/usr/bin/env bash
# scripts/audits/verify-market-db-journal-source-guard.test.sh
# Smoke test for scripts/audits/verify-market-db-journal-source-guard.sh
# (FIX-MARKETDB-JOURNALMODE-GUARD-SHIPPED-BUT-NEVER-ARMED AC-2/AC-3).
#
# Every synthetic fixture lives under a disposable, UNTRACKED subdir
# (apps/mcp-server/src/__market_db_source_guard_fixtures__/), scoped via
# MARKET_DB_SOURCE_GUARD_INCLUDE_OVERRIDE so each case only ever scans its own
# fixture file — never the live repo tree. Fixture dir is removed on exit
# (trap). Mirrors no-hardcode-allowlist-scan.test.sh's harness shape.
#
# Covers:
#   1. --check exits 0 on the current live repo (0 offenders at authoring time)
#   2. a synthetic TS fixture (DB_PATH token + SET PRAGMA journal_mode=WAL
#      adjacent, outside schema.ts) fails --check (AC-3: source guard fires on
#      a deliberately re-armed fixture)
#   3. a synthetic Go fixture (`file:...?_journal_mode=WAL` DSN, non-test .go)
#      fails --check
#   4. a synthetic TS fixture mirroring coordinationStore.ts's REAL shape
#      (DB_PATH token used only to derive a sibling path, PRAGMA SET >20 lines
#      away in a different function) passes --check — negative control
#      proving the guard does not false-positive on the one legitimate
#      non-owner SET already shipped in this repo
#   5. a synthetic Go test fixture (`_journal_mode=` inside a `_test.go` file)
#      passes --check — test files are structurally out of scope
#   6. a synthetic TS fixture with only a bare PRAGMA journal_mode READ
#      (`.prepare('PRAGMA journal_mode').get()`, no `=`) passes --check
#
# Usage: bash scripts/audits/verify-market-db-journal-source-guard.test.sh

set -u
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }
cd "$PROJECT_ROOT" || { echo "FAIL: cannot cd to PROJECT_ROOT"; exit 1; }

SCRIPT="$PROJECT_ROOT/scripts/audits/verify-market-db-journal-source-guard.sh"
FIXTURE_DIR="$PROJECT_ROOT/apps/mcp-server/src/__market_db_source_guard_fixtures__"

# shellcheck disable=SC2329 # invoked indirectly via `trap ... EXIT` below
cleanup() { rm -rf "$FIXTURE_DIR"; }
trap cleanup EXIT

mkdir -p "$FIXTURE_DIR"

PASS_COUNT=0
FAIL_COUNT=0
ok()  { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
bad() { echo "FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

# ---------------------------------------------------------------------------
# DoD-1: --check exits 0 on the current live repo (real script, real tree).
# ---------------------------------------------------------------------------
bash "$SCRIPT" --check > /tmp/market-db-source-guard-test-dod1.txt 2>&1
RC1=$?
if [ "$RC1" -eq 0 ]; then
  ok "DoD-1-live-repo-check-passes (rc=0)"
else
  bad "DoD-1-live-repo-check-passes (rc=${RC1}, expected 0)"
  cat /tmp/market-db-source-guard-test-dod1.txt
fi

# ---------------------------------------------------------------------------
# DoD-2: deliberately re-armed TS fixture — DB_PATH token + adjacent SET
# PRAGMA journal_mode=WAL, outside schema.ts — fails --check.
# ---------------------------------------------------------------------------
F2="$FIXTURE_DIR/tc2_rearmed.ts"
cat > "$F2" <<'EOF'
import { Database } from "bun:sqlite";

export function openMarketDbDirectly(): Database {
  const dbPath = Bun.env["DB_PATH"] ?? "./data/market.db";
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}
EOF
REL2="apps/mcp-server/src/__market_db_source_guard_fixtures__/tc2_rearmed.ts"
MARKET_DB_SOURCE_GUARD_INCLUDE_OVERRIDE="$REL2" bash "$SCRIPT" --check > /tmp/market-db-source-guard-test-dod2.txt 2>&1
RC2=$?
if [ "$RC2" -eq 1 ] && grep -q "TS-SET-PRAGMA" /tmp/market-db-source-guard-test-dod2.txt; then
  ok "DoD-2-rearmed-ts-fixture-fails-check (rc=${RC2})"
else
  bad "DoD-2-rearmed-ts-fixture-fails-check (rc=${RC2})"
  cat /tmp/market-db-source-guard-test-dod2.txt
fi

# ---------------------------------------------------------------------------
# DoD-3: deliberately re-armed Go fixture — `_journal_mode=` in a `file:` DSN,
# non-test .go — fails --check.
# ---------------------------------------------------------------------------
F3="$FIXTURE_DIR/tc3_rearmed.go"
cat > "$F3" <<'EOF'
package fixtures

import (
	"database/sql"
	"fmt"
)

func openMarketDb(dbPath string) (*sql.DB, error) {
	dsn := fmt.Sprintf("file:%s?_journal_mode=WAL&_busy_timeout=5000", dbPath)
	return sql.Open("sqlite3", dsn)
}
EOF
REL3="apps/mcp-server/src/__market_db_source_guard_fixtures__/tc3_rearmed.go"
MARKET_DB_SOURCE_GUARD_INCLUDE_OVERRIDE="$REL3" bash "$SCRIPT" --check > /tmp/market-db-source-guard-test-dod3.txt 2>&1
RC3=$?
if [ "$RC3" -eq 1 ] && grep -q "GO-DSN" /tmp/market-db-source-guard-test-dod3.txt; then
  ok "DoD-3-rearmed-go-dsn-fixture-fails-check (rc=${RC3})"
else
  bad "DoD-3-rearmed-go-dsn-fixture-fails-check (rc=${RC3})"
  cat /tmp/market-db-source-guard-test-dod3.txt
fi

# ---------------------------------------------------------------------------
# DoD-4: negative control — mirrors coordinationStore.ts's REAL shape (DB_PATH
# token read only to derive a SIBLING db path, far from an unrelated PRAGMA
# SET in a different function/DB) — passes --check.
# ---------------------------------------------------------------------------
F4="$FIXTURE_DIR/tc4_sibling_db_shape.ts"
cat > "$F4" <<'EOF'
/**
 * Sibling Store — mirrors apps/mcp-server/src/infrastructure/db/
 * coordinationStore.ts's REAL shape byte-for-byte in spacing: the DB_PATH
 * read lives inside a path-resolution helper, well over WINDOW lines away
 * from the unrelated PRAGMA SET inside a DIFFERENT function/DB open below.
 *
 * Database: sibling.db (separate from market.db)
 * Path resolved from SIBLING_DB_PATH env var or defaults to sibling
 * of market.db at /app/data/sibling.db.
 */

import { Database } from "bun:sqlite";
import { dirname, resolve } from "node:path";

let _siblingDb: Database | null = null;
let _siblingDbUnavailable = false;

/**
 * Resolve the sibling.db path.
 * Priority: SIBLING_DB_PATH env var > sibling of DB_PATH > default.
 */
function resolveSiblingDbPath(): string {
  if (Bun.env["SIBLING_DB_PATH"]) {
    return Bun.env["SIBLING_DB_PATH"];
  }
  // Sibling of market.db — works both in Docker and on host
  const marketPath = Bun.env["DB_PATH"];
  if (marketPath && marketPath !== ":memory:") {
    const dir = dirname(resolve(marketPath));
    return resolve(dir, "sibling.db");
  }
  const PROJECT_ROOT = resolve(import.meta.dir, "..", "..", "..");
  return resolve(PROJECT_ROOT, "data", "sibling.db");
}

/**
 * Open (or return cached) sibling.db with WAL mode.
 */
function getSiblingDb(): Database | null {
  if (_siblingDbUnavailable) return null;
  if (_siblingDb) return _siblingDb;

  const dbPath = resolveSiblingDbPath();

  // Padding to reproduce the real ~27-line token→SET distance observed in
  // coordinationStore.ts (this fixture is a byte-for-byte spacing mirror,
  // not a functional copy — the padding below is inert).
  // pad-1
  // pad-2
  // pad-3
  // pad-4
  // pad-5

  try {
    const db = new Database(dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = NORMAL");
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA foreign_keys = ON");

    _siblingDb = db;
    return _siblingDb;
  } catch {
    _siblingDbUnavailable = true;
    return null;
  }
}

export { getSiblingDb };
EOF
REL4="apps/mcp-server/src/__market_db_source_guard_fixtures__/tc4_sibling_db_shape.ts"
MARKET_DB_SOURCE_GUARD_INCLUDE_OVERRIDE="$REL4" bash "$SCRIPT" --check > /tmp/market-db-source-guard-test-dod4.txt 2>&1
RC4=$?
if [ "$RC4" -eq 0 ]; then
  ok "DoD-4-sibling-db-shape-negative-control-passes-check (rc=${RC4})"
else
  bad "DoD-4-sibling-db-shape-negative-control-passes-check (rc=${RC4})"
  cat /tmp/market-db-source-guard-test-dod4.txt
fi

# ---------------------------------------------------------------------------
# DoD-5: Go _test.go fixture with `_journal_mode=` — test files are out of
# scope — passes --check.
# ---------------------------------------------------------------------------
F5="$FIXTURE_DIR/tc5_test_fixture_test.go"
cat > "$F5" <<'EOF'
package fixtures_test

import (
	"database/sql"
	"testing"
)

func createTempMarketDB(t *testing.T) *sql.DB {
	db, _ := sql.Open("sqlite3", "temp.db?_journal_mode=WAL")
	return db
}
EOF
REL5="apps/mcp-server/src/__market_db_source_guard_fixtures__/tc5_test_fixture_test.go"
MARKET_DB_SOURCE_GUARD_INCLUDE_OVERRIDE="$REL5" bash "$SCRIPT" --check > /tmp/market-db-source-guard-test-dod5.txt 2>&1
RC5=$?
if [ "$RC5" -eq 0 ]; then
  ok "DoD-5-go-test-file-out-of-scope-passes-check (rc=${RC5})"
else
  bad "DoD-5-go-test-file-out-of-scope-passes-check (rc=${RC5})"
  cat /tmp/market-db-source-guard-test-dod5.txt
fi

# ---------------------------------------------------------------------------
# DoD-6: bare PRAGMA journal_mode READ (no `=`) near a DB_PATH token — never a
# SET — passes --check.
# ---------------------------------------------------------------------------
F6="$FIXTURE_DIR/tc6_read_only.ts"
cat > "$F6" <<'EOF'
import { Database } from "bun:sqlite";

export function reportJournalMode(db: Database): string {
  const dbPath = Bun.env["DB_PATH"] ?? "./data/market.db";
  const row = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
  return `${dbPath}: ${row.journal_mode}`;
}
EOF
REL6="apps/mcp-server/src/__market_db_source_guard_fixtures__/tc6_read_only.ts"
MARKET_DB_SOURCE_GUARD_INCLUDE_OVERRIDE="$REL6" bash "$SCRIPT" --check > /tmp/market-db-source-guard-test-dod6.txt 2>&1
RC6=$?
if [ "$RC6" -eq 0 ]; then
  ok "DoD-6-bare-pragma-read-passes-check (rc=${RC6})"
else
  bad "DoD-6-bare-pragma-read-passes-check (rc=${RC6})"
  cat /tmp/market-db-source-guard-test-dod6.txt
fi

echo "========================================"
echo "Test Results: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT}"
echo "========================================"

[ "$FAIL_COUNT" -gt 0 ] && exit 1
exit 0
