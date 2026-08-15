#!/usr/bin/env bash
# scripts/orch-backlog-stub.test.sh
#
# Regression test for scripts/orch-backlog-stub.sh STUB_FIELDS
# (Task: FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE, AC-4).
#
# ROOT CAUSE THIS SUITE PROVES CLOSED: STUB_FIELDS used to default to
# id,title,priority,size,type,zone,status,sprint,detail_ref — depends_on,
# depends and blocked_by were NOT in the keep-set. A re-run of this migration
# strips an inline dep from a hot row; that is normally survivable because
# effective_depends_on() falls back to the cold backlog-detail.json entry for
# detail_ref'd rows — EXCEPT the merge is documented "existing cold wins", so
# a row whose cold entry ALREADY carries a stale `depends_on: null` loses the
# correct inline value while the stale null survives, and the dependency
# gate silently RE-OPENS (deps_satisfied flips false->true even though the
# real blocker is still open).
#
# This suite proves AC-4 by EXECUTING scripts/lib/devteam-eligibility.jq's
# deps_satisfied() against the post-migration hot file, never by reading the
# depends_on field back. Two isolated scratch scenarios:
#   T1 (FIXED default)  — STUB_FIELDS unset (uses the script's real shipped
#                          default) -> depends_on survives the stub -> the
#                          dep is still MISSING/not-DONE_VERIFIED -> the row
#                          correctly stays UNSATISFIED (still gated).
#   T2 (regression control, OLD buggy default forced via env override) —
#                          UPDATED 2026-08-15 (task: FIX-ORCHSTATE-HOTFILE-
#                          BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT, F-3 cold-
#                          merge fix, see T3/T4 below): under the OLD buggy
#                          STUB_FIELDS list the row's HOT stub still loses its
#                          inline depends_on (assertion 2 below still
#                          reproduces that half of the original defect), BUT
#                          the gate no longer wrongly re-opens, because
#                          build_detail_temp() captures the FULL hot row
#                          (unfiltered by STUB_FIELDS) and — post F-3 — the
#                          cold-merge now lets that full hot row win per-field
#                          over any stale cold value, so the cold detail
#                          store ends up holding the CORRECT depends_on
#                          regardless of the STUB_FIELDS regression. This is
#                          F-3 providing a second, independent protection
#                          layer, not a test bug — deps_satisfied() now
#                          correctly stays UNSATISFIED even under the old
#                          field list. See T3/T4 for a dedicated, isolated
#                          reproduction of F-3's own bug (data loss on a
#                          hot-exclusive field with no STUB_FIELDS override
#                          involved at all).
#
# All I/O is against an ISOLATED scratch tree (mktemp -d) — never the live
# docs/data/orch/orch-state.json or docs/data/orch/archive/backlog-detail.json.
#
# Run:
#   bash scripts/orch-backlog-stub.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STUB_SH="$REPO_ROOT/scripts/orch-backlog-stub.sh"

PASS=0
FAIL=0
check() {
  local label="$1" cond="$2"
  if [ "$cond" = "true" ]; then
    echo "PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label"
    FAIL=$((FAIL + 1))
  fi
}

