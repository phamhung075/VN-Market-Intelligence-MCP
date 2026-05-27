---
tool: trigger_sbv_vps_fetch
category: system
agents: [ops, system-auditor]
---

# `trigger_sbv_vps_fetch`

**Category:** system | **Used by:** Ops, System Auditor
**Description:** Manually triggers an SBV/FX rate fetch run on the Vinahost VPS for diagnosis. Fetches USD/VND exchange rate from Vietcombank XML API.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| verbose | boolean | ❌ | true | If true (default), includes VCB XML URL and parse step details in diagnostic output. |
| dry_run | boolean | ❌ | false | If true, returns pipeline state without triggering SSH. Use to inspect without side effects. |

## Returns

```json
{
  "service": "vn-sbv-fetch.service",
  "attempted": 1,
  "success": 1,
  "failed": [],
  "dry_run": false,
  "log_tail": "[SSH] Queued command: ssh root@..../run-sbv-debug.sh..."
}
```

## Usage

```json
{
  "tool_name": "trigger_sbv_vps_fetch",
  "input": {
    "verbose": true,
    "dry_run": false
  }
}
```

## Notes

- Service: vn-sbv-fetch.service (every 30min)
- Fetches USD/VND from Vietcombank XML endpoint
- No tickers parameter (global SBV rate)
- dry_run=true inspects without triggering SSH
- Queues SSH command to VPS (fire-and-forget)
- Check VPS logs at /tmp/sbv-debug-*.log
- VINAHOST_IP env var must be set for live mode
