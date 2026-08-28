#!/usr/bin/env bash
# scripts/notebook-compose.sh
#
# FIX-NOTEBOOK-COMPOSE-SCRIPT-ACTUATOR — the ONE blessed compose actuator for the
# "append a new cycle section, retain 3, prune older" notebook write pattern
# (.claude/skills/notebook-write/SKILL.md AC-2/AC-2a/AC-2b/AC-3/AC-5). Mirrors
# scripts/auditor-notebook-commit.sh's precedent EXACTLY: the model calls ONE
# script and branches on its stdout marker — the compose step is no longer
# LLM-narrated prose with no deterministic actuator.
#
# ROOT CAUSE FIXED (RECURRING-BUG ESCALATION, prior_warns=7, already past the
# fleet 2+ threshold — feedback_recurring_bug_escalation.md): commit
# `0fcc6a5d2` deleted a retained `## c44` heading from
# docs/agent-memory/notebooks/system-auditor.md, replaced it with two blank
# lines, and never wrote the claimed `c45` section anywhere — while the file
# GREW 80->81L and the cycle's own report claimed success. Root cause: the
# compose step required the model to read an entire existing notebook into its
# own context, identify `## ` boundaries, and reproduce every retained section
# byte-for-byte inside a single freehand `Write` payload — the reproduction
# requirement is the direct mechanical cause of this failure class, independent
# of any one bug in that incident's specific tool call. This script removes the
# LLM from that reproduction burden entirely: the agent authors ONLY the new
# section's substantive text (small, bounded, ≤ section-cap lines); every
# retained section's bytes flow from the ON-DISK file straight into the ON-DISK
# result via bash string operations the model never touches and cannot corrupt
# mid-transcription. See docs/architecture-briefs/2026-08-06-fix-system-
# auditor-notebook-compose-actuator-and-immutability-blindspot.md (Finding 1,
# Fix A) for the full incident analysis — this script IS that fix's primary
# recommendation, agent-father's own commit_zone could not reach scripts/
# (precedent c72b5ca34), hence the separate dev-team dispatch.
#
# CONTRACT
#   scripts/notebook-compose.sh <notebook-path> <new-section-body-file> [max-sections=3] [section-cap=60]
#
#   <notebook-path>          Path to the EXISTING governed notebook (repo-
#                             relative or absolute — the script does not
#                             resolve $PROJECT_ROOT, it trusts the caller's
#                             CWD/paths exactly like auditor-notebook-commit.sh
#                             does for git). MUST already exist — this script
#                             has no blank-state-init mode (SKILL AC-4); that
#                             is a separate, rare, one-time path left narrated.
#   <new-section-body-file>  Path to a file containing ONLY the already-
#                             authored new section: first non-blank line MUST
#                             be a "## " heading, nothing else. This is the
#                             ENTIRE caller-authored surface — no other
#                             argument accepts free-form content.
#   [max-sections=3]         Steady-state section-retention count (AC-2).
#                             Must be a positive integer.
#   [section-cap=60]         Per-section line cap (AC-2a Step 1c). The new
#                             section is auto-trimmed to this cap if over (an
#                             AUTHORIZED mutation — AC-2a explicitly permits
#                             trimming the CURRENT cycle's own new section,
#                             never a retained one). Must be a positive
#                             integer.
#
#   The 200-line / (200*60)-byte file-level caps are NOT script arguments —
#   derived from the SAME SSOT scripts/agents-flow/notebook-auto-prune.sh
#   reads (docs/data/file-size-caps.json, pattern
#   "docs/agent-memory/notebooks/*.md"), never a second hardcoded literal.
#
# WHAT THIS SCRIPT MECHANICALLY DOES (no LLM judgment calls in the loop):
#   1. Validates the new section is well-formed: exactly ONE "## " heading (the
#      first non-blank line), no embedded second heading further down (a
#      malformed caller payload could otherwise silently multiply the section
#      count / corrupt direction-derivation downstream — refused, not
#      tolerated).
#   2. Auto-trims the new section to <section-cap> lines if over (AC-2a Step
#      1c — the ONLY authorized mutation to NEW content; never applied to a
#      retained section).
#   3. Splits the EXISTING file into preamble (before first "## ") + an
#      ordered array of section blobs (heading through the line before the
#      next "## " or EOF) — READ-ONLY capture, kept byte-for-byte in memory.
#   4. Derives the file's newest-first/oldest-first convention by REUSING (not
#      reimplementing — AC-2 of this task's board row) the exact same
#      self-deriving-from-headings + docs/data/notebook-section-order.json
#      tie-break/override/default logic scripts/agents-flow/notebook-auto-
#      prune.sh uses, now factored into scripts/agents-flow/lib/notebook-
#      section-direction.sh and sourced by BOTH scripts — see that lib's own
#      header for why there is exactly ONE implementation, not two.
#   5. Inserts the new section at the position the derived convention implies
#      (top for newest_first, bottom for oldest_first) and, WHILE the total
#      section count exceeds <max-sections>, drops the OLDEST section (tail
#      for newest_first, head for oldest_first) — looping to convergence, not
#      a single conditional drop (AC-2's own "loop until the steady state is
#      reached" requirement). The just-inserted new section is, by
#      construction, NEVER eligible for this drop (it always sits at the
#      "newest" end of the ordering the loop trims from the opposite end of).
#   6. AC-2b: for any retained section whose heading is literally
#      "## Prior cycles" (the one documented permanent-accumulator heading —
#      docs/architecture-briefs/2026-06-02-notebook-write-prune-contract.md
#      §Tier-B), if it contains >=4 "### " sub-blocks, drops the oldest
#      sub-block (same derived direction) in a loop until <=3 remain. A
#      no-op for every notebook that doesn't use this heading (the vast
#      majority) — this is the ONLY authorized mutation to a retained
#      section's own body content (AC-2a explicitly carves it out).
#   7. Recounts lines AND bytes (dual-axis, same BYTE_CAP=LINE_CAP*60
#      derivation notebook-auto-prune.sh's own BYTE-CAP LOCKSTEP fix uses —
#      not literally required by this task's board-row wording, which only
#      names "60L/200L caps", but reuses the SAME SSOT with zero new config
#      and closes the identical line-only-setpoint gap
#      FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES already
#      had to fix once for the sibling prune hook). If still over EITHER cap
#      after step 6: drops the next-oldest section (same direction), backstop
#      loop, until within both caps OR only the new section (± the
#      "Prior cycles" section) remains and is STILL over cap — safe-fail,
#      ABORTs, writes NOTHING (mirrors notebook-auto-prune.sh's own
#      single-section safe-fail; never truncates mid-section).
#   8. BELT-AND-SUSPENDERS INTERNAL INVARIANT CHECK (runs unconditionally,
#      before the atomic write, on the IN-MEMORY composed content — this is
#      what makes the 0fcc6a5d2 shape structurally UNREACHABLE, not merely
#      unlikely): for every original section NOT selected for a whole-section
#      drop in steps 5/7, this script asserts (byte-for-byte string equality,
#      not a heuristic) that the exact blob captured in step 3 is still
#      present, unmodified, in the composed body — and that the composed
#      body's total heading count exactly equals
#      (retained-original-count + 1-for-the-new-section). Because this
#      script's ONLY two content-mutating operations are "drop a whole
#      section" (steps 5/7) and the AC-2b sub-block prune (step 6, an
#      authorized, explicitly-tracked exception carved out of this same
#      check), there is no code path between "read the file" and "assert
#      this invariant" that can produce "heading vanished, body orphaned,
#      file grew" — the 0fcc6a5d2 signature. If this check EVER fails (it
#      should be unreachable by construction — this is defense-in-depth, the
#      same spirit as agent-father's interim Step 2a guard, but built INTO
#      the actuator itself and checked BEFORE any write, not after a live
#      write-then-revert), the script ABORTs and writes NOTHING. See
#      scripts/notebook-compose.test.sh for the negative-control replay of
#      the exact 0fcc6a5d2 shape (PRE_COUNT too low to require any drop,
#      asserting no heading vanishes and the file grows by exactly the
#      well-formed amount).
#   9. ONE settled write via mktemp + mv — never a Claude Write/Edit tool
#      call from the calling agent's own flow (so it also can never trigger a
#      PostToolUse re-entrancy surprise against notebook-auto-prune.sh's own
#      hook, which still backstops this script's output exactly as it
#      backstops every other write path).
#
# This script does NOT git-add/commit anything — that remains
# scripts/auditor-notebook-commit.sh's separate, unchanged job. Two scripts,
# two concerns, same "model calls ONE script, branches on marker" contract.
#
# MARKER CONTRACT (grep for "[notebook-compose]" — this is what agent-father's
# planned follow-up rewire of docs/agents/system-auditor/flow/main.md Step
# 1/2/2a, incl. agent-father's own interim Step 2a gate which this script
# supersedes, will branch on. That rewire is agent-father's job, NOT done by
# this task — flagged via signal, see the owning task's decision journal):
#
#   success ->
#     "[notebook-compose] OK sections=<n> dropped=<n> lines=<n> bytes=<n> direction=<newest_first|oldest_first>"
#     Caller: proceed to Commit (scripts/auditor-notebook-commit.sh) as normal.
#
#   non-blocking, still followed by the OK line same run — caller just continues:
#     "[notebook-compose] WARN new-section-trimmed-to-cap orig_lines=<n> cap=<n>"
#     "[notebook-compose] WARN direction-defaulted file=<name> applied=newest_first"
#     "[notebook-compose] WARN ac2b-subblock-pruned heading=\"Prior cycles\" dropped=<n>"
#
#   bad usage / malformed input -> exit 2, notebook file UNTOUCHED:
#     "[notebook-compose] ERROR bad-usage — usage: notebook-compose.sh <notebook-path> <new-section-body-file> [max-sections=3] [section-cap=60]"
#     "[notebook-compose] ERROR notebook-not-found <path>"
#     "[notebook-compose] ERROR new-section-file-not-found <path>"
#     "[notebook-compose] ERROR new-section-empty <path>"
#     "[notebook-compose] ERROR new-section-missing-heading — first non-blank line must start with '## '"
#     "[notebook-compose] ERROR new-section-multiple-headings — new-section-body-file must contain exactly ONE '## ' heading"
#
#   safe-fail, cannot prune further without data loss -> exit 1, notebook file UNTOUCHED:
#     "[notebook-compose] ABORT single-section-overage lines=<n> cap=<n> bytes=<n> byte_cap=<n>"
#     Caller: skip this cycle's notebook write, log an equivalent of
#     [NOTEBOOK-GATE-ABORT] on the NEXT cycle, send a BUG-channel Telegram —
#     do NOT retry-loop this same cycle, do NOT fall back to a narrated Write.
#
#   belt-and-suspenders internal check tripped (should be unreachable by
#   construction) -> exit 1, notebook file UNTOUCHED:
#     "[notebook-compose] ABORT internal-invariant-violated <detail>"
#
#   tmpfile/atomic-write failure -> exit 1, notebook file UNTOUCHED:
#     "[notebook-compose] ERROR tmpfile-write-failed"
#     "[notebook-compose] ERROR atomic-mv-failed"
#
# Every non-OK exit path leaves the real notebook file byte-identical to how
# this script found it — mktemp+mv is all-or-nothing; there is no code path
# that writes partial/intermediate state to the real path.
#
# Precedents: scripts/auditor-notebook-commit.sh (header-comment style, single-
# script-single-marker-branch contract), scripts/agents-flow/notebook-auto-
# prune.sh + scripts/agents-flow/lib/notebook-section-direction.sh (section
# splitting / direction derivation — REUSED, not reimplemented, per this
# task's own AC-2), scripts/orch-apply.sh (mktemp+mv atomic-write style).
#
# Owning flow: docs/agents/system-auditor/flow/main.md §Notebook write (wired 2026-08-14,
# FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED) + docs/agents/bctc-analyst/flow/
# stage-log-notify.md §5a (wired 2026-08-28, FIX-BCTC-ANALYST-NOTEBOOK-COMPOSE-ACTUATOR — second
# wired caller; call shape `3 60`, max-sections=3 per AC-2, section-cap=60 per AC-2a).
#
# Shell: bash 3.2+ (macOS system /bin/bash) — NO mapfile, NO associative
# arrays, NO `local -r`. Only plain indexed arrays (incl. array slicing,
# supported since bash 3.0) + `while read` loops, matching every other
# agents-flow script's own constraint.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=./agents-flow/lib/notebook-section-direction.sh
source "$SCRIPT_DIR/agents-flow/lib/notebook-section-direction.sh"

