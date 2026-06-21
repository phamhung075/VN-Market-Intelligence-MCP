# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c256 · 2026-06-21T08:06:48Z
### Audit Run Tier-1 (08:06 UTC 2026-06-21, Sunday off-market)
- Tier: 1 | Services: 13 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all runtime checks PASS; stable)
- Status: HEALTHY

**Verdict Summary:**
- A-01..A-11 containers: all 13 UP ✓ (RestartCount=0 all) | A-12..A-19 health: 5/5 PASS ✓
- A-21 restart: 0 ✓ | A-30 memory: 41.9% mcp-server ✓ | A-32 disk: 36% ✓

**Signals:** 0 NEW | Status: CLEAN

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-21T08:06:48Z ===

now_VN = 2026-06-21T15:06:52 (Sunday, off-market)

--- docker ps (host_runtime_set) ---
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 53 min (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 10 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 10 days (healthy)
+ 2 auxiliary (headroom-proxy, mcp-gateway)

--- container restart counts ---
mcp-server: RestartCount=0
pdf-extractor: RestartCount=0
stock-price: RestartCount=0
technical-analysis: RestartCount=0
alert-engine: RestartCount=0
(all checked: 0 restarts)

--- health endpoints (localhost curl -sf) ---
[health] mcp-server:3000/health HTTP 200 ✓
[health] stock-price:5000/health HTTP 200 ✓
[health] technical-analysis:5003/health HTTP 200 ✓
[health] alert-engine:5006/health HTTP 200 ✓
[health] pdf-extractor:5001/health HTTP 200 ✓

--- memory usage ---
mcp-server: 838.4MiB / 2GiB = 41.9%
rag-service: 589.6MiB / 768MiB = 76.7%
(healthy, high-mem rag-service = expected cold-embedding load)

--- host disk df -h / ---
/dev/disk1s4s1   233Gi   13Gi   24Gi   36% (PASS: <80%)
```

## c255 · 2026-06-21T07:36:51Z
### Audit Run Tier-1 (07:36 UTC 2026-06-21, Sunday off-market)
- Tier: 1 | Services: 13 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all runtime checks PASS; stable)
- Status: HEALTHY

**Verdict Summary:**
- A-01..A-11 containers: all 13 UP ✓ | A-12..A-19 health: 5/5 PASS ✓
- A-21 restart: 0 ✓ | A-30 memory: 36.12% ✓ | A-32 disk: 36% ✓

**Signals:** 0 NEW | Status: CLEAN
