#!/usr/bin/env bash
# cold-archive-sweep.sh — TE-T33 (token-economy-lazyload-audit #T-33)
#
# Monthly-guarded cold-archive sweep for the write-heavy dirs whose unbounded growth
# was NOT already fixed by an earlier sprint in this same audit:
#
#   1. docs/handoffs/*.md with mtime >HANDOFFS_MAX_AGE_DAYS AND no open task_board
#      reference (backlog/ready/in_progress/review/qa) -> docs/handoffs/archive/YYYY-MM/
#   2. docs/agent-memory/sessions/* (non-.md only — see NOT-IN-SCOPE below) with
#      mtime >SESSIONS_MAX_AGE_DAYS -> docs/agent-memory/sessions/archive/YYYY-MM/
#   3. docs/agent-memory/decisions/po-decisions.md rotated at 200L by delegating to
#      the existing notebook drop-oldest-## algorithm (scripts/agents-flow/notebook-auto-prune.sh),
#      via its opt-in NOTEBOOK_PRUNE_EXTRA_GOVERNED_PATH governed-path hook — the SAME
#      logic docs/agent-memory/notebooks/*.md already gets, no new prune scheme invented.
#
# NOT IN SCOPE (superseded by earlier sprints of the same audit — see
# docs/policies/dev-standards.md § Script Persistence for the actual owning CANONICAL entries):
#   - decisions/ mtime-based archival: SUPERSEDED by scripts/agents-flow/decision-journal-archive.sh
#     (UC-MDH-P4). That script is STATUS-based (closed-sprint-id, longest-match), not mtime —
#     a bare mtime>30d rotation here would wrongly move journals of sprints still open past 30d.
#     Board row TE-T33 carries this exact coordination note (audit_ref).
#   - docs/agent-memory/sessions/*.md <14d: already swept every 6h by
#     scripts/agents-flow/memory-prune-sweep.sh (UC-MDH-P3), which is *.md-only and archives
#     into a FLAT sessions/archive/ (no month partition). This script's sessions leg
#     deliberately excludes *.md (find ! -name "*.md") and only sweeps the file types
#     memory-prune-sweep.sh explicitly leaves untouched (*.log, *.json, etc.) at the wider
#     30d threshold, into a month-partitioned archive/YYYY-MM/ — complementary, not duplicated.
#
# Guarded to run only on the 1st of the month (cheap no-op every other day) — set
# COLD_ARCHIVE_FORCE=1 to override (used by the paired test + ad-hoc manual runs).
#
# Idempotent — a second run in the same month is a byte-clean no-op: handoffs/sessions
# use SKIP-EXISTS destination checks (never overwrite), po-decisions.md re-check is a
# plain line-count gate (no-op once <=200L).
#
# Owning flow: docs/agents/code-janitor/flow/main.md § Cold Archive Sweep
# Policy SSOT: docs/policies/dev-standards.md § Script Persistence
# Detail ref: docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-33
#
# Env overrides (test-only sandboxing, mirrors memory-prune-sweep.sh / decision-journal-archive.sh):
#   HANDOFFS_DIR                    default: $PROJECT_ROOT/docs/handoffs
#   HANDOFFS_MAX_AGE_DAYS           default: 30
#   ORCH_STATE                      default: $PROJECT_ROOT/docs/data/orch/orch-state.json
#   SESSIONS_DIR                    default: $PROJECT_ROOT/docs/agent-memory/sessions
#   SESSIONS_MAX_AGE_DAYS           default: 30
#   PO_DECISIONS_FILE               default: $PROJECT_ROOT/docs/agent-memory/decisions/po-decisions.md
#   NOTEBOOK_PRUNE_HOOK             default: $PROJECT_ROOT/scripts/agents-flow/notebook-auto-prune.sh
#   ARCHIVE_MONTH                   default: $(date -u +%Y-%m) — the archive/YYYY-MM/ bucket this run uses
#   COLD_ARCHIVE_FORCE              default: unset (1 = skip the day-of-month guard)
#
# Exit: always 0 (best-effort housekeeping, matches memory-prune-sweep.sh convention).
# stdout: one [cold-archive-sweep] marker line per event, ending with a SUMMARY line.
#
# Shell: bash 3.2+ (macOS system /bin/bash) — no mapfile, no associative arrays, no
# namerefs. find -print0 / while read -r -d '' matches the repo's NUL-safe file-loop
# convention (scripts/audits/clean-obsolete-files.sh, memory-prune-sweep.sh).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_ROOT="$(git -C "$REPO_ROOT" rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-$REPO_ROOT}")"

