---
tool: manage_alert_mute
category: alerts
agents: [alert-commander, unified-agent]
---

# `manage_alert_mute`

**Category:** alerts | **Used by:** Alert Commander, Unified Coordinator
**Description:** Tắt tiếng (mute) hoặc bật lại (unmute) cảnh báo cho một mã cổ phiếu. Dùng action='mute' để tắt tiếng trong N giờ. Dùng action='unmute' để bật lại ngay lập tức.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| code | string (1-10 chars) | ✅ | — | Mã cổ phiếu (ví dụ: VCB, FPT, VNM) |
| action | enum (mute, unmute) | ✅ | — | 'mute' để tắt tiếng, 'unmute' để bật lại |
| hours | number (1-720, integer) | ❌ | 24 | Số giờ tắt tiếng — chỉ dùng khi action='mute' (mặc định 24, tối đa 720 = 30 ngày) |
| reason | string (≤200 chars) | ❌ | — | Lý do tắt tiếng — chỉ dùng khi action='mute' (tùy chọn) |

## Returns

When mute:

```
VCB đã được tắt tiếng trong 24 giờ (đến 02/04 15:30)
Lý do: False positive from yesterday's news

Để bật lại cảnh báo, gọi manage_alert_mute với action='unmute'.
```

When unmute:

```
VCB đã được bật lại cảnh báo (trước khi hết hạn 02/04 15:30).
```

Or if not previously muted:

```
VCB hiện không bị tắt tiếng cảnh báo.
```

## Usage

Mute for 24 hours with reason:

```json
{
  "tool_name": "manage_alert_mute",
  "input": {
    "code": "VCB",
    "action": "mute",
    "hours": 24,
    "reason": "False positive from earnings miss"
  }
}
```

Unmute immediately:

```json
{
  "tool_name": "manage_alert_mute",
  "input": {
    "code": "VCB",
    "action": "unmute"
  }
}
```

## Notes

- Hours only applies to mute action
- Mute can last 1 hour to 30 days (1–720 hours)
- Unmute clears mute immediately even if time remains
- Returns formatted Vietnamese output
- Reason logged for audit trail
