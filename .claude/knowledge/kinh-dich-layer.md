# Kinh Dich Layer — Default Analysis Layer

**Load when:** implementing Kinh Dich integration, hexagram signals, or `get_kinhdich_reading`/`get_market_hexagram` tools.

## Rule

Kinh Dich is the **DEFAULT layer for every stock analysis** (Sprint 054+).
- Server: analysis tools auto-append hexagram reading to output
- Agent: every Cowork agent MUST call `get_kinhdich_reading(ticker)` when analyzing a stock

## Tools

| Tool | Returns |
|------|---------|
| `get_kinhdich_reading(ticker)` | 3-layer: Quẻ chính (main), Hỗ quẻ (nuclear), Biến quẻ (changing) + Lão/Thiếu hào states + Ngũ Hành |
| `get_market_hexagram()` | Market-wide I Ching state |
| `run_hexagram_backtest(days)` | Historical accuracy over N days |
| `get_transition_probabilities(hexagram_number)` | Transition probabilities to next states |

## Hào States

| State | Meaning |
|-------|---------|
| Lão Dương (old yang → yin) | Overbought, potential reversal down |
| Lão Âm (old yin → yang) | Oversold, potential recovery |
| Thiếu Dương (stable yang) | Bullish trend continuing |
| Thiếu Âm (stable yin) | Bearish trend continuing |

Priority lines: **Hào 3** = current price action | **Hào 5** = medium-term trend | **Biến quẻ** = future state

`kinhDichConfidence` = 0–100. Required >= 70 for `watchlist-opportunity` alert.

## Agent Integration Pattern

Every Cowork agent analyzing a stock:
```
Call get_kinhdich_reading({ticker})
→ Output: "Kinh Dịch: Quẻ {name} — {1-line trend}. Biến quẻ: {name} ({direction})"
→ Lão Dương on Hào 3 → add "Lão Dương — RSI quá mua, cảnh báo đảo chiều"
→ Lão Âm on Hào 3  → add "Lão Âm — quá bán, có thể hồi phục"
```

For market-wide context (digest, morning briefing):
```
Call get_market_hexagram() → include overall hexagram state in digest header
```

## Position-Aware Context

Include in position analysis block:
```
Kinh Dịch: {hexagram_name} — {1-line signal}
```
Full position block format → `.claude/knowledge/position-schema.md`

## Digest Writer Weekly

```
Weekly: run_hexagram_backtest(days=7) → "Kinh Dịch tuần này: độ chính xác {pct}% ({N}/{M} dự đoán đúng)"
Weekly: get_transition_probabilities(hexagram_number) for stocks in key transition states
```