# Optional test-isolation overrides (unset by default — the real production
# call site never sets these, zero behavior change on the hot path; same
# opt-in-env-var pattern as NOTEBOOK_PRUNE_EXTRA_GOVERNED_PATH in
# notebook-auto-prune.sh). Lets scripts/notebook-compose.test.sh exercise the
# override/default direction paths against a disposable fixture instead of
# the real docs/data/notebook-section-order.json.
CAPS_FILE="${NOTEBOOK_COMPOSE_CAPS_FILE:-$REPO_ROOT/docs/data/file-size-caps.json}"
ORDER_FILE="${NOTEBOOK_COMPOSE_ORDER_FILE:-$REPO_ROOT/docs/data/notebook-section-order.json}"

# nc_grep_count <pattern> — reads stdin, prints a single integer count line.
# `grep -c` ALREADY prints "0" (not nothing) when a pattern matches zero
# lines, but STILL exits 1 in that case — a naive `grep -c PATTERN || echo 0`
# guard therefore prints TWO lines ("0\n0") on the zero-match case (grep's own
# "0" plus the fallback's second "0"), corrupting every downstream `-eq`/`-gt`
# integer comparison (found live, during this script's own manual smoke-
# testing, before it ever shipped — see decision journal). This helper
# captures grep's stdout UNCONDITIONALLY (exit code discarded on purpose,
# `grep -c` always prints exactly one line on any successful invocation
# regardless of match count) and only falls back to "0" when NOTHING was
# printed at all (a genuine grep crash — e.g. bad PATTERN — not "zero
# matches", which already printed its own correct "0").
nc_grep_count() {
  local pattern="$1" count
  count="$(grep -c "$pattern" 2>/dev/null)"
  [ -z "$count" ] && count=0
  printf '%s\n' "$count"
}

