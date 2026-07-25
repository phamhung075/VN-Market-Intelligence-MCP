#!/usr/bin/env bash
# scripts/test-fb-gate-checkd2-nonwaivable.sh — regression harness for
# FIX-FB-GATE-CHECKD2-NONWAIVABLE-NUMERIC-BLOCK (2026-07-25)
#
# Root cause (verified live 2026-07-25, board note on
# FIX-FB-GATE-CHECKD2-NONWAIVABLE-NUMERIC-BLOCK): Check-D2 (VN-Index %-vs-live
# mismatch under --frame=weekly) ALREADY detects correctly — it BLOCKed 2/2
# rounds on a live WEEKLY_RECAP post (post -3,29% vs live -5,67%) — but the
# flow docs' bounded-retry posture ("EXIT-only-on-real-fabrication") was
# ambiguous enough to be read gate-WIDE, so the poster PROCEEDED anyway and
# shipped docs/social/fb-post-2026-07-25.md with the wrong weekly baseline
# (Monday's own close used as "lúc đầu tuần" instead of the PRIOR week's
# close). This is the WAIVER-PATH bug, not a detection bug — the fix here is
# entirely in docs/agents/fb-market-poster/flow/{main,weekly-recap,
# weekly-prediction}.md prose: Check-C's negation-blind prose pattern remains
# the ONLY waivable check; every numeric check (Check-D2 named explicitly) is
# now non-waivable in that prose.
#
# Assertions:
#   (1) DETECTION PROOF (unmodified gate script — no code change needed here):
#       run the gate --frame=weekly against the LIVE regression fixture
#       docs/social/fb-post-2026-07-25.md (on disk, standing DO-NOT-PASTE
#       hold pending this fix — do NOT edit that file, this harness proves
#       the fix without touching it) with a correct weekly period-close
#       snapshot (VNINDEX prior-Friday close 1787 -> this-Friday close
#       1686.11, matching the router's ground-truth get_price_history read)
#       -> gate MUST exit non-zero with a Check-D2 [BLOCK] line. Proves the
#       live-miss scenario is still (and was always) correctly DETECTED.
#   (2) NO-REGRESSION CONTRAST: a weekly post whose stated VN-Index level+%
#       matches the SAME live snapshot exactly -> gate MUST PASS (exit 0,
#       0 Check-D2 violations). Proves the fix doesn't turn Check-D2 into a
#       blanket blocker.
#   (3) DOC-PROSE ASSERTIONS (direct regex, mirrors the sibling harness's
#       assertion (3) shape — proving the fix in situ, not just detection):
#       (3a) the old ambiguous "EXIT-only-on-real-fabrication posture" phrase
#            is GONE from the live STEP body of weekly-recap.md and
#            weekly-prediction.md (excluding the size-justification header
#            comment, which documents the removal and legitimately still
#            names the old phrase).
#       (3b) main.md explicitly marks Check-D2 NON-WAIVABLE and carries the
#            Check-D2 fix protocol (recompute baseline as PRIOR period close).
#       (3c) Check-C's own honest-gap-and-PROCEED waive language is still
#            present in main.md — proves the fix narrowed waivability to
#            Check-C without collaterally deleting Check-C's legitimate path.
#       (3d) weekly-recap.md and weekly-prediction.md both point at the
#            FIX-FB-GATE-CHECKD2-NONWAIVABLE-NUMERIC-BLOCK marker.
#
# Usage: bash scripts/test-fb-gate-checkd2-nonwaivable.sh
# Exit codes: 0 = all assertions PASS ; 1 = >=1 assertion FAILED

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GATE="$REPO_ROOT/scripts/fb-data-integrity-gate.sh"
LIVE_FIXTURE="$REPO_ROOT/docs/social/fb-post-2026-07-25.md"
MAIN_FLOW="$REPO_ROOT/docs/agents/fb-market-poster/flow/main.md"
WEEKLY_RECAP="$REPO_ROOT/docs/agents/fb-market-poster/flow/weekly-recap.md"
WEEKLY_PREDICTION="$REPO_ROOT/docs/agents/fb-market-poster/flow/weekly-prediction.md"

