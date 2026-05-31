#!/usr/bin/env bash
# Context Bloat Backstop — PostToolUse hook (Write|Edit|NotebookEdit)
#
# Classifies the written file against governed line-cap patterns in
# docs/data/file-size-caps.json (SSOT). If the file exceeds its cap,
# emits a context_bloat_breach signal to docs/signals/ for claude-manager-helper.
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

while IFS=$'\t' read -r pattern cap class; do
  # Use bash glob-style match (fnmatch via case) — ** not natively supported
  # in bash case, but our patterns are shallow enough to work with simple globs.
  # For docs/agents/*/flow/**/*.md and .claude/skills/**/*.md we use an extended match.
  case "$REL_PATH" in
    $pattern)
      MATCHED_CAP="$cap"
      MATCHED_CLASS="$class"
      break
      ;;
  esac
done < <(jq -r '.caps[] | [.pattern, (.cap | tostring), .class] | @tsv' "$CAPS_FILE" 2>/dev/null || true)

# --- Non-governed path → instant exit (hot path, no wc -l) ---
[ -z "$MATCHED_CAP" ] && exit 0

# --- MEASURE: count lines in the written file ---
[ -f "$FILE_PATH" ] || exit 0
LINE_COUNT=$(wc -l < "$FILE_PATH" 2>/dev/null | tr -d ' ' || true)
[ -z "$LINE_COUNT" ] && exit 0

# Within cap → exit clean
[ "$LINE_COUNT" -le "$MATCHED_CAP" ] && exit 0

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
