#!/usr/bin/env bash
# CANONICAL SCRIPT — corpus replay harness for the AC-2a notebook retained-
# section immutability gate (scripts/git-hooks/pre-commit
# _check_notebook_immutability / _is_dated_heading / _notebook_section_hashes).
#
# Owning task: FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS
# Pointer    : docs/policies/dev-standards.md § Script Persistence
#              .claude/skills/notebook-write/SKILL.md § IMMUTABILITY INVARIANT
#
# WHY: the first cut of this gate (2026-07-29) was validated on n=2 commits of
# ONE file (system-auditor.md) and generalized to a fleet-wide hard-reject —
# it then blocked most of the fleet's very next notebook commit (stable
# rolling headings like '## Current state' are DESIGNED to be rewritten every
# cycle and are not dated). This script closes that gap permanently: it
# sources the THREE real hashing/classification functions VERBATIM out of the
# live hook (never a reimplementation — a hand-rewritten hasher can silently
# drift from what actually gates commits) and replays them against the REAL
# commit history of every tracked docs/agent-memory/notebooks/*.md file, not
# a synthetic scratch repo. Read-only: only `git show` into mktemp scratch
# files, never stages/commits/mutates the live repo. Re-run this before
# trusting ANY future change to _check_notebook_immutability or
# _is_dated_heading.
#
# Reports two columns per file, over its last N commits (default 8):
#   FIXED_REJ    — reject count under the CURRENTLY DEPLOYED gate (dated-
#                  heading-scoped; this is what actually governs real commits)
#   BASELINE_REJ — reject count under the PRE-FIX gate (any shared-heading
#                  hash mismatch on any non-allowlisted file) — regression-
#                  evidence only, not live behavior.
#
# Usage:
#   bash scripts/audits/verify-notebook-immutability-gate.sh [--commits N] [--file <path>]
#
# Exit code is always 0 (report tool) — a FIXED_REJ > 0 line is flagged in
# the per-commit detail on stderr for manual eyeballing (a real reject is
# either a known true positive or needs review, this script cannot itself
# judge intent).

set -u
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  echo "[verify-notebook-immutability-gate] ERROR: not inside a git repo" >&2
  exit 1
fi
cd "$REPO_ROOT" || exit 1

HOOK="$REPO_ROOT/scripts/git-hooks/pre-commit"
if [ ! -f "$HOOK" ]; then
  echo "[verify-notebook-immutability-gate] ERROR: $HOOK not found" >&2
  exit 1
fi

command -v shasum >/dev/null 2>&1 || { echo "shasum required"; exit 1; }

N=8
ONLY_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --commits) N="$2"; shift 2 ;;
    --file) ONLY_FILE="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

WORK="$(mktemp -d "${TMPDIR:-/tmp}/verify-nb-immut.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

# --- source the EXACT live functions, verbatim, from the hook (AC-2a bar:
#     "your own hasher, not a reimplementation") -------------------------------
sed -n '/^_notebook_section_hashes()/,/^}/p' "$HOOK" > "$WORK/fn.sh"
sed -n '/^_is_dated_heading()/,/^}/p' "$HOOK" >> "$WORK/fn.sh"
# shellcheck disable=SC1090
source "$WORK/fn.sh"

OVERWRITE_FILES="docs/agent-memory/notebooks/po.md
docs/agent-memory/notebooks/market-watcher.md
docs/agent-memory/notebooks/orch-sentinel.md"

is_overwrite_file() {
  printf '%s\n' "$OVERWRITE_FILES" | grep -qxF "$1"
}

if [ -n "$ONLY_FILE" ]; then
  FILES="$ONLY_FILE"
else
  FILES="$(git ls-tree -r HEAD --name-only -- docs/agent-memory/notebooks/ | grep '\.md$' | sort)"
fi

total_commits_checked=0
total_new_rejects=0
total_old_rejects=0
total_multi_change_old=0
files_with_new_reject=0
files_with_old_reject=0
files_checked=0

printf '%-70s %8s %10s %13s\n' "FILE" "COMMITS" "FIXED_REJ" "BASELINE_REJ"

