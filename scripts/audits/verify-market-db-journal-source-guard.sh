#!/usr/bin/env bash
# scripts/audits/verify-market-db-journal-source-guard.sh
#
# FIX-MARKETDB-JOURNALMODE-GUARD-SHIPPED-BUT-NEVER-ARMED — AC-2 sibling of
# scripts/audits/verify-market-db-journal-mode.sh (the RUNTIME guard).
#
# WHY A SEPARATE SOURCE GUARD (AC-3 — this is complementary to the runtime
# guard, never a substitute for it, and vice versa): the runtime guard asserts
# the LIVE container's on-disk journal_mode/-wal/-shm state and can say THAT
# WAL is armed, but never WHICH code path armed it. This script is the
# inverse — it asserts SOURCE never contains an unsanctioned journal_mode-
# setting call against market.db, but cannot see a runtime-only PRAGMA issued
# outside tracked source (e.g. an ad-hoc `docker exec bun -e`). Ship both;
# neither closes the other's blind spot.
#
# SOLE SANCTIONED OWNER — opt-IN allowlist, never an opt-OUT ignore-list (see
# memory feedback_fleetwide_gate_validated_on_one_file_optout_allowlist: an
# ignore-list of "known safe" files is exactly the shape that let the Go
# re-armers in apps/stock-price survive a TS-only sweep undetected — an
# unlisted file must be unprotected by default, never silently exempted):
#
#     apps/mcp-server/src/infrastructure/db/schema.ts
#
# Every OTHER tracked source file that sets journal_mode against market.db
# FAILS. No file is ever exempted by name — only by the two checks' own
# structural scope (test files, §Checks below).
#
# Checks:
#   1. TS/JS SET-PRAGMA proximity — `PRAGMA journal_mode =` (an explicit SET;
#      a bare read like `.prepare('PRAGMA journal_mode').get()` never matches,
#      by construction — no `=` follows) within WINDOW=20 lines of a
#      market.db-identifying token (`Bun.env["DB_PATH"]` or `DEFAULT_DB_PATH`
#      — schema.ts's own two tokens for resolving market.db's path; no other
#      file in this repo derives ITS db path directly from either token).
#      WINDOW=20 is calibrated against the one legitimate non-owner SET in the
#      current corpus (coordinationStore.ts, WAL for the separate, PO-approved
#      coordination.db — docs/policies/market-db-journal-mode-policy.md
#      §Related decisions): its own `Bun.env["DB_PATH"]` read (line ~51, used
#      only to derive coordination.db's SIBLING directory, never passed to
#      `new Database()` directly) sits 27 lines from its `PRAGMA journal_mode
#      = WAL` (line ~78) in a DIFFERENT function — outside WINDOW by
#      construction, verified against the live corpus at authoring time
#      (0 offenders). Do not shrink WINDOW below the realistic open+PRAGMA
#      adjacency this repo's own idiom uses everywhere (1-3 lines, see any
#      *__tests__* fixture) or grow it past ~25 without re-verifying against
#      coordinationStore.ts's own token/SET distance.
#      KNOWN SCOPE LIMIT: this is textual proximity, not real dataflow — a
#      future file that spreads the market.db path token and the PRAGMA SET
#      more than WINDOW lines apart would be a false negative. Every
#      historical instance of this defect (bctcEvalBackfillRunner.ts,
#      smoke-task-lock*.ts's WAL fixtures) used the tight open+PRAGMA-adjacent
#      idiom this check is calibrated to catch.
#   2. Go DSN — the literal token `_journal_mode=` anywhere in a non-test .go
#      file (AC-2's explicitly-named gap: `_journal_mode=` inside a `file:`
#      DSN string re-arms WAL on a connection, independent of any TS/JS
#      PRAGMA sweep — the exact shape `apps/stock-price/pkg/infrastructure/
#      {fetchers,foreign_flow_repository,room_event_repository}.go` carried
#      until FIX-STOCKPRICE-PRICEHISTORY-RO-WAL-DSN removed it). Zero
#      legitimate non-test Go use exists in this repo today (macro-indicators'
#      WAL is a plain `db.Exec("PRAGMA journal_mode=WAL")` call against its
#      OWN macro_indicators.db, not a DSN token — a structurally different,
#      already-out-of-scope shape) — unconditional FAIL, no target-DB
#      discrimination needed. Verified 0 offenders against the live corpus at
#      authoring time.
#
# Test files are OUT OF SCOPE for both checks (EXCLUDE_PATTERN below) — every
# test file that sets journal_mode does so against an ephemeral fixture
# (`:memory:`, a Go `t.TempDir()` copy, a disposable temp path), never the
# live market.db; this is a structural, content-based scope narrowing (same
# EXCLUDE_PATTERN idiom already shipped in no-hardcode-allowlist-scan.sh), not
# a per-file ignore-list.
#
# Usage:
#   bash scripts/audits/verify-market-db-journal-source-guard.sh --check
#
# Env override (test-only; unset in normal/CI use):
#   MARKET_DB_SOURCE_GUARD_INCLUDE_OVERRIDE   space-separated git pathspecs —
#     lets tests scope the scan to a disposable untracked fixture file instead
#     of the whole repo (mirrors no-hardcode-allowlist-scan.sh's
#     *_INCLUDE_OVERRIDE idiom).
#
# Owning flow: docs/policies/dev-standards.md § Script Persistence
# Policy SSOT this guard enforces: docs/policies/market-db-journal-mode-policy.md
#
# shellcheck disable=SC2094 # every `$f` use below is READ-ONLY — this script
# never writes a scanned file.
set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "[verify-market-db-journal-source-guard] ERROR cannot resolve PROJECT_ROOT"; exit 2; }
cd "$PROJECT_ROOT" || exit 2

