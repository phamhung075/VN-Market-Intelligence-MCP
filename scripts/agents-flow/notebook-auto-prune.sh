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
# Non-blocking (exit code cannot undo an already-completed Write/Edit) — see the
# NON-BLOCKING note below for the 0/1 exit-code contract (UC-CRITIC-HOOKS-ENFORCEMENT
# FR-2). Never modifies non-notebook files.
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
# NON-BLOCKING: exit code never undoes the write that already happened.
#   0 = clean pass OR legitimate no-op (unchanged from before this fix).
#   1 = FR-2 discriminator (UC-CRITIC-HOOKS-ENFORCEMENT) detected a
#       prerequisite crash — e.g. `git`/`jq` binary missing or stdin capture
#       failed — a case that used to collapse silently into the same exit 0
#       as "non-notebook path" (see `.claude/settings.local.json`'s
#       invocation, which no longer swallows this exit code behind
#       `2>/dev/null || true`).
#
# SELECTION-VS-SENTINEL CARDINALITY GUARD (FIX-NOTEBOOK-AUTOPRUNE-ROLLING-SECTIONS-
# BYTE-COUNTED-BUT-UNDROPPABLE AC-5/AC-6/AC-7, occurrence 5, 2026-08-12): the
# drop-oldest selection below (MIN_KEY = sort of nso_sections_with_ts's column 2)
# is correct when 2+ sections carry DISTINCT, comparable real timestamps — but a
# file mixing dated and undated ("## Keep ...", no YYYY-MM-DD token) headings,
# where only ONE section has a parseable timestamp, makes that lone section
# MIN_KEY by construction (it is the only non-sentinel value present, and every
# sentinel sorts to $NSO_SENTINEL_KEY, always larger) — even when it is the
# chronologically NEWEST content in the file. Reproduced live on
# docs/agent-memory/notebooks/agent-father.md 2026-08-12 (decision journal
# triage-20260812T1310Z-po.md): a single "## EDIT <full-ISO>" heading was picked
# as "oldest" against two undated "## Keep (maintenance) HH:MM" headings and its
# 53 lines were dropped — the newest section in the file, deleted, zero signal.
#   AC-5 (guard placed BEFORE MIN_KEY is trusted as evidence, in the loop below):
#   when exactly ONE section in the current candidate set carries a non-sentinel
#   key and >=1 sentinel section also exists, that lone dated section is NOT a
#   valid "oldest" determination — a sample size of one is not a chronological
#   ordering. Safe-fail exactly like the SECTION_COUNT<=1 path above (honest
#   signal, no truncation): the sentinel section(s) are ALSO structurally exempt
#   from selection by design (see nso_ts_key's own header comment), so no section
#   in that shape is a safe, evidence-backed drop candidate.
#   AC-6 (guard placed once OLDEST_LINE is finalized, any path, in the loop
#   below): independent defense-in-depth — fires regardless of whether AC-5's
#   guard above caught this file's shape. If the section about to be dropped
#   carries the file's own MAXIMUM non-sentinel key (every dated section present
#   — one, or several tied at an identical key — shares that same value, so
#   there is zero within-file evidence this pick is the oldest rather than the
#   newest), emit a signal BEFORE the atomic write. Non-blocking — the prune
#   still proceeds; this is the "never silent" backstop occurrences 1/3/5 all
#   lacked (zero signal, exit 0 — recovery only because an agent happened to
#   notice and run `git show HEAD:` before committing).
#   AC-7: nso_ts_key / $NSO_SENTINEL_KEY semantics in
#   lib/notebook-section-direction.sh are UNCHANGED by this fix (only new
#   caller-side guards added in THIS file) — re-verified against
#   scripts/notebook-compose.sh, the lib's other caller: its retention drop-loop
#   and AC-2b sub-block drop-loop both select the drop target by PHYSICAL
#   POSITION (head/tail) after resolving an aggregate newest_first/oldest_first
#   DIRECTION — neither ever sorts individual sections by ts_key to pick a
#   per-section "oldest", so the MIN-key-beats-sentinels inversion this AC-5/AC-6
#   pair closes does not exist in that caller. scripts/notebook-compose.test.sh
#   (its own regression suite) re-run clean, unmodified by this fix.
set -u

