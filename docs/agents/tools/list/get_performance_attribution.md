---
tool: get_performance_attribution
category: portfolio
agents: [cowork, market-analyst, qa]
---

# `get_performance_attribution`

**Category:** Portfolio | **Used by:** cowork, market-analyst, qa

Performance attribution: shows which signal types drove the best investment returns. For each signal type (price_drop, price_surge, news_mention, etc.), shows total alerts, hit count (correct direction), miss count (wrong direction), average 3-day return %, and win rate. Directional signals (price_drop/price_surge) are scored.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `days` | number | No | 90 | Lookback window in days (default: 90, min: 30, max: 365) |
| `signalType` | string | No | all | Filter by signal type: all, price_drop, price_surge, news_mention, insider, sector_rotation, macro_shift |

## Returns

Plain-text Vietnamese report showing:
- Performance by signal type (win rate %, avg return, # trades)
- Hit vs miss breakdown
- Best performing signals (highest Sharpe ratio)
- Worst performing signals (lowest Sharpe ratio)
- Portfolio impact attribution (how much each signal type contributed to returns)
- Recommendations (which signals to prioritize)

## Output Example

```
=== PHÂN TÍCH HIỆU SUẤT TÍN HIỆU ===
Thời gian: 90 ngày qua | Danh mục: Watchlist 30 cổ phiếu

TỔNG QUAN HIỆU SUẤT:

Tổng lợi nhuận 90 ngày: +12.5%
  → Từ giữ cổ phiếu + thực hiện trades

Tín hiệu theo dõi: 45 tín hiệu (active alerts)
  → Cấp độ chính xác: 68% hit, 32% miss
  → Win rate: 68%

PHÂN TÍCH CỤ THỀ THEO LOẠI TÍN HIỆU:

──────────────────────────────────────────────────────────────────
Loại tín hiệu      Alerts Hit Miss Win%  Avg.3d% Sharpe Impact
──────────────────────────────────────────────────────────────────
Price drop alert     12    9    3   75%   +2.1%   0.85  +3.2%
Price surge alert    10    6    4   60%   +1.8%   0.62  +1.8%
Insider buying        8    7    1   88%   +3.2%   1.05  +2.8%
News momentum         9    5    4   56%   +1.2%   0.45  +1.1%
Sector rotation       6    4    2   67%   +2.5%   0.74  +1.6%
Macro shift           4    3    1   75%   +1.9%   0.68  +0.9%
Conviction flip       2    2    0  100%   +4.1%   1.20  +0.8%
──────────────────────────────────────────────────────────────────
TOTAL               51    36   15   71%   +2.1%   0.77  +12.2%

Chi tiết:

1. INSIDER BUYING — Win rate 88%, Sharpe 1.05 ⭐⭐⭐
   ├─ Alerts: 8 tín hiệu
   ├─ Hit: 7 (đúng chiều)
   ├─ Miss: 1
   ├─ Avg return 3-day: +3.2%
   ├─ Portfolio impact: +2.8% (tổng lợi nhuận từ insider signal)
   ├─ Examples of hits:
   │  ├─ 2026-04-25: VCB insider buy (Phạm Viết Thắng) → VCB +1.3% (3d)
   │  ├─ 2026-04-10: HPG insider buy → HPG +2.5% (3d)
   │  └─ 2026-04-05: FPT insider buy → FPT +3.1% (3d)
   ├─ Example of miss:
   │  └─ 2026-03-28: SAB insider buy → SAB -0.8% (3d) [MISS]
   └─ Khuyến cáo: FOCUS trên insider buying — best signal type

2. PRICE DROP ALERT — Win rate 75%, Sharpe 0.85 ⭐⭐⭐
   ├─ Alerts: 12 tín hiệu (kỹ thuật: break support)
   ├─ Hit: 9 (bounce từ support)
   ├─ Miss: 3 (tiếp tục giảm)
   ├─ Avg return 3-day: +2.1%
   ├─ Portfolio impact: +3.2% (tổng từ bounce alerts)
   ├─ Examples of hits:
   │  ├─ 2026-04-20: VNM support 87 break → bounce +2.3% (3d)
   │  ├─ 2026-04-15: FPT support 64.5 break → bounce +3.1% (3d)
   │  └─ 2026-04-08: VCB support 31.8 break → bounce +2.0% (3d)
   ├─ Examples of miss:
   │  ├─ 2026-03-30: PSI support 33 break → continue decline -4.2% (3d) [MISS]
   │  └─ 2026-03-22: SAB support 70 break → continue decline -3.8% (3d) [MISS]
   └─ Khuyến cáo: STRONG signal nhưng rủi ro 25% — dùng stop loss

3. SECTOR ROTATION — Win rate 67%, Sharpe 0.74 ⭐⭐
   ├─ Alerts: 6 tín hiệu (inflow/outflow detection)
   ├─ Hit: 4
   ├─ Miss: 2
   ├─ Avg return 3-day: +2.5%
   ├─ Portfolio impact: +1.6%
   ├─ Examples of hits:
   │  ├─ 2026-04-15: Banking inflow detected → VCB +1.5%, BID +0.8% (3d)
   │  ├─ 2026-04-05: Steel inflow → HPG +2.8%, NKG +2.1% (3d)
   │  └─ 2026-03-28: Tech outflow flagged → FPT rallied anyway +3% (oops)
   ├─ Examples of miss:
   │  ├─ 2026-03-20: Real estate inflow → VNR -1.2% (3d) [MISS]
   │  └─ 2026-03-10: Outflow alert → sector held stable, no decline [MISS]
   └─ Khuyến cáo: USEFUL nhưng timing uncertain — use with other signals

4. CONVICTION FLIP — Win rate 100%, Sharpe 1.20 ⭐⭐⭐⭐
   ├─ Alerts: 2 tín hiệu (very rare)
   ├─ Hit: 2 (cả hai đúng)
   ├─ Miss: 0
   ├─ Avg return 3-day: +4.1%
   ├─ Portfolio impact: +0.8% (ít danh mục nhưng tỷ suất cao)
   ├─ Examples:
   │  ├─ 2026-04-12: FPT conviction 0.65 → 0.82 (huge jump) → FPT +4.5% (3d)
   │  └─ 2026-03-25: VCB conviction 0.72 → 0.85 (jump) → VCB +3.8% (3d)
   └─ Khuyến cáo: RARE nhưng POWERFUL — when conviction flip happens, act

5. PRICE SURGE ALERT — Win rate 60%, Sharpe 0.62 ⭐⭐
   ├─ Alerts: 10 tín hiệu (breakout above resistance)
   ├─ Hit: 6 (tiếp tục tăng)
   ├─ Miss: 4 (pullback từ resistance)
   ├─ Avg return 3-day: +1.8%
   ├─ Portfolio impact: +1.8%
   ├─ Examples of hits:
   │  ├─ 2026-04-18: FPT breakout 66 → +2.5% (3d)
   │  ├─ 2026-04-08: HPG breakout 52 → +3.2% (3d)
   │  └─ 2026-03-28: VCB breakout 32.5 → +1.8% (3d)
   ├─ Examples of miss:
   │  ├─ 2026-04-02: VNM breakout 88 → pullback -1.5% (3d) [MISS]
   │  ├─ 2026-03-25: CTG breakout 22 → pullback -0.8% (3d) [MISS]
   │  └─ 2026-03-18: SAB breakout 72 → pullback -3.2% (3d) [MISS]
   └─ Khuyến cáo: MODERATE — dùng volume confirmation

6. NEWS MOMENTUM — Win rate 56%, Sharpe 0.45 ⭐
   ├─ Alerts: 9 tín hiệu (positive/negative news)
   ├─ Hit: 5
   ├─ Miss: 4
   ├─ Avg return 3-day: +1.2%
   ├─ Portfolio impact: +1.1%
   ├─ Examples of hits:
   │  ├─ 2026-04-22: DAV drug approval news → +2.8% (3d)
   │  ├─ 2026-04-10: FPT dividend announce → +1.8% (3d)
   │  └─ 2026-03-28: VNR project announce → +1.5% (3d)
   ├─ Examples of miss:
   │  ├─ 2026-04-01: VNM supply chain story → -1.2% (3d) [MISS]
   │  ├─ 2026-03-20: HPG cost pressure news → -0.8% (3d) [MISS]
   │  └─ 2026-03-15: PSI bankruptcy rumor (not confirmed) → ignored, declined -3% [MISS]
   └─ Khuyến cáo: WEAK — too many false positives, filter by credibility

7. MACRO SHIFT — Win rate 75%, Sharpe 0.68 ⭐⭐
   ├─ Alerts: 4 tín hiệu (interest rate, inflation, etc.)
   ├─ Hit: 3
   ├─ Miss: 1
   ├─ Avg return 3-day: +1.9%
   ├─ Portfolio impact: +0.9%
   ├─ Examples of hits:
   │  ├─ 2026-04-05: Rate cut signal → banking +1.8% (3d)
   │  └─ 2026-03-28: Inflation cooling → stock market +2.1% (3d)
   ├─ Example of miss:
   │  └─ 2026-03-10: USD strength signal → actually VND strengthened [MISS]
   └─ Khuyến cáo: USEFUL nhưng lag — forward-looking

PHÂN TÍCH RỦI RO / PHẦN TRĂM:

Attribution Breakdown (portfolio +12.5% từ đâu):
  - Insider buying: +2.8% (22% of total)
  - Price drop alerts: +3.2% (26% of total)
  - Sector rotation: +1.6% (13% of total)
  - Price surge alerts: +1.8% (14% of total)
  - News momentum: +1.1% (9% of total)
  - Macro shift: +0.9% (7% of total)
  - Conviction flip: +0.8% (6% of total)
  - Residual (buy & hold): +0.3% (3% of total)
  ────────────────────────
  Total: +12.5% (100%)

Top 3 signal types theo contribution:
  1. Price drop (support breakout): +26% of returns
  2. Insider buying: +22% of returns
  3. Price surge (breakout): +14% of returns

Bottom 3 signal types:
  7. Conviction flip: +6% (rarest)
  6. Macro shift: +7% (lag issue)
  5. News momentum: +9% (false positives)

RISK-ADJUSTED RETURN (SHARPE RATIO):

Best Sharpe ratio (risk-adjusted return):
  1. Conviction flip: 1.20 (best risk-reward)
  2. Insider buying: 1.05 (strong)
  3. Price drop alert: 0.85 (good)

Worst Sharpe ratio:
  1. News momentum: 0.45 (too many false positives)
  2. Price surge alert: 0.62 (whipsaw risk)
  3. Sector rotation: 0.74 (timing uncertain)

WinRate Ranking:
  1. Conviction flip: 100% (but rare: 2 alerts)
  2. Insider buying: 88% (high confidence)
  3. Price drop: 75% (reliable)
  3. Macro shift: 75%
  5. Sector rotation: 67% (timing dependent)
  6. Price surge: 60% (breakout fails often)
  7. News momentum: 56% (too noisy)

REKOMENDASI CHIẾN LƯỢC:

Priority 1 (HIGH CONFIDENCE):
  ✓ FOCUS on Insider buying signals
    - Win rate 88%, Sharpe 1.05
    - Average +3.2% 3-day return
    - Action: Size up positions on insider buys (double weight)
    - Confidence: Very high

  ✓ ACT on Price drop (support) alerts
    - Win rate 75%, Sharpe 0.85
    - Average +2.1% 3-day return
    - Action: Buy on support break (with stop loss 2% below)
    - Confidence: High

Priority 2 (MODERATE CONFIDENCE):
  ✓ USE Sector rotation for portfolio rebalancing
    - Win rate 67%, Sharpe 0.74
    - Useful for allocation shifts
    - Action: Rebalance when rotation detected (but not sole signal)
    - Confidence: Medium

  ✓ MONITOR Price surge (breakout) alerts
    - Win rate 60%, Sharpe 0.62
    - Average +1.8% but 40% miss rate
    - Action: Confirm with volume before entry
    - Confidence: Medium

Priority 3 (LOW CONFIDENCE):
  ✗ DE-WEIGHT News momentum signals
    - Win rate 56%, Sharpe 0.45
    - Too many false positives
    - Action: Use only if credibility >0.8 (verified sources)
    - Confidence: Low

  ✗ AVOID Macro shift relying solely
    - Win rate 75% but lag (3-5 days)
    - Use for longer-term positioning, not tactical
    - Action: Combine with other signals
    - Confidence: Medium (lag issue)

SUGGESTED PORTFOLIO RULES:

1. Insider buy → BUY immediately (88% hit rate)
2. Price drop (support) → BUY on break (75% hit rate) [with stop -2%]
3. Conviction flip → ACT fast (100% hit rate, rare)
4. Sector rotation → INFO for rebalance, not primary signal
5. Price surge → CONFIRM with volume; Sharpe low
6. News → USE ONLY if verified (credibility >0.8)
7. Macro → Use for strategic positioning, not tactical

BACKTEST SUGGESTION:

Re-run analysis with:
  → Exclude news momentum (too noisy, -9% of signal quality)
  → Double weight insider buying (highest Sharpe)
  → Add volume confirmation for price surge
  → Expected portfolio return improvement: +2-3% (on +12.5% base)

NEXT ACTIONS:

1. Update conviction algorithm:
   - Increase weight on insider buying (30% → 40%)
   - Reduce weight on news momentum (25% → 15%)

2. Add volume confirmation to price surge signals:
   - Require volume > 110% 20-day average

3. Monitor Conviction Flip signals closely (very rare, high impact):
   - Track when conviction flips >0.10 (rare event)
   - Size up position when flip detected

4. Benchmark against:
   - Random walk (baseline)
   - VNINDEX buy & hold
   - Equal-weight balanced strategy
```

## Usage

```json
{
  "tool_name": "get_performance_attribution",
  "input": {
    "days": 90,
    "signalType": "all"
  }
}
```

## Data Sources

- `alerts` table — all historical alerts with dates
- `market_prices_history` — 3-day returns after alert
- `positions` table — trades executed from alerts
- `conviction_history` — conviction changes (flips)
- Signal classification — categorize each alert by type

## Related Tools

- `get_alerts` — current active alerts
- `get_portfolio_conviction` — signal strength over time
- `get_positions` — current holdings from signal-driven trades
- `sequential_market_analysis` — deep dive on signal drivers

---

## Implementation Notes

- **Hit definition:** Price moves in alert direction within 3 days
- **Win rate:** (Hits / Total alerts) × 100%
- **Return calculation:** Price change from alert date to +3 days
- **Sharpe ratio:** Return / Volatility (daily return std dev)
- **Attribution:** Aggregate return from each signal type / Total portfolio return
- **Lookback:** Filters alerts by execution within timeframe

## Signal Type Definitions

| Type | Definition | Example |
|------|-----------|---------|
| price_drop | Support break (TA) | VNM breaks 20-day MA downside |
| price_surge | Resistance break (TA) | VCB breaks 32.5 resistance |
| insider | Insider transaction | Board member buys 50K shares |
| news | News event with sentiment | Drug approval, earnings beat |
| sector_rotation | Sector inflow/outflow | Banking money inflow detected |
| macro_shift | Macro indicator change | Rate cut signal, inflation data |
| conviction_flip | Conviction score jumps | Score 0.65 → 0.82 |

## Vietnamese Notes

- **Hiệu suất** = Performance
- **Phân tích tác động** = Attribution
- **Tín hiệu** = Signal
- **Tỷ lệ thắng** = Win rate
- **Lợi nhuận** = Return
- **Độ đo rủi ro** = Risk-adjusted metric
