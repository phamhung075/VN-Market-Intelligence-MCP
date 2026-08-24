#!/usr/bin/env bash
# scripts/agents-flow/notebook-auto-prune.test.sh
#
# Regression test for FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES.
#
# PREMISE: notebook-auto-prune.sh's early-exit/loop-break were LINE-ONLY (<=200L).
# A byte cap already existed (context-bloat-backstop.sh TE-T24, LINE_CAP x 60 = 12000B)
# with a DETECTOR but no ACTUATOR — agents satisfied the enforced line constraint by
# writing denser lines, and the pruner never fired on the byte axis. This test proves
# the pruner now recounts BOTH axes and stops only when both are satisfied, and that
# the single-section safe-fail path (newly reachable on the byte axis) still refuses
# to truncate mid-section.
#
# Coverage (cited as instance 13 / sub-class 7 on
# SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP):
#   T1  ~150L / ~30KB, 6 sections   → byte-axis regression: PRUNED until bytes <= 12000
#                                      (currently: untouched pre-fix — line count never
#                                       breached 200 so the old actuator never fired).
#   T2  ~250L / ~4.4KB, 3 sections  → line-axis NOT regressed: still PRUNED to <= 200L.
#   T3  ~140L / well under 12000B, 2 sections → CLEAN, byte-and-line within cap, untouched
#                                      (mirrors T4 in context-bloat-backstop.test.sh).
#   T4  1 section, ~65L / ~18KB     → single-section safe-fail, BYTE-ONLY breach (newly
#                                      reachable path per the row's open question):
#                                      asserts option [a] chosen (honest signal, no
#                                      truncation) — content byte-identical before/after,
#                                      notebook_single_section_overage_breach emitted.
#
# T5-T7 added for FIX-NOTEBOOK-AUTOPRUNE-SAMEDAY-TIE-DROPS-NEWEST: 3+ "## " sections that
# share an IDENTICAL date-only heading (no time-of-day component) normalize to the SAME
# lossy 17-char sort key. A direction-BLIND tie-break (old code: stable sort on that key,
# `head -1`) always drops the physically-first tied section — correct only for an
# OLDEST-FIRST/APPEND notebook. For a NEWEST-FIRST/PREPEND notebook (new section written at
# the top, e.g. docs/agent-memory/notebooks/developer.md) that drops the just-written
# section instead of the true oldest one — silent data loss of the newest content.
#   T5  3 same-day sections, declared "newest_first" override → drops the PHYSICALLY-LAST
#                                      (bottom-most, true-oldest for a prepend file) tied
#                                      section, retains the two newer ones (including the
#                                      physically-first/newest section — the one the old
#                                      direction-blind code would have wrongly dropped).
#   T6  3 same-day sections, declared "oldest_first" override → drops the
#                                      PHYSICALLY-FIRST (top-most, true-oldest for an
#                                      append file) tied section, retains the two newer ones.
#   T7  3 same-day sections, NO declared override AND the file's own headings give zero
#                                      distinguishing timestamp signal → UPDATED by
#                                      FIX-NOTEBOOK-AUTOPRUNE-DIRECTION-UNRESOLVABLE-ZERO-
#                                      TS-NOTEBOOKS (2026-07-31): this exact shape can NEVER
#                                      self-resolve (no override will ever arrive for a
#                                      permanently-zero-signal file) so "refuse to guess
#                                      forever" left it unprunable past cap indefinitely
#                                      (confirmed live: unified-agent.md, digest-predict.md).
#                                      Now resolves via the documented default
#                                      (newest_first: drops the physically-LAST tied
#                                      section) and emits a non-blocking INFORMATIONAL
#                                      signal (notebook_tiebreak_direction_defaulted, NOT a
#                                      breach) instead of refusing to prune.
#
# T8 (UC-CRITIC-HOOKS-ENFORCEMENT FR-2): `jq` unavailable (PATH override) while
# reading the PostToolUse stdin payload → exit 1, not the pre-fix silent exit 0
# ("no file_path field" and "jq itself crashed" used to collapse to the same outcome).
# NOTE: the SEPARATE LINE_CAP-from-SSOT read further down this script (guarded by its
# own `case ... ''|*[!0-9]*) LINE_CAP=200` fallback) is DELIBERATELY left untouched by
# this fix — architect flagged it as already-safe/non-gating (see UC-CRITIC-HOOKS-
# ENFORCEMENT decision journal) — so no "malformed file-size-caps.json" case is added
# here (unlike context-bloat-backstop.test.sh's T5, a different call site with no
# equivalent safe fallback).
#
# T9/T10 (FIX-NOTEBOOK-AUTOPRUNE-ROLLING-SECTIONS-BYTE-COUNTED-BUT-UNDROPPABLE AC-5/AC-6,
# occurrence 5, 2026-08-12): a mixed-heading notebook (some "## " sections carry a real
# YYYY-MM-DD token, some don't) makes nso_ts_key assign the undated ones $NSO_SENTINEL_KEY
# (MAX, correctly never "oldest") — but when only ONE section has a real timestamp, that
# lone section becomes MIN_KEY by DEFAULT (it is the only non-sentinel value present), so
# the old code selected it as "oldest" even when it was the file's NEWEST content. Live
# occurrence: docs/agent-memory/notebooks/agent-father.md 2026-08-12 (decision journal
# triage-20260812T1310Z-po.md) — a single "## EDIT <full-ISO>" heading was dropped against
# two undated "## Keep (maintenance) HH:MM" headings, deleting 53 lines of the newest work,
# with zero signal.
#   T9  (AC-5, must FAIL before/PASS after): 2 undated "## Keep ..." sections + 1 dated
#       "## EDIT <ISO>" section (newest, placed last), over the BYTE cap only. Pre-fix,
#       the dated EDIT section is dropped (verified live against `git show HEAD:` of this
#       script, see task decision journal). Fixed code must retain ALL THREE sections
#       (no valid drop candidate exists: sentinels are exempt by design, the lone dated
#       section is exempt by AC-5) and emit `notebook_no_valid_drop_candidate_breach`
#       instead of truncating.
#   T10 (AC-6, independent of AC-5): 1 undated sentinel + 3 same-day-tied dated sections
#       (identical date-only key — zero within-file evidence distinguishing them, same
#       shape as T5-T7 but with a sentinel also present), over the LINE cap only, sized so
#       exactly ONE drop converges. The dropped section necessarily carries the file's own
#       MAXIMUM non-sentinel key (all three tie) — asserts `notebook_prune_dropped_newest_
#       dated_section` fires and the prune still completes (non-blocking: unlike AC-5, a
#       write DOES land here since 2 dated sections + the sentinel remain afterward, so
#       cardinality never drops to the AC-5 trap).
#
# T11 (FIX-NSO-TS-KEY-COMMIT-SHA-DIGITS-PARSED-AS-DATE, 2026-08-14, AC-1/AC-2): the
# `## cycle-NNN · <ISO ts> · TASK-ID (agent, commit `<sha>`)` heading convention
# (qa.md's own citation shape) can carry an all-NUMERIC git short-SHA suffix. The
# old nso_ts_key() (`grep -oE <date-regex> | tail -1`) treated the T..Z time suffix
# as optional, so an 8-digit run anywhere later in the heading — an all-digit
# SHA — matched the same pattern as the real ISO timestamp, and `tail -1` always
# preferred whichever match landed LAST on the line: the SHA, not the timestamp.
# Live incident: cycle-705's heading (real ts 2026-08-14T01:33:11Z, trailing commit
# `761988143`) computed ts_key=76198814000000000 (from the SHA) instead of
# 20260814013311000 (from the real ts) — an inflated key that outranked every
# legitimate 2026-dated heading, so the genuinely NEWER cycle-711 section (whose
# correctly-computed key was legitimately smaller) was misidentified as "oldest"
# and dropped instead — destroying TASK-COWORK-MUTEX-001's CHANGES_REQUESTED
# review record with zero signal.
#   T11 reproduces the exact collision shape over the LINE cap only: 2 dated
#   sections, TASK-OLD (genuinely oldest, 2026-08-01, heading ALSO carries a
#   trailing all-digit commit SHA that a tail-1/optional-suffix regex would
#   mis-rank as newest) and TASK-COWORK-MUTEX-001 (genuinely newest, 2026-08-14,
#   hex SHA — never digit-collision-prone). Asserts the fixed nso_ts_key() drops
#   TASK-OLD (the true oldest) and retains TASK-COWORK-MUTEX-001 (the true
#   newest) — pre-fix this assertion FAILS (the SHA-confused key causes the
#   inverse drop).
#
# T12-T14 (FIX-NOTEBOOK-AUTOPRUNE-ROLLING-SECTIONS-BYTE-COUNTED-BUT-UNDROPPABLE
# AC-1..AC-4, MEASUREMENT-PLANE fix, 2026-08-24): T9/T10 above (AC-5/AC-6) close
# the SELECTION half of the two-plane bug but only intercept once the
# drop-oldest loop has already worked down to exactly ONE remaining dated
# section. T12 proves the residual MEASUREMENT half: a file with SEVERAL dated
# sections plus rolling ones whose bytes alone exceed cap wastefully virtual-
# drops 2+ dated sections in-memory pre-fix before AC-5 ever traps it, and the
# resulting signal misreports the file's post-virtual-drop shape instead of
# its true original one. T13 is the AC-2 negative (genuine dated bloat, small
# rolling — unaffected, drops exactly as today). T14 is the AC-3 ratchet
# replay (3 consecutive over-cap writes; retained dated-section count must
# never decrease). T15 is the GREP-C-EXIT-1-DOUBLE-FIRE fix: the same ticket's
# own AC-6 signal (notebook_prune_dropped_newest_dated_section) was found live,
# the same day, emitting INVALID JSON on every zero-sentinel file because
# `grep -c PATTERN 2>/dev/null || echo 0` double-fires when the count is
# legitimately zero (grep -c exits 1 on no-match even though it printed "0").
#
# Run:
#   bash scripts/agents-flow/notebook-auto-prune.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning tasks: FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES (T1-T4),
#               FIX-NOTEBOOK-AUTOPRUNE-SAMEDAY-TIE-DROPS-NEWEST (T5-T7 as originally shipped),
#               FIX-NOTEBOOK-AUTOPRUNE-DIRECTION-UNRESOLVABLE-ZERO-TS-NOTEBOOKS (T7 updated
#               2026-07-31 — old assertion encoded the exact "refuse forever" anti-pattern
#               this task closes; see docs/data/notebook-section-order.json for AC-2 context),
#               FIX-NOTEBOOK-AUTOPRUNE-ROLLING-SECTIONS-BYTE-COUNTED-BUT-UNDROPPABLE (T9-T10,
#               AC-5/AC-6, occurrence 5, 2026-08-12; T12-T15, AC-1..AC-4 + grep-c
#               double-fire, 2026-08-24),
#               UC-CRITIC-HOOKS-ENFORCEMENT (T8),
#               FIX-NSO-TS-KEY-COMMIT-SHA-DIGITS-PARSED-AS-DATE (T11, 2026-08-14)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PRUNE_SH="$SCRIPT_DIR/notebook-auto-prune.sh"