# FR-2 (UC-CRITIC-HOOKS-ENFORCEMENT): shared crash-vs-clean-pass discriminator.
source "$(dirname "${BASH_SOURCE[0]}")/lib/hook-guard.sh"
# FIX-NOTEBOOK-COMPOSE-SCRIPT-ACTUATOR (2026-08-06): shared "## " timestamp-key +
# newest-first/oldest-first direction derivation, now also used by
# scripts/notebook-compose.sh — this is the ONE implementation (see that lib's
# own header comment for why the inline copy that used to live below was
# extracted, not duplicated).
source "$(dirname "${BASH_SOURCE[0]}")/lib/notebook-section-direction.sh"

# --- Resolve project root ---
if ! PROJECT_ROOT=$(hg_resolve_project_root); then
  exit 1   # git binary itself missing — real prerequisite crash, not "no project root"
fi
[ -z "$PROJECT_ROOT" ] && exit 0   # legitimately outside any project context — unchanged no-op

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

# --- Same-day tie-break direction-DEFAULTED signal (FIX-NOTEBOOK-AUTOPRUNE-DIRECTION-
# UNRESOLVABLE-ZERO-TS-NOTEBOOKS, 2026-07-31 — supersedes the prior "refuse to guess
# forever" contract shipped by FIX-NOTEBOOK-AUTOPRUNE-SAMEDAY-TIE-DROPS-NEWEST) ---
# That prior contract correctly stopped the pruner from GUESSING when a same-day tie
# existed alongside OTHER real, distinguishable timestamps elsewhere in the file (the
# override table in $ORDER_FILE remains the right tool there) — but for a file where
# EVERY retained "## " section lacks a parseable timestamp entirely (MIN_KEY ==
# SENTINEL_KEY; corpus replay: 11 live files, e.g. "## Known patterns / preferences",
# "## Identity" — non-chronological/rolling sections, not per-cycle dated journal
# entries), NEITHER this file's own headings NOR a future override entry can EVER give a
# real direction signal — the condition is permanent by construction, not transient. Its
# old "refuse to prune, emit a breach, exit 0" behavior meant these files fail-loud
# forever and grow past cap unchecked (confirmed live: unified-agent.md, digest-
# predict.md both breached their byte cap this way). This is now a non-blocking,
# INFORMATIONAL signal recording that the documented default direction (newest_first —
# see the case-statement default arm below) was applied so the prune could proceed.
emit_direction_defaulted_signal() {
  local tie_group="$1"
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || true)"
  [ -z "$ts" ] && return 0
  local sig_file
  sig_file="$SIGNALS_DIR/notebook-direction-defaulted-$(echo "$REL_PATH" | tr '/.' '-')-$(echo "$ts" | tr -d ':').json"
  local tie_json
  tie_json="$(printf '%s' "$tie_group" | jq -Rs . 2>/dev/null || printf '"%s"' "$tie_group")"
  cat > "$sig_file" <<EOF 2>/dev/null || true
{
  "from": "notebook-auto-prune-hook",
  "to": "claude-manager-helper",
  "type": "notebook_tiebreak_direction_defaulted",
  "priority": "normal",
  "createdAt": "$ts",
  "payload": {
    "file": "$REL_PATH",
    "tied_sections": $tie_json,
    "direction_applied": "newest_first",
    "reason": "every retained ## section in this file lacks a parseable timestamp (non-chronological/rolling sections, e.g. 'Known patterns / preferences') so neither this file's own headings nor docs/data/notebook-section-order.json can ever give a direction signal — the documented default (newest_first: drop the physically-LAST tied section) was applied and the prune proceeded. Informational only, not a blocking breach (FIX-NOTEBOOK-AUTOPRUNE-DIRECTION-UNRESOLVABLE-ZERO-TS-NOTEBOOKS).",
    "action_required": "informational_no_action_needed"
  }
}
EOF
}

