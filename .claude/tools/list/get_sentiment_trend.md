# get_sentiment_trend

**Category:** News-Analysis / Sentiment

**Module:** `apps/mcp-server/src/interface/mcp/tools/news-analysis/sentimentTrendTools.ts`

## Purpose

Get sentiment trend data for a stock over a specified window. Analyzes RAG-stored sentiment entries and computes daily breakdowns, trend direction, and slope. Useful for detecting sentiment momentum before price confirmation.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `stock_code` | string | Yes | — | Stock ticker code (e.g. 'VNM') |
| `window_days` | number | No | 7 | Look-back window in days (1-90) |

## Return Format

```
Xu hướng tâm lý VNM (7 ngày)

Ngày   | Tin  | Tích cực | Tiêu cực | Trung lập | Điểm
-------|------|----------|----------|-----------|-----
04/29  | 8    | 62%      | 25%      | 13%       | +3
04/30  | 12   | 67%      | 20%      | 13%       | +5
05/01  | 10   | 70%      | 15%      | 15%       | +7
05/02  | 9    | 72%      | 18%      | 10%       | +6
05/03  | 14   | 75%      | 18%      | 7%        | +8
05/04  | 11   | 78%      | 16%      | 6%        | +9
05/05  | 13   | 80%      | 15%      | 5%        | +10

Xu hướng: ĐANG CẢI THIỆN (slope: +0.92)
Tóm tắt: VNM có xu hướng tâm lý tích cực mạnh. Tỷ lệ tin tích cực tăng từ 62% lên 80%, trong khi tin tiêu cực giảm liên tục. Xu hướng này có thể hỗ trợ giá tăng trong ngắn hạn.
```

## Sentiment Categories

| Category | Definition |
|----------|-----------|
| **Tích cực** (Bullish) | Positive news, earnings beats, analyst upgrades, M&A |
| **Tiêu cực** (Bearish) | Negative news, earnings misses, downgrades, regulatory risk |
| **Trung lập** (Neutral) | Informational without clear direction, administrative updates |

## Trend Directions

| Trend | Slope Sign | Meaning |
|-------|-----------|---------|
| ĐANG CẢI THIỆN | positive (+) | Net sentiment score increasing day-over-day |
| ĐANG XẤU ĐI | negative (−) | Net sentiment score decreasing day-over-day |
| ỔN ĐỊNH | near-zero | Net sentiment score stable (slope < |0.2|) |

## Use Cases

- **Market Watcher** monitors sentiment trends as leading indicator of price moves
- **News Scout** compares multiple stocks to identify relative sentiment momentum
- **Alert Commander** uses sentiment deterioration as early warning trigger
- **Digest & Predict** includes sentiment momentum in weekly forecasts

## Return Values

- **Daily breakdown**: Date, article count, bullish%, bearish%, neutral%, net score
- **Trend direction**: improving, deteriorating, or stable
- **Slope**: numerical change in sentiment score per day
- **Summary**: Vietnamese narrative interpretation

## Related Tools

- `fetch_and_analyze` — feeds news into sentiment computation
- `get_sentiment_trend` — cross-compare sentiment for multiple stocks
- `search_similar_context` — find historical sentiment patterns

## Notes

- Requires `rag_analyses` table with sentiment and affected_actions columns
- Empty input (no articles) returns "Không có dữ liệu" message
- Slope calculation: linear regression of daily net scores
- Dates formatted as DD/MM for Vietnamese readability
- Window defaults to 7 days; max 90 days to prevent memory bloat
- NULL sentiments treated as "neutral" in calculations
