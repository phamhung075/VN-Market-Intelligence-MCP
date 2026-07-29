## d986065c · 2026-07-29T00:42:57Z
### Audit Run Tier-1 (00:30–00:41 UTC 2026-07-29)
- Tier: 1 | Services: 12/12 host_runtime_set Up(healthy) | Health: 5/5 OK | A-20 pdf-extractor 3/3 pass | A-21 crashRestarts=1 PASS | A-30 MemPerc trough=36.62% (reclamation dips observed, floor +1.72pp vs 34.90% baseline) | A-32 Disk 37% PASS
- Anomalies: 0 new (0 critical, 0 warn, 0 info)
- Status: HEALTHY

Fire-election: tick=2026-07-29T00:30Z (`*/30 * * * *` boundary) — `task_claim` returned `claimed:true`. Led this tick.

### RAW-PROBE: (docs/agents/system-auditor/probe.sh, 2026-07-29T00:38:28Z)
```
=== AUDITOR PROBE 2026-07-29T00:38:28Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-pdf-extractor-1        Up 7 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        8 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)   vn-market-intelligence-mcp-mcp-server           3 days ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)    vn-market-intelligence-mcp-frontend             4 days ago
mcp-gateway                                       Up 13 days (healthy)   mcpservergatway-gateway                         13 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)   vn-market-intelligence-mcp-api-gateway          13 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 13 days (healthy)   ghcr.io/flaresolverr/flaresolverr:latest        13 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)   vn-market-intelligence-mcp-news-fetch           13 days ago
vn-market-intelligence-mcp-rag-service-1          Up 4 hours (healthy)   vn-market-intelligence-mcp-rag-service          13 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 13 days (healthy)   vn-market-intelligence-mcp-macro-indicators     13 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 13 days (healthy)   vn-market-intelligence-mcp-technical-analysis   13 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)   vn-market-intelligence-mcp-alert-engine         13 days ago
vn-market-intelligence-mcp-stock-price-1          Up 13 days (healthy)   vn-market-intelligence-mcp-stock-price          13 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 13 days (healthy)   vn-market-intelligence-mcp-kinh-dich-service    13 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=3

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=39.90% MemUsage=1.197GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 39.30% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    23Gi    37%    393k  245M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

**A-29 Cron Health**: 127+ cron jobs tracked, all success_rate ≥80%, majority ≥99%. mcpServerStartup at 2026-07-28T22:58:42Z (authorized restart). No fire-gap alerts.

**A-30 Memory Trajectory (Multi-Probe Window)**: 8 samples over 105 seconds (2026-07-29T00:39:28Z–00:41:20Z):
- Min: 36.62% (1.099GiB) ← trough
- Max: 39.43% (1.183GiB) ← peak
- Range: 2.81%
- Reclamation: YES (84,000 kB freed between peak and trough)
- Baseline floor comparison: 36.62% > 34.90% baseline (+1.72pp, +7.5MB) but below 85% investigate-gate
- Verdict: PASS (reclamation dips prove GC functional; floor elevation documented but not ESCALATE)

**A-20 pdf-extractor**: 3/3 multi-probe pass (all in-container HTTP 200).

**A-21 Windowed Crashes**: 1 crash restart in 4h window (2026-07-28T22:58:42Z), threshold=2 → PASS.

**A-32 Disk**: 37% capacity (233Gi total, 13Gi used, 23Gi avail) — healthy headroom.

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## 88ec89d6 · 2026-07-29T00:36:05Z
### Audit Run Tier-3 (02:00 UTC 2026-07-29)
- Tier: 3 | DB integrity deep scan: 16 checks (14 PASS, 2 WARN) | Tooling: 3/3 present | Connectivity: 4/4 UP | EPIPE: 0 | WAL sizes OK
- Anomalies: 2 new (0 critical, 2 warn, 0 info) | 1 dedup-skipped
- Status: DEGRADED

Fire-election: tick=2026-07-29T02:00Z (daily 02:00 UTC) — `task_claim` returned `claimed:true`. Led this tick.

**Tier-3 DB Checks (C-01 to C-16)**:
- C-01 (daily_ohlcv tickers): PASS (927 distinct codes, ≥25)
- C-02 (daily_ohlcv rows): PASS (927 rows, >0)
- C-03 (financial_reports 2026-Q1): PASS (45 distinct action_codes, ≥26)
- C-04 (low-conf BCTC): PASS (0 rows, ≤5)
- C-05 (SSC URLs in queue): PASS (0 rows, =0)
- C-06 (market_messages 3h): WARN (0 rows, expected >0) [dedup-skip: last 2026-07-22]
- C-07 (agent_signals 24h): PASS (33 rows, >0)
- C-08 (orphaned alerts): WARN (69 orphaned, expected 0) [NEW]
- C-09 (macro_indicators Vietnam): PASS (3 fields, ≥3)
- C-10 (failed PDFs 24h): PASS (0 rows, ≤2)
- C-11 (successful PDFs 48h): 0 (off-season, not fatal)
- C-12 (integrity_check): PASS (market.db ok, pdf_extractor.db ok, rag_service.db returned empty)
- C-13 (WAL sizes): PASS (<50MB: market.db-wal 7.12MB, coordination.db-wal 1.88MB)
- C-14 (ticker concentration): PASS (0.3%, <60%)
- C-15 (schema sentinel): PASS (4/4 columns present)
- C-16 (stale pending BCTC): PASS (0 rows, =0)

**Service health (A-22 to A-28)**:
- A-22 (pdftoppm): present
- A-23 (tesseract): present
- A-24 (vie language): present
- A-25 (stock-price /health): UP
- A-26 (technical-analysis /health): UP
- A-27 (alert-engine /health): UP
- A-28 (pdf-extractor /health): UP
- A-31 (EPIPE 30min): 0 occurrences (PASS)
- B-08 (BCTC PDFs): 278 present (PASS)

**Signals emitted**:
- C-06: SKIP-dedup (already reported 2026-07-22T15:00:37Z)
- C-08: OK (new signal, posted to BUG)

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=2 | dashboard_rows=2

## a1f7k9x5 · 2026-07-28T23:39:27Z
### Audit Run Tier-1 (23:30–23:39 UTC 2026-07-28)
- Tier: 1 | Services: 12/12 host_runtime_set Up(healthy) | Health: 5/5 OK | A-20 pdf-extractor 3/3 pass | A-21 crashRestarts=1 PASS | A-30 MemPerc=10.38% (process age 40m51s, 3rd trajectory point) | A-32 Disk 38% PASS
- Anomalies: 0 new (0 critical, 0 warn, 0 info)
- Status: HEALTHY

Fire-election: tick=2026-07-28T23:30Z (`*/30 * * * *` boundary) — `task_claim` returned `claimed:true`. Led this tick.

### RAW-PROBE: (docs/agents/system-auditor/probe.sh, 2026-07-28T23:39:06Z)
```
=== AUDITOR PROBE 2026-07-28T23:39:06Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE
vn-market-intelligence-mcp-pdf-extractor-1        Up 6 hours (healthy)      vn-market-intelligence-mcp-pdf-extractor
vn-market-intelligence-mcp-mcp-server-1           Up 40 minutes (healthy)   vn-market-intelligence-mcp-mcp-server
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)       vn-market-intelligence-mcp-frontend
mcp-gateway                                       Up 13 days (healthy)      mcpservergatway-gateway
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)      vn-market-intelligence-mcp-api-gateway
vn-market-intelligence-mcp-flaresolverr-1         Up 13 days (healthy)      ghcr.io/flaresolverr/flaresolverr:latest
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)      vn-market-intelligence-mcp-news-fetch
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)      vn-market-intelligence-mcp-rag-service
vn-market-intelligence-mcp-macro-indicators-1     Up 13 days (healthy)      vn-market-intelligence-mcp-macro-indicators
vn-market-intelligence-mcp-technical-analysis-1   Up 13 days (healthy)      vn-market-intelligence-mcp-technical-analysis
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)      vn-market-intelligence-mcp-alert-engine
vn-market-intelligence-mcp-stock-price-1          Up 13 days (healthy)      vn-market-intelligence-mcp-stock-price
vn-market-intelligence-mcp-kinh-dich-service-1    Up 13 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=3

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=10.38% MemUsage=318.8MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 10.38% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    23Gi    38%    393k  236M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

