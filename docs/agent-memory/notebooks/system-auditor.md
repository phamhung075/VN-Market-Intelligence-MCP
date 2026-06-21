# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c266 · 2026-06-21T13:46:08Z
### Audit Run Tier-1 (13:46 UTC 2026-06-21, Sunday off-market)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, all stable)
- A-12..A-19 health: 5/5 PASS ✓ | A-20 pdf-extractor/multi: 3/3 PASS ✓
- A-21 restart: mcp-server=0 PASS ✓ | A-30 memory: mcp-server 24.45% PASS ✓
- A-32 disk: 37% (13Gi/233Gi used) PASS ✓
- mcp-server: ~3h uptime post-rebuild ~10:28Z, healthy
- rag-service: RestartCount=92 (known ceiling FU-RAG-DEPLOY-MEMORY, not OOMKilled)

**Signals:** 0 NEW | Dedup-skipped: 1 (rag-service 92 restarts tracked) | Status: CLEAN

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-21T13:43:13Z ===

--- docker ps -a ---
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)
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
headroom-proxy                                    Up 8 days
mcp-gateway                                       Up 10 days (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200) ✓
[health] api-gateway:4000/health OK (HTTP 200) ✓
[health] macro-indicators:5004/health OK (HTTP 200) ✓
[health] pdf-extractor:5001/health OK (HTTP 200) ✓
[health] frontend:3001/ OK (HTTP 200) ✓

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0 ✓

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=24.45% MemUsage=500.8MiB / 2GiB ✓

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity
/dev/disk1s4s1   233Gi    13Gi    23Gi    37% ✓
```

## c265 · 2026-06-21T13:13:01Z
### Audit Run Tier-1 (13:13 UTC 2026-06-21, Sunday off-market)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, all stable)
- A-12..A-19 health: 5/5 PASS ✓ | A-20 pdf-extractor/multi: 3/3 PASS ✓
- A-21 restart: mcp-server=0 PASS ✓ | A-30 memory: mcp-server 24.16% PASS ✓
- A-32 disk: 38% (13Gi/233Gi used) PASS ✓
- mcp-server: ~3h uptime post-rebuild ~10:28Z, healthy
- rag-service: RestartCount=92 (known ceiling FU-RAG-DEPLOY-MEMORY, not OOMKilled)

**Signals:** 0 NEW | Dedup-skipped: 1 (rag-service 92 restarts tracked) | Status: CLEAN

## c264 · 2026-06-21T12:43:03Z
### Audit Run Tier-1 (12:43 UTC 2026-06-21, Sunday off-market)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, all stable)
- A-12..A-19 health: 5/5 PASS ✓ | A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart: mcp-server=0 PASS ✓ | A-30 memory: mcp-server 21.65% PASS ✓
- A-32 disk: 38% PASS ✓
- mcp-server: ~2h uptime post-rebuild ~10:28Z, healthy

**Signals:** 0 NEW | Dedup-skipped: 1 (rag-service 92 restarts FU-RAG-DEPLOY-MEMORY) | Status: CLEAN
