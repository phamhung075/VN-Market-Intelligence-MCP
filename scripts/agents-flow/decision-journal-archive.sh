#!/usr/bin/env bash
# scripts/agents-flow/decision-journal-archive.sh — UC-MDH-P4 (memory-docs-hygiene-P4)
#
# Implements the archival step promised (but never built) for pm's task-archive flow:
# moves sprint decision-journal files (docs/agent-memory/decisions/sprint-*.md) whose
# sprint has CLOSED into docs/archive/decisions/. File-ops-only — this script NEVER
# writes docs/data/orch/orch-state.json (jq reads only; no orch-apply.sh needed).
#
# Selection is STATUS-based (closed sprint id vs still-active), NOT mtime-based — an
# earlier backlog row (TE-T33) proposed a generic >30d mtime rotation for decisions/;
# that would incorrectly move journals of sprints that are still open past 30 days.
# This script is the superseding mechanism for the decisions/ leg of TE-T33.
#
# Two modes:
#   stdin mode (default): reads candidate sprint ids, one per line, from stdin.
#     Intended caller: docs/agents/pm/flow/task-archive.md Step 5.5 — pipes the
#     diff of active_sprints ids (before both eviction paths vs after) so only
#     sprints that JUST closed this cycle are considered.
#   --all mode: backfill — derives the full closed-id set from the cold archive
#     (docs/data/orch/archive/*.json: .closed_sprints[].id, .closed_sprint_goals
#     sprint ids, .done_tasks[].sprint) plus the hot file's
#     .task_board.closed_sprints[].id, and processes every eligible journal file
#     in one pass. Run this once for the historical backfill.
#
# LONGEST-MATCH derivation (mandatory — do not bare-prefix-glob):
#   A closed sprint id like "OHLCV-UNIT-CONTAM" is a literal string-prefix of the
#   ACTIVE sprint id "OHLCV-UNIT-CONTAM-WHOLEROW-LT1000" (both exist live in this
#   repo). For each candidate file, this script strips the "sprint-" prefix and
#   ".md" suffix, then finds the LONGEST id in the full known-id universe (closed
#   UNION active) such that the remainder equals the id exactly (bare
#   sprint-<id>.md form) or starts with "<id>-" (agent-suffixed
#   sprint-<id>-<agent>.md form, also covers legacy "-2" journal-cap-rollover
#   files). Only after the longest match is resolved do we check whether THAT id
#   is closed-and-in-scope. This is what correctly keeps
#   sprint-OHLCV-UNIT-CONTAM-WHOLEROW-LT1000-qa.md in place (matches the longer,
#   still-active id) while archiving sprint-OHLCV-UNIT-CONTAM-qa.md (matches the
#   shorter, closed id).
#
# Any candidate file whose derived id matches NOTHING in the known-id universe
# (no orch record at all) is left in place and counted in the SUMMARY line for a
# follow-up PO disposition — this script never guess-moves.
#
# Idempotent + re-runnable: files already present at the destination are skipped
# (SKIP-EXISTS), never overwritten; a second run with the same inputs finds
# nothing left to move and no-ops cleanly.
#
# Env overrides (all optional; used by the paired test script to sandbox a fixture
# tree without touching the live repo):
#   ORCH_STATE             default: $REPO_ROOT/docs/data/orch/orch-state.json
#   ORCH_ARCHIVE_DIR       default: $REPO_ROOT/docs/data/orch/archive
#   DECISIONS_DIR          default: $REPO_ROOT/docs/agent-memory/decisions
#   ARCHIVE_DECISIONS_DIR  default: $REPO_ROOT/docs/archive/decisions
#   DJA_GIT_MV             default: 1 — use `git mv` when inside a git work tree
#                           (preserves rename history); set 0 to force plain `mv`
#                           (required by the sandboxed test — fixture tree is not
#                           part of this repo's git index).
#
# Usage:
#   printf '%s\n' SPRINT-ID-1 SPRINT-ID-2 | scripts/agents-flow/decision-journal-archive.sh
#   scripts/agents-flow/decision-journal-archive.sh --all
#   scripts/agents-flow/decision-journal-archive.sh --all --dry-run   # preview counts only, no mv
#
# Exit: 0 on a completed scan (including zero-eligible no-op); 1 only on setup/
# config errors (missing orch-state.json or decisions dir) — per-file mv failures
# are logged (ERROR-MOVE-FAILED) but never abort the remaining scan.
#
# Owning flow: docs/agents/pm/flow/task-archive.md § Step 5.5
# Policy SSOT: docs/policies/dev-standards.md § Script Persistence
# Detail ref:  docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#memory-docs-hygiene-P4
#
# Shell: bash 3.2+ (macOS system /bin/bash) — no mapfile, no associative arrays,
# no namerefs; longest-match resolved via a small per-file awk pass over the
# known-id file (comm/sort convention matches scripts/agents-flow/memory-prune-sweep.sh).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ORCH_STATE="${ORCH_STATE:-$REPO_ROOT/docs/data/orch/orch-state.json}"
ORCH_ARCHIVE_DIR="${ORCH_ARCHIVE_DIR:-$REPO_ROOT/docs/data/orch/archive}"
DECISIONS_DIR="${DECISIONS_DIR:-$REPO_ROOT/docs/agent-memory/decisions}"
ARCHIVE_DECISIONS_DIR="${ARCHIVE_DECISIONS_DIR:-$REPO_ROOT/docs/archive/decisions}"
DJA_GIT_MV="${DJA_GIT_MV:-1}"

