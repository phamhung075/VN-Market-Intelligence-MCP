<!-- System Auditor Notebook — cycle log (≤200L, NEWEST-FIRST ordering) -->

## c095 · 2026-06-07T20:36:47Z
### Audit Run Tier-1 (20:34–20:36 UTC 2026-06-07)
- Tier: 1 | Services: 6 checked
- Anomalies: 1 recurring (W warn) | Status: DEGRADED
- RAW-PROBE:
```
--- docker ps -a ---
mcp-server: Up 4min (healthy) ✓ [Recent rebuild]
api-gateway: Up 2h (healthy) ✓
macro-indicators: Up 2h (healthy) ✓
pdf-extractor: Up 1h (healthy) ✓
frontend: Up 2h (healthy) ✓
mcp-gateway: Up 2h (healthy) ✓
--- health endpoints ---
mcp-server:3000/health OK (200) ✓
api-gateway:4000/health OK (200) ✓
macro-indicators:5004/health OK (200) ✓
pdf-extractor:5001/health FAIL (CURL_ERR) ⚠ [A-13]
frontend:3001/ OK (200) ✓
--- memory --- mcp-server=14.01% (<85%) ✓
--- disk --- 28% used (36Gi free) ✓
--- restart count --- mcp-server RestartCount=0 ✓
```
- Findings: A-13 RECURRING — pdf-extractor /health endpoint unreachable (CURL_ERR); container docker-marked healthy. Pattern: c092 (19:03Z)→warn, c093/c094 recovered, c095 recurs. Dedup hit (19:03:35Z within 7d). Signal_queue row appended; BUG telegram skipped (dedup).
- Signals: 1 emitted (A-13 microservice_degraded WARN)
- Contract: signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=0

## c094 · 2026-06-07T20:05:18Z
### Audit Run Tier-1 (20:05 UTC 2026-06-07)
- Tier: 1 | Services: 6 checked
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE:
```
--- docker ps -a ---
mcp-server: Up 1h (healthy) ✓
api-gateway: Up 1h (healthy) ✓
macro-indicators: Up 1h (healthy) ✓
pdf-extractor: Up 53min (healthy) ✓
frontend: Up 1h (healthy) ✓
mcp-gateway: Up 1h (healthy) ✓
--- health endpoints ---
mcp-server:3000/health OK (200) ✓
api-gateway:4000/health OK (200) ✓
macro-indicators:5004/health OK (200) ✓
pdf-extractor:5001/health OK (200) ✓
frontend:3001/ OK (200) ✓
--- memory --- mcp-server=29.11% (<85%) ✓
--- disk --- 27% used (37Gi free) ✓
--- restart count --- mcp-server RestartCount=0 ✓
```
- Findings: All 6 host_runtime_set services UP and healthy. All health endpoints return 200. Memory 29.11% (safe). Disk 27% used. No restart cycles. All checks PASS.
- Signals: 0 emitted
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c093 · 2026-06-07T19:35:51Z
### Audit Run Tier-1 (19:35 UTC 2026-06-07)
- Tier: 1 | Services: 6 checked
- Anomalies: 0 new | Status: HEALTHY
- Findings: All 6 host_runtime_set services UP and healthy. pdf-extractor now HEALTHY (post-OCR-drain).
- Signals: 0 emitted
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c092 · 2026-06-07T19:03:35Z
### Audit Run Tier-1 (19:03 UTC 2026-06-07)
- Tier: 1 | Services: 6 checked
- Anomalies: 1 new (W warn) | Status: DEGRADED
- Findings: A-13 WARN — pdf-extractor health endpoint unreachable; container running but unhealthy. CONTEXT: KNOWN/IN-REMEDIATION per dev-pdf-extractor active repair.
- Signals: 1 emitted (A-13 microservice_degraded WARN)
- Contract: signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=1
