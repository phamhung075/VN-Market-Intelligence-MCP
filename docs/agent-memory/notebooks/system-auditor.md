# System Auditor — Tier-1 Notebook

## c90 · 2026-08-14T04:17:44Z

### Audit Run Tier-1 (04:15–04:20 UTC 2026-08-14, post-preflight)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 1 new (C=1 W=0 I=0) | Dedup-skipped: 0
- Status: CRITICAL

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-14T04:15:20Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 9 hours (healthy)    vn-market-intelligence-mcp-mcp-server           9 hours ago
vn-market-intelligence-mcp-news-fetch-1           Up 13 hours (healthy)   vn-market-intelligence-mcp-news-fetch           13 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 15 hours (healthy)   vn-market-intelligence-mcp-api-gateway          15 hours ago
vn-market-intelligence-mcp-alert-engine-1         Up 16 hours (healthy)   vn-market-intelligence-mcp-alert-engine         16 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 19 hours (healthy)   vn-market-intelligence-mcp-rag-service          42 hours ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=21.54% MemUsage=661.6MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 98.15% >= 85% investigate-gate — ENGAGE deep-probe
\{
  "verdict": "ESCALATE",
  "reason": "all samples >93% sustained high — loss of reclamation"
\}

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Findings:
- A-30 ESCALATE: rag-service sustained memory pressure >93% (median 98.15%, min 97.70% over 65s window). Signal: sys-20260814T041720-3a88

### Emit Actions:
```
[emit-signal] OK dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30:escalate-high-sustained id=sys-20260814T041720-3a88
```

## c89 · 2026-08-14T03:47:03Z

### Audit Run Tier-1 (03:44–03:48 UTC 2026-08-14, preflight FAILURE)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 1 new (C=1 W=0 I=0) | Dedup-skipped: 0
- Status: CRITICAL