# ── 0. Usage guard ────────────────────────────────────────────────────────
NOTEBOOK_PATH="${1:-}"
NEW_SECTION_FILE="${2:-}"
MAX_SECTIONS="${3:-3}"
SECTION_CAP="${4:-60}"

usage_error() {
  echo "[notebook-compose] ERROR bad-usage — usage: notebook-compose.sh <notebook-path> <new-section-body-file> [max-sections=3] [section-cap=60]"
  exit 2
}

[ -z "$NOTEBOOK_PATH" ] && usage_error
[ -z "$NEW_SECTION_FILE" ] && usage_error
case "$MAX_SECTIONS" in ''|*[!0-9]*) usage_error ;; esac
case "$SECTION_CAP" in ''|*[!0-9]*) usage_error ;; esac
[ "$MAX_SECTIONS" -lt 1 ] && usage_error
[ "$SECTION_CAP" -lt 1 ] && usage_error

if [ ! -f "$NOTEBOOK_PATH" ]; then
  echo "[notebook-compose] ERROR notebook-not-found $NOTEBOOK_PATH"
  exit 2
fi
if [ ! -f "$NEW_SECTION_FILE" ]; then
  echo "[notebook-compose] ERROR new-section-file-not-found $NEW_SECTION_FILE"
  exit 2
