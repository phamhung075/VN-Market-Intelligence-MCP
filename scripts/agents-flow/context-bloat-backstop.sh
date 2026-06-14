#!/usr/bin/env bash
# Context Bloat Backstop — PostToolUse hook (Write|Edit|NotebookEdit)
#
# Classifies the written file against governed line-cap patterns in
# docs/data/file-size-caps.json (SSOT). If the file exceeds its cap,
# emits a context_bloat_breach signal to docs/signals/ for claude-manager-helper.
#
# HONORS size-justification headers: files with valid justifications that cover
# their overage are skipped (not considered violations).
#
# DEDUP: if an unprocessed context-bloat-*.json signal already exists for the
# target file, skips emission (one open signal per file max).
#
# Input contract: PostToolUse hook JSON received on STDIN.
#   { "tool_name": "Write", "tool_input": { "file_path": "..." }, ... }
#
# Performance contract:
#   - Non-governed path → exit 0 with no wc -l call (hot path)
#   - jq called at most once (after classification)
#   - wc -l called at most once (after classification confirms governed)
#   - Script NEVER blocks the write — always exits 0
#   - Script NEVER invokes any Claude tool
#
# Non-blocking: always exit 0. Failure modes are silent (|| exit 0 guards).
set -u

# --- Resolve project root (matches branch-hygiene-stop.sh pattern) ---
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && exit 0

CAPS_FILE="$PROJECT_ROOT/docs/data/file-size-caps.json"
SIGNALS_DIR="$PROJECT_ROOT/docs/signals"

# Guard: SSOT must exist
[ -f "$CAPS_FILE" ] || exit 0

# --- Parse the file path from PostToolUse JSON on STDIN ---
STDIN_JSON="$(cat 2>/dev/null || true)"
[ -z "$STDIN_JSON" ] && exit 0

FILE_PATH="$(echo "$STDIN_JSON" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"
[ -z "$FILE_PATH" ] && exit 0

# Resolve to absolute path if relative (using CLAUDE_PROJECT_DIR or project root)
case "$FILE_PATH" in
  /*) ;;  # already absolute
  *)  FILE_PATH="$PROJECT_ROOT/$FILE_PATH" ;;
esac

# Normalize to relative path from project root (strip trailing slash from root)
REL_PATH="${FILE_PATH#${PROJECT_ROOT}/}"

# Guard: if relativize failed (file outside project root), exit cleanly
[ "$REL_PATH" = "$FILE_PATH" ] && exit 0

# --- CLASSIFY: check if REL_PATH matches any governed pattern ---
# Iterate caps array from SSOT; first match wins.
# jq called once to produce TSV of pattern/cap/class rows.
MATCHED_CAP=""
MATCHED_CLASS=""
MATCHED_EXEMPT_SIBLING=""

while IFS=$'\t' read -r pattern cap class exempt_sibling; do
  # Use bash glob-style match (fnmatch via case) — ** not natively supported
  # in bash case, but our patterns are shallow enough to work with simple globs.
  # For docs/agents/*/flow/**/*.md and .claude/skills/**/*.md we use an extended match.
  case "$REL_PATH" in
    $pattern)
      MATCHED_CAP="$cap"
      MATCHED_CLASS="$class"
      MATCHED_EXEMPT_SIBLING="$exempt_sibling"
      break
      ;;
  esac
done < <(jq -r '.caps[] | [.pattern, (.cap | tostring), .class, (.exempt_if_sibling // "")] | @tsv' "$CAPS_FILE" 2>/dev/null || true)

# --- Non-governed path → instant exit (hot path, no wc -l) ---
[ -z "$MATCHED_CAP" ] && exit 0

# --- EXEMPT-IF-SIBLING: vendor/third-party files are not ours to govern ---
# If the matched cap declares an exempt_if_sibling filename and a sibling with
# that name exists in the same directory as the written file, skip governance.
# (e.g. Anthropic vendor skills ship a LICENSE.txt next to SKILL.md.)
if [ -n "$MATCHED_EXEMPT_SIBLING" ] && [ "$MATCHED_EXEMPT_SIBLING" != "null" ]; then
  if [ -f "$(dirname "$FILE_PATH")/$MATCHED_EXEMPT_SIBLING" ]; then
    exit 0
  fi