ALLOWLIST_OWNER="apps/mcp-server/src/infrastructure/db/schema.ts"

if [ -n "${MARKET_DB_SOURCE_GUARD_INCLUDE_OVERRIDE:-}" ]; then
  # shellcheck disable=SC2206
  INCLUDE_PATHSPECS=($MARKET_DB_SOURCE_GUARD_INCLUDE_OVERRIDE)
else
  INCLUDE_PATHSPECS=('apps/**/*.ts' 'apps/**/*.go' 'scripts/**/*.ts' 'packages/**/*.ts')
fi

EXCLUDE_PATTERN='(^|/)(__tests__|tests)(/|$)|\.test\.ts$|_test\.go$|\.d\.ts$|node_modules/|/dist/|\.venv/|PDF-Extract-Kit/|/vendor/'

usage() {
  echo "Usage: $0 --check"
}

list_files() {
  git ls-files --cached --others --exclude-standard -- "${INCLUDE_PATHSPECS[@]}" 2>/dev/null \
    | grep -vE "$EXCLUDE_PATTERN" || true
}

# ── Check 1: TS/JS SET-PRAGMA within WINDOW lines of a market.db path token ──
MARKET_TOKEN_ERE='Bun\.env\["DB_PATH"\]|DEFAULT_DB_PATH'
SET_PRAGMA_ERE='PRAGMA[[:space:]]+journal_mode[[:space:]]*='
WINDOW=20

check1_ts_set_pragma() {
  local fail=0

  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || continue
    case "$f" in
      *.ts | *.tsx | *.js | *.mjs | *.cjs) ;;
      *) continue ;;
    esac
    [ "$f" = "$ALLOWLIST_OWNER" ] && continue

    # Cheap pre-filter: skip files missing either half of the combo entirely.
    grep -qE "$SET_PRAGMA_ERE" "$f" 2>/dev/null || continue
    grep -qE "$MARKET_TOKEN_ERE" "$f" 2>/dev/null || continue

    local -a token_lines=() set_lines=()
    local ln=0
    while IFS= read -r line; do
      ln=$((ln + 1))
      if [[ "$line" =~ $MARKET_TOKEN_ERE ]]; then
        token_lines+=("$ln")
      fi
      if [[ "$line" =~ $SET_PRAGMA_ERE ]]; then
        set_lines+=("$ln")
      fi
    done < "$f"

    local tl sl delta
    for tl in "${token_lines[@]}"; do
      for sl in "${set_lines[@]}"; do
        delta=$((tl - sl))
        [ "$delta" -lt 0 ] && delta=$((-delta))
        if [ "$delta" -le "$WINDOW" ]; then
          echo "  [verify-market-db-journal-source-guard] TS-SET-PRAGMA: $f:$sl sets journal_mode within ${WINDOW}L of a market.db path token at $f:$tl — only $ALLOWLIST_OWNER may do this"
          fail=1
        fi
      done
    done
  done < <(list_files)

  return $fail
}

# ── Check 2: Go DSN `_journal_mode=` token (non-test .go, unconditional) ────
check2_go_dsn() {
  local fail=0

  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || continue
    case "$f" in
      *.go) ;;
      *) continue ;;
    esac
    grep -q '_journal_mode=' "$f" 2>/dev/null || continue

    local ln=0
    while IFS= read -r line; do
      ln=$((ln + 1))
      case "$line" in
        *_journal_mode=*)
          echo "  [verify-market-db-journal-source-guard] GO-DSN: $f:$ln — _journal_mode= token in a Go DSN string (never sanctioned; no Go service may set market.db's journal_mode)"
          fail=1
          ;;
      esac
    done < "$f"
  done < <(list_files)

  return $fail
}

cmd_check() {
  local rc=0 r

  echo "[verify-market-db-journal-source-guard] Check 1/2 — TS/JS SET-PRAGMA near a market.db path token..."
  check1_ts_set_pragma
  r=$?
  [ "$r" -ne 0 ] && rc=1

  echo "[verify-market-db-journal-source-guard] Check 2/2 — Go DSN _journal_mode= token..."
  check2_go_dsn
  r=$?
  [ "$r" -ne 0 ] && rc=1

  if [ "$rc" -ne 0 ]; then
    echo "[verify-market-db-journal-source-guard] FAIL"
    return 1
  fi
  echo "[verify-market-db-journal-source-guard] PASS — 0 offenders across both checks (sole owner: $ALLOWLIST_OWNER)"
  return 0
}

MODE="${1:-}"
case "$MODE" in
  --check) cmd_check; exit $? ;;
  *) usage; exit 2 ;;
esac
