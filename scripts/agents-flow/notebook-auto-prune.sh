#!/usr/bin/env bash
# notebook-auto-prune.sh — PostToolUse backstop hook (Write|Edit)
#
# BACKSTOPS AC-3 in .claude/skills/notebook-write/SKILL.md.
# Fires AFTER a Write|Edit tool call. If the written file is a governed notebook
# (docs/agent-memory/notebooks/*.md, NOT archive/) and exceeds EITHER the line cap
# (200L) OR the byte cap (LINE_CAP x 60 bytes/line — same derivation as the byte-cap
# predicate in context-bloat-backstop.sh, TE-T24), drops the OLDEST (first) ## section
# in a loop until BOTH caps are satisfied.
#
# Safe-fail paths:
#   - 0 sections found → emit notebook_unparseable_breach signal, do NOT modify file
#   - only preamble + 1 section left and still over cap (either axis) → emit notebook_single_section_overage_breach, do NOT truncate
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
#
# BYTE-CAP LOCKSTEP (FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES,
# 2026-07-28): the line cap above had an actuator (this hook) but the byte cap
# (context-bloat-backstop.sh TE-T24, docs/data/file-size-caps.json driven) had only a
# detector — agents satisfied the enforced line constraint by writing denser lines, and
# nothing ever pushed back on the byte axis (observed: alert-commander.md averaging 632
# bytes/line against a 60 bytes/line budget). This hook now recounts BOTH lines and bytes
# on every early-exit/loop-break check and stops only when both are within cap. The byte
# cap is derived as LINE_CAP * 60 — LINE_CAP is read from the SAME SSOT row
# context-bloat-backstop.sh reads (docs/data/file-size-caps.json, pattern
# "docs/agent-memory/notebooks/*.md"), never hand-typed as a literal a second time (see
# decision journal for this task; a second hardcoded copy of the same number is exactly
# the class of defect that produced the earlier USD/VND three-SSOT incident). Cited as
# instance 13 / sub-class 7 on SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP.
#
# DECISION (option [a] of the row's open question): the single-section safe-fail path
# (below, "only 1 section left and still over cap") keeps its existing behaviour —
# honest signal, no truncation — now reachable on either axis. Rationale: smallest
# change, consistent with the current contract, and truncating mid-section would
# destroy the current cycle's record, which is explicitly not acceptable.
set -u

# --- Resolve project root ---
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && exit 0

SIGNALS_DIR="$PROJECT_ROOT/docs/signals"
CAPS_FILE="$PROJECT_ROOT/docs/data/file-size-caps.json"
ORDER_FILE="$PROJECT_ROOT/docs/data/notebook-section-order.json"
# FIX-NOTEBOOK-DUPHEADING-DETECTOR-NO-DEDUP-NO-ACTUATOR (2026-07-30): persistent marker
# ledger, keyed by (file, heading), so a duplicate-heading signal fires AT MOST ONCE while
# the corrupted condition persists, and re-arms (fires again) once cleared and later recurs.
DEDUP_STATE_DIR="$PROJECT_ROOT/docs/data/notebook-dup-heading-signal-state"

