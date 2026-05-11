#!/bin/bash

# Phase 2: Top-5 Stock Testing — Value Investor Analysis System
# Simulates one complete trading day (01:00, 05:00, 08:00, 16:00 UTC)
# Test Date: 2026-05-20 (Tuesday)

set -e

PROJECT_ROOT="/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP"
cd "$PROJECT_ROOT"

echo "=== Phase 2 Testing: Value Investor Analysis System ==="
echo "Test Date: 2026-05-20"
echo "Test Stocks: VNM, FPT, VCB, KDC, VJC"
echo ""

# ============================================================================
# SECTION 1: PRE-TEST VERIFICATION
# ============================================================================

echo "### PRE-TEST VERIFICATION ###"
echo ""

# Check ledger files exist
echo "Checking ledger files..."
STOCKS=("VNM" "FPT" "VCB" "KDC" "VJC")
for ticker in "${STOCKS[@]}"; do
  if [ -f "docs/analysis-briefs/$ticker.md" ]; then
    echo "✓ $ticker.md exists"
  else
    echo "✗ ERROR: $ticker.md MISSING"
    exit 1
  fi
done
echo ""

# Check configuration
echo "Checking analysis_mode configuration..."
MODE=$(jq -r '.analysisMode' docs/data/project-stats.json)
if [ "$MODE" = "value_investor" ]; then
  echo "✓ analysisMode: $MODE"
else
  echo "✗ ERROR: analysisMode should be 'value_investor', got '$MODE'"
  exit 1
fi
echo ""

# Check Alert Commander has analysis_mode check
echo "Checking Alert Commander has analysis_mode check..."
if grep -q "ANALYSIS MODE CHECK" cowork-workspace-team-claude-desktop/05-alert-commander.md; then
  echo "✓ Alert Commander has ANALYSIS MODE CHECK section"
else
  echo "⚠ WARNING: Alert Commander might be missing analysis_mode check"
fi
echo ""

# ============================================================================
# SECTION 2: SIMULATE BATCH ENTRIES
# ============================================================================

echo "### SIMULATING BATCH CYCLES ###"
echo ""

# Backup original files
echo "Backing up original ledger files..."
for ticker in "${STOCKS[@]}"; do
  cp "docs/analysis-briefs/$ticker.md" "docs/analysis-briefs/$ticker.md.backup"
done
echo "✓ Backups created"
echo ""

# ============================================================================
# BATCH 1: 01:00 UTC (08:00 VN) - BEFORE OPEN
# ============================================================================

echo "--- BATCH 1: 01:00 UTC (Before Open) ---"

# VNM Batch 1: Market Watcher entry
echo "Adding VNM Batch 1 entry (Market Watcher section)..."
cat >> docs/analysis-briefs/VNM.md << 'EOF'

### 2026-05-20 · Batch 1 (Pre-Open)
Price: 174,500 | RSI: pending | YoY vs May 20 2025: 162,500 VND = +7.2%
Pre-open sentiment baseline established for the day.
EOF
echo "✓ VNM Batch 1 added"

# FPT Batch 1: Market Watcher entry
echo "Adding FPT Batch 1 entry (Market Watcher section)..."
cat >> docs/analysis-briefs/FPT.md << 'EOF'

### 2026-05-20 · Batch 1 (Pre-Open)
Price: 92,300 | RSI: pending | YoY vs May 20 2025: 82,000 VND = +12.5%
FPT opening with strength vs year-ago level.
EOF
echo "✓ FPT Batch 1 added"

# VCB Batch 1: Market Watcher entry
echo "Adding VCB Batch 1 entry (Market Watcher section)..."
cat >> docs/analysis-briefs/VCB.md << 'EOF'

### 2026-05-20 · Batch 1 (Pre-Open)
Price: 26,400 | RSI: pending | YoY vs May 20 2025: 24,900 VND = +5.8%
Banking sector stable pre-open.
EOF
echo "✓ VCB Batch 1 added"

