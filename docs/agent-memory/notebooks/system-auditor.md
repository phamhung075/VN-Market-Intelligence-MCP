# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c369 · 2026-06-23T11:44:36Z
### Audit Run Tier-1 (11:44 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 1 WARN (rag-service RestartCount=100) | Status: DEGRADED
- Evidence: All 12 services UP+healthy. A-21 ANOMALY: **rag-service RestartCount=100** (vs mcp-server=1, others=0) — significantly elevated restart pattern. Health endpoints all 200. A-20 pdf-extractor multi-probe 3/3 PASS. Inter-service connectivity OK. A-31 EPIPE 0/30m PASS. Memory 63.55% PASS. Disk 36% PASS.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-23T11:43:12Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 16 hours (healthy)   vn-market-intelligence-mcp-mcp-server           34 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 10 hours (healthy)   vn-market-intelligence-mcp-rag-service          12 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1
rag-service RestartCount=100 ← ANOMALY (A-21 WARN)

--- memory pressure ---
MemPerc=63.55% MemUsage=1.271GiB / 2GiB

--- A-31 EPIPE Crash Check (30m) ---
0

--- disk df -h / ---
Capacity: 36%

=== PROBE DONE ===
```

## c368 · 2026-06-23T11:14:36Z
### Audit Run Tier-1 (11:14 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy. Health endpoints all 200. A-20 pdf-extractor 3/3 PASS. Inter-service OK. EPIPE 0/30m. Memory 61.81%. Disk 36%.

## c366 · 2026-06-23T10:31:40Z
### Audit Run Tier-2 (10:31 UTC 2026-06-23)
- Tier: 2 | Sources: 25+ checked | Market: CLOSED
- Anomalies: 0 new | Status: HEALTHY
- Macro_Indicators: 22.3h old (threshold 24h) | VPS routes 5/5 polled
- Known-standing: vps-bctc ~3d unhealthy, rag-service OOM-loop observed
