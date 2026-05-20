# Tool Package — Ops

**Location:** `.claude/tools/package/ops.md`
**Load when:** Agent starts, before first MCP call
**Last Updated:** 2026-05-05

## How to Invoke Tools

All VN Market MCP tools are accessed via the MCP gateway `call_tool` (server="vn-market").
Server name: **`vn-market`** (exact, no variants).

```
call_tool(
  server: "vn-market",
  tool: "<tool_name>",
  arguments: { ... }
)
```

⚠️ **Wrong** → ~~`tool_name`~~ use `tool` | ~~`input`~~ use `arguments` | ~~`vnmarket-mcp`~~ use `"vn-market"`

For detailed parameters and return signatures: `.claude/tools/list/<tool_name>.md`

---

## Tools — Ops

### System Diagnostics & Health
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_system_status` | Database, source health, data freshness, recent errors | — |
| `get_sla_status` | Service Level Agreement compliance across all systems | — |
| `get_pipeline_health` | BCTC, news, FX, price, foreign flow pipeline status | — |
| `get_cron_health` | Scheduler job status and execution history | — |
| `get_rate_limit_status` | API rate limits across all services | — |

### VPS Service Management
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_vps_service_health` | Vinahost VPS reachability, service status, uptime | — |
| `get_vps_proxy_health` | Proxy tunnel status, connection reliability | — |
| `restart_vps_service` | Restart a specific VPS service | `service: "bctc" \| "price" \| "news" \| "sbv" \| "foreign_flow"` |

### VPS Data Triggers
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `trigger_bctc_vps_fetch` | Manually trigger BCTC PDF fetch from VPS | `tickers?: string[]` |
| `trigger_price_vps_fetch` | Manually trigger stock price fetch from VPS | `tickers?: string[]` |
| `trigger_news_vps_fetch` | Manually trigger news fetch from VPS | — |
| `trigger_sbv_vps_fetch` | Manually trigger SBV (central bank) data fetch | — |
| `trigger_foreign_flow_vps_fetch` | Manually trigger foreign investor flow fetch | — |

### System History & Diagnostics
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_recent_fixes` | Recent bug fixes and system repairs | `limit?: number` |
| `log_fix` | Log a system fix or workaround | `issue: string, fix: string, severity: string` |

### Notifications
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `send_telegram` | Send message to Telegram channel | `message: string, channel: "market" \| "work" \| "bug"` |

---

## Task-Lock Coordination Tools (Phase 3 — ACTIVE)

For stuck-lock incident response (see also `docs/architecture-briefs/2026-05-21-task-lock-phase3-devteam.md` § 5).

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `task_list_held` | List/audit current or expired locks across fleet | `kind?, owner_agent?, expired?` |
| `task_release` | Force-release orphaned lock within own session | `task_id` |

Skill: `.claude/skills/task-lock/SKILL.md` (lazy-load for incident diagnosis).
Protocol: `docs/protocols/task-lock-protocol.md`.

---

## Architecture Overview

### 9-Service Docker Deployment

```
Docker Compose (restart on failure)
  ├── mcp-server (TS, port 3000)
  │   ├── Tools interface
  │   ├── MCP routing
  │   └── SQLite DB
  ├── ta-service (TS, port 4001)
  │   ├── Technical analysis
  │   └── Price patterns
  ├── bb-service (TS, port 4002)
  │   ├── Alert scanning
  │   └── Signal cascade
  ├── macro-service (TS, port 4003)
  │   ├── Macro analysis
  │   └── Prediction
  ├── pdf-service (Python, port 5001)
  │   ├── BCTC PDF parsing
  │   └── OCR processing
  ├── rag-service (Python, port 5002)
  │   ├── News analysis
  │   └── Sentiment extraction
  ├── stock-price-service (Python, port 5003)
  │   ├── Price data
  │   └── OHLCV feeds
  ├── gateway-service (TS, port 6000)
  │   ├── HTTP routing
  │   └── Request marshaling
  └── postgres (optional, port 5432)
      └── Shared cache
```

### VPS Proxy Architecture

```
Vinahost VPS (Vietnam geo-locked access)
  ├── :8765/bctc-files/ (PDF downloads)
  ├── :8765/stock-prices/ (real-time quotes)
  ├── :8765/news-feed/ (news sources)
  ├── :8765/sbv-data/ (SBV macroeconomic)
  └── :8765/foreign-flow/ (foreign investor data)

Local MCP Server (PULL-based)
  └── Periodically fetches from VPS:8765
      └── Stores to /app/data/pdfs/ + SQLite
```

---

## Channel Permissions

| Channel | Write | Rules |
|---------|-------|-------|
| **market** | ❌ | Not used |
| **work** | ✅ | System status, fixes completed |
| **bug** | ✅ | Critical errors, outages, diagnostics |

---

## Troubleshooting & Common Issues

### VPS Unreachable

```typescript
const health = await call_tool(
  server: "vn-market", tool: "get_vps_service_health",
  arguments: {}
);

if (health.status === "unreachable") {
  // Check proxy tunnel
  const proxyHealth = await call_tool(
    server: "vn-market", tool: "get_vps_proxy_health",
    arguments: {}
  );

  if (proxyHealth.tunnel_status === "disconnected") {
    // Tunnel down - report to user
    await call_tool(
      server: "vn-market", tool: "send_telegram",
      arguments: {
        message: "VPS proxy tunnel disconnected. Manual SSH reconnect required.",
        channel: "bug"
      }
    );
  }
}
```

### BCTC Pipeline Stalled

```typescript
const pipeline = await call_tool(
  server: "vn-market", tool: "get_pipeline_health",
  arguments: {}
);