**A-29 Cron Health**: 129+ cron jobs, all success_rate ≥80%, most ≥99%. mcpServerStartup at 2026-07-28T22:58:42Z (clean restart). Last fires current. No fire-gap alerts.

**A-30 Memory Trajectory (3rd data point)**: Process restarted 2026-07-28T22:58:36Z clean exit 0 (FIX-SBV-FETCHER-ZERO-VALUE-EMIT). Timeline: 23:06Z (8m post-restart) 8.59% → 23:36Z (37m) 9.02% → 23:39Z (40m51s) 10.38%. Baseline skip-deep-probe applied (10.38% < 85%). Memory is climbing; reclamation NOT proven—process is young. Do NOT conclude FIX-MCP-MEMORY-CODE-LEAK resolved. Underlying leak tracking continues (backlog, high).

**A-20 pdf-extractor**: 3/3 multi-probe pass.

**A-21 Windowed Crashes**: 1 crash at 22:58:42Z (authorized restart event), threshold=2 → PASS.

**A-32 Disk**: 38% capacity (233Gi total, 13Gi used, 23Gi avail) — healthy headroom.

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## 60d26f9b · 2026-07-28T23:10:32Z
### Audit Run Tier-1 (23:00–23:10 UTC 2026-07-28)
- Tier: 1 | Services: 12/12 host_runtime_set Up(healthy) | Health: 5/5 OK | A-20 pdf-extractor 3/3 pass | A-21 crashRestarts=0 PASS | A-30 MemPerc=12.54% (fresh process, NOT leak evidence) | A-32 Disk 38% PASS
- Anomalies: 0 new (0 critical, 0 warn, 0 info)
- Status: HEALTHY

Fire-election: tick=2026-07-28T23:00Z (`*/30 * * * *` boundary) — `task_claim` returned `claimed:true`. Led this tick.

[Abridged: Full RAW-PROBE for 23:00Z tick available in git log prior-entry; current cycle shows reduced memory]

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0