# --- No-valid-drop-candidate signal (AC-5, FIX-NOTEBOOK-AUTOPRUNE-ROLLING-SECTIONS-
# BYTE-COUNTED-BUT-UNDROPPABLE occurrence 5) — same honest-signal CONTRACT as the
# SECTION_COUNT<=1 safe-fail below (no truncation, always exit 0), but a distinct
# TYPE, because the reason differs: here the file can have 2+ sections total, but
# EVERY one of them is structurally ineligible to be the drop victim (sentinels by
# design, the lone dated section by this AC) — conflating it with the literal
# "only 1 section left" signal would mislead a downstream consumer keyed on that
# type's SECTION_COUNT<=1 semantics.
emit_no_valid_drop_candidate_signal() {
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || true)"
  [ -z "$ts" ] && return 0
  local sig_file
  sig_file="$SIGNALS_DIR/notebook-no-valid-drop-candidate-$(echo "$REL_PATH" | tr '/.' '-')-$(echo "$ts" | tr -d ':').json"
  cat > "$sig_file" <<EOF 2>/dev/null || true
{
  "from": "notebook-auto-prune-hook",
  "to": "claude-manager-helper",
  "type": "notebook_no_valid_drop_candidate_breach",
  "priority": "high",
  "createdAt": "$ts",
  "payload": {
    "file": "$REL_PATH",
    "line_count": $LINE_COUNT,
    "cap": $LINE_CAP,
    "byte_count": $BYTE_COUNT,
    "byte_cap": $BYTE_CAP,
    "section_count": $SECTION_COUNT,
    "non_sentinel_section_count": $NON_SENTINEL_SECTION_COUNT,
    "sentinel_section_count": $SENTINEL_SECTION_COUNT,
    "reason": "exactly one section in this file carries a parseable timestamp while >=1 other section is a permanently-undroppable rolling/sentinel heading (e.g. 'Known patterns', 'Keep (maintenance)') -- one real timestamp is a sample size of one, not a chronological ordering, so ranking it as the file minimum against MAX sentinels would manufacture a false 'oldest' and risk dropping the file's NEWEST content (AC-5, FIX-NOTEBOOK-AUTOPRUNE-ROLLING-SECTIONS-BYTE-COUNTED-BUT-UNDROPPABLE occurrence 5, docs/agent-memory/notebooks/agent-father.md 2026-08-12). No section in this file is currently a safe, evidence-backed drop candidate; cannot prune further without risking data loss.",
    "action_required": "manual_split_to_archive"
  }
}
EOF
}

# --- Dropped-newest-dated-section signal (AC-6, same ticket) — fires whenever the
# section this hook is ABOUT to drop carries the file's own MAXIMUM non-sentinel
# key, i.e. every non-sentinel section in the file (whether that is one section,
# per AC-5 above, or several tied at an identical key) shares the same value, so
# there is zero within-file timestamp evidence that this pick is actually the
# oldest rather than the newest. Independent of AC-5: still fires even if a
# future edit reintroduces the selection bug AC-5 closes, or any other path
# reaches this exact shape. Non-blocking -- the prune proceeds; this signal only
# exists so the drop is NEVER silent (occurrences 1/3/5 all had zero signal, exit
# 0, and were caught only because an agent happened to notice and recover via
# `git show HEAD:` before committing).
emit_dropped_newest_dated_section_signal() {
  local drop_line="$1" drop_heading="$2"
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || true)"
  [ -z "$ts" ] && return 0
  local sig_file
  sig_file="$SIGNALS_DIR/notebook-prune-dropped-newest-$(echo "$REL_PATH" | tr '/.' '-')-$(echo "$ts" | tr -d ':').json"
  local heading_json
  heading_json="$(printf '%s' "$drop_heading" | jq -Rs . 2>/dev/null || printf '"%s"' "$drop_heading")"
  cat > "$sig_file" <<EOF 2>/dev/null || true
{
  "from": "notebook-auto-prune-hook",
  "to": "claude-manager-helper",
  "type": "notebook_prune_dropped_newest_dated_section",
  "priority": "high",
  "createdAt": "$ts",
  "payload": {
    "file": "$REL_PATH",
    "line": $drop_line,
    "heading": $heading_json,
    "section_count": $SECTION_COUNT,
    "non_sentinel_section_count": $NON_SENTINEL_SECTION_COUNT,
    "sentinel_section_count": $SENTINEL_SECTION_COUNT,
    "reason": "the section chosen as drop-oldest carries the MAXIMUM non-sentinel timestamp key found anywhere in this file -- every dated section present (one, or several tied at an identical key) shares that same value, so ranking it as 'oldest' is not backed by any within-file ordering evidence and may be dropping the NEWEST real content instead (AC-6, FIX-NOTEBOOK-AUTOPRUNE-ROLLING-SECTIONS-BYTE-COUNTED-BUT-UNDROPPABLE occurrence 5). Non-blocking -- the prune proceeds; this signal exists so the drop is never silent.",
    "action_required": "review_dropped_section"
  }
}
EOF
}

