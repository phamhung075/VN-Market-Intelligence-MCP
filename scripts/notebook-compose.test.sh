#!/usr/bin/env bash
# scripts/notebook-compose.test.sh
#
# Regression test for scripts/notebook-compose.sh — FIX-NOTEBOOK-COMPOSE-SCRIPT-
# ACTUATOR (RECURRING-BUG ESCALATION, prior_warns=7).
#
# T1  (AC-4, the negative control — the reason this task exists): replays the
#     commit `0fcc6a5d2` SHAPE — PRE_COUNT too low to require any drop (2
#     existing sections, max-sections=3, so inserting 1 new section needs 0
#     drops), well under both caps, file GROWS after the write (exactly the
#     surface signature the real incident showed: 80->81L, "grew, not
#     shrank"). Asserts the corruption CANNOT land: all 3 headings present
#     (none vanished), both pre-existing sections byte-identical to their
#     pre-write form, growth == exactly the new section's own line count (not
#     a phantom +1 with a missing heading). This is a REAL replay through the
#     REAL script, not a mocked/narrated assertion — independently verified
#     via this test's own grep/wc calls, never by trusting the script's own
#     stdout marker as the sole evidence (a reader-writes-its-own-trigger-
#     field check would be vacuous here).
# T2  Steady-state retention: 3 existing sections + 1 new -> exactly 1 drop,
#     oldest (physically-last, newest_first-derived) dropped, two newer
#     retained sections byte-identical.
# T3  oldest_first override (docs/data/notebook-section-order.json shape, via
#     NOTEBOOK_COMPOSE_ORDER_FILE test-isolation override): new section
#     appended at the BOTTOM, oldest dropped from the TOP.
# T4  Section-cap auto-trim: an over-cap new section is trimmed to
#     section-cap lines (the ONLY authorized new-content mutation), WARN
#     marker emitted, run still succeeds.
# T5  AC-2b sub-block intra-prune, self-derived direction: "## Prior cycles"
#     with 4 dated "### " sub-blocks -> drops the TRUE oldest (by the
#     sub-blocks' OWN parseable dates), independent of the file's top-level
#     convention (deliberately mismatched in the fixture to prove
#     independence, not inheritance).
# T6  AC-2b sub-block intra-prune, direction fallback: 4 UNDATED "### "
#     sub-blocks (the live Chef-Dish template shape, no calendar date in the
#     sub-heading) -> falls back to the file's own already-resolved top-level
#     DIRECTION (not a second hardcoded default) — verified via an
#     oldest_first override so the fallback is externally distinguishable
#     from the plain newest_first default.
# T7  Single-section safe-fail: preamble alone already exceeds the line cap,
#     max-sections=1 -> ABORT single-section-overage, notebook file BYTE-
#     IDENTICAL before/after (mktemp+mv never touched it).
# T8  Bad-usage / malformed-input guards leave the notebook file untouched:
#     missing args, notebook-not-found, new-section-file-not-found,
#     new-section-empty, new-section-missing-heading,
#     new-section-multiple-headings.
# T9  Commit-boundary check: this script never git-adds/commits anything
#     (that stays scripts/auditor-notebook-commit.sh's job) — asserts no
#     `git` invocation trace / working-tree-only mutation (the test repo's
#     git status after a successful compose shows the file as MODIFIED, not
#     staged or committed).
#
# Run:
#   bash scripts/notebook-compose.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: FIX-NOTEBOOK-COMPOSE-SCRIPT-ACTUATOR
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_SH="$SCRIPT_DIR/notebook-compose.sh"

if [ ! -f "$COMPOSE_SH" ]; then
  echo "ERROR: compose script not found at $COMPOSE_SH" >&2
  exit 1
fi

