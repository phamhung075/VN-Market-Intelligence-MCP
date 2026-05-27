---
tool: get_alert_accuracy
category: alerts
agents: [digest-predict, unified-agent]
---

# `get_alert_accuracy`

**Category:** alerts | **Used by:** Digest & Predict, Unified Coordinator
**Description:** Retrospective alert accuracy: compare signals to actual price outcomes. Scores each alert as HIT (correct direction), MISS (wrong direction), or UNKNOWN (no price data).

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| days | number (positive integer) | ❌ | 30 | Lookback period in days (default: 30) |
| actionCode | string | ❌ | — | Filter to a specific stock ticker, e.g. VNM |

## Returns

Vietnamese-language accuracy report:

```
Độ chính xác tín hiệu (30 ngày)

Tổng: 45 cảnh báo | Hit: 28 (62%) | Miss: 12 (27%) | Unknown: 5 (11%)

Phân tích theo loại tín hiệu:
  price_drop: 70% (21/30)
  price_surge: 55% (6/11)
  volume_spike: 80% (8/10)

Cổ phiếu chính xác thấp nhất:
  VEA: 3 cảnh báo, 33% chính xác
  VIC: 5 cảnh báo, 40% chính xác
```

## Usage

```json
{
  "tool_name": "get_alert_accuracy",
  "input": {
    "days": 30,
    "actionCode": "VCB"
  }
}
```

## Notes

- Scoring rules:
  - HIT = predicted direction matches actual move
  - MISS = predicted direction opposes actual move
  - UNKNOWN = neutral prediction or no price data
- Looks back 1–3 days for price confirmation
- Intraday fallback (1–12h) for recent alerts before 3-day window available
- Minimum move threshold: 0.1% (noise tolerance)
- Worst-performing stocks highlighted for review
