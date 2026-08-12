## c55 · 2026-08-12T10:03:36Z

### Audit Run Tier-1 (10:03–10:05 UTC 2026-08-12)

- Tier: 1 | Services: 13 checked, all UP | Health endpoints: all OK
- Findings: 0 new (1 dedup-skipped A-30 WARN) | Status: DEGRADED
- A-30: rag-service sustained >93% memory, loss of reclamation (dedup-skipped from 2026-08-09T04:11:10Z)
- A-30: pdf-extractor 87.06% deep-probe FOLD verdict (benign GC, stable)

### RAW-PROBE:

```
=== AUDITOR PROBE 2026-08-12T10:03:36Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 16 hours (healthy)     vn-market-intelligence-mcp-mcp-server           16 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 33 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-rag-service-1          Up 33 minutes (healthy)   vn-market-intelligence-mcp-rag-service          4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)       vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 13 days (healthy)      vn-market-intelligence-mcp-macro-indicators     13 days ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)      vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 3 weeks (healthy)      mcpservergatway-gateway                         3 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)      vn-market-intelligence-mcp-api-gateway          3 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)      ghcr.io/flaresolverr/flaresolverr:latest        3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)      vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)      vn-market-intelligence-mcp-technical-analysis   3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 3 weeks (healthy)      vn-market-intelligence-mcp-alert-engine         3 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 weeks (healthy)      vn-market-intelligence-mcp-kinh-dich-service    3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=11.88% MemUsage=365MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 11.88% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-pdf-extractor-1: baseline 87.06% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 95.30% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.47% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 2.80% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 10.89% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.94% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 5.02% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 10.15% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.74% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.07% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.17% < 85% investigate-gate

pdf-extractor A-30: verdict=FOLD, reason="benign GC sawtooth or below tripwire"
rag-service A-30: verdict=ESCALATE, reason="all samples >93% sustained high — loss of reclamation"
  - Container image 2026-08-08T08:11:41Z predates LanceDB fix (commit 4c8c601e6, merged 2026-08-12T08:16:02+02:00)
  - STALE-ACK (FU-RAG-DEPLOY-MEMORY) no longer holds; fix in source but not yet deployed

--- disk df -h / ---
/dev/disk1s4s1: 233Gi total, 13Gi used, 13Gi avail, 51% capacity

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Audit Findings

**Container Status (A-01–A-11):** PASS — all host_runtime_set services UP and healthy.

**Health Endpoints (A-12–A-19):** PASS — all monitored endpoints return HTTP 200.

**Restart Count (A-21):** PASS — mcp-server RestartCount=0, no recent unhandled crashes.

**A-20 pdf-extractor Multi-Probe:** PASS — 3/3 in-container HTTP probes returned 200.

**Memory Pressure (A-30):** 
- mcp-server (11.88%): PASS (<85% gate, no probe)
- pdf-extractor (87.06%): **FOLD** — deep-probe stable, min=max=median=87.06%, vmhwm pinned at cap but not advancing, no reclamation loss, no escalation criteria met
- rag-service (95.32%): **ESCALATE to WARN** — all 6 probes sustained >93%, loss of reclamation pattern detected; no OOMKilled, no state changes, but container image predates LanceDB fix (deployed 2026-08-12T08:16:02+02:00, image created 2026-08-08T08:11:41Z) — fix in source but not yet deployed via rebuild
- All others <85%: PASS

**Disk Space (A-32):** PASS — / at 51% capacity.

### Signals & Findings

[emit-signal] SKIP-dedup dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30 last_sent=2026-08-09T04:11:10Z id=sys-20260812T100604-517d

### Audit Summary

- Fire-election: claimed (cron:auditor-t1:2026-08-12T10:00Z)
- Signals posted: 0 (dedup-skipped A-30 rag-service — last sent 2026-08-09T04:11:10Z, within 7d window)
- Dashboard rows: 0 (no new WARN/CRITICAL)
- Status: DEGRADED (rag-service sustained high memory — container image outdated, LanceDB fix deployed to source but not yet to running container)
- Note: rag-service restarted 33min before this cycle. Memory remains elevated at 95.32% sustained; container image created 2026-08-08 predates LanceDB fix merged 2026-08-12 08:16. Root cause: rebuild/redeploy not yet completed. Requires ops dispatch to rebuild+deploy fixed image.

---
