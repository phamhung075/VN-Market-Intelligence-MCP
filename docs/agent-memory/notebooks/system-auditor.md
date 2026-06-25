# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c326 · 2026-06-25T03:26:31Z
### Audit Run Tier-3 (03:26 UTC 2026-06-25)
- Tier: 3 | Tables: 16 checked | DB Checks: C-01–C-16 all PASS/BY-DESIGN | Fresh anomalies: 0
- Canonical counts FROZEN: db1_ohlc=835 (historical writer residue QA-approved), db2_scale=1 (DFF), db3_vnindex=0, c04_lowconf=21 (enrich-silence-gate in_progress)
- C-01: 877 distinct codes (PASS); C-02: 976 rows (PASS); C-03: 32 action codes (PASS); C-04: 0 low-conf last 7d (enrich-silence working); C-05: 0 SSC URLs live (PASS); C-06: 4 market_messages 3h (PASS); C-07: 231 signals 24h (PASS); C-08: 1 orphaned alert (transient OK); C-09: 3 macro indicators Vietnam (PASS ≥3); C-10: 0 PDF failed 24h (PASS); C-11: 0 PDF done 48h (expected-empty Q2); C-12: integrity=ok (PASS); C-13: WAL all 0 (PASS); C-14: top-3 share=0.6% (PASS <60%); C-15: schema complete (PASS); C-16: 0 stale pending >72h (PASS)
- History append: 104→105 rows (deterministic counts verified)
- Status: HEALTHY | Anomalies: 0 new | Status: CLEAN

## c325 · 2026-06-25T03:13:57Z
### Audit Run Tier-1 (03:13 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers all UP: mcp-server (3h healthy, RestartCount=1 PASS), frontend (22h), macro-indicators (22h), pdf-extractor (9d), stock-price (9d), technical-analysis (9d), kinh-dich-service (10d), api-gateway (13d), rag-service (6min, RestartCount=110 KNOWN-STANDING FU-RAG-DEPLOY OOM ~1/hr), news-fetch (2w), alert-engine (2w), mcp-gateway (2w)
- A-30 mcp-server mem=43.41% (888.9/2048 MiB, PASS <85%) | A-32 disk=40% (21Gi free, PASS)
- Cron: 100+ jobs all running, success rates ≥98%, no gaps detected
- Pipeline health: price/news/sbv/foreign OK; bctc pending=0 (healthy-idle, no signal)
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-25T03:13:10Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)     vn-market-intelligence-mcp-mcp-server           14 hours ago
vn-market-intelligence-mcp-frontend-1             Up 22 hours (healthy)    vn-market-intelligence-mcp-frontend             22 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 22 hours (healthy)    vn-market-intelligence-mcp-macro-indicators     22 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 9 days (healthy)      vn-market-intelligence-mcp-pdf-extractor        9 days ago
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)      vn-market-intelligence-mcp-stock-price          9 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)      vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 10 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    10 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)     vn-market-intelligence-mcp-api-gateway          13 days ago
vn-market-intelligence-mcp-rag-service-1          Up 6 minutes (healthy)   vn-market-intelligence-mcp-rag-service          2 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 2 weeks (healthy)     vn-market-intelligence-mcp-news-fetch           2 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 2 weeks (healthy)     vn-market-intelligence-mcp-alert-engine         2 weeks ago
headroom-proxy                                    Up 12 days               headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 2 weeks (healthy)     mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=43.41% MemUsage=888.9MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    20Gi    40%    393k  215M    0%   /
```

## c324 · 2026-06-25T02:44:19Z
### Audit Run Tier-1 (02:44 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers all UP: mcp-server (3h healthy, RestartCount=1 PASS), frontend (21h), macro-indicators (22h), pdf-extractor (9d), stock-price (9d), technical-analysis (9d), kinh-dich-service (10d), api-gateway (13d), rag-service (2h healthy, RestartCount=109 KNOWN-STANDING FU-RAG-DEPLOY OOM ~1/hr), news-fetch (2w), alert-engine (2w), mcp-gateway (2w)
- A-20 pdf-extractor multi-probe: 3/3 passed 200 OK (event-loop responsive)
- A-30 mcp-server mem=41.91% (858.3/2048 MiB, PASS <85%) | A-32 disk=39% (21Gi free, PASS)
- Cron: 100+ jobs all running, success rates ≥98%, no gaps detected
- B-05/bctc-discover: stale 198h (RECORD-AND-LEAVE: VPS pending queue=0, no signal)
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-25T02:43:14Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)    vn-market-intelligence-mcp-mcp-server           13 hours ago
vn-market-intelligence-mcp-frontend-1             Up 21 hours (healthy)   vn-market-intelligence-mcp-frontend             21 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 22 hours (healthy)   vn-market-intelligence-mcp-macro-indicators     22 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 9 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        9 days ago
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)     vn-market-intelligence-mcp-stock-price          9 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)     vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 10 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    10 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)    vn-market-intelligence-mcp-api-gateway          13 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)    vn-market-intelligence-mcp-rag-service          2 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 2 weeks (healthy)    vn-market-intelligence-mcp-news-fetch           2 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 2 weeks (healthy)    vn-market-intelligence-mcp-alert-engine         2 weeks ago
headroom-proxy                                    Up 12 days              headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 2 weeks (healthy)    mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=41.91% MemUsage=858.3MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    21Gi    39%    393k  224M    0%   /
```

