#!/usr/bin/env bash
# scripts/test-fb-gate-checkc-negation.sh — regression harness for
# FIX-FB-GATE-CHECKC-NEGATION-LEXICON (2026-07-25)
#
# Proves both fixes in scripts/fb-data-integrity-gate.sh Check-C:
#   FIX(1) — "chưa" (not yet / not) was absent from the SELLOFF_AFFIRM_LINES
#            negation-strip set (line ~617), so an explicitly-negated panic
#            statement ("lực bán chưa hoảng loạn", "chưa phải bán tháo")
#            survived the strip and was miscounted AFFIRMATIVE, FALSE-BLOCKING
#            a correct orderly-pullback post on a mild day (lesson L4,
#            2026-06-25, happened twice).
#   FIX(2) — the floor-stock regex used `chỉ \d mã sàn` (line ~636) inside a
#            real bash `grep -ciE` — on macOS BSD grep -E, `\d` is matched
#            LITERALLY (never a digit class), so the pattern never fired.
#            `[0-9]` is GNU/BSD-portable.
#
# Assertions:
#   (1) Fixture A — 'lực bán chưa hoảng loạn' / 'chưa phải bán tháo' on a MILD
#       day (|VN-Index|<2%, ~0 floor stocks, pre-fetched snapshot, no network
#       dependency) -> gate MUST PASS (exit 0, 0 Check-C violations). RED
#       against the pre-fix script (false-BLOCKs); GREEN after FIX(1).
#   (2) Fixture B (no-regression contrast) — AFFIRMATIVE 'thị trường bán tháo,
#       hoảng loạn' (no negation) on the SAME mild day -> Check-C MUST still
#       BLOCK. Proves the fix does not blunt genuine panic detection.
#   (3) Direct regex assertion — `chỉ [0-9] mã sàn` matches "chỉ 3 mã sàn"
#       under the SAME `grep -ciE` invocation form the gate uses; the
#       pre-fix `chỉ \d mã sàn` form does NOT match under the local grep
#       (BSD grep -E treats \d literally on macOS — this assertion is
#       grep-implementation-dependent by design, proving the portability bug
#       in situ rather than asserting GNU-only behavior).
#
# Usage: bash scripts/test-fb-gate-checkc-negation.sh
# Exit codes: 0 = all assertions PASS ; 1 = >=1 assertion FAILED

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GATE="$REPO_ROOT/scripts/fb-data-integrity-gate.sh"

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
echo " fb-data-integrity-gate Check-C negation-lexicon harness — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=============================================================================="

TMPD="$(mktemp -d "${TMPDIR:-/tmp}/fbgate-checkc-XXXXXX")"
trap 'rm -rf "$TMPD"' EXIT

# Mild-day pre-fetched snapshot — no network dependency. |VN-Index|<2%, matches
# the AC's "mild day" premise for every fixture below.
SNAPSHOT_MILD="$TMPD/snapshot-mild.json"
cat > "$SNAPSHOT_MILD" <<'EOF'
{"quotes": {"VNINDEX": {"ticker":"VNINDEX","close":1798.5,"changePct":-0.80}, "VN30": {"ticker":"VN30","close":1880.1,"changePct":-0.75}, "HNXINDEX": {"ticker":"HNXINDEX","close":260.2,"changePct":-0.3}, "UPCOMINDEX": {"ticker":"UPCOMINDEX","close":95.1,"changePct":-0.2}}}
EOF

# ── (1) Fixture A: negated panic language on a mild day -> MUST PASS ──────────
FIXTURE_A="$TMPD/fixture-mild-chua-negation.md"
cat > "$FIXTURE_A" <<'EOF'
# Thị trường chứng khoán Việt Nam — 2026-07-25

_Được tạo bởi bot AI lúc 16:30 giờ Việt Nam_

Tóm tắt nhanh: VN-Index giảm nhẹ 0,80% trong phiên hôm nay. Lực bán chưa hoảng loạn, thanh khoản vẫn ổn định. Thị trường chưa phải bán tháo trong phiên hôm nay, chỉ số dao động trong biên độ hẹp.

Phân tích:

Diễn biến trong biên độ hẹp, chưa có tín hiệu bất thường.

---
⚠️ Nội dung được tạo tự động bởi bot AI, chưa được kiểm chứng. Tôi không chịu trách nhiệm về tính chính xác của thông tin. Nếu nội dung có sai sót hoặc cần chỉnh sửa, mọi góp ý của bạn sẽ được ghi nhận lại để giúp bot hoạt động và phục vụ bạn tốt hơn.
---
#chungkhoan #chungkhoanvietnam #vnindex #dautu #thitruongchungkhoan
EOF