if [ ! -f "$PRUNE_SH" ]; then
  echo "ERROR: prune script not found at $PRUNE_SH" >&2
  exit 1
fi

# ── Isolated test environment ─────────────────────────────────────────────────
TMPDIR_TEST=$(mktemp -d /private/tmp/notebook-prune-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

# Minimal git repo so git rev-parse --show-toplevel resolves to TMPDIR_TEST
(cd "$TMPDIR_TEST" && git init -q .)

mkdir -p "$TMPDIR_TEST/docs/data"
mkdir -p "$TMPDIR_TEST/docs/signals"
mkdir -p "$TMPDIR_TEST/docs/agent-memory/notebooks"

# SSOT fixture — SAME shape as the real docs/data/file-size-caps.json row the pruner
# derives LINE_CAP/BYTE_CAP from (cap=200 → BYTE_CAP=200*60=12000).
cat > "$TMPDIR_TEST/docs/data/file-size-caps.json" <<'JSON'
{
  "_ssot": "test-fixture",
  "caps": [
    {
      "pattern": "docs/agent-memory/notebooks/archive/*.md",
      "cap": 9999,
      "class": "agent-notebook-archive",
      "exempt": true
    },
    {
      "pattern": "docs/agent-memory/notebooks/*.md",
      "cap": 200,
      "class": "agent-notebook"
    }
  ]
}
JSON

# SSOT fixture — SAME shape as the real docs/data/notebook-section-order.json the pruner
# consults ONLY for same-day tie-break direction when a file's own headings can't disambiguate
# (T5/T6 declare an override; T7 deliberately has NO entry to test the unresolved safe-fail).
cat > "$TMPDIR_TEST/docs/data/notebook-section-order.json" <<'JSON'
{
  "_ssot": "test-fixture",
  "overrides": {
    "sameday-tie-prepend.md": "newest_first",
    "sameday-tie-append.md": "oldest_first"
  }
}
JSON

PASS=0
FAIL=0

run_prune() {
  local file_path="$1"
  local json="{\"tool_input\":{\"file_path\":\"$file_path\"}}"
  (cd "$TMPDIR_TEST" && echo "$json" | bash "$PRUNE_SH")
}

# UC-CRITIC-HOOKS-ENFORCEMENT FR-2 crash-injection variant — runs with a caller-supplied
# PATH so a test can simulate a missing prerequisite binary (e.g. jq).
run_prune_with_path() {
  local file_path="$1" test_path="$2"
  local json="{\"tool_input\":{\"file_path\":\"$file_path\"}}"
  (cd "$TMPDIR_TEST" && echo "$json" | PATH="$test_path" bash "$PRUNE_SH")
}

dense_section() {
  # $1=heading (e.g. "SECTION-1 · 2026-07-01T10:00:00Z") $2=content_lines $3=line_width
  local heading="$1" content_lines="$2" width="$3"
  echo "## $heading"
  echo ""
  awk -v n="$content_lines" -v w="$width" 'BEGIN{
    line = "";
    for (c = 1; c <= w; c++) line = line "x";
    for (i = 1; i <= n; i++) print line;
  }'
  echo ""
}

signal_count() {
  local name_glob="$1"
  find "$TMPDIR_TEST/docs/signals" -maxdepth 1 -name "$name_glob" 2>/dev/null | wc -l | tr -d ' '
}

# ── T1: byte-axis regression — under line cap, over byte cap, multi-section ─────
# 6 sections, oldest→newest timestamps, dense (250-char) content lines.
T1_FILE="$TMPDIR_TEST/docs/agent-memory/notebooks/byte-axis.md"
{
  echo "# Byte-Axis Regression Notebook"
  echo ""
  echo "Preamble text."
  echo ""
  dense_section "SECTION-1 · 2026-07-01T10:00:00Z" 20 250
  dense_section "SECTION-2 · 2026-07-02T10:00:00Z" 20 250
  dense_section "SECTION-3 · 2026-07-03T10:00:00Z" 20 250
  dense_section "SECTION-4 · 2026-07-04T10:00:00Z" 20 250
  dense_section "SECTION-5 · 2026-07-05T10:00:00Z" 20 250
  dense_section "SECTION-6 · 2026-07-06T10:00:00Z" 20 250
} > "$T1_FILE"

T1_LINES_BEFORE=$(wc -l < "$T1_FILE" | tr -d ' ')
T1_BYTES_BEFORE=$(wc -c < "$T1_FILE" | tr -d ' ')

if [ "$T1_LINES_BEFORE" -gt 200 ] || [ "$T1_BYTES_BEFORE" -le 12000 ]; then
  echo "FAIL T1 (fixture invalid): lines=$T1_LINES_BEFORE bytes=$T1_BYTES_BEFORE — expected lines<=200 AND bytes>12000 pre-run"
  FAIL=$((FAIL + 1))