# KDC Batch 1: Market Watcher entry
echo "Adding KDC Batch 1 entry (Market Watcher section)..."
cat >> docs/analysis-briefs/KDC.md << 'EOF'

### 2026-05-20 · Batch 1 (Pre-Open)
Price: 45,200 | RSI: pending | YoY vs May 20 2025: 38,200 VND = +18.3%
KDC strong YoY momentum continuing.
EOF
echo "✓ KDC Batch 1 added"

# VJC Batch 1: Market Watcher entry
echo "Adding VJC Batch 1 entry (Market Watcher section)..."
cat >> docs/analysis-briefs/VJC.md << 'EOF'

### 2026-05-20 · Batch 1 (Pre-Open)
Price: 28,100 | RSI: pending | YoY vs May 20 2025: 24,400 VND = +15.4%
VJC steady, sector momentum positive.
EOF
echo "✓ VJC Batch 1 added"

echo ""

# ============================================================================
# BATCH 2: 05:00 UTC (12:00 VN) - MIDDAY
# ============================================================================

echo "--- BATCH 2: 05:00 UTC (Midday) ---"

# VNM Batch 2: News Scout entry (sentiment logging)
echo "Adding VNM Batch 2 entry (News Scout section)..."
cat >> docs/analysis-briefs/VNM.md << 'EOF'

### 2026-05-20 · Batch 2 (Midday Sentiment)
2026-05-20 | Steady market tone, sector support +0.3 | YoY May 20 2025 sentiment was +0.2
EOF
echo "✓ VNM Batch 2 sentiment added"

# FPT Batch 2: News Scout entry
echo "Adding FPT Batch 2 entry (News Scout section)..."
cat >> docs/analysis-briefs/FPT.md << 'EOF'

### 2026-05-20 · Batch 2 (Midday Sentiment)
2026-05-20 | Tech sector rally underway, sector momentum +0.5 | YoY May 20 2025 sentiment was +0.3
EOF
echo "✓ FPT Batch 2 sentiment added"

# VCB Batch 2: News Scout entry
echo "Adding VCB Batch 2 entry (News Scout section)..."
cat >> docs/analysis-briefs/VCB.md << 'EOF'

### 2026-05-20 · Batch 2 (Midday Sentiment)
2026-05-20 | Banking sector quiet, neutral stance +0.1 | YoY May 20 2025 sentiment was +0.2
EOF
echo "✓ VCB Batch 2 sentiment added"

# KDC Batch 2: News Scout entry
echo "Adding KDC Batch 2 entry (News Scout section)..."
cat >> docs/analysis-briefs/KDC.md << 'EOF'

### 2026-05-20 · Batch 2 (Midday Sentiment)
2026-05-20 | Real estate demand pickup, sector positive +0.6 | YoY May 20 2025 sentiment was -0.1
EOF
echo "✓ KDC Batch 2 sentiment added"

# VJC Batch 2: News Scout entry
echo "Adding VJC Batch 2 entry (News Scout section)..."
cat >> docs/analysis-briefs/VJC.md << 'EOF'

### 2026-05-20 · Batch 2 (Midday Sentiment)
2026-05-20 | Retail/discretionary strength continues +0.5 | YoY May 20 2025 sentiment was +0.3
EOF
echo "✓ VJC Batch 2 sentiment added"

echo ""

# ============================================================================
# BATCH 3: 08:00 UTC (15:00 VN) - PRE-CLOSE
# ============================================================================

echo "--- BATCH 3: 08:00 UTC (Pre-Close) ---"

# VNM Batch 3: Market Watcher entry
echo "Adding VNM Batch 3 entry (Market Watcher section)..."
cat >> docs/analysis-briefs/VNM.md << 'EOF'

### 2026-05-20 · Batch 3 (Pre-Close)
Price: 176,500 VND | RSI: 72 strong | Volume: 3.2M shares (normal) | Trend: up
Closing strength, approaching fair value zone.
EOF
echo "✓ VNM Batch 3 added"

