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
#
# KNOWN GAP (TE-T17, 2026-07-23): this hook only fires on the PostToolUse
# Write|Edit matcher (.claude/settings.local.json) — a notebook write landed via
# any other tool path (Bash heredoc/append, direct mv, etc) never triggers it.
# Backstop: scripts/agents-flow/notebook-linecap-sweep.sh, wired into
# code-janitor's 6h cron (docs/agents/code-janitor/flow/main.md § Notebook
# Line-Cap Sweep), re-sweeps every docs/agent-memory/notebooks/*.md on a fixed
# cadence regardless of write path, delegating over-cap files back to THIS
# script's own prune logic (single source of truth).
#
# EXTENSION (TE-T33, 2026-07-23): docs/agent-memory/decisions/po-decisions.md needed
# the same drop-oldest-## rotation at 200L but lives outside docs/agent-memory/notebooks/.
# Rather than fork the algorithm, the guard below accepts ONE opt-in extra governed path
# via NOTEBOOK_PRUNE_EXTRA_GOVERNED_PATH (repo-relative, e.g. from a synthetic PostToolUse
# JSON invocation — see scripts/agents-flow/cold-archive-sweep.sh). Unset/empty by default
# (the normal PostToolUse hook invocation never sets it) → zero behavior change on the hot
# path; a REL_PATH can never equal an empty string so the extra arm cannot accidentally match.
set -u

# --- Resolve project root ---
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && exit 0

SIGNALS_DIR="$PROJECT_ROOT/docs/signals"

# --- Duplicate-heading detector (FIX-NOTEBOOK-AUTOPRUNE-REGEX-HEADING-MISMATCH item 3) ---
# Detection-only, never auto-fixes: code audit of the drop-oldest loop below (and git
# archaeology of a real duplicate-heading incident — see decision journal for task
# FIX-NOTEBOOK-AUTOPRUNE-REGEX-HEADING-MISMATCH) confirmed this hook's mutation paths
# (`head -n`, `awk 'NR<a||NR>b'`) can only REMOVE lines — there is no code path that can
# duplicate one, and the observed duplicate pair survived inside a file that was UNDER the
# 200L cap (so this hook's line-count guard would have short-circuited before ever touching
# it) — i.e. the corruption was introduced upstream of this hook (agent-side notebook-write),
# not by this script. This guard exists as a proactive early-warning tripwire regardless of
# root cause, and runs on every invocation (not just >200L) since that is where duplicates
# have actually been observed surviving.
detect_dup_heading() {
  awk '
    /^## / {
      if ($0 == prev && blank_only) { print; exit }
      prev = $0; blank_only = 1; next
    }
    NF == 0 { next }
    { blank_only = 0 }
  '
}

emit_dup_signal() {
  local dup="$1" stage="$2"
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || true)"
  [ -z "$ts" ] && return 0
  local sig_file
  sig_file="$SIGNALS_DIR/notebook-duplicate-heading-$(echo "$REL_PATH" | tr '/.' '-')-$(echo "$ts" | tr -d ':').json"
  local dup_json
  dup_json="$(printf '%s' "$dup" | jq -Rs . 2>/dev/null || printf '"%s"' "$dup")"
  cat > "$sig_file" <<EOF 2>/dev/null || true
{
  "from": "notebook-auto-prune-hook",
  "to": "claude-manager-helper",
  "type": "notebook_duplicate_heading_detected",
  "priority": "normal",
  "createdAt": "$ts",
  "payload": {
    "file": "$REL_PATH",
    "stage": "$stage",
    "duplicate_heading": $dup_json,
    "reason": "identical ## heading found twice back-to-back (no non-blank content between) — corruption signature; not auto-fixed by this hook (detection-only, avoids risking deletion of legitimately-repeated content)",
    "action_required": "manual_review"
  }
}
EOF
}

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

