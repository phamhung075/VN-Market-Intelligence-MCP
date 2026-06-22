# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c331 · 2026-06-22T19:13:18Z
### Audit Run Tier-1 (19:13 UTC 2026-06-22, Sunday 02:13 VN — market CLOSED)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 1 NEW CRITICAL (mcp-server memory pressure)
- Status: CRITICAL
- Evidence: All 12 host_runtime_set services UP+healthy [RAW-PROBE]. Health endpoints mcp-server/api-gateway/macro-indicators/pdf-extractor/frontend all HTTP 200. A-30 mcp-server memory 99.31% > 95% CRITICAL threshold — high risk of OOMKill. Restart count 0. Disk 35% PASS. Signal row sau-20260622T191318Z written to signal_queue.rows[].

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-22T19:12:58Z ===

--- docker ps -a ---
vn-market-intelligence-mcp-mcp-server-1           Up 17 hours (healthy)
vn-market-intelligence-mcp-frontend-1             Up 22 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 6 days (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=99.31% MemUsage=1.986GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  266M    0%   /

=== PROBE DONE ===
```

## c330 · 2026-06-22T18:43:30Z
### Audit Run Tier-1 (18:43 UTC 2026-06-22, Sunday 01:43 VN — market CLOSED)
- Tier: 1 | Services: 12 host_runtime_set checked
- Anomalies: 1 NEW WARN (mcp-server memory pressure 90.17%)
- Status: DEGRADED
- Evidence: All 12 services UP. A-30 memory 90.17% > 85% threshold — WARN. Signal row sau-20260622T184330Z written to signal_queue.rows[].

## c329 · 2026-06-22T18:32:23Z
### Audit Run Tier-2 (18:32 UTC 2026-06-22, Monday 01:32 VN — market CLOSED)
- Tier: 2 | Sources: 7 VPS+direct checked
- Anomalies: 0 NEW
- Status: HEALTHY
- Evidence: VPS proxy all ok. C-07 signals 169/24h PASS. C-06 downgraded INFO (market closed). All checks passing.