HANDOFFS_DIR="${HANDOFFS_DIR:-$PROJECT_ROOT/docs/handoffs}"
HANDOFFS_MAX_AGE_DAYS="${HANDOFFS_MAX_AGE_DAYS:-30}"
ORCH_STATE="${ORCH_STATE:-$PROJECT_ROOT/docs/data/orch/orch-state.json}"
SESSIONS_DIR="${SESSIONS_DIR:-$PROJECT_ROOT/docs/agent-memory/sessions}"
SESSIONS_MAX_AGE_DAYS="${SESSIONS_MAX_AGE_DAYS:-30}"
PO_DECISIONS_FILE="${PO_DECISIONS_FILE:-$PROJECT_ROOT/docs/agent-memory/decisions/po-decisions.md}"
NOTEBOOK_PRUNE_HOOK="${NOTEBOOK_PRUNE_HOOK:-$PROJECT_ROOT/scripts/agents-flow/notebook-auto-prune.sh}"
ARCHIVE_MONTH="${ARCHIVE_MONTH:-$(date -u +%Y-%m)}"

# --- Guard: 1st of month only ---
TODAY_DOM="$(date -u +%d)"
if [ "$TODAY_DOM" != "01" ] && [ "${COLD_ARCHIVE_FORCE:-0}" != "1" ]; then
  echo "[cold-archive-sweep] SKIP reason=not-first-of-month day=$TODAY_DOM"
  exit 0
fi

echo "[cold-archive-sweep] START month=$ARCHIVE_MONTH handoffs_max_age=$HANDOFFS_MAX_AGE_DAYS sessions_max_age=$SESSIONS_MAX_AGE_DAYS"

handoffs_archived=0
handoffs_skipped_referenced=0
sessions_archived=0
po_decisions_pruned=0

# ---------------------------------------------------------------------------
# Leg 1: docs/handoffs/*.md >HANDOFFS_MAX_AGE_DAYS AND no open task_board
# reference -> docs/handoffs/archive/YYYY-MM/
# ---------------------------------------------------------------------------
if [ -d "$HANDOFFS_DIR" ]; then
  HANDOFFS_ARCHIVE_DIR="$HANDOFFS_DIR/archive/$ARCHIVE_MONTH"

  # Referenced-set: any string anywhere inside the 5 OPEN task_board lanes that
  # mentions docs/handoffs/<file>.md — covers .handoff, .detail_ref, and any prose
  # mention (recursive `..` descent). Deliberately broad/conservative: a false
  # "referenced" match only means we SKIP archiving that file (safe direction),
  # never the reverse — we never archive something a false-negative miss could
  # still be live-referencing.
  REFERENCED_FILE="$(mktemp 2>/dev/null || echo "")"
  if [ -n "$REFERENCED_FILE" ] && [ -f "$ORCH_STATE" ]; then
    jq -r '[.task_board.backlog[]?, .task_board.ready[]?, .task_board.in_progress[]?, .task_board.review[]?, .task_board.qa[]?]
      | .. | strings? | select(test("docs/handoffs/"))' "$ORCH_STATE" 2>/dev/null \
      | grep -oE 'docs/handoffs/[A-Za-z0-9._-]+\.md' | sed 's#.*/##' | sort -u > "$REFERENCED_FILE"
  else
    [ -n "$REFERENCED_FILE" ] && : > "$REFERENCED_FILE"
    echo "[cold-archive-sweep] WARN reason=orch-state-missing path=$ORCH_STATE — treating ALL candidates as unreferenced (mtime gate still applies)"
  fi

  while IFS= read -r -d '' f; do
    base="$(basename "$f")"
    if [ -n "$REFERENCED_FILE" ] && grep -qxF "$base" "$REFERENCED_FILE" 2>/dev/null; then
      handoffs_skipped_referenced=$((handoffs_skipped_referenced + 1))
      echo "[cold-archive-sweep] SKIP-REFERENCED path=docs/handoffs/$base reason=open-task-board-reference"
      continue
    fi
    mkdir -p "$HANDOFFS_ARCHIVE_DIR" 2>/dev/null || true
    dest="$HANDOFFS_ARCHIVE_DIR/$base"
    if [ -e "$dest" ]; then
      echo "[cold-archive-sweep] SKIP-EXISTS path=docs/handoffs/$base reason=already-in-archive"
      continue
    fi
    if mv "$f" "$dest" 2>/dev/null; then
      handoffs_archived=$((handoffs_archived + 1))
      echo "[cold-archive-sweep] ARCHIVED path=docs/handoffs/$base -> docs/handoffs/archive/$ARCHIVE_MONTH/$base"
    fi
  done < <(find "$HANDOFFS_DIR" -maxdepth 1 -type f -name "*.md" -mtime "+${HANDOFFS_MAX_AGE_DAYS}" -print0 2>/dev/null)

  [ -n "$REFERENCED_FILE" ] && rm -f "$REFERENCED_FILE" 2>/dev/null
