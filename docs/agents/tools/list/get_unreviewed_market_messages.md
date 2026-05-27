# get_unreviewed_market_messages

**Category:** Briefings / Message Quality

**Module:** `apps/mcp-server/src/interface/mcp/tools/briefings/marketMessageTools.ts`

## Purpose

List unreviewed MARKET channel messages for quality assessment. Returns newest messages first. Agents use this to identify which user-facing messages require signal/noise classification before automated distribution.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `limit` | number | No | 20 | Maximum rows to return (1-100, default 20) |
| `ticker` | string | No | — | Optional filter by ticker code (partial match on affected stocks) |

## Return Format

```json
[
  {
    "id": 1234,
    "created_at": "2026-05-05T14:30:00Z",
    "from_agent": "market-watcher",
    "message_type": "price_alert",
    "text": "VNM price breaks above 88,000 VND; technical target 90,000",
    "affected_stocks": ["VNM"],
    "severity": "high",
    "verdict": null,
    "note": null
  },
  {
    "id": 1233,
    "created_at": "2026-05-05T13:45:00Z",
    "from_agent": "news-scout",
    "message_type": "urgent_news",
    "text": "GAS announces pipeline expansion; bullish for energy sector",
    "affected_stocks": ["GAS", "PTL"],
    "severity": "medium",
    "verdict": null,
    "note": null
  }
]
```

**Empty State:**
```
Không có tin nhắn chưa review. Tất cả đã được đánh giá.
```

## Message Fields

| Field | Type | Definition |
|-------|------|-----------|
| **id** | number | Unique message ID |
| **created_at** | ISO string | When message was posted |
| **from_agent** | string | Originating agent (market-watcher, news-scout, etc.) |
| **message_type** | string | Category (price_alert, urgent_news, signal, etc.) |
| **text** | string | Message content |
| **affected_stocks** | array | Tickers mentioned |
| **severity** | string | low, medium, high, critical |
| **verdict** | string | null (unreviewed), "signal" (keep), "noise" (discard) |
| **note** | string | Optional reviewer note |

## Use Cases

- **QA team** reviews batch of unreviewed messages to filter signal from noise
- **Digest & Predict** pulls messages for agent briefing context
- **User portal** shows unreviewed alerts awaiting classification
- **System auditor** monitors message queue health

## Related Tools

- `review_market_message` — label a message as signal or noise
- `get_market_message_digest` — grouped digest of unreviewed messages
- `send_telegram` — agents send messages to MARKET channel

## Notes

- Returns only messages with `verdict = NULL` (unreviewed)
- Sorted by `created_at DESC` (newest first)
- Ticker filter does partial match on `affected_stocks` LIKE %ticker%
- Empty result indicates all messages reviewed (good signal-to-noise)
- Max 100 results to prevent memory bloat
- JSON output (not plain text) for programmatic handling
- Verdict=null field supports bulk review workflows
