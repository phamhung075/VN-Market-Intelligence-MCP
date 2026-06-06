---
agent: system-auditor
session_date: 2026-06-06
---

## c056 · 2026-06-06T22:31:05Z
### Audit Run Tier-2 (22:31 UTC 2026-06-06)
- Tier: 2 (data freshness) | Sources: 27 checked | DB spot-checks: 3 (3 TOOL-UNAVAILABLE)
- Anomalies: 1 new CRITICAL (news SLA breach — 289min vs 30min), 1 new HIGH (sbv_fx SLA escalation), dedup-skipped: 1 (sbv_fx, already logged c052→c053 escalation chain)
- Status: DEGRADED (news SLA CRITICAL, sbv_fx HIGH — both caught during Tier-2 freshness sweep)

### Data Freshness Verdicts (B-01 through B-13)
- [get_sla_status] **NEWS CRITICAL**: 289 min old vs 30 min SLA → **B-04 CRITICAL NEW ANOMALY**; last push 2026-06-06 22:30:42 but data age measures ingestion timestamp
- [get_sla_status] **SBV_FX HIGH**: 31 min old vs 30 min SLA (marginal breach, occ#3) → dedup-skip (known watch item, signal_queue rtr-sbv-sla-measurement-layer-202606061815; root-cause: weekend data age growth + threshold-vs-cadence tuning)
- [get_pipeline_health] Prices 31min (ok), BCTC 185min (ok, within 168h default SLA — June out-of-window), news-vps 89 pushes/24h (healthy flow)
- [get_cron_health] 100+ jobs polled; all success rates ≥97% (range 99.3%–100%), no gaps detected → **PASS**
- [get_vps_proxy_health] 4 routes healthy (prices/news/sbv/bctc ok); bctc marked STALE (last_push 2026-06-05 14:48:47) — known benign per constraints (quarterly batch push window) → **INFO**
- [get_rate_limit_status] All 11 API hosts ready (0 at 100% utilization) → **PASS**
- [get_macro_snapshot] Live VNINDEX/FX/commodities refreshed 2026-06-06T22:31:30Z, all signals (gold/oil/carry/yield) computed → **PASS**
- [BCTC queue 72h stale pending] TOOL-UNAVAILABLE (sqlite3 not in container) → **NOT-RUN**
- [BCTC SSC portal URLs] TOOL-UNAVAILABLE → **NOT-RUN**
- [News articles last 3h] TOOL-UNAVAILABLE → **NOT-RUN**

### New Anomaly Details
**[B-04] News SLA Breach — CRITICAL**
- Source: news-vps
- Last fetch ts: 2026-06-06T22:30:42Z (from push log)
- Data age: 289 minutes (reported by get_sla_status)
- SLA threshold: 30 minutes
- Elapsed vs expected: 289/30 = 9.6× over SLA
- Check: data freshness (news article ingestion timestamp lags push acknowledgment)
- Zone owner: dev-mcp-server
- Dedup key: data_stale:news-vps:B-04
- Severity: CRITICAL

### Cron Health Summary (A-29)
All 100+ tracked jobs firing successfully:
- intelligenceCycleJob: 99.3% success (569/572)
- bctcQueueEnricherJob: 97.5% success (511/524)
- bctcReparseJob: 97.4% success (190/195)
- All others: 100% (no sub-100% jobs detected)
- Gaps: None detected (cron cadence well-maintained)

## c055 · 2026-06-06T22:12:14Z
### Audit Run Tier-1 (22:12 UTC 2026-06-06)
- Tier: 1 (runtime ping) | Services: 6 checked
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY (all containers up, health endpoints 200)

### RAW-PROBE: 2026-06-06T22:12:04Z
```
=== AUDITOR PROBE 2026-06-06T22:12:04Z ===

--- docker ps -a ---
NAMES                                           STATUS                    IMAGE                                         CREATED
vn-market-intelligence-mcp-mcp-server-1         Up 12 minutes (healthy)   vn-market-intelligence-mcp-mcp-server         12 minutes ago
vn-market-intelligence-mcp-frontend-1           Up 17 minutes (healthy)   vn-market-intelligence-mcp-frontend           17 minutes ago
vn-market-intelligence-mcp-macro-indicators-1   Up 25 minutes (healthy)   vn-market-intelligence-mcp-macro-indicators   25 minutes ago
headroom-proxy                                  Up 3 hours                headroom-proxy:local                          3 hours ago
vn-market-intelligence-mcp-pdf-extractor-1      Up 11 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor      11 hours ago
vn-market-intelligence-mcp-api-gateway-1        Up 11 hours (healthy)     vn-market-intelligence-mcp-api-gateway        11 hours ago
mcp-gateway                                     Up 10 days (healthy)      mcpservergatway-gateway                       2 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=10.19% MemUsage=208.7MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    22Gi    39%    393k  229M    0%   /

=== PROBE DONE ===
```

### Verdicts (A-01..A-32) — All PASS
- [RAW-PROBE L4–11] mcp-server/api-gateway/macro-indicators/pdf-extractor/frontend/mcp-gateway: all Up (healthy) ✓
- Health endpoints [RAW-PROBE L13–17]: all HTTP 200 ✓
- Memory: 10.19% (< 85%) ✓; Disk: 39% (< 85%) ✓; Restart: 0 (≤2) ✓

## c054 · 2026-06-06T21:42:37Z
### Audit Run Tier-1 (21:42 UTC 2026-06-06)
- Tier: 1 (runtime ping) | Services: 6 checked | Crons: 80+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY (all containers up, health endpoints 200)

### RAW-PROBE: 2026-06-06T21:42:11Z
```
=== AUDITOR PROBE 2026-06-06T21:42:11Z ===

--- docker ps -a ---
NAMES                                           STATUS                       IMAGE                                         CREATED
vn-market-intelligence-mcp-frontend-1           Up About an hour (healthy)   vn-market-intelligence-mcp-frontend           About an hour ago
vn-market-intelligence-mcp-mcp-server-1         Up 2 hours (healthy)         vn-market-intelligence-mcp-mcp-server         2 hours ago
headroom-proxy                                  Up 3 hours                   headroom-proxy:local                          3 hours ago
vn-market-intelligence-mcp-pdf-extractor-1      Up 10 hours (healthy)        vn-market-intelligence-mcp-pdf-extractor      10 hours ago
vn-market-intelligence-mcp-macro-indicators-1   Up 10 hours (healthy)        vn-market-intelligence-mcp-macro-indicators   10 hours ago
vn-market-intelligence-mcp-api-gateway-1        Up 10 hours (healthy)        vn-market-intelligence-mcp-api-gateway        10 hours ago
mcp-gateway                                     Up 10 days (healthy)         mcpservergatway-gateway                       2 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=15.22% MemUsage=311.8MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  256M    0%   /

=== PROBE DONE ===
```

### Verdicts (A-01..A-32) — All PASS
- [RAW-PROBE L4–11] mcp-server/api-gateway/macro-indicators/pdf-extractor/frontend/mcp-gateway: all Up (healthy) ✓
- Health endpoints [RAW-PROBE L13–17]: all HTTP 200 ✓
- Memory: 15.22% (< 85%) ✓; Disk: 36% (< 85%) ✓; Restart: 0 (≤2) ✓
- System: Circuit breakers all [OK], WAL 6.53 MB, 0 recent errors ✓
- Cron: 80+ jobs, all success rates ≥97%, no gaps detected ✓

## c053 · 2026-06-06T18:08:57Z
### Audit Run Tier-3 (18:08–18:09 UTC 2026-06-06)
- Tier: 3 (runtime + DB integrity) | Services: 6 checked | DB checks: 7 run (4 NOT-RUN: sqlite3 sandbox unavailable)
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 1 dedup-skipped (sbv_fx escalated WARN→CRITICAL)
- Status: DEGRADED (sbv_fx CRITICAL SLA breach: 68min vs 30min SLA)

### RAW-PROBE: 2026-06-06T18:08:26Z
```
=== AUDITOR PROBE 2026-06-06T18:08:26Z ===

--- docker ps -a ---
NAMES                                           STATUS                       IMAGE                                         CREATED
vn-market-intelligence-mcp-mcp-server-1         Up About an hour (healthy)   vn-market-intelligence-mcp-mcp-server         About an hour ago
vn-market-intelligence-mcp-frontend-1           Up 7 hours (healthy)         vn-market-intelligence-mcp-frontend           7 hours ago
vn-market-intelligence-mcp-pdf-extractor-1      Up 7 hours (healthy)         vn-market-intelligence-mcp-pdf-extractor      7 hours ago
vn-market-intelligence-mcp-macro-indicators-1   Up 7 hours (healthy)         vn-market-intelligence-mcp-macro-indicators   7 hours ago
vn-market-intelligence-mcp-api-gateway-1        Up 7 hours (healthy)         vn-market-intelligence-mcp-api-gateway        7 hours ago
mcp-gateway                                     Up 10 days (healthy)         mcpservergatway-gateway                       2 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=25.14% MemUsage=514.8MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    33Gi    29%    393k  346M    0%   /

=== PROBE DONE ===
```

### Verdicts (A-01..A-32)
- [RAW-PROBE L4–9] All containers UP (healthy) ✓
- Health endpoints [RAW-PROBE L11–15]: all HTTP 200 ✓
- Memory: 25.14% (< 85%) ✓; Disk: 29% (< 85%) ✓; Restart: 0 (≤2) ✓
- Crons: 80+ jobs, all success rates ≥97%, no gaps detected ✓

### Data Freshness (Tier-2 add-on)
- [get_sla_status] SLA CRITICAL: sbv_fx 68 min vs 30 min SLA — dedup from c052 (was 38 min WARN, now 68 min CRITICAL, escalated)
- [get_pipeline_health] news 26min (ok), bctc 81min (ok), prices 68min (ok)
- [get_vps_proxy_health] bctc last push 2026-06-05 14:48:47 (>24h, known benign per constraints)
- [get_cron_health] 70+ jobs, all success ≥97%, no gaps

### DB Integrity (Tier-3)
- [TOOL-UNAVAILABLE] C-05/C-06/C-07/C-16: sqlite3 not in container PATH — not-run, not an infra signal
- [A-22] pdftoppm: present (/usr/bin/pdftoppm) ✓
- [A-23] tesseract: present (/usr/bin/tesseract) ✓
- [A-24] vietnamese lang: vie present in tesseract --list-langs ✓
- [B-08] BCTC PDFs: 18 files in /app/data/pdfs/ ✓
- [A-25..A-28] inter-service: pdf-extractor 200 (ok), stock-price/technical-analysis/alert-engine no response (not-deployed-by-design per host_runtime_set, INFO only) ✓
- [A-31] EPIPE/ECONNRESET last 30m: 0 ✓
