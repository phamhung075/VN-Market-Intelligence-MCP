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
# SETTLE-READ / DEBOUNCE (FIX-CONTEXT-BLOAT-HOOK-SETTLE-READ-DEBOUNCE): an over-cap
# FIRST read can be a mid-write transient (file still being grown by a live/in-flight
# edit). Before declaring a breach we sleep a short, configurable window and RE-READ
# the line count; only the settled (post-window) count is used to decide/report.
# See docs/memory/feedback_ctxbloat_breach_on_live_sprint_file_defer.md +
# docs/memory/feedback_auditor_false_positive_destructive.md.
#
# BYTE-CAP PREDICATE (TE-T24 mega-line evasion guard): line count alone is evadable —
# an agent can hold a file's LINE count under cap while packing huge content into a
# small number of very long lines (observed: po main.md ~275L but ~17.4k tokens). A
# second, independent predicate compares total bytes (wc -c) against MATCHED_CAP x 60
# (a 60-bytes/line budget), using the SAME settle-window semantics as the line
# predicate. Either predicate breaching is sufficient to emit a signal; payload.reason
# lists which predicate(s) fired ("line-cap" | "byte-cap" | "line-cap,byte-cap"). A
# size-justification comment only ever covers the LINE predicate (it declares a line
# count) — it never suppresses a byte-cap breach, otherwise the mega-line evasion this
# predicate exists to close would simply move under a justification header instead.
# See docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-24.
#
# Input contract: PostToolUse hook JSON received on STDIN.
#   { "tool_name": "Write", "tool_input": { "file_path": "..." }, ... }
#
# Performance contract:
#   - Non-governed path → exit 0 with no wc -l/wc -c call (hot path)
#   - jq called at most once (after classification)
#   - wc -l and wc -c each called at most once (after classification confirms governed);
#     a second settled read of both happens only on the settle-window breach path
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
MATCHED_EXEMPT=""

while IFS=$'\t' read -r pattern cap class exempt_sibling exempt_flag; do
  # Use bash glob-style match (fnmatch via case) — ** not natively supported
  # in bash case, but our patterns are shallow enough to work with simple globs.
  # For docs/agents/*/flow/**/*.md and .claude/skills/**/*.md we use an extended match.
  case "$REL_PATH" in
    $pattern)
      MATCHED_CAP="$cap"
      MATCHED_CLASS="$class"
      MATCHED_EXEMPT_SIBLING="$exempt_sibling"
      MATCHED_EXEMPT="$exempt_flag"
      break
      ;;
  esac
done < <(jq -r '.caps[] | [.pattern, (.cap | tostring), .class, (.exempt_if_sibling // ""), (.exempt // false | tostring)] | @tsv' "$CAPS_FILE" 2>/dev/null || true)

# --- Non-governed path → instant exit (hot path, no wc -l) ---
[ -z "$MATCHED_CAP" ] && exit 0

# --- EXEMPT flag: entry explicitly marked exempt (e.g. archive paths) → skip governance ---
[ "$MATCHED_EXEMPT" = "true" ] && exit 0

# --- EXEMPT-IF-SIBLING: vendor/third-party files are not ours to govern ---
# If the matched cap declares an exempt_if_sibling filename and a sibling with
# that name exists in the same directory as the written file, skip governance.
# (e.g. Anthropic vendor skills ship a LICENSE.txt next to SKILL.md.)
if [ -n "$MATCHED_EXEMPT_SIBLING" ] && [ "$MATCHED_EXEMPT_SIBLING" != "null" ]; then
  if [ -f "$(dirname "$FILE_PATH")/$MATCHED_EXEMPT_SIBLING" ]; then
    exit 0
  fi
fi

# --- MEASURE: count lines AND bytes in the written file ---
[ -f "$FILE_PATH" ] || exit 0
LINE_COUNT=$(wc -l < "$FILE_PATH" 2>/dev/null | tr -d ' ' || true)
[ -z "$LINE_COUNT" ] && exit 0
BYTE_COUNT=$(wc -c < "$FILE_PATH" 2>/dev/null | tr -d ' ' || true)
[ -z "$BYTE_COUNT" ] && exit 0

# BC-1 byte-cap: 60 bytes/line budget on top of the matched line cap (TE-T24).
BYTE_CAP=$((MATCHED_CAP * 60))

LINE_OVER=0
BYTE_OVER=0
[ "$LINE_COUNT" -gt "$MATCHED_CAP" ] 2>/dev/null && LINE_OVER=1
[ "$BYTE_COUNT" -gt "$BYTE_CAP" ] 2>/dev/null && BYTE_OVER=1

# Both predicates within cap → exit clean
[ "$LINE_OVER" -eq 0 ] && [ "$BYTE_OVER" -eq 0 ] && exit 0