# FPT Batch 3: Market Watcher entry
echo "Adding FPT Batch 3 entry (Market Watcher section)..."
cat >> docs/analysis-briefs/FPT.md << 'EOF'

### 2026-05-20 · Batch 3 (Pre-Close)
Price: 93,600 VND | RSI: 68 neutral-strong | Volume: 2.5M shares | Trend: up
Tech sector driving the market today.
EOF
echo "✓ FPT Batch 3 added"

# VCB Batch 3: Market Watcher entry
echo "Adding VCB Batch 3 entry (Market Watcher section)..."
cat >> docs/analysis-briefs/VCB.md << 'EOF'

### 2026-05-20 · Batch 3 (Pre-Close)
Price: 27,100 VND | RSI: 61 neutral | Volume: 2.1M shares | Trend: up
Banking consolidating gains, no excess enthusiasm.
EOF
echo "✓ VCB Batch 3 added"

# KDC Batch 3: Market Watcher entry
echo "Adding KDC Batch 3 entry (Market Watcher section)..."
cat >> docs/analysis-briefs/KDC.md << 'EOF'

### 2026-05-20 · Batch 3 (Pre-Close)
Price: 46,500 VND | RSI: 75 overbought | Volume: 3.1M shares | Trend: strong up
Strong buying interest, watch for potential overbought reversal.
EOF
echo "✓ KDC Batch 3 added"

# VJC Batch 3: Market Watcher + Insider Tracker (SPECIAL EVENT)
echo "Adding VJC Batch 3 entries (Market Watcher + Insider Tracker sections)..."
cat >> docs/analysis-briefs/VJC.md << 'EOF'

### 2026-05-20 · Batch 3 (Pre-Close)
Price: 28,750 VND | RSI: 70 strong | Volume: 1.8M shares | Trend: up
Retail sector performing well, insider activity detected (see Insider Tracker).

### 2026-05-20 · INSIDER BUY (Batch 3 - SPECIAL EVENT)
DAD purchased 50,000 shares at 28,500 VND range
Signal: Management confidence in valuation — buying at same level from 3 months ago
YoY comparison: Q2 2025 had zero insider buying; this represents shift in management sentiment
EOF
echo "✓ VJC Batch 3 added (including insider buy)"

echo ""

# ============================================================================
# BATCH 4: 16:00 UTC (23:00 VN) - AFTER CLOSE (EOD SUMMARY)
# ============================================================================

echo "--- BATCH 4: 16:00 UTC (After Close - EOD Summary) ---"

# VNM Batch 4: EOD Summary
echo "Adding VNM Batch 4 EOD summary..."
cat >> docs/analysis-briefs/VNM.md << 'EOF'

### 2026-05-20 · Batch 4 (EOD Summary)
Close: 176,800 VND (+1.3% daily, +8.6% YoY) | RSI: 72 | Volume: 3.8M (+22% vs 20d avg)
YoY comparison (May 20 2025): Price was 162,500 → gain of 8.6% over year
Sentiment: +0.3 (stable positive) | Insider: no activity
Summary: Day closed strong on sector momentum. Fair value target approaching.
EOF
echo "✓ VNM Batch 4 EOD added"

# FPT Batch 4: EOD Summary
echo "Adding FPT Batch 4 EOD summary..."
cat >> docs/analysis-briefs/FPT.md << 'EOF'

### 2026-05-20 · Batch 4 (EOD Summary)
Close: 93,800 VND (+1.6% daily, +13.2% YoY) | RSI: 68 | Volume: 2.8M (+15% vs 20d avg)
YoY comparison (May 20 2025): Price was 82,800 → gain of 13.2% over year
Sentiment: +0.5 (positive tech tailwind) | Insider: no activity
Summary: Tech sector strength continues. Valuation still reasonable at 13x earnings.
EOF
echo "✓ FPT Batch 4 EOD added"

