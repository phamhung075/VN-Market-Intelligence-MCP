# Tool Package — Ops

**Location:** `.claude/tools/package/ops.md`
**Load when:** Agent starts, before first MCP call
**Last Updated:** 2026-05-05

## How to Invoke Tools

All VN Market MCP tools are accessed via the `mcp__claude_ai_gateway__call_tool` gateway:

```
mcp__claude_ai_gateway__call_tool(tool_name="<tool_name>", input={...})
```

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
const health = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_vps_service_health",
  input={}
);

if (health.status === "unreachable") {
  // Check proxy tunnel
  const proxyHealth = await mcp__claude_ai_gateway__call_tool(
    tool_name="get_vps_proxy_health",
    input={}
  );

  if (proxyHealth.tunnel_status === "disconnected") {
    // Tunnel down - report to user
    await mcp__claude_ai_gateway__call_tool(
      tool_name="send_telegram",
      input={
        message: "VPS proxy tunnel disconnected. Manual SSH reconnect required.",
        channel: "bug"
      }
    );
  }
}
```

### BCTC Pipeline Stalled

```typescript
const pipeline = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_pipeline_health",
  input={}
);

if (pipeline.bctc_status === "stalled") {
  // Check VPS
  const vpsHealth = await mcp__claude_ai_gateway__call_tool(
    tool_name="get_vps_service_health",
    input={}
  );

  if (vpsHealth.status === "healthy") {
    // VPS OK - try manual trigger
    await mcp__claude_ai_gateway__call_tool(
      tool_name="trigger_bctc_vps_fetch",
      input={}
    );
  }
}
```

### Service Restart Cycle

```typescript
const cronHealth = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_cron_health",
  input={}
);

if (cronHealth.any_stuck_jobs) {
  // Log the issue
  await mcp__claude_ai_gateway__call_tool(
    tool_name="log_fix",
    input={
      issue: "Scheduler job stuck in running state for >1hour",
      fix: "Docker container will auto-restart on next scheduled job trigger",
      severity: "high"
    }
  );

  // Send notification
  await mcp__claude_ai_gateway__call_tool(
    tool_name="send_telegram",
    input={
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
const systemStatus = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_system_status",
  input={}
);

if (systemStatus.critical_errors?.length > 0) {
  // Log errors and exit - this is a blocking issue
  for (const error of systemStatus.critical_errors) {
    await mcp__claude_ai_gateway__call_tool(
      tool_name="send_telegram",
      input={
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
const systemStatus = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_system_status",
  input={}
);

const slaStatus = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_sla_status",
  input={}
);

const pipelineHealth = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_pipeline_health",
  input={}
);

const cronHealth = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_cron_health",
  input={}
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
await mcp__claude_ai_gateway__call_tool(
  tool_name="send_telegram",
  input={
    message: `Daily Health: ${report.db_status}, ${report.sources_operational} sources OK, ${report.sla_compliance}% SLA`,
    channel: "work"
  }
);
```

### Triggering Manual Data Fetch

```typescript
// When cowork agents request fresh data
const vpsHealth = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_vps_service_health",
  input={}
);

if (vpsHealth.status === "healthy") {
  // Trigger BCTC fetch for specific tickers
  await mcp__claude_ai_gateway__call_tool(
    tool_name="trigger_bctc_vps_fetch",
    input={
      tickers: ["VCB", "ACB", "FPT"]
    }
  );

  // Trigger price update
  await mcp__claude_ai_gateway__call_tool(
    tool_name="trigger_price_vps_fetch",
    input={
      tickers: ["VCB", "ACB", "FPT"]
    }
  );

  // Wait for completion and notify
  await mcp__claude_ai_gateway__call_tool(
    tool_name="send_telegram",
    input={
      message: "Data refresh triggered for VCB, ACB, FPT",
      channel: "work"
    }
  );
}
```

### Service Restart

```typescript
// If a specific service is unresponsive
const pipelineHealth = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_pipeline_health",
  input={}
);

if (pipelineHealth.price_status === "unhealthy") {
  // Attempt graceful restart
  await mcp__claude_ai_gateway__call_tool(
    tool_name="restart_vps_service",
    input={
      service: "price"
    }
  );

  // Log the action
  await mcp__claude_ai_gateway__call_tool(
    tool_name="log_fix",
    input={
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
const recentFixes = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_recent_fixes",
  input={ limit: 20 }
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

See: `.claude/knowledge/reference_vps_setup.md`

## BCTC Extraction Runbook

See: `.claude/knowledge/bctc-extraction-runbook.md`

## Related Documentation

- **All Tools Index:** `.claude/tools/list/README.md`
- **MCP Logic:** `.claude/knowledge/mcp-tools.md`
- **Alert Policy:** `.claude/knowledge/alert-policy.md`
- **VPS Setup:** `.claude/knowledge/reference_vps_setup.md`
- **BCTC Runbook:** `.claude/knowledge/bctc-extraction-runbook.md`
- **PDF OCR Architecture:** `.claude/knowledge/reference_pdf_ocr_vps_architecture.md`
