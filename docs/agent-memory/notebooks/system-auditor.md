<!-- System Auditor Notebook — cycle log (≤200L, NEWEST-FIRST ordering) -->

## c097 · 2026-06-07T21:34:46Z
### Audit Run Tier-1 (21:34 UTC 2026-06-07)
- Tier: 1 | Services: 6 checked
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE:
```
--- docker ps -a ---
mcp-server: Up 53min (healthy) ✓
api-gateway: Up 3h (healthy) ✓
macro-indicators: Up 3h (healthy) ✓
pdf-extractor: Up 2h (healthy) ✓
frontend: Up 3h (healthy) ✓
mcp-gateway: Up 3h (healthy) ✓
--- health endpoints ---
mcp-server:3000/health OK (200) ✓
api-gateway:4000/health OK (200) ✓
macro-indicators:5004/health OK (200) ✓
pdf-extractor:5001/health OK (200) ✓
frontend:3001/ OK (200) ✓
--- memory --- mcp-server=32.80% (<85%) ✓
--- disk --- 28% used (35Gi free) ✓
--- restart count --- mcp-server RestartCount=1 (≤2) ✓
```
- Findings: All host_runtime_set services UP + healthy; prior WARN A-13 (pdf-extractor health) resolved.
- Signals: 0 emitted
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c096 · 2026-06-07T21:03:53Z
### Audit Run Tier-1 (21:03 UTC 2026-06-07)
- Tier: 1 | Services: 6 checked
- Anomalies: 2 (1 new INFO, 1 recurring WARN) | Status: DEGRADED
- RAW-PROBE:
```
--- docker ps -a ---
mcp-server: Up 22min (healthy) ✓
api-gateway: Up 2h (healthy) ✓
macro-indicators: Up 2h (healthy) ✓
pdf-extractor: Up 2h (unhealthy) ⚠ [NEW: status changed]
frontend: Up 2h (healthy) ✓
mcp-gateway: Up 2h (healthy) ✓
--- health endpoints ---
mcp-server:3000/health OK (200) ✓
api-gateway:4000/health OK (200) ✓
macro-indicators:5004/health OK (200) ✓
pdf-extractor:5001/health FAIL (CURL_ERR) ⚠ [A-13]
frontend:3001/ FAIL (CURL_ERR) ⚠ [A-14]
--- memory --- mcp-server=28.03% (<85%) ✓
--- disk --- 28% used (35Gi free) ✓
--- restart count --- mcp-server RestartCount=1 (≤2) ✓
```
- Findings: A-14 NEW — frontend health unreachable (CURL_ERR, INFO severity). A-13 RECURRING — pdf-extractor health unreachable + docker unhealthy (WARN, dedup-hit 19:03:35Z). All other services healthy.
- Signals: 2 emitted (A-14 INFO, A-13 WARN)
- Contract: signals_posted=2 | telegram_sent=0 | signal_queue_rows_written=2 | dashboard_rows=0

## c095 · 2026-06-07T20:36:47Z
### Audit Run Tier-1 (20:34–20:36 UTC 2026-06-07)
- Tier: 1 | Services: 6 checked
- Anomalies: 1 recurring (W warn) | Status: DEGRADED
- Findings: A-13 RECURRING — pdf-extractor /health endpoint unreachable; dedup hit.
