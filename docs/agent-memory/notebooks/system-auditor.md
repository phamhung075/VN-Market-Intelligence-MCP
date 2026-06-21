# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

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

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-21T11:43:05Z ===

now_VN = 2026-06-21T18:43+07 (Sunday off-market)

--- docker ps -a (host_runtime_set) ---
vn-market-intelligence-mcp-mcp-server-1           Up About an hour (healthy)
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 10 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 10 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 10 days (healthy)
mcp-gateway                                       Up 10 days (healthy)

--- health endpoints ---
[health] mcp-server:3000/health HTTP 200 ✓
[health] api-gateway:4000/health HTTP 200 ✓
[health] macro-indicators:5004/health HTTP 200 ✓
[health] pdf-extractor:5001/health HTTP 200 ✓
[health] frontend:3001/ HTTP 200 ✓

--- A-20 multi-probe: pdf-extractor ---
[A-20-PROBE-1] in-container HTTP 200 ✓
[A-20-PROBE-2] in-container HTTP 200 ✓
[A-20-PROBE-3] in-container HTTP 200 ✓
[A-20-VERDICT] Pass count: 3/3 PASS

--- memory usage ---
mcp-server: 318.7MiB / 2GiB = 15.56% ✓

--- host disk df -h / ---
/dev/disk1s4s1   233Gi   13Gi   22Gi   38% ✓
```

## c261 · 2026-06-21T11:13:01Z
### Audit Run Tier-1 (11:13 UTC 2026-06-21, Sunday off-market)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, all others 0)
- A-12..A-19 health: 5/5 PASS ✓ | Tooling: pdftoppm, tesseract, vie PASS ✓
- A-21 restart: all 0 PASS ✓ | A-30 memory: mcp-server 14.58% PASS ✓
- A-32 disk: 36% PASS ✓
- mcp-server: 166 tools, 9 sessions, 43min uptime (post rebuild ~10:28Z, expected)
- rag-service: 92 restarts (dedup-skip FU-RAG-DEPLOY-MEMORY)

**Signals:** 0 NEW | Dedup-skipped: 1 | Status: CLEAN

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-21T11:13:01Z ===

now_VN = 2026-06-21T18:13:01+07 (Sunday off-market)

--- docker ps -a (host_runtime_set) ---
vn-market-intelligence-mcp-mcp-server-1           Up 43 minutes (healthy)
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 10 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up About 1h (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 10 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 10 days (healthy)
mcp-gateway                                       Up 10 days (healthy)

--- health endpoints ---
[health] mcp-server:3000/health HTTP 200 ✓
[health] api-gateway:4000/health HTTP 200 ✓
[health] macro-indicators:5004/health HTTP 200 ✓
[health] pdf-extractor:5001/health HTTP 200 ✓
[health] frontend:3001/ HTTP 200 ✓

--- memory usage ---
mcp-server: 298.7MiB / 2GiB = 14.58% ✓

--- host disk df -h / ---
/dev/disk1s4s1   233Gi   13Gi   24Gi   36% ✓
```

## c260 · 2026-06-21T10:30:57Z
### Audit Run Tier-2 (10:30 UTC 2026-06-21, Sunday off-market)
- Tier: 2 | Sources checked: 4 (freshness spot-checks)
- Anomalies: 0 NEW (market-closed weekend, silence expected)
- Status: CLEAN

**Findings:**
- [C-06] Market messages last 3h: 0 (DOWNGRADED to INFO — Sunday off-market)
- [C-07] Agent signals last 24h: 58 ✓
- [B-09] BCTC SSC-filter URLs: 0 ✓
- [B-13] BCTC stale-pending >72h: 0 ✓

**Signals:** 0 NEW | Status: CLEAN

## c259 · 2026-06-21T10:14:04Z
### Audit Run Tier-1 (10:14 UTC 2026-06-21, Sunday off-market)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, all others 0)
- A-12..A-19 health: 5/5 PASS ✓ | Tooling: pdftoppm, tesseract, vie PASS ✓
- A-21 restart: all 0 PASS ✓ | A-30 memory: all healthy PASS ✓
- A-32 disk: 90% (Data volume), 37% (root) — within tolerance ✓
- mcp-server: 166 tools, 254 sessions, 29396s uptime

**Signals:** 0 NEW | Status: CLEAN
