#!/usr/bin/env bash
# CANONICAL SCRIPT — corpus replay harness for the FIX-AGENT-NOTEBOOK-UUID-
# PROVENANCE heading-line guard (scripts/git-hooks/pre-commit
# _check_notebook_uuid_provenance / _notebook_uuid_line_verdict).
#
# Owning task: FIX-AGENT-NOTEBOOK-UUID-PROVENANCE
# Pointer    : docs/architecture-briefs/2026-08-05-fix-agent-notebook-uuid-provenance-guard.md
#              .claude/skills/notebook-write/SKILL.md § AC-1
#
# WHY: the sibling notebook-immutability gate's own history (2026-07-29) is
# the reason this script exists at all — a hard-reject gate that was
# validated on n=2 commits of ONE file blocked most of the fleet's very next
# notebook commit. This script closes that risk BEFORE anyone flips
# GIT_NOTEBOOK_UUID_PROVENANCE_MODE=reject: it sources
# _notebook_uuid_line_verdict VERBATIM out of the live hook (never a
# reimplementation — a hand-rewritten classifier can silently drift from what
# actually gates commits) and replays it against the REAL commit history of
# every tracked docs/agent-memory/notebooks/*.md file, not a synthetic
# scratch repo. Read-only: only `git show`/`git diff` against real refs,
# never stages/commits/mutates the live repo.
#
# Reports, per file, over its last N commits (default 8):
#   RULE1_HITS — full-UUID-on-heading-line hits among ADDED lines
#   RULE2_HITS — bare-6-8-hex-first-token hits among ADDED lines (WARN-only,
#                never gates in the live hook regardless of mode — reported
#                here purely for visibility/triage)
#
# Usage:
#   bash scripts/audits/verify-notebook-uuid-provenance-gate.sh [--commits N] [--file <path>] [--all-history]
#
# --all-history replays EVERY commit ever touching the matched file(s)
# instead of just the last N — slow (thousands of commits fleet-wide), use
# --file to scope it when combined with --all-history.
#
# Exit code is always 0 (report tool) — a RULE1_HITS > 0 line is flagged in
# the per-commit detail on stderr for manual eyeballing (a real hit is either
# a genuine violation worth fixing forward, or a documented false-positive
# class like tran-ngoc-bau.md's collision-note forensic prose — this script
# cannot itself judge intent, a human/agent must read the commit).

set -u
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  echo "[verify-notebook-uuid-provenance-gate] ERROR: not inside a git repo" >&2
  exit 1
fi
cd "$REPO_ROOT" || exit 1

HOOK="$REPO_ROOT/scripts/git-hooks/pre-commit"
if [ ! -f "$HOOK" ]; then
  echo "[verify-notebook-uuid-provenance-gate] ERROR: $HOOK not found" >&2
  exit 1
fi

N=8
ONLY_FILE=""
ALL_HISTORY=false
while [ $# -gt 0 ]; do
  case "$1" in
    --commits) N="$2"; shift 2 ;;
    --file) ONLY_FILE="$2"; shift 2 ;;
    --all-history) ALL_HISTORY=true; shift 1 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

WORK="$(mktemp -d "${TMPDIR:-/tmp}/verify-nb-uuid.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

# --- source the EXACT live classifier, verbatim, from the hook -------------
sed -n '/^_notebook_uuid_line_verdict()/,/^}/p' "$HOOK" > "$WORK/fn.sh"
# shellcheck disable=SC1090
source "$WORK/fn.sh"

if [ -n "$ONLY_FILE" ]; then
  FILES="$ONLY_FILE"
else
  FILES="$(git ls-tree -r HEAD --name-only -- docs/agent-memory/notebooks/ | grep '\.md$' | sort)"
fi

total_commits_checked=0
total_rule1_hits=0
total_rule2_hits=0
files_with_rule1=0
files_with_rule2=0
files_checked=0

printf '%-70s %8s %11s %11s\n' "FILE" "COMMITS" "RULE1_HITS" "RULE2_HITS"

while IFS= read -r f; do
  [ -z "$f" ] && continue
  files_checked=$((files_checked + 1))
  file_rule1=0
  file_rule2=0

  if [ "$ALL_HISTORY" = true ]; then
    commits="$(git log --format=%H -- "$f" 2>/dev/null)"
  else
    commits="$(git log --format=%H -n "$N" -- "$f" 2>/dev/null)"
  fi
  n_commits=0
  [ -n "$commits" ] && n_commits="$(printf '%s\n' "$commits" | grep -c .)"

  while IFS= read -r commit; do
    [ -z "$commit" ] && continue
    parent="$(git rev-parse "${commit}^" 2>/dev/null)" || continue
    [ -z "$parent" ] && continue   # root commit — nothing to diff against

    added="$(git diff "$parent" "$commit" -- "$f" 2>/dev/null | grep -E '^\+## ')"
    [ -z "$added" ] && continue
    total_commits_checked=$((total_commits_checked + 1))

    while IFS= read -r raw; do
      [ -z "$raw" ] && continue
      line="${raw#+}"
      verdict="$(_notebook_uuid_line_verdict "$line")"
      [ -z "$verdict" ] && continue
      rule="${verdict%%$'\t'*}"
      payload="${verdict#*$'\t'}"
      if [ "$rule" = "RULE1" ]; then
        file_rule1=$((file_rule1 + 1))
        total_rule1_hits=$((total_rule1_hits + 1))
        echo "  [RULE1-FULLUUID] $f @ ${commit:0:12} — $payload" >&2
      else
        file_rule2=$((file_rule2 + 1))
        total_rule2_hits=$((total_rule2_hits + 1))
        echo "  [RULE2-BAREHEX]  $f @ ${commit:0:12} — token=$payload line=$line" >&2
      fi
    done <<ADDED
$added
ADDED
  done <<COMMITS
$commits
COMMITS

  printf '%-70s %8s %11s %11s\n' "$f" "$n_commits" "$file_rule1" "$file_rule2"
  [ "$file_rule1" -gt 0 ] && files_with_rule1=$((files_with_rule1 + 1))
  [ "$file_rule2" -gt 0 ] && files_with_rule2=$((files_with_rule2 + 1))
done <<FILES
$FILES
FILES

echo
echo "================================================================"
echo "SUMMARY ($([ "$ALL_HISTORY" = true ] && echo "FULL HISTORY" || echo "last $N commits/file"), $files_checked file(s) scanned, $total_commits_checked commit-diff(s) with >=1 added heading line)"
echo "  RULE1 (full UUID on heading line, hard-enforceable via mode=reject): $total_rule1_hits hit(s) across $files_with_rule1 file(s)"
echo "  RULE2 (bare 6-8 hex first-token, WARN-only always):                 $total_rule2_hits hit(s) across $files_with_rule2 file(s)"
echo "================================================================"
echo "A RULE1 hit is NOT automatically a bug to re-litigate — it may be a"
echo "genuine forbidden leak (fix forward, do not rewrite history), or a"
echo "documented exception (e.g. tran-ngoc-bau.md's collision-note forensic"
echo "prose, which intentionally records a peer session id for incident"
echo "recovery — see scripts/git-hooks/pre-commit _check_notebook_uuid_provenance"
echo "header comment). Inspect each RULE1 hit before flipping"
echo "GIT_NOTEBOOK_UUID_PROVENANCE_MODE=reject fleet-wide."
exit 0