TMPDIR_TEST=$(mktemp -d /private/tmp/orch-backlog-stub-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

# ─── build one isolated scenario dir: hot fixture + stale cold seed ─────────
# $1 = scenario dir. Writes hot.json (backlog row w/ inline depends_on on an
# UNRESOLVED blocker id — the dep must stay UNSATISFIED unless silently
# dropped) and archive/backlog-detail.json pre-seeded with a STALE
# `depends_on: null` cold entry for the SAME id (po's exact described hazard:
# "the existing cold entry ... already carries depends_on: null").
build_scenario() {
  local dir="$1"
  mkdir -p "$dir/archive"

  cat > "$dir/hot.json" <<'EOF'
{
  "_meta": { "schema": "v4" },
  "head": { "status": "idle", "active_task_id": null },
  "signal_queue": { "_updated_at": "2026-01-01T00:00:00Z", "_updated_by": "test", "rows": [] },
  "task_board": {
    "backlog": [
      {
        "id": "FIX-DEPTEST-ROW",
        "title": "fixture row for STUB_FIELDS dep-survival test",
        "status": "BACKLOG",
        "priority": "P2",
        "size": "S",
        "type": "FIX",
        "zone": "test/",
        "sprint": null,
        "depends_on": ["FIX-DEPTEST-BLOCKER-NOT-DONE"],
        "detail_ref": "archive/backlog-detail.json#FIX-DEPTEST-ROW",
        "note": "prose that the stub SHOULD strip"
      }
    ],
    "active_sprints": []
  }
}
EOF

  cat > "$dir/archive/backlog-detail.json" <<'EOF'
{
  "_sentinel": "backlog-detail-v1",
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-01-01T00:00:00Z",
  "count": 1,
  "items": {
    "FIX-DEPTEST-ROW": {
      "id": "FIX-DEPTEST-ROW",
      "title": "fixture row for STUB_FIELDS dep-survival test",
      "status": "BACKLOG",
      "priority": "P2",
      "size": "S",
      "type": "FIX",
      "zone": "test/",
      "sprint": null,
      "depends_on": null,
      "note": "prose that the stub SHOULD strip"
    }
  }
}
EOF
}

# ─── run deps_satisfied() for FIX-DEPTEST-ROW against a post-migration hot
#     file, by EXECUTING scripts/lib/devteam-eligibility.jq — never by
#     reading the depends_on field back. Must be invoked with cwd=REPO_ROOT
#     (jq `include` path resolution is caller-cwd-relative, not
#     file-location-relative — see devteam-eligibility.jq's own header).
exec_deps_satisfied() {
  local hot_file="$1" detail_file="$2"
  ( cd "$REPO_ROOT" && jq -r \
      --slurpfile detail "$detail_file" \
      '
        include "scripts/lib/devteam-eligibility";
        (detail_items_from($detail)) as $di
        | (dep_status_map) as $sm
        | (.task_board.backlog[] | select(.id=="FIX-DEPTEST-ROW") | deps_satisfied($di; $sm))
      ' "$hot_file"
  )
}

# ═════════════════════════════════════════════════════════════════════════
# T1 — FIXED default STUB_FIELDS (unset -> script's real shipped default):
# depends_on must survive the stub, and the (still-open) blocker must keep
# the row UNSATISFIED (correctly gated).
# ═════════════════════════════════════════════════════════════════════════
T1_DIR="$TMPDIR_TEST/t1-fixed"
build_scenario "$T1_DIR"

ORCH_STATE="$T1_DIR/hot.json" \
ARCHIVE_DIR="$T1_DIR/archive" \
DETAIL_FILE="$T1_DIR/archive/backlog-detail.json" \
  bash "$STUB_SH" >"$T1_DIR/run.log" 2>&1
T1_EXIT=$?
check "T1: orch-backlog-stub.sh exits 0 (fixed default)" "$( [ "$T1_EXIT" -eq 0 ] && echo true || echo false )"

T1_HAS_DEPENDS_ON=$(jq -r '.task_board.backlog[0] | has("depends_on")' "$T1_DIR/hot.json" 2>/dev/null)
check "T1: hot stub RETAINS depends_on field" "$( [ "$T1_HAS_DEPENDS_ON" = "true" ] && echo true || echo false )"

T1_HAS_NOTE=$(jq -r '.task_board.backlog[0] | has("note")' "$T1_DIR/hot.json" 2>/dev/null)
check "T1: hot stub STRIPS non-stub prose field (note)" "$( [ "$T1_HAS_NOTE" = "false" ] && echo true || echo false )"

T1_SATISFIED=$(exec_deps_satisfied "$T1_DIR/hot.json" "$T1_DIR/archive/backlog-detail.json")
check "T1: deps_satisfied() executes and returns false — dep still binds (gate stays CLOSED)" \
  "$( [ "$T1_SATISFIED" = "false" ] && echo true || echo false )"

# ═════════════════════════════════════════════════════════════════════════
# T2 — regression control: force the OLD (pre-fix) STUB_FIELDS via explicit
# env override on a SEPARATE, identically-built scenario. Proves the test
# methodology is sound (not vacuously true regardless of STUB_FIELDS
# content) by reproducing the exact silent-gate-reopen failure PO described.
# ═════════════════════════════════════════════════════════════════════════
T2_DIR="$TMPDIR_TEST/t2-old-buggy"
build_scenario "$T2_DIR"

ORCH_STATE="$T2_DIR/hot.json" \
ARCHIVE_DIR="$T2_DIR/archive" \
DETAIL_FILE="$T2_DIR/archive/backlog-detail.json" \
STUB_FIELDS="id,title,priority,size,type,zone,status,sprint,detail_ref" \
  bash "$STUB_SH" >"$T2_DIR/run.log" 2>&1
T2_EXIT=$?
check "T2: orch-backlog-stub.sh exits 0 (old buggy STUB_FIELDS)" "$( [ "$T2_EXIT" -eq 0 ] && echo true || echo false )"

T2_HAS_DEPENDS_ON=$(jq -r '.task_board.backlog[0] | has("depends_on")' "$T2_DIR/hot.json" 2>/dev/null)
check "T2: hot stub STRIPS depends_on under the OLD field list (reproduces the bug)" \
  "$( [ "$T2_HAS_DEPENDS_ON" = "false" ] && echo true || echo false )"

T2_SATISFIED=$(exec_deps_satisfied "$T2_DIR/hot.json" "$T2_DIR/archive/backlog-detail.json")
check "T2: deps_satisfied() stays false — F-3 cold-merge fix now protects even the OLD buggy STUB_FIELDS list (defense-in-depth, see header note)" \
  "$( [ "$T2_SATISFIED" = "false" ] && echo true || echo false )"

# ═════════════════════════════════════════════════════════════════════════
# T3/T4 — F-3 cold-merge fix (task: FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-
# NOT-TERMINAL-DRIFT), isolated from the STUB_FIELDS/AC-4 scenario above:
# proves build_detail_temp()'s merge is now a PER-FIELD deep merge
# (`.items = (.items * $new_items)`), not the old shallow
# `($new_items + .items)` where an existing cold value won WHOLESALE for a
# duplicate id, silently discarding ANY field that only ever existed on the
# hot side (e.g. fresh prose added since the row's last stub run).
#
# Scenario: cold pre-seeded with an OLD title + a cold-exclusive `note` field
# (already stripped from hot by a prior run, survives only in cold). Hot
# carries a NEW title (re-edited since the last stub — a genuinely re-editable
# field) + a brand-new `review_note` field that was NEVER stubbed (added to
# hot after the last stub run, has no cold counterpart at all).
#
# T3 (title, field COLLISION)      — hot wins: cold detail's title updates to
#                                     the hot value, not frozen at the stale
#                                     cold copy.
# T4a (note, COLD-exclusive field) — survives untouched (proves the fix is a
#                                     true merge, not a hot-wholesale-wins
#                                     replacement — the opposite defect).
# T4b (review_note, HOT-exclusive
#      field, THE F-3 REPRODUCTION) — picked up into cold. Under the PRE-FIX
#                                     shallow merge this field was silently
#                                     discarded (existing cold entry, lacking
#                                     review_note entirely, won wholesale) —
#                                     manually verified RED against the
#                                     pre-fix `($new_items + .items)` line via
#                                     `git stash` before landing this suite;
#                                     GREEN is the permanent regression proof.
# ═════════════════════════════════════════════════════════════════════════
T3_DIR="$TMPDIR_TEST/t3-cold-merge"
mkdir -p "$T3_DIR/archive"

cat > "$T3_DIR/hot.json" <<'EOF'
{
  "_meta": { "schema": "v4" },
  "head": { "status": "idle", "active_task_id": null },
  "signal_queue": { "_updated_at": "2026-01-01T00:00:00Z", "_updated_by": "test", "rows": [] },
  "task_board": {
    "backlog": [
      {
        "id": "FIX-MERGETEST-ROW",
        "title": "NEW TITLE (re-edited since last stub)",
        "status": "BACKLOG",
        "priority": "P2",
        "size": "S",
        "type": "FIX",
        "zone": "test/",
        "sprint": null,
        "detail_ref": "archive/backlog-detail.json#FIX-MERGETEST-ROW",
        "review_note": "fresh hot-only prose, added after the last stub run, no cold counterpart"
      }
    ],
    "active_sprints": []
  }
}
EOF

cat > "$T3_DIR/archive/backlog-detail.json" <<'EOF'
{
  "_sentinel": "backlog-detail-v1",
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-01-01T00:00:00Z",
  "count": 1,
  "items": {
    "FIX-MERGETEST-ROW": {
      "id": "FIX-MERGETEST-ROW",
      "title": "OLD TITLE (stale, pre-dates the hot re-edit)",
      "note": "cold-only prose, already stripped from hot by a prior stub run"
    }
  }
}
EOF

ORCH_STATE="$T3_DIR/hot.json" \
ARCHIVE_DIR="$T3_DIR/archive" \
DETAIL_FILE="$T3_DIR/archive/backlog-detail.json" \
  bash "$STUB_SH" >"$T3_DIR/run.log" 2>&1
T3_EXIT=$?
check "T3/T4: orch-backlog-stub.sh exits 0 (cold-merge fixture)" "$( [ "$T3_EXIT" -eq 0 ] && echo true || echo false )"

# NOTE (F-4 fix, FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-
# MIGRATION): cold `.items` is now ALWAYS written back ARRAY-shaped (decided +
# documented in the script's own header + dev-standards.md CANONICAL block —
# matches the live file's real shape, matches po-detail-resync-review-
# lifecycle-routing.sh's own read+write convention, and is the only shape that
# can round-trip an id-less legacy cold item, see T8 below). T3/T4's cold
# fixture is deliberately pre-seeded OBJECT-shaped (proves object-shaped INPUT
# is still accepted, back-compat) but assertions read the ARRAY-shaped OUTPUT.
T3_COLD_TITLE=$(jq -r '.items[] | select(.id=="FIX-MERGETEST-ROW") | .title' "$T3_DIR/archive/backlog-detail.json" 2>/dev/null)
check "T3: field COLLISION — cold title updated to the HOT (re-edited) value" \
  "$( [ "$T3_COLD_TITLE" = "NEW TITLE (re-edited since last stub)" ] && echo true || echo false )"

T4A_COLD_NOTE=$(jq -r '.items[] | select(.id=="FIX-MERGETEST-ROW") | .note' "$T3_DIR/archive/backlog-detail.json" 2>/dev/null)
check "T4a: COLD-exclusive field (note) survives untouched" \
  "$( [ "$T4A_COLD_NOTE" = "cold-only prose, already stripped from hot by a prior stub run" ] && echo true || echo false )"

T4B_COLD_REVIEW_NOTE=$(jq -r '.items[] | select(.id=="FIX-MERGETEST-ROW") | .review_note' "$T3_DIR/archive/backlog-detail.json" 2>/dev/null)
check "T4b: HOT-exclusive field (review_note) is PICKED UP into cold — F-3 data-loss reproduction, GREEN post-fix" \
  "$( [ "$T4B_COLD_REVIEW_NOTE" = "fresh hot-only prose, added after the last stub run, no cold counterpart" ] && echo true || echo false )"

T4C_COLD_IS_ARRAY=$(jq -r '.items | type' "$T3_DIR/archive/backlog-detail.json" 2>/dev/null)
check "T4c: cold .items OUTPUT is ARRAY-shaped even though INPUT was object-shaped (shape decision self-heals on write)" \
  "$( [ "$T4C_COLD_IS_ARRAY" = "array" ] && echo true || echo false )"

# ═════════════════════════════════════════════════════════════════════════
# T5/T6/T7 — LANES generalization (task: FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-
# PROSE-NOT-TERMINAL-DRIFT, architect brief §2.2): additive `LANES` config
# var / `--lane=<x>` CLI flag, mirrors the STUB_FIELDS idiom exactly.
#
# Fixture: one row in EACH of backlog[]/ready[]/review[].
#
# T5 (default, zero call-site churn) — no LANES env, no --lane flag: ONLY
#   backlog[] is touched. ready[]/review[] rows are left completely
#   byte-identical to their pre-run state — proves every one of the ~10
#   existing backlog[]-only callers sees no behavior change.
# T6 (--lane=review, single-invocation override) — processes review[] ALONE
#   (NOT merged with the "backlog" default) — backlog[]/ready[] untouched.
# T7 (LANES=backlog,ready,review, the one-time-migration invocation shape) —
#   all 3 lanes stubbed in ONE run, all 3 land in the SAME cold detail file
#   (id -> object map, matches the live po-detail-resync-review-lifecycle-
#   routing.sh convention), reconciliation PASSes across all 3.
# ═════════════════════════════════════════════════════════════════════════
build_lane_scenario() {
  local dir="$1"
  mkdir -p "$dir/archive"
  cat > "$dir/hot.json" <<'EOF'
{
  "_meta": { "schema": "v4" },
  "head": { "status": "idle", "active_task_id": null },
  "signal_queue": { "_updated_at": "2026-01-01T00:00:00Z", "_updated_by": "test", "rows": [] },
  "task_board": {
    "backlog": [
      { "id": "LANE-BACKLOG-1", "title": "b1", "status": "BACKLOG", "priority": "P2", "size": "S", "type": "FIX", "zone": "test/", "sprint": null, "note": "backlog prose" }
    ],
    "ready": [
      { "id": "LANE-READY-1", "title": "rd1", "status": "READY", "priority": "P2", "size": "S", "type": "FIX", "zone": "test/", "sprint": null, "note": "ready prose" }
    ],
    "review": [
      { "id": "LANE-REVIEW-1", "title": "r1", "status": "REVIEW", "priority": "P2", "size": "S", "type": "FIX", "zone": "test/", "sprint": null, "note": "review prose" }
    ],
    "active_sprints": []
  }
}
EOF
}

# ── T5: default invocation — backlog[] ONLY ─────────────────────────────────
T5_DIR="$TMPDIR_TEST/t5-default-backlog-only"
build_lane_scenario "$T5_DIR"

ORCH_STATE="$T5_DIR/hot.json" \
ARCHIVE_DIR="$T5_DIR/archive" \
DETAIL_FILE="$T5_DIR/archive/backlog-detail.json" \
  bash "$STUB_SH" >"$T5_DIR/run.log" 2>&1
T5_EXIT=$?
check "T5: orch-backlog-stub.sh exits 0 (default, no LANES/--lane)" "$( [ "$T5_EXIT" -eq 0 ] && echo true || echo false )"

T5_BACKLOG_HAS_DETAIL_REF=$(jq -r '.task_board.backlog[0] | has("detail_ref")' "$T5_DIR/hot.json" 2>/dev/null)
check "T5: backlog[0] WAS stubbed (has detail_ref)" \
  "$( [ "$T5_BACKLOG_HAS_DETAIL_REF" = "true" ] && echo true || echo false )"

T5_READY_UNTOUCHED=$(jq -r '.task_board.ready[0] | has("note") and (has("detail_ref") | not)' "$T5_DIR/hot.json" 2>/dev/null)
check "T5: ready[0] left COMPLETELY untouched (default lane = backlog only)" \
  "$( [ "$T5_READY_UNTOUCHED" = "true" ] && echo true || echo false )"

T5_REVIEW_UNTOUCHED=$(jq -r '.task_board.review[0] | has("note") and (has("detail_ref") | not)' "$T5_DIR/hot.json" 2>/dev/null)
check "T5: review[0] left COMPLETELY untouched (default lane = backlog only)" \
  "$( [ "$T5_REVIEW_UNTOUCHED" = "true" ] && echo true || echo false )"

# ARRAY-shaped cold .items (F-4 shape decision) — extract ids via [.items[].id],
# not object `keys` (which would yield array indices, not ids, on this shape).
T5_COLD_IDS=$(jq -c '[.items[].id]' "$T5_DIR/archive/backlog-detail.json" 2>/dev/null)
check "T5: cold detail contains ONLY the backlog[] id" \
  "$( [ "$T5_COLD_IDS" = '["LANE-BACKLOG-1"]' ] && echo true || echo false )"

# ── T6: --lane=review — review[] ALONE, NOT merged with the backlog default ─
T6_DIR="$TMPDIR_TEST/t6-lane-review-only"
build_lane_scenario "$T6_DIR"

ORCH_STATE="$T6_DIR/hot.json" \
ARCHIVE_DIR="$T6_DIR/archive" \
DETAIL_FILE="$T6_DIR/archive/backlog-detail.json" \
  bash "$STUB_SH" --dry-run --lane=review >"$T6_DIR/dryrun.log" 2>&1
T6_DRYRUN_EXIT=$?
check "T6: --dry-run --lane=review exits 0, zero writes" "$( [ "$T6_DRYRUN_EXIT" -eq 0 ] && echo true || echo false )"

T6_DRYRUN_UNCHANGED=$(jq -r '.task_board.review[0] | has("detail_ref") | not' "$T6_DIR/hot.json" 2>/dev/null)
check "T6: --dry-run makes ZERO writes (review[0] still unstubbed after dry-run)" \
  "$( [ "$T6_DRYRUN_UNCHANGED" = "true" ] && echo true || echo false )"

ORCH_STATE="$T6_DIR/hot.json" \
ARCHIVE_DIR="$T6_DIR/archive" \
DETAIL_FILE="$T6_DIR/archive/backlog-detail.json" \
  bash "$STUB_SH" --lane=review >"$T6_DIR/run.log" 2>&1
T6_EXIT=$?
check "T6: live --lane=review exits 0" "$( [ "$T6_EXIT" -eq 0 ] && echo true || echo false )"

T6_REVIEW_STUBBED=$(jq -r '.task_board.review[0] | has("detail_ref")' "$T6_DIR/hot.json" 2>/dev/null)
check "T6: review[0] WAS stubbed" "$( [ "$T6_REVIEW_STUBBED" = "true" ] && echo true || echo false )"

T6_BACKLOG_UNTOUCHED=$(jq -r '.task_board.backlog[0] | has("note") and (has("detail_ref") | not)' "$T6_DIR/hot.json" 2>/dev/null)
check "T6: backlog[0] left untouched — --lane OVERRIDES, does not merge with the default" \
  "$( [ "$T6_BACKLOG_UNTOUCHED" = "true" ] && echo true || echo false )"

T6_COLD_IDS=$(jq -c '[.items[].id]' "$T6_DIR/archive/backlog-detail.json" 2>/dev/null)
check "T6: cold detail contains ONLY the review[] id" \
  "$( [ "$T6_COLD_IDS" = '["LANE-REVIEW-1"]' ] && echo true || echo false )"

# ── T7: LANES=backlog,ready,review — the one-time-migration invocation shape ─
T7_DIR="$TMPDIR_TEST/t7-lanes-all-three"
build_lane_scenario "$T7_DIR"

LANES="backlog,ready,review" \
ORCH_STATE="$T7_DIR/hot.json" \
ARCHIVE_DIR="$T7_DIR/archive" \
DETAIL_FILE="$T7_DIR/archive/backlog-detail.json" \
  bash "$STUB_SH" >"$T7_DIR/run.log" 2>&1
T7_EXIT=$?
check "T7: LANES=backlog,ready,review exits 0 (reconciliation PASS across all 3)" \
  "$( [ "$T7_EXIT" -eq 0 ] && echo true || echo false )"

T7_ALL_STUBBED=$(jq -r '[.task_board.backlog[0], .task_board.ready[0], .task_board.review[0]] | map(has("detail_ref")) | all' "$T7_DIR/hot.json" 2>/dev/null)
check "T7: ALL 3 lanes stubbed in ONE run" "$( [ "$T7_ALL_STUBBED" = "true" ] && echo true || echo false )"

T7_COLD_IDS=$(jq -c '[.items[].id] | sort' "$T7_DIR/archive/backlog-detail.json" 2>/dev/null)
check "T7: SAME cold detail file holds all 3 ids (id-keyed, not lane-scoped)" \
  "$( [ "$T7_COLD_IDS" = '["LANE-BACKLOG-1","LANE-READY-1","LANE-REVIEW-1"]' ] && echo true || echo false )"

# ═════════════════════════════════════════════════════════════════════════
# T8 — F-4 fix (task: FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-
# LANES-MIGRATION): build_detail_temp()'s merge branch crashed on an
# ARRAY-shaped cold `.items` — the REAL live-data shape (442-element array of
# id-bearing objects) — because it hardcoded an object*object deep merge. This
# is the exact gap that hid F-4 from every fixture in T1-T7 above (all of
# which pre-seed OBJECT-shaped cold fixtures). Reproduced live 2026-08-15 by
# PO against a scratch copy of the real orch-state.json +
# backlog-detail.json: `jq: error ... array (...) and object (...) cannot be
# multiplied`, exit 5.
#
# Fixture: ARRAY-shaped cold pre-seed, one entry sharing an id with a hot row
# (proves the merge itself, not just shape tolerance — hot title wins,
# cold-exclusive field survives, mirrors T3/T4 but on the REAL input shape)
# PLUS one id-LESS legacy entry (mirrors the real cold file's one pre-id-
# scheme record, docs/data/orch/archive/backlog-detail.json's "ORCH-STATE-
# HOT-COLD-SPLIT follow-on" stub) that must survive the round-trip untouched
# even though it cannot be id-keyed for the merge.
# ═════════════════════════════════════════════════════════════════════════
T8_DIR="$TMPDIR_TEST/t8-array-shaped-cold-input"
mkdir -p "$T8_DIR/archive"

cat > "$T8_DIR/hot.json" <<'EOF'
{
  "_meta": { "schema": "v4" },
  "head": { "status": "idle", "active_task_id": null },
  "signal_queue": { "_updated_at": "2026-01-01T00:00:00Z", "_updated_by": "test", "rows": [] },
  "task_board": {
    "backlog": [
      {
        "id": "FIX-ARRAYSHAPE-ROW",
        "title": "NEW TITLE (re-edited since last stub)",
        "status": "BACKLOG",
        "priority": "P2",
        "size": "S",
        "type": "FIX",
        "zone": "test/",
        "sprint": null,
        "detail_ref": "archive/backlog-detail.json#FIX-ARRAYSHAPE-ROW"
      }
    ],
    "active_sprints": []
  }
}
EOF

cat > "$T8_DIR/archive/backlog-detail.json" <<'EOF'
{
  "_sentinel": "backlog-detail-v1",
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-01-01T00:00:00Z",
  "count": 2,
  "items": [
    {
      "id": "FIX-ARRAYSHAPE-ROW",
      "title": "OLD TITLE (stale, pre-dates the hot re-edit)",
      "note": "cold-only prose, already stripped from hot by a prior stub run"
    },
    {
      "created_at": "2026-06-26T20:10:51Z",
      "created_by": "po",
      "desc": "id-less legacy cold record — pre-dates the id addressing scheme, cannot be id-keyed, must survive the round-trip untouched (mirrors the live backlog-detail.json ORCH-STATE-HOT-COLD-SPLIT follow-on stub)"
    }
  ]
}
EOF

ORCH_STATE="$T8_DIR/hot.json" \
ARCHIVE_DIR="$T8_DIR/archive" \
DETAIL_FILE="$T8_DIR/archive/backlog-detail.json" \
  bash "$STUB_SH" >"$T8_DIR/run.log" 2>&1
T8_EXIT=$?
check "T8: orch-backlog-stub.sh does NOT crash on ARRAY-shaped cold .items (F-4 fix, the real live-data shape)" \
  "$( [ "$T8_EXIT" -eq 0 ] && echo true || echo false )"

T8_COLD_TITLE=$(jq -r '.items[] | select(.id=="FIX-ARRAYSHAPE-ROW") | .title' "$T8_DIR/archive/backlog-detail.json" 2>/dev/null)
check "T8: merge still correct on array input — cold title updated to the HOT value" \
  "$( [ "$T8_COLD_TITLE" = "NEW TITLE (re-edited since last stub)" ] && echo true || echo false )"

T8_COLD_NOTE=$(jq -r '.items[] | select(.id=="FIX-ARRAYSHAPE-ROW") | .note' "$T8_DIR/archive/backlog-detail.json" 2>/dev/null)
check "T8: merge still correct on array input — cold-exclusive field (note) survives" \
  "$( [ "$T8_COLD_NOTE" = "cold-only prose, already stripped from hot by a prior stub run" ] && echo true || echo false )"

T8_IDLESS_SURVIVES=$(jq -r '[.items[] | select(.id == null) | select(.desc | contains("id-less legacy cold record"))] | length' "$T8_DIR/archive/backlog-detail.json" 2>/dev/null)
check "T8: id-less legacy cold item is PRESERVED, not silently dropped by the id-keyed merge" \
  "$( [ "$T8_IDLESS_SURVIVES" = "1" ] && echo true || echo false )"

T8_RECONCILE_PASS=$(grep -c "Reconciliation PASS" "$T8_DIR/run.log" 2>/dev/null || echo 0)
check "T8: post-write reconciliation PASSES against array-shaped cold (adjacent defect fixed: keys-vs-array-index)" \
  "$( [ "$T8_RECONCILE_PASS" -ge 1 ] && echo true || echo false )"

# ═════════════════════════════════════════════════════════════════════════
# T9 — F-5 fix (same task, AC-2): STUB_FIELDS is an unconditional whitelist,
# so build_hot_temp() used to strip po_goahead_* stamps from hot rows even
# though they are not literally in STUB_FIELDS. WF-2 should_hold
# (dev-team/flow/main.md) reads a `^po_goahead` key straight off the HOT row
# (union'd with `.head` keys, no cold fallback) — silently stripping it would
# REVOKE a PO ratification with no error and no trace. Fixture: a supervised
# review[] row carrying both a po_goahead_<ts> stamp AND ordinary
# prose NOT in STUB_FIELDS (proves the fix is prefix-scoped to `^po_goahead`,
# not a blanket "keep everything" regression).
# ═════════════════════════════════════════════════════════════════════════
T9_DIR="$TMPDIR_TEST/t9-po-goahead-survives"
mkdir -p "$T9_DIR/archive"

cat > "$T9_DIR/hot.json" <<'EOF'
{
  "_meta": { "schema": "v4" },
  "head": { "status": "idle", "active_task_id": null },
  "signal_queue": { "_updated_at": "2026-01-01T00:00:00Z", "_updated_by": "test", "rows": [] },
  "task_board": {
    "backlog": [],
    "review": [
      {
        "id": "FIX-GOAHEADTEST-ROW",
        "title": "fixture row for po_goahead_* survival test",
        "status": "REVIEW",
        "priority": "P1",
        "size": "S",
        "type": "FIX",
        "zone": "test/",
        "sprint": null,
        "supervised": true,
        "po_goahead_20260815T090000": "RATIFIED — synthetic test stamp, must survive the stub strip",
        "unrelated_prose_field": "this SHOULD still be stripped — proves the fix is scoped to ^po_goahead, not a blanket keep-all"
      }
    ],
    "active_sprints": []
  }
}
EOF

ORCH_STATE="$T9_DIR/hot.json" \
ARCHIVE_DIR="$T9_DIR/archive" \
DETAIL_FILE="$T9_DIR/archive/backlog-detail.json" \
  bash "$STUB_SH" --lane=review >"$T9_DIR/run.log" 2>&1
T9_EXIT=$?
check "T9: orch-backlog-stub.sh --lane=review exits 0 (po_goahead fixture)" "$( [ "$T9_EXIT" -eq 0 ] && echo true || echo false )"

T9_GOAHEAD_SURVIVES=$(jq -r '.task_board.review[0] | has("po_goahead_20260815T090000")' "$T9_DIR/hot.json" 2>/dev/null)
check "T9: po_goahead_* stamp SURVIVES the hot stub strip (F-5 fix — PO ratification not silently revoked)" \
  "$( [ "$T9_GOAHEAD_SURVIVES" = "true" ] && echo true || echo false )"

T9_UNRELATED_STRIPPED=$(jq -r '.task_board.review[0] | has("unrelated_prose_field")' "$T9_DIR/hot.json" 2>/dev/null)
check "T9: non-po_goahead prose field STILL stripped (fix is prefix-scoped, not a blanket keep-all)" \
  "$( [ "$T9_UNRELATED_STRIPPED" = "false" ] && echo true || echo false )"

T9_GOAHEAD_VALUE=$(jq -r '.task_board.review[0].po_goahead_20260815T090000' "$T9_DIR/hot.json" 2>/dev/null)
check "T9: po_goahead_* stamp VALUE is byte-identical, not just the key" \
  "$( [ "$T9_GOAHEAD_VALUE" = "RATIFIED — synthetic test stamp, must survive the stub strip" ] && echo true || echo false )"

echo "──────────────────────────────────────────────────────────────"
echo "orch-backlog-stub.test.sh: ${PASS} pass / ${FAIL} fail"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
