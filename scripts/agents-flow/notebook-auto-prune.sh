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

  # Drop oldest (chronologically) ## block by parsing timestamps:
  # - Extract timestamps from each "^## " heading (look for ISO8601 or date patterns)
  # - Find the section with the oldest (earliest) timestamp
  # - Drop from that section's start to (but not including) the next section
  # Strategy: build a map of line_num→timestamp, find min timestamp's line, drop that section

  # First, extract all section lines with their timestamps
  SECTIONS_WITH_TS="$(echo "$FILE_CONTENT" | grep -n "^## " | while IFS=: read -r line_num heading; do
    # Extract timestamp: look for ISO8601 (YYYY-MM-DDTHH:MM:SSZ) or date (YYYY-MM-DD)
    # Timestamps typically appear after a "·" or at the end of the line
    ts=$(echo "$heading" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)?' | tail -1)
    if [ -n "$ts" ]; then
      echo "$line_num:$ts:$heading"
    else
      # No timestamp found (e.g., "## Archive") — treat as max to sort last
      echo "$line_num:9999-12-31T23:59:59Z:$heading"
    fi
  done)"

  # Find the oldest timestamp (minimum timestamp)
  OLDEST_LINE="$(echo "$SECTIONS_WITH_TS" | sort -t: -k2 | head -1 | cut -d: -f1)"

  if [ -z "$OLDEST_LINE" ]; then
    # Fallback: if timestamp parsing failed, drop first section (legacy behavior)
    OLDEST_LINE="$(echo "$FILE_CONTENT" | grep -n "^## " | head -1 | cut -d: -f1)"
  fi

  # Find the next section line after OLDEST_LINE (if any)
  NEXT_SECTION_LINE="$(echo "$FILE_CONTENT" | grep -n "^## " | awk -F: -v oldest="$OLDEST_LINE" '$1 > oldest { print $1; exit }')"

  if [ -z "$NEXT_SECTION_LINE" ]; then
    # OLDEST_LINE is the last section: drop from OLDEST_LINE to end
    FILE_CONTENT="$(echo "$FILE_CONTENT" | head -n $((OLDEST_LINE - 1)))"
  else
    # Drop lines from OLDEST_LINE up to (not including) NEXT_SECTION_LINE
    FILE_CONTENT="$(echo "$FILE_CONTENT" | awk -v drop_from="$OLDEST_LINE" -v drop_to=$((NEXT_SECTION_LINE - 1)) 'NR < drop_from || NR > drop_to { print }')"
  fi

done

# --- Atomic write: write to TEMP then mv to FILE_PATH ---
TEMP="$(mktemp 2>/dev/null || true)"
[ -z "$TEMP" ] && exit 0

printf '%s\n' "$FILE_CONTENT" > "$TEMP" 2>/dev/null || { rm -f "$TEMP"; exit 0; }

# Verify temp written successfully
[ -s "$TEMP" ] || { rm -f "$TEMP"; exit 0; }

mv "$TEMP" "$FILE_PATH" 2>/dev/null || { rm -f "$TEMP"; exit 0; }

exit 0