MODE="stdin"
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --all) MODE="all" ;;
    --dry-run) DRY_RUN=1 ;;
  esac
done

if [ ! -f "$ORCH_STATE" ]; then
  echo "[decision-journal-archive] ERROR: orch-state not found at $ORCH_STATE" >&2
  exit 1
fi
if [ ! -d "$DECISIONS_DIR" ]; then
  echo "[decision-journal-archive] ERROR: decisions dir not found at $DECISIONS_DIR" >&2
  exit 1
fi
if [ "$MODE" = "stdin" ] && [ -t 0 ]; then
  echo "[decision-journal-archive] USAGE: pipe sprint ids on stdin (one per line), or pass --all for backfill" >&2
  exit 1
fi

ACTIVE_IDS_FILE="$(mktemp)"
CLOSED_IDS_FILE="$(mktemp)"
STDIN_IDS_FILE="$(mktemp)"
KNOWN_IDS_FILE="$(mktemp)"
PROCESS_IDS_FILE="$(mktemp)"
trap 'rm -f "$ACTIVE_IDS_FILE" "$CLOSED_IDS_FILE" "$STDIN_IDS_FILE" "$KNOWN_IDS_FILE" "$PROCESS_IDS_FILE"' EXIT

# --- Known-id universe: active (hot) ---
jq -r '.task_board.active_sprints[]? | select(.id != null) | .id' "$ORCH_STATE" 2>/dev/null \
  | sed '/^$/d' | sort -u > "$ACTIVE_IDS_FILE"

# --- Known-id universe: closed (hot stub + cold archive) ---
jq -r '.task_board.closed_sprints[]? | select(.id != null) | .id' "$ORCH_STATE" 2>/dev/null \
  | sed '/^$/d' > "$CLOSED_IDS_FILE"

if [ -d "$ORCH_ARCHIVE_DIR" ]; then
  while IFS= read -r -d '' f; do
    jq -r '.closed_sprints[]? | select(.id != null) | .id' "$f" 2>/dev/null >> "$CLOSED_IDS_FILE"
    jq -r '(.closed_sprint_goals // []) | if type == "array" then (.[] | .sprint_id // empty) else (keys[]?) end' "$f" 2>/dev/null >> "$CLOSED_IDS_FILE"
    jq -r '[.done_tasks[]? | .sprint] | unique[]? // empty' "$f" 2>/dev/null >> "$CLOSED_IDS_FILE"
  done < <(find "$ORCH_ARCHIVE_DIR" -maxdepth 1 -type f -name "*.json" -print0 2>/dev/null)
fi
sed -i.bak '/^$/d;/^null$/d' "$CLOSED_IDS_FILE" 2>/dev/null; rm -f "${CLOSED_IDS_FILE}.bak"
sort -u -o "$CLOSED_IDS_FILE" "$CLOSED_IDS_FILE"

# --- Determine PROCESS_IDS (what we're actually allowed to move this run) ---
if [ "$MODE" = "all" ]; then
  comm -23 "$CLOSED_IDS_FILE" "$ACTIVE_IDS_FILE" > "$PROCESS_IDS_FILE"
  sort -u "$CLOSED_IDS_FILE" "$ACTIVE_IDS_FILE" -o "$KNOWN_IDS_FILE"
