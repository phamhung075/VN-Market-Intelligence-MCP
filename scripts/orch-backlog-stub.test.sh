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
#                          proves the test methodology itself is sound: with
#                          the pre-fix field list, the SAME fixture flips to
#                          wrongly SATISFIED (gate silently re-opens).
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
check "T2: deps_satisfied() wrongly returns true — gate SILENTLY RE-OPENS (the exact defect AC-4 closes)" \
  "$( [ "$T2_SATISFIED" = "true" ] && echo true || echo false )"

echo "──────────────────────────────────────────────────────────────"
echo "orch-backlog-stub.test.sh: ${PASS} pass / ${FAIL} fail"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