else
  run_prune "$T1_FILE"
  T1_LINES_AFTER=$(wc -l < "$T1_FILE" | tr -d ' ')
  T1_BYTES_AFTER=$(wc -c < "$T1_FILE" | tr -d ' ')
  T1_SECTIONS_AFTER=$(grep -c "^## " "$T1_FILE" 2>/dev/null || echo 0)
  T1_SAFEFAIL=$(signal_count "notebook-single-section-breach-*.json")

  if [ "$T1_BYTES_AFTER" -le 12000 ] && [ "$T1_LINES_AFTER" -le 200 ] && [ "$T1_SECTIONS_AFTER" -ge 1 ] && [ "$T1_SAFEFAIL" = "0" ]; then
    echo "PASS T1: byte-axis regression — ${T1_LINES_BEFORE}L/${T1_BYTES_BEFORE}B (under line cap, over byte cap) → pruned to ${T1_LINES_AFTER}L/${T1_BYTES_AFTER}B, $T1_SECTIONS_AFTER section(s) remain, no safe-fail"
    PASS=$((PASS + 1))
  else
    echo "FAIL T1: after=${T1_LINES_AFTER}L/${T1_BYTES_AFTER}B sections=$T1_SECTIONS_AFTER safefail_signals=$T1_SAFEFAIL (expected bytes<=12000, lines<=200, sections>=1, 0 safe-fail signals)"
    FAIL=$((FAIL + 1))
  fi
fi

# ── T2: line-axis NOT regressed — over line cap, well under byte cap ────────────
# 3 sections, short/narrow content lines, oldest→newest timestamps.
T2_FILE="$TMPDIR_TEST/docs/agent-memory/notebooks/line-axis.md"
{
  echo "# Line-Axis Notebook"
  echo ""
  echo "Preamble text."
  echo ""
  for section in 1 2 3; do
    echo "## SECTION-$section · 2026-07-0${section}T10:00:00Z"
    echo ""
    seq 1 79 | while read -r i; do echo "content line $i"; done
    echo ""
  done
} > "$T2_FILE"

T2_LINES_BEFORE=$(wc -l < "$T2_FILE" | tr -d ' ')
T2_BYTES_BEFORE=$(wc -c < "$T2_FILE" | tr -d ' ')

if [ "$T2_LINES_BEFORE" -le 200 ] || [ "$T2_BYTES_BEFORE" -gt 12000 ]; then
  echo "FAIL T2 (fixture invalid): lines=$T2_LINES_BEFORE bytes=$T2_BYTES_BEFORE — expected lines>200 AND bytes<=12000 pre-run"
  FAIL=$((FAIL + 1))
else
  run_prune "$T2_FILE"
  T2_LINES_AFTER=$(wc -l < "$T2_FILE" | tr -d ' ')
  T2_SAFEFAIL=$(signal_count "notebook-single-section-breach-*.json")

  if [ "$T2_LINES_AFTER" -le 200 ] && [ "$T2_SAFEFAIL" = "0" ]; then
    echo "PASS T2: line-axis regression guard — ${T2_LINES_BEFORE}L/${T2_BYTES_BEFORE}B (over line cap, under byte cap) → pruned to ${T2_LINES_AFTER}L, no safe-fail"
    PASS=$((PASS + 1))
  else
    echo "FAIL T2: after=${T2_LINES_AFTER}L safefail_signals=$T2_SAFEFAIL (expected lines<=200, 0 safe-fail signals)"
    FAIL=$((FAIL + 1))
  fi
fi

# ── T3: within BOTH caps → untouched, no false positive ─────────────────────────
T3_FILE="$TMPDIR_TEST/docs/agent-memory/notebooks/clean.md"
{
  echo "# Clean Notebook"
  echo ""
  echo "Preamble text."
  echo ""
  for section in 1 2; do
    echo "## SECTION-$section · 2026-07-0${section}T10:00:00Z"
    echo ""
    seq 1 60 | while read -r i; do echo "content line $i"; done
    echo ""
  done
} > "$T3_FILE"

T3_LINES_BEFORE=$(wc -l < "$T3_FILE" | tr -d ' ')
T3_BYTES_BEFORE=$(wc -c < "$T3_FILE" | tr -d ' ')

if [ "$T3_LINES_BEFORE" -gt 200 ] || [ "$T3_BYTES_BEFORE" -gt 12000 ]; then
  echo "FAIL T3 (fixture invalid): lines=$T3_LINES_BEFORE bytes=$T3_BYTES_BEFORE — expected BOTH within cap pre-run"
  FAIL=$((FAIL + 1))
else
  T3_HASH_BEFORE="$(shasum -a 256 "$T3_FILE" | cut -d' ' -f1)"
  run_prune "$T3_FILE"
  T3_HASH_AFTER="$(shasum -a 256 "$T3_FILE" | cut -d' ' -f1)"

  if [ "$T3_HASH_BEFORE" = "$T3_HASH_AFTER" ]; then
    echo "PASS T3: clean.md ${T3_LINES_BEFORE}L/${T3_BYTES_BEFORE}B (within both caps) → untouched (no false positive)"
    PASS=$((PASS + 1))
  else
    echo "FAIL T3: clean.md within both caps but content CHANGED (unexpected prune)"
    FAIL=$((FAIL + 1))
  fi
fi

# ── T4: single-section safe-fail, BYTE-ONLY breach — newly reachable path ───────
# Exactly 1 "## " section; well under the 200L line cap but well over the 12000B
# byte cap (the path the PO's row explicitly flags as "newly reachable"). Asserts
# option [a]: honest signal, NO mid-section truncation.
T4_FILE="$TMPDIR_TEST/docs/agent-memory/notebooks/single-section.md"
{
  echo "# Single-Section Notebook"
  echo ""
  echo "Preamble text."
  echo ""
  dense_section "ONLY-SECTION · 2026-07-01T10:00:00Z" 60 300
} > "$T4_FILE"

T4_LINES_BEFORE=$(wc -l < "$T4_FILE" | tr -d ' ')
T4_BYTES_BEFORE=$(wc -c < "$T4_FILE" | tr -d ' ')

if [ "$T4_LINES_BEFORE" -gt 200 ] || [ "$T4_BYTES_BEFORE" -le 12000 ]; then
  echo "FAIL T4 (fixture invalid): lines=$T4_LINES_BEFORE bytes=$T4_BYTES_BEFORE — expected lines<=200 (byte-ONLY breach) AND bytes>12000 pre-run"
  FAIL=$((FAIL + 1))
else
  T4_HASH_BEFORE="$(shasum -a 256 "$T4_FILE" | cut -d' ' -f1)"
  T4_SAFEFAIL_BEFORE=$(signal_count "notebook-single-section-breach-*.json")

  run_prune "$T4_FILE"

  T4_HASH_AFTER="$(shasum -a 256 "$T4_FILE" | cut -d' ' -f1)"
  T4_SAFEFAIL_AFTER=$(signal_count "notebook-single-section-breach-*.json")
  T4_SIG_FILE=$(find "$TMPDIR_TEST/docs/signals" -maxdepth 1 -name "notebook-single-section-breach-*.json" 2>/dev/null | head -1 || true)
  T4_SIG_REASON_OK=0
  if [ -n "$T4_SIG_FILE" ]; then
    T4_BYTE_CAP_IN_PAYLOAD=$(jq -r '.payload.byte_cap // empty' "$T4_SIG_FILE" 2>/dev/null || true)
    [ "$T4_BYTE_CAP_IN_PAYLOAD" = "12000" ] && T4_SIG_REASON_OK=1
  fi

  if [ "$T4_HASH_BEFORE" = "$T4_HASH_AFTER" ] && [ "$T4_SAFEFAIL_AFTER" -gt "$T4_SAFEFAIL_BEFORE" ] && [ "$T4_SIG_REASON_OK" -eq 1 ]; then
    echo "PASS T4: single-section.md ${T4_LINES_BEFORE}L/${T4_BYTES_BEFORE}B (byte-only breach, line cap not tripped) → option [a] honored (content byte-identical, notebook_single_section_overage_breach emitted with byte_cap=12000, NO truncation)"
    PASS=$((PASS + 1))
  else
    echo "FAIL T4: hash_match=$([ "$T4_HASH_BEFORE" = "$T4_HASH_AFTER" ] && echo yes || echo no) safefail_before=$T4_SAFEFAIL_BEFORE safefail_after=$T4_SAFEFAIL_AFTER byte_cap_in_payload=${T4_BYTE_CAP_IN_PAYLOAD:-<none>}"
    FAIL=$((FAIL + 1))
  fi