while IFS= read -r f; do
  [ -z "$f" ] && continue
  is_overwrite_file "$f" && continue   # OVERWRITE-class — hook skips these entirely, by name, up front

  files_checked=$((files_checked + 1))
  file_new_rejects=0
  file_old_rejects=0

  commits="$(git log --format=%H -n "$N" -- "$f" 2>/dev/null)"
  n_commits=0
  [ -n "$commits" ] && n_commits="$(printf '%s\n' "$commits" | grep -c .)"

  while IFS= read -r commit; do
    [ -z "$commit" ] && continue
    parent="$(git rev-parse "${commit}^" 2>/dev/null)" || continue
    [ -z "$parent" ] && continue   # root commit — nothing retained yet, hook skips too

    old_tmp="$WORK/old_$$_$RANDOM"
    new_tmp="$WORK/new_$$_$RANDOM"
    if ! git show "${parent}:${f}" > "$old_tmp" 2>/dev/null; then
      rm -f "$old_tmp" "$new_tmp"; continue   # new file at this commit — hook skips too
    fi
    if ! git show "${commit}:${f}" > "$new_tmp" 2>/dev/null; then
      rm -f "$old_tmp" "$new_tmp"; continue
    fi

    old_hashes="$(_notebook_section_hashes "$old_tmp")"
    if [ -z "$old_hashes" ]; then
      rm -f "$old_tmp" "$new_tmp"; continue   # no '## ' boundaries — hook fails open too
    fi
    new_hashes="$(_notebook_section_hashes "$new_tmp")"
    total_commits_checked=$((total_commits_checked + 1))

    changed_shared_dated=0
    changed_shared_any=0
    while IFS=$'\t' read -r heading old_hash; do
      [ -z "$heading" ] && continue
      new_hash="$(printf '%s\n' "$new_hashes" | awk -F'\t' -v h="$heading" '$1==h{print $2; exit}')"
      [ -z "$new_hash" ] && continue
      [ "$new_hash" = "$old_hash" ] && continue
      changed_shared_any=$((changed_shared_any + 1))
      if _is_dated_heading "$heading"; then
        changed_shared_dated=$((changed_shared_dated + 1))
      fi
    done <<OLDHASHES
$old_hashes
OLDHASHES

    if [ "$changed_shared_dated" -gt 0 ]; then
      file_new_rejects=$((file_new_rejects + 1))
      total_new_rejects=$((total_new_rejects + 1))
      echo "  [FIXED-GATE REJECT] $f @ ${commit:0:12} — $changed_shared_dated dated heading(s) with changed body hash" >&2
    fi
    if [ "$changed_shared_any" -gt 0 ]; then
      file_old_rejects=$((file_old_rejects + 1))
      total_old_rejects=$((total_old_rejects + 1))
      [ "$changed_shared_any" -ge 2 ] && total_multi_change_old=$((total_multi_change_old + 1))
    fi

    rm -f "$old_tmp" "$new_tmp"
  done <<COMMITS
$commits
COMMITS

  printf '%-70s %8s %10s %13s\n' "$f" "$n_commits" "$file_new_rejects" "$file_old_rejects"
  [ "$file_new_rejects" -gt 0 ] && files_with_new_reject=$((files_with_new_reject + 1))
  [ "$file_old_rejects" -gt 0 ] && files_with_old_reject=$((files_with_old_reject + 1))
done <<FILES
$FILES
FILES

echo
echo "================================================================"
echo "SUMMARY (last $N commits/file requested, $files_checked non-OVERWRITE files scanned, $total_commits_checked commit-diffs actually compared)"
echo "  DATED-HEADING-SCOPED (current hashing/classification logic; gate itself"
echo "  is DISARMED to warn-by-default in scripts/git-hooks/pre-commit until this"
echo "  column reads 0): $total_new_rejects reject(s) across $files_with_new_reject file(s)"
echo "  BASELINE (pre-fix, opt-out-3-files-only, no date scoping): $total_old_rejects reject(s) across $files_with_old_reject file(s), of which $total_multi_change_old commit(s) changed >=2 shared sections at once"
echo "================================================================"
echo "A non-zero DATED-HEADING-SCOPED count is NOT automatically a real bug — it"
echo "may be a genuine retained-content violation (keep it a WARN/REJECT), OR one"
echo "of the two known-unclosed false-positive classes (see scripts/git-hooks/"
echo "pre-commit _check_notebook_immutability header comment 'DISARMED-BY-"
echo "DEFAULT'): an un-headed rolling footer bleeding into the last dated heading,"
echo "or a bulk archival/maintenance restructuring commit. Inspect each with:"
echo "  git show <parent>:<file> vs git show <commit>:<file>"
echo "before re-arming GIT_NOTEBOOK_IMMUTABILITY_MODE=reject fleet-wide."
exit 0