fi

# ── 1. Read + validate the new section (the ONLY free-form caller input) ───
NEW_RAW="$(cat "$NEW_SECTION_FILE")"
# Strip leading blank lines so a caller-supplied leading newline doesn't
# defeat the "first non-blank line must be a heading" check below.
NEW_TRIMMED_LEADING="$(printf '%s\n' "$NEW_RAW" | awk 'BEGIN{started=0} /^[[:space:]]*$/ && !started{next} {started=1; print}')"

if [ -z "$NEW_TRIMMED_LEADING" ]; then
  echo "[notebook-compose] ERROR new-section-empty $NEW_SECTION_FILE"
  exit 2
fi

FIRST_LINE="$(printf '%s\n' "$NEW_TRIMMED_LEADING" | head -1)"
case "$FIRST_LINE" in
  "## "*) ;;
  *)
    echo "[notebook-compose] ERROR new-section-missing-heading — first non-blank line must start with '## '"
    exit 2
    ;;
esac

NEW_HEADING_COUNT="$(printf '%s\n' "$NEW_TRIMMED_LEADING" | nc_grep_count '^## ')"
if [ "$NEW_HEADING_COUNT" -ne 1 ]; then
  echo "[notebook-compose] ERROR new-section-multiple-headings — new-section-body-file must contain exactly ONE '## ' heading"
  exit 2
