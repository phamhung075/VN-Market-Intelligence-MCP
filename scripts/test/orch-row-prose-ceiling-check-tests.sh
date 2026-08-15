#!/usr/bin/env bash
# =============================================================================
# scripts/test/orch-row-prose-ceiling-check-tests.sh
# Standalone test suite for scripts/orch-row-prose-ceiling-check.mjs
# =============================================================================
# Task:  FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT
# Brief: docs/architecture-briefs/2026-08-09-fix-orchstate-hotfile-inline-prose-ceiling.md §2.4/§5
#
# COVERS (brief §5 step-4 AC, verbatim):
#   GROWTH-VIOLATION  — growing a row past ceiling -> exit 1
#   WARN-NO-GROWTH    — editing a row already >ceiling WITHOUT growing its
#                        prose bytes -> exit 0 + non-fatal WARN
#   NEWROW-VIOLATION  — a brand-new row minted with >ceiling prose on first
#                        write -> exit 1 (growth from a live baseline of 0)
# Plus regression coverage:
#   UNDER-CEILING-HAPPY  — normal growth that stays under ceiling -> exit 0, no WARN
#   SHRINK-STILL-OVER    — a row shrinks but is still over ceiling -> exit 0 + WARN
#                          (not a violation — shrinking is never growth)
#   LANE-AGNOSTIC-MOVE   — a row moves lanes (backlog->review) with unchanged
#                          prose bytes -> NOT treated as a brand-new row (its
#                          live baseline is looked up across all 3 lanes)
#   MULTI-VIOLATION-MSG  — 2 simultaneous violations both named in the abort message
#   USAGE-MISSING-ARGS / USAGE-BAD-JSON / USAGE-MISSING-FILE -> exit 3
#   STRUCTURAL-FIELDS-EXCLUDED — growing only a structural field (e.g. status)
#                          never counts as prose growth
#
# All I/O is against throwaway mktemp fixtures — never the live
# docs/data/orch/orch-state.json.
#
# Run:
#   bash scripts/test/orch-row-prose-ceiling-check-tests.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# =============================================================================
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHECK_MJS="$REPO_ROOT/scripts/orch-row-prose-ceiling-check.mjs"

[ -f "$CHECK_MJS" ] || { echo "FATAL: $CHECK_MJS not found"; exit 1; }
command -v bun >/dev/null 2>&1 || { echo "FATAL: bun not found in PATH"; exit 1; }

PASS=0; FAIL=0
pass() { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL+1)); printf 'FAIL  %s\n' "$1"; }

FIXTURE_DIR=$(mktemp -d "/tmp/orch-ceiling-test-XXXXXX")
trap 'rm -rf "$FIXTURE_DIR"' EXIT

# Small helper: repeat a character N times (portable, no python/seq dependency)
repeat_char() {
  local char="$1" n="$2"
  printf "%${n}s" '' | tr ' ' "$char"
}

# Ceiling used throughout (matches the script's own documented default so
# these tests exercise the real production behavior, not a synthetic one).
CEILING=12000
OVER_LEN=$((CEILING + 500))     # comfortably over ceiling
UNDER_LEN=$((CEILING - 5000))   # comfortably under ceiling

BIG_PROSE=$(repeat_char x "$OVER_LEN")
SMALL_PROSE=$(repeat_char y "$UNDER_LEN")

# =============================================================================
# GROWTH-VIOLATION: live row is small; candidate grows the SAME row past
# ceiling -> exit 1, message names the id.
# =============================================================================
LIVE_1="$FIXTURE_DIR/live-growth.json"
jq -n --arg note "short" \
  '{"task_board":{"backlog":[{"id":"ROW-GROWTH","status":"BACKLOG","note":$note}],"ready":[],"review":[]}}' \
  > "$LIVE_1"

CAND_1=$(jq --arg big "$BIG_PROSE" '.task_board.backlog[0].note = $big' "$LIVE_1")
CAND_1_FILE="$FIXTURE_DIR/cand-growth.json"
printf '%s' "$CAND_1" > "$CAND_1_FILE"

OUT_1=$(bun "$CHECK_MJS" "$LIVE_1" "$CAND_1_FILE" 2>&1)
EXIT_1=$?
if [ "$EXIT_1" -eq 1 ]; then
  pass "GROWTH-VIOLATION — row grown past ceiling -> exit 1"
