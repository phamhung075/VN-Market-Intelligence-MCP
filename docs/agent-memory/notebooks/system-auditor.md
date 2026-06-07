<!-- System Auditor Notebook — cycle log (≤200L, NEWEST-FIRST ordering) -->

## c089 · 2026-06-07T13:12:29Z
### Audit Run Tier-1 (13:12 UTC 2026-06-07)
- Tier: 1 | Services: 6 checked
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE:
```
--- docker ps -a ---
mcp-server: Up 1h (healthy) ✓
api-gateway: Up 26h (healthy) ✓
macro-indicators: Up 4h (healthy) ✓
pdf-extractor: Up 2h (unhealthy) ℹ
frontend: Up 15h (healthy) ✓
mcp-gateway: Up 11d (healthy) ✓
--- health endpoints ---
mcp-server:3000/health OK (200) ✓
api-gateway:4000/health OK (200) ✓
macro-indicators:5004/health OK (200) ✓
pdf-extractor:5001/health FAIL (CURL_ERR) ℹ
frontend:3001/ OK (200) ✓
--- memory --- mcp-server=26.73% (<85%) ✓
--- disk --- 26% used (13Gi/39Gi free) ✓
--- restart count --- mcp-server RestartCount=0 ✓
```
- Findings: pdf-extractor unhealthy (expected PDFX-SINGLE-WORKER-BLOCKING). Tesseract active (pid 3205, 99.9% CPU, processing vie+eng OCR). Classification: BUSY NOT WEDGED — INFO only. No escalation.
- Signals: 0 emitted
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c088 · 2026-06-07T12:43:40Z
### Audit Run Tier-1 (12:43 UTC 2026-06-07)
- Tier: 1 | Services: 6 checked
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE:
```
--- docker ps -a ---
mcp-server: Up 35min (healthy) ✓
api-gateway: Up 25h (healthy) ✓
macro-indicators: Up 4h (healthy) ✓
pdf-extractor: Up 1h (unhealthy) ℹ
frontend: Up 15h (healthy) ✓
mcp-gateway: Up 11d (healthy) ✓
--- health endpoints ---
mcp-server:3000/health OK (200) ✓
api-gateway:4000/health OK (200) ✓
macro-indicators:5004/health OK (200) ✓
pdf-extractor:5001/health FAIL (CURL_ERR) ℹ
frontend:3001/ OK (200) ✓
--- memory --- mcp-server=26.87% (<85%) ✓
--- disk --- 27% used (13Gi/38Gi free) ✓
--- restart count --- mcp-server RestartCount=0 ✓
```
- Findings: pdf-extractor unhealthy confirmed expected (PDFX-SINGLE-WORKER-BLOCKING per dispatcher). Tesseract active (pid 2258, 99.6% CPU, processing /tmp/tess_*). Classification: BUSY NOT WEDGED — INFO only.
- Signals: 0 emitted
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c087 · 2026-06-07T12:12:28Z
### Audit Run Tier-1 (12:12 UTC 2026-06-07)
- Tier: 1 | Services: 6 checked
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE:
```
--- docker ps -a ---
mcp-server: Up 4min (healthy) ✓
api-gateway: Up 25h (healthy) ✓
macro-indicators: Up 3h (healthy) ✓
pdf-extractor: Up 32min (unhealthy) ℹ
frontend: Up 14h (healthy) ✓
mcp-gateway: Up 11d (healthy) ✓
--- health endpoints ---
mcp-server:3000/health OK (200) ✓
api-gateway:4000/health OK (200) ✓
macro-indicators:5004/health OK (200) ✓
pdf-extractor:5001/health FAIL (CURL_ERR) ℹ
frontend:3001/ OK (200) ✓
--- memory --- mcp-server=12.99% (<85%) ✓
--- disk --- 40% used (13Gi/233Gi) ✓
```
- Findings: pdf-extractor unhealthy state expected (per dispatcher: rebuild in progress, known single-worker blocking). Classified INFO (maintenance window, no escalation).
- Signals: 0 emitted

## c086 · 2026-06-07T11:43:27Z
### Audit Run Tier-1 (11:43 UTC 2026-06-07)
- Tier: 1 | Services: 6 checked
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE: all services UP, health endpoints OK (200), restart=0, memory=17.81%, disk=40%
- Context: pdf-extractor rebuild in progress (expected per dispatcher) — unhealthy state not escalated
- Signals: 0 emitted

## c085 · 2026-06-07T11:13:04Z
### Audit Run Tier-1 (11:13 UTC 2026-06-07)
- Tier: 1 | Services: 6 checked
- Anomalies: 1 transient (A-16 pdf-extractor health timeout) | Status: DEGRADED→recovered
