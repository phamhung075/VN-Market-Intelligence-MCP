## c534 · 2026-07-03T18:38:35Z
### Audit Run Tier-2 (18:37–18:40 UTC 2026-07-03)
- Tier: 2 | Cron checks: 100+ jobs | Sources: 28 | Freshness: checked
- Anomalies: 1 new WARN (BCTC stale B-05) | Status: DEGRADED
- Findings: B-05 bctc-discover BREACHED (age 635min > SLA 607min, 36 queue items)

## c533 · 2026-07-03T18:18:56Z
### Audit Run Tier-1 (18:18–18:19 UTC 2026-07-03)
- Tier: 1 | Services: 13/13 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- A-21: RestartCount=0 (mcp-server normal) | A-30: 70.52% memory (healthy) | A-32: 47% disk (PASS)
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-03T18:18:36Z ===

--- docker ps -a ---
NAMES                                             STATUS                        IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 14 hours (healthy)         vn-market-intelligence-mcp-mcp-server           14 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)           74bfe1c5b392                                    2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)           vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)           vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)           vn-market-intelligence-mcp-macro-indicators     3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)           vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)           vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)           vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up About a minute (healthy)   vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)           vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)           vn-mark
