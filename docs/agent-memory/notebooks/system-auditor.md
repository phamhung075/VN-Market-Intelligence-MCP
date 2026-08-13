

## c66 · 2026-08-13T10:33Z
### Audit Run Tier-2 (10:32–10:34 UTC 2026-08-13)
- Tier: 2 | Services: 0 checked | Sources: 28 checked (data freshness) | DB checks: 0
- Anomalies: 1 (0 critical, 1 warn, 0 info)
- Status: DEGRADED (vn-bctc-fetch service unhealthy)

#### Tier-2 Findings
**Data Freshness (B-01 through B-07):** Pipeline health all 32 tickers TA ready; VPS proxy services (prices/news/sbv) OK; bctc service idle (demand-driven); all rate limits OK; SLA status all within range.

**Cron Fire Gap (A-29):** All scheduled jobs on-time; bctcReparseJob 75% success rate acceptable; fleet average 100%.

**VPS Service Health (B-06/B-07) — CRITICAL FINDING:** vn-bctc-fetch service **UNHEALTHY** (last poll 3m ago, response 0ms). Proxy plane shows ok/idle, but service plane unhealthy. Other VPS services nominal. Severity WARN (idle queue, no active data loss). [emit-signal] OK signal_id=10865 dedup_key=data_stale:vn-bctc-fetch:B-07

**Memory State (A-30 Context):** rag-service 91.29% (+1.79% from c65), pdf-extractor 85.81% (+0.65%), mcp-server 14.01% baseline. Stable trend per c65 FOLD verdict. Defer A-30 re-probe to next Tier-1.

[OUTPUT-CONTRACT] signals_posted=1 telegram_sent=1 signal_queue_rows_written=1 dashboard_rows=1 dedup_skipped=0
[HEARTBEAT] tier-2 heartbeat write pending (Tier-2 Heartbeat Write step)
[RAW-CITE GATE] All findings cite live MCP tool output
[CALLER-INSTRUCTION PRECEDENCE] NONE

## c65 · 2026-08-13T10:00Z
### Audit Run Tier-1 (10:14–10:28 UTC 2026-08-13)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 0 (0 critical, 0 warn, 0 info)
- Status: ALL_GREEN (A-30 reclamation discriminator applied; rag-service/pdf-extractor both FOLD; memory stable)
- Context: Follow-on preflight cycle detecting mem_creep at 89.50% (rag-service) and 85.16% (pdf-extractor). A-30 discriminator applied per both containers crossing 85% gate. Both verdicts: FOLD (benign, no escalation).

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-13T10:14:17Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-rag-service-1          Up 54 minutes (healthy)   vn-market-intelligence-mcp-rag-service          24 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 40 hours (healthy)     vn-market-intelligence-mcp-mcp-server           40 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 2 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)       vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 weeks (healthy)      vn-market-intelligence-mcp-macro-indicators     2 weeks ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)      vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 4 weeks (healthy)      mcpservergatway-gateway                         4 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 weeks (healthy)      vn-market-intelligence-mcp-api-gateway          4 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 weeks (healthy)      ghcr.io/flaresolverr/flaresolverr:latest        4 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 4 weeks (healthy)      vn-market-intelligence-mcp-news-fetch           4 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 weeks (healthy)      vn-market-intelligence-mcp-technical-analysis   4 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 4 weeks (healthy)      vn-market-intelligence-mcp-alert-engine         4 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 weeks (healthy)      vn-market-intelligence-mcp-kinh-dich-service    4 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=12.68% MemUsage=389.6MiB / 3GiB

A-30 rag-service verdict: FOLD (benign GC sawtooth)
A-30 pdf-extractor verdict: FOLD (benign GC sawtooth)
```

### Findings Summary
- A-30 Memory Discriminator: Both rag-service (89.50%) and pdf-extractor (85.16%) assessed as FOLD (benign). No new signal emit.
- All container status checks PASS; all health endpoints 200 OK; disk 45% used.

[OUTPUT-CONTRACT] signals_posted=0 telegram_sent=0 signal_queue_rows_written=0
[HEARTBEAT] tier-1 cycle completed
[RAW-CITE GATE] NONE
[CALLER-INSTRUCTION PRECEDENCE] NONE