fi

NEW_BLOB="$NEW_TRIMMED_LEADING"
NEW_LINES="$(printf '%s\n' "$NEW_BLOB" | wc -l | tr -d ' ')"
if [ "$NEW_LINES" -gt "$SECTION_CAP" ]; then
  NEW_BLOB="$(printf '%s\n' "$NEW_BLOB" | head -n "$SECTION_CAP")"
  echo "[notebook-compose] WARN new-section-trimmed-to-cap orig_lines=$NEW_LINES cap=$SECTION_CAP"
fi
# Ensure exactly one trailing blank line separates this section from whatever
# follows it once assembled (matches the live notebook corpus's own spacing
# convention; harmless no-op if already blank).
case "$(printf '%s\n' "$NEW_BLOB" | tail -1)" in
  "") ;;
  *) NEW_BLOB="$(printf '%s\n\n' "$NEW_BLOB")" ;;
esac

# ── 2. Split the EXISTING file into preamble + ordered section blobs ───────
# (READ-ONLY capture — these arrays are never mutated, only referenced, so
# they double as the "pre-write truth" the belt-and-suspenders check in step 8
# compares against.)
PREAMBLE="$(awk '/^## /{exit} {print}' "$NOTEBOOK_PATH")"

FIRST_SECTION_LINE="$(grep -n '^## ' "$NOTEBOOK_PATH" | head -1 | cut -d: -f1 || true)"

EXISTING_HEADING=()
EXISTING_BLOB=()

if [ -n "$FIRST_SECTION_LINE" ]; then
  EXISTING_BODY="$(tail -n "+$FIRST_SECTION_LINE" "$NOTEBOOK_PATH")"
  N_EXISTING="$(printf '%s\n' "$EXISTING_BODY" | nc_grep_count '^## ')"
  i=1
  while [ "$i" -le "$N_EXISTING" ]; do
    blob="$(printf '%s\n' "$EXISTING_BODY" | awk -v want="$i" 'BEGIN{c=0} /^## / {c++} c==want {print}')"
    EXISTING_HEADING+=("$(printf '%s\n' "$blob" | head -1)")
    EXISTING_BLOB+=("$blob")
    i=$((i + 1))
  done
else
  N_EXISTING=0
fi
PRE_COUNT="$N_EXISTING"

# ── 3. Derive direction (REUSED lib — AC-2, see header) ─────────────────────
if [ "$N_EXISTING" -gt 0 ]; then
  SECTIONS_WITH_TS="$(printf '%s\n' "$EXISTING_BODY" | nso_sections_with_ts)"
else
  SECTIONS_WITH_TS=""
fi
RESOLVED="$(nso_resolve_direction "$SECTIONS_WITH_TS" "$(basename "$NOTEBOOK_PATH")" "$ORDER_FILE")"
DIRECTION="${RESOLVED%% *}"
DIRECTION_SOURCE="${RESOLVED##* }"
if [ "$DIRECTION_SOURCE" = "default" ] || [ "$DIRECTION_SOURCE" = "override" ]; then
  echo "[notebook-compose] WARN direction-defaulted file=$(basename "$NOTEBOOK_PATH") applied=$DIRECTION source=$DIRECTION_SOURCE"
fi

# ── 4. Build the ordered FINAL array (new section inserted per DIRECTION) ──
# FINAL_SRC[i] tracks provenance: "NEW" or the 0-based index into
# EXISTING_BLOB/EXISTING_HEADING — this is what step 8's invariant check
# walks to determine which original sections survived.
FINAL_BLOB=()
FINAL_SRC=()
if [ "$DIRECTION" = "newest_first" ]; then
  FINAL_BLOB=("$NEW_BLOB")
  FINAL_SRC=("NEW")
  idx=0
  while [ "$idx" -lt "$N_EXISTING" ]; do
    FINAL_BLOB+=("${EXISTING_BLOB[$idx]}")
    FINAL_SRC+=("$idx")
    idx=$((idx + 1))
  done