if (pipeline.bctc_status === "stalled") {
  // Check VPS
  const vpsHealth = await call_tool(
    server: "vn-market", tool: "get_vps_service_health",
    arguments: {}
  );

  if (vpsHealth.status === "healthy") {
    // VPS OK - try manual trigger
    await call_tool(
      server: "vn-market", tool: "trigger_bctc_vps_fetch",
      arguments: {}
    );
  }
}
```

### Service Restart Cycle

```typescript
const cronHealth = await call_tool(
  server: "vn-market", tool: "get_cron_health",
  arguments: {}
);

if (cronHealth.any_stuck_jobs) {
  // Log the issue
  await call_tool(
    server: "vn-market", tool: "log_fix",
    arguments: {
      issue: "Scheduler job stuck in running state for >1hour",
      fix: "Docker container will auto-restart on next scheduled job trigger",
      severity: "high"
    }
  );

  // Send notification
  await call_tool(
    server: "vn-market", tool: "send_telegram",
    arguments: {
      message: `Stuck jobs detected. Services will restart on next cron cycle.`,
      channel: "work"
    }
  );
}
```

---

## Example Invocation

### Opening Sequence (Required)

```typescript
// Step 0: System health check
const systemStatus = await call_tool(
  server: "vn-market", tool: "get_system_status",
  arguments: {}
);

if (systemStatus.critical_errors?.length > 0) {
  // Log errors and exit - this is a blocking issue
  for (const error of systemStatus.critical_errors) {
    await call_tool(
      server: "vn-market", tool: "send_telegram",
      arguments: {
        message: `CRITICAL: ${error.service} - ${error.message}`,
        channel: "bug"
      }
    );
  }
  return;
}
```

### Daily Health Check

```typescript
// Comprehensive system diagnostic
const systemStatus = await call_tool(
  server: "vn-market", tool: "get_system_status",
  arguments: {}
);

const slaStatus = await call_tool(
  server: "vn-market", tool: "get_sla_status",
  arguments: {}
);

const pipelineHealth = await call_tool(
  server: "vn-market", tool: "get_pipeline_health",
  arguments: {}
);

const cronHealth = await call_tool(
  server: "vn-market", tool: "get_cron_health",
  arguments: {}
);

// Aggregate into report
const report = {
  db_status: systemStatus.db_status,
  sources_operational: systemStatus.sources.filter(s => s.status === "healthy").length,
  data_freshness: systemStatus.data_freshness,
  sla_compliance: slaStatus.compliance_pct,
  pipeline_latency: pipelineHealth.avg_latency_ms,
  stuck_jobs: cronHealth.stuck_job_count
};

// Send summary to work channel
await call_tool(
  server: "vn-market", tool: "send_telegram",
  arguments: {
    message: `Daily Health: ${report.db_status}, ${report.sources_operational} sources OK, ${report.sla_compliance}% SLA`,
    channel: "work"
  }
);
```

### Triggering Manual Data Fetch

```typescript
// When cowork agents request fresh data
const vpsHealth = await call_tool(
  server: "vn-market", tool: "get_vps_service_health",
  arguments: {}
);

if (vpsHealth.status === "healthy") {
  // Trigger BCTC fetch for specific tickers
  await call_tool(
    server: "vn-market", tool: "trigger_bctc_vps_fetch",
    arguments: {
      tickers: ["VCB", "ACB", "FPT"]
    }
  );

  // Trigger price update
  await call_tool(
    server: "vn-market", tool: "trigger_price_vps_fetch",
    arguments: {
      tickers: ["VCB", "ACB", "FPT"]
    }
  );

  // Wait for completion and notify
  await call_tool(
    server: "vn-market", tool: "send_telegram",
    arguments: {
      message: "Data refresh triggered for VCB, ACB, FPT",
      channel: "work"
    }
  );
}
```

### Service Restart

```typescript
// If a specific service is unresponsive
const pipelineHealth = await call_tool(
  server: "vn-market", tool: "get_pipeline_health",
  arguments: {}
);

if (pipelineHealth.price_status === "unhealthy") {
  // Attempt graceful restart
  await call_tool(
    server: "vn-market", tool: "restart_vps_service",
    arguments: {
      service: "price"
    }
  );

  // Log the action
  await call_tool(
    server: "vn-market", tool: "log_fix",
    arguments: {
      issue: "Price service unresponsive",
      fix: "Restarted price VPS service",
      severity: "high"
    }
  );
}
```

### Recent Fixes Review

```typescript
// Check if an issue was already fixed recently
const recentFixes = await call_tool(
  server: "vn-market", tool: "get_recent_fixes",
  arguments: { limit: 20 }
);

// Check if current error matches any recent fix
const alreadyFixed = recentFixes.fixes.some(fix =>
  fix.issue.includes("BCTC") && fix.timestamp > Date.now() - 24*3600*1000
);

if (alreadyFixed) {
  // Skip - already fixed within 24h
  return;
}
```

---

## VPS Connection Guide

See: `docs/{policies,protocols,standards,references}/reference_vps_setup.md`

## BCTC Extraction Runbook

See: `docs/protocols/bctc-extraction-runbook.md`

## Related Documentation

- **All Tools Index:** `.claude/tools/list/README.md`
- **MCP Logic:** `docs/standards/mcp-tools.md`
- **Alert Policy:** `docs/policies/alert-policy.md`
- **VPS Setup:** `docs/{policies,protocols,standards,references}/reference_vps_setup.md`
- **BCTC Runbook:** `docs/protocols/bctc-extraction-runbook.md`
- **PDF OCR Architecture:** `docs/{policies,protocols,standards,references}/reference_pdf_ocr_vps_architecture.md`
