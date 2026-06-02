#!/usr/bin/env bash
# fb-jargon-gate.sh — deterministic pre-publish gate for fb-market-poster
# Usage: bash scripts/fb-jargon-gate.sh <post-body-file> [YYYY-MM-DD]
# Exit 0 = clean; Exit 1 = violations found; Exit 2 = usage error
#
# Forbidden token SSOT lives EXCLUSIVELY here.
# Do NOT copy or mirror this list in any flow or skill file.

set -euo pipefail

FILE="${1:-}"
POST_DATE="${2:-}"

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "ERROR: file argument required and must exist" >&2
  exit 2
fi

VIOLATIONS=0

run_grep() {
  local label="$1"
  local pattern="$2"
  local hits
  hits=$(grep -nEi "$pattern" "$FILE" 2>/dev/null || true)
  if [[ -n "$hits" ]]; then
    echo "[FAIL] $label"
    echo "$hits"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
}

# ── Group A — English finance jargon (word-boundary anchored) ─────────────────
run_grep "English-jargon:FII"         '\bFII\b'
run_grep "English-jargon:NIM"         '\bNIM\b'
run_grep "English-jargon:carry"       '\bcarry\b'
run_grep "English-jargon:bull"        '\bbull\b'
run_grep "English-jargon:bear"        '\bbear\b'
run_grep "English-jargon:bullish"     '\bbullish\b'
run_grep "English-jargon:bearish"     '\bbearish\b'
run_grep "English-jargon:risk-off"    '\brisk-off\b'
run_grep "English-jargon:risk-on"     '\brisk-on\b'
run_grep "English-jargon:YoY"         '\bYoY\b'
run_grep "English-jargon:QoQ"         '\bQoQ\b'
run_grep "English-jargon:bps"         '\bbps\b'
run_grep "English-jargon:momentum"    '\bmomentum\b'
run_grep "English-jargon:sentiment"   '\bsentiment\b'
run_grep "English-jargon:volatility"  '\bvolatility\b'
run_grep "English-jargon:breadth"     '\bbreadth\b'
run_grep "English-jargon:neutral"     '\bneutral\b'
run_grep "English-jargon:catalyst"    '\bcatalyst\b'
run_grep "English-jargon:upside"      '\bupside\b'
run_grep "English-jargon:downside"    '\bdownside\b'
run_grep "English-jargon:sigma"       '\bsigma\b'
run_grep "English-jargon:consolidat"  '\bconsolidat'
run_grep "English-jargon:outflow"     '\boutflow\b'
run_grep "English-jargon:inflow"      '\binflow\b'
run_grep "English-jargon:rally"       '\brally\b'
run_grep "English-jargon:sell-off"    '\bsell-off\b'
run_grep "English-jargon:breakout"    '\bbreakout\b'
run_grep "English-jargon:rebound"     '\brebound\b'
run_grep "English-jargon:margin"      '\bmargin\b'
run_grep "English-jargon:trend"       '\btrend\b'
run_grep "English-jargon:spread"      '\bspread\b'
run_grep "English-jargon:pivot"       '\bpivot\b'
run_grep "English-jargon:stasis"      '\bstasis\b'
run_grep "English-jargon:durable"     '\bdurable\b'
run_grep "English-jargon:broad-based" '\bbroad-based\b'
run_grep "English-jargon:convergence" '\bconvergence\b'

# ── Group B — Unicode / notation violations ───────────────────────────────────
run_grep "notation:sigma-char"   'σ'
run_grep "notation:bp"           '\bbp\b'
run_grep "notation:plusminus"    '±'
run_grep "notation:Layer-N"      'Layer [0-9]'
run_grep "notation:signal-N"     'signal [0-9]'
run_grep "notation:z-score"      'z-score'
run_grep "notation:z-score-sp"   'z score'
run_grep "notation:TNB"          '\bTNB\b'

# ── Group C — Kinh Dịch / hexagram (anchored — false-positive traps see brief §5) ──
# MUST use "vị thế <name>" anchor — never bare hexagram names (false-positives on common VN words)
run_grep "hexagram:Kinh-Dich"    'Kinh Dịch'
run_grep "hexagram:kinh-dich-lc" 'kinh dịch'
run_grep "hexagram:hexagram"     'hexagram'
run_grep "hexagram:que"          '\bquẻ\b'
run_grep "hexagram:vi-the-name"  'vị thế (Càn|Khôn|Chấn|Tốn|Khảm|Ly|Cấn|Đoài|Sư|Kiển|Di|Mông|Nhu|Tụng|Tỷ|Thái|Bĩ|Khiêm|Dự|Tùy|Cổ|Lâm|Quan|Bí|Bác|Phục|Hàm|Hằng|Độn|Tấn|Giải|Tổn|Ích|Tụy|Thăng|Khốn|Cách|Đỉnh|Tiệm|Phong|Lữ|Hoán|Tiết|Ký Tế|Vị Tế)'

# ── Group D — Vietnamese typos ────────────────────────────────────────────────
run_grep "typo:thanh-khoay"    'thanh khoảy'
run_grep "hashtag-typo:dankhi" '#dankhi'

# ── Group E — Calendar weekday / date consistency ─────────────────────────────
# Only runs when POST_DATE ($2) is provided as YYYY-MM-DD.
# If no weekday appears in the post body, this check is a no-op (weekday mention is optional).
if [[ -n "$POST_DATE" ]]; then
  VN_WEEKDAYS=("Chủ nhật" "Thứ Hai" "Thứ Ba" "Thứ Tư" "Thứ Năm" "Thứ Sáu" "Thứ Bảy")
  # DOW: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  # macOS date -d is not available; use python3 (available on macOS + Linux)
  DOW=$(python3 -c "
import datetime, sys
d = datetime.datetime.strptime('$POST_DATE', '%Y-%m-%d')
# weekday(): 0=Mon..6=Sun; convert to 0=Sun..6=Sat
wd = d.weekday()
print((wd + 1) % 7)
")
  EXPECTED_VN="${VN_WEEKDAYS[$DOW]}"
  for WD in "Chủ nhật" "Thứ Hai" "Thứ Ba" "Thứ Tư" "Thứ Năm" "Thứ Sáu" "Thứ Bảy"; do
    if [[ "$WD" != "$EXPECTED_VN" ]]; then
      hits=$(grep -ni "$WD" "$FILE" 2>/dev/null || true)
      if [[ -n "$hits" ]]; then
        echo "[FAIL] calendar:wrong-weekday — post date $POST_DATE = $EXPECTED_VN, found '$WD'"
        echo "$hits"
        VIOLATIONS=$((VIOLATIONS + 1))
      fi
    fi
  done
fi

# ── Result ────────────────────────────────────────────────────────────────────
if [[ $VIOLATIONS -eq 0 ]]; then
  echo "[PASS] fb-jargon-gate: 0 violations"
  exit 0
else
  echo "[BLOCK] fb-jargon-gate: $VIOLATIONS violation group(s) — fix ALL before STEP 5 write"
  exit 1
fi
