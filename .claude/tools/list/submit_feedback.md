---
tool: submit_feedback
category: system
agents: [all-cowork]
---

# `submit_feedback`

**Category:** system | **Used by:** All Cowork agents
**Description:** Submit an improvement suggestion to the BUG Telegram channel. Use for missing cascade rules, wrong trade mappings, data extraction errors, alert quality issues, or system gaps.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| agent | string (1-30 chars) | ✅ | — | Your agent name (e.g. 'news-scout', 'market-watcher', 'unified-agent') |
| category | enum | ✅ | — | Category: cascade_rule_gap, trade_map_gap, sentiment_error, data_extraction_error, alert_quality, threshold_issue, sector_peer_issue, new_indicator, performance_issue, other |
| title | string (5-200 chars) | ✅ | — | Short title of the issue |
| detail | string (≤1000 chars) | ❌ | — | Detailed description: what happened, what should happen, evidence |
| priority | enum (low, medium, high, critical) | ❌ | medium | Priority: critical=blocks analysis, high=wrong results, medium=improvement, low=nice-to-have |
| to | string (≤30 chars) | ❌ | @po | Recipient: @team, @po, @dev, @qa, @ba, @architect |

## Returns

```
Feedback submitted: [HIGH] Wrong sector classification for FPT
Recipient: @po
BUG channel: sent
message_id: 123456789 (process_telegram_report removes it when resolved)
```

## Usage

```json
{
  "tool_name": "submit_feedback",
  "input": {
    "agent": "market-watcher",
    "category": "sector_peer_issue",
    "title": "Wrong sector classification for FPT",
    "detail": "FPT is classified as retail but should be tech. This affects sector rotation analysis.",
    "priority": "high",
    "to": "@ba"
  }
}
```

## Notes

- Sent to BUG channel (TELEGRAM_REPORT_BUG_CHANNEL_ID) only (never cross-posts to MARKET)
- Includes retry logic for transient Telegram API failures (1 retry, 2s delay)
- Returns message_id which is removed by process_telegram_report when resolved
- Emoji prefix by priority: 🚨 critical, 🔴 high, 🟡 medium, 🟢 low
