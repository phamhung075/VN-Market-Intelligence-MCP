---
tool: get_crisis_early_warning
category: sector
agents: [cowork, qa, ops]
---

# `get_crisis_early_warning`

**Category:** Sector | **Used by:** cowork, qa, ops

Get crisis early warning radar for watchlist stocks. Returns velocity-based crisis indicators and reputation scores. Flags stocks with mention velocity > 2× baseline or reputation score < 50.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `codes` | array | No | — | Optional: filter to specific stock codes (e.g. ["VNM", "HPG"]). Omit for all watchlist stocks. |

## Returns

Plain-text Vietnamese report showing:
- Mention velocity (news mentions per day, normalized to baseline)
- Reputation score (0-100, composite of sentiment)
- Crisis classification (stable / warning / alert / critical)
- Affected stocks ranked by risk level
- Suggested monitoring actions

## Output Example

```
=== BÁO ĐỘNG SỢ HÃNG SỚM ===

--- CRITICAL ALERT ---
VNM: Mention velocity 3.2× baseline (42 mentions/day vs 13 typical)
  Reputation score: 35/100 [CRITICAL]
  Recent themes: Chất lượng sản phẩm, Tranh chấp lao động, Điều tra
  Recommendation: MONITOR HOURLY

--- WARNING ---
HPG: Mention velocity 1.8× baseline (24 mentions/day vs 13 typical)
  Reputation score: 52/100 [WARNING]
  Recent themes: Thép giá, Cạnh tranh quốc tế
  Recommendation: MONITOR DAILY

--- STABLE ---
VCB: Mention velocity 0.9× baseline (12 mentions/day vs 13 typical)
  Reputation score: 78/100 [STABLE]
  Recent themes: Lãi suất, Tăng trưởng tín dụng
  Recommendation: ROUTINE MONITORING

TỔNG KẾT: 1 cảnh báo CRITICAL, 1 WARNING — Tổng mức rủi ro: ELEVATED
```

## Usage

```json
{
  "tool_name": "get_crisis_early_warning",
  "input": {
    "codes": ["VNM", "HPG"]
  }
}
```

## Data Sources

- `news_articles` — daily news mention count and sentiment
- `crisis_indicators` table — rolling baseline metrics
- `mention_velocity` history — 30-day rolling window
- Sentiment analysis — keyword scoring from analysis layer

## Related Tools

- `get_legal_risk_signals` — specific legal case detection
- `get_insider_signals` — management response signals
- `get_alerts` — active alert status for stock

---

## Implementation Notes

- **Mention velocity:** Mentions per day normalized to 30-day rolling average
- **Threshold:** Crisis triggered at 2.0× baseline multiplier
- **Reputation score:** Composite of positive/negative mention ratio, severity weighting
- **Update frequency:** Daily batch update; real-time if critical threshold breached
- **Sentiment classification:** Keyword-based (positive/neutral/negative)

## Thresholds

| Score | Threshold | Action |
|-------|-----------|--------|
| 0-30 | Critical | Alert management immediately |
| 31-50 | Warning | Daily monitoring recommended |
| 51-70 | Caution | Standard monitoring |
| 71-100 | Stable | Routine observation |

## Vietnamese Notes

- **Báo động sợ hãng** = Crisis early warning radar
- **Tốc độ nhắc đến** = Mention velocity
- **Điểm danh tiếng** = Reputation score
- **Khuyến cáo** = Recommendation
- **Giám sát** = Monitor
