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
  "queued": ["FPT", "VIC"],
  "attempted": ["FPT", "VIC"],
  "success": ["FPT", "VIC"],
  "failed": [],
  "dry_run": false,
  "log_tail": "[...] LIVE mode — SSH command: /root/run-bctc-debug.sh --ticker FPT --ticker VIC\n[...] SSH exited 0 — VPS script launched. Check VPS logs at /tmp/bctc-debug-*.log"
}
```
`queued` is the current `bctc_vps_queue` pending state (read-only, independent
of the ssh outcome). A failed ssh call populates `failed: [{ticker, reason}]`
with the REAL error, never a silent empty-everything payload.

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
- **FIX-VPS-SSH-TRIGGER-FAIL-LOUD (2026-07-22):** live mode now performs a REAL
  synchronous SSH call (previously it only logged a would-be command and
  always returned empty attempted/success/failed — see
  `docs/architecture/microservice/mcp-server/system.md` § VPS Debug-Trigger Tools).
- Uses VPS_HOST/VPS_SSH_USER/VPS_SSH_KEY_PATH env vars (not VINAHOST_IP) via
  the shared `sshExec()` infrastructure
- Check VPS logs at /tmp/bctc-debug-*.log
- Useful for debugging BCTC PDF pipeline