# --- SETTLE-READ / DEBOUNCE: re-read after a short settle window before declaring breach ---
# Kills the mid-write false-positive class: a file caught mid-growth (still being written/
# edited by a live in-flight sprint) can transiently read over-cap on this FIRST wc -l/wc -c.
# Wait a short, configurable window, then RE-READ. Only the SETTLED (post-window) line/byte
# counts are authoritative from here on — if both drop back within cap, the first read was
# mid-write noise, not a real breach. Override window via CONTEXT_BLOAT_SETTLE_SECONDS
# (default 2s; set to 0 to disable, e.g. for fast test harnesses).
SETTLE_SECONDS="${CONTEXT_BLOAT_SETTLE_SECONDS:-2}"
if [ "$SETTLE_SECONDS" -gt 0 ] 2>/dev/null; then
  sleep "$SETTLE_SECONDS" 2>/dev/null || true
fi

[ -f "$FILE_PATH" ] || exit 0   # file vanished during settle window → nothing to report
LINE_COUNT_SETTLED=$(wc -l < "$FILE_PATH" 2>/dev/null | tr -d ' ' || true)
[ -z "$LINE_COUNT_SETTLED" ] && exit 0
LINE_COUNT="$LINE_COUNT_SETTLED"   # settled reading supersedes the initial (possibly mid-write) reading
BYTE_COUNT_SETTLED=$(wc -c < "$FILE_PATH" 2>/dev/null | tr -d ' ' || true)
[ -z "$BYTE_COUNT_SETTLED" ] && exit 0
BYTE_COUNT="$BYTE_COUNT_SETTLED"

LINE_OVER=0
BYTE_OVER=0
[ "$LINE_COUNT" -gt "$MATCHED_CAP" ] 2>/dev/null && LINE_OVER=1
[ "$BYTE_COUNT" -gt "$BYTE_CAP" ] 2>/dev/null && BYTE_OVER=1

# Settled within both caps → the initial over-cap read was a mid-write transient, not a real breach
[ "$LINE_OVER" -eq 0 ] && [ "$BYTE_OVER" -eq 0 ] && exit 0

# --- BREACH DETECTED (overage exists on at least one predicate) → check for justification ---
# Honor <!-- size-justification: ... --> (HTML comment, for .md files)
# or # size-justification: ... (for other formats).
# Presence of a size-justification comment indicates a deliberate factory decision.
# Skip emission if the comment is present (the comment itself is the signal).
#
# NOTE (TE-T24): a size-justification comment declares a LINE count only, so it can ONLY
# honor a line-cap breach. It NEVER honors a byte-cap breach — otherwise a mega-line file
# could simply paste a justification header and keep evading governance under the byte
# dimension, defeating the whole point of this predicate.

LINE_JUSTIFIED=0
if [ "$LINE_OVER" -eq 1 ] && [ -f "$FILE_PATH" ]; then
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
        LINE_JUSTIFIED=1
      fi
    fi
  fi
fi

# --- RESOLVE: which predicate(s) still have an unjustified breach? ---
REASON=""
if [ "$LINE_OVER" -eq 1 ] && [ "$LINE_JUSTIFIED" -eq 0 ]; then
  REASON="line-cap"
fi
if [ "$BYTE_OVER" -eq 1 ]; then
  if [ -n "$REASON" ]; then REASON="$REASON,byte-cap"; else REASON="byte-cap"; fi
fi

if [ -z "$REASON" ]; then
  # Every breach that fired is covered by a current line-based justification — skip signal
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

# --- BREACH DETECTED → emit maintenance signal to file bus (post_agent_signal-equivalent) ---
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || true)"
[ -z "$TIMESTAMP" ] && exit 0

# Signal ID: dashes-only, no colons (safe filename)
SIGNAL_STEM="context-bloat-$(echo "$REL_PATH" | tr '/.' '-')-$(echo "$TIMESTAMP" | tr -d ':')"
SIGNAL_FILE="$SIGNALS_DIR/${SIGNAL_STEM}.json"

# Overage is only meaningful for the predicate that actually breached; 0 otherwise.
OVERAGE=0
[ "$LINE_OVER" -eq 1 ] && OVERAGE=$((LINE_COUNT - MATCHED_CAP))
BYTE_OVERAGE=0
[ "$BYTE_OVER" -eq 1 ] && BYTE_OVERAGE=$((BYTE_COUNT - BYTE_CAP))

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
    "byte_count": $BYTE_COUNT,
    "byte_cap": $BYTE_CAP,
    "class": "$MATCHED_CLASS",
    "reason": "$REASON",
    "overage": $OVERAGE,
    "byte_overage": $BYTE_OVERAGE,
    "action_required": "prune_or_split"
  }
}
EOF

# Always non-blocking — the write already happened
exit 0
