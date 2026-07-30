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
#                                      distinguishing timestamp signal → refuses to guess:
#                                      content byte-identical before/after (no truncation,
#                                      no section dropped), notebook_tiebreak_direction_
#                                      unresolved_breach signal emitted instead.
#
# Run:
#   bash scripts/agents-flow/notebook-auto-prune.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning tasks: FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES (T1-T4),
#               FIX-NOTEBOOK-AUTOPRUNE-SAMEDAY-TIE-DROPS-NEWEST (T5-T7)
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

# ── T7: same-day tie-break — direction UNRESOLVABLE, no declared override ───────
# Same shape as T5/T6 but this filename has NO entry in notebook-section-order.json AND
# all 3 headings share the identical date-only key (zero distinguishing signal from the
# file's own content either). MUST refuse to guess: content byte-identical, no section
# dropped, notebook_tiebreak_direction_unresolved_breach signal emitted instead.
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
  T7_HASH_BEFORE="$(shasum -a 256 "$T7_FILE" | cut -d' ' -f1)"
  T7_SIG_BEFORE=$(signal_count "notebook-tiebreak-unresolved-*.json")

  run_prune "$T7_FILE"

  T7_HASH_AFTER="$(shasum -a 256 "$T7_FILE" | cut -d' ' -f1)"
  T7_SIG_AFTER=$(signal_count "notebook-tiebreak-unresolved-*.json")
  T7_SECTIONS_AFTER=$(grep -c "^## " "$T7_FILE" 2>/dev/null || echo 0)
  T7_SIG_FILE=$(find "$TMPDIR_TEST/docs/signals" -maxdepth 1 -name "notebook-tiebreak-unresolved-*.json" 2>/dev/null | head -1 || true)
  T7_SIG_TYPE_OK=0
  if [ -n "$T7_SIG_FILE" ]; then
    T7_SIG_TYPE="$(jq -r '.type // empty' "$T7_SIG_FILE" 2>/dev/null || true)"
    [ "$T7_SIG_TYPE" = "notebook_tiebreak_direction_unresolved_breach" ] && T7_SIG_TYPE_OK=1
  fi

  if [ "$T7_HASH_BEFORE" = "$T7_HASH_AFTER" ] && [ "$T7_SECTIONS_AFTER" -eq 3 ] && [ "$T7_SIG_AFTER" -gt "$T7_SIG_BEFORE" ] && [ "$T7_SIG_TYPE_OK" -eq 1 ]; then
    echo "PASS T7: unresolved direction — refused to guess (content byte-identical, all 3 sections retained), notebook_tiebreak_direction_unresolved_breach emitted"
    PASS=$((PASS + 1))
  else
    echo "FAIL T7: hash_match=$([ "$T7_HASH_BEFORE" = "$T7_HASH_AFTER" ] && echo yes || echo no) sections_after=$T7_SECTIONS_AFTER sig_before=$T7_SIG_BEFORE sig_after=$T7_SIG_AFTER sig_type_ok=$T7_SIG_TYPE_OK"
    FAIL=$((FAIL + 1))
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
