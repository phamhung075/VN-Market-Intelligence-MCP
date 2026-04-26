# Phase 2: Top-5 Stock Testing — Value Investor System

**Objective:** Verify end-to-end value investor analysis workflow with 5 test stocks (VNM, FPT, KDC, VJC, TCB) before full 30-stock rollout.

**Duration:** One complete trading day (Mon-Fri, 01:00–16:00 UTC)

**Test Stocks:** VNM | FPT | VCB | KDC | VJC

---

## Pre-Test Verification

### 1. Ledger Files Exist

```bash
ls -la docs/analysis-briefs/ | grep -E "^-.*\.md$" | wc -l
# Expected: 30 files

# Verify top-5:
for ticker in VNM FPT VCB KDC VJC; do
  [ -f "docs/analysis-briefs/$ticker.md" ] && echo "✓ $ticker.md" || echo "✗ MISSING $ticker.md"
done
```

### 2. Ledger Template Structure (Check VNM as reference)

Each file should contain these 5 sections:
- `## [Report Analyzer] Fundamentals & Valuation`
- `## [News Scout] Headlines & Sentiment`
- `## [Market Watcher] Price, Volume, Technicals`
- `## [Insider Tracker] Management Activity`
- `## [Unified Agent] Quarterly Syntheses & Action Plans`

### 3. Configuration

Check `docs/data/project-stats.json`:
```bash
jq '.analysisMode' docs/data/project-stats.json
# Expected: "value_investor"
```

Check Alert Commander has analysis_mode check:
```bash
grep -n "analysis_mode" cowork-workspace-team-claude-desktop/05-alert-commander.md
# Expected: Line ~31-40 with "analysis_mode" logic
```

---

## Test Scenario: Simulated Trading Day

**Date:** 2026-05-20 (Tuesday)
**Market:** HOSE/HNX open

### Batch 1 (01:00 UTC = 08:00 VN)

**Before Open Data**

| Stock | Price (VND) | vs YoY | Sentiment | Insider |
|-------|-----------|--------|-----------|---------|
| VNM   | 174,500   | +7.2%  | +0.3      | no      |
| FPT   | 92,300    | +12.5% | +0.5      | no      |
| VCB   | 26,400    | +5.8%  | +0.1      | no      |
| KDC   | 45,200    | +18.3% | +0.6      | no      |
| VJC   | 28,100    | +15.4% | +0.4      | no      |

**Expected Ledger Entries:**
```
[Market Watcher] section:
2026-05-20 | Pre-open 174.5k | RSI pending | YoY 162.5k = +7.2%

[News Scout] section:
2026-05-20 | Morning news: stable sentiment +0.3 | YoY comparison
```

---

### Batch 2 (05:00 UTC = 12:00 VN)

**Midday Data**

| Stock | Price (VND) | Volume | Sentiment Update |
|-------|-----------|--------|------------------|
| VNM   | 175,200   | 2.1M   | +0.3              |
| FPT   | 92,900    | 1.8M   | +0.5              |
| VCB   | 26,650    | 1.5M   | +0.2              |
| KDC   | 45,800    | 2.3M   | +0.6              |
| VJC   | 28,350    | 1.2M   | +0.5              |

**Expected Ledger Entries:**
```
[Market Watcher] section:
2026-05-20 | Mid-day 175.2k | Volume +18% avg | RSI 55 neutral

[News Scout] section:
2026-05-20 | Sector momentum positive | Volume confirms | Sentiment +0.3 steady
```

---

### Batch 3 (08:00 UTC = 15:00 VN)

**Pre-Close Data**

| Stock | Price (VND) | Volume | RSI  | Insider |
|-------|-----------|--------|------|---------|
| VNM   | 176,500   | 3.2M   | 72   | no      |
| FPT   | 93,600    | 2.5M   | 68   | no      |
| VCB   | 27,100    | 2.1M   | 61   | no      |
| KDC   | 46,500    | 3.1M   | 75   | no      |
| VJC   | 28,750    | 1.8M   | 70   | DAD buy 50k shares! ← Special event |

**Expected Ledger Entries:**
```
[Market Watcher] section:
2026-05-20 | Pre-close 176.5k | RSI 72 strong | Volume 3.2M high

[Insider Tracker] section (VJC only):
2026-05-20 | DAD disclosed: bought 50k shares at 28.5k | Signal: confidence
```

---

### Batch 4 (16:00 UTC = 23:00 VN)

**EOD Data + Analysis**

| Stock | Close (VND) | Daily Δ | YoY Δ | Action |
|-------|-----------|---------|-------|--------|
| VNM   | 176,800   | +1.3%   | +8.6% | Hold   |
| FPT   | 93,800    | +1.6%   | +13.2%| Hold   |
| VCB   | 27,200    | +2.3%   | +6.8% | Hold   |
| KDC   | 46,800    | +3.5%   | +19.8%| Monitor|
| VJC   | 28,900    | +2.8%   | +16.5%| Add    |