fi

# ── T5: same-day tie-break — NEWEST-FIRST/PREPEND convention declared ───────────
# 3 sections share an IDENTICAL date-only heading (no time-of-day — permanently ambiguous
# by timestamp alone). Physical order simulates a real PREPEND notebook (e.g.
# docs/agent-memory/notebooks/developer.md): newest write lands at the TOP, true oldest is
# physically-LAST (bottom-most). notebook-section-order.json declares "newest_first" for
# this filename.
T5_FILE="$TMPDIR_TEST/docs/agent-memory/notebooks/sameday-tie-prepend.md"
{
  echo "# Sameday-Tie Prepend Notebook"
  echo ""
  echo "Preamble text."
  echo ""
  dense_section "Session 2026-07-30 — TASK-C (newest, written last, physically TOP)" 70 20
  dense_section "Session 2026-07-30 — TASK-B (middle)" 70 20
  dense_section "Session 2026-07-30 — TASK-A (oldest, written first, physically BOTTOM)" 70 20
} > "$T5_FILE"

T5_LINES_BEFORE=$(wc -l < "$T5_FILE" | tr -d ' ')

if [ "$T5_LINES_BEFORE" -le 200 ]; then
  echo "FAIL T5 (fixture invalid): lines=$T5_LINES_BEFORE — expected >200 pre-run"
  FAIL=$((FAIL + 1))
else
  run_prune "$T5_FILE"
  T5_SECTIONS_AFTER=$(grep -c "^## " "$T5_FILE" 2>/dev/null || echo 0)
  T5_HAS_A=$(grep -c "TASK-A" "$T5_FILE" 2>/dev/null)
  T5_HAS_B=$(grep -c "TASK-B" "$T5_FILE" 2>/dev/null)
  T5_HAS_C=$(grep -c "TASK-C" "$T5_FILE" 2>/dev/null)
  T5_LINES_AFTER=$(wc -l < "$T5_FILE" | tr -d ' ')

  if [ "$T5_SECTIONS_AFTER" -eq 2 ] && [ "$T5_HAS_A" -eq 0 ] && [ "$T5_HAS_B" -ge 1 ] && [ "$T5_HAS_C" -ge 1 ] && [ "$T5_LINES_AFTER" -le 200 ]; then
    echo "PASS T5: prepend convention — dropped physically-LAST tied section (TASK-A, true oldest), retained TASK-B+TASK-C — incl. TASK-C, the physically-first/newest section a direction-blind tie-break would have wrongly dropped"
    PASS=$((PASS + 1))
  else
    echo "FAIL T5: sections_after=$T5_SECTIONS_AFTER has_A=$T5_HAS_A has_B=$T5_HAS_B has_C=$T5_HAS_C lines_after=$T5_LINES_AFTER (expected 2 sections, TASK-A dropped, TASK-B+TASK-C retained)"
    FAIL=$((FAIL + 1))
  fi
fi

# ── T6: same-day tie-break — OLDEST-FIRST/APPEND convention declared ────────────
# Mirror of T5: physical order simulates a real APPEND notebook (e.g.
# docs/agent-memory/notebooks/dev-mcp-server.md, dev-frontend.md): oldest write is at the
# TOP, newest write lands at the BOTTOM. notebook-section-order.json declares
# "oldest_first" for this filename.
T6_FILE="$TMPDIR_TEST/docs/agent-memory/notebooks/sameday-tie-append.md"
{
  echo "# Sameday-Tie Append Notebook"
  echo ""
  echo "Preamble text."
  echo ""
  dense_section "2026-07-30 — TASK-X (oldest, written first, physically TOP)" 70 20
  dense_section "2026-07-30 — TASK-Y (middle)" 70 20
  dense_section "2026-07-30 — TASK-Z (newest, written last, physically BOTTOM)" 70 20
} > "$T6_FILE"

T6_LINES_BEFORE=$(wc -l < "$T6_FILE" | tr -d ' ')

if [ "$T6_LINES_BEFORE" -le 200 ]; then
  echo "FAIL T6 (fixture invalid): lines=$T6_LINES_BEFORE — expected >200 pre-run"
  FAIL=$((FAIL + 1))
else
  run_prune "$T6_FILE"
  T6_SECTIONS_AFTER=$(grep -c "^## " "$T6_FILE" 2>/dev/null || echo 0)
  T6_HAS_X=$(grep -c "TASK-X" "$T6_FILE" 2>/dev/null)
  T6_HAS_Y=$(grep -c "TASK-Y" "$T6_FILE" 2>/dev/null)
  T6_HAS_Z=$(grep -c "TASK-Z" "$T6_FILE" 2>/dev/null)
  T6_LINES_AFTER=$(wc -l < "$T6_FILE" | tr -d ' ')

  if [ "$T6_SECTIONS_AFTER" -eq 2 ] && [ "$T6_HAS_X" -eq 0 ] && [ "$T6_HAS_Y" -ge 1 ] && [ "$T6_HAS_Z" -ge 1 ] && [ "$T6_LINES_AFTER" -le 200 ]; then
    echo "PASS T6: append convention — dropped physically-FIRST tied section (TASK-X, true oldest), retained TASK-Y+TASK-Z"
    PASS=$((PASS + 1))
  else
    echo "FAIL T6: sections_after=$T6_SECTIONS_AFTER has_X=$T6_HAS_X has_Y=$T6_HAS_Y has_Z=$T6_HAS_Z lines_after=$T6_LINES_AFTER (expected 2 sections, TASK-X dropped, TASK-Y+TASK-Z retained)"
    FAIL=$((FAIL + 1))
  fi
fi

# ── T7: same-day tie-break — direction DEFAULTS safely (no forced deadlock) ─────
# Same shape as T5/T6 but this filename has NO entry in notebook-section-order.json AND
# all 3 headings share the identical date-only key (zero distinguishing signal from the
# file's own content either) — this is a PERMANENT condition (no override will ever
# arrive, no future write to this file can create a distinguishing timestamp for a
# same-day tie). FIX-NOTEBOOK-AUTOPRUNE-DIRECTION-UNRESOLVABLE-ZERO-TS-NOTEBOOKS
# (2026-07-31): must now resolve via the documented default (newest_first: drops the
# physically-LAST tied section, TASK-R) and emit a non-blocking INFORMATIONAL signal
# (notebook_tiebreak_direction_defaulted) instead of refusing to prune forever.
T7_FILE="$TMPDIR_TEST/docs/agent-memory/notebooks/sameday-tie-unresolved.md"
{
  echo "# Sameday-Tie Unresolved Notebook"
  echo ""
  echo "Preamble text."
  echo ""
  dense_section "2026-07-30 — TASK-P" 70 20
  dense_section "2026-07-30 — TASK-Q" 70 20
  dense_section "2026-07-30 — TASK-R" 70 20
} > "$T7_FILE"

T7_LINES_BEFORE=$(wc -l < "$T7_FILE" | tr -d ' ')

if [ "$T7_LINES_BEFORE" -le 200 ]; then
  echo "FAIL T7 (fixture invalid): lines=$T7_LINES_BEFORE — expected >200 pre-run"
  FAIL=$((FAIL + 1))
