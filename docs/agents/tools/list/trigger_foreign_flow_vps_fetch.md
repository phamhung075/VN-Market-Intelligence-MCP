---
tool: trigger_foreign_flow_vps_fetch
category: system
agents: [ops, system-auditor]
---

# `trigger_foreign_flow_vps_fetch`

**Category:** system | **Used by:** Ops, System Auditor
**Description:** Manually triggers a foreign investor flow fetch run on the Vinahost VPS for diagnosis. Returns pipeline state: which tickers are being monitored, field names, payload size, and push endpoint status.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| tickers | array of strings | ❌ | — | Optional ticker filter, e.g. ['FPT','VIC']. Omit to process all watchlist tickers. |
| verbose | boolean | ❌ | true | If true (default), includes per-step diagnostic lines showing field names, payload size, jq transform details. |
| dry_run | boolean | ❌ | false | If true, returns pipeline state without triggering SSH. Use to inspect without side effects. |

## Returns

```json
{
  "service": "vn-foreign-flow.service",
  "attempted": 30,
  "success": 30,
  "failed": [],
  "dry_run": false,
  "log_tail": "[SSH] Queued command: ssh root@..../run-foreign-flow-debug.sh..."
}
```

## Usage

```json
{
  "tool_name": "trigger_foreign_flow_vps_fetch",
  "input": {
    "tickers": ["VCB"],
    "verbose": true,
    "dry_run": false
  }
}
```

## Notes

- Service: vn-foreign-flow.service (every 60s)
- Monitors foreign buy/sell volumes and room (fBuyVol, fSellVol, fRoom)
- dry_run=true inspects without triggering SSH
- Queues SSH command to VPS (fire-and-forget)
- Check VPS logs at /tmp/foreign-flow-debug-*.log
- VINAHOST_IP env var must be set for live mode
- Useful for debugging foreign investor sentiment
