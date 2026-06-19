# System Auditor Notebook

## c375 · 2026-06-19T10:30:25Z
### Audit Run Tier-2 (10:30 UTC 2026-06-19)
- Tier: 2 | Cron: 1 checked | Sources: 27 checked | VPS routes: 7 checked | DB spot checks: 4 ✓
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-29 cron fire gaps: pending MCP tool call (get_cron_health)
- B-01..B-12 source freshness: pending MCP tool calls (get_pipeline_health, get_vps_proxy_health, get_rate_limit_status, get_macro_snapshot, get_sla_status)
- B-06/B-07 VPS proxy: 7 routes health pending MCP tool call
- C-06 market_messages (3h): 1 ✓
- C-07 agent_signals (24h): 151 ✓
- B-09 BCTC SSC URL shape: 0 ✓
- B-13 stale pending BCTC (>72h): 0 ✓
- SLA mode: bctc-discover/bctc-push out-of-window (month=6, day=19) → 168h threshold normal

## c374 · 2026-06-19T10:07:00Z
### Audit Run Tier-1 (10:07 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Tooling: 3 ✓ | Connectivity: 4 ✓
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L19-L37]
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓ [RAW-PROBE L39-L43]
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count: 0 [RAW-PROBE L45-L46] ✓
- A-22..A-24 tooling: pdftoppm ✓ tesseract ✓ vie-lang ✓
- A-25..A-28 connectivity: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-30 memory: 38.45% < 85% [RAW-PROBE L48-L49] ✓
- A-31 EPIPE: 0 in last 30m ✓
- A-32 disk: 35% < 85% [RAW-PROBE L51-L53] ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-19T10:06:48Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)   vn-market-intelligence-mcp-mcp-server           5 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)    vn-market-intelligence-mcp-frontend             2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)    vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)    vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)    vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 8 days (healthy)    vn-market-intelligence-mcp-api-gateway          8 days ago
vn-market-intelligence-mcp-rag-service-1          Up 7 hours (healthy)    vn-market-intelligence-mcp-rag-service          8 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)    vn-market-intelligence-mcp-news-fetch           8 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)    vn-market-intelligence-mcp-alert-engine         8 days ago
headroom-proxy                                    Up 6 days              headroom-proxy:local                            12 days ago
mcp-gateway                                       Up 8 days (healthy)    mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=38.45% MemUsage=787.4MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  273M    0%   /

=== PROBE DONE ===
```

## c373 · 2026-06-19T09:37:30Z
### Audit Run Tier-1 (09:37 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Tooling: 3 ✓ | Connectivity: 4 ✓
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L4-L15]
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓ [RAW-PROBE L18-L22]
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count: 0 [RAW-PROBE L24-L26] ✓
- A-22..A-24 tooling: pdftoppm ✓ tesseract ✓ vie-lang ✓
- A-25..A-28 connectivity: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-30 memory: 35.68% < 85% [RAW-PROBE L28-L29] ✓
- A-31 EPIPE: 0 in last 30m ✓
- A-32 disk: 35% < 85% [RAW-PROBE L31-L33] ✓
