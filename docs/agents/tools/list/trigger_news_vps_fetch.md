---
tool: trigger_news_vps_fetch
category: system
agents: [ops, system-auditor]
---

# `trigger_news_vps_fetch`

**Category:** system | **Used by:** Ops, System Auditor
**Description:** Manually triggers a news RSS fetch run on the Vinahost VPS for diagnosis. Returns pipeline state: which sources are configured, RSS URLs, push endpoint status.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| verbose | boolean | ❌ | true | If true (default), includes per-source diagnostic lines showing RSS URLs and fetch steps. |
| dry_run | boolean | ❌ | false | If true, returns source list without triggering SSH. Use to inspect without side effects. |

## Returns

```json
{
  "service": "vn-news-fetch.service",
  "attempted": 10,
  "success": 8,
  "failed": [
    {"source": "cafef.vn", "reason": "Connection timeout"}
  ],
  "dry_run": false,
  "log_tail": "[SSH] Queued command: ssh root@..../run-news-debug.sh..."
}
```

## Usage

```json
{
  "tool_name": "trigger_news_vps_fetch",
  "input": {
    "verbose": true,
    "dry_run": false
  }
}
```

## Notes

- Service: vn-news-fetch.service (every 15min, 10 RSS sources + Playwright for bot-guarded)
- dry_run=true inspects without triggering SSH
- Queues SSH command to VPS (fire-and-forget)
- Check VPS logs at /tmp/news-debug-*.log
- VINAHOST_IP env var must be set for live mode
- Includes 10 Vietnamese financial news RSS sources