else
  T7_SIG_BEFORE=$(signal_count "notebook-direction-defaulted-*.json")

  run_prune "$T7_FILE"

  T7_SIG_AFTER=$(signal_count "notebook-direction-defaulted-*.json")
  T7_SECTIONS_AFTER=$(grep -c "^## " "$T7_FILE" 2>/dev/null || echo 0)
  T7_HAS_P=$(grep -c "TASK-P" "$T7_FILE" 2>/dev/null)
  T7_HAS_Q=$(grep -c "TASK-Q" "$T7_FILE" 2>/dev/null)
  T7_HAS_R=$(grep -c "TASK-R" "$T7_FILE" 2>/dev/null)
  T7_LINES_AFTER=$(wc -l < "$T7_FILE" | tr -d ' ')
  T7_SIG_FILE=$(find "$TMPDIR_TEST/docs/signals" -maxdepth 1 -name "notebook-direction-defaulted-*.json" 2>/dev/null | head -1 || true)
  T7_SIG_TYPE_OK=0
  if [ -n "$T7_SIG_FILE" ]; then
    T7_SIG_TYPE="$(jq -r '.type // empty' "$T7_SIG_FILE" 2>/dev/null || true)"
    [ "$T7_SIG_TYPE" = "notebook_tiebreak_direction_defaulted" ] && T7_SIG_TYPE_OK=1
  fi

  if [ "$T7_SECTIONS_AFTER" -eq 2 ] && [ "$T7_HAS_R" -eq 0 ] && [ "$T7_HAS_P" -ge 1 ] && [ "$T7_HAS_Q" -ge 1 ] && \
     [ "$T7_LINES_AFTER" -le 200 ] && [ "$T7_SIG_AFTER" -gt "$T7_SIG_BEFORE" ] && [ "$T7_SIG_TYPE_OK" -eq 1 ]; then
    echo "PASS T7: zero-signal default applied — dropped physically-LAST tied section (TASK-R), retained TASK-P+TASK-Q, non-blocking informational signal emitted (notebook_tiebreak_direction_defaulted)"
    PASS=$((PASS + 1))
  else
    echo "FAIL T7: sections_after=$T7_SECTIONS_AFTER has_P=$T7_HAS_P has_Q=$T7_HAS_Q has_R=$T7_HAS_R lines_after=$T7_LINES_AFTER sig_before=$T7_SIG_BEFORE sig_after=$T7_SIG_AFTER sig_type_ok=$T7_SIG_TYPE_OK (expected 2 sections, TASK-R dropped, TASK-P+TASK-Q retained, informational signal emitted)"
    FAIL=$((FAIL + 1))
  fi
fi

# ── T9 (FIX-NOTEBOOK-AUTOPRUNE-ROLLING-SECTIONS-BYTE-COUNTED-BUT-UNDROPPABLE AC-5,
#      occurrence 5): mixed-convention inversion — lone dated section among sentinels ─
# 2 undated "## Keep (maintenance) HH:MM" sections (no YYYY-MM-DD token -> sentinel
# key) + 1 dated "## EDIT <full-ISO>" section (newest, physically last), over the BYTE
# cap only (well under the 200L line cap) — mirrors the live agent-father.md occurrence
# 5 shape exactly (decision journal triage-20260812T1310Z-po.md).
T9_FILE="$TMPDIR_TEST/docs/agent-memory/notebooks/mixed-heading-ac5.md"
{
  echo "# Mixed Heading Notebook"
  echo ""
  echo "Preamble text."
  echo ""
  dense_section "Keep (maintenance) 08:15 - old rolling note A" 40 250
  dense_section "Keep (maintenance) 12:58 - old rolling note B" 40 250
  dense_section "EDIT 2026-08-12T03:23:52Z - newest real content, must survive" 40 250
} > "$T9_FILE"

T9_LINES_BEFORE=$(wc -l < "$T9_FILE" | tr -d ' ')
T9_BYTES_BEFORE=$(wc -c < "$T9_FILE" | tr -d ' ')

if [ "$T9_LINES_BEFORE" -gt 200 ] || [ "$T9_BYTES_BEFORE" -le 12000 ]; then
  echo "FAIL T9 (fixture invalid): lines=$T9_LINES_BEFORE bytes=$T9_BYTES_BEFORE — expected lines<=200 (byte-ONLY breach) AND bytes>12000 pre-run"
  FAIL=$((FAIL + 1))
else
  T9_HASH_BEFORE="$(shasum -a 256 "$T9_FILE" | cut -d' ' -f1)"
  T9_SIG_BEFORE=$(signal_count "notebook-no-valid-drop-candidate-*.json")

  run_prune "$T9_FILE"

  T9_HASH_AFTER="$(shasum -a 256 "$T9_FILE" | cut -d' ' -f1)"
  T9_SIG_AFTER=$(signal_count "notebook-no-valid-drop-candidate-*.json")
  T9_HAS_EDIT=$(grep -c "EDIT 2026-08-12T03:23:52Z" "$T9_FILE" 2>/dev/null)
  T9_HAS_KEEP_A=$(grep -c "Keep (maintenance) 08:15" "$T9_FILE" 2>/dev/null)
  T9_HAS_KEEP_B=$(grep -c "Keep (maintenance) 12:58" "$T9_FILE" 2>/dev/null)
  T9_SIG_FILE=$(find "$TMPDIR_TEST/docs/signals" -maxdepth 1 -name "notebook-no-valid-drop-candidate-*.json" 2>/dev/null | head -1 || true)
  T9_SIG_TYPE_OK=0
  if [ -n "$T9_SIG_FILE" ]; then
    T9_SIG_TYPE="$(jq -r '.type // empty' "$T9_SIG_FILE" 2>/dev/null || true)"
    [ "$T9_SIG_TYPE" = "notebook_no_valid_drop_candidate_breach" ] && T9_SIG_TYPE_OK=1
  fi

  if [ "$T9_HASH_BEFORE" = "$T9_HASH_AFTER" ] && [ "$T9_HAS_EDIT" -eq 1 ] && [ "$T9_HAS_KEEP_A" -eq 1 ] && \
     [ "$T9_HAS_KEEP_B" -eq 1 ] && [ "$T9_SIG_AFTER" -gt "$T9_SIG_BEFORE" ] && [ "$T9_SIG_TYPE_OK" -eq 1 ]; then
    echo "PASS T9: AC-5 mixed-convention inversion — lone dated EDIT section among 2 undated sentinels retained (NOT selected as drop victim), notebook_no_valid_drop_candidate_breach emitted, content byte-identical (no truncation)"
    PASS=$((PASS + 1))
  else
    echo "FAIL T9: hash_match=$([ "$T9_HASH_BEFORE" = "$T9_HASH_AFTER" ] && echo yes || echo no) has_edit=$T9_HAS_EDIT has_keepA=$T9_HAS_KEEP_A has_keepB=$T9_HAS_KEEP_B sig_before=$T9_SIG_BEFORE sig_after=$T9_SIG_AFTER sig_type_ok=$T9_SIG_TYPE_OK (expected EDIT section retained, hash unchanged, notebook_no_valid_drop_candidate_breach emitted)"
    FAIL=$((FAIL + 1))
  fi
fi

# ── T10 (same ticket, AC-6): no-silent-drop — victim carries the file's own MAX
#      non-sentinel key ──────────────────────────────────────────────────────────
# 1 undated sentinel + 3 same-day-tied dated sections (identical date-only key, zero
# within-file evidence distinguishing them — same tie shape as T5-T7 but with a
# sentinel also present), sized so exactly ONE drop converges the LINE cap. The
# dropped section necessarily ties the file's own maximum non-sentinel key -> AC-6
# must signal before the (still-permitted, non-blocking) write lands.
T10_FILE="$TMPDIR_TEST/docs/agent-memory/notebooks/tie-plus-sentinel-ac6.md"
{
  echo "# Tie Plus Sentinel Notebook"
  echo ""
  echo "Preamble text."
  echo ""
  dense_section "Known patterns / preferences" 8 20
  dense_section "2026-07-30 — TASK-A (tied, physically first)" 70 20
  dense_section "2026-07-30 — TASK-B (tied, physically middle)" 70 20
  dense_section "2026-07-30 — TASK-C (tied, physically last)" 70 20
} > "$T10_FILE"

T10_LINES_BEFORE=$(wc -l < "$T10_FILE" | tr -d ' ')

