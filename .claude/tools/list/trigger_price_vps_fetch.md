---
tool: trigger_price_vps_fetch
category: system
agents: [ops, system-auditor]
---

# `trigger_price_vps_fetch`

**Category:** system | **Used by:** Ops, System Auditor
**Description:** Manually triggers a stock price fetch run on the Vinahost VPS for diagnosis. Returns pipeline state: which step would run, source URLs, push endpoint status.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| tickers | array of strings | ❌ | — | Optional ticker filter, e.g. ['FPT','VIC']. Omit to process all watchlist tickers. |
| verbose | boolean | ❌ | true | If true (default), includes per-step diagnostic lines showing fetch sources and push steps. |
| dry_run | boolean | ❌ | false | If true, returns pipeline state without triggering SSH. Use to inspect without side effects. |

## Returns

```json
{
  "service": "vn-price-fetch.service",
  "attempted": 30,
  "success": 30,
  "failed": [],
  "dry_run": false,
  "log_tail": "[SSH] Queued command: ssh root@..../run-price-debug.sh..."
}
```

## Usage

```json
{
  "tool_name": "trigger_price_vps_fetch",
  "input": {
    "tickers": ["VCB", "FPT"],
    "verbose": true,
    "dry_run": false
  }
}
```

## Notes

- Service: vn-price-fetch.service (runs every 60s)
- dry_run=true inspects without triggering SSH
- Queues SSH command to VPS (fire-and-forget)
- Check VPS logs at /tmp/price-debug-*.log
- VINAHOST_IP env var must be set for live mode
- Useful for debugging price data pipeline