else
  while IFS= read -r line; do
    trimmed="$(printf '%s' "$line" | tr -d '[:space:]')"
    [ -n "$trimmed" ] && printf '%s\n' "$trimmed"
  done < /dev/stdin | sort -u > "$STDIN_IDS_FILE"
  comm -23 "$STDIN_IDS_FILE" "$ACTIVE_IDS_FILE" > "$PROCESS_IDS_FILE"
  sort -u "$CLOSED_IDS_FILE" "$ACTIVE_IDS_FILE" "$STDIN_IDS_FILE" -o "$KNOWN_IDS_FILE"
fi

echo "[decision-journal-archive] START mode=$MODE known_ids=$(wc -l < "$KNOWN_IDS_FILE" | tr -d ' ') process_ids=$(wc -l < "$PROCESS_IDS_FILE" | tr -d ' ') decisions_dir=$DECISIONS_DIR"

scanned=0
archived=0
active_stay=0
closed_not_in_scope=0
no_orch_record=0
already_archived=0

while IFS= read -r -d '' f; do
  scanned=$((scanned + 1))
  base="$(basename "$f")"
  # strip "sprint-" prefix and ".md" suffix -> candidate remainder
  rest="${base#sprint-}"
  rest="${rest%.md}"

  match_id=$(awk -v rest="$rest" '
    {
      id=$0
      if (id == rest) {
        if (length(id) > best_len) { best_len = length(id); best_id = id }
      } else if (length(rest) > length(id)) {
        prefix = substr(rest, 1, length(id) + 1)
        if (prefix == id "-") {
          if (length(id) > best_len) { best_len = length(id); best_id = id }
        }
      }
    }
    END { if (best_id != "") print best_id }
  ' "$KNOWN_IDS_FILE")

  if [ -z "$match_id" ]; then
    no_orch_record=$((no_orch_record + 1))
    echo "[decision-journal-archive] NO-MATCH file=$base reason=no-orch-record-for-derived-id"
    continue
  fi

  if grep -Fxq "$match_id" "$ACTIVE_IDS_FILE" 2>/dev/null; then
    active_stay=$((active_stay + 1))
    echo "[decision-journal-archive] SKIP file=$base reason=active-sprint id=$match_id"
    continue
  fi

  if ! grep -Fxq "$match_id" "$PROCESS_IDS_FILE" 2>/dev/null; then
    closed_not_in_scope=$((closed_not_in_scope + 1))
    echo "[decision-journal-archive] SKIP file=$base reason=closed-not-in-scope-this-run id=$match_id"
    continue
  fi

  dest="$ARCHIVE_DECISIONS_DIR/$base"
  if [ -e "$dest" ]; then
    already_archived=$((already_archived + 1))
    echo "[decision-journal-archive] SKIP-EXISTS file=$base reason=already-archived"
    continue
  fi

  if [ "$DRY_RUN" = "1" ]; then
    archived=$((archived + 1))
    echo "[decision-journal-archive] WOULD-ARCHIVE file=$base id=$match_id -> docs/archive/decisions/$base"
    continue
  fi

  mkdir -p "$ARCHIVE_DECISIONS_DIR" 2>/dev/null
  moved=0
  if [ "$DJA_GIT_MV" = "1" ] && git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if git -C "$REPO_ROOT" mv -k -- "$f" "$dest" 2>/dev/null; then
      moved=1
    fi
  fi
  if [ "$moved" -eq 0 ]; then
    if mv "$f" "$dest" 2>/dev/null; then
      moved=1
    fi
  fi
  if [ "$moved" -eq 1 ]; then
    archived=$((archived + 1))
    echo "[decision-journal-archive] ARCHIVED file=$base id=$match_id -> docs/archive/decisions/$base"
  else
    echo "[decision-journal-archive] ERROR-MOVE-FAILED file=$base id=$match_id" >&2
  fi
done < <(find "$DECISIONS_DIR" -maxdepth 1 -type f -name "sprint-*.md" -print0 2>/dev/null)

echo "[decision-journal-archive] SUMMARY mode=$MODE scanned=$scanned archived=$archived active_stay=$active_stay closed_not_in_scope=$closed_not_in_scope no_orch_record=$no_orch_record already_archived=$already_archived"

exit 0
