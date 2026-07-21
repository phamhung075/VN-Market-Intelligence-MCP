# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c387 · 2026-07-21T03:43:02Z
### Audit Run Tier-1 (03:40–03:41 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked | Health: 5 probed
- A-01 to A-11 (container status): 12/12 UP, 1 unhealthy (pdf-extractor) [RAW-PROBE L2-16]
- A-12 (frontend health): CURL_ERR endpoint, dedup-skip (last_sent=2026-07-21T01:41:55Z)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — HTTP 000 event-loop wedge, dedup-skip (last_sent=2026-07-19T20:46:16Z)
- A-21 (restart count): mcp-server=2 PASS [RAW-PROBE L45]
- A-30 (memory): mcp-server=19.35% PASS [RAW-PROBE L48]
- A-32 (disk): 35% < 85% PASS [RAW-PROBE L52]
- Anomalies: 0 new | 2 dedup-skipped (A-12, A-20) | Status: DEGRADED

## c386 · 2026-07-21T03:12:16Z
### Audit Run Tier-1 (03:10–03:12 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked | Health: 5 probed
- A-01 to A-11 (container status): 12/12 UP, 1 unhealthy (pdf-extractor) [RAW-PROBE L2-16]
- A-11 (pdf-extractor health status): UNHEALTHY — event-loop stalled [RAW-PROBE L10], dedup-skip
- A-12 (frontend health): CURL_ERR endpoint, dedup-skip (last_sent=2026-07-21T01:41:55Z)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — HTTP 000 event-loop wedge [RAW-PROBE L88-91], dedup-skip (last_sent=2026-07-19T20:46:16Z)
- A-21 (restart count): mcp-server=2 PASS [RAW-PROBE L56]
- A-30 (memory): mcp-server=18.03% PASS [RAW-PROBE L62]
- A-32 (disk): 35% < 85% PASS [RAW-PROBE L68]
- Anomalies: 0 new | 2 dedup-skipped (A-12, A-20) | Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-21T03:10:36Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
mcp-gateway                                       Up 5 days (healthy)       mcpservergatway-gateway                         5 days ago
vn-market-intelligence-mcp-frontend-1             Up 5 days (healthy)       vn-market-intelligence-mcp-frontend             5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)       vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 5 days (healthy)       ghcr.io/flaresolverr/flaresolverr:latest        5 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 5 days (healthy)       vn-market-intelligence-mcp-news-fetch           5 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)      vn-market-intelligence-mcp-mcp-server           5 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 days (healthy)       vn-market-intelligence-mcp-rag-service          5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)       vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 30 hours (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)       vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 5 days (healthy)       vn-market-intelligence-mcp-alert-engine         5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)       vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    5 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ FAIL (HTTP CURL_ERR)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=18.03% MemUsage=554MiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  262M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```

[emit-signal] SKIP-dedup dedup_key=microservice_degraded:pdf-extractor:A-20 last_sent=2026-07-19T20:46:16Z id=sys-20260721T031138-141a
[emit-signal] SKIP-dedup dedup_key=microservice_degraded:frontend:A-12 last_sent=2026-07-21T01:41:55Z id=sys-20260721T031143-17f5

## d4-auto · 2026-07-21T03:00:01.291Z
D4 candidates: none

## c385 · 2026-07-21T02:40:41Z
### Audit Run Tier-1 (02:40–02:41 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked | Health: 5 probed
- A-01 to A-11 (container status): 12/12 UP, 1 unhealthy (pdf-extractor) [RAW-PROBE L2-16]
- A-11 (pdf-extractor health status): UNHEALTHY — event-loop stalled [RAW-PROBE L10], dedup-skip
- A-15 (pdf-extractor health endpoint): CURL_ERR — WARN NEW [RAW-PROBE L41]
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — HTTP 000 wedge [RAW-PROBE L88-91], dedup-skip
- A-21 (restart count): mcp-server=2 PASS [RAW-PROBE L56]
- A-30 (memory): mcp-server=16.89% PASS [RAW-PROBE L62]
- A-32 (disk): 35% < 85% PASS [RAW-PROBE L68]
- Anomalies: 1 new (A-15) | 2 dedup-skipped (A-11, A-20) | Status: DEGRADED

## c162 · 2026-07-21T02:32:42Z
### Audit Run Tier-2 (02:31–02:32 UTC 2026-07-21)
- Tier: 2 | Cron jobs: 70+ checked | Sources: 7 checked | VPS: 5 probed
- A-29 (cron fire gaps): PASS — all major jobs running, no gaps
- B-01 to B-07, B-11, B-12 (data freshness): PASS — prices, news, sbv, forex all fresh
- B-06 (VPS service health): WARN — vn-bctc-fetch unhealthy (NEW)
- B-09 (BCTC URLs): PASS — 0 SSC portal URLs in queue
- B-13 (stale pending BCTC): PASS — 0 rows >72h
- C-06, C-07 (DB spot checks): PASS — 4 messages 3h, 335 signals 24h
- Anomalies: 1 new (B-06 VPS health) | 0 dedup-skipped | Status: WARN

## c362 · 2026-07-21T02:12:03Z
### Audit Run Tier-1 (02:10–02:12 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked | Health: 5 probed
- A-01 to A-11 (container status): 12/12 UP (all deployed and healthy) [RAW-PROBE L4-16]
- A-12 (frontend health): OK — recovered from CURL_ERR [RAW-PROBE L45]
- A-12 (pdf-extractor health): CURL_ERR endpoint (known) [RAW-PROBE L41], dedup-skip
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — HTTP 000 event-loop stall [RAW-PROBE L55-58], dedup-skip
- A-21 (restart count): mcp-server=2 PASS [RAW-PROBE L47]
- A-30 (memory): mcp-server=16.08% PASS [RAW-PROBE L50-51]
- A-32 (disk): 35% < 85% PASS [RAW-PROBE L54]
- Anomalies: 0 new | 2 dedup-skipped (A-12, A-20) | Status: DEGRADED

## c361 · 2026-07-21T01:40:55Z
### Audit Run Tier-1 (01:40–01:41 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked | Health: 5 probed
- A-01 to A-11 (container status): 12/12 UP (all deployed and healthy)
- A-12 (frontend health): CURL_ERR endpoint — NEW WARN signal
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — HTTP 000 event-loop stall, dedup-skip
- A-21 (restart count): mcp-server=2 PASS
- Anomalies: 1 new (A-12 frontend) | 1 dedup-skipped (A-20) | Status: DEGRADED

## c360 · 2026-07-21T01:12:40Z
### Audit Run Tier-1 (01:10–01:12 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked | Health: 5 probed
- A-01 to A-11 (container status): 12/12 UP (all deployed and healthy)
- A-12 (pdf-extractor health): CURL_ERR — endpoint down
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — HTTP 000 event-loop stall, dedup-skip
- A-21 (restart count): mcp-server=1 PASS
- A-30 (memory): mcp-server=92.53% WARN, dedup-skip
- Anomalies: 0 new | 2 dedup-skipped (A-20, A-30) | Status: DEGRADED

## c848 · 2026-07-21T00:44:16Z
### Audit Run Tier-1 (00:42–00:44 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked | Health: 5 probed
- A-01 to A-11 (container status): 12/12 UP (all deployed and running)
- A-12 (api-gateway health): CURL_ERR — WARN, dedup-skip
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — HTTP 000 event-loop stall, dedup-skip
- A-21 (restart count): mcp-server=1 PASS
- Anomalies: 0 new | 3 dedup-skipped (A-12, A-20, A-30) | Status: DEGRADED
