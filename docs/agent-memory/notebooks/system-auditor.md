# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c258 · 2026-06-21T09:43:58Z
### Audit Run Tier-1 (09:43 UTC 2026-06-21, Sunday off-market)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, all others 0)
- A-12..A-19 health: 5/5 PASS ✓ | A-20 pdf-extractor: 3/3 multi-probe PASS ✓
- A-21 restart: all 0 PASS ✓ | A-30 memory: mcp-server 43.74% PASS ✓
- A-32 disk: 36% PASS ✓
- mcp-server: 166 tools, 223 sessions, 27623s uptime

**Signals:** 0 NEW | Status: CLEAN

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-21T09:43:03Z ===

now_VN = 2026-06-21T16:43:03 (Sunday, market closed)

--- docker ps -a (host_runtime_set) ---
vn-market-intelligence-mcp-mcp-server-1           Up 8 hours (healthy)
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 10 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 9 min (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 10 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 10 days (healthy)
mcp-gateway                                       Up 10 days (healthy)

--- restart counts ---
mcp-server: 0, frontend: 0, pdf-extractor: 0, stock-price: 0
technical-analysis: 0, macro-indicators: 0, kinh-dich-service: 0
api-gateway: 0, rag-service: 0, news-fetch: 0, alert-engine: 0

--- health endpoints ---
[health] mcp-server:3000/health HTTP 200 ✓
[health] api-gateway:4000/health HTTP 200 ✓
[health] macro-indicators:5004/health HTTP 200 ✓
[health] pdf-extractor:5001/health HTTP 200 ✓
[health] frontend:3001/ HTTP 200 ✓

--- A-20 pdf-extractor multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
Result: 3/3 PASS ✓

--- memory usage ---
mcp-server: 895.8MiB / 2GiB = 43.74% ✓

--- host disk df -h / ---
/dev/disk1s4s1   233Gi   13Gi   24Gi   36% ✓
```

## c257 · 2026-06-21T09:14:53Z
### Audit Run Tier-1 (09:14 UTC 2026-06-21, Sunday off-market)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (rag-service A-21/A-30 dedup-skip: reported 2026-06-19, triaged by PO)
- Status: CLEAN

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server/pdf/stock/ta/alert/news=0; rag-service=90 KNOWN)
- A-12..A-19 health: 5/5 PASS ✓ | A-20 pdf-extractor: 3/3 multi-probe PASS ✓
- A-21 restart: rag-service 90 (WARN, dedup 2026-06-19); others=0 PASS
- A-30 memory: rag-service 93.74% (WARN, dedup 2026-06-19, known ceiling); mcp-server 46.43% PASS
- A-32 disk: 38% PASS
- mcp-server: 166 tools, 216 sessions, 25877s uptime

**Signals:** 0 NEW | Dedup-skipped: 2 (rag-service prior report) | Status: CLEAN