else
  fail "GROWTH-VIOLATION — expected exit 1, got $EXIT_1 ($OUT_1)"
fi
if printf '%s' "$OUT_1" | grep -q "ROW-GROWTH"; then
  pass "GROWTH-VIOLATION — abort message names the violating id"
else
  fail "GROWTH-VIOLATION — abort message did not name ROW-GROWTH: $OUT_1"
fi
if printf '%s' "$OUT_1" | grep -qi "detail_ref"; then
  pass "GROWTH-VIOLATION — abort message points at detail_ref"
else
  fail "GROWTH-VIOLATION — abort message did not mention detail_ref: $OUT_1"
fi

# =============================================================================
# WARN-NO-GROWTH: live row is ALREADY over ceiling; candidate edits an
# unrelated structural field only (same prose bytes, not growing) -> exit 0
# + non-fatal WARN naming the id.
# =============================================================================
LIVE_2="$FIXTURE_DIR/live-warn.json"
jq -n --arg big "$BIG_PROSE" \
  '{"task_board":{"backlog":[{"id":"ROW-OVER-FLAT","status":"BACKLOG","note":$big}],"ready":[],"review":[]}}' \
  > "$LIVE_2"

CAND_2_FILE="$FIXTURE_DIR/cand-warn.json"
jq '.task_board.backlog[0].status = "BLOCKED"' "$LIVE_2" > "$CAND_2_FILE"

OUT_2=$(bun "$CHECK_MJS" "$LIVE_2" "$CAND_2_FILE" 2>&1)
EXIT_2=$?
if [ "$EXIT_2" -eq 0 ]; then
  pass "WARN-NO-GROWTH — already-over-ceiling row NOT growing -> exit 0"
else
  fail "WARN-NO-GROWTH — expected exit 0, got $EXIT_2 ($OUT_2)"
fi
if printf '%s' "$OUT_2" | grep -q "WARN" && printf '%s' "$OUT_2" | grep -q "ROW-OVER-FLAT"; then
  pass "WARN-NO-GROWTH — non-fatal WARN line names the id"
else
  fail "WARN-NO-GROWTH — expected a WARN line naming ROW-OVER-FLAT: $OUT_2"
fi

# =============================================================================
# NEWROW-VIOLATION: id absent from live entirely (live baseline = 0);
# candidate mints it directly with >ceiling prose -> exit 1.
# =============================================================================
LIVE_3="$FIXTURE_DIR/live-newrow.json"
jq -n '{"task_board":{"backlog":[],"ready":[],"review":[]}}' > "$LIVE_3"

CAND_3_FILE="$FIXTURE_DIR/cand-newrow.json"
jq -n --arg big "$BIG_PROSE" \
  '{"task_board":{"backlog":[{"id":"ROW-BRAND-NEW","status":"BACKLOG","note":$big}],"ready":[],"review":[]}}' \
  > "$CAND_3_FILE"

OUT_3=$(bun "$CHECK_MJS" "$LIVE_3" "$CAND_3_FILE" 2>&1)
EXIT_3=$?
if [ "$EXIT_3" -eq 1 ]; then
  pass "NEWROW-VIOLATION — brand-new row minted >ceiling on first write -> exit 1"
else
  fail "NEWROW-VIOLATION — expected exit 1, got $EXIT_3 ($OUT_3)"
fi
if printf '%s' "$OUT_3" | grep -q "live=0B"; then
  pass "NEWROW-VIOLATION — message shows live baseline 0B"
else
  fail "NEWROW-VIOLATION — expected live=0B in message: $OUT_3"
fi

# =============================================================================
# UNDER-CEILING-HAPPY: normal growth that never crosses the ceiling -> exit 0,
# no WARN at all (regression guard against false positives on routine writes).
# =============================================================================
LIVE_4="$FIXTURE_DIR/live-happy.json"
jq -n '{"task_board":{"backlog":[{"id":"ROW-NORMAL","status":"BACKLOG","note":"a short note"}],"ready":[],"review":[]}}' \
  > "$LIVE_4"

CAND_4_FILE="$FIXTURE_DIR/cand-happy.json"
jq --arg mid "$SMALL_PROSE" '.task_board.backlog[0].note = $mid' "$LIVE_4" > "$CAND_4_FILE"

