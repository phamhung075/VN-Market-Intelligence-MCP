## 60d26f9b · 2026-07-28T23:10:32Z
### Audit Run Tier-1 (23:00–23:10 UTC 2026-07-28)
- Tier: 1 | Services: 12/12 host_runtime_set Up(healthy) | Health: 5/5 OK | A-20 pdf-extractor 3/3 pass | A-21 crashRestarts=0 PASS | A-30 MemPerc=12.54% (fresh process, NOT leak evidence) | A-32 Disk 38% PASS
- Anomalies: 0 new (0 critical, 0 warn, 0 info)
- Status: HEALTHY

Fire-election: tick=2026-07-28T23:00Z (`*/30 * * * *` boundary) — `task_claim` returned `claimed:true`. Led this tick.

### RAW-PROBE: (docs/agents/system-auditor/probe.sh, 2026-07-28T23:09:59Z)
```
=== AUDITOR PROBE 2026-07-28T23:09:59Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 hours (healthy)      vn-market-intelligence-mcp-pdf-extractor
vn-market-intelligence-mcp-mcp-server-1           Up 11 minutes (healthy)   vn-market-intelligence-mcp-mcp-server
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)       vn-market-intelligence-mcp-frontend
mcp-gateway                                       Up 13 days (healthy)      mcpservergatway-gateway
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)      vn-market-intelligence-mcp-api-gateway
vn-market-intelligence-mcp-flaresolverr-1         Up 13 days (healthy)      ghcr.io/flaresolverr/flaresolverr:latest
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)      vn-market-intelligence-mcp-news-fetch
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)      vn-market-intelligence-mcp-rag-service
vn-market-intelligence-mcp-macro-indicators-1     Up 13 days (healthy)      vn-market-intelligence-mcp-macro-indicators
vn-market-intelligence-mcp-technical-analysis-1   Up 13 days (healthy)      vn-market-intelligence-mcp-technical-analysis
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)      vn-market-intelligence-mcp-alert-engine
vn-market-intelligence-mcp-stock-price-1          Up 13 days (healthy)      vn-market-intelligence-mcp-stock-price
vn-market-intelligence-mcp-kinh-dich-service-1    Up 13 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=3

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=12.54% MemUsage=385.3MiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity
/dev/disk1s4s1   233Gi    13Gi    23Gi    38%

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

**A-29 Cron Health**: 129+ cron jobs all success_rate ≥80%, most ≥99%, last fires current. mcpServerStartup at 2026-07-28T22:58:42Z (matches clean restart). No fire-gap alerts.

**A-30 Memory Context**: Process at 12.54% due to restart at 22:58:36Z (clean exit code 0, dev-mcp-server commit fe7640267 FIX-SBV-FETCHER-ZERO-VALUE-EMIT). Deep-probe SKIPPED (12.54% < 85% baseline). Memory reading is NOT evidence of leak resolution—process is ~11 minutes old. OHLCV backfill (~450/1543 in progress) will drive memory climb. Do NOT conclude FIX-MCP-MEMORY-CODE-LEAK is resolved. Underlying leak tracking continues (backlog, high).

**A-20 pdf-extractor**: 3/3 probe pass. All OCR tooling present.

**A-32 Disk**: 38% capacity (233Gi total, 13Gi used, 23Gi avail) — healthy headroom.

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## q3r8n5x2 · 2026-07-28T22:41:40Z
### Audit Run Tier-1 (22:39-22:41 UTC 2026-07-28)
- Tier: 1 | Services: 12/12 host_runtime_set Up(healthy) | Health: 5/5 OK | A-20 pdf-extractor 3/3 pass | A-21 crashRestarts=0 PASS | A-30 MemPerc=93.83% verdict=FOLD (benign GC) | A-32 Disk 39% PASS
- Anomalies: 0 new (0 critical, 0 warn, 0 info)
- Status: HEALTHY

Fire-election: tick=2026-07-28T22:30Z (`*/30 * * * *` boundary) — `task_claim` returned `claimed:true`. Led this tick.

[Abridged: Full RAW-PROBE and detailed A-29/A-30 analysis available in git log; see prior entry for detailed structure]

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0