# --- Duplicate-heading detector (FIX-NOTEBOOK-AUTOPRUNE-REGEX-HEADING-MISMATCH item 3) ---
# ORIGINALLY detection-only, never auto-fixed: code audit of the drop-oldest loop below (and
# git archaeology of a real duplicate-heading incident — see decision journal for task
# FIX-NOTEBOOK-AUTOPRUNE-REGEX-HEADING-MISMATCH) confirmed this hook's mutation paths
# (`head -n`, `awk 'NR<a||NR>b'`) can only REMOVE lines — there is no code path that can
# duplicate one, and the observed duplicate pair survived inside a file that was UNDER the
# 200L cap (so this hook's line-count guard would have short-circuited before ever touching
# it) — i.e. the corruption was introduced upstream of this hook (agent-side notebook-write),
# not by this script. This guard exists as a proactive early-warning tripwire regardless of
# root cause, and runs on every invocation (not just >200L) since that is where duplicates
# have actually been observed surviving.
#
# UPDATE (FIX-NOTEBOOK-DUPHEADING-DETECTOR-NO-DEDUP-NO-ACTUATOR, 2026-07-30): PO adjudication
# OVERTURNS "detection-only" for this ONE signature only. The predicate below matches EXACTLY
# "two identical '## ' headings back-to-back with nothing but blank lines between them" — by
# construction there is ZERO non-blank content between the pair, so deleting the FIRST
# occurrence is provably lossless. See repair_adjacent_dup_heading() below: this shape is now
# auto-repaired (collapsed to one heading), still with exactly one deduped signal recording
# the detected-and-repaired occurrence (see emit_dup_signal_deduped()). This function's own
# matching logic is UNCHANGED — every OTHER duplicate-heading shape (real content between the
# pair, non-adjacent duplicates separated by a different heading) does NOT match this
# predicate and is therefore NEVER auto-repaired — it stays exactly as before (undetected by
# this function; no new detector added for those shapes here — out of scope for this task,
# see its decision journal entry).
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
    "reason": "identical ## heading found twice back-to-back (no non-blank content between) — corruption signature; auto-repaired by this hook per PO adjudication FIX-NOTEBOOK-DUPHEADING-DETECTOR-NO-DEDUP-NO-ACTUATOR (this ONE signature is provably lossless to collapse, first occurrence deleted). Every OTHER duplicate-heading shape remains detection-only/unfixed.",
    "auto_repaired": true,
    "action_required": "informational_no_action_needed"
  }
}
EOF
}

# --- Duplicate-heading AUTO-REPAIR + signal dedup (FIX-NOTEBOOK-DUPHEADING-DETECTOR-NO-DEDUP-
# NO-ACTUATOR, 2026-07-30) ---
# detect_dup_heading_lines() mirrors detect_dup_heading()'s EXACT predicate (adjacent
# identical "## " heading, nothing but blank lines between) but reports the two line numbers
# instead of the heading text, so the caller can surgically delete the FIRST occurrence
# (heading line + the blank-only lines up to the second occurrence) — provably lossless,
# since by construction nothing but blanks separated them.
detect_dup_heading_lines() {
  awk '
    /^## / {
      if ($0 == prev && blank_only) { print prev_line ":" NR; exit }
      prev = $0; prev_line = NR; blank_only = 1; next
    }
    NF == 0 { next }
    { blank_only = 0 }
  '
}

# Repairs ONLY the shape detect_dup_heading()/detect_dup_heading_lines() match. Loops to
# convergence (handles 2+ such pairs in one file, though a single pair is the only signature
# observed live). Never touches any OTHER duplicate-heading shape — those simply never match
# the predicate above, so this function is never invoked for them.
repair_adjacent_dup_heading() {
  local content="$1"
  local match l1 l2
  while true; do
    match="$(printf '%s\n' "$content" | detect_dup_heading_lines)"
    [ -z "$match" ] && break
    l1="${match%%:*}"
    l2="${match##*:}"
    { [ -z "$l1" ] || [ -z "$l2" ]; } && break
    content="$(printf '%s\n' "$content" | awk -v l1="$l1" -v l2="$l2" 'NR < l1 || NR >= l2 { print }')"
  done
  printf '%s\n' "$content"
}

# Marker path keyed by (REL_PATH, heading text). REL_PATH is assigned later in the script;
# these functions are only ever CALLED after that assignment (never at definition time).
_dup_marker_path() {
  local heading="$1" safe_file safe_heading
  safe_file="$(echo "$REL_PATH" | tr '/.' '-')"
  safe_heading="$(printf '%s' "$heading" | (shasum -a 256 2>/dev/null || sha256sum 2>/dev/null) | cut -c1-16)"
  [ -z "$safe_heading" ] && safe_heading="nohash"
  echo "$DEDUP_STATE_DIR/${safe_file}__${safe_heading}.marker"
}

