---
name: trigger_bctc_vps_fetch
type: tool
package: ops-infrastructure
related_tools: get_vps_service_health, get_bctc_full
complexity: complex
---

# trigger_bctc_vps_fetch

Manually triggers a **BCTC PDF fetch run on Vinahost VPS** for diagnosis and recovery. Returns queue state with verbose diagnostics (which tickers pending, attempts, source URL cache status). **Use dry_run=true to inspect without SSH trigger.** Use tickers filter to debug specific stock's BCTC pipeline.

Architecture: MCP server → SSH trigger → VPS fetch job → `/app/data/pdfs/` → bctcReparseJob extraction.

## Arguments

- **dry_run** (boolean) — optional, default: false
  - If true, inspect queue without triggering SSH. Returns proposed queue state.

- **tickers** (array) — optional
  - Filter to specific stocks (e.g., ["FPT", "VNM"]). If omitted, process all pending.

- **force_all** (boolean) — optional, default: false
  - If true, re-fetch all tickers in watchlist (not just pending). Useful for recovery.

## Return Type

```typescript
{
  success: boolean,
  queue_state: {
    queued: number,      // Tickers waiting for fetch
    attempted: number,   // Total fetch attempts this run
    success: number,     // Successfully fetched
    failed: Array<{
      ticker: string,
      reason: string,    // "404 not found", "timeout", "invalid PDF", etc.
      last_attempt: string
    }>,
    cached_urls: number  // Q1/Q2/Q3/Q4 URLs cached from prior runs
  },
  diagnostics: {
    vps_reachable: boolean,
    disk_free_gb: number,
    last_fetch_time: string,
    fetch_duration_seconds: number
  },
  log_tail: string,  // Last 20 lines of VPS fetch log
  timestamp: string
}
```

## Example Usage

### Ops — Daily BCTC Health Check
```typescript
// At cycle start, verify BCTC pipeline health
const health = await call_tool("vn-market", "trigger_bctc_vps_fetch", {
  dry_run: true,  // Inspect without triggering SSH
  tickers: null
});

console.log(`BCTC queue: ${health.queue_state.queued} pending, ${health.queue_state.success} success`);

if (health.queue_state.failed.length > 0) {
  console.log("⚠️ Failed tickers:");
  for (const failed of health.queue_state.failed.slice(0, 5)) {
    console.log(`  ${failed.ticker}: ${failed.reason}`);
  }
}

// If too many failures, trigger actual fetch to retry
if (health.queue_state.failed.length > 3) {
  const trigger = await call_tool("vn-market", "trigger_bctc_vps_fetch", {
    dry_run: false,  // Actually trigger SSH
    force_all: false  // Retry only failed tickers
  });

  console.log(`Fetch triggered. Success: ${trigger.queue_state.success}/${trigger.queue_state.attempted}`);
}
```

### Ops — Specific Ticker Recovery
```typescript
// Financial Analyst reports: "FPT BCTC not updating"
// Ops diagnoses and retries:

const singleTicker = await call_tool("vn-market", "trigger_bctc_vps_fetch", {
  dry_run: true,
  tickers: ["FPT"]
});

console.log(`FPT queue state:`, singleTicker.queue_state);

if (singleTicker.queue_state.failed.some(f => f.ticker === "FPT")) {
  console.log(`FPT fetch failing. Reason: ${singleTicker.queue_state.failed[0].reason}`);

  // Possible causes:
  // 1. VSD deleted the filing (rare)
  // 2. PDF format changed (update parser)
  // 3. Network timeout (retry)

  // Retry with full fetch:
  const retry = await call_tool("vn-market", "trigger_bctc_vps_fetch", {
    dry_run: false,
    tickers: ["FPT"],
    force_all: true  // Force fresh fetch
  });

  if (retry.queue_state.success > 0) {
    console.log("✅ FPT recovered");
    await call_tool("vn-market", "submit_feedback", {
      agent: "ops",
      title: "FPT BCTC recovery successful",
      category: "bug",
      detail: "Recovered FPT Q1 2026 report via VPS retry. Initial failure reason: ${reason}",
      to: "@dev"
    });
  }
}
```

### QA — Pipeline Validation
```typescript
// After code changes to PDF extraction, validate pipeline health
const preChange = await call_tool("vn-market", "trigger_bctc_vps_fetch", {
  dry_run: true
});

const preSuccessRate = preChange.queue_state.success / preChange.queue_state.attempted;

// Deploy extraction changes...

const postChange = await call_tool("vn-market", "trigger_bctc_vps_fetch", {
  dry_run: true
});

const postSuccessRate = postChange.queue_state.success / postChange.queue_state.attempted;

console.log(`Success rate: ${(preSuccessRate * 100).toFixed(1)}% → ${(postSuccessRate * 100).toFixed(1)}%`);

if (postSuccessRate < preSuccessRate - 0.05) {
  // Regression detected (>5% drop)
  console.log("❌ REGRESSION: Success rate dropped. Rollback or investigate.");
  process.exit(1);
}
```

### Ops — Disk Space Monitoring
```typescript
// Monitor VPS disk to prevent storage exhaustion
const health = await call_tool("vn-market", "trigger_bctc_vps_fetch", {
  dry_run: true
});

console.log(`VPS disk free: ${health.diagnostics.disk_free_gb} GB`);

if (health.diagnostics.disk_free_gb < 5) {
  console.log("⚠️ DISK SPACE LOW: < 5GB remaining");

  // Alert team to clean up old PDFs (> 90 days)
  await call_tool("vn-market", "submit_feedback", {
    agent: "ops",
    title: "VPS disk space critical (< 5GB remaining)",
    category: "alert_quality",
    detail: `Disk free: ${health.diagnostics.disk_free_gb} GB. May need to purge PDFs older than 90 days from /app/data/pdfs/.`,
    priority: "high",
    to: "@ops"
  });
}
```

## When to Use

- **Daily ops check** — Verify BCTC queue health with dry_run=true
- **Incident response** — Specific ticker failing? Debug with tickers filter
- **Recovery** — Retry failed tickers after fixing root cause
- **QA validation** — Pre/post extraction code changes
- **Disk monitoring** — Catch space issues before they block fetches
- **NOT real-time** — BCTC updates on daily schedule; check 1x per day

## Related Tools

| Tool | Use Case |
|------|----------|
| `get_vps_service_health` | Check VPS reachability before triggering fetch |
| `get_bctc_full` | Downstream: fetch extracted BCTC data after PDF lands |
| `submit_feedback` | Report fetch failures or disk issues to team |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `vps_reachable: false` | VPS unreachable or SSH auth failed | Check VPS status; restart container |
| `failed: many` | Multiple tickers failing | Check VPS logs; may indicate PDF format change |
| `disk_free_gb < 1` | Storage exhausted | Clean up old PDFs or expand volume |
| `fetch_duration > 600s` | Fetch timeout | Check VPS network; may be rate-limited |

## Notes

- **Dry-run first:** Always use `dry_run: true` to inspect before SSH trigger. Zero cost, full diagnostics.
- **Force-all rare:** Use `force_all: true` only for recovery. Normal operation retries failed tickers automatically.
- **Cache persistence:** Cached URLs reduce re-parsing; don't clear cache unless URLs changed.
- **Disk space:** Monitor `/app/data/pdfs/` size. Consider auto-purge of PDFs > 90 days old.
- **SSH key:** VPS SSH auth via key in `~/.ssh/vps-vinahost`. Ensure key exists before calling.

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — arguments, 4 workflow examples, dry-run pattern, recovery, QA validation)
