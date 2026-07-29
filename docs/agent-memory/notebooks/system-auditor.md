## c002 · 2026-07-29T11:12:17Z
### Audit Run Tier-1 (11:00–11:12 UTC 2026-07-29)
- Tier: 1 | Services: 12/12 host_runtime_set Up(healthy) | Health: 5/5 OK | A-20 pdf-extractor 3/3 pass | A-21 windowed crash-only | A-30 baseline 64.35%<85% PASS | A-32 Disk 38% PASS
- Anomalies: 0 new (0 critical, 0 warn, 0 info)
- Status: HEALTHY | Acknowledged-degraded (suppressed, open backlog tracks): rag-service 96.78% (tracked RAG-FTS-BUILD-MEMORY-BOUND)
- Fire-election: tick=2026-07-29T11:00Z — claimed, led tick

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-29T11:12:17Z ===

--- docker ps -a ---
NAMES                                             STATUS
vn-market-intelligence-mcp-pdf-extractor-1        Up 17 hours (healthy)
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)
mcp-gateway                                       Up 13 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)
vn-market-intelligence-mcp-flaresolverr-1         Up 13 days (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 13 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 13 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 13 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 13 days (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=4

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=64.35% MemUsage=1.931GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 64.35% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity
/dev/disk1s4s1   233Gi    13Gi    22Gi    38%

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3
```

Verdict: All checks PASS — A-01/A-11 services UP (12/12), A-12 health OK (5/5), A-20 pdf-extractor pass (3/3), A-21 windowed crash-only (RestartCount=4, in-window crashes=0 PASS), A-30 mcp-server baseline 64.35%<85% PASS, A-32 disk 38%<85% PASS. Acknowledged-degraded (suppressed by open backlog): rag-service 96.78% (task=RAG-FTS-BUILD-MEMORY-BOUND), launchd docker-events/fleet-push (exit-status, tracked).

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0

## c001 · 2026-07-29T10:34:31Z
### Audit Run Tier-2 (08:00–10:35 UTC 2026-07-29)
- Tier: 2 | Cron health: A-29 PASS (all crons within cadence)
- Data freshness: 10 PASS + 1 dedup-WARN (SBV_FX 32min stale, SLA 30min)
- BCTC queue: 167 pending, push-age ~26h < 347h dynamic SLA threshold = HEALTHY IDLE
- VPS proxy: prices/news/sbv ok | DB C-06/C-07: PASS
- Anomalies: 1 dedup-skipped (SBV_FX B-12 WARN) | 0 new
- Status: DEGRADED (SBV_FX SLA breach — isolated, no cascade)

Fire-election: tick=2026-07-29T08:00Z (`0 */4 * * *` boundary) — claimed, led tick.

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=3 | dashboard_rows=1 | dedup_skipped=1

## ad265f86 · 2026-07-29T07:09:23Z
### Audit Run Tier-1 (07:00–07:09 UTC 2026-07-29)
- Tier: 1 | Services: 12/12 host_runtime_set Up(healthy) | Health: 5/5 OK | A-20 pdf-extractor 3/3 pass | A-21 crashRestarts=0 PASS | A-30 SKIP deep-probe (baseline 24.60% < 85%) | A-32 Disk 39% PASS
- Anomalies: 0 new (0 critical, 0 warn, 0 info)
- Status: HEALTHY (state-change: prior Tier-1 DEGRADED→HEALTHY)

Fire-election: tick=2026-07-29T07:00Z (`*/30 * * * *` boundary) — `task_claim` returned `claimed:true`. Led this tick.

Verdict: All checks PASS — A-01/A-11 services UP, A-12/A-20 health OK, A-21 crashRestarts=0<2, A-30 SKIP (24.60%<85%), A-32 disk 39%<85%.

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0
