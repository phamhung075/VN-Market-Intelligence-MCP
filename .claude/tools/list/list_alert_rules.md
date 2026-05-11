---
tool: list_alert_rules
category: alerts
agents: [alert-commander, unified-agent]
---

# `list_alert_rules`

**Category:** alerts | **Used by:** Alert Commander, Unified Coordinator
**Description:** List all custom alert rules with their current status. Shows triggered date for rules that have already fired.

## Parameters

None

## Returns

Formatted plain-text table:

```
Quy tắc cảnh báo tùy chỉnh (8 đang hoạt động / 10 tổng cộng)

ID  | Ma    | Dieu kien   | Nguong      | Trang thai
----|-------|-------------|-------------|-------------------------------
1   | VCB   | Gia duoi    | 85,000      | Hoat dong
2   | FPT   | P/E tren    | 22.5        | Da kich hoat (2026/04/28)
3   | HPG   | ROE tren    | 15.0        | Da tat
4   | TPB   | KL tren     | 5,000,000   | Hoat dong

Ghi chu:
  ID 2 (FPT): Monitor when fundamentals deteriorate
  ID 3 (HPG): Suspended for Q2 earnings season
```

## Usage

```json
{
  "tool_name": "list_alert_rules",
  "input": {}
}
```

## Notes

- Predicates: price_above, price_below, volume_above, pe_above, pe_below, roe_above
- Status: Hoat dong (active), Da kich hoat (triggered with date), Da tat (disabled)
- Prices shown in VND with comma separator
- Notes section shows any user-provided rationale
- To modify rules, use analyst workflow (not MCP mutation tools)
