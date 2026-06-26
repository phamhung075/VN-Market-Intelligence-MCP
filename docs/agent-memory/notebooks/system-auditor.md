# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c398 · 2026-06-26T00:10:15Z
### Audit Run Tier-1 (00:10 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP (host_runtime_set) | Health: 4/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (00:10:15Z):
  - docker ps: all 12 containers Up (healthy)
  - [health] mcp-server:3000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001 OK
  - [health] api-gateway:4000/health FAIL (HTTP CURL_ERR) [RAW-PROBE L4]
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 13.79% PASS | A-32 Disk: 16% PASS
- Anomalies: 1 NEW (A-12: api-gateway health endpoint FAIL — WARN)
- Status: DEGRADED | Signals: 1 posted (A-12) | Signal-queue: +1 row (sau-2026-06-26T00:10:15Z)

## c397 · 2026-06-25T23:41:20Z
### Audit Run Tier-1 (23:41 UTC 2026-06-25) — Runtime Ping
- Tier: 1 | Services: 12/12 UP (host_runtime_set) | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (23:41Z):
  - docker ps: all 12 containers Up (healthy)
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001 OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 12.80% PASS | A-32 Disk: 16% PASS
- Anomalies: 0 NEW (all A-xx checks PASS)
- Status: HEALTHY | Signals: 0 posted | Signal-queue: no changes

## c396 · 2026-06-25T23:40:17Z
### Audit Run Tier-1 (23:40 UTC 2026-06-25) — Runtime Ping
- Tier: 1 | Services: 12/12 UP (host_runtime_set) | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (23:40Z):
  - docker ps: all 12 containers Up (healthy)
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001 OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 13.22% PASS | A-32 Disk: 16% PASS
- Anomalies: 0 NEW (all A-xx checks PASS)
- Status: HEALTHY | Signals: 0 posted | Signal-queue: no changes

## c395 · 2026-06-25T23:11:35Z
### Audit Run Tier-1 (23:11 UTC 2026-06-25) — Runtime Ping
- Tier: 1 | Services: 12/12 UP (host_runtime_set) | Health: 5/5 OK
- RAW-PROBE (23:11Z): all containers Up with status=healthy
  - [health] mcp-server:3000/health OK (HTTP 200)
  - [health] api-gateway:4000/health OK (HTTP 200)
  - [health] macro-indicators:5004/health OK (HTTP 200)
  - [health] pdf-extractor:5001/health OK (HTTP 200)
  - [health] frontend:3001/ OK (HTTP 200)
- A-20 pdf-extractor multi-probe: 3/3 PASS (HTTP 200 all)
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 13.44% (<85% PASS) | A-32 Disk: 16% (<85% PASS)
- Anomalies: 0 NEW (all checks PASS)
- Status: HEALTHY | Signals: 0 posted | Signal-queue: unchanged

## c394 · 2026-06-25T23:10:07Z
### Audit Run Tier-1 (23:10 UTC 2026-06-25) — Runtime Ping
- Tier: 1 | Services: 12/12 UP (host_runtime_set) | Health: 5/5 OK
- RAW-PROBE (23:10Z): all containers Up status=healthy
  - [health] mcp-server:3000/health OK (HTTP 200)
  - [health] api-gateway:4000/health OK (HTTP 200)
  - [health] macro-indicators:5004/health OK (HTTP 200)
  - [health] pdf-extractor:5001/health OK (HTTP 200)
  - [health] frontend:3001/ OK (HTTP 200)
- A-20 pdf-extractor multi-probe: 3/3 PASS (HTTP 200 all)
- A-25–A-28 inter-service: 4/4 OK | A-31 EPIPE: 0 count | Disk: 16% | Memory: 13.44%
- Anomalies: 0 NEW (all checks PASS)
- Status: HEALTHY | Signals: 0 posted

## c393 · 2026-06-25T22:41:57Z
### Audit Run Tier-1 (22:41 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 UP (host_runtime_set) | Health: 5/5 OK
- RAW-PROBE (22:41Z): all 12 containers Up with status=healthy
  - [health] mcp-server:3000/health OK (HTTP 200)
  - [health] api-gateway:4000/health OK (HTTP 200)
  - [health] macro-indicators:5004/health OK (HTTP 200)
  - [health] pdf-extractor:5001/health OK (HTTP 200)
  - [health] frontend:3001/ OK (HTTP 200)
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 13.72% (<85% PASS) | A-32 Disk: 16% (<85% PASS)
- Anomalies: 0 NEW (all checks PASS)
- Status: HEALTHY | Signals: 0 posted | Signal-queue unchanged

## c392 · 2026-06-25T22:40:48Z
### Audit Run Tier-1 (22:40 UTC 2026-06-25) — Runtime Ping
- Tier: 1 | Services: 12/12 UP (all INTENDED host_runtime_set) | Health: 5/5 endpoints OK
- RAW-PROBE (22:40Z): all 12 containers Up with status=healthy
  - [health] mcp-server:3000/health OK (HTTP 200)
  - [health] api-gateway:4000/health OK (HTTP 200)
  - [health] macro-indicators:5004/health OK (HTTP 200)
  - [health] pdf-extractor:5001/health OK (HTTP 200)
  - [health] frontend:3001/ OK (HTTP 200)
- A-20 pdf-extractor multi-probe: [A-20-PROBE-1] 200 | [A-20-PROBE-2] 200 | [A-20-PROBE-3] 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 12.93% (<85% PASS) | A-32 Disk: 16% (<85% PASS)
- Anomalies: 0 NEW (all checks PASS)
- Status: HEALTHY | Signals: 0 posted | Signal-queue: 79 rows unchanged