if [ "$T10_LINES_BEFORE" -le 200 ]; then
  echo "FAIL T10 (fixture invalid): lines=$T10_LINES_BEFORE — expected >200 pre-run"
  FAIL=$((FAIL + 1))
else
  # NOTE: T5/T6/T7 (all-sentinel-free same-day ties) ALSO legitimately fire this
  # exact signal type (AC-6 has no sentinel-presence gate — see script header) —
  # scope the glob to THIS test's own REL_PATH (same "tr '/.' '-'" transform the
  # emit function itself uses) so a shared-TMPDIR cross-test file never collides
  # via a bare `find | head -1` on the un-scoped type-only glob.
  T10_REL="docs/agent-memory/notebooks/tie-plus-sentinel-ac6.md"
  T10_SIG_GLOB="notebook-prune-dropped-newest-$(echo "$T10_REL" | tr '/.' '-')-*.json"
  T10_SIG_BEFORE=$(signal_count "$T10_SIG_GLOB")

  run_prune "$T10_FILE"

  T10_SIG_AFTER=$(signal_count "$T10_SIG_GLOB")
  T10_SECTIONS_AFTER=$(grep -c "^## " "$T10_FILE" 2>/dev/null || echo 0)
  T10_HAS_A=$(grep -c "TASK-A" "$T10_FILE" 2>/dev/null)
  T10_HAS_B=$(grep -c "TASK-B" "$T10_FILE" 2>/dev/null)
  T10_HAS_C=$(grep -c "TASK-C" "$T10_FILE" 2>/dev/null)
  T10_LINES_AFTER=$(wc -l < "$T10_FILE" | tr -d ' ')
  T10_SIG_FILE=$(find "$TMPDIR_TEST/docs/signals" -maxdepth 1 -name "$T10_SIG_GLOB" 2>/dev/null | head -1 || true)
  T10_SIG_TYPE_OK=0
  if [ -n "$T10_SIG_FILE" ]; then
    T10_SIG_TYPE="$(jq -r '.type // empty' "$T10_SIG_FILE" 2>/dev/null || true)"
    [ "$T10_SIG_TYPE" = "notebook_prune_dropped_newest_dated_section" ] && T10_SIG_TYPE_OK=1
  fi

  if [ "$T10_SECTIONS_AFTER" -eq 3 ] && [ "$T10_HAS_C" -eq 0 ] && [ "$T10_HAS_A" -ge 1 ] && [ "$T10_HAS_B" -ge 1 ] && \
     [ "$T10_LINES_AFTER" -le 200 ] && [ "$T10_SIG_AFTER" -gt "$T10_SIG_BEFORE" ] && [ "$T10_SIG_TYPE_OK" -eq 1 ]; then
    echo "PASS T10: AC-6 no-silent-drop — dropped tied section (TASK-C) carried the file's own MAX non-sentinel key, notebook_prune_dropped_newest_dated_section emitted BEFORE the (still-permitted) write, sentinel+TASK-A+TASK-B retained"
    PASS=$((PASS + 1))
  else
    echo "FAIL T10: sections_after=$T10_SECTIONS_AFTER has_A=$T10_HAS_A has_B=$T10_HAS_B has_C=$T10_HAS_C lines_after=$T10_LINES_AFTER sig_before=$T10_SIG_BEFORE sig_after=$T10_SIG_AFTER sig_type_ok=$T10_SIG_TYPE_OK (expected 3 sections, TASK-C dropped, sentinel+TASK-A+TASK-B retained, AC-6 signal emitted)"
    FAIL=$((FAIL + 1))
  fi
fi

# ── T11 (FIX-NSO-TS-KEY-COMMIT-SHA-DIGITS-PARSED-AS-DATE AC-1/AC-2): commit-SHA
#      digits must never win over a real ISO timestamp in nso_ts_key() ──────────
# TASK-OLD: genuinely oldest (2026-08-01), heading carries a trailing all-digit
# commit SHA (`761988143`, 9 digits) — the exact live collision shape.
# TASK-COWORK-MUTEX-001: genuinely newest (2026-08-14), hex SHA (never digit-
# collision-prone). Narrow content (width 20, mirrors T5-T7) so only the LINE
# cap trips — byte axis stays well clear, isolating the ts-key regression.
T11_FILE="$TMPDIR_TEST/docs/agent-memory/notebooks/sha-digits-vs-date.md"
{
  echo "# SHA-Digits-vs-Date Notebook"
  echo ""
  echo "Preamble text."
  echo ""
  dense_section "cycle-705 · 2026-08-01T00:00:00Z · TASK-OLD (report-analyzer, commit \`761988143\`) — genuinely oldest" 100 20
  dense_section "cycle-711 · 2026-08-14T01:33:11Z · TASK-COWORK-MUTEX-001 (report-analyzer, commit \`f8d3891c6\`) — CHANGES_REQUESTED, genuinely newest" 100 20
} > "$T11_FILE"

T11_LINES_BEFORE=$(wc -l < "$T11_FILE" | tr -d ' ')

if [ "$T11_LINES_BEFORE" -le 200 ]; then
  echo "FAIL T11 (fixture invalid): lines=$T11_LINES_BEFORE — expected >200 pre-run"
  FAIL=$((FAIL + 1))
else
  run_prune "$T11_FILE"
  T11_SECTIONS_AFTER=$(grep -c "^## " "$T11_FILE" 2>/dev/null || echo 0)
  T11_HAS_OLD=$(grep -c "TASK-OLD" "$T11_FILE" 2>/dev/null)
  T11_HAS_MUTEX=$(grep -c "TASK-COWORK-MUTEX-001" "$T11_FILE" 2>/dev/null)
  T11_LINES_AFTER=$(wc -l < "$T11_FILE" | tr -d ' ')

  if [ "$T11_SECTIONS_AFTER" -eq 1 ] && [ "$T11_HAS_OLD" -eq 0 ] && [ "$T11_HAS_MUTEX" -ge 1 ] && [ "$T11_LINES_AFTER" -le 200 ]; then
    echo "PASS T11: SHA-digit collision — dropped the genuinely-oldest TASK-OLD section (all-digit commit SHA no longer mis-parsed as a newer date), retained the genuinely-newest TASK-COWORK-MUTEX-001 section"
    PASS=$((PASS + 1))
  else
    echo "FAIL T11: sections_after=$T11_SECTIONS_AFTER has_OLD=$T11_HAS_OLD has_MUTEX=$T11_HAS_MUTEX lines_after=$T11_LINES_AFTER (expected 1 section, TASK-OLD dropped, TASK-COWORK-MUTEX-001 retained)"
    FAIL=$((FAIL + 1))
  fi
fi

# ── T12 (FIX-NOTEBOOK-AUTOPRUNE-ROLLING-SECTIONS-BYTE-COUNTED-BUT-UNDROPPABLE
#      AC-1..AC-4, MEASUREMENT-PLANE fix — must FAIL before / PASS after): the
#      file's own undroppable remainder (preamble + every sentinel/rolling
#      section) ALONE already exceeds the byte cap, so no amount of dropping
#      dated ("## " with a real timestamp) sections can ever converge this
#      file. 3 dated sections (small/narrow, distinct oldest->newest
#      timestamps) + 2 large rolling sections ('## Archive', '## Known
#      patterns / preferences', wide/dense — alone bigger than the byte
#      overage), over the BYTE cap only. Pre-fix: the loop virtually drops 2 of
#      the 3 dated sections in-memory before the pre-existing AC-5
#      cardinality guard traps it (non_sentinel_section_count reaches exactly
#      1) and exits WITHOUT writing — the file survives on disk (AC-5 already
#      makes that much safe), but the ONLY signal fired
#      (notebook_no_valid_drop_candidate_breach) misreports the file's TRUE
#      original shape (section_count=3, not 5) since it only ever sees the
#      post-virtual-drop state, and no notebook_undroppable_remainder_over_cap_
#      breach signal exists at all pre-fix. Fixed code recognizes the
#      undroppable remainder alone breaches cap on iteration 1, BEFORE any
#      section is even considered for dropping, and emits the distinct,
#      accurate signal instead (section_count=5, non_sentinel_section_count=3,
#      sentinel_section_count=2 — the TRUE original counts) with zero wasted
#      iterations, and the no-valid-drop-candidate signal never fires for this
#      file at all.
T12_FILE="$TMPDIR_TEST/docs/agent-memory/notebooks/undroppable-remainder-ac1.md"
{
  echo "# Undroppable Remainder Notebook"
  echo ""
  echo "Preamble text."
  echo ""
  dense_section "Archive" 25 300
  dense_section "Known patterns / preferences" 25 300
  dense_section "2026-08-01T10:00:00Z - D1 oldest" 3 20
  dense_section "2026-08-05T10:00:00Z - D2 middle" 3 20
  dense_section "2026-08-10T10:00:00Z - D3 newest" 3 20
} > "$T12_FILE"

