
## c109 · 2026-06-08T07:54:37Z
### Audit Run Tier-1 (07:54 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-08T07:54:08Z ===

--- docker ps -a ---
vn-market-intelligence-mcp-mcp-server-1: Up 5 hours (healthy) ✓
vn-market-intelligence-mcp-pdf-extractor-1: Up 5 hours (healthy) ✓
vn-market-intelligence-mcp-macro-indicators-1: Up 8 hours (healthy) ✓
vn-market-intelligence-mcp-frontend-1: Up 13 hours (healthy) ✓
vn-market-intelligence-mcp-api-gateway-1: Up 13 hours (healthy) ✓
mcp-gateway: Up 13 hours (healthy) ✓

--- health endpoints ---
mcp-server:3000/health OK (HTTP 200) ✓
api-gateway:4000/health OK (HTTP 200) ✓
macro-indicators:5004/health OK (HTTP 200) ✓
pdf-extractor:5001/health OK (HTTP 200) ✓
frontend:3001/ OK (HTTP 200) ✓

--- restart count ---
mcp-server RestartCount=0 (≤2) ✓

--- memory pressure ---
mcp-server MemPerc=47.01% (<85%) ✓

--- disk df -h / ---
Capacity 28% (<85%) ✓
```
- Findings: All 6 host_runtime_set services UP and HEALTHY. All health endpoints OK. Memory <85%. Disk <85%. Restart count nominal. No anomalies detected. All circuit breakers OK. 63 crons firing normally; 1 job crashed (vnstockFundamentalsRefresh, not Tier-1 scope). 10 unresolved errors (vnstock rate-limiting + fallback known-issues, not container failures).
- Signals: 0 emitted
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c108 · 2026-06-08T02:34:40Z
### Audit Run Tier-1 (02:34 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-08T02:34:28Z ===

--- docker ps -a ---
mcp-server: Up 27 minutes (healthy) ✓
api-gateway: Up 8 hours (healthy) ✓
frontend: Up 8 hours (healthy) ✓
macro-indicators: Up 3 hours (healthy) ✓
mcp-gateway: Up 8 hours (healthy) ✓
pdf-extractor: Up 6 minutes (healthy) ✓

--- health endpoints ---
mcp-server:3000/health OK (HTTP 200) ✓
api-gateway:4000/health OK (HTTP 200) ✓
macro-indicators:5004/health OK (HTTP 200) ✓
pdf-extractor:5001/health OK (HTTP 200) ✓
frontend:3001/ OK (HTTP 200) ✓

--- restart count ---
mcp-server RestartCount=0 (≤2) ✓

--- memory pressure ---
mcp-server MemPerc=23.50% (<85%) ✓

--- disk df -h / ---
Capacity 27% (<85%) ✓
```
- Findings: All 6 host_runtime_set services UP and HEALTHY. All health endpoints OK. Memory <85%. Disk <85%. Restart count nominal. No anomalies detected. System status: all circuit breakers OK, 10 unresolved system errors (kinhdich/fallback known-issues, not container failures). Cron health: one job crashed (vnstockFundamentalsRefresh, not Tier-1 scope — Tier-3 detail).
- Signals: 0 emitted
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c107 · 2026-06-08T02:01:54Z
### Audit Run Tier-2 (02:01 UTC 2026-06-08)
- Tier: 2 | Crons: 63 checked | Sources: 28 checked | VPS routes: 4 OK
- Anomalies: 1 CRITICAL (B-12 SBV stale) | Status: DEGRADED
- A-29 crons: All 63 firing normally, no gaps. intelligenceCycleJob 99.1% success (562 runs).
- B-01..B-07 pipeline: Prices/BCTC/foreign-flow fresh, news 10min <30min OK, SBV 21h+ stale.
- B-06/B-07 VPS health: All 4 routes OK, push logs show sbv/news stale vs expected cadence.
- B-12 SLA **CRITICAL**: sbv_fx 47min breach (30min threshold). sbvRatesRefreshJob ran 2026-06-08 00:00Z success, but market.db fetch timestamp stale. Clock skew or silent fetch fail suspected.
- B-09 BCTC URLs: 0 bad SSC URLs ✓. B-13 stale BCTC: 0 pending >72h ✓ (IMPROVEMENT from c104=338).
- C-06/C-07 DB: market_messages 4/3h ✓, agent_signals 89/24h ✓.
- Signals: 1 emitted (CRITICAL sau-c107-b12). BUG Telegram: B-12 sbv-stale (new, no dedup).
- Contract: signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=1

