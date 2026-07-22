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
  "service": "vn-foreign-flow",
  "attempted": ["FPT", "VIC"],
  "success": ["FPT", "VIC"],
  "failed": [],
  "dry_run": false,
  "log_tail": "[...] LIVE mode — SSH command: /root/run-foreign-flow-debug.sh --ticker FPT --ticker VIC\n[...] SSH exited 0 — VPS script launched. Check VPS logs at /tmp/foreign-flow-debug-*.log"
}
```
`attempted`/`success`/`failed` are string arrays (ticker codes, or `["all"]`
when no ticker filter given) — a failed ssh call populates
`failed: [{ticker, reason}]` with the REAL error, never a silent
empty-everything payload.

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
- **FIX-VPS-SSH-TRIGGER-FAIL-LOUD (2026-07-22):** live mode now performs a REAL
  synchronous SSH call (previously it only logged a would-be command and
  always returned empty attempted/success/failed — see
  `docs/architecture/microservice/mcp-server/system.md` § VPS Debug-Trigger Tools).
- Uses VPS_HOST/VPS_SSH_USER/VPS_SSH_KEY_PATH env vars (not VINAHOST_IP) via
  the shared `sshExec()` infrastructure
- Check VPS logs at /tmp/foreign-flow-debug-*.log
- Useful for debugging foreign investor sentiment
