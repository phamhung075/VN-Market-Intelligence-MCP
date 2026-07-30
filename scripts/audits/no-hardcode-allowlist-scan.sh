#!/usr/bin/env bash
# scripts/audits/no-hardcode-allowlist-scan.sh — FACTORY-GUARD-CI-NOHARDCODE-IMPL
#
# CI-time "no-hardcode-allowlist" guardrail. Closes the gap identified in
# docs/architecture-briefs/2026-07-24-factory-guard-ci-no-hardcode-allowlist-scan.md:
# zero CI coverage anywhere (eslint/golangci/importlinter) for a ticker/date
# literal smuggled INTO a control-flow condition (not a named, generically-
# consumed reference-data table — those are explicitly NOT the bug class,
# see brief §0). Zero-tolerance (fix-now, same pattern as
# scripts/audits/metric-mask-lint.sh / dead-code-gate.sh — NOT baseline/
# ratchet like size-lint-justification.sh), 2 mechanically-reliable checks
# — a generic cross-file ticker-array-duplication/overlap detector is
# explicitly DEFERRED (brief §3: the repo has dozens of legitimately
# overlapping domain rule tables, e.g. predictionCascadeMapper.ts's cascade
# categories intentionally re-use VCB/BID/CTG across unrelated buckets; a
# mechanical "N-shared-elements" check would false-positive heavily).
#
# Checks (scanned set: tracked apps/**/*.ts + apps/**/*.go + packages/**/*.ts,
# excluding __tests__/, *.test.ts, *_test.go, node_modules/, dist/, .venv/,
# PDF-Extract-Kit/, vendor/ — same EXCLUDE_PATTERN idiom as metric-mask-lint.sh):
#
#   1. Temporal special-case ban: a line containing `.includes('YYYY')` (TS)
#      or `strings.Contains(x, "YYYY")` (Go 2nd-arg substring form) that
#      co-occurs, within a small (+/-2) line window, with a literal-year
#      equality comparison (`===? YYYY` TS / `== YYYY` Go) — catches the
#      ticket's own named example verbatim (newsChainFallback.ts:
#      `signalText.includes('2023') && year === 2024`). Near-zero
#      false-positive risk: this combination is rare and structurally always
#      signals a hardcoded date-vs-date special-case.
#
#   2. Ticker/code literal-branch ban: `(ticker|symbol|code|action_code)`
#      (bare identifier or `<obj>.<ident>` property access) compared with
#      `===`/`==` against a quoted 2-5-char ALL-CAPS literal — catches a
#      diagnostic reason/reasoning string silently special-cased for exactly
#      one ticker code. Denylist (never flagged, brief §3 + §2(a) — a stable
#      domain-enum mapping, not volatile reference data): HOSE|HNX|UPCOM|
#      BLOOMBERG.
#
# Escape hatch (mirrors size-justification:/metric-mask-allow: convention):
# an inline `hardcode-scan-allow: <reason>` comment on the SAME line as the
# match, or on the line immediately preceding it, suppresses that one match
# — for a genuine non-offender that happens to lexically match a shape
# above (e.g. a documented test-fixture sentinel, or a pending-decision
# known-debt finding this gate must not force a premature semantics change
# on — see docs/data/code-janitor-known-findings.json JANITOR-034/035).
#
# Usage:
#   bash scripts/audits/no-hardcode-allowlist-scan.sh --check    # CI mode: exit 0 pass / 1 fail, no writes
#
# Env overrides (test-only; unset in normal/CI use):
#   NO_HARDCODE_SCAN_INCLUDE_OVERRIDE   space-separated git pathspecs — lets
#     tests scope the scan to a disposable untracked fixture file instead of
#     the whole repo (mirrors metric-mask-lint.sh's *_INCLUDE_OVERRIDE idiom).
#
# Owning flow: docs/policies/dev-standards.md § Script Persistence
# Detail ref: docs/architecture-briefs/2026-07-24-factory-guard-ci-no-hardcode-allowlist-scan.md
#
# shellcheck disable=SC2094 # every `$f`/`$file` use below is READ-ONLY (sed -n /
# grep / the line-loop's own `< "$f"`) — this script never writes a scanned file.
set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "[no-hardcode-allowlist-scan] ERROR cannot resolve PROJECT_ROOT"; exit 2; }
cd "$PROJECT_ROOT" || exit 2

if [ -n "${NO_HARDCODE_SCAN_INCLUDE_OVERRIDE:-}" ]; then
  # shellcheck disable=SC2206
  INCLUDE_PATHSPECS=($NO_HARDCODE_SCAN_INCLUDE_OVERRIDE)
else
  INCLUDE_PATHSPECS=('apps/**/*.ts' 'apps/**/*.go' 'packages/**/*.ts')
fi

EXCLUDE_PATTERN='(^|/)(__tests__|tests)(/|$)|\.test\.ts$|_test\.go$|\.d\.ts$|node_modules/|/dist/|\.venv/|PDF-Extract-Kit/|/vendor/'

usage() {
  echo "Usage: $0 --check"
}

