# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

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

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-21T12:43:09Z ===

--- docker ps -a ---
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 10 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 10 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 10 days (healthy)
mcp-gateway                                       Up 10 days (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200) ✓
[health] api-gateway:4000/health OK (HTTP 200) ✓
[health] macro-indicators:5004/health OK (HTTP 200) ✓
[health] pdf-extractor:5001/health OK (HTTP 200) ✓
[health] frontend:3001/ OK (HTTP 200) ✓

--- A-20 multi-probe: pdf-extractor ---
[A-20-PROBE-1] in-container HTTP 200 ✓
[A-20-PROBE-2] in-container HTTP 200 ✓
[A-20-PROBE-3] in-container HTTP 200 ✓
[A-20-VERDICT] Pass count: 3/3 PASS

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0 ✓

--- memory pressure ---
mcp-server: MemPerc=21.65% MemUsage=443.4MiB / 2GiB ✓

--- host disk df -h / ---
/dev/disk1s4s1   233Gi    13Gi    22Gi    38% ✓
```

## c263 · 2026-06-21T12:14:06Z
### Audit Run Tier-1 (12:14 UTC 2026-06-21, Sunday off-market)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, rag-service=92 skipped)
- A-12..A-19 health: 5/5 PASS ✓ | A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart: all healthy PASS ✓ | A-30 memory: mcp-server 21.50% PASS ✓
- A-32 disk: 36% PASS ✓
- mcp-server: ~2h uptime post-rebuild, healthy

**Signals:** 0 NEW | Dedup-skipped: 1 (rag-service 92 restarts FU-RAG-DEPLOY-MEMORY) | Status: CLEAN

## c262 · 2026-06-21T11:43:36Z
### Audit Run Tier-1 (11:43 UTC 2026-06-21, Sunday off-market)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, all others stable)
- A-12..A-19 health: 5/5 PASS ✓ | A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart: all 0 PASS ✓ | A-30 memory: mcp-server 15.56% PASS ✓
- A-32 disk: 38% PASS ✓
- mcp-server: ~1h uptime post-rebuild, healthy

**Signals:** 0 NEW | Dedup-skipped: 1 (rag-service restart ceiling) | Status: CLEAN
