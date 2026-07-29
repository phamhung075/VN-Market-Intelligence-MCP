#!/usr/bin/env bash
# scripts/audits/metric-mask-lint.sh — FACTORY-GUARD-CI-METRICMASK-IMPL
#
# CI-time "metric-mask" guardrail. Closes the gap identified in
# docs/architecture-briefs/2026-07-24-factory-guard-ci-metric-mask-lint.md:
# no lint anywhere in the repo (eslint/golangci/ruff) catches a silent
# `?? <non-zero-literal>` (or `||`, Python `or`, destructuring/param default)
# fallback on a field NAMED confidence/score/impact/magnitude/probability —
# the "confidence_score=50" fabrication bug class. Such a fallback silently
# manufactures a plausible-looking measured value in place of an honestly
# propagated absence, and downstream code then treats the fabricated number
# as real evidence.
#
# Design (zero-tolerance, NOT baseline/ratchet — deviation from the
# scripts/audits/size-lint-justification.sh sibling, see brief §2): live debt
# at design time was 4 lines in 2 files, small enough to fix in the same
# child task that ships the gate — so the gate opens at zero offenders and
# stays true zero-tolerance (no baseline manifest, no per-file tolerance
# drift to track).
#
# Detected shapes (case-insensitive on the identifier; identifier must match
# /confidence|score|impact|magnitude|probability/i):
#   1. `<ident> ?? <literal>`   / `<ident> || <literal>`   (TS/JS)
#   2. `<ident> or <literal>`                              (Python)
#   3. `<ident> = <literal>` immediately followed by `,` `)` or `}`
#      (destructuring default `{ confidence = 50 }` / param default
#      `function f(score = 7)` / `def f(confidence=50):`)
#
# Always-allowed literals (the honest-absence idiom already established by
# the 5 fast-track fixes referenced in the brief — NOT a mask):
#   `0`, `0.0`, `0.00`, ... (any numeric literal that is exactly zero) and
#   `null` / `undefined` (never numeric, so never matches a shape above at all).
#
# Escape hatch (mirrors size-lint's `size-justification:` convention): an
# inline `metric-mask-allow: <reason>` comment on the SAME line as the match,
# or on the line immediately preceding it, suppresses that one match — for a
# genuine non-fabricated config default (e.g. a user-configurable alert
# threshold) that just happens to lexically match the pattern.
#
# Scanned set: apps/**/*.ts|*.py|*.go + packages/**/*.ts (git-tracked +
# untracked-but-not-gitignored, via `git ls-files --cached --others
# --exclude-standard`), excluding __tests__/ , tests/ , *.test.ts, *_test.go,
# test_*.py, *.d.ts, node_modules/, dist/, .venv/, PDF-Extract-Kit/, vendor/.
#
# Usage:
#   bash scripts/audits/metric-mask-lint.sh --check    # CI mode: exit 0 pass / 1 fail, no writes
#
# Env overrides (test-only; unset in normal/CI use):
#   METRIC_MASK_LINT_INCLUDE_OVERRIDE   space-separated git pathspecs — lets
#     tests scope the scan to a disposable untracked fixture subtree instead
#     of the whole repo (mirrors size-lint's *_INCLUDE_OVERRIDE idiom).
#
# Owning flow: docs/policies/dev-standards.md § Script Persistence
# Detail ref: docs/architecture-briefs/2026-07-24-factory-guard-ci-metric-mask-lint.md
#
# shellcheck disable=SC2094 # every `$f`/`$file` use below is READ-ONLY (sed -n /
# grep / the line-loop's own `< "$f"`) — this script never writes a scanned file.
set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "[metric-mask-lint] ERROR cannot resolve PROJECT_ROOT"; exit 2; }
cd "$PROJECT_ROOT" || exit 2

if [ -n "${METRIC_MASK_LINT_INCLUDE_OVERRIDE:-}" ]; then
  # shellcheck disable=SC2206
  INCLUDE_PATHSPECS=($METRIC_MASK_LINT_INCLUDE_OVERRIDE)
else
  INCLUDE_PATHSPECS=('apps/**/*.ts' 'apps/**/*.py' 'apps/**/*.go' 'packages/**/*.ts')
fi

EXCLUDE_PATTERN='(^|/)(__tests__|tests)(/|$)|\.test\.ts$|_test\.go$|(^|/)test_[^/]*\.py$|\.d\.ts$|node_modules/|/dist/|\.venv/|PDF-Extract-Kit/|/vendor/'

usage() {
  echo "Usage: $0 --check"
}

