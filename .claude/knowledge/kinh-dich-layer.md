# Kinh Dich Layer — Default Analysis Layer

**When to read this file:** When implementing or reviewing Kinh Dich (I Ching) integration in analysis tools, agent workflows, or the hexagram reading pipeline. Load only when your task touches hexagram signals, the Kinh Dich layer, or the `get_kinhdich_reading` / `get_market_hexagram` tools.

---

## Default Layer Rule

The Kinh Dich layer is the **DEFAULT layer for every stock analysis** in Sprint 054+.

This means:
- Server-side: analysis tools auto-append hexagram reading to their output
- Agent-side: every Cowork agent MUST call `get_kinhdich_reading(ticker)` when analyzing a stock, and include the result in output

---

## Tools

| Tool | What it returns |
|------|----------------|
| `get_kinhdich_reading(ticker)` | 3-layer reading: Quẻ chính (main hex), Hỗ quẻ (nuclear), Biến quẻ (changing). Includes Lão/Thiếu hào states and Ngũ Hành interaction |
| `get_market_hexagram()` | Market-wide I Ching state for overall context |
| `run_hexagram_backtest(days)` | Historical accuracy of hexagram predictions over N days |
| `get_transition_probabilities(hexagram_number)` | Probability of transition from given hexagram to next states |

---

## Reading Interpretation

### Hào states
- **Lão Dương** (old yang, moving line → yin): overbought signal, potential reversal downward
- **Lão Âm** (old yin, moving line → yang): oversold signal, potential recovery
- **Thiếu Dương** (young yang, stable): bullish trend continuing
- **Thiếu Âm** (young yin, stable): bearish trend continuing

### Priority lines for price analysis
- Hào 3 (position line) = current price action signal
- Hào 5 (ruler line) = medium-term trend signal
- Biến quẻ = future state prediction

### Confidence score
- `kinhDichConfidence` = 0–100 (percentage)
- Used in `watchlist-opportunity` alert trigger: requires >= 70

---

## Agent Integration Pattern

Every Cowork agent that analyzes a specific stock MUST include:

```
Step N: Kinh Dich Reading
  Call get_kinhdich_reading({ticker})
  → Include in output: "Kinh Dịch: Quẻ {name} — {1-line trend}. Biến quẻ: {name} ({direction})"
  → If Lão Dương on Hào 3: add "Lão Dương — RSI quá mua, cảnh báo đảo chiều"
  → If Lão Âm on Hào 3: add "Lão Âm — quá bán, có thể hồi phục"
```

For market-wide context (daily/weekly digest, morning briefing):
```
  Call get_market_hexagram()
  → Include overall market hexagram state in digest header
```

---

## Position-Aware Context

When analyzing a held stock, include Kinh Dich signal in the position analysis block:
```
  Kinh Dịch: {hexagram_name} — {1-line signal}
```

See `.claude/knowledge/position-schema.md` for the full position analysis block format.

---

## Digest Writer Weekly Protocol

```
Weekly: call run_hexagram_backtest(days=7) → report accuracy of hexagram predictions this week
Weekly: call get_transition_probabilities(hexagram_number) for stocks in key transition states
```

Report format: "Kinh Dịch tuần này: độ chính xác {pct}% ({N}/{M} dự đoán đúng)"