# Emits AT MOST ONCE per (file, heading) while its marker exists — i.e. while the corrupted
# condition has not yet been observed as cleared by _dup_clear_markers_for_file below. Guards
# the known double-emit path (this hook fires the same detector at BOTH the pre-cap-scan and
# post-prune-scan stages of a single run) as well as repeat invocations across separate hook
# runs while the condition persists.
emit_dup_signal_deduped() {
  local dup="$1" stage="$2" marker
  marker="$(_dup_marker_path "$dup")"
  mkdir -p "$DEDUP_STATE_DIR" 2>/dev/null || true
  [ -f "$marker" ] && return 0
  emit_dup_signal "$dup" "$stage"
  { date -u +"%Y-%m-%dT%H:%M:%SZ" > "$marker"; } 2>/dev/null || : > "$marker" 2>/dev/null || true
}

# Called whenever a fresh scan finds NO duplicate for this file — clears any stale marker(s)
# so a LATER, genuinely-new recurrence for this file re-arms and signals again. A dedup that
# never re-arms once the file is fixed would be a worse bug than the duplicate-signal churn
# it replaces.
_dup_clear_markers_for_file() {
  local safe_file
  safe_file="$(echo "$REL_PATH" | tr '/.' '-')"
  rm -f "$DEDUP_STATE_DIR/${safe_file}__"*.marker 2>/dev/null || true
}