list_files() {
  git ls-files --cached --others --exclude-standard -- "${INCLUDE_PATHSPECS[@]}" 2>/dev/null \
    | grep -vE "$EXCLUDE_PATTERN" || true
}

# ── Regex shapes ─────────────────────────────────────────────────────────
IDENT_ERE='(confidence|score|impact|magnitude|probability)[A-Za-z0-9_]*'
NUM_ERE='-?[0-9]+(\.[0-9]+)?'
RE_NULLISH_OR="${IDENT_ERE}[[:space:]]*(\?\?|\|\|)[[:space:]]*(${NUM_ERE})"
RE_PY_OR="${IDENT_ERE}[[:space:]]+or[[:space:]]+(${NUM_ERE})"
RE_DEFAULT="${IDENT_ERE}[[:space:]]*=[[:space:]]*(${NUM_ERE})[[:space:]]*[,)}]"

# is_zero_literal <literal> — return 0 (true, shell success) iff literal == 0 numerically.
is_zero_literal() {
  awk -v n="$1" 'BEGIN { exit (n + 0 == 0) ? 0 : 1 }' 2>/dev/null
}

# line_offense_reason <line> — sets OFFENSE_REASON to a non-empty string and
# returns 0 if the line contains a non-zero-literal mask shape; else sets
# OFFENSE_REASON="" and returns 1.
line_offense_reason() {
  local line="$1" lit
  shopt -s nocasematch
  if [[ "$line" =~ $RE_NULLISH_OR ]]; then
    lit="${BASH_REMATCH[3]}"
    if [ -n "$lit" ] && ! is_zero_literal "$lit"; then
      OFFENSE_REASON="nullish/or-fallback (?? or ||) on a non-zero literal '${lit}'"
      shopt -u nocasematch
      return 0
    fi
  fi
  if [[ "$line" =~ $RE_PY_OR ]]; then
    lit="${BASH_REMATCH[2]}"
    if [ -n "$lit" ] && ! is_zero_literal "$lit"; then
      OFFENSE_REASON="python 'or' fallback on a non-zero literal '${lit}'"
      shopt -u nocasematch
      return 0
    fi
  fi
  if [[ "$line" =~ $RE_DEFAULT ]]; then
    lit="${BASH_REMATCH[2]}"
    if [ -n "$lit" ] && ! is_zero_literal "$lit"; then
      OFFENSE_REASON="destructuring/param default on a non-zero literal '${lit}'"
      shopt -u nocasematch
      return 0
    fi
  fi
  shopt -u nocasematch
  OFFENSE_REASON=""
  return 1
}

# has_suppression <file> <lineno> — 0 (true) iff the SAME line or the
# immediately PRECEDING line carries a `metric-mask-allow:` comment.
has_suppression() {
  local f="$1" ln="$2" prev
  sed -n "${ln}p" "$f" 2>/dev/null | grep -q 'metric-mask-allow:' && return 0
  prev=$((ln - 1))
  if [ "$prev" -ge 1 ]; then
    sed -n "${prev}p" "$f" 2>/dev/null | grep -q 'metric-mask-allow:' && return 0
  fi
  return 1
}

cmd_check() {
  local total=0 fail_count=0 fail_list="" ln reason

  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || continue
    # Cheap pre-filter: skip files with no keyword mention at all.
    grep -qiE 'confidence|score|impact|magnitude|probability' "$f" 2>/dev/null || continue
    total=$((total + 1))

    ln=0
    while IFS= read -r line; do
      ln=$((ln + 1))
      # Never scan comment-only lines as code — a keyword mentioned in prose
      # (`// score = 8` explaining a formula, a JSDoc example) is not a mask.
      trimmed="${line#"${line%%[![:space:]]*}"}"
      case "$trimmed" in
        //*|\#*|\**) continue ;;
      esac
      if line_offense_reason "$line"; then
        reason="$OFFENSE_REASON"
        if has_suppression "$f" "$ln"; then
          continue
        fi
        fail_count=$((fail_count + 1))
        fail_list="${fail_list}${f}:${ln} — ${reason}\n"
      fi
    done < "$f"
  done < <(list_files)

  if [ "$fail_count" -gt 0 ]; then
    echo "[metric-mask-lint] FAIL — ${fail_count} offending line(s) (scanned ${total} keyword-bearing file(s)):"
    printf '%b' "$fail_list"
    return 1
  fi
  echo "[metric-mask-lint] PASS — 0 unjustified metric masks (scanned ${total} keyword-bearing file(s))"
  return 0
}

MODE="${1:-}"
case "$MODE" in
  --check) cmd_check; exit $? ;;
  *) usage; exit 2 ;;
esac
