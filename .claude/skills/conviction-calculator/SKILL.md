---
name: conviction-calculator
description: Compute conviction score from multi-source evidence (price, news, BCTC, hex, FII)
type: reusable-skill
usage: Alert Commander, Market Watcher, Financial Analyst
---

# Conviction Calculator Skill

**Purpose:** Transparent, evidence-based confidence score (0-100%).

## Input

```
{
  stock: "VCB",
  signal_type: "price_drop",  // or "bearish", "bullish", etc
  sources: {
    price_signal: { direction: "bearish", strength: 0.85, rsi: 28 },
    news_sentiment: { direction: "bearish", score: -0.3, sources: 2 },
    bctc_outlook: { direction: "neutral", roe_change: -2, growth: "stalled" },
    kinh_dich: { direction: "bearish", hex: 29, accuracy_stock: 0.78 },
    foreign_flow: { direction: "bearish", net_shares: -500000, days: 3 },
    insider_activity: { direction: "neutral", transactions: 1, type: "sell" }
  }
}
```

## Process

### Step 1: Source Strength Scoring
```
price_signal (bearish, RSI 28):
  - Oversold indicator = 0.95 strength
  - Single-day drop = 0.85 impact
  → weighted = 0.90

news_sentiment (bearish, -0.3):
  - Moderate negative sentiment
  → weighted = 0.60

bctc_outlook (neutral):
  - No strong signal
  → weighted = 0.40

kinh_dich (bearish, Hex 29):
  - Hex 29 = Risk phase
  - Stock accuracy = 78% (validated)
  → weighted = 0.78 × 0.80 (hex weight) = 0.62

foreign_flow (bearish, 3d streak):
  - Consistent outflow
  → weighted = 0.75

insider_activity (neutral):
  - No conviction
  → weighted = 0.50
```

### Step 2: Multi-Source Consensus
```
Bearish sources: 4 of 6
  - price_signal: 0.90 ✓
  - news_sentiment: 0.60 ✓
  - kinh_dich: 0.62 ✓
  - foreign_flow: 0.75 ✓
  - bctc: 0.40 (neutral, weak)
  - insider: 0.50 (neutral)

Consensus strength = (0.90 + 0.60 + 0.62 + 0.75) / 4 = 0.72
Consensus count = 4/6 = 67% of sources agree
→ STRONG CONSENSUS (4 sources, 72% avg strength)
```

### Step 3: Calibration Adjustment
```
Call: get_calibration_report()
Baseline accuracy: 0.82 (system-wide prediction accuracy)

My conviction factors: 0.72 × 1.0 (no override yet)

If market_watcher_bias toward false positives:
  Calibration multiplier = 0.75
  Adjusted = 0.72 × 0.75 = 0.54

→ CONSERVATIVE (account for agent bias)
```

### Step 4: Recent History Check
```
Call: get_alert_accuracy(stock="VCB", days=30)
Result: "VCB alerts: 78% hit rate last 30 days"

Previous similar signals (same direction, similar strength):
  - 3 prior alerts: 2 correct, 1 false
  → Historical success = 67%

Adjusted final conviction = (0.54 × 0.67 + 0.72 × 0.33) = 0.60
→ 60% CONFIDENCE (after history adjustment)
```

## Output

```
{
  conviction: 0.60,
  conviction_pct: "60%",
  severity: "MEDIUM",  // CRITICAL (85+), HIGH (70-84), MEDIUM (50-69), LOW (<50)

  sources_breakdown: {
    bearish: [
      { name: "Price Signal", strength: 0.90, reason: "RSI 28, oversold" },
      { name: "News Sentiment", strength: 0.60, reason: "-0.3 negative" },
      { name: "Kinh Dich", strength: 0.62, reason: "Hex 29 (Risk)" },
      { name: "Foreign Flow", strength: 0.75, reason: "-500k shares/3d" }
    ],
    neutral: [
      { name: "BCTC", strength: 0.40, reason: "ROE stalled, no direction" },
      { name: "Insider Activity", strength: 0.50, reason: "One sell, unclear" }
    ]
  },

  consensus: {
    count: 4,
    total_sources: 6,
    pct: "67%",
    description: "4 of 6 sources bearish"
  },

  adjustments: {
    calibration_multiplier: 0.75,
    historical_success: "67%",
    reason: "Agent has false-positive bias; similar signals 67% accurate"
  },

  recommendation: "SELL with MEDIUM confidence. Re-assess in 24h or at +1% bounce.",
  reassess_trigger: [
    "Price recovers +1% (Hex 29 recovery)",
    "FII flow reverses to net-buy",
    "News sentiment improves to >= -0.1"
  ]
}
```

## Usage In Agent

### **Alert Commander** (Before sending alert)
```python
conviction = conviction_calculator(
    stock="VCB",
    sources={
        "price": get_market_snapshot("VCB"),
        "news": get_sentiment_trend("VCB"),
        "bctc": get_bctc_full("VCB"),
        "kinh_dich": get_kinhdich_reading("VCB"),
        "foreign": get_foreign_flow("VCB"),
        "insider": get_insider_transactions("VCB")
    }
)

if conviction.pct >= 70:
    send_telegram(f"🔴 {stock} [{conviction.pct}% conv] {conviction.recommendation}")
    record_evidence = conviction.sources_breakdown
```

### **Market Watcher** (Suppress weak signals)
```python
if price_anomaly_detected:
    conviction = conviction_calculator(stock, {"price": anomaly, "kinh_dich": hex})

    if conviction.pct < 50:
        suppress_alert()  # Noise
    else:
        post_agent_signal("price_anomaly", conviction=conviction.pct)
```

### **Financial Analyst** (BCTC confidence)
```python
conviction = conviction_calculator(
    stock="VCB",
    sources={"bctc": financial_data, "news": sentiment}
)

if conviction.pct >= 60:
    post_agent_signal("fundamental_validation", conviction=conviction.pct)
```

## Rules

1. **Always include sources** — Show user which signals contributed
2. **Calibrate against agent bias** — `get_calibration_report()` catches overconfidence
3. **Check history** — Similar past signals inform current confidence
4. **Set reassess triggers** — When to re-evaluate (not "hold forever")
5. **Never hide uncertainty** — If < 60%, mark as MEDIUM or LOW

---

**Integration:**
- Add to: 05-alert-commander.md (required before EVERY send_telegram), 04-market-watcher.md, 02-financial-analyst.md
- Replaces: Hardcoded thresholds (e.g., "fire if price < threshold")
- Saves tokens: ~150 per cycle (reusable conviction logic)
