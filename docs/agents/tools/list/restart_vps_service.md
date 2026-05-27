---
tool: restart_vps_service
category: system
agents: [ops]
---

# `restart_vps_service`

**Category:** system | **Used by:** Ops
**Description:** Restart a named service on the Vinahost VPS via SSH. Allowed: price-fetcher, foreign-flow-fetcher, bctc-fetcher.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| service | string | ✅ | — | Service name to restart. Must be one of: price-fetcher, foreign-flow-fetcher, bctc-fetcher. |

## Returns

On success:

```json
{
  "success": true,
  "service": "price-fetcher",
  "stdout": "Restarting vn-price-fetch.service...\nService started successfully."
}
```

On SSH failure:

```json
{
  "success": false,
  "service": "price-fetcher",
  "exitCode": 1,
  "stderr": "Failed to restart service"
}
```

## Usage

```json
{
  "tool_name": "restart_vps_service",
  "input": {
    "service": "price-fetcher"
  }
}
```

## Notes

- Allowed services: price-fetcher, foreign-flow-fetcher, bctc-fetcher
- Enforces three-layer allowlist for security
- Uses SSH to Vinahost VPS (VINAHOST_IP env var must be set)
- Returns exit code and stderr on failure
- Useful for recovering stuck services