OUT_4=$(bun "$CHECK_MJS" "$LIVE_4" "$CAND_4_FILE" 2>&1)
EXIT_4=$?
if [ "$EXIT_4" -eq 0 ]; then
  pass "UNDER-CEILING-HAPPY — normal growth under ceiling -> exit 0"
else
  fail "UNDER-CEILING-HAPPY — expected exit 0, got $EXIT_4 ($OUT_4)"
fi
if printf '%s' "$OUT_4" | grep -q "WARN"; then
  fail "UNDER-CEILING-HAPPY — unexpected WARN line for an under-ceiling row: $OUT_4"
else
  pass "UNDER-CEILING-HAPPY — no WARN line (row never crossed ceiling)"
fi

# =============================================================================
# SHRINK-STILL-OVER: row shrinks (fewer prose bytes than live) but is still
# over ceiling -> exit 0 + WARN (shrinking must never be treated as growth).
# =============================================================================
LIVE_5="$FIXTURE_DIR/live-shrink.json"
EVEN_BIGGER=$(repeat_char x "$((OVER_LEN + 5000))")
jq -n --arg big "$EVEN_BIGGER" \
  '{"task_board":{"backlog":[{"id":"ROW-SHRINK-STILL-OVER","status":"BACKLOG","note":$big}],"ready":[],"review":[]}}' \
  > "$LIVE_5"

CAND_5_FILE="$FIXTURE_DIR/cand-shrink.json"
jq --arg smaller "$BIG_PROSE" '.task_board.backlog[0].note = $smaller' "$LIVE_5" > "$CAND_5_FILE"

OUT_5=$(bun "$CHECK_MJS" "$LIVE_5" "$CAND_5_FILE" 2>&1)
EXIT_5=$?
if [ "$EXIT_5" -eq 0 ]; then
  pass "SHRINK-STILL-OVER — row shrinks but stays over ceiling -> exit 0 (not a violation)"
else
  fail "SHRINK-STILL-OVER — expected exit 0, got $EXIT_5 ($OUT_5)"
fi
if printf '%s' "$OUT_5" | grep -q "WARN" && printf '%s' "$OUT_5" | grep -q "ROW-SHRINK-STILL-OVER"; then
  pass "SHRINK-STILL-OVER — WARN line names the id"
else
  fail "SHRINK-STILL-OVER — expected a WARN line naming ROW-SHRINK-STILL-OVER: $OUT_5"
fi

# =============================================================================
# LANE-AGNOSTIC-MOVE: row moves backlog[]->review[] with UNCHANGED prose
# bytes -> live baseline lookup is lane-agnostic (id-keyed across all 3
# lanes), so this must NOT be treated as a brand-new row with a 0 baseline.
# =============================================================================
LIVE_6="$FIXTURE_DIR/live-lanemove.json"
jq -n --arg big "$BIG_PROSE" \
  '{"task_board":{"backlog":[{"id":"ROW-LANE-MOVE","status":"BACKLOG","note":$big}],"ready":[],"review":[]}}' \
  > "$LIVE_6"

CAND_6_FILE="$FIXTURE_DIR/cand-lanemove.json"
jq --arg big "$BIG_PROSE" \
  '.task_board.backlog = [] | .task_board.review = [{"id":"ROW-LANE-MOVE","status":"REVIEW","note":$big}]' \
  "$LIVE_6" > "$CAND_6_FILE"

OUT_6=$(bun "$CHECK_MJS" "$LIVE_6" "$CAND_6_FILE" 2>&1)
EXIT_6=$?
if [ "$EXIT_6" -eq 0 ]; then
  pass "LANE-AGNOSTIC-MOVE — lane move with unchanged prose bytes -> exit 0 (not treated as new-row growth)"
else
  fail "LANE-AGNOSTIC-MOVE — expected exit 0, got $EXIT_6 ($OUT_6)"
fi

# =============================================================================
# MULTI-VIOLATION-MSG: 2 simultaneous growth violations -> BOTH ids named,
# single non-zero exit.
# =============================================================================
LIVE_7="$FIXTURE_DIR/live-multi.json"
jq -n '{"task_board":{"backlog":[{"id":"ROW-MULTI-A","status":"BACKLOG","note":"short-a"},{"id":"ROW-MULTI-B","status":"BACKLOG","note":"short-b"}],"ready":[],"review":[]}}' \
  > "$LIVE_7"