fi

# --- MEASURE: count lines in the written file ---
[ -f "$FILE_PATH" ] || exit 0
LINE_COUNT=$(wc -l < "$FILE_PATH" 2>/dev/null | tr -d ' ' || true)
[ -z "$LINE_COUNT" ] && exit 0

# Within cap → exit clean
[ "$LINE_COUNT" -le "$MATCHED_CAP" ] && exit 0

# --- BREACH DETECTED (overage exists) → check for justification ---
# Honor <!-- size-justification: ... --> (HTML comment, for .md files)
# or # size-justification: ... (for other formats).
# Presence of a size-justification comment indicates a deliberate factory decision.
# Skip emission if the comment is present (the comment itself is the signal).

JUSTIFIED=0
if [ -f "$FILE_PATH" ]; then
  # Extract first few lines to check for size-justification comment
  JUSTIFICATION_LINE=$(head -5 "$FILE_PATH" 2>/dev/null | grep -E '(<!--.*size-justification:|#.*size-justification:)' | head -1 || true)

  if [ -n "$JUSTIFICATION_LINE" ]; then
    # Extract the declared cap from the justification (first number found)
    DECLARED_CAP=$(echo "$JUSTIFICATION_LINE" | grep -oE '[0-9]+' | head -1 || true)

    if [ -n "$DECLARED_CAP" ]; then
      # Honor the justification ONLY if declared cap is within tolerance of actual.
      # Tolerance: ±10% (handles minor drift from edits after justification written).
      # If declared cap is MUCH smaller than actual (e.g., 80L declared vs 185L actual),
      # the justification is STALE and should not block signal emission.
      TOLERANCE=$((DECLARED_CAP / 10))
      if [ "$TOLERANCE" -lt 5 ]; then TOLERANCE=5; fi  # min tolerance 5L

      UPPER_BOUND=$((DECLARED_CAP + TOLERANCE))
      LOWER_BOUND=$((DECLARED_CAP - TOLERANCE))

      if [ "$LINE_COUNT" -le "$UPPER_BOUND" ]; then
        # Actual line count is within tolerance of declared cap — justification is current
        JUSTIFIED=1
      fi
    fi
  fi
fi

if [ "$JUSTIFIED" -eq 1 ]; then
  # File has a current (non-stale) size-justification — skip signal
  exit 0
fi

# --- DEDUP CHECK: skip if unprocessed signal already exists for this file ---
# Signal stem: context-bloat-<file-path-dashes> (without timestamp)
SIGNAL_STEM_PREFIX="context-bloat-$(echo "$REL_PATH" | tr '/.' '-')"
EXISTING_SIGNAL=$(find "$SIGNALS_DIR" -maxdepth 1 -name "${SIGNAL_STEM_PREFIX}-*.json" 2>/dev/null | head -1 || true)

if [ -n "$EXISTING_SIGNAL" ]; then
  # An unprocessed signal already exists for this file — avoid duplicate
  exit 0
fi

# --- BREACH DETECTED → emit maintenance signal to file bus ---
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || true)"
[ -z "$TIMESTAMP" ] && exit 0

# Signal ID: dashes-only, no colons (safe filename)
SIGNAL_STEM="context-bloat-$(echo "$REL_PATH" | tr '/.' '-')-$(echo "$TIMESTAMP" | tr -d ':')"
SIGNAL_FILE="$SIGNALS_DIR/${SIGNAL_STEM}.json"

OVERAGE=$((LINE_COUNT - MATCHED_CAP))

# Write signal atomically via heredoc (no Claude tool invoked — pure bash)
cat > "$SIGNAL_FILE" <<EOF
{
  "from": "context-bloat-backstop-hook",
  "to": "claude-manager-helper",
  "type": "context_bloat_breach",
  "priority": "high",
  "createdAt": "$TIMESTAMP",
  "payload": {
    "file": "$REL_PATH",
    "line_count": $LINE_COUNT,
    "cap": $MATCHED_CAP,
    "class": "$MATCHED_CLASS",
    "overage": $OVERAGE,
    "action_required": "prune_or_split"
  }
}
EOF

# Always non-blocking — the write already happened
exit 0