TMPDIR_TEST=$(mktemp -d /private/tmp/notebook-compose-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

(cd "$TMPDIR_TEST" && git init -q . && git config user.email test@test.local && git config user.name test)

PASS=0
FAIL=0

new_section_file() {
  # $1 = target path, remaining args = lines
  local target="$1"
  shift
  : > "$target"
  local line
  for line in "$@"; do
    printf '%s\n' "$line" >> "$target"
  done
}

run_compose() {
  # $1=notebook $2=new-section-file $3=max-sections $4=section-cap
  bash "$COMPOSE_SH" "$1" "$2" "${3:-3}" "${4:-60}"
}

# t_grep_count <pattern> [file] — mirrors notebook-compose.sh's own
# nc_grep_count helper (see that script's header for why): `grep -c PATTERN
# || echo 0` double-prints ("0\n0") on the zero-match case because `grep -c`
# ALREADY prints "0" there while still exiting 1 — corrupting every `-eq`/
# `-gt` integer comparison downstream. This test file hit that exact bug
# against its own assertions during authoring (not the production script) —
# fixed here rather than re-introducing the anti-pattern in every call site.
t_grep_count() {
  local pattern="$1" count
  if [ "$#" -ge 2 ]; then
    count="$(grep -c "$pattern" "$2" 2>/dev/null)"
  else
    count="$(grep -c "$pattern" 2>/dev/null)"
  fi
  [ -z "$count" ] && count=0
  printf '%s\n' "$count"
}

# ── T1 (AC-4 negative control) ───────────────────────────────────────────────
T1_NB="$TMPDIR_TEST/t1-nb.md"
{
  echo "## c44 · 2026-08-05T19:13:03Z"
  echo "### Audit Run Tier-1 (19:00-19:13 UTC 2026-08-05)"
  echo "- Tier: 1 | Services: 5 checked"
  echo "- Status: HEALTHY"
  echo ""
  echo "## c43 · 2026-08-05T15:00:00Z"
  echo "### Audit Run Tier-1 (14:50-15:00 UTC 2026-08-05)"
  echo "- Tier: 1 | Services: 5 checked"
  echo "- Status: HEALTHY"
} > "$T1_NB"
T1_PRE_LINES=$(wc -l < "$T1_NB" | tr -d ' ')
T1_NEW="$TMPDIR_TEST/t1-new.md"
new_section_file "$T1_NEW" \
  "## c45 · 2026-08-06T06:41:47Z" \
  "### Audit Run Tier-1 (06:30-06:41 UTC 2026-08-06)" \
  "- Tier: 1 | Services: 5 checked" \
  "- Status: HEALTHY"
T1_NEW_LINES=$(wc -l < "$T1_NEW" | tr -d ' ')

T1_OUT=$(run_compose "$T1_NB" "$T1_NEW" 3 60)
T1_RC=$?
T1_POST_LINES=$(wc -l < "$T1_NB" | tr -d ' ')
T1_HEADINGS=$(t_grep_count '^## ' "$T1_NB")
T1_HAS_C43=$(t_grep_count '^## c43' "$T1_NB")
T1_HAS_C44=$(t_grep_count '^## c44' "$T1_NB")
T1_HAS_C45=$(t_grep_count '^## c45' "$T1_NB")
# Independent byte-identity check (this test's OWN grep, not the script's
# self-report): the c44 section body (heading through blank line before c43)
# must appear verbatim.
T1_C44_INTACT=0
grep -A3 '^## c44 · 2026-08-05T19:13:03Z' "$T1_NB" | grep -q '^- Status: HEALTHY$' && T1_C44_INTACT=1
T1_GROWTH=$((T1_POST_LINES - T1_PRE_LINES))

if [ "$T1_RC" -eq 0 ] && [ "$T1_HEADINGS" -eq 3 ] && [ "$T1_HAS_C43" -eq 1 ] && [ "$T1_HAS_C44" -eq 1 ] && [ "$T1_HAS_C45" -eq 1 ] \
   && [ "$T1_C44_INTACT" -eq 1 ] && [ "$T1_GROWTH" -ge "$T1_NEW_LINES" ]; then
  echo "PASS T1 (AC-4 negative control): 0fcc6a5d2 shape replayed (pre=2 sections, 0 drops needed, file grows ${T1_GROWTH}L) — all 3 headings present (c43/c44/c45), c44 byte-intact, NO heading vanished — structurally unreachable via this script"
  PASS=$((PASS + 1))
else
  echo "FAIL T1: rc=$T1_RC headings=$T1_HEADINGS has_c43=$T1_HAS_C43 has_c44=$T1_HAS_C44 has_c45=$T1_HAS_C45 c44_intact=$T1_C44_INTACT growth=$T1_GROWTH new_lines=$T1_NEW_LINES"
  echo "$T1_OUT"
  FAIL=$((FAIL + 1))
fi

# ── T2: steady-state retention drop ──────────────────────────────────────────
T2_NB="$TMPDIR_TEST/t2-nb.md"
{
  echo "## c3 · 2026-08-03T10:00:00Z"
  echo "body3"
  echo ""
  echo "## c2 · 2026-08-02T10:00:00Z"
  echo "body2"
  echo ""
  echo "## c1 · 2026-08-01T10:00:00Z"
  echo "body1"
} > "$T2_NB"
T2_NEW="$TMPDIR_TEST/t2-new.md"
new_section_file "$T2_NEW" "## c4 · 2026-08-04T10:00:00Z" "body4"

run_compose "$T2_NB" "$T2_NEW" 3 60 > /dev/null
T2_HAS_C1=$(t_grep_count '^## c1' "$T2_NB")
T2_HAS_C2=$(t_grep_count '^## c2' "$T2_NB")
T2_HAS_C3=$(t_grep_count '^## c3' "$T2_NB")
T2_HAS_C4=$(t_grep_count '^## c4' "$T2_NB")
T2_ORDER_OK=0
T2_HEADING_SEQUENCE="$(grep -o '^## c[0-9]*' "$T2_NB" | tr '\n' ',')"
[ "$T2_HEADING_SEQUENCE" = "## c4,## c3,## c2," ] && T2_ORDER_OK=1

if [ "$T2_HAS_C1" -eq 0 ] && [ "$T2_HAS_C2" -eq 1 ] && [ "$T2_HAS_C3" -eq 1 ] && [ "$T2_HAS_C4" -eq 1 ] && [ "$T2_ORDER_OK" -eq 1 ]; then
  echo "PASS T2: steady-state retention — c1 (true oldest) dropped, c2/c3 retained, c4 inserted at top, order c4,c3,c2"
  PASS=$((PASS + 1))
else
  echo "FAIL T2: has_c1=$T2_HAS_C1 has_c2=$T2_HAS_C2 has_c3=$T2_HAS_C3 has_c4=$T2_HAS_C4 order_ok=$T2_ORDER_OK"
  FAIL=$((FAIL + 1))
fi

# ── T3: oldest_first override — append at bottom, drop from top ─────────────
T3_ORDER="$TMPDIR_TEST/t3-order.json"
cat > "$T3_ORDER" <<'JSON'
{"overrides": {"t3-nb.md": "oldest_first"}}
JSON
T3_NB="$TMPDIR_TEST/t3-nb.md"
{
  echo "## sX"
  echo "bodyX"
  echo ""
  echo "## sY"
  echo "bodyY"
  echo ""
  echo "## sZ"
  echo "bodyZ"
} > "$T3_NB"
T3_NEW="$TMPDIR_TEST/t3-new.md"
new_section_file "$T3_NEW" "## sW" "bodyW"

NOTEBOOK_COMPOSE_ORDER_FILE="$T3_ORDER" bash "$COMPOSE_SH" "$T3_NB" "$T3_NEW" 3 60 > /dev/null
T3_HAS_X=$(t_grep_count '^## sX' "$T3_NB")
T3_HAS_Y=$(t_grep_count '^## sY' "$T3_NB")
T3_HAS_Z=$(t_grep_count '^## sZ' "$T3_NB")
T3_HAS_W=$(t_grep_count '^## sW' "$T3_NB")
T3_LAST_HEADING=$(grep '^## ' "$T3_NB" | tail -1)

if [ "$T3_HAS_X" -eq 0 ] && [ "$T3_HAS_Y" -eq 1 ] && [ "$T3_HAS_Z" -eq 1 ] && [ "$T3_HAS_W" -eq 1 ] && [ "$T3_LAST_HEADING" = "## sW" ]; then
  echo "PASS T3: oldest_first override — sX (true oldest, physically-first) dropped, sW appended at the bottom"
  PASS=$((PASS + 1))
else
  echo "FAIL T3: has_X=$T3_HAS_X has_Y=$T3_HAS_Y has_Z=$T3_HAS_Z has_W=$T3_HAS_W last_heading='$T3_LAST_HEADING'"
  FAIL=$((FAIL + 1))
fi

# ── T4: section-cap auto-trim ────────────────────────────────────────────────
T4_NB="$TMPDIR_TEST/t4-nb.md"
{ echo "## seed"; echo "seedbody"; } > "$T4_NB"
T4_NEW="$TMPDIR_TEST/t4-new.md"
{ echo "## big"; seq 1 100 | while read -r i; do echo "line $i"; done; } > "$T4_NEW"

T4_OUT=$(run_compose "$T4_NB" "$T4_NEW" 3 60)
T4_RC=$?
T4_BIG_LINES=$(awk '/^## big/{f=1;next} /^## /{f=0} f' "$T4_NB" | t_grep_count '.')
T4_WARN=$(printf '%s' "$T4_OUT" | t_grep_count 'WARN new-section-trimmed-to-cap')

if [ "$T4_RC" -eq 0 ] && [ "$T4_WARN" -eq 1 ] && [ "$T4_BIG_LINES" -le 59 ]; then
  echo "PASS T4: section-cap auto-trim — 101L new section trimmed to <=60L (59 content lines + heading), WARN marker emitted"
  PASS=$((PASS + 1))
else
  echo "FAIL T4: rc=$T4_RC warn_count=$T4_WARN big_content_lines=$T4_BIG_LINES"
  echo "$T4_OUT"
  FAIL=$((FAIL + 1))
fi

# ── T5: AC-2b self-derived sub-block direction (dated, mismatched vs top-level) ──
T5_NB="$TMPDIR_TEST/t5-nb.md"
{
  echo "## Session: 2026-08-06"
  echo "body"
  echo ""
  echo "## Prior cycles"
  echo "### Session 2026-08-01 (true oldest)"
  echo "bodyA"
  echo "### Session 2026-08-02"
  echo "bodyB"
  echo "### Session 2026-08-03"
  echo "bodyC"
  echo "### Session 2026-08-04 (true newest)"
  echo "bodyD"
} > "$T5_NB"
T5_NEW="$TMPDIR_TEST/t5-new.md"
new_section_file "$T5_NEW" "## Session: 2026-08-07" "newbody"

run_compose "$T5_NB" "$T5_NEW" 5 60 > /dev/null
T5_HAS_A=$(t_grep_count '2026-08-01' "$T5_NB")
T5_HAS_D=$(t_grep_count '2026-08-04' "$T5_NB")
T5_SUBCOUNT=$(t_grep_count '^### ' "$T5_NB")

if [ "$T5_HAS_A" -eq 0 ] && [ "$T5_HAS_D" -eq 1 ] && [ "$T5_SUBCOUNT" -eq 3 ]; then
  echo "PASS T5: AC-2b self-derived sub-block direction — dropped the TRUE oldest sub-block (2026-08-01) by its own parseable date, retained the true newest (2026-08-04), independent of top-level convention"
  PASS=$((PASS + 1))
else
  echo "FAIL T5: has_A(should be 0)=$T5_HAS_A has_D(should be 1)=$T5_HAS_D subcount(should be 3)=$T5_SUBCOUNT"
  FAIL=$((FAIL + 1))
fi

# ── T6: AC-2b fallback to top-level DIRECTION (undated sub-headings) ────────
T6_ORDER="$TMPDIR_TEST/t6-order.json"
cat > "$T6_ORDER" <<'JSON'
{"overrides": {"t6-nb.md": "oldest_first"}}
JSON
T6_NB="$TMPDIR_TEST/t6-nb.md"
{
  echo "## Session: 2026-08-06"
  echo "body"
  echo ""
  echo "## Prior cycles"
  echo "### Chef Dish — eod A (physically first)"
  echo "bodyA"
  echo "### Chef Dish — eod B"
  echo "bodyB"
  echo "### Chef Dish — eod C"
  echo "bodyC"
  echo "### Chef Dish — eod D (physically last)"
  echo "bodyD"
} > "$T6_NB"
T6_NEW="$TMPDIR_TEST/t6-new.md"
new_section_file "$T6_NEW" "## Session: 2026-08-07" "newbody"

NOTEBOOK_COMPOSE_ORDER_FILE="$T6_ORDER" bash "$COMPOSE_SH" "$T6_NB" "$T6_NEW" 5 60 > /dev/null
# oldest_first at top-level -> sub-block fallback also oldest_first -> physically-FIRST (A) is the true oldest -> dropped
T6_HAS_A=$(t_grep_count 'eod A' "$T6_NB")
T6_HAS_D=$(t_grep_count 'eod D' "$T6_NB")

if [ "$T6_HAS_A" -eq 0 ] && [ "$T6_HAS_D" -eq 1 ]; then
  echo "PASS T6: AC-2b direction fallback — undated sub-headings (live Chef-Dish shape) fall back to the file's own resolved top-level DIRECTION (oldest_first override here), dropping physically-first (A)"
  PASS=$((PASS + 1))
else
  echo "FAIL T6: has_A(should be 0)=$T6_HAS_A has_D(should be 1)=$T6_HAS_D"
  FAIL=$((FAIL + 1))
fi

# ── T7: single-section safe-fail — file untouched ────────────────────────────
T7_NB="$TMPDIR_TEST/t7-nb.md"
{ seq 1 250 | while read -r i; do echo "preamble line $i"; done; } > "$T7_NB"
T7_NEW="$TMPDIR_TEST/t7-new.md"
new_section_file "$T7_NEW" "## only-new" "body"
T7_HASH_BEFORE="$(shasum -a 256 "$T7_NB" | cut -d' ' -f1)"

T7_OUT=$(run_compose "$T7_NB" "$T7_NEW" 1 60)
T7_RC=$?
T7_HASH_AFTER="$(shasum -a 256 "$T7_NB" | cut -d' ' -f1)"
T7_ABORT=$(printf '%s' "$T7_OUT" | t_grep_count 'ABORT single-section-overage')

if [ "$T7_RC" -ne 0 ] && [ "$T7_HASH_BEFORE" = "$T7_HASH_AFTER" ] && [ "$T7_ABORT" -eq 1 ]; then
  echo "PASS T7: single-section safe-fail — ABORT single-section-overage, notebook file byte-identical before/after (mktemp+mv never touched it)"
  PASS=$((PASS + 1))
else
  echo "FAIL T7: rc=$T7_RC hash_match=$([ "$T7_HASH_BEFORE" = "$T7_HASH_AFTER" ] && echo yes || echo no) abort_count=$T7_ABORT"
  echo "$T7_OUT"
  FAIL=$((FAIL + 1))
fi

# ── T8: bad-usage / malformed-input guards ───────────────────────────────────
T8_NB="$TMPDIR_TEST/t8-nb.md"
{ echo "## seed"; echo "body"; } > "$T8_NB"
T8_HASH_BEFORE="$(shasum -a 256 "$T8_NB" | cut -d' ' -f1)"
T8_PASS=1

T8_check() {
  local desc="$1" expect_grep="$2"; shift 2
  local out rc
  out=$(bash "$COMPOSE_SH" "$@" 2>&1)
  rc=$?
  if [ "$rc" -eq 0 ] || ! printf '%s' "$out" | grep -q "$expect_grep"; then
    echo "  FAIL sub-check ($desc): rc=$rc out=$out"
    T8_PASS=0
  fi
}

T8_check "missing-args" "bad-usage"
T8_check "notebook-not-found" "notebook-not-found" "$TMPDIR_TEST/nope.md" "$T8_NB"
T8_MISSING_NEW="$TMPDIR_TEST/t8-missing-new.md"
T8_check "new-section-not-found" "new-section-file-not-found" "$T8_NB" "$T8_MISSING_NEW"
T8_EMPTY="$TMPDIR_TEST/t8-empty.md"
: > "$T8_EMPTY"
T8_check "new-section-empty" "new-section-empty" "$T8_NB" "$T8_EMPTY"
T8_NOHEADING="$TMPDIR_TEST/t8-noheading.md"
echo "not a heading" > "$T8_NOHEADING"
T8_check "new-section-missing-heading" "new-section-missing-heading" "$T8_NB" "$T8_NOHEADING"
T8_MULTI="$TMPDIR_TEST/t8-multi.md"
{ echo "## a"; echo "b"; echo "## c"; echo "d"; } > "$T8_MULTI"
T8_check "new-section-multiple-headings" "new-section-multiple-headings" "$T8_NB" "$T8_MULTI"

T8_HASH_AFTER="$(shasum -a 256 "$T8_NB" | cut -d' ' -f1)"

if [ "$T8_PASS" -eq 1 ] && [ "$T8_HASH_BEFORE" = "$T8_HASH_AFTER" ]; then
  echo "PASS T8: all 6 bad-usage/malformed-input guards refuse correctly, notebook file untouched throughout"
  PASS=$((PASS + 1))
else
  echo "FAIL T8: one or more sub-checks failed (see above) or notebook file was touched"
  FAIL=$((FAIL + 1))
fi

# ── T9: commit-boundary — this script never touches git ─────────────────────
T9_NB="$TMPDIR_TEST/t9-nb.md"
{ echo "## seed"; echo "body"; } > "$T9_NB"
(cd "$TMPDIR_TEST" && git add t9-nb.md && git commit -q -m "seed t9-nb.md")
T9_NEW="$TMPDIR_TEST/t9-new.md"
new_section_file "$T9_NEW" "## fresh" "freshbody"

run_compose "$T9_NB" "$T9_NEW" 3 60 > /dev/null
T9_STATUS="$(cd "$TMPDIR_TEST" && git status --porcelain -- t9-nb.md)"

if printf '%s' "$T9_STATUS" | grep -qE '^\s?M t9-nb\.md$|^ M t9-nb\.md$'; then
  echo "PASS T9: notebook-compose.sh mutated the WORKING TREE only — git shows it modified-not-staged/committed (commit stays scripts/auditor-notebook-commit.sh's separate job)"
  PASS=$((PASS + 1))
else
  echo "FAIL T9: unexpected git status after compose: '$T9_STATUS'"
  FAIL=$((FAIL + 1))
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
