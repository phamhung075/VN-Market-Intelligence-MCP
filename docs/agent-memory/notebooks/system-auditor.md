
## c101 · 2026-06-07T23:04:13Z
### Audit Run Tier-1 (23:04 UTC 2026-06-07)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 1 dedup-skipped (A-20 within 7-day window) | Status: DEGRADED (known issue)
- RAW-PROBE:
```
--- docker ps -a ---
mcp-server: Up 22 minutes (healthy) ✓
api-gateway: Up 4 hours (healthy) ✓
macro-indicators: Up 12 minutes (healthy) ✓
pdf-extractor: Up About an hour (unhealthy) ⚠ [recurring A-20]
frontend: Up 4 hours (healthy) ✓
mcp-gateway: Up 4 hours (healthy) ✓
--- health endpoints ---
mcp-server:3000/health OK (200) ✓
api-gateway:4000/health OK (200) ✓
macro-indicators:5004/health OK (200) ✓
pdf-extractor:5001/health FAIL (CURL_ERR) ⚠ [A-20, dedup 21:03:53Z c096]
frontend:3001/ OK (200) ✓
--- memory --- mcp-server=11.36% (<85%) ✓
--- disk --- 29% used (34Gi free) ✓
--- restart count --- mcp-server RC=0 (≤2) ✓
```
- Findings: pdf-extractor unhealthy + health endpoint unreachable (A-20). Within 7-day dedup window (prev 21:03:53Z c096, ~2h ago). No BUG Telegram sent (dedup rule). Signal row appended to signal_queue per audit protocol.
- Signals: 0 posted (BUG dedup) | Signal Queue: 1 row written (A-20)
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=0
## c100 · 2026-06-07T22:33:50Z
### Audit Run Tier-1 (22:33 UTC 2026-06-07)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE:
```
--- docker ps -a ---
mcp-server: Up 2h (healthy) ✓ [RAW-PROBE L3]
api-gateway: Up 4h (healthy) ✓ [RAW-PROBE L6]
macro-indicators: Up 4h (healthy) ✓ [RAW-PROBE L5]
pdf-extractor: Up 56m (healthy) ✓ [RAW-PROBE L2]
frontend: Up 4h (healthy) ✓ [RAW-PROBE L4]
mcp-gateway: Up 4h (healthy) ✓ [RAW-PROBE L7]
--- health endpoints ---
mcp-server:3000/health OK (200) ✓
api-gateway:4000/health OK (200) ✓
macro-indicators:5004/health OK (200) ✓
pdf-extractor:5001/health OK (200) ✓
frontend:3001/ OK (200) ✓
--- memory --- mcp-server=49.35% (<85%) ✓
--- disk --- 29% used (34Gi free) ✓
--- restart count --- mcp-server RC=1 (≤2) ✓
```
- Findings: All 6 host_runtime_set services UP + healthy endpoints; restart count nominal.
- Signals: 0 emitted
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c099 · 2026-06-07T22:05:02Z
### Audit Run Tier-2 COMPLETION (22:05 UTC 2026-06-07)
- Tier: 2 | MCP checks: A-29 + B-01–B-13 + C-06/C-07 + D-BCTC-EVAL + D-IMPROVE
- Cron Fire: A-29 PASS (all crons firing within 2× cadence, no gaps detected)
- Data Freshness: VPS proxy health ALL OK (prices/news/sbv/bctc ✓); SLA 5/5 OK; rate-limits 0 at 100%
- DB Freshness: C-06 CRITICAL (market_messages 3h = 0, expected >0) | C-07 CRITICAL (agent_signals 24h = 0, expected >0)
- BCTC Shape: B-09 PASS (0 ssc.gov.vn URLs not skipped) | B-13 PASS (0 stale >72h pending)
- Pipeline Health: news ✓, prices ✓, backfill ✓, TA ready for 28/33 tickers
- Anomalies: 2 CRITICAL (C-06, C-07 — db write silence)
- Status: DEGRADED (critical DB silence detected; no market_messages in 3h, no signals in 24h)
- Signals: 2 posted (BUG Telegram sent) | Signal Queue: 2 rows written
- Contract: signals_posted=2 | telegram_sent=2 | signal_queue_rows_written=2 | dashboard_rows=0

## c098 · 2026-06-08T05:02:00Z
### Audit Run Tier-2 (22:01 UTC 2026-06-07, 05:02 GMT+7 2026-06-08)
- Tier: 2 | Services: 6 verified (docker) | Sources: pending MCP calls | DB checks: pending
- Anomalies: 0 new (container + restart status HEALTHY) | Status: GREEN (local checks)
- Context: Pre-market hours (05:02 GMT+7); BCTC SLA OUT-WINDOW (month 6 ∉ [1,4,7,10]) → 168h threshold
- Docker Status: mcp-server Up 1h (RC=1), pdf-extractor Up 26m (RC=0), api-gateway Up 3h ✓, macro-indicators ✓, frontend ✓, mcp-gateway ✓
- Pending MCP Calls: get_cron_health, get_pipeline_health, get_vps_proxy_health, docker exec DB checks (C-06/C-07/B-09/B-13)
- Signals: 0 emitted | Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

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