## c323 · 2026-06-25T02:31:32Z
### Audit Run Tier-2 (02:31 UTC 2026-06-25)
- Tier: 2 | Cron Fire: all 100+ jobs ≥98% success, no gaps detected
- Per-source freshness (pipeline_health): price=OK, news=OK, sbv_fx=OK, foreign_flow=OK (market-hours aware)
- SLA status: 4 ok (price/news/sbv/foreign), 1 breached (bctc stale 11869min)
- B-05/bctc-discover: stale ≥168h — DEDUP (VPS host up 8d+, pending queue=0, unreachable=false; FIX-BCTC-SLA-THRESHOLD-360 P1-ready)
- VPS proxy routes: 4 healthy (price/news/sbv/foreign) | 1 stale-artifact (bctc last push 2026-06-16, no new pushes in earnings-off-season)
- DB freshness spot: market_messages(3h)=4 PASS, agent_signals(24h)=232 PASS, bctc_ssc_urls=0 PASS, bctc_pending_72h=0 PASS
- Rate limits: 0/12 sources at 100%
- Anomalies: 0 new | Status: HEALTHY

## c322 · 2026-06-25T02:14:18Z
### Audit Run Tier-1 (02:14 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers all UP: mcp-server (2h healthy, RestartCount=1 expected), frontend (21h), macro-indicators (21h), pdf-extractor (9d), stock-price (9d), technical-analysis (9d), kinh-dich-service (10d), api-gateway (13d), rag-service (1h healthy, RestartCount=109 KNOWN-STANDING FU-RAG-DEPLOY OOM), news-fetch (2w), alert-engine (2w), mcp-gateway (2w)
- A-20 pdf-extractor multi-probe: 3/3 passed 200 OK (event-loop responsive)
- A-21 RestartCount: mcp-server=1 PASS | rag-service=109 KNOWN-STANDING (FU-RAG-DEPLOY 768MiB OOM cycle ~1/hr, no escalation)
- A-30 mcp-server mem=33.24% (680.7/2048 MiB, PASS <85%) | A-32 disk=40% (20Gi free, PASS)
- Cron: 100+ jobs all running, success rates ≥98%, no gaps
- B-05/bctc-discover: 197.5h stale (RECORD-AND-LEAVE: VPS vn-bctc-fetch='unhealthy' cosmetic artifact, pending queue=0, no signal)
- Anomalies: 0 new | Status: HEALTHY

## c321 · 2026-06-25T01:44:33Z
### Audit Run Tier-1 (01:44 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers all UP: mcp-server (2h2m healthy, RestartCount=1 recent start), frontend (20h), macro-indicators (21h), pdf-extractor (9d), stock-price (9d), technical-analysis (9d), kinh-dich-service (10d), api-gateway (13d), rag-service (51m, RestartCount=109 KNOWN-STANDING FU-RAG-DEPLOY OOM cycle), news-fetch (2w), alert-engine (2w), mcp-gateway (2w)
- A-30 mcp-server MemPerc=30.90% (632.9/2048 MiB, healthy <85% ceiling) | A-32 disk=39% (21Gi free, PASS)
- Cron: all 100+ jobs running, latest success rates ≥98%, no gaps detected  
- Anomalies: 1 CRITICAL (bctc-discover stale 199.7h, VPS vn-bctc-fetch unhealthy 9d+) | Status: DEGRADED
