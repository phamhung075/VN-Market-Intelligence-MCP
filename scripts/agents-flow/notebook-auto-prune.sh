#!/usr/bin/env bash
# notebook-auto-prune.sh — PostToolUse backstop hook (Write|Edit)
#
# BACKSTOPS AC-3 in .claude/skills/notebook-write/SKILL.md.
# Fires AFTER a Write|Edit tool call. If the written file is a governed notebook
# (docs/agent-memory/notebooks/*.md, NOT archive/) and exceeds 200L, drops
# the OLDEST (first) ## section in a loop until ≤200L.
#
# Safe-fail paths:
#   - 0 sections found → emit notebook_unparseable_breach signal, do NOT modify file
#   - only preamble + 1 section left and still >200L → emit notebook_single_section_overage_breach, do NOT truncate
#
# Atomic write: bash mv (NOT a Claude Edit/Write tool — avoids PostToolUse re-trigger loop).
# Always exit 0 (non-blocking). Never modifies non-notebook files.
#
# Pointer: docs/agents/agent-father/flow/main.md § notebook-auto-prune hook
#          docs/policies/dev-standards.md § Script Persistence
set -u

# --- Resolve project root ---
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && exit 0

SIGNALS_DIR="$PROJECT_ROOT/docs/signals"

# --- Parse file path from PostToolUse JSON on STDIN ---
STDIN_JSON="$(cat 2>/dev/null || true)"
[ -z "$STDIN_JSON" ] && exit 0

FILE_PATH="$(echo "$STDIN_JSON" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"
[ -z "$FILE_PATH" ] && exit 0

# Resolve to absolute if relative
case "$FILE_PATH" in
  /*) ;;
  *)  FILE_PATH="$PROJECT_ROOT/$FILE_PATH" ;;
esac

# Normalize to relative path from project root
REL_PATH="${FILE_PATH#${PROJECT_ROOT}/}"

# Guard: relativize failed (file outside project root)
[ "$REL_PATH" = "$FILE_PATH" ] && exit 0

# --- Guard: must be docs/agent-memory/notebooks/*.md AND NOT archive/ ---
case "$REL_PATH" in
  docs/agent-memory/notebooks/archive/*) exit 0 ;;
  docs/agent-memory/notebooks/*.md) ;;  # governed — fall through
  *) exit 0 ;;  # non-notebook — instant exit (hot path)
esac

# --- Guard: file must exist and be readable ---
[ -f "$FILE_PATH" ] || exit 0

# --- Count lines ---
LINE_COUNT=$(wc -l < "$FILE_PATH" 2>/dev/null | tr -d ' ' || true)
[ -z "$LINE_COUNT" ] && exit 0

# Within cap → clean; AC-3 worked correctly
[ "$LINE_COUNT" -le 200 ] && exit 0

# --- Over cap: parse sections ---
# Extract line numbers of all "^## " boundaries
SECTION_LINES="$(grep -n "^## " "$FILE_PATH" 2>/dev/null || true)"
SECTION_COUNT="$(echo "$SECTION_LINES" | grep -c "^[0-9]" 2>/dev/null || echo 0)"

TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || true)"
[ -z "$TIMESTAMP" ] && exit 0

# Safe-fail: no sections found → cannot parse structure
if [ "$SECTION_COUNT" -eq 0 ] || [ -z "$SECTION_LINES" ]; then
  SIGNAL_FILE="$SIGNALS_DIR/notebook-unparseable-$(echo "$REL_PATH" | tr '/.' '-')-$(echo "$TIMESTAMP" | tr -d ':').json"
  cat > "$SIGNAL_FILE" <<EOF 2>/dev/null || true
{
  "from": "notebook-auto-prune-hook",
  "to": "claude-manager-helper",
  "type": "notebook_unparseable_breach",
  "priority": "high",
  "createdAt": "$TIMESTAMP",
  "payload": {
    "file": "$REL_PATH",
    "line_count": $LINE_COUNT,
    "cap": 200,
    "reason": "no ## section boundaries found; cannot safely prune",
    "action_required": "manual_review"
  }
}
EOF
  exit 0
fi

# --- Drop-oldest loop ---
# Read file into variable; drop first ## block iteratively
FILE_CONTENT="$(cat "$FILE_PATH")"

while true; do
  # Recount
  LINE_COUNT="$(echo "$FILE_CONTENT" | wc -l | tr -d ' ')"
  [ "$LINE_COUNT" -le 200 ] && break

  # Count sections
  SECTION_COUNT="$(echo "$FILE_CONTENT" | grep -c "^## " 2>/dev/null || echo 0)"

  # Safe-fail: only 1 section (or 0) and still >200L — cannot prune further
  if [ "$SECTION_COUNT" -le 1 ]; then
    SIGNAL_FILE="$SIGNALS_DIR/notebook-single-section-breach-$(echo "$REL_PATH" | tr '/.' '-')-$(echo "$TIMESTAMP" | tr -d ':').json"
    cat > "$SIGNAL_FILE" <<EOF 2>/dev/null || true
{
  "from": "notebook-auto-prune-hook",
  "to": "claude-manager-helper",
  "type": "notebook_single_section_overage_breach",
  "priority": "high",
  "createdAt": "$TIMESTAMP",
  "payload": {
    "file": "$REL_PATH",
    "line_count": $LINE_COUNT,
    "cap": 200,
    "section_count": $SECTION_COUNT,
    "reason": "only preamble+1 section remain; cannot prune further without data loss",
    "action_required": "manual_split_to_archive"
  }
}
EOF
    exit 0
  fi

  # Drop oldest (first) ## block:
  # - Preamble = everything before first "^## "
  # - First section = from first "^## " to (but not including) second "^## "
  # Strategy: use awk to drop lines from first ## heading up to (not including) second ## heading

  FILE_CONTENT="$(echo "$FILE_CONTENT" | awk '
    BEGIN { in_first=0; found_first=0; dropped=0 }
    /^## / {
      if (!found_first) {
        found_first=1
        in_first=1
        next
      } else if (in_first) {
        in_first=0
        dropped=1
      }
    }
    {
      if (!in_first) print
    }
  ')"

done

# --- Atomic write: write to TEMP then mv to FILE_PATH ---
TEMP="$(mktemp 2>/dev/null || true)"
[ -z "$TEMP" ] && exit 0

printf '%s\n' "$FILE_CONTENT" > "$TEMP" 2>/dev/null || { rm -f "$TEMP"; exit 0; }

# Verify temp written successfully
[ -s "$TEMP" ] || { rm -f "$TEMP"; exit 0; }

mv "$TEMP" "$FILE_PATH" 2>/dev/null || { rm -f "$TEMP"; exit 0; }

exit 0
