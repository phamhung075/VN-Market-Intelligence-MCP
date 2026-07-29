#!/usr/bin/env bash
# scripts/audits/size-lint-justification.sh — FACTORY-GUARD-CI-SIZELINT-IMPL
#
# CI-time source-code size-lint guardrail. Closes the gap identified in
# docs/architecture-briefs/2026-07-24-factory-guard-ci-size-lint-justification.md:
# scripts/agents-flow/context-bloat-backstop.sh (PostToolUse hook, session-time)
# explicitly does NOT govern code — "Code and data JSON are explicitly NOT
# governed" (docs/data/file-size-caps.json _note). This script is the
# code-plane sibling: a full-tree CI-time (not diff-only, not hook-time) scan
# so non-Claude-tool writes (bash heredoc, git apply, etc.) can't bypass it.
#
# Baseline/ratchet design (NOT a blanket hard-fail — see brief §2):
#   - File <=120L, OR carries a CURRENT size-justification header -> PASS.
#   - File >120L, unjustified, but its path+line-count is grandfathered in
#     docs/data/size-lint-baseline.json AND still within tolerance -> PASS
#     (untouched historical debt).
#   - File >120L, in baseline, but grown past tolerance -> FAIL (a touched
#     grandfathered file got worse — the regrowth case this gate exists for).
#   - File >120L, unjustified, NOT in baseline -> FAIL (new offender, zero
#     tolerance — the core regression gate).
#
# Justification marker (same repo-wide `size-justification:` keyword the
# doc-plane hook already uses — must appear in the first 10 lines):
#   .ts / .go : // size-justification: <NNL — reason>
#   .py       : #  size-justification: <NNL — reason>
# Tolerance on a declared header (and on a baseline entry): +/-10%, min 5L —
# mirrors scripts/agents-flow/context-bloat-backstop.sh's own idiom exactly.
#
# Scanned set: apps/**/*.ts|*.py|*.go + packages/**/*.ts (git-tracked +
# untracked-but-not-gitignored, via `git ls-files --cached --others
# --exclude-standard`), excluding __tests__/ , tests/ , *.test.ts, *_test.go,
# test_*.py, *.d.ts, node_modules/, dist/, .venv/, PDF-Extract-Kit/, vendor/.
#
# Usage:
#   bash scripts/audits/size-lint-justification.sh --check    # CI mode: exit 0 pass / 1 fail, no writes
#   bash scripts/audits/size-lint-justification.sh --update   # regenerate docs/data/size-lint-baseline.json
#                                                               #   from live repo state (run manually after
#                                                               #   splitting/justifying a file — prune-eligible
#                                                               #   entries drop out automatically)
#
# Env overrides (test-only; unset in normal/CI use):
#   SIZE_LINT_BASELINE_OVERRIDE   default: $PROJECT_ROOT/docs/data/size-lint-baseline.json
#   SIZE_LINT_INCLUDE_OVERRIDE    default: 'apps/**/*.ts' 'apps/**/*.py' 'apps/**/*.go' 'packages/**/*.ts'
#                                 (space-separated git pathspecs — lets tests scope the scan to a
#                                 disposable untracked fixture subtree instead of the whole repo)
#
# Owning flow: docs/policies/dev-standards.md § Script Persistence
# Detail ref: docs/architecture-briefs/2026-07-24-factory-guard-ci-size-lint-justification.md
set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "[size-lint] ERROR cannot resolve PROJECT_ROOT"; exit 2; }
cd "$PROJECT_ROOT" || exit 2

command -v jq >/dev/null 2>&1 || { echo "[size-lint] ERROR jq not found on PATH"; exit 2; }

THRESHOLD=120
BASELINE_FILE="${SIZE_LINT_BASELINE_OVERRIDE:-$PROJECT_ROOT/docs/data/size-lint-baseline.json}"

if [ -n "${SIZE_LINT_INCLUDE_OVERRIDE:-}" ]; then
  # shellcheck disable=SC2206
  INCLUDE_PATHSPECS=($SIZE_LINT_INCLUDE_OVERRIDE)
else
  INCLUDE_PATHSPECS=('apps/**/*.ts' 'apps/**/*.py' 'apps/**/*.go' 'packages/**/*.ts')
fi

EXCLUDE_PATTERN='(^|/)(__tests__|tests)(/|$)|\.test\.ts$|_test\.go$|(^|/)test_[^/]*\.py$|\.d\.ts$|node_modules/|/dist/|\.venv/|PDF-Extract-Kit/|/vendor/'

usage() {
  echo "Usage: $0 --check | --update"
}

list_files() {
  git ls-files --cached --others --exclude-standard -- "${INCLUDE_PATHSPECS[@]}" 2>/dev/null \
    | grep -vE "$EXCLUDE_PATTERN" || true
}

# Sets IS_JUSTIFIED_NOW=1 if $1 (path, already known >THRESHOLD at $2 lines)
# carries a CURRENT (tolerance-valid) size-justification header; else 0.
is_justified_now() {
  IS_JUSTIFIED_NOW=0
  local f="$1" lc="$2" header declared tol upper
  header="$(head -10 "$f" 2>/dev/null | grep -E 'size-justification:' | head -1 || true)"
  [ -z "$header" ] && return 0
  # NOTE: live headers commonly declare an APPROXIMATE count ("~180L") not
  # just a bare number ("180L") — tilde is optional in the regex below.
  declared="$(printf '%s' "$header" | grep -oE 'size-justification:[[:space:]]*~?[0-9]+' | grep -oE '[0-9]+$' | head -1 || true)"
  [ -z "$declared" ] && return 0
  tol=$((declared / 10)); [ "$tol" -lt 5 ] && tol=5
  upper=$((declared + tol))
  if [ "$lc" -le "$upper" ] 2>/dev/null; then
    IS_JUSTIFIED_NOW=1
  fi
  return 0
}

