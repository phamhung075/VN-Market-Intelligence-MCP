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
  "service": "vn-news-fetch",
  "attempted": ["vn-news-fetch"],
  "success": ["vn-news-fetch"],
  "failed": [],
  "dry_run": false,
  "log_tail": "[...] LIVE mode — SSH command: /root/run-news-debug.sh --verbose\n[...] SSH exited 0 — VPS script launched. Check VPS logs at /tmp/news-debug-*.log"
}
```
A failed ssh call populates `failed: [{source, reason}]` with the REAL error
(e.g. `"ssh exited 255"` / connection refused), never a silent empty-everything
payload — this tool's `attempted`/`success`/`failed` are one entry
(`"vn-news-fetch"`), not per-RSS-source (the remote script handles all sources
in one ssh invocation).

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
- **FIX-VPS-SSH-TRIGGER-FAIL-LOUD (2026-07-22):** live mode now performs a REAL
  synchronous SSH call (previously it only logged a would-be command and
  always returned empty attempted/success/failed — see
  `docs/architecture/microservice/mcp-server/system.md` § VPS Debug-Trigger Tools).
- Uses VPS_HOST/VPS_SSH_USER/VPS_SSH_KEY_PATH env vars (not VINAHOST_IP) via
  the shared `sshExec()` infrastructure
- Check VPS logs at /tmp/news-debug-*.log
- Includes 10 Vietnamese financial news RSS sources