PASS_COUNT=0
FAIL_COUNT=0

ok() {
  echo "[TEST-PASS] $1"
  PASS_COUNT=$((PASS_COUNT + 1))
}
bad() {
  echo "[TEST-FAIL] $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

echo "=============================================================================="
echo " fb-data-integrity-gate Check-D2 non-waivable harness — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=============================================================================="

if [[ ! -f "$LIVE_FIXTURE" ]]; then
  bad "(1)/(2) LIVE FIXTURE MISSING: $LIVE_FIXTURE not found — cannot run detection proof"
else
  TMPD="$(mktemp -d "${TMPDIR:-/tmp}/fbgate-checkd2-XXXXXX")"
  trap 'rm -rf "$TMPD"' EXIT

  # Correct weekly period-close snapshot — matches the router's ground-truth
  # get_price_history(VNINDEX) read: 2026-07-17 close 1787 -> 2026-07-24 close
  # 1686 = -101pts/-5.65% WoW (board note on this task_id).
  SNAPSHOT_WEEKLY="$TMPD/snapshot-weekly-correct.json"
  cat > "$SNAPSHOT_WEEKLY" <<'EOF'
{"quotes": {"VNINDEX": {"ticker":"VNINDEX","close":1686.11,"changePct":-5.6520}, "VN30": {"ticker":"VN30","close":1758.0,"changePct":-5.0}, "HNXINDEX": {"ticker":"HNXINDEX","close":255.0,"changePct":-3.5}, "UPCOMINDEX": {"ticker":"UPCOMINDEX","close":93.0,"changePct":-2.0}}}
EOF

  # ── (1) Detection proof: LIVE fixture, unmodified, MUST BLOCK ───────────────
  echo ""
  echo "--- (1) LIVE fixture docs/social/fb-post-2026-07-25.md, --frame=weekly, correct period-close snapshot (MUST BLOCK, Check-D2) ---"
  OUT_1="$(bash "$GATE" --frame=weekly "$LIVE_FIXTURE" "2026-07-25" "$SNAPSHOT_WEEKLY" 2>&1)"
  RC_1=$?
  echo "$OUT_1" | sed 's/^/  /'

  if [[ $RC_1 -ne 0 ]]; then
    ok "(1) exit code: gate exited non-zero (rc=$RC_1) — numeric BLOCK correctly fires on the live miss"
  else
    bad "(1) exit code: gate exited 0 — expected a Check-D2 BLOCK on the live wrong-baseline fixture"
  fi
  if echo "$OUT_1" | grep -q 'Check-D2'; then
    ok "(1) Check-D2 [BLOCK] line present — detection confirmed (this was already correct; the bug was the waiver path, not detection)"
  else
    bad "(1) expected a Check-D2 [BLOCK] line — not found"
  fi

  # ── (2) No-regression contrast: correctly-baselined post MUST PASS ─────────
  CORRECT_POST="$TMPD/correct-weekly-post.md"
  cat > "$CORRECT_POST" <<'EOF'
# Thị trường chứng khoán Việt Nam — Tổng kết tuần 2026-07-25

_Được tạo bởi bot AI lúc 20:26 giờ Việt Nam_

Tóm tắt nhanh:

VN-Index đóng cửa tuần này ở 1.686,11 điểm (-5,65%) so với tuần trước, phản ánh áp lực bán lan rộng.

Phân tích:

Thị trường chịu áp lực từ nhiều yếu tố vĩ mô trong tuần.

Tổng kết:

Tuần ghi nhận mức giảm đáng kể, thị trường thận trọng quan sát diễn biến tuần tới.

---
⚠️ Nội dung được tạo tự động bởi bot AI, chưa được kiểm chứng. Tôi không chịu trách nhiệm về tính chính xác của thông tin. Nếu nội dung có sai sót hoặc cần chỉnh sửa, mọi góp ý của bạn sẽ được ghi nhận lại để giúp bot hoạt động và phục vụ bạn tốt hơn.
---
#chungkhoan #chungkhoanvietnam #vnindex #dautu #thitruongchungkhoan
EOF

  echo ""
  echo "--- (2) contrast fixture: VN-Index figure matches live snapshot exactly (MUST PASS) ---"
  OUT_2="$(bash "$GATE" --frame=weekly "$CORRECT_POST" "2026-07-25" "$SNAPSHOT_WEEKLY" 2>&1)"
  RC_2=$?
  echo "$OUT_2" | sed 's/^/  /'

  if [[ $RC_2 -eq 0 ]]; then
    ok "(2) exit code: gate exited 0 — correctly-baselined figure PASSes (no regression)"
  else
    bad "(2) exit code: gate exited non-zero (rc=$RC_2) — unexpected BLOCK on a correctly-baselined post"
  fi
  if ! echo "$OUT_2" | grep -q 'Check-D2'; then
    ok "(2) no Check-D2 [BLOCK] line present"
  else
    bad "(2) unexpected Check-D2 [BLOCK] line found:"
    echo "$OUT_2" | grep 'Check-D2' | sed 's/^/    /'
  fi
fi

# ── (3) Doc-prose assertions ────────────────────────────────────────────────
echo ""
echo "--- (3) flow-doc waivability prose ---"

for f in "$WEEKLY_RECAP" "$WEEKLY_PREDICTION"; do
  name="$(basename "$f")"
  # Exclude the size-justification header comment (line 1, "<!-- ... -->") —
  # it legitimately still NAMES the old phrase to document its own removal.
  if grep -v '^<!--' "$f" | grep -q 'EXIT-only-on-real-fabrication'; then
    bad "(3a) $name: ambiguous 'EXIT-only-on-real-fabrication posture' phrase still present in the live step body"
  else
    ok "(3a) $name: ambiguous gate-wide waiver phrase removed from the step body"
  fi
done

if grep -q 'NON-WAIVABLE' "$MAIN_FLOW" && grep -q 'Check-D2 fix protocol' "$MAIN_FLOW"; then
  ok "(3b) main.md: Check-D2 marked NON-WAIVABLE and fix protocol (recompute baseline as prior-period close) present"
else
  bad "(3b) main.md: expected NON-WAIVABLE marker + Check-D2 fix protocol — not both found"
fi

if grep -q 'Check-C negation-blind pattern (described above) → write per-field honest gap + PROCEED' "$MAIN_FLOW"; then
  ok "(3c) main.md: Check-C's own honest-gap-and-PROCEED waive path is still intact (fix narrowed waivability, did not delete it)"
else
  bad "(3c) main.md: Check-C's honest-gap-and-PROCEED waive language not found — may have been collaterally removed"
fi

for f in "$WEEKLY_RECAP" "$WEEKLY_PREDICTION"; do
  name="$(basename "$f")"
  if grep -q 'FIX-FB-GATE-CHECKD2-NONWAIVABLE-NUMERIC-BLOCK' "$f"; then
    ok "(3d) $name: references FIX-FB-GATE-CHECKD2-NONWAIVABLE-NUMERIC-BLOCK"
  else
    bad "(3d) $name: does not reference FIX-FB-GATE-CHECKD2-NONWAIVABLE-NUMERIC-BLOCK"
  fi
done

# ── Result ────────────────────────────────────────────────────────────────────
echo ""
echo "=============================================================================="
echo " RESULT: $PASS_COUNT passed / $FAIL_COUNT failed"
echo "=============================================================================="

if [[ $FAIL_COUNT -eq 0 ]]; then
  exit 0
else
  exit 1
fi