# --- Same-day tie-break direction-unresolved signal (FIX-NOTEBOOK-AUTOPRUNE-SAMEDAY-TIE-DROPS-NEWEST) ---
# Emitted when 2+ "## " sections normalize to the IDENTICAL lossy ts_key (e.g. same-day
# date-only headings) AND the file's own distinguishable timestamps give no direction signal
# AND no override exists in $ORDER_FILE. Refuses to guess — see that file's _note for why.
emit_tiebreak_unresolved_signal() {
  local tie_group="$1"
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || true)"
  [ -z "$ts" ] && return 0
  local sig_file
  sig_file="$SIGNALS_DIR/notebook-tiebreak-unresolved-$(echo "$REL_PATH" | tr '/.' '-')-$(echo "$ts" | tr -d ':').json"
  local tie_json
  tie_json="$(printf '%s' "$tie_group" | jq -Rs . 2>/dev/null || printf '"%s"' "$tie_group")"
  cat > "$sig_file" <<EOF 2>/dev/null || true
{
  "from": "notebook-auto-prune-hook",
  "to": "claude-manager-helper",
  "type": "notebook_tiebreak_direction_unresolved_breach",
  "priority": "high",
  "createdAt": "$ts",
  "payload": {
    "file": "$REL_PATH",
    "tied_sections": $tie_json,
    "reason": "2+ ## sections share an identical normalized timestamp key (e.g. same-day date-only headings) and this file's OWN section timestamps give no newest-first/oldest-first direction signal; no declared override in docs/data/notebook-section-order.json either — refusing to guess which one is oldest (guessing wrong here is silent data loss of the newest content)",
    "action_required": "declare_this_file_convention_in_notebook-section-order.json"
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

# --- Duplicate-heading tripwire + auto-repair (runs regardless of line-count cap — see
# detector def above; FIX-NOTEBOOK-DUPHEADING-DETECTOR-NO-DEDUP-NO-ACTUATOR) ---
PRE_CONTENT="$(cat "$FILE_PATH" 2>/dev/null || true)"
DUP_PRE="$(printf '%s\n' "$PRE_CONTENT" | detect_dup_heading)"
if [ -n "$DUP_PRE" ]; then
  emit_dup_signal_deduped "$DUP_PRE" "pre-cap-scan"
  REPAIRED_PRE="$(repair_adjacent_dup_heading "$PRE_CONTENT")"
  if [ "$REPAIRED_PRE" != "$PRE_CONTENT" ]; then
    PRE_TEMP="$(mktemp 2>/dev/null || true)"
    if [ -n "$PRE_TEMP" ]; then
      if printf '%s\n' "$REPAIRED_PRE" > "$PRE_TEMP" 2>/dev/null && [ -s "$PRE_TEMP" ]; then
        mv "$PRE_TEMP" "$FILE_PATH" 2>/dev/null || rm -f "$PRE_TEMP"
      else
        rm -f "$PRE_TEMP"
      fi
    fi
  fi
else
  _dup_clear_markers_for_file
fi

# --- Derive LINE_CAP + BYTE_CAP from the SAME SSOT context-bloat-backstop.sh reads
# (docs/data/file-size-caps.json) — see BYTE-CAP LOCKSTEP note above. BYTE_CAP is never
# a second hardcoded literal; it is always LINE_CAP * 60, and LINE_CAP is always read
# from the JSON row, not typed twice. ---
LINE_CAP="$(jq -r '.caps[] | select(.pattern=="docs/agent-memory/notebooks/*.md") | .cap' "$CAPS_FILE" 2>/dev/null | head -1)"
case "$LINE_CAP" in ''|*[!0-9]*) LINE_CAP=200 ;; esac  # SSOT unreadable/malformed → long-standing default
BYTE_CAP=$((LINE_CAP * 60))  # same 60-bytes/line derivation as context-bloat-backstop.sh (TE-T24)

# --- Count lines AND bytes (dual-axis) ---
LINE_COUNT=$(wc -l < "$FILE_PATH" 2>/dev/null | tr -d ' ' || true)
[ -z "$LINE_COUNT" ] && exit 0
BYTE_COUNT=$(wc -c < "$FILE_PATH" 2>/dev/null | tr -d ' ' || true)
[ -z "$BYTE_COUNT" ] && exit 0

# Within BOTH caps → clean; AC-3 worked correctly
[ "$LINE_COUNT" -le "$LINE_CAP" ] && [ "$BYTE_COUNT" -le "$BYTE_CAP" ] && exit 0

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
    "cap": $LINE_CAP,
    "byte_count": $BYTE_COUNT,
    "byte_cap": $BYTE_CAP,
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
  # Recount BOTH axes. printf '%s\n' (not echo) mirrors the final atomic-write form
  # below exactly, so the byte count measured here matches what lands on disk.
  LINE_COUNT="$(printf '%s\n' "$FILE_CONTENT" | wc -l | tr -d ' ')"
  BYTE_COUNT="$(printf '%s\n' "$FILE_CONTENT" | wc -c | tr -d ' ')"
  [ "$LINE_COUNT" -le "$LINE_CAP" ] && [ "$BYTE_COUNT" -le "$BYTE_CAP" ] && break

  # Count sections
  SECTION_COUNT="$(echo "$FILE_CONTENT" | grep -c "^## " 2>/dev/null || echo 0)"

  # Safe-fail: only 1 section (or 0) and still over cap (either axis) — cannot prune further.
  # DECISION option [a] (see BYTE-CAP LOCKSTEP note above): keep this behaviour unchanged —
  # honest signal, no truncation — now reachable via either predicate.
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
    "cap": $LINE_CAP,
    "byte_count": $BYTE_COUNT,
    "byte_cap": $BYTE_CAP,
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

  # Find the oldest timestamp (minimum key), then resolve WHICH physical section that is.
  #
  # FIX-NOTEBOOK-AUTOPRUNE-SAMEDAY-TIE-DROPS-NEWEST: the 17-char normalized key above
  # intentionally collapses distinct sub-day-precision-less headings (e.g. 3 same-day
  # date-only "## Session 2026-07-30 ..." headings written in one day) to an IDENTICAL key.
  # The OLD code broke this tie with a plain stable sort on that lossy key, which always
  # picked the PHYSICALLY-FIRST tied section — correct only for an OLDEST-FIRST/APPEND
  # notebook (new section written at the bottom). For a NEWEST-FIRST/PREPEND notebook (new
  # section written at the TOP — confirmed e.g. for docs/agent-memory/notebooks/developer.md
  # via git history), physically-first among a same-day tied group is the NEWEST entry, so
  # the old code silently dropped the just-written section instead of the true oldest one.
  MIN_KEY="$(echo "$SECTIONS_WITH_TS" | cut -d: -f2 | sort | head -1)"
  TIE_GROUP="$(echo "$SECTIONS_WITH_TS" | awk -F: -v k="$MIN_KEY" '$2==k')"
  TIE_COUNT="$(echo "$TIE_GROUP" | grep -c ":" 2>/dev/null || echo 0)"

  if [ "$TIE_COUNT" -le 1 ]; then
    # No ambiguity — exactly one section has the minimum key. Unchanged from before.
    OLDEST_LINE="$(echo "$TIE_GROUP" | head -1 | cut -d: -f1)"
  else
    # 2+ sections tie for oldest. Resolve direction-aware: derive the file's OWN
    # newest-first(prepend)/oldest-first(append) convention from ITS OWN distinguishable
    # (non-tied) section timestamps first (self-describing, no maintenance for the common
    # case) — walk physical top-to-bottom order, vote decreasing-key vs increasing-key on
    # every adjacent pair that actually differs.
    DIRECTION=""
    prev_key=""
    dec_votes=0
    inc_votes=0
    while IFS=: read -r _sec_line cur_key _sec_heading; do
      if [ -n "$prev_key" ] && [ "$prev_key" != "$cur_key" ]; then
        if [ "$prev_key" \> "$cur_key" ]; then
          dec_votes=$((dec_votes + 1))
        else
          inc_votes=$((inc_votes + 1))
        fi
      fi
      prev_key="$cur_key"
    done <<SECEOF
$SECTIONS_WITH_TS
SECEOF

    if [ "$dec_votes" -gt "$inc_votes" ]; then
      DIRECTION="newest_first"
    elif [ "$inc_votes" -gt "$dec_votes" ]; then
      DIRECTION="oldest_first"
    fi

    # The file's own headings gave no distinguishing signal at all (every section in the
    # WHOLE file normalizes to the same key — e.g. a notebook whose heading format never
    # carries sub-day precision) — consult the declared-convention override instead of
    # guessing (see docs/data/notebook-section-order.json for why there is no silent default).
    if [ -z "$DIRECTION" ]; then
      DIRECTION="$(jq -r --arg f "$(basename "$REL_PATH")" '.overrides[$f] // empty' "$ORDER_FILE" 2>/dev/null || true)"
    fi

    case "$DIRECTION" in
      newest_first)
        # Physically-first among the tied group is the NEWEST (prepend convention) — the
        # true oldest is physically-LAST (bottom-most) within the tied group.
        OLDEST_LINE="$(echo "$TIE_GROUP" | tail -1 | cut -d: -f1)"
        ;;
      oldest_first)
        # Physically-first among the tied group IS the true oldest (append convention).
        OLDEST_LINE="$(echo "$TIE_GROUP" | head -1 | cut -d: -f1)"
        ;;
      *)
        # Direction cannot be determined from this file's own headings AND no declared
        # override exists — refuse to guess. Guessing wrong here IS the silent-data-loss
        # defect this fix closes. Emit signal, do NOT prune this cycle; the file stays at
        # its pre-hook-invocation state (nothing written yet at this point in the script).
        emit_tiebreak_unresolved_signal "$TIE_GROUP"
        exit 0
        ;;
    esac
  fi

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

# --- Post-prune duplicate-heading tripwire + auto-repair (belt-and-suspenders re-check on
# the content this hook is about to write; non-blocking — still writes the file, since
# blocking here would leave a genuinely-oversized file stuck forever) ---
DUP_POST="$(printf '%s\n' "$FILE_CONTENT" | detect_dup_heading)"
if [ -n "$DUP_POST" ]; then
  emit_dup_signal_deduped "$DUP_POST" "post-prune-scan"
  FILE_CONTENT="$(repair_adjacent_dup_heading "$FILE_CONTENT")"
else
  _dup_clear_markers_for_file
fi

# --- Atomic write: write to TEMP then mv to FILE_PATH ---
TEMP="$(mktemp 2>/dev/null || true)"
[ -z "$TEMP" ] && exit 0

printf '%s\n' "$FILE_CONTENT" > "$TEMP" 2>/dev/null || { rm -f "$TEMP"; exit 0; }

# Verify temp written successfully
[ -s "$TEMP" ] || { rm -f "$TEMP"; exit 0; }

mv "$TEMP" "$FILE_PATH" 2>/dev/null || { rm -f "$TEMP"; exit 0; }

exit 0