list_files() {
  git ls-files --cached --others --exclude-standard -- "${INCLUDE_PATHSPECS[@]}" 2>/dev/null \
    | grep -vE "$EXCLUDE_PATTERN" || true
}

# ── Escape hatch ─────────────────────────────────────────────────────────
# has_suppression <file> <lineno> — 0 (true) iff the SAME line or the
# immediately PRECEDING line carries a `hardcode-scan-allow:` comment.
has_suppression() {
  local f="$1" ln="$2" prev
  sed -n "${ln}p" "$f" 2>/dev/null | grep -q 'hardcode-scan-allow:' && return 0
  prev=$((ln - 1))
  if [ "$prev" -ge 1 ]; then
    sed -n "${prev}p" "$f" 2>/dev/null | grep -q 'hardcode-scan-allow:' && return 0
  fi
  return 1
}

# ── Check 1: temporal special-case (includes('YYYY') near a literal-year ===) ──
# TS shape: `.includes('YYYY')` / `.includes("YYYY")`.
# Go shape: `strings.Contains(x, "YYYY")` (2nd-arg substring form).
INCLUDES_YEAR_ERE="(\\.includes\\(['\"]|[Ss]trings\\.Contains\\([^,]+,[[:space:]]*['\"])(19|20)[0-9]{2}"
YEAR_EQ_ERE='={2,3}[[:space:]]*(19|20)[0-9]{2}'
TEMPORAL_WINDOW=2

check1_temporal_combo() {
  local fail=0

  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || continue
    # Cheap pre-filter: skip files with no 4-digit-year mention at all.
    grep -qE '(19|20)[0-9]{2}' "$f" 2>/dev/null || continue

    local -a includes_lines=() eq_lines=()
    local ln=0
    while IFS= read -r line; do
      ln=$((ln + 1))
      if [[ "$line" =~ $INCLUDES_YEAR_ERE ]]; then
        includes_lines+=("$ln")
      fi
      if [[ "$line" =~ $YEAR_EQ_ERE ]]; then
        eq_lines+=("$ln")
      fi
    done < "$f"

    [ "${#includes_lines[@]}" -eq 0 ] && continue
    [ "${#eq_lines[@]}" -eq 0 ] && continue

    local il el delta
    for il in "${includes_lines[@]}"; do
      for el in "${eq_lines[@]}"; do
        delta=$((il - el))
        [ "$delta" -lt 0 ] && delta=$((-delta))
        if [ "$delta" -le "$TEMPORAL_WINDOW" ]; then
          if has_suppression "$f" "$il" || has_suppression "$f" "$el"; then
            continue
          fi
          echo "  [no-hardcode-allowlist-scan] TEMPORAL-COMBO: $f:$il (includes-year) near $f:$el (literal-year ==) — hardcoded date-vs-date special-case"
          fail=1
        fi
      done
    done
  done < <(list_files)

  return $fail
}

# ── Check 2: ticker/code literal-branch ban ─────────────────────────────────
IDENT_ERE='(^|[^A-Za-z0-9_])(ticker|symbol|code|action_code)'
TICKER_BRANCH_ERE="${IDENT_ERE}[[:space:]]*={2,3}[[:space:]]*['\"]([A-Z]{2,5})['\"]"
DENYLIST_ERE='^(HOSE|HNX|UPCOM|BLOOMBERG)$'

check2_ticker_branch() {
  local fail=0

  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || continue
    grep -qE '(ticker|symbol|code|action_code)' "$f" 2>/dev/null || continue

    local ln=0 trimmed lit
    while IFS= read -r line; do
      ln=$((ln + 1))
      # Never scan comment-only lines as code.
      trimmed="${line#"${line%%[![:space:]]*}"}"
      case "$trimmed" in
        //*|\#*|\**) continue ;;
      esac
      if [[ "$line" =~ $TICKER_BRANCH_ERE ]]; then
        lit="${BASH_REMATCH[3]}"
        if [[ "$lit" =~ $DENYLIST_ERE ]]; then
          continue
        fi
        if has_suppression "$f" "$ln"; then
          continue
        fi
        echo "  [no-hardcode-allowlist-scan] TICKER-BRANCH: $f:$ln — literal-code comparison '${lit}' smuggled into a control-flow condition"
        fail=1
      fi
    done < "$f"
  done < <(list_files)

  return $fail
}

cmd_check() {
  local rc=0 r

  echo "[no-hardcode-allowlist-scan] Check 1/2 — temporal special-case combo..."
  check1_temporal_combo; r=$?; [ "$r" -ne 0 ] && rc=1

  echo "[no-hardcode-allowlist-scan] Check 2/2 — ticker/code literal-branch..."
  check2_ticker_branch; r=$?; [ "$r" -ne 0 ] && rc=1

  if [ "$rc" -ne 0 ]; then
    echo "[no-hardcode-allowlist-scan] FAIL"
    return 1
  fi
  echo "[no-hardcode-allowlist-scan] PASS — 0 offenders across both checks"
  return 0
}

MODE="${1:-}"
case "$MODE" in
  --check) cmd_check; exit $? ;;
  *) usage; exit 2 ;;
esac