T12_LINES_BEFORE=$(wc -l < "$T12_FILE" | tr -d ' ')
T12_BYTES_BEFORE=$(wc -c < "$T12_FILE" | tr -d ' ')

if [ "$T12_LINES_BEFORE" -gt 200 ] || [ "$T12_BYTES_BEFORE" -le 12000 ]; then
  echo "FAIL T12 (fixture invalid): lines=$T12_LINES_BEFORE bytes=$T12_BYTES_BEFORE — expected lines<=200 (byte-ONLY breach) AND bytes>12000 pre-run"
  FAIL=$((FAIL + 1))
else
  T12_HASH_BEFORE="$(shasum -a 256 "$T12_FILE" | cut -d' ' -f1)"
  T12_REL="docs/agent-memory/notebooks/undroppable-remainder-ac1.md"
  T12_SIG_GLOB="notebook-undroppable-remainder-over-cap-$(echo "$T12_REL" | tr '/.' '-')-*.json"
  T12_NOVALID_GLOB="notebook-no-valid-drop-candidate-$(echo "$T12_REL" | tr '/.' '-')-*.json"
  T12_SIG_BEFORE=$(signal_count "$T12_SIG_GLOB")
  T12_NOVALID_BEFORE=$(signal_count "$T12_NOVALID_GLOB")

  run_prune "$T12_FILE"

  T12_HASH_AFTER="$(shasum -a 256 "$T12_FILE" | cut -d' ' -f1)"
  T12_SIG_AFTER=$(signal_count "$T12_SIG_GLOB")
  T12_NOVALID_AFTER=$(signal_count "$T12_NOVALID_GLOB")
  T12_SIG_FILE=$(find "$TMPDIR_TEST/docs/signals" -maxdepth 1 -name "$T12_SIG_GLOB" 2>/dev/null | head -1 || true)
  T12_SECTION_COUNT_OK=0
  if [ -n "$T12_SIG_FILE" ]; then
    T12_SC=$(jq -r '.payload.section_count // empty' "$T12_SIG_FILE" 2>/dev/null || true)
    T12_NSC=$(jq -r '.payload.non_sentinel_section_count // empty' "$T12_SIG_FILE" 2>/dev/null || true)
    T12_SSC=$(jq -r '.payload.sentinel_section_count // empty' "$T12_SIG_FILE" 2>/dev/null || true)
    [ "$T12_SC" = "5" ] && [ "$T12_NSC" = "3" ] && [ "$T12_SSC" = "2" ] && T12_SECTION_COUNT_OK=1
  fi

  if [ "$T12_HASH_BEFORE" = "$T12_HASH_AFTER" ] && [ "$T12_SIG_AFTER" -gt "$T12_SIG_BEFORE" ] && \
     [ "$T12_NOVALID_AFTER" = "$T12_NOVALID_BEFORE" ] && [ "$T12_SECTION_COUNT_OK" -eq 1 ]; then
    echo "PASS T12: AC-1 measurement-plane fix — undroppable remainder (2 rolling sections) alone exceeds byte cap, all 3 dated sections retained untouched (no drop attempted), notebook_undroppable_remainder_over_cap_breach emitted with TRUE original counts (section_count=5, non_sentinel=3, sentinel=2), no misleading no-valid-drop-candidate signal fired"
    PASS=$((PASS + 1))
  else
    echo "FAIL T12: hash_match=$([ "$T12_HASH_BEFORE" = "$T12_HASH_AFTER" ] && echo yes || echo no) sig_before=$T12_SIG_BEFORE sig_after=$T12_SIG_AFTER novalid_before=$T12_NOVALID_BEFORE novalid_after=$T12_NOVALID_AFTER section_count_ok=$T12_SECTION_COUNT_OK (expected hash unchanged, new signal emitted with section_count=5/non_sentinel=3/sentinel=2, no no-valid-drop-candidate signal)"
    FAIL=$((FAIL + 1))
  fi
fi

# ── T13 (same ticket, AC-2 NEGATIVE — must NOT regress): bloat genuinely IS in
#      the dated sections, the rolling section present is small — the
#      true-oldest dated section must still be dropped exactly as today, and
#      the new AC-1..AC-4 measurement-plane guard must stay silent (undroppable
#      remainder here is tiny, nowhere near cap).
T13_FILE="$TMPDIR_TEST/docs/agent-memory/notebooks/genuine-dated-bloat-ac2.md"
{
  echo "# Genuine Dated Bloat Notebook"
  echo ""
  echo "Preamble text."
  echo ""
  dense_section "Known patterns / preferences" 3 20
  dense_section "2026-07-01T10:00:00Z - oldest, must be dropped" 20 250
  dense_section "2026-07-05T10:00:00Z - middle" 20 250
  dense_section "2026-07-10T10:00:00Z - newest" 20 250
} > "$T13_FILE"

T13_LINES_BEFORE=$(wc -l < "$T13_FILE" | tr -d ' ')
T13_BYTES_BEFORE=$(wc -c < "$T13_FILE" | tr -d ' ')

if [ "$T13_LINES_BEFORE" -gt 200 ] || [ "$T13_BYTES_BEFORE" -le 12000 ]; then
  echo "FAIL T13 (fixture invalid): lines=$T13_LINES_BEFORE bytes=$T13_BYTES_BEFORE — expected lines<=200 (byte-ONLY breach) AND bytes>12000 pre-run"
  FAIL=$((FAIL + 1))
else
  T13_REL="docs/agent-memory/notebooks/genuine-dated-bloat-ac2.md"
  T13_UNDROP_GLOB="notebook-undroppable-remainder-over-cap-$(echo "$T13_REL" | tr '/.' '-')-*.json"
  T13_UNDROP_BEFORE=$(signal_count "$T13_UNDROP_GLOB")

  run_prune "$T13_FILE"

  T13_UNDROP_AFTER=$(signal_count "$T13_UNDROP_GLOB")
  T13_BYTES_AFTER=$(wc -c < "$T13_FILE" | tr -d ' ')
  T13_HAS_OLDEST=$(grep -c "oldest, must be dropped" "$T13_FILE" 2>/dev/null)
  T13_HAS_MIDDLE=$(grep -c "middle" "$T13_FILE" 2>/dev/null)
  T13_HAS_NEWEST=$(grep -c "newest" "$T13_FILE" 2>/dev/null)
  T13_HAS_ROLLING=$(grep -c "Known patterns" "$T13_FILE" 2>/dev/null)

  if [ "$T13_BYTES_AFTER" -le 12000 ] && [ "$T13_HAS_OLDEST" -eq 0 ] && [ "$T13_HAS_MIDDLE" -ge 1 ] && \
     [ "$T13_HAS_NEWEST" -ge 1 ] && [ "$T13_HAS_ROLLING" -ge 1 ] && [ "$T13_UNDROP_AFTER" = "$T13_UNDROP_BEFORE" ]; then
    echo "PASS T13: AC-2 negative — genuine dated bloat (small rolling section) still drops the true-oldest dated section exactly as today, converges under byte cap, no undroppable-remainder signal (rolling alone is well under cap)"
    PASS=$((PASS + 1))
  else
    echo "FAIL T13: bytes_after=$T13_BYTES_AFTER has_oldest=$T13_HAS_OLDEST has_middle=$T13_HAS_MIDDLE has_newest=$T13_HAS_NEWEST has_rolling=$T13_HAS_ROLLING undrop_before=$T13_UNDROP_BEFORE undrop_after=$T13_UNDROP_AFTER (expected bytes<=12000, oldest dropped, middle+newest+rolling retained, no undroppable-remainder signal)"
    FAIL=$((FAIL + 1))
  fi
