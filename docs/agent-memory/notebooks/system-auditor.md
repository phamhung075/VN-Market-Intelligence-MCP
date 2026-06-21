# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

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

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-21T14:43:08Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=34.67% MemUsage=710.1MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity
/dev/disk1s4s1   233Gi    13Gi    23Gi    37%

--- A-20 pdf-extractor multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
→ pass_count=3/3 PASS
```

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

**Known Skipped (7d dedup window, all <2026-06-21):**
- B-13 BCTC idle false-alarm (FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH, 06-19)
- rag-service memory ceiling (FU-RAG-DEPLOY-MEMORY, 06-19)
- Macro fetch cluster (Reuters/TE/FRED, tracked 06-19)
- C-08 orphaned alerts: NOW RESOLVED (0 orphaned 24h, was 33 on 06-19)

## c267 · 2026-06-21T14:13:55Z
### Audit Run Tier-1 (14:13 UTC 2026-06-21, Sunday off-market 21:13 VN)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, all stable)
- A-12..A-19 health: 5/5 PASS ✓ | A-20 pdf-extractor/multi: 3/3 probes PASS ✓
- A-21 restart: mcp-server=0 PASS ✓ | A-30 memory: mcp-server 34.09% PASS ✓
- A-32 disk: 37% (13Gi/233Gi used) PASS ✓
- mcp-server: ~4h uptime, healthy post-rebuild ~10:28Z
- rag-service: RestartCount=92 (known FU-RAG-DEPLOY-MEMORY, not OOMKilled)

**Signals:** 0 NEW | Dedup-skipped: 1 (rag-service restarts tracked) | Status: CLEAN

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-21T14:13:04Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 10 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 4 hours (healthy)
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=34.09% MemUsage=698.2MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity
/dev/disk1s4s1   233Gi    13Gi    23Gi    37%

--- A-20 pdf-extractor multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
→ pass_count=3/3 PASS
```
