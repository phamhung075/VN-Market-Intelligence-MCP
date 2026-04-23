---
name: kinh-dich-interpreter
description: Interpret hexagram in trading context — meaning, timing, risk/opportunity
type: reusable-skill
usage: Market Watcher, Alert Commander, Digest & Predict
---

# Kinh Dich Interpreter Skill

**Purpose:** Transform raw hexagram into actionable trading insight.

## Input

```
{
  stock: "VCB",
  current_hex: 29,
  hex_name: "坎 (Kan) — Risk/Water",
  price_context: { current: 75000, change_pct: -2.5, rsi: 28 },
  news_sentiment: -0.3,
  fundamental_direction: "bearish"
}
```

## Process

### Step 1: Interpret Hex Meaning
```
Hex 29 (Risk/Water):
- Judgment: "Repeat the danger. Sincerity brings success."
- Trading: Risk phase. Movement restricted. Recovery likely after endurance.
- Timing: 3-5 days typical recovery window
- Risk: Further drop possible before reversal
```

### Step 2: Cross-Validate With Price + News
```
✓ Price -2.5% + RSI 28 = ALIGNS (oversold)
✓ News -0.3 (negative) = ALIGNS (risk phase)
✓ Fundamental bearish = ALIGNS (confirms hex)
→ Conviction: STRONG (all 3 sources agree with hex)
```

### Step 3: Check Hex Transitions
```
Call: get_transition_probabilities(hex=29)
Next likely: Hex 53 (Gradual Progress) — 60% probability
→ Suggests recovery 3-5d out
→ Stop-loss valid short-term; recovery trade longer-term
```

### Step 4: Backtest This Stock's Hex Accuracy
```
Call: run_hexagram_backtest(stock="VCB", days=30)
Result: "Hex predictions correct 78% of time for VCB"
→ Confidence multiplier: 0.78 × conviction = final strength
```

## Output

```
{
  interpretation: "Risk phase (坎). Oversold recovery likely 3-5 days.",
  meaning: "Repeat danger, sincerity succeeds.",
  timing: "3-5 days to recovery",
  risk_opportunity: {
    risk: "Further 1-2% drop possible before bottom",
    opportunity: "Recovery bounce likely if RSI < 30"
  },
  validates: ["price_oversold", "negative_news", "fundamental_weakness"],
  next_hex_likely: "Hex 53 (Gradual Progress)",
  stock_accuracy: "78%",
  final_conviction: "STRONG",
  action: "Hold if long-term, short-term bounce likely"
}
```

## Usage In Agent

### **Market Watcher** (Validate price anomaly)
```python
if price_move_unusual:
    hex_reading = get_kinhdich_reading(stock)
    interpretation = kinh_dich_interpreter(stock, hex_reading)

    if interpretation.validates includes price_move:
        post_agent_signal("price_anomaly", validates=true)
    else:
        suppress alert (likely noise)
```

### **Alert Commander** (Add hex context to alert)
```python
alert_data = {
  "stock": "VCB",
  "action": "SELL",
  "conviction": 0.80
}

hex_reading = get_kinhdich_reading("VCB")
hex_context = kinh_dich_interpreter("VCB", hex_reading)

telegram_message = f"""
🔴 {stock} — {action} [{conviction}%]
Hex: {hex_context.meaning}
Timing: {hex_context.timing} recovery
Risk: {hex_context.risk}
"""
```

### **Digest & Predict** (Weekly hex trend)
```python
for stock in watchlist:
    hex_history = get_hexagram_history(stock, days=30)

    for hex_reading in hex_history:
        interpretation = kinh_dich_interpreter(stock, hex_reading)

    digest += f"{stock}: {interpretation.timing} pattern"
```

## Rules

1. **Always backtest** — `run_hexagram_backtest()` confirms hex accuracy for that stock
2. **Cross-validate** — Price + news + fundamental must align with hex meaning
3. **Show timing** — Hex provides recovery window, not just direction
4. **Explain next** — `get_transition_probabilities()` predicts next phase
5. **Never override fundamentals** — Hex supplements, not replaces BCTC/news

---

**Integration:**
- Add to: 04-market-watcher.md, 05-alert-commander.md, 06-digest-predict.md
- Replaces: Ad-hoc hex interpretation scattered across agents
- Saves tokens: ~200 per cycle (centralized logic)
