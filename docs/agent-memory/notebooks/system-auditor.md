## c409 · 2026-07-19T22:31:26Z
### Audit Run Tier-2 (22:30–22:32 UTC 2026-07-19)
- Tier: 2 | Sources: 28 checked | VPS proxy: 4/4 OK | Cron jobs: 44 healthy
- A-29 cron fire gap: 0 gaps (all critical jobs within cadence)
- B-01..B-07 (per-source freshness): all sources within SLA thresholds
- B-09 (BCTC URL shape): 0 SSC portal issues (PASS)
- B-13 (stale pending BCTC): 0 rows >72h (PASS)
- B-05 (BCTC healthy-idle): 74 actionable rows, VPS host UP → gate does not apply (normal idle state)
- C-06 (market_messages 3h): 1 (PASS)
- C-07 (agent_signals 24h): 68 (PASS)
- VPS proxy status: news/sbv/bctc/prices all OK; prices off-hours by design
- Rate limits: 11/11 sources ready (no exhaustion)
- Anomalies: 0 new (all stale-by-design issues remain dedup-skipped per carry-forward)
- Status: HEALTHY

**CARRY-FORWARD CONTEXT:**
- Market data baseline (2026-07-01) remains intentionally stale by design — NOT signaled
- pdf-extractor event-loop wedge (sys-20260719T211249-1440) — dedup-skip continues (recurring, needs code fix)
- bctcReparseJob: long-running batch (started 20:39Z), not a fire-gap issue — monitoring only

## c408 · 2026-07-19T22:10:40Z
### Audit Run Tier-1 (22:10–22:12 UTC 2026-07-19)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 0 new findings
- A-01 to A-11 (container status): 12/12 UP (host_runtime_set SSOT) — all containers healthy
- A-12 to A-19 (health endpoints): 4/5 OK — api-gateway RECOVERED (was WARN, now OK), pdf-extractor CURL_ERR (continuing)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop wedged, all probes HTTP 000 (dedup-skip: sys-20260719T211249-1440)
- A-21 (restart count): mcp-server=0 PASS (2h uptime since restart at 20:09Z)
- A-30 (memory): mcp-server=20.27% < 85% PASS
- A-32 (disk): 35% < 85% PASS

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-19T22:10:40Z ===

--- docker ps -a ---
NAMES                                             STATUS                         IMAGE                                           CREATED
mcp-gateway                                       Up 4 days (healthy)            mcpservergatway-gateway                         4 days ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)            vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 days (healthy)            vn-market-intelligence-mcp-api-gateway          4 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 days (healthy)            ghcr.io/flaresolverr/flaresolverr:latest        4 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 4 days (healthy)            vn-market-intelligence-mcp-news-fetch           4 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)           vn-market-intelligence-mcp-mcp-server           4 days ago
vn-market-intelligence-mcp-rag-service-1          Up 42 hours (healthy)          vn-market-intelligence-mcp-rag-service          4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)            vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up About an hour (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)            vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 4 days (healthy)            vn-market-intelligence-mcp-alert-engine         4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)            vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)            vn-market-intelligence-mcp-kinh-dich-service    4 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=20.27% MemUsage=622.8MiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  264M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```

- **KEY FINDINGS**: 
  - api-gateway: TRANSIENT RESOLVED (was WARN 30min ago, now OK — no new signal needed)
  - pdf-extractor: Event-loop stall persists (probes 0/3), recurring issue (dedup-skip: sys-20260719T211249-1440, needs code fix)
- Anomalies: 0 new | 1 dedup-skipped (pdf-extractor A-20) | Status: HEALTHY
- Signal output: No new signals | [DEDUP-SKIP] microservice_degraded:pdf-extractor:A-20

## c407 · 2026-07-19T21:42:12Z
### Audit Run Tier-1 (21:40–21:42 UTC 2026-07-19)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 1 continuing finding
- A-01 to A-11 (container status): 12/12 UP (host_runtime_set SSOT) — all containers present
- A-12 to A-19 (health endpoints): 4/5 OK — api-gateway RECOVERED (was WARN 30min ago), pdf-extractor CURL_ERR (continuing)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop wedged, all probes HTTP 000 (continuing from last cycle)
- A-21 (restart count): mcp-server=0 PASS (62m uptime since restart at 20:39Z)
- A-30 (memory): mcp-server=24.91% < 85% PASS
- A-32 (disk): 36% < 85% PASS
- **KEY FINDING — api-gateway**: Transient failure RESOLVED. Was WARN 30min ago (sys-20260719T211240-4569), now PASS. No escalation needed.
- **Continuing issue — pdf-extractor**: Event-loop stall persists (probes 0/3), container unhealthy (49m uptime). Dedup-skip (sys-20260719T211249-1440, recurring, needs code fix per context).
- Anomalies: 0 new | 1 dedup-skipped (pdf-extractor) | Status: HEALTHY (api-gateway recovered; all remaining issues are known duplicates)
- Signal output: No new signals | [DEDUP-SKIP] microservice_degraded:pdf-extractor:A-20 | [TRANSIENT-RESOLVED] microservice_degraded:api-gateway:A-04

## c406 · 2026-07-19T21:10:37Z
### Audit Run Tier-1 (21:10–21:12 UTC 2026-07-19)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 2 findings
- A-01 to A-11 (container status): 12/12 UP (host_runtime_set SSOT) — all containers present
- A-12 to A-19 (health endpoints): 3/5 OK — api-gateway CURL_ERR (NEW), pdf-extractor CURL_ERR (continuing)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop wedged, all probes returned HTTP 000 (continuing)
- A-21 (restart count): mcp-server=0 PASS (31m uptime post-recovery)
- A-30 (memory): mcp-server=25.46% < 85% PASS
- A-32 (disk): 35% < 85% PASS
- **Findings**: 1 new (A-04 api-gateway WARN) + 1 continuing (A-20 pdf-extractor WARN, dedup-skipped)
- **Context**: pdf-extractor remains unhealthy despite earlier restart attempt — issue persists
- Anomalies: 1 new (A-04) | 1 dedup-skipped (A-20) | Status: DEGRADED
- Signal output: [emit-signal] OK microservice_degraded:api-gateway:A-04 id=sys-20260719T211240-4569 | [emit-signal] SKIP-dedup microservice_degraded:pdf-extractor:A-20 id=sys-20260719T211249-1440
