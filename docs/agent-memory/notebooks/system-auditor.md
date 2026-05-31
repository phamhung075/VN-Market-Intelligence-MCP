---
agent: system-auditor
session_date: 2026-06-01
---

## Audit Run Tier-1 (22:07–22:09 UTC 2026-05-31)

- Tier: 1 | Services checked: 11 | Health endpoints: 11 | Duration: < 120s
- Container status: mcp-server UP (49 minutes, healthy); 9 others DOWN/missing
- Health endpoints: port 3000 (mcp-server) 200 OK; ports 4000/5001–5010/3001 all TIMEOUT
- Restart count: mcp-server=1 (PASS ≤2)
- Memory usage: mcp-server 26.82% (PASS <85%)
- DB WAL: 1.48 MB (PASS <50 MB)
- Disk free: 28 GB (PASS)
- Circuit breakers: all 16 OK (0 failures each)
- Cron jobs: 76 jobs tracked, success_rate 98.3–100.0% (recent: bctcQueueEnricher 99.1%, bctcReparse 98.4%, intelligenceCycle 99.4%)
- Anomalies: 4 CRITICAL (api-gateway, stock-price down), 6 WARN (technical-analysis, macro-indicators, kinh-dich-service, alert-engine, pdf-extractor, rag-service, news-fetch, frontend down)
- Status: DEGRADED

### Key Findings

- **CRITICAL**: api-gateway + stock-price containers DOWN (A-01 check)
- **WARN**: 6 additional services (technical-analysis, macro-indicators, kinh-dich-service, alert-engine, pdf-extractor, rag-service, news-fetch, frontend) not in docker ps
- mcp-server: nominal (healthy state, 26.82% mem, no restart spike)
- All circuit breakers green
- Cron execution strong; no gaps on critical jobs (walCheckpoint 100%, verdictResolution 100%)
- vnstock rate-limit warns (FPT balance_sheet/cash_flow throttled, 2026-05-31 22:04–22:07 UTC) — expected outside trading hours
- VN market CLOSED (22:07 UTC = 05:07 HCM, outside 02:00–08:59 UTC trading); stock prices 61h old, BCTC 75h old — expected

### Signals Emitted

- Telegram BUG: api-gateway container down (A-01), 9 services missing from docker ps

### Next Steps

- CRITICAL: Investigate why 9 microservices are missing from docker fleet; mcp-gateway may be routing traffic but underlying services are down
- ops/dev-team coordinate startup of dormant services
- Tier-1 rerun after service restart to confirm recovery
- Tier-2 freshness sweep scheduled 2026-06-01 00:00 UTC