cmd_check() {
  local baseline_tsv total=0 fail_count=0 fail_list=""
  baseline_tsv="$(mktemp 2>/dev/null || echo "/tmp/size-lint-baseline-$$.tsv")"
  trap 'rm -f "$baseline_tsv"' RETURN
  if [ -f "$BASELINE_FILE" ]; then
    jq -r '.entries // {} | to_entries[] | "\(.key)\t\(.value)"' "$BASELINE_FILE" > "$baseline_tsv" 2>/dev/null
  else
    : > "$baseline_tsv"
  fi

  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || continue
    total=$((total + 1))
    lc="$(wc -l < "$f" 2>/dev/null | tr -d ' ')"
    [ -z "$lc" ] && continue
    [ "$lc" -le "$THRESHOLD" ] 2>/dev/null && continue

    is_justified_now "$f" "$lc"
    [ "$IS_JUSTIFIED_NOW" -eq 1 ] && continue

    baseline_lc="$(awk -F'\t' -v p="$f" '$1==p{print $2; exit}' "$baseline_tsv" 2>/dev/null || true)"
    if [ -n "$baseline_lc" ]; then
      btol=$((baseline_lc / 10)); [ "$btol" -lt 5 ] && btol=5
      bupper=$((baseline_lc + btol))
      if [ "$lc" -le "$bupper" ] 2>/dev/null; then
        continue
      fi
      fail_count=$((fail_count + 1))
      fail_list="${fail_list}${f} — baseline-tolerance-exceeded (baseline=${baseline_lc}L actual=${lc}L upper=${bupper}L)\n"
    else
      fail_count=$((fail_count + 1))
      fail_list="${fail_list}${f} — new-offender (${lc}L > ${THRESHOLD}L, no baseline entry, no current justification header)\n"
    fi
  done < <(list_files)

  if [ "$fail_count" -gt 0 ]; then
    echo "[size-lint] FAIL — ${fail_count} offending file(s) (scanned ${total}):"
    printf '%b' "$fail_list"
    return 1
  fi
  echo "[size-lint] PASS — 0 unjustified offenders (scanned ${total} files, threshold=${THRESHOLD}L)"
  return 0
}

cmd_update() {
  local ts tsv entries_json old_count new_count
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  tsv="$(mktemp 2>/dev/null || echo "/tmp/size-lint-update-$$.tsv")"
  trap 'rm -f "$tsv"' RETURN
  : > "$tsv"

  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || continue
    lc="$(wc -l < "$f" 2>/dev/null | tr -d ' ')"
    [ -z "$lc" ] && continue
    [ "$lc" -le "$THRESHOLD" ] 2>/dev/null && continue
    is_justified_now "$f" "$lc"
    [ "$IS_JUSTIFIED_NOW" -eq 1 ] && continue
    printf '%s\t%s\n' "$f" "$lc" >> "$tsv"
  done < <(list_files)

  new_count="$(wc -l < "$tsv" | tr -d ' ')"
  old_count="0"
  [ -f "$BASELINE_FILE" ] && old_count="$(jq -r '.count // 0' "$BASELINE_FILE" 2>/dev/null || echo 0)"

  entries_json="$(jq -R -n '[inputs | select(length>0) | split("\t") | {(.[0]): (.[1] | tonumber)}] | add // {}' < "$tsv")"

  jq -n \
    --arg ssot "docs/data/size-lint-baseline.json" \
    --arg generated_at "$ts" \
    --arg generated_by "scripts/audits/size-lint-justification.sh --update" \
    --argjson threshold "$THRESHOLD" \
    --argjson count "$new_count" \
    --argjson entries "$entries_json" \
    '{
      _ssot: $ssot,
      _note: "Per-file grandfather baseline for scripts/audits/size-lint-justification.sh --check. Snapshots every currently-over-cap-without-justification apps/**|packages/** source file at --update time. Entries drop automatically on the next --update once a file shrinks under threshold or gains a current size-justification header. Regenerated wholesale each --update (not merged) — see docs/architecture-briefs/2026-07-24-factory-guard-ci-size-lint-justification.md.",
      _generated_by: $generated_by,
      generated_at: $generated_at,
      threshold: $threshold,
      tolerance_note: "+/-10% or min 5L per-file tolerance on both header-declared and baseline line counts — mirrors scripts/agents-flow/context-bloat-backstop.sh.",
      count: $count,
      entries: $entries
    }' | jq -S . > "${BASELINE_FILE}.tmp" && mv "${BASELINE_FILE}.tmp" "$BASELINE_FILE"

  echo "[size-lint] --update WROTE ${BASELINE_FILE} (offenders: ${old_count} -> ${new_count})"
  return 0
}

MODE="${1:-}"
case "$MODE" in
  --check) cmd_check; exit $? ;;
  --update) cmd_update; exit $? ;;
  *) usage; exit 2 ;;
esac