else
  idx=0
  while [ "$idx" -lt "$N_EXISTING" ]; do
    FINAL_BLOB+=("${EXISTING_BLOB[$idx]}")
    FINAL_SRC+=("$idx")
    idx=$((idx + 1))
  done
  FINAL_BLOB+=("$NEW_BLOB")
  FINAL_SRC+=("NEW")
fi

# ── 5. Retention drop-loop — converge to <= MAX_SECTIONS, never drops NEW ───
DROPPED_COUNT=0
while [ "${#FINAL_BLOB[@]}" -gt "$MAX_SECTIONS" ]; do
  len="${#FINAL_BLOB[@]}"
  if [ "$DIRECTION" = "newest_first" ]; then
    # Drop tail (physically last = oldest).
    FINAL_BLOB=("${FINAL_BLOB[@]:0:$((len - 1))}")
    FINAL_SRC=("${FINAL_SRC[@]:0:$((len - 1))}")
  else
    # Drop head (physically first = oldest).
    FINAL_BLOB=("${FINAL_BLOB[@]:1}")
    FINAL_SRC=("${FINAL_SRC[@]:1}")
  fi
  DROPPED_COUNT=$((DROPPED_COUNT + 1))
done

# ── 6. AC-2b — permanent-accumulator heading sub-block intra-prune ─────────
drop_oldest_subblock() {
  # $1=blob $2=direction ; prints the (possibly) pruned blob on stdout.
  local blob="$1" direction="$2" n sub_lines target_line next_line
  n="$(printf '%s\n' "$blob" | nc_grep_count '^### ')"
  if [ "$n" -le 3 ]; then
    printf '%s\n' "$blob"
    return 0
  fi
  sub_lines="$(printf '%s\n' "$blob" | grep -n '^### ' | cut -d: -f1)"
  if [ "$direction" = "oldest_first" ]; then
    target_line="$(printf '%s\n' "$sub_lines" | head -1)"
  else
    target_line="$(printf '%s\n' "$sub_lines" | tail -1)"
  fi
  next_line="$(printf '%s\n' "$sub_lines" | awk -v t="$target_line" '$1>t{print;exit}')"
  if [ -z "$next_line" ]; then
    printf '%s\n' "$blob" | awk -v t="$target_line" 'NR<t{print}'
  else
    printf '%s\n' "$blob" | awk -v t="$target_line" -v nx="$next_line" 'NR<t || NR>=nx{print}'
  fi
}

# nc_subblock_sections_with_ts mirrors nso_sections_with_ts (lib) but for
# "### " boundaries instead of "## " — a distinct structural level, not a
# reimplementation of the same thing. Reuses nso_ts_key (already heading-
# level-agnostic) so the vote/tie-break ALGORITHM itself (nso_vote_direction)
# is still the ONE shared implementation, just fed a different boundary
# extraction. DECISION: sub-block chronology is NOT assumed to match the
# file's own top-level DIRECTION — the live template
# ("### Chef Dish — <type> HH:MM UTC", no calendar date) carries no
# parseable timestamp at all, so self-derivation will almost always yield no
# signal for this specific heading shape today; falling back to a SECOND
# hardcoded default here (independent of the file's own already-resolved
# DIRECTION) risks silently disagreeing with it for no reason. Falls back to
# the file's own resolved $DIRECTION (already computed above, not a new
# constant) only when the sub-blocks themselves give zero signal — self-
# derivation still wins whenever sub-headings DO carry real dates.
nc_subblock_sections_with_ts() {
  grep -n '^### ' | while IFS=: read -r line_num heading; do
    local key
    key="$(nso_ts_key "$heading")"
    echo "$line_num:$key:$heading"
  done
}

