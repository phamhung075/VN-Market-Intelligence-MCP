---
tool: get_alerts
category: alerts
agents: [alert-commander, unified-agent]
---

# `get_alerts`

**Category:** alerts | **Used by:** Alert Commander, Unified Coordinator
**Description:** List investment alerts from the database. Query system alerts (signal alerts) and/or price alerts (stop-loss/take-profit). Filter by severity, read status, stock code, or date range.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| type | enum (system, price, all) | ❌ | all | Which alert table: 'system' (signal alerts), 'price' (stop-loss/take-profit), or 'all' (both). Default: 'all' |
| severity | enum (low, medium, high, critical, all) | ❌ | all | Filter by severity level (default: all). Applies to system alerts only. |
| unreadOnly | boolean | ❌ | false | When true, returns only unread system alerts |
| actionCode | string | ❌ | — | Filter alerts affecting a specific stock code, e.g. VCB |
| limitDays | number (1-90) | ❌ | 7 | Return system alerts from the last N days (default: 7, max: 90) |
| limit | number (1-100) | ❌ | 20 | Maximum number of system alerts to return (default: 20) |
| priceStatusFilter | enum (all, active, triggered, cancelled) | ❌ | active | Filter price alerts by status. Default: 'active' (only live threshold alerts). |
| sentBy | enum (server, alert-commander) | ❌ | — | Filter by alert source. 'server' = rule-based, 'alert-commander' = reasoning-based. Omit for all sources. |
| notifiedTelegramFilter | enum (all, pending, sent) | ❌ | — | Filter by Telegram notification status. 'pending' = not yet notified, 'sent' = notified. |

## Returns

Formatted plain-text output with sections:

**System Alerts section** (when type=system or all):
```
System Alerts — 5 found (last 7 days)

[unread] [HIGH] 2026-05-05 10:30 [id:abc123]
  Stocks  : VCB, TPB
  Signals : price_drop, volume_spike
  Message : Price drop detected with unusual volume
```

**Price Alerts section** (when type=price or all):
```
Cảnh báo giá (8 đang hoạt động)

Mã    | Loại       | Ngưỡng      | Giá hiện tại | Trạng thái
------|------------|-------------|-------------|------------
VCB   | Stop-loss  | 85,000      | 88,500      | Hoạt động
FPT   | Take-profit| 75,000      | 72,300      | Hoạt động
```

## Usage

```json
{
  "tool_name": "get_alerts",
  "input": {
    "type": "all",
    "severity": "high",
    "limitDays": 7,
    "limit": 20,
    "sentBy": "server"
  }
}
```

## Notes

- System alerts marked [read] or [unread]
- Severity icons: [LOW] [MEDIUM] [HIGH] [CRITICAL]
- Price alerts formatted in Vietnamese
- [SUPERSEDED] tag indicates fixed alerts (Task 1005)
- Filter by sentBy to distinguish server rules from Alert Commander reasoning