fi

# ── T14 (same ticket, AC-3 RATCHET): replay the T12 undroppable-remainder shape
#      through 3 consecutive over-cap "writes" (each simulating an agent
#      appending one more dated section) — the retained dated-section count
#      must be non-decreasing across all 3 runs (pre-fix, relying solely on
#      the AC-5 cardinality trap already left this non-decreasing SINCE no
#      write ever lands once trapped — this test guards the combined AC-1..
#      AC-6 invariant going forward: it must never again be possible for a
#      replay of this shape to shed dated history run over run).
T14_FILE="$TMPDIR_TEST/docs/agent-memory/notebooks/ratchet-replay-ac3.md"
{
  echo "# Ratchet Replay Notebook"
  echo ""
  echo "Preamble text."
  echo ""
  dense_section "Archive" 25 300
  dense_section "Known patterns / preferences" 25 300
  dense_section "2026-08-01T10:00:00Z - D1 oldest" 3 20
} > "$T14_FILE"

T14_OK=1
T14_PREV_COUNT=0
for round in 1 2 3; do
  case "$round" in
    2) dense_section "2026-08-05T10:00:00Z - D2 round2" 3 20 >> "$T14_FILE" ;;
    3) dense_section "2026-08-10T10:00:00Z - D3 round3" 3 20 >> "$T14_FILE" ;;
  esac
  T14_BYTES="$(wc -c < "$T14_FILE" | tr -d ' ')"
  if [ "$T14_BYTES" -le 12000 ]; then
    echo "FAIL T14 (fixture invalid, round $round): bytes=$T14_BYTES — expected >12000 every round"
    FAIL=$((FAIL + 1))
    T14_OK=0
    break
  fi
  run_prune "$T14_FILE"
  T14_DATED_COUNT=$(grep -cE "^## [0-9]{4}-[0-9]{2}-[0-9]{2}" "$T14_FILE" 2>/dev/null || echo 0)
  if [ "$T14_DATED_COUNT" -lt "$T14_PREV_COUNT" ]; then
    echo "FAIL T14 (round $round): dated_count=$T14_DATED_COUNT < prev_round_count=$T14_PREV_COUNT — retained dated-section count DECREASED"
    FAIL=$((FAIL + 1))
    T14_OK=0
    break
  fi
  T14_PREV_COUNT="$T14_DATED_COUNT"
done

if [ "$T14_OK" -eq 1 ]; then
  echo "PASS T14: AC-3 ratchet — retained dated-section count non-decreasing across 3 consecutive over-cap replays (ended at $T14_PREV_COUNT dated sections, never shed any)"
  PASS=$((PASS + 1))
fi

# ── T15 (GREP-C-EXIT-1-DOUBLE-FIRE, same ticket, live corroboration): `grep -c
#      PATTERN` legitimately exits 1 (not 0) on a genuine zero-count match while
#      STILL printing "0" to stdout, so the pre-existing
#      `... | grep -c PATTERN 2>/dev/null || echo 0` pattern used for
#      NON_SENTINEL_SECTION_COUNT/SENTINEL_SECTION_COUNT double-fires on every
#      zero-sentinel file, leaving the variable holding a literal two-line
#      "0\n0" — which corrupts the notebook_prune_dropped_newest_dated_section
#      heredoc into invalid JSON (a stray bare "0," line before "reason").
#      LIVE: 4 real signals in this shape were found unparseable by the
#      canonical signal drain the same day this fix landed (dev-mcp-server.md,
#      tran-ngoc-bau.md x3 — all zero-sentinel same-day-tie files). Same shape
#      as T7 (3 same-day-tied dated sections, NO sentinel section at all —
#      sentinel_section_count legitimately 0) but T7 never asserted the
#      dropped-newest signal's own JSON validity, so it never caught this.
T15_FILE="$TMPDIR_TEST/docs/agent-memory/notebooks/grepc-doublefire-ac6.md"
{
  echo "# Grep-C Double-Fire Notebook"
  echo ""
  echo "Preamble text."
  echo ""
  dense_section "2026-07-30 — TASK-M" 70 20
  dense_section "2026-07-30 — TASK-N" 70 20
  dense_section "2026-07-30 — TASK-O" 70 20
} > "$T15_FILE"

T15_LINES_BEFORE=$(wc -l < "$T15_FILE" | tr -d ' ')

if [ "$T15_LINES_BEFORE" -le 200 ]; then
  echo "FAIL T15 (fixture invalid): lines=$T15_LINES_BEFORE — expected >200 pre-run"
  FAIL=$((FAIL + 1))
else
  T15_REL="docs/agent-memory/notebooks/grepc-doublefire-ac6.md"
  T15_SIG_GLOB="notebook-prune-dropped-newest-$(echo "$T15_REL" | tr '/.' '-')-*.json"

  run_prune "$T15_FILE"

  T15_SIG_FILE=$(find "$TMPDIR_TEST/docs/signals" -maxdepth 1 -name "$T15_SIG_GLOB" 2>/dev/null | head -1 || true)
  T15_VALID_JSON=0
  T15_SENTINEL_FIELD_OK=0
  if [ -n "$T15_SIG_FILE" ] && jq empty "$T15_SIG_FILE" >/dev/null 2>&1; then
    T15_VALID_JSON=1
    T15_SSC=$(jq -r '.payload.sentinel_section_count // empty' "$T15_SIG_FILE" 2>/dev/null || true)
    [ "$T15_SSC" = "0" ] && T15_SENTINEL_FIELD_OK=1
  fi

  if [ -n "$T15_SIG_FILE" ] && [ "$T15_VALID_JSON" -eq 1 ] && [ "$T15_SENTINEL_FIELD_OK" -eq 1 ]; then
    echo "PASS T15: grep-c-exit-1-double-fire fixed — notebook_prune_dropped_newest_dated_section on a zero-sentinel file is valid, parseable JSON with sentinel_section_count=0 (no stray bare '0,' line)"
    PASS=$((PASS + 1))
  else
    echo "FAIL T15: sig_file=${T15_SIG_FILE:-<none>} valid_json=$T15_VALID_JSON sentinel_field_ok=$T15_SENTINEL_FIELD_OK (expected a valid, parseable dropped-newest signal with sentinel_section_count=0)"
    FAIL=$((FAIL + 1))
  fi
fi

# ── T8 (UC-CRITIC-HOOKS-ENFORCEMENT FR-2): jq unavailable → exit 1, not silent 0 ────
NO_JQ_BIN=$(mktemp -d /private/tmp/notebook-prune-no-jq-XXXXXX)
for b in bash cat mktemp printf rm dirname grep awk head tail wc tr mv date git sort shasum sha256sum; do
  p=$(command -v "$b" 2>/dev/null || true)
  [ -n "$p" ] && ln -sf "$p" "$NO_JQ_BIN/$b"
done

T8_FILE="$TMPDIR_TEST/docs/agent-memory/notebooks/t8-jq-missing.md"
echo "## seed" > "$T8_FILE"

EXIT8=0
run_prune_with_path "$T8_FILE" "$NO_JQ_BIN" || EXIT8=$?
rm -rf "$NO_JQ_BIN"

if [ "$EXIT8" -eq 1 ]; then
  echo "PASS T8: jq unavailable (PATH override) → exit 1 (prerequisite crash surfaced, not swallowed)"
  PASS=$((PASS + 1))
else
  echo "FAIL T8: jq unavailable (PATH override) → exit $EXIT8 (expected 1)"
  FAIL=$((FAIL + 1))
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