AC2B_DROPPED=0
i=0
while [ "$i" -lt "${#FINAL_BLOB[@]}" ]; do
  heading_line="$(printf '%s\n' "${FINAL_BLOB[$i]}" | head -1)"
  if [ "$heading_line" = "## Prior cycles" ]; then
    blob="${FINAL_BLOB[$i]}"
    before_n="$(printf '%s\n' "$blob" | nc_grep_count '^### ')"
    if [ "$before_n" -gt 3 ]; then
      SUB_SECTIONS_WITH_TS="$(printf '%s\n' "$blob" | nc_subblock_sections_with_ts)"
      SUB_DIRECTION="$(printf '%s\n' "$SUB_SECTIONS_WITH_TS" | nso_vote_direction)"
      [ -z "$SUB_DIRECTION" ] && SUB_DIRECTION="$DIRECTION"
    fi
    while [ "$before_n" -gt 3 ]; do
      blob="$(drop_oldest_subblock "$blob" "$SUB_DIRECTION")"
      AC2B_DROPPED=$((AC2B_DROPPED + 1))
      before_n="$(printf '%s\n' "$blob" | nc_grep_count '^### ')"
    done
    FINAL_BLOB[$i]="$blob"
  fi
  i=$((i + 1))
done
if [ "$AC2B_DROPPED" -gt 0 ]; then
  echo "[notebook-compose] WARN ac2b-subblock-pruned heading=\"Prior cycles\" dropped=$AC2B_DROPPED"
fi

