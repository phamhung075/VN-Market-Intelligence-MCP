---
tool: send_alert_digest
category: alerts
agents: [alert-commander, digest-predict]
---

# `send_alert_digest`

**Category:** alerts | **Used by:** Alert Commander, Digest & Predict
**Description:** Assemble the daily 24-hour alert digest grouped by stock and return the formatted Vietnamese-language text. Optionally sends the digest via Telegram.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| sendTelegram | boolean | ❌ | false | When true, attempt to send the digest via Telegram in addition to returning the text. Default: false. |

## Returns

Vietnamese-language formatted digest with alerts grouped by stock:

```
TỔNG HỢP CẢNH BÁO 24H
Ngày: 2026-05-05

VCB (Ngân hàng)
  10:30 [HIGH] Price drop: -3.5% từ 90,250 xuống 87,100
  14:15 [MEDIUM] Volume spike: 250% above average
  14:45 [LOW] News: Lợi suất tăng 5bp

HPG (Thép)
  09:00 [CRITICAL] Price surge: +8.2% từ 35,500 lên 38,400
  ...

Tóm tắt: 15 cảnh báo từ 8 cổ phiếu
[Telegram: đã gửi thành công]
```

Or if Telegram not configured:

```
TỔNG HỢP CẢNH BÁO 24H
...
(Telegram chưa được cấu hình)
```

## Usage

```json
{
  "tool_name": "send_alert_digest",
  "input": {
    "sendTelegram": true
  }
}
```

## Notes

- Assembles alerts from past 24 hours
- Groups by stock ticker for readability
- Includes severity level and timestamp
- Returns formatted text (can be used independently of Telegram)
- Vietnamese output for local market analysts
