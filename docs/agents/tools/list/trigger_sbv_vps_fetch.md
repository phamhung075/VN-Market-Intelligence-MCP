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
  "service": "vn-sbv-fetch",
  "attempted": ["vn-sbv-fetch"],
  "success": ["vn-sbv-fetch"],
  "failed": [],
  "dry_run": false,
  "log_tail": "[...] LIVE mode — SSH command: /root/run-sbv-debug.sh --verbose\n[...] SSH exited 0 — VPS script launched. Check VPS logs at /tmp/sbv-debug-*.log"
}
```
A failed ssh call populates `failed: [{source, reason}]` with the REAL error,
never a silent empty-everything payload.

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
- **FIX-VPS-SSH-TRIGGER-FAIL-LOUD (2026-07-22):** live mode now performs a REAL
  synchronous SSH call (previously it only logged a would-be command and
  always returned empty attempted/success/failed — see
  `docs/architecture/microservice/mcp-server/system.md` § VPS Debug-Trigger Tools).
- Uses VPS_HOST/VPS_SSH_USER/VPS_SSH_KEY_PATH env vars (not VINAHOST_IP) via
  the shared `sshExec()` infrastructure
- Check VPS logs at /tmp/sbv-debug-*.log
