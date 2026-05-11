---
tool: trigger_bctc_vps_fetch
category: system
agents: [ops, system-auditor]
---

# `trigger_bctc_vps_fetch`

**Category:** system | **Used by:** Ops, System Auditor
**Description:** Manually triggers a BCTC PDF fetch run on the Vinahost VPS for diagnosis. Returns the current queue state with verbose diagnostics.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| tickers | array of strings | ❌ | — | Optional ticker filter, e.g. ['FPT','VIC']. Omit to process all pending queue items. |
| verbose | boolean | ❌ | true | If true (default), includes per-item diagnostic lines showing attempts, source URLs, queue status. |
| dry_run | boolean | ❌ | false | If true, returns queue state without triggering SSH. Use to inspect without side effects. |

## Returns

```json
{
  "queued": 5,
  "attempted": 2,
  "success": 0,
  "failed": [
    {"ticker": "FPT", "reason": "Source URL not cached, skipping..."},
    {"ticker": "VIC", "reason": "Max retries exceeded"}
  ],
  "dry_run": false,
  "log_tail": "[SSH] Queued command: ssh root@..../run-bctc-debug.sh"
}
```

## Usage

```json
{
  "tool_name": "trigger_bctc_vps_fetch",
  "input": {
    "tickers": ["FPT"],
    "verbose": true,
    "dry_run": false
  }
}
```

## Notes

- dry_run=true inspects queue without triggering SSH
- Queues SSH command to VPS (fire-and-forget)
- Check VPS logs at /tmp/bctc-debug-*.log
- VINAHOST_IP env var must be set for live mode
- Useful for debugging BCTC PDF pipeline
