# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c516 · 2026-07-03T04:16:21Z
### Audit Run Tier-1 (04:15–04:16 UTC 2026-07-03)
- Tier: 1 | Fire-election: ROUTER-HELD (skip claim/release per coordination)
- Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- A-21: RestartCount=4 (baseline, known) | A-30: 98.47% memory (WARN, sawtooth pattern baseline)
- A-32: 46% disk (PASS) | Crons: 96+ jobs all healthy (99.4%-100% success rates)
- Anomalies: 0 new (no NEW signals) | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-03T04:15:39Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 7 hours (healthy)     33fea3bafe16                                    30 hours ago
vn-market-intelligence-mcp-frontend-1             Up 37 hours (healthy)    74bfe1c5b392                                    37 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 43 hours (healthy)    vn-market-intelligence-mcp-technical-analysis   43 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)      vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)      vn-market-intelligence-mcp-macro-indicators     3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 days (healthy)      vn-market-intelligence-mcp-api-gateway          4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)      vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 2 minutes (healthy)   vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)      vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)      vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 7 days                headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 7 days (healthy)      mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=4

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=98.47% MemUsage=1.969GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    16Gi    46%    393k  169M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c515 · 2026-07-03T03:47:12Z
### Audit Run Tier-1 (03:46–03:47 UTC 2026-07-03)
- Tier: 1 | Fire-election: ROUTER-HELD (skip claim/release per coordination)
- Services: 13/13 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- A-21: RestartCount=4 (baseline, known) | A-30: 89.89% memory (WARN, sawtooth improving)
- A-32: 46% disk (PASS) | Crons: 96 jobs all healthy (99-100% success rates)
- Anomalies: 0 new (no NEW signals) | Status: HEALTHY

## c514 · 2026-07-03T02:53:29Z
### Audit Run Tier-1 (02:52–02:52 UTC 2026-07-03)
- Tier: 1 | Fire-election: ROUTER-HELD (skip claim/release per coordination)
- Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- A-21: RestartCount=4 (baseline, known) | A-30: 93.79% memory (WARN, known sawtooth)
- A-32: 46% disk (PASS) | Crons: 96+ jobs all healthy (99-100% success rate)
- Anomalies: 0 new (known baselines only) | Status: HEALTHY

## c513 · 2026-07-03T02:41:56Z
### Audit Run Tier-2 (02:41–02:41 UTC 2026-07-03)
- Tier: 2 | Fire-election: ROUTER-HELD (skip claim/release)
- Cron fire check: 96+ jobs all healthy (100% success rates)
- Per-source freshness: 1 CRITICAL (B-05 bctc-discover, 390h stale, earnings window 24h SLA)
- VPS routes: 4/5 healthy (vn-bctc-fetch UNHEALTHY, 16d uptime, no recent push)
- DB freshness spot checks: C-06/C-07/B-09/B-13 all PASS (market_messages 3, agent_signals 155, SSC URLs 0, stale pending 0)
- BCTC eval: 12 red + 9 yellow reports (snapshot held, no baseline to detect deltas)
- Improvement proposals: None from shadow/worsened in last 24h
- Anomalies: 1 new (1 CRITICAL bctc-discover stale during earnings window)
- Status: CRITICAL
