---
name: get_vps_service_health
type: tool
package: ops-infrastructure
related_tools: trigger_bctc_vps_fetch, get_system_status
complexity: simple
---

# get_vps_service_health

Returns formatted table showing **health status of all 5 Vinahost VPS services**:
1. **vn-price-fetch** — Stock prices (HOSE/HNX/UPCOM)
2. **vn-bctc-fetch** — Financial reports (PDFs)
3. **vn-news-fetch** — Market news (CafeF, VnExpress)
4. **vn-sbv-fetch** — Central bank FX rates
5. **vn-foreign-flow** — Foreign investor flow data

Shows: last poll time, health status (healthy/unhealthy/unreachable), response time (ms), uptime %.

## Arguments

- **include_history** (boolean) — optional, default: false
  - If true, include 24h health trend (uptime by hour)

## Return Type

```typescript
{
  success: boolean,
  services: Array<{
    service_name: string,
    status: "healthy" | "unhealthy" | "unreachable",
    last_poll: string,  // ISO timestamp
    response_time_ms: number,
    uptime_pct: number,  // 24h rolling average
    last_error?: string
  }>,
  summary: {
    healthy_count: number,
    unhealthy_count: number,
    unreachable_count: number,
    vps_overall_status: "healthy" | "degraded" | "down"
  },
  vps_connectivity: {
    reachable: boolean,
    ssh_auth: boolean,
    disk_free_gb: number,
    docker_running: boolean
  },
  timestamp: string
}
```

## Example Usage

### Ops — Cycle Start Health Check
```typescript
// At cycle start, verify all VPS services operational
const health = await call_tool("vn-market", "get_vps_service_health", {
  include_history: false
});

// Quick status
console.log(`VPS Status: ${health.summary.vps_overall_status}`);
console.log(`  Healthy: ${health.summary.healthy_count}/5`);
console.log(`  Unhealthy: ${health.summary.unhealthy_count}/5`);

// Detail check
for (const svc of health.services) {
  const status = svc.status === "healthy" ? "✅" : "⚠️";
  console.log(`${status} ${svc.service_name}: ${svc.response_time_ms}ms (${svc.uptime_pct.toFixed(1)}% uptime)`);

  if (svc.last_error) {
    console.log(`   Error: ${svc.last_error}`);
  }
}

// If any service unhealthy, alert
if (health.summary.unhealthy_count > 0) {
  const unhealthy = health.services.filter(s => s.status !== "healthy");
  await call_tool("vn-market", "submit_feedback", {
    agent: "ops",
    title: `VPS service degradation: ${unhealthy.map(s => s.service_name).join(", ")}`,
    category: "bug",
    detail: `${unhealthy.length} services unhealthy: ${unhealthy.map(s => `${s.service_name} (${s.response_time_ms}ms)`).join(", ")}`,
    to: "@ops"
  });
}
```

### Ops — SLA Monitoring
```typescript
// Track uptime for SLA compliance (99.5% target)
const health = await call_tool("vn-market", "get_vps_service_health", {
  include_history: true
});

for (const svc of health.services) {
  const slaTarget = 0.995;
  const isMet = svc.uptime_pct / 100 >= slaTarget;

  console.log(`${svc.service_name}: ${svc.uptime_pct.toFixed(2)}% ${isMet ? "✅" : "❌ SLA MISS"}`);
}

// Report for SLA dashboard
await call_tool("vn-market", "log_agent_work", {
  agent_name: "ops",
  status: "completed",
  summary: `VPS SLA check: ${health.services.filter(s => (s.uptime_pct / 100) >= 0.995).length}/5 services meet 99.5% SLA`,
  findings: health.services
    .filter(s => (s.uptime_pct / 100) < 0.995)
    .map(s => `${s.service_name}: ${s.uptime_pct.toFixed(2)}% < 99.5% SLA`),
  actions: ["Logged SLA status", "Flagged underperforming services"]
});
```

### Ops — Incident Triage
```typescript
// When analyst reports "BCTC not updating", ops checks VPS first
const health = await call_tool("vn-market", "get_vps_service_health", {});

const bctcService = health.services.find(s => s.service_name === "vn-bctc-fetch");

if (bctcService.status === "unreachable") {
  console.log("🔴 BCTC service unreachable. VPS may be down.");

  if (!health.vps_connectivity.reachable) {
    console.log("  → VPS not reachable via SSH. Check network/firewall.");
  } else if (!health.vps_connectivity.docker_running) {
    console.log("  → Docker not running. Restart: docker-compose up -d");
  } else {
    console.log("  → Service process down. Check logs or restart service.");
  }
} else if (bctcService.response_time_ms > 30000) {
  console.log(`⚠️ BCTC slow (${bctcService.response_time_ms}ms). May be rate-limited or network latency.`);
} else {
  console.log("✅ BCTC service healthy. Issue may be in local MCP layer.");
}
```

### QA — Health Baseline Before Deployment
```typescript
// Record baseline health before deploying VPS changes
const baseline = await call_tool("vn-market", "get_vps_service_health", {});

const baselineServices = Object.fromEntries(
  baseline.services.map(s => [s.service_name, s.response_time_ms])
);

// Deploy...

// Post-deployment check
const postDeploy = await call_tool("vn-market", "get_vps_service_health", {});

let regressions = [];
for (const svc of postDeploy.services) {
  const baselineTime = baselineServices[svc.service_name];
  const delta = svc.response_time_ms - baselineTime;

  if (delta > 50) {  // > 50ms slower
    regressions.push(`${svc.service_name}: ${baselineTime}ms → ${svc.response_time_ms}ms (+${delta}ms)`);
  }
}

if (regressions.length > 0) {
  console.log("❌ PERFORMANCE REGRESSION:");
  regressions.forEach(r => console.log(`  ${r}`));
  process.exit(1);
} else {
  console.log("✅ Health check passed. No performance regression.");
}
```

## When to Use

- **Cycle start** — Verify VPS operational before market analysis begins
- **Incident triage** — "BCTC not updating?" → Check VPS health first
- **SLA monitoring** — Track uptime for compliance reports
- **Post-deployment** — Verify no performance regressions after VPS changes
- **Regular monitoring** — Check 2-3x daily (cycle start, mid-day, EOD)

## Related Tools

| Tool | Use Case |
|------|----------|
| `trigger_bctc_vps_fetch` | If vn-bctc-fetch unhealthy, manually trigger retry |
| `get_system_status` | Local MCP server health (complementary to VPS) |
| `submit_feedback` | Report service issues to ops team |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `vps_overall_status: "down"` | VPS unreachable | SSH to VPS; check docker, network, restart |
| `all services: "unreachable"` | SSH auth failed or VPS offline | Verify SSH key, VPS IP, network connectivity |
| `response_time_ms > 30000` | Network latency or service overload | Check VPS CPU/memory, network packet loss |

## Notes

- **Polling frequency:** Health checked every 60s by VPS watchdog. Values are current as of last poll.
- **Unreachable ≠ down:** Service status "unreachable" means health check failed, not necessarily service is down. Manual SSH verify.
- **Uptime metric:** 24h rolling average. First poll resets uptime to 100%; historical depth improves after 24h.
- **Healthy threshold:** Response < 3s and last successful poll < 5min ago.
- **All 5 services critical:** Each service provides data for different agents. One service down = partial pipeline.

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — arguments, 4 workflow examples, SLA monitoring, incident triage, performance validation)