# --- Guard: must be docs/agent-memory/notebooks/*.md AND NOT archive/, OR the
# single opt-in extra governed path (TE-T33 — see EXTENSION note above) ---
NOTEBOOK_PRUNE_EXTRA_GOVERNED_PATH="${NOTEBOOK_PRUNE_EXTRA_GOVERNED_PATH:-}"
case "$REL_PATH" in
  docs/agent-memory/notebooks/archive/*) exit 0 ;;
  docs/agent-memory/notebooks/*.md) ;;  # governed — fall through
  "$NOTEBOOK_PRUNE_EXTRA_GOVERNED_PATH")
    [ -n "$NOTEBOOK_PRUNE_EXTRA_GOVERNED_PATH" ] || exit 0  # belt-and-suspenders vs empty-pattern match
    ;;  # governed — opt-in extra path, fall through
  *) exit 0 ;;  # non-notebook — instant exit (hot path)
esac

# --- Guard: file must exist and be readable ---
[ -f "$FILE_PATH" ] || exit 0

# --- Duplicate-heading tripwire (runs regardless of line-count cap — see detector def above) ---
DUP_PRE="$(detect_dup_heading < "$FILE_PATH")"
[ -n "$DUP_PRE" ] && emit_dup_signal "$DUP_PRE" "pre-cap-scan"

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
  # - Extract timestamps from each "^## " heading (look for ISO8601 or compact/date patterns)
  # - Find the section with the oldest (earliest) timestamp
  # - Drop from that section's start to (but not including) the next section
  # Strategy: build a map of line_num→normalized-timestamp-key, find min key's line, drop that section
  #
  # Regex supports ALL live notebook heading conventions in one pattern (dash/colon made
  # optional so a single ERE covers every real shape found across docs/agent-memory/notebooks/*.md):
  #   - compact:      cycle-YYYYMMDDTHHMMZ          (main.md — no dashes/colons/seconds)
  #   - dashed-no-sec: YYYY-MM-DDTHH:MMZ             (po.md "Tick ..." — no seconds)
  #   - dashed-full:   YYYY-MM-DDTHH:MM:SS[.fff]Z    (bctc-analyst.md/system-auditor.md suffix style)
  #   - date-only:     YYYY-MM-DD                    (qa.md "cycle-N · YYYY-MM-DD · ...", no time)
  # The matched substring is then normalized (all non-digits stripped, zero-padded/truncated to a
  # fixed 17-char width = YYYYMMDDHHMMSSfff) so formats with different precision still compare
  # correctly against each other as plain numeric strings.

  # First, extract all section lines with their timestamps
  SECTIONS_WITH_TS="$(echo "$FILE_CONTENT" | grep -n "^## " | while IFS=: read -r line_num heading; do
    ts_raw=$(echo "$heading" | grep -oE '[0-9]{4}-?[0-9]{2}-?[0-9]{2}(T[0-9]{2}:?[0-9]{2}(:?[0-9]{2}(\.[0-9]+)?)?Z)?' | tail -1)
    if [ -n "$ts_raw" ]; then
      ts_digits=$(echo "$ts_raw" | tr -dc '0-9')
      ts_key=$(printf '%-17s' "$ts_digits" | tr ' ' '0' | cut -c1-17)
      echo "$line_num:$ts_key:$heading"
    else
      # No timestamp found (e.g., "## Archive") — treat as max (17 nines) to sort last
      echo "$line_num:99999999999999999:$heading"
    fi
  done)"

  # Find the oldest timestamp (minimum key). -k2,2 restricts the sort strictly to the
  # normalized numeric key (now pure digits, no embedded colons/dashes, so it can never bleed
  # into the heading text the way the old unbounded -k2 did); -s forces a stable sort so ties
  # (e.g. two "## Archive"-style sentinel entries) break on physical/original order instead of
  # falling back to alphabetical heading-text comparison.
  OLDEST_LINE="$(echo "$SECTIONS_WITH_TS" | sort -t: -k2,2 -s | head -1 | cut -d: -f1)"

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

# --- Post-prune duplicate-heading tripwire (belt-and-suspenders re-check on the content
# this hook is about to write; non-blocking — still writes the file, since blocking here
# would leave a genuinely-oversized file stuck forever) ---
DUP_POST="$(echo "$FILE_CONTENT" | detect_dup_heading)"
[ -n "$DUP_POST" ] && emit_dup_signal "$DUP_POST" "post-prune-scan"

# --- Atomic write: write to TEMP then mv to FILE_PATH ---
TEMP="$(mktemp 2>/dev/null || true)"
[ -z "$TEMP" ] && exit 0

printf '%s\n' "$FILE_CONTENT" > "$TEMP" 2>/dev/null || { rm -f "$TEMP"; exit 0; }

# Verify temp written successfully
[ -s "$TEMP" ] || { rm -f "$TEMP"; exit 0; }

mv "$TEMP" "$FILE_PATH" 2>/dev/null || { rm -f "$TEMP"; exit 0; }

exit 0
