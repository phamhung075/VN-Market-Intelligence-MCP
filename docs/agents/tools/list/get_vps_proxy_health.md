---
tool: get_vps_proxy_health
category: system
agents: [ops, system-auditor, dev-team-cron]
---

# `get_vps_proxy_health`

**Category:** system | **Used by:** Ops, System Auditor, Dev Team Cron
**Description:** Shows health status of all 4 VPS proxy services (prices, news, sbv, bctc). Displays last push timestamp, item counts, error rates, and staleness warnings.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| service | enum (all, prices, news, sbv, bctc) | ❌ | all | Filter to a specific service, or 'all' (default) |

## Returns

Formatted ASCII table showing:
- Service name (prices, news, sbv, bctc)
- Last push timestamp (ISO 8601)
- Item count in last push
- Status (success, error, etc.)
- 24h push count and error count
- Stale flag: `YES` (raw age exceeds expected interval — proxy connectivity concern) | `no` | `off-hours` (service sleeps outside its active publishing window — not a fault) | `idle-no-work` (demand-driven route whose own work queue is confirmed empty right now — not a proxy fault)

Plus recent push log (last 10 entries) with duration and error messages.

## Usage

```json
{
  "tool_name": "get_vps_proxy_health",
  "input": {
    "service": "prices"
  }
}
```

## Notes

- Expected intervals: prices (5min), news (10min), sbv (60min), bctc (720min)
- Stale alert triggers when age > expected interval
- Shows 24h push counts and error rates
- Recent log appended at bottom with response times
- **Demand-driven routes (FIX-VPSHEALTH-DEMANDROUTE-EMPTYQUEUE-MISREPORTS-PROXY-UNREACHABLE, 2026-07-30):**
  `bctc` pushes only when `bctc_vps_queue` holds an actionable (`pending`) row — it is NOT
  on a fixed wall-clock cadence. If that route's own queue currently holds zero `pending`
  rows, a large last-push age is reported as `idle-no-work` (summary line
  `IDLE-NO-WORK (by design): bctc — ...`) instead of being folded into the generic
  `STALE: ... — VPS may be down or unreachable` line — an empty demand-driven queue is not
  evidence the proxy itself is down (root-cause probe 2026-07-29: bctc_vps_queue held 0
  pending rows while prices/news/sbv were all pushing normally on the same proxy). The
  registry of demand-driven routes → "actionable" SQL lives in
  `DEMAND_QUEUE_SQL` (`apps/mcp-server/src/infrastructure/db/vpsPushLogStore.ts`) and is
  generic — any future route added to that map gets the same idle-no-work gate for free.