# ── 7. Dual-axis 200L/12000B backstop (never drops the sole-remaining section) ──
LINE_CAP="$(jq -r '.caps[] | select(.pattern=="docs/agent-memory/notebooks/*.md") | .cap' "$CAPS_FILE" 2>/dev/null | head -1)"
case "$LINE_CAP" in ''|*[!0-9]*) LINE_CAP=200 ;; esac
BYTE_CAP=$((LINE_CAP * 60))

# Command substitution ($(...) capture, used everywhere above to hold a
# section's content in a variable) always strips ALL trailing blank
# lines/newlines from the captured value — so every FINAL_BLOB[i] element is
# already guaranteed to end on its own last real content line, never a
# trailing blank. This assembler is what re-inserts exactly ONE blank-line
# separator between the preamble and the first section, and between each
# consecutive section — matching the live notebook corpus's own readability
# convention. This is SAFE re: AC-2a immutability: scripts/git-hooks/pre-
# commit's `_notebook_section_hashes` already trims trailing blank (AND
# '---' divider) lines before hashing each retained section specifically
# because a shifted blank-line count is a KNOWN, already-fixed false-positive
# class (see that function's own comment, citing commit 01e50dbcbac6661b) —
# normalizing separator spacing here can never trip that gate.
assemble_body() {
  if [ -n "$PREAMBLE" ]; then
    printf '%s\n' "$PREAMBLE"
    printf '\n'
  fi
  local j=0 n="${#FINAL_BLOB[@]}"
  while [ "$j" -lt "$n" ]; do
    printf '%s\n' "${FINAL_BLOB[$j]}"
    [ "$j" -lt "$((n - 1))" ] && printf '\n'
    j=$((j + 1))
  done
}

BACKSTOP_DROPPED=0
while true; do
  # Piped DIRECTLY into wc (never round-tripped through a $(...)-captured
  # variable first) — command substitution strips trailing newlines, which
  # would silently undercount by 1 line/byte relative to the REAL file this
  # same assemble_body call writes in step 9 (a bug caught during manual
  # smoke-testing before this script ever landed — see decision journal).
  LINE_COUNT="$(assemble_body | wc -l | tr -d ' ')"
  BYTE_COUNT="$(assemble_body | wc -c | tr -d ' ')"
  [ "$LINE_COUNT" -le "$LINE_CAP" ] && [ "$BYTE_COUNT" -le "$BYTE_CAP" ] && break

  if [ "${#FINAL_BLOB[@]}" -le 1 ]; then
    echo "[notebook-compose] ABORT single-section-overage lines=$LINE_COUNT cap=$LINE_CAP bytes=$BYTE_COUNT byte_cap=$BYTE_CAP"
    exit 1
  fi

  len="${#FINAL_BLOB[@]}"
  if [ "$DIRECTION" = "newest_first" ]; then
    FINAL_BLOB=("${FINAL_BLOB[@]:0:$((len - 1))}")
    FINAL_SRC=("${FINAL_SRC[@]:0:$((len - 1))}")
  else
    FINAL_BLOB=("${FINAL_BLOB[@]:1}")
    FINAL_SRC=("${FINAL_SRC[@]:1}")
  fi
  DROPPED_COUNT=$((DROPPED_COUNT + 1))
  BACKSTOP_DROPPED=$((BACKSTOP_DROPPED + 1))
done

# ── 8. Belt-and-suspenders internal invariant check (pre-write, in-memory) ─
# 8a. Heading-count arithmetic: composed heading count must equal
#     (retained-original-count + 1-for-new). Retained-original-count is
#     derivable two independent ways (PRE_COUNT - DROPPED_COUNT, and a literal
#     count of "NEW"-vs-index entries still in FINAL_SRC) — cross-checked.
ACTUAL_HEADING_COUNT="$(assemble_body | nc_grep_count '^## ')"
RETAINED_BY_ARITHMETIC=$((PRE_COUNT - DROPPED_COUNT))
RETAINED_BY_SRC=0
i=0
while [ "$i" -lt "${#FINAL_SRC[@]}" ]; do
  [ "${FINAL_SRC[$i]}" != "NEW" ] && RETAINED_BY_SRC=$((RETAINED_BY_SRC + 1))
  i=$((i + 1))
done
EXPECTED_HEADING_COUNT=$((RETAINED_BY_SRC + 1))

if [ "$RETAINED_BY_ARITHMETIC" -ne "$RETAINED_BY_SRC" ]; then
  echo "[notebook-compose] ABORT internal-invariant-violated retained-count-mismatch arithmetic=$RETAINED_BY_ARITHMETIC src-tracked=$RETAINED_BY_SRC"
  exit 1
fi
if [ "$ACTUAL_HEADING_COUNT" -ne "$EXPECTED_HEADING_COUNT" ]; then
  echo "[notebook-compose] ABORT internal-invariant-violated heading-count-mismatch expected=$EXPECTED_HEADING_COUNT actual=$ACTUAL_HEADING_COUNT"
  exit 1
fi

# 8b. Byte-identity of every retained original section (the DIRECT proof the
#     0fcc6a5d2 shape cannot land: either every retained blob is untouched, or
#     this ABORTs and nothing is written — no in-between state is reachable).
i=0
while [ "$i" -lt "${#FINAL_SRC[@]}" ]; do
  src="${FINAL_SRC[$i]}"
  if [ "$src" != "NEW" ]; then
    orig_heading="${EXISTING_HEADING[$src]}"
    if [ "$orig_heading" != "## Prior cycles" ]; then
      if [ "${FINAL_BLOB[$i]}" != "${EXISTING_BLOB[$src]}" ]; then
        echo "[notebook-compose] ABORT internal-invariant-violated retained-section-mutated heading=\"$orig_heading\""
        exit 1
      fi
    fi
  fi
  i=$((i + 1))
done

# ── 9. Atomic write: mktemp + mv (never a Claude Write/Edit tool call) ─────
TEMP="$(mktemp 2>/dev/null || true)"
if [ -z "$TEMP" ]; then
  echo "[notebook-compose] ERROR tmpfile-write-failed"
  exit 1
fi

assemble_body > "$TEMP" 2>/dev/null
if [ ! -s "$TEMP" ]; then
  rm -f "$TEMP"
  echo "[notebook-compose] ERROR tmpfile-write-failed"
  exit 1
fi

if ! mv "$TEMP" "$NOTEBOOK_PATH" 2>/dev/null; then
  rm -f "$TEMP"
  echo "[notebook-compose] ERROR atomic-mv-failed"
  exit 1
fi

FINAL_LINES="$(wc -l < "$NOTEBOOK_PATH" | tr -d ' ')"
FINAL_BYTES="$(wc -c < "$NOTEBOOK_PATH" | tr -d ' ')"
echo "[notebook-compose] OK sections=${#FINAL_BLOB[@]} dropped=$DROPPED_COUNT lines=$FINAL_LINES bytes=$FINAL_BYTES direction=$DIRECTION"
exit 0
