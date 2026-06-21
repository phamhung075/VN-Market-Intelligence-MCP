# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c270 · 2026-06-21T15:14:20Z
### Audit Run Tier-1 (15:13 UTC 2026-06-21, Sunday off-market 22:13 VN)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, stable)
- A-12..A-19 health: 5/5 PASS ✓ | A-20 pdf-extractor/multi: 3/3 probes PASS ✓
- A-21 restart: mcp-server=0 PASS ✓ | A-30 memory: mcp-server 36.55% PASS ✓
- A-32 disk: 35% (13Gi/233Gi used) PASS ✓
- mcp-server: ~4.75h uptime, healthy (rebuilt ~10:28Z, 22:13 VN market-closed)

**Signals:** 0 NEW | Dedup-skipped: 0 | Status: CLEAN

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-21T15:13:12Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 10 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 5 hours (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 10 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 10 days (healthy)
mcp-gateway                                       Up 10 days (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=36.55% MemUsage=748.5MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%

--- A-20 pdf-extractor multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
→ pass_count=3/3 PASS
```


## c269 · 2026-06-21T14:43:01Z
### Audit Run Tier-1 (14:43 UTC 2026-06-21, Sunday off-market 21:43 VN)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, all stable)
- A-12..A-19 health: 5/5 PASS ✓ | A-20 pdf-extractor/multi: 3/3 probes PASS ✓
- A-21 restart: mcp-server=0 PASS ✓ | A-30 memory: mcp-server 34.67% PASS ✓
- A-32 disk: 37% (13Gi/233Gi used) PASS ✓
- mcp-server: ~4h uptime, healthy (rebuilt ~10:28Z)

**Signals:** 0 NEW | Dedup-skipped: 0 (rag-service restarts known/tracked) | Status: CLEAN

## c268 · 2026-06-21T14:31:41Z
### Audit Run Tier-2 (14:31 UTC 2026-06-21, Sunday off-market 21:31 VN)
- Tier: 2 | DB checks: 4 probed | BCTC queue: 2 verified
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**Verdict Summary:**
- C-06 market_messages (3h): 2 messages PASS ✓
- C-07 agent_signals (24h): 61 signals PASS ✓
- B-09 BCTC SSC URLs: 0 pending (no illegal URLs) PASS ✓
- B-13 BCTC stale >72h: 0 pending (known IDLE v CRASH, tracked) PASS ✓
- Weekend market-close: price/FX staleness downgraded to INFO per policy
- BCTC queue: 328 deferred_infra (non-actionable), 65 done, 36 url_not_found

**Signals:** 0 NEW | Dedup-skipped: 0 (all known issues pre-existing) | Status: CLEAN