# --- Parse file path from PostToolUse JSON on STDIN ---
if ! STDIN_JSON=$(hg_run "cat:stdin" cat); then
  exit 1   # cat itself crashed reading the hook payload — real prerequisite failure
fi
[ -z "$STDIN_JSON" ] && exit 0   # cat succeeded, payload genuinely empty — unchanged no-op

if ! FILE_PATH=$(printf '%s' "$STDIN_JSON" | hg_run "jq:tool_input.file_path" jq -r '.tool_input.file_path // empty'); then
  exit 1   # jq itself crashed — NOT the same as "no file_path field"
fi
[ -z "$FILE_PATH" ] && exit 0   # jq succeeded, field genuinely absent — unchanged no-op

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

# 17-char zero-padded MAX sentinel assigned to any "## " heading with no parseable
# timestamp — a single named constant so it is never a second hand-typed literal
# (FIX-NOTEBOOK-AUTOPRUNE-DIRECTION-UNRESOLVABLE-ZERO-TS-NOTEBOOKS: also used to
# EXCLUDE sentinel-vs-real comparisons from the direction vote). FIX-NOTEBOOK-
# COMPOSE-SCRIPT-ACTUATOR (2026-08-06): now lives solely in
# lib/notebook-section-direction.sh as $NSO_SENTINEL_KEY (sourced above) — the
# script-local $SENTINEL_KEY alias this comment used to introduce was removed
# (dead after the refactor moved every consumer into the lib; shellcheck SC2034
# confirmed zero remaining references in this file).

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

  # First, extract all section lines with their timestamps (shared lib —
  # FIX-NOTEBOOK-COMPOSE-SCRIPT-ACTUATOR: see lib/notebook-section-direction.sh
  # header for why this is no longer an inline block).
  SECTIONS_WITH_TS="$(echo "$FILE_CONTENT" | nso_sections_with_ts)"

  # AC-5 (FIX-NOTEBOOK-AUTOPRUNE-ROLLING-SECTIONS-BYTE-COUNTED-BUT-UNDROPPABLE,
  # occurrence 5): guard BEFORE MIN_KEY (below) is trusted as chronological
  # evidence — see the SELECTION-VS-SENTINEL CARDINALITY GUARD header comment
  # above this script's `set -u` line for the full rationale. Also computes
  # MAX_NON_SENTINEL_KEY, consumed by the AC-6 guard further down this loop.
  NON_SENTINEL_KEYS_COL="$(echo "$SECTIONS_WITH_TS" | cut -d: -f2 | grep -v "^${NSO_SENTINEL_KEY}\$" 2>/dev/null || true)"
  NON_SENTINEL_SECTION_COUNT="$(echo "$NON_SENTINEL_KEYS_COL" | grep -c '^[0-9]' 2>/dev/null || echo 0)"
  SENTINEL_SECTION_COUNT="$(echo "$SECTIONS_WITH_TS" | cut -d: -f2 | grep -c "^${NSO_SENTINEL_KEY}\$" 2>/dev/null || echo 0)"
  MAX_NON_SENTINEL_KEY="$(echo "$NON_SENTINEL_KEYS_COL" | grep '^[0-9]' 2>/dev/null | sort | tail -1)"

  if [ "$NON_SENTINEL_SECTION_COUNT" -eq 1 ] && [ "$SENTINEL_SECTION_COUNT" -ge 1 ]; then
    # Exactly one section in the current candidate set has a real timestamp; the
    # rest are permanently-undroppable sentinels. One real timestamp is a sample
    # size of one, not a chronological ordering -- neither it (AC-5) nor the
    # sentinel section(s) (structural exemption, unchanged) is a valid drop
    # candidate. Safe-fail: same honest-signal contract as SECTION_COUNT<=1 above.
    emit_no_valid_drop_candidate_signal
    exit 0
  fi

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
    # 2+ sections tie for oldest. Resolve direction-aware via the shared lib: derive the
    # file's OWN newest-first(prepend)/oldest-first(append) convention from ITS OWN
    # distinguishable (non-tied) section timestamps first (self-describing, no maintenance
    # for the common case — nso_vote_direction walks the FULL $SECTIONS_WITH_TS, not just
    # the tied group, exactly as this call site always fed it), falling back to the
    # declared-convention override table, then the documented default — see
    # docs/data/notebook-section-order.json for why that table is optional, never required
    # (FIX-NOTEBOOK-AUTOPRUNE-DIRECTION-UNRESOLVABLE-ZERO-TS-NOTEBOOKS AC-2).
    RESOLVED_DIRECTION="$(nso_resolve_direction "$SECTIONS_WITH_TS" "$(basename "$REL_PATH")" "$ORDER_FILE")"
    DIRECTION="${RESOLVED_DIRECTION%% *}"
    DIRECTION_SOURCE="${RESOLVED_DIRECTION##* }"

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
    esac

    if [ "$DIRECTION_SOURCE" = "default" ]; then
      # PRIMARY fix (AC-1, FIX-NOTEBOOK-AUTOPRUNE-DIRECTION-UNRESOLVABLE-ZERO-TS-
      # NOTEBOOKS): neither this file's own timestamps NOR the declared override table
      # gave ANY signal (nso_resolve_direction's own default arm, always "newest_first"
      # in this case). This happens precisely when EVERY retained "## " section lacks a
      # parseable timestamp — non-chronological/rolling sections by construction (e.g.
      # "## Known patterns / preferences", "## Identity" — see .claude/skills/notebook-
      # write/SKILL.md's own "stable ROLLING heading" concept), not per-cycle dated
      # journal entries — there is NO evidence-based way to rank them by age, ever, for
      # a file shaped like this (corpus replay: 11 confirmed live files — code-janitor,
      # cowork-refactory-expert x2, digest-predict, idea-forge, market-analyst,
      # ops-mainserver-fetch, pm-alpha-s2-rag-fts-rebuild-cron, po, semble-search,
      # dev-technical-analysis). Refusing to prune here FOREVER (the prior contract) is
      # worse than a documented, deterministic, always-safe-to-repeat default. Still
      # bounded by every other existing safety invariant below (single-section
      # safe-fail, atomic write) — only INFORMATIONAL, not a blocking breach.
      emit_direction_defaulted_signal "$TIE_GROUP"
    fi
  fi

  if [ -z "$OLDEST_LINE" ]; then
    # Fallback: if timestamp parsing failed, drop first section (legacy behavior)
    OLDEST_LINE="$(echo "$FILE_CONTENT" | grep -n "^## " | head -1 | cut -d: -f1)"
  fi

  # AC-6 (same ticket, occurrence 5): independent defense-in-depth signal, fires
  # regardless of whether AC-5 above caught this file's shape. OLDEST_LINE always
  # carries key==MIN_KEY on every path above (TIE_GROUP is derived FROM MIN_KEY),
  # so MIN_KEY==MAX_NON_SENTINEL_KEY means the section about to be dropped shares
  # the file's own maximum non-sentinel key with every other dated section
  # present (one, or several tied) -- zero within-file evidence this pick is the
  # oldest rather than the newest. Non-blocking: emits BEFORE the atomic write
  # below and still lets the prune proceed (see function header for rationale).
  if [ -n "$MAX_NON_SENTINEL_KEY" ] && [ "$MIN_KEY" = "$MAX_NON_SENTINEL_KEY" ]; then
    OLDEST_HEADING="$(echo "$FILE_CONTENT" | awk -v n="$OLDEST_LINE" 'NR==n{print; exit}')"
    emit_dropped_newest_dated_section_signal "$OLDEST_LINE" "$OLDEST_HEADING"
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