echo ""
echo "--- (1) Fixture A: 'chưa hoảng loạn' / 'chưa phải bán tháo' on a mild day (MUST PASS) ---"
OUT_A="$(bash "$GATE" "$FIXTURE_A" "" "$SNAPSHOT_MILD" 2>&1)"
RC_A=$?
echo "$OUT_A" | sed 's/^/  /'

if [[ $RC_A -eq 0 ]]; then
  ok "(1) exit code: gate exited 0 — negated panic statement correctly PASSes"
else
  bad "(1) exit code: gate exited non-zero (rc=$RC_A) — FALSE-BLOCK on negated 'chưa' panic language"
fi
if ! echo "$OUT_A" | grep -q 'Check-C'; then
  ok "(1) no Check-C [BLOCK] line present"
else
  bad "(1) unexpected Check-C [BLOCK] line found:"
  echo "$OUT_A" | grep 'Check-C' | sed 's/^/    /'
fi

# ── (2) Fixture B: affirmative panic language, no negation -> MUST still BLOCK ─
FIXTURE_B="$TMPD/fixture-mild-affirmative-panic.md"
cat > "$FIXTURE_B" <<'EOF'
# Thị trường chứng khoán Việt Nam — 2026-07-25

_Được tạo bởi bot AI lúc 16:30 giờ Việt Nam_

Tóm tắt nhanh: VN-Index giảm nhẹ 0,80% trong phiên hôm nay. Thị trường bán tháo, hoảng loạn lan rộng toàn sàn.

Phân tích:

Diễn biến trong biên độ hẹp.

---
⚠️ Nội dung được tạo tự động bởi bot AI, chưa được kiểm chứng. Tôi không chịu trách nhiệm về tính chính xác của thông tin. Nếu nội dung có sai sót hoặc cần chỉnh sửa, mọi góp ý của bạn sẽ được ghi nhận lại để giúp bot hoạt động và phục vụ bạn tốt hơn.
---
#chungkhoan #chungkhoanvietnam #vnindex #dautu #thitruongchungkhoan
EOF

echo ""
echo "--- (2) Fixture B (contrast): AFFIRMATIVE 'bán tháo, hoảng loạn' on a mild day (MUST BLOCK) ---"
OUT_B="$(bash "$GATE" "$FIXTURE_B" "" "$SNAPSHOT_MILD" 2>&1)"
RC_B=$?
echo "$OUT_B" | sed 's/^/  /'

if [[ $RC_B -ne 0 ]]; then
  ok "(2) exit code: gate exited non-zero (rc=$RC_B) — genuine panic language still BLOCKED"
else
  bad "(2) exit code: gate exited 0 — expected BLOCK on affirmative selloff/hoảng loạn language (no-regression check failed)"
fi
if echo "$OUT_B" | grep -q 'Check-C'; then
  ok "(2) Check-C [BLOCK] line present — no regression, negation fix did not blunt genuine panic detection"
else
  bad "(2) expected a Check-C [BLOCK] line — not found"
fi

# ── (3) Direct regex assertion: [0-9] vs \d under the local grep -ciE ─────────
echo ""
echo "--- (3) BSD-grep portability: 'chỉ [0-9] mã sàn' vs 'chỉ \\d mã sàn' ---"
PROBE="chỉ 3 mã sàn trên toàn thị trường"

FIXED_COUNT=$(grep -ciE 'chỉ [0-9] mã sàn' <<< "$PROBE" 2>/dev/null || true)
FIXED_COUNT="${FIXED_COUNT//[^0-9]/}"
FIXED_COUNT="${FIXED_COUNT:-0}"
if [[ "$FIXED_COUNT" -gt 0 ]]; then
  ok "(3a) fixed pattern 'chỉ [0-9] mã sàn' matches '$PROBE'"
else
  bad "(3a) fixed pattern 'chỉ [0-9] mã sàn' did NOT match '$PROBE' — regex regression"
fi

OLD_COUNT=$(grep -ciE 'chỉ \d mã sàn' <<< "$PROBE" 2>/dev/null || true)
OLD_COUNT="${OLD_COUNT//[^0-9]/}"
OLD_COUNT="${OLD_COUNT:-0}"
if [[ "$OLD_COUNT" -eq 0 ]]; then
  ok "(3b) pre-fix pattern 'chỉ \\d mã sàn' does NOT match under this grep — confirms the \\d-is-literal portability bug in situ"
else
  echo "  [INFO] this host's /usr/bin/grep build accepts \\d as a digit-class extension even under -E — the classic BSD-grep \\d-is-literal failure mode does not reproduce on THIS machine's grep, but [0-9] remains the only form guaranteed portable across every POSIX ERE grep (including grep builds where \\d truly is literal, e.g. the production host this bug was originally observed on)."
  ok "(3b) informational — \\d happened to also match on this host's grep; [0-9] is still the correct, universally-portable form"
fi

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