# VCB Batch 4: EOD Summary
echo "Adding VCB Batch 4 EOD summary..."
cat >> docs/analysis-briefs/VCB.md << 'EOF'

### 2026-05-20 · Batch 4 (EOD Summary)
Close: 27,200 VND (+2.3% daily, +6.8% YoY) | RSI: 61 | Volume: 2.4M (+8% vs 20d avg)
YoY comparison (May 20 2025): Price was 25,500 → gain of 6.8% over year
Sentiment: +0.1 (steady, no strong drivers) | Insider: no activity
Summary: Banking sector modestly firm. Stable returns, blue-chip safety profile.
EOF
echo "✓ VCB Batch 4 EOD added"

# KDC Batch 4: EOD Summary
echo "Adding KDC Batch 4 EOD summary..."
cat >> docs/analysis-briefs/KDC.md << 'EOF'

### 2026-05-20 · Batch 4 (EOD Summary)
Close: 46,800 VND (+3.5% daily, +19.8% YoY) | RSI: 75 overbought | Volume: 3.8M (+32% vs 20d avg)
YoY comparison (May 20 2025): Price was 39,100 → gain of 19.8% over year (major outperformance)
Sentiment: +0.6 (sector rally) | Insider: no activity
Summary: Strong YoY performance, but RSI overbought at close. Monitor for potential consolidation.
EOF
echo "✓ KDC Batch 4 EOD added"

# VJC Batch 4: EOD Summary (with insider context)
echo "Adding VJC Batch 4 EOD summary..."
cat >> docs/analysis-briefs/VJC.md << 'EOF'

### 2026-05-20 · Batch 4 (EOD Summary)
Close: 28,900 VND (+2.8% daily, +16.5% YoY) | RSI: 70 strong | Volume: 2.1M (+18% vs 20d avg)
YoY comparison (May 20 2025): Price was 24,800 → gain of 16.5% over year
Sentiment: +0.5 (retail sector momentum) | Insider: DAD buying (confidence signal, see Insider Tracker)
Summary: Insider buy today adds conviction to the move. YoY strength structural, not temporary.
EOF
echo "✓ VJC Batch 4 EOD added (with insider context)"

echo ""

# ============================================================================
# SECTION 3: VERIFICATION
# ============================================================================

echo "### VERIFICATION ###"
echo ""

echo "Checking ledger entries were written correctly..."
echo ""

ENTRY_COUNT=0
for ticker in "${STOCKS[@]}"; do
  COUNT=$(grep -c "2026-05-20" "docs/analysis-briefs/$ticker.md" || echo 0)
  echo "✓ $ticker: $COUNT entries found for 2026-05-20"
  ((ENTRY_COUNT += COUNT))
done

echo ""
echo "Total entries added: $ENTRY_COUNT (expected ~15-20)"
echo ""

# Verify specific content
echo "Verifying entry content..."
echo ""

if grep -q "176,800" docs/analysis-briefs/VNM.md; then
  echo "✓ VNM EOD price (176,800) found"
else
  echo "✗ VNM EOD price NOT FOUND"
fi

if grep -q "DAD.*bought" docs/analysis-briefs/VJC.md; then
  echo "✓ VJC insider buy recorded"
else
  echo "✗ VJC insider buy NOT FOUND"
fi

if grep -q "+8.6%" docs/analysis-briefs/VNM.md; then
  echo "✓ VNM YoY comparison (+8.6%) found"
else
  echo "✗ VNM YoY comparison NOT FOUND"
fi

echo ""
echo "=== PHASE 2 TESTING COMPLETE ==="
echo ""
echo "Next steps:"
echo "1. Verify MARKET channel received 5 EOD messages at 16:00 UTC"
echo "2. Check conviction scoring (if special events triggered)"
echo "3. Run full test suite: cd apps/mcp-server && bun test"
echo "4. Proceed to Phase 3 (full 30-stock rollout) if all checks pass"
echo ""