## c106 · 2026-06-08T01:34:12Z
### Audit Run Tier-1 (01:34 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 1 dedup-skipped (A-20 within 7-day window, prev 2026-06-08T01:03:42Z) | Status: DEGRADED (recurring)
- RAW-PROBE:
```
--- docker ps -a ---
mcp-server: Up 3h (healthy) ✓
api-gateway: Up 7h (healthy) ✓
macro-indicators: Up 2h (healthy) ✓
pdf-extractor: Up 7min (healthy) ✓ [recent restart]
frontend: Up 7h (healthy) ✓
mcp-gateway: Up 7h (healthy) ✓
--- health endpoints ---
mcp-server:3000/health OK (200) ✓
api-gateway:4000/health OK (200) ✓
macro-indicators:5004/health OK (200) ✓
pdf-extractor:5001/health FAIL (curl timeout) ⚠ [A-20]
frontend:3001/ OK (200) ✓
mcp-gateway:4040/health OK (200) ✓
--- memory ---
mcp-server: 60.68% (<85%) ✓
--- disk ---
28% used (35Gi free) ✓
--- restart count ---
mcp-server RC=0 (≤2) ✓
```
- Findings: pdf-extractor health timeout recurrence (A-20). Container UP and responding to logs show health OK, but probe curl timeout during audit window. Consistent with session context: "pdf-extractor restart/health flap during your run is EXPECTED." Issue already in signal_queue (sau-c105-a20, 30min ago). 7-day dedup active: no BUG Telegram sent.
- Signals: 0 posted (BUG dedup) | Signal Queue: 1 row appended (A-20 continuation)
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=0

## c105 · 2026-06-08T01:03:42Z
### Audit Run Tier-1 (01:03 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 1 dedup-skipped (A-20 within 7-day window, prev 2026-06-07T23:04Z) | Status: DEGRADED (known issue)
- RAW-PROBE:
```
--- docker ps -a ---
mcp-server: Up 2h (healthy) ✓
api-gateway: Up 6h (healthy) ✓
macro-indicators: Up ~1h (healthy) ✓
pdf-extractor: Up 2h (unhealthy) ⚠ [recurring A-20]
frontend: Up 6h (healthy) ✓
mcp-gateway: Up 6h (healthy) ✓
--- health endpoints ---
mcp-server:3000/health OK (200) ✓
api-gateway:4000/health OK (200) ✓
macro-indicators:5004/health OK (200) ✓
pdf-extractor:5001/health FAIL (timeout) ⚠ [A-20]
frontend:3001/ OK (200) ✓
mcp-gateway:4040/health OK (200) ✓
--- memory ---
mcp-server: 49.58% (<85%) ✓
--- disk ---
28% used (36Gi free) ✓
--- restart count ---
mcp-server RC=0 (≤2) ✓
```
- Findings: pdf-extractor unhealthy + health endpoint timeout (A-20). Regression since c103 (00:07Z showed passing). Within 7-day dedup window (prev report 2026-06-07T23:04:13Z). No BUG Telegram (dedup). Signal row appended to signal_queue per audit protocol.
- Signals: 0 posted (BUG dedup) | Signal Queue: 1 row written (sau-c105-a20)
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=0

## c104 · 2026-06-08T00:30:43Z
### Audit Run Tier-3 (00:30 UTC 2026-06-08)
- Tier: 3 | Checks: A-22/A-24 (tooling ✓) + C-01..C-16 | Runtime: 360s | Status: CRITICAL
- Anomalies: 4 (1 CRITICAL, 3 WARN) | Dedup-skipped: 0
- C-Checks: C-01/C-02 SKIP (no trading data pre-market) | C-03 ✓ (26 codes) | C-04 WARN (8 low-conf >5) | C-05 ✓ | C-06 ✓ (2 msgs/3h) | C-07 ✓ (87 signals/24h) | C-08 WARN (3 orphaned) | C-09 WARN (0 countries/26h) | C-10 ✓ | C-11 ✓ (earnings window) | C-12 ✓ (integrity ok) | C-13 ✓ (WAL 6MB <50MB) | C-14 SKIP (C-01=0) | C-15 ✓ (schema) | C-16 **CRITICAL** (338 stale pending BCTC >72h)
- Signals: 4 emitted (1 CRITICAL sau-c104-c16, 3 WARN sau-c104-c04/c08/c09)
- Contract: signals_posted=4 | telegram_sent=4 | signal_queue_rows_written=4 | dashboard_rows=4

## c103 · 2026-06-08T00:07:55Z
### Audit Run Tier-1 (00:07 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE:
```
--- docker ps -a ---
mcp-server: Up ~1h (healthy) ✓
api-gateway: Up ~5h (healthy) ✓
macro-indicators: Up ~30min (healthy) ✓
pdf-extractor: Up ~40min (healthy) ✓
frontend: Up ~5h (healthy) ✓
mcp-gateway: Up ~5h (healthy) ✓
--- health endpoints ---
mcp-server:3000/health OK (200) ✓
api-gateway:4000/health OK (200) ✓
macro-indicators:5004/health OK (200) ✓
pdf-extractor:5001/health OK (200) ✓
frontend:3001/ OK (200) ✓
--- memory --- mcp-server=27.00% (<85%) ✓
--- disk --- 28% used (36Gi free) ✓
--- restart count --- mcp-server RC=0 (≤2) ✓
```
- Findings: All 6 host_runtime_set services UP + healthy endpoints. All restart counts nominal. No anomalies.
- Signals: 0 emitted
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0
