
## c84 · 2026-08-08T07:36:56Z
### Audit Run Tier-1 (07:30–07:35 UTC 2026-08-08)
- Tier: 1 | Services: 13 checked | Health: 5 checked | Memory probes: 2 checked
- Anomalies: 1 new (C critical, W warn, I info) | 0 dedup-skipped
- Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-08T07:33:30Z ===

--- docker ps -a ---
NAMES                                             STATUS                  
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 40 hours (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 19 hours (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 9 days (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)
mcp-gateway                                       Up 3 weeks (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 3 weeks (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 weeks (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=3

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=34.08% MemUsage=1.022GiB / 3GiB
Container=vn-market-intelligence-mcp-rag-service-1 MemPerc=96.32% MemUsage=986.4MiB / 1GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — mcp-server baseline 34.08% < 85% investigate-gate
[A-30-PROBE-1] rag-service deep-probe — 96.32%
[A-30-PROBE-2] rag-service deep-probe — 96.32%
[A-30-PROBE-3] rag-service deep-probe — 96.32%
[A-30-PROBE-4] rag-service deep-probe — 96.32%
[A-30-PROBE-5] rag-service deep-probe — 96.32%
[A-30-PROBE-6] rag-service deep-probe — 96.32%
A-30 verdict: ESCALATE (all samples >93% with no reclamation dip)

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity
/dev/disk1s4s1   233Gi    13Gi    12Gi    54% (PASS)

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3
```

### Findings:
- A-01–A-11 container status: All 13 UP ✓
- A-12–A-20 health endpoints: All 5 OK ✓
- A-20 pdf-extractor: 3/3 probes PASS ✓
- A-30 mcp-server: 34.08% < 85% gate → PASS ✓
- **A-30 rag-service: 96.32% sustained, ESCALATE (loss of reclamation) → WARN** ⚠️
- A-32 disk: 54% < 85% → PASS ✓

### Signals Emitted:
- [emit-signal] OK dedup_key=microservice_degraded:rag-service:A-30-loss-of-reclamation id=sys-20260808T073615-7c33
- [emit-dashboard] OK id=sys-20260808T073615-7c33 check_id=A-30

### Audit Run Tier-1 (07:00–07:03 UTC 2026-08-08)
- Tier: 1 | Services: 13 checked | Health: 5 checked | Restarts: 1 checked
- Anomalies: 0 new (C critical, W warn, I info) | 0 dedup-skipped
- Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-08T07:03:25Z ===

--- docker ps -a ---
All 13 containers UP (healthy status)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=3

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=31.16% MemUsage=957.1MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 31.61% < 85% investigate-gate

--- disk df -h / ---
Capacity: 54% (PASS)

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3
```

### Findings:
- A-01–A-11 container status: All 13 UP ✓
- A-12–A-20 health endpoints: All 5 OK ✓
- A-20 pdf-extractor: 3/3 probes PASS ✓
- A-30 memory (mcp-server): 31.16% < 85% gate → PASS ✓
- A-32 disk: 54% < 85% → PASS ✓

## c82 · 2026-08-08T06:36:08Z

### Audit Run Tier-1 (06:30–06:34 UTC 2026-08-08)
- Tier: 1 | Services: 12 checked | Health: 5 checked | Restarts: 1 checked
- Anomalies: 0 new (C critical, W warn, I info) | 1 dedup-skipped
- Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-08T06:33:17Z ===

--- docker ps -a ---
All containers UP (healthy status)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- A-20 pdf-extractor multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

--- restart count ---
mcp-server RestartCount=3

--- memory pressure ---
mcp-server MemPerc=33.24%

--- disk ---
Capacity 54% (PASS)
```

### Findings:
- A-30 rag-service: 96.24% memory (SKIP-dedup, recurring since 2026-08-08T06:05:41Z)
- [emit-signal] SKIP-dedup signal_id=10496
- [emit-dashboard] OK id=10496 check_id=A-30

## c81 · 2026-08-08T06:25:27Z

### Audit Run Tier-2 (06:24–06:25 UTC 2026-08-08)
- Tier: 2 | Freshness sweep completed | Anomalies: 1 (WARN) | Status: DEGRADED
- Cron Fire Check (A-29): Some crons in various states (LATE=3, STALE=8, NEVER_FIRED=9, ON_TIME=69) — needs review
- Data Freshness: C-06 WARNING (0 market_messages in 3h during trading hours) | C-07 OK (18 signals/24h)
- VPS Proxy Health (B-06, B-07): All routes OK ✓
- BCTC Checks: B-09 (0 bad SSC URLs) ✓ | B-13 (0 stale >72h) ✓
- Rate Limits (B-14): Most sources ready (12/14 OK) ✓
- Pipeline: Healthy | Macro snapshot fresh | SLA all OK ✓