else
  echo "[cold-archive-sweep] SKIP reason=handoffs-dir-missing path=$HANDOFFS_DIR"
fi

# ---------------------------------------------------------------------------
# Leg 2: docs/agent-memory/sessions/* non-.md files >SESSIONS_MAX_AGE_DAYS ->
# docs/agent-memory/sessions/archive/YYYY-MM/ (the *.md leg is already owned by
# memory-prune-sweep.sh at a tighter 14d threshold — see NOT-IN-SCOPE above)
# ---------------------------------------------------------------------------
if [ -d "$SESSIONS_DIR" ]; then
  SESSIONS_ARCHIVE_DIR="$SESSIONS_DIR/archive/$ARCHIVE_MONTH"
  while IFS= read -r -d '' f; do
    base="$(basename "$f")"
    mkdir -p "$SESSIONS_ARCHIVE_DIR" 2>/dev/null || true
    dest="$SESSIONS_ARCHIVE_DIR/$base"
    if [ -e "$dest" ]; then
      echo "[cold-archive-sweep] SKIP-EXISTS path=docs/agent-memory/sessions/$base reason=already-in-archive"
      continue
    fi
    if mv "$f" "$dest" 2>/dev/null; then
      sessions_archived=$((sessions_archived + 1))
      echo "[cold-archive-sweep] ARCHIVED path=docs/agent-memory/sessions/$base -> docs/agent-memory/sessions/archive/$ARCHIVE_MONTH/$base"
    fi
  done < <(find "$SESSIONS_DIR" -maxdepth 1 -type f ! -name "*.md" -mtime "+${SESSIONS_MAX_AGE_DAYS}" -print0 2>/dev/null)
else
  echo "[cold-archive-sweep] SKIP reason=sessions-dir-missing path=$SESSIONS_DIR"
fi

# ---------------------------------------------------------------------------
# Leg 3: rotate po-decisions.md at 200L by delegating to the shared
# drop-oldest-## notebook-prune algorithm (no new prune scheme invented).
# ---------------------------------------------------------------------------
if [ -f "$PO_DECISIONS_FILE" ] && [ -f "$NOTEBOOK_PRUNE_HOOK" ]; then
  po_rel_path="${PO_DECISIONS_FILE#"$PROJECT_ROOT"/}"
  line_count="$(wc -l < "$PO_DECISIONS_FILE" 2>/dev/null | tr -d ' ')"
  if [ -n "$line_count" ] && [ "$line_count" -gt 200 ]; then
    echo "[cold-archive-sweep] OVER-CAP path=$po_rel_path lines=$line_count cap=200"
    hook_input="$(printf '{"tool_input":{"file_path":"%s"}}' "$PO_DECISIONS_FILE")"
    printf '%s' "$hook_input" \
      | CLAUDE_PROJECT_DIR="$PROJECT_ROOT" NOTEBOOK_PRUNE_EXTRA_GOVERNED_PATH="$po_rel_path" \
        bash "$NOTEBOOK_PRUNE_HOOK" >/dev/null 2>&1 || true
    new_count="$(wc -l < "$PO_DECISIONS_FILE" 2>/dev/null | tr -d ' ')"
    if [ -n "$new_count" ] && [ "$new_count" -lt "$line_count" ]; then
      po_decisions_pruned=1
      echo "[cold-archive-sweep] PRUNED path=$po_rel_path lines=${line_count}->${new_count}"
    else
      echo "[cold-archive-sweep] NO-CHANGE path=$po_rel_path lines=$line_count reason=safe-fail-see-docs-signals-notebook-unparseable-or-single-section-breach"
    fi
  fi
else
  echo "[cold-archive-sweep] SKIP reason=po-decisions-or-prune-hook-missing"
fi

echo "[cold-archive-sweep] SUMMARY handoffs_archived=$handoffs_archived handoffs_skipped_referenced=$handoffs_skipped_referenced sessions_archived=$sessions_archived po_decisions_pruned=$po_decisions_pruned"
exit 0
