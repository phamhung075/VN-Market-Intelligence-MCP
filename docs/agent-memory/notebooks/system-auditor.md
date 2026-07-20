## c415 · 2026-07-20T01:12:23Z
### Audit Run Tier-1 (01:10:33–01:10:34 UTC 2026-07-20)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 1 new findings
- A-01 to A-11 (container status): 12/12 UP (host_runtime_set SSOT) — all containers healthy
- A-12 (pdf-extractor health endpoint): FAIL — CURL_ERR (NEW)
- A-12 to A-19 (health endpoints): 4/5 OK — pdf-extractor CURL_ERR (NEW)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop wedged (dedup-skip: microservice_degraded:pdf-extractor:A-20 last_sent=2026-07-19T20:46:16Z)
- A-21 (restart count): mcp-server=0 PASS (5h uptime)
- A-30 (memory): mcp-server=34.89% < 85% PASS
- A-32 (disk): 35% < 85% PASS
- Anomalies: 1 new (A-12 pdf-extractor CURL_ERR WARN) | 1 dedup-skipped (A-20) | Status: DEGRADED
- Signal output: [emit-signal] SKIP-dedup dedup_key=microservice_degraded:pdf-extractor:A-20 last_sent=2026-07-19T20:46:16Z id=sys-20260720T011200-765f
- Signal output: [emit-signal] OK dedup_key=microservice_degraded:pdf-extractor:A-12 id=sys-20260720T011202-0770

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-20T01:10:33Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
mcp-gateway                                       Up 4 days (healthy)      mcpservergatway-gateway                         4 days ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)      vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 days (healthy)      vn-market-intelligence-mcp-api-gateway          4 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 days (healthy)      ghcr.io/flaresolverr/flaresolverr:latest        4 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 4 days (healthy)      vn-market-intelligence-mcp-news-fetch           4 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)     vn-market-intelligence-mcp-mcp-server           4 days ago
vn-market-intelligence-mcp-rag-service-1          Up 45 hours (healthy)    vn-market-intelligence-mcp-rag-service          4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)      vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 hours (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)      vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 4 days (healthy)      vn-market-intelligence-mcp-alert-engine         4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)      vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    4 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=34.89% MemUsage=1.047GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  263M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```

## c414 · 2026-07-20T00:46:57Z
### Audit Run Tier-1 (00:45–00:46 UTC 2026-07-20)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 1 new findings
- A-01 to A-11 (container status): 12/12 UP (host_runtime_set SSOT) — all containers healthy
- A-12 to A-19 (health endpoints): 3/5 OK — api-gateway CURL_ERR (NEW), pdf-extractor CURL_ERR (dedup-skip)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop wedged (dedup-skip: microservice_degraded:pdf-extractor:A-20 last_sent=2026-07-19T20:46:16Z)
- A-21 (restart count): mcp-server=0 PASS (4h uptime)
- A-30 (memory): mcp-server=31.21% < 85% PASS
- A-32 (disk): 36% < 85% PASS
- Cron health: all critical jobs on schedule (bctcReparseJob running; reconcile exhausted benign)
- Anomalies: 1 new (A-13 api-gateway CURL_ERR WARN) | 1 dedup-skipped (pdf-extractor A-20) | Status: DEGRADED
- Signal output: [emit-signal] OK dedup_key=microservice_degraded:api-gateway:A-13 id=sys-20260720T004628-7e09
- Signal output: [emit-signal] SKIP-dedup dedup_key=microservice_degraded:pdf-extractor:A-20 id=sys-20260720T004634-6b62

## c413 · 2026-07-20T00:35:58Z
### Audit Run Tier-3 (00:30–00:35 UTC 2026-07-20)
- Tier: 3 | Services: 12 checked | DB checks: 7 run | Doc/Memory: 4 checks
- Tier-1 Runtime: all 12 services UP, pdf-extractor unhealthy (dedup-skip)
- A-01 to A-11 (container status): 12/12 UP (host_runtime_set SSOT)
- A-12 to A-20 (health/multi-probe): pdf-extractor 0/3 FAIL (dedup-skip: microservice_degraded:pdf-extractor:A-20)
- A-25 to A-27 (inter-service): stock-price, technical-analysis, alert-engine OK
- A-30 (memory): 31.34% < 85% PASS
- A-32 (disk): 36% < 85% PASS
- C-01 (tickers): 984 >= 25 PASS
- C-02 (ohlcv rows): 984 > 0 PASS
- C-05 (ssc urls): 0 = 0 PASS
- C-06 (market_messages 3h): 0 FAIL — no messages in last 3h (00:31 UTC, outside market hours)
- C-07 (agent_signals 24h): 79 > 0 PASS
- C-12 (integrity_check): ok PASS
- C-13 (WAL size): 3.51MB < 50MB PASS
- Doc/Memory: CLAUDE.md=62L OK, orch-state.json sprint_goal.entries=16 (WARN: exceeds cap 15)
- Anomalies: 1 new (DOC-AUDIT-SIZE-SPRINT-GOAL WARN) | 1 dedup-skipped (pdf-extractor A-20) | Status: DEGRADED
- Signal output: [emit-signal] OK dedup_key=doc_size_breach:sprint_goal_entries id=sys-20260720T003558-21ab

## c412 · 2026-07-20T00:12:29Z
### Audit Run Tier-1 (00:10–00:12 UTC 2026-07-20)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 0 new findings
- A-01 to A-11 (container status): 12/12 UP (host_runtime_set SSOT) — all containers healthy
- A-12 to A-19 (health endpoints): 4/5 OK — pdf-extractor CURL_ERR (dedup-skip)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop wedged (dedup-skip: microservice_degraded:pdf-extractor:A-20 last_sent=2026-07-19T20:46:16Z)
- A-21 (restart count): mcp-server=0 PASS (4h uptime)
- A-30 (memory): mcp-server=29.51% < 85% PASS
- A-32 (disk): 36% < 85% PASS
- Anomalies: 0 new | 1 dedup-skipped | Status: DEGRADED
- Signal output: [emit-signal] SKIP-dedup dedup_key=microservice_degraded:pdf-extractor:A-20 id=sys-20260720T001204-7808