**Expected Ledger Entries:**
```
[Market Watcher] section:
2026-05-20 16:00 | Close: 176,800 VND | RSI: 72 | Vol: 3.8M (+22% avg) | YoY: +8.6%

[MARKET Channel Message]
VNM — EOD (2026-05-20)
Price: 176,800 VND (+1.3%, YoY +8.6%) | Vol: 3.8M | RSI: 72
Sentiment: +0.3 | Insider: no activity
→ Action: Hold — Strength intact, fair value near
📖 docs/analysis-briefs/VNM.md

[For VJC with insider buy]
VJC — EOD (2026-05-20)
Price: 28,900 VND (+2.8%, YoY +16.5%) | Vol: 1.8M | RSI: 70
Sentiment: +0.5 | Insider: DAD bought 50k shares (confidence signal!)
→ Action: ADD — Insider confidence + YoY strength
📖 docs/analysis-briefs/VJC.md
```

---

## Verification Checklist

### ✓ Ledger Entries

After day closes, check all 5 ledger files:

```bash
# Count entries per stock
for ticker in VNM FPT VCB KDC VJC; do
  echo "$ticker:"
  grep -c "2026-05-20" docs/analysis-briefs/$ticker.md
  # Expected: 4 entries (Batch 1, 2, 3, 4) or more if multiple sections
done
```

Check specific entries:
```bash
# VNM should have entry in [Market Watcher]
grep "2026-05-20.*176,800" docs/analysis-briefs/VNM.md

# VJC should have entry in [Insider Tracker] (insider buy)
grep "2026-05-20.*DAD.*bought" docs/analysis-briefs/VJC.md
```

### ✓ QoQ + YoY Format

Verify format matches template:
```bash
# Should show comparison: "Price: 176.8k (vs Q1 174k +1.6% QoQ, vs Q2 2025 162k +8.6% YoY)"
# Or daily: "YoY: +8.6% (May 20 2025 price was 162.5k)"
grep "vs Q" docs/analysis-briefs/VNM.md
grep "YoY" docs/analysis-briefs/VNM.md
```

### ✓ MARKET Channel Messages

Check Telegram MARKET channel for 5 EOD messages (one per stock):
```
Expected at 16:00 UTC (23:00 VN):
- VNM — EOD (2026-05-20) [message 1]
- FPT — EOD (2026-05-20) [message 2]
- TCB — EOD (2026-05-20) [message 3]
- KDC — EOD (2026-05-20) [message 4]
- VJC — EOD (2026-05-20) [message 5, with insider signal]
```

### ✓ Alert Commander Behavior

Verify Alert Commander respects analysis_mode:
```bash
# Check logs (if available):
grep "analysis_mode" docs/agent-memory/sessions/*-alert-commander.md 2>/dev/null
# Expected: "analysis_mode: value_investor" → skip trader alerts
```

### ✓ Special Event Detection

If insider buy detected (VJC scenario):
- Alert Commander should flag as special event
- Send to WORK channel (dev team, not user) if value_investor mode
- Mention in MARKET EOD message as confidence signal

### ✓ No Regressions

After test day, run full test suite:
```bash
cd apps/mcp-server
bun test 2>&1 | tail -20
# Expected: 6520 pass / 213 fail (same as baseline)
```

---

## Success Criteria

| Criterion | Status | Notes |
|-----------|--------|-------|
| All 5 ledger files have entries for 2026-05-20 | TBD | 4+ entries per stock |
| QoQ + YoY format present in each entry | TBD | Mandatory comparison format |
| 5 EOD messages sent to MARKET channel at 16:00 UTC | TBD | One per stock, correct format |
| VJC insider buy detected and logged | TBD | If event occurs in test scenario |
| Alert Commander respects analysis_mode | TBD | No trader alerts to MARKET |
| No test regressions | TBD | 6520 baseline maintained |
| Conviction scoring works (if special event) | TBD | Formula: Base+Fundamentals+Sentiment+Technical+Insider+Macro+Kinh_Dich |

---

## Next Steps (Phase 3)

Once Phase 2 succeeds:
1. Enable full 30-stock rollout
2. Monitor for 1 week (5 trading days)
3. Archive first quarter entries (Q2 2026-05-01 to 2026-05-31)
4. Run quarterly synthesis (30 Unified Agent synth entries at Q-end)

---

## Known Issues (Non-Blocking from QA)

1. **camelCase vs snake_case:** project-stats.json uses `analysisMode` but doc refers to `analysis_mode`
   - Fix: Use `analysisMode` when reading JSON, reference as `analysis_mode` in prose
2. **Agent name divergence:** [Insider Tracker] section but agent file is `02-financial-analyst.md` (not yet renamed)
   - No functional impact; cosmetic alignment todo for next sprint
3. **Report Analyzer step numbering:** Duplicate steps (5, 5b, 5c) needs refactoring
   - No functional impact; cosmetic todo for next sprint

---

## Rollback Plan

If Phase 2 fails critical tests:
1. `git revert 3c1b7bea` (undo merge)
2. Investigate blocker in feature branch
3. Re-fix, re-test, re-merge
