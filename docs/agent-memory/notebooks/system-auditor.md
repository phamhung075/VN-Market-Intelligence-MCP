---
agent_id: system-auditor
session_date: 2026-06-13
audit_tier: 1
last_clean: 2026-06-13T01:39:58Z
---

## c306 · 2026-06-13T01:39:58Z
### Audit Run Tier-1 (01:39–01:40 UTC 2026-06-13)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (10m), api-gateway (41h), frontend (10h), macro-indicators (2d), mcp-gateway (2d), pdf-extractor (34h), stock-price (2d), technical-analysis (2d), kinh-dich-service (44h), alert-engine (2d), rag-service (2h), news-fetch (2d) ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: not run in Tier-1 ✓
- A-21 restart count: 0 ≤ 2 ✓
- A-30 memory: MemPerc=29.84% < 85% ✓
- A-32 disk: 44% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-13T01:39:54Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 10 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           10 minutes ago
vn-market-intelligence-mcp-frontend-1             Up 10 hours (healthy)     vn-market-intelligence-mcp-frontend             10 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 41 hours (healthy)     vn-market-intelligence-mcp-api-gateway          41 hours ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 44 hours (healthy)     vn-market-intelligence-mcp-kinh-dich-service    44 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)      vn-market-intelligence-mcp-rag-service          2 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 2 days (healthy)       vn-market-intelligence-mcp-news-fetch           2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)       vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 2 days (healthy)       vn-market-intelligence-mcp-alert-engine         2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)       vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 34 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor        2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)       vn-market-intelligence-mcp-macro-indicators     5 days ago
headroom-proxy                                    Up 4 hours                headroom-proxy:local                            6 days ago
mcp-gateway                                       Up 2 days (healthy)       mcpservergatway-gateway                         3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=29.84% MemUsage=611.1MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    17Gi    44%    393k  182M    0%   /

=== PROBE DONE ===
```

## c305 · 2026-06-13T01:10:19Z
### Audit Run Tier-1 (01:09–01:10 UTC 2026-06-13)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (2h), api-gateway (41h), frontend (10h), macro-indicators (2d), mcp-gateway (2d), pdf-extractor (33h), stock-price (2d), technical-analysis (2d), kinh-dich-service (43h), alert-engine (2d), rag-service (1h), news-fetch (2d) ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: 3/3 (200, 200, 200) ✓
- A-21 restart count: 0 ≤ 2 ✓
- A-30 memory: MemPerc=15.66% < 85% ✓
- A-32 disk: 41% < 85% ✓

## c304 · 2026-06-13T00:40:34Z
### Audit Run Tier-1 (00:39–00:40 UTC 2026-06-13)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (1h), api-gateway (40h), frontend (9h), macro-indicators (2d), mcp-gateway (2d), pdf-extractor (33h), stock-price (2d), technical-analysis (2d), kinh-dich-service (43h), alert-engine (2d), rag-service (43m), news-fetch (2d) ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: 3/3 (200, 200, 200) ✓
- A-21 restart count: 0 ≤ 2 ✓
- A-30 memory: MemPerc=16.47% < 85% ✓
- A-32 disk: 40% < 85% ✓

## c303 · 2026-06-13T00:32:23Z
### Audit Run Tier-3 (00:30–00:32 UTC 2026-06-13 → Saturday morning)
- Tier: 3 | Services: 12 checked | DB checks: C-01..C-16 + A-22..A-31 | Tooling: pdftoppm, tesseract, vie ✓
- Anomalies: 2 new (1 CRITICAL, 1 WARN) | Dedup: 0 skipped
- Status: DEGRADED
- C-08 orphaned alerts (24h): 103 CRITICAL — cross-table consistency breach
- C-16 stale pending BCTC (>72h): 26 WARN — processing backlog in queue
