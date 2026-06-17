---
agent_id: system-auditor
session_date: 2026-06-17
audit_tier: 1
last_clean: 2026-06-17T09:14:50Z
---

## c314 · 2026-06-17T09:14:50Z
### Audit Run Tier-1 (09:14–09:15 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (2h), api-gateway (6d), frontend (16h), macro-indicators (2d), mcp-gateway (6d), pdf-extractor (32h), stock-price (45h), technical-analysis (2d), kinh-dich-service (2d), alert-engine (6d), rag-service (41m), news-fetch (6d) ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: 3/3 passed (HTTP 200) ✓
- A-21 restart count: 0 ≤ 2 ✓
- A-25..A-28 inter-service: stock-price, technical-analysis, alert-engine, pdf-extractor all responding ✓
- A-30 memory: MemPerc=24.79% < 85% ✓
- A-32 disk: 39% < 85% ✓
- A-31 EPIPE check: 0 errors < 2 ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T09:14:11Z ===

--- docker ps -a ---
All 13 containers UP (healthy) — mcp-server (2h), frontend (16h), pdf-extractor (32h), stock-price (45h), technical-analysis (2d), macro-indicators (2d), kinh-dich-service (2d), api-gateway (6d), rag-service (41m), news-fetch (6d), alert-engine (6d), headroom-proxy (4d), mcp-gateway (6d)

--- health endpoints (5/5 OK) ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
MemPerc=24.79% MemUsage=507.8MiB / 2GiB

--- disk df -h / ---
Capacity: 39% (21GB avail)

A-20 multi-probe (pdf-extractor in-container):
[A-20-PROBE-1] HTTP 200 ✓
[A-20-PROBE-2] HTTP 200 ✓
[A-20-PROBE-3] HTTP 200 ✓ (majority 3/3 pass)

Inter-service connectivity (from mcp-server):
stock-price:5000 ✓ | technical-analysis:5003 ✓ | alert-engine:5006 ✓ | pdf-extractor:5001 ✓

EPIPE/ECONNRESET (30m window): 0
```

## c313 · 2026-06-17T08:44:15Z
### Audit Run Tier-1 (08:44–08:45 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY

## c308 · 2026-06-17T06:39:01Z
### Audit Run Tier-2 (06:30–06:41 UTC 2026-06-17)
- Tier: 2 | Sources: 31 checked | Cron jobs: 141 verified | VPS routes: 4/4 probed
- Anomalies: 3 new (0 critical, 3 warn, 0 info) | Dedup: 0 skipped
- Status: DEGRADED
- Signals: 3 emitted (B-06, B-13, B-07) to BUG channel
