# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c328 · 2026-06-25T04:14:28Z
### Audit Run Tier-1 (04:13–04:14 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers all UP: mcp-server (4h, RestartCount=1 PASS), frontend (23h), macro-indicators (23h), pdf-extractor (9d), stock-price (9d), technical-analysis (9d), kinh-dich-service (10d), api-gateway (13d), rag-service (7min, RestartCount=114 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY), news-fetch (2w), alert-engine (2w), mcp-gateway (2w)
- A-20 pdf-extractor multi-probe: 3/3 passed 200 OK (event-loop responsive)
- A-30 mcp-server mem=56.65% (1.133GiB/2GiB, PASS <85%) | A-32 disk=38% (22Gi free, PASS)
- Cron: 100+ jobs running, success rates ≥98%, no gaps detected
- B-05 bctc-discover: push-age=199.7h vs out-of-window threshold≈1714.5h; queue not stale; PASS
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-25T04:13:17Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)     vn-market-intelligence-mcp-mcp-server           15 hours ago
vn-market-intelligence-mcp-frontend-1             Up 23 hours (healthy)    vn-market-intelligence-mcp-frontend             23 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 23 hours (healthy)    vn-market-intelligence-mcp-macro-indicators     23 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 9 days (healthy)      vn-market-intelligence-mcp-pdf-extractor        9 days ago
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)      vn-market-intelligence-mcp-stock-price          9 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)      vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 10 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    10 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)     vn-market-intelligence-mcp-api-gateway          13 days ago
vn-market-intelligence-mcp-rag-service-1          Up 7 minutes (healthy)   vn-market-intelligence-mcp-rag-service          2 weeks ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=56.65% MemUsage=1.133GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    22Gi    38%    393k  233M    0%   /
```

## c327 · 2026-06-25T03:44:49Z
### Audit Run Tier-1 (03:43–03:44 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers all UP: mcp-server (4h healthy, RestartCount=1 PASS), frontend (22h), macro-indicators (23h), pdf-extractor (9d), stock-price (9d), technical-analysis (9d), kinh-dich-service (10d), api-gateway (13d), rag-service (3min healthy, RestartCount=112 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY OOMKilled=false), news-fetch (2w), alert-engine (2w), mcp-gateway (2w)
- A-20 pdf-extractor multi-probe: 3/3 passed 200 OK (event-loop responsive, healthy)
- A-30 mcp-server mem=44.62% (913.8/2048 MiB, PASS <85%) | A-32 disk=40% (20Gi free, PASS)
- Cron: 100+ jobs running, success rates ≥98%, no gaps detected
- B-05/bctc-discover: push-age=199h vs dynamic threshold (out-of-window)=1000.5h; queue=38 (not idle); PASS (not stale)
- Anomalies: 0 new | Status: HEALTHY

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