CAND_7_FILE="$FIXTURE_DIR/cand-multi.json"
jq --arg big "$BIG_PROSE" \
  '.task_board.backlog[0].note = $big | .task_board.backlog[1].note = $big' \
  "$LIVE_7" > "$CAND_7_FILE"

OUT_7=$(bun "$CHECK_MJS" "$LIVE_7" "$CAND_7_FILE" 2>&1)
EXIT_7=$?
if [ "$EXIT_7" -eq 1 ]; then
  pass "MULTI-VIOLATION-MSG — 2 simultaneous violations -> exit 1"
else
  fail "MULTI-VIOLATION-MSG — expected exit 1, got $EXIT_7 ($OUT_7)"
fi
if printf '%s' "$OUT_7" | grep -q "ROW-MULTI-A" && printf '%s' "$OUT_7" | grep -q "ROW-MULTI-B"; then
  pass "MULTI-VIOLATION-MSG — BOTH violating ids named in the message"
else
  fail "MULTI-VIOLATION-MSG — expected both ROW-MULTI-A and ROW-MULTI-B named: $OUT_7"
fi

# =============================================================================
# STRUCTURAL-FIELDS-EXCLUDED: growing ONLY a structural field (status, a
# long-but-legal enum-like string change) never counts toward prose bytes —
# proves the exclude-set is actually applied, not just documented.
# =============================================================================
LIVE_8="$FIXTURE_DIR/live-structural.json"
jq -n '{"task_board":{"backlog":[{"id":"ROW-STRUCTURAL","status":"BACKLOG","owner":"nobody","zone":"cross-service/"}],"ready":[],"review":[]}}' \
  > "$LIVE_8"

CAND_8_FILE="$FIXTURE_DIR/cand-structural.json"
jq '.task_board.backlog[0].status = "REVIEW" | .task_board.backlog[0].owner = "developer" | .task_board.backlog[0].zone = "apps/mcp-server/"' \
  "$LIVE_8" > "$CAND_8_FILE"

OUT_8=$(bun "$CHECK_MJS" "$LIVE_8" "$CAND_8_FILE" 2>&1)
EXIT_8=$?
if [ "$EXIT_8" -eq 0 ]; then
  pass "STRUCTURAL-FIELDS-EXCLUDED — status/owner/zone edits never count as prose growth -> exit 0"
else
  fail "STRUCTURAL-FIELDS-EXCLUDED — expected exit 0, got $EXIT_8 ($OUT_8)"
fi

# =============================================================================
# USAGE ERRORS -> exit 3
# =============================================================================
EXIT_U1=0
bun "$CHECK_MJS" >/dev/null 2>&1 || EXIT_U1=$?
if [ "$EXIT_U1" -eq 3 ]; then
  pass "USAGE-MISSING-ARGS — zero args -> exit 3"
else
  fail "USAGE-MISSING-ARGS — expected exit 3, got $EXIT_U1"
fi

BAD_JSON_FILE="$FIXTURE_DIR/bad.json"
printf '{not valid json' > "$BAD_JSON_FILE"
EXIT_U2=0
bun "$CHECK_MJS" "$LIVE_4" "$BAD_JSON_FILE" >/dev/null 2>&1 || EXIT_U2=$?
if [ "$EXIT_U2" -eq 3 ]; then
  pass "USAGE-BAD-JSON — unparseable candidate -> exit 3"
else
  fail "USAGE-BAD-JSON — expected exit 3, got $EXIT_U2"
fi

EXIT_U3=0
bun "$CHECK_MJS" "$LIVE_4" "$FIXTURE_DIR/does-not-exist.json" >/dev/null 2>&1 || EXIT_U3=$?
if [ "$EXIT_U3" -eq 3 ]; then
  pass "USAGE-MISSING-FILE — nonexistent candidate file -> exit 3"
else
  fail "USAGE-MISSING-FILE — expected exit 3, got $EXIT_U3"
fi

echo "──────────────────────────────────────────────────────────────"
echo "orch-row-prose-ceiling-check-tests.sh: ${PASS} pass / ${FAIL} fail"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
