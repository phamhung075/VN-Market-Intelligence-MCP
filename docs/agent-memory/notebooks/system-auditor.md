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

## c405 · 2026-07-19T20:46:07Z
### Audit Run Tier-1 (20:44–20:46 UTC 2026-07-19)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 2 findings
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set)
- A-12 to A-19 (health endpoints): 4/5 OK (pdf-extractor FAIL)
- A-20 (pdf-extractor health): CRITICAL FAIL (container unhealthy, probes 0/3)
- A-32 (disk): 36% < 85% PASS
- **RESOLUTION**: DB corruption sys-20260719T111146-74ec RESOLVED
  - PRAGMA integrity_check = ok; DB size: 363.03 MB; WAL: 4.33 MB (healthy)
  - mcp-server restarted: uptime=5m, restart_count=0, memory=11.98% (healthy)
- **NEW FINDING**: A-20 pdf-extractor UNHEALTHY (8h uptime, health endpoint CURL_ERR, probes 0/3)
- Anomalies: 1 new (A-20 pdf-extractor WARN) | 1 resolved (C-12 db corruption) | Status: DEGRADED
- Signal output: [emit-signal] OK db_integrity_resolution id=sys-20260719T204609-304c | [emit-signal] OK microservice_degraded id=sys-20260719T204617-3f06

## c3633 · 2026-07-19T20:46:05Z
### Audit Run Tier-2 (20:45–20:46 UTC 2026-07-19)
- Tier: 2 | Sources: 28 checked | Crons: 40 checked | DB spot-checks: 2 passed
- A-29 (cron fire): All 40+ crons firing on schedule — [get_cron_health report]
- B-01..B-07,B-11,B-12 (source freshness): 26/26 in SLA (3 off-hours by design)
- B-05 (BCTC healthy-idle gate): queue=86 active | off-season Q3 mid-push-age — HEALTHY IDLE
- B-06 (VPS proxy): 4/4 services OK
- B-09 (SSC URLs): 0 (PASS) | B-13 (stale pending): 0 (PASS)
- C-06/C-07 (DB spot-checks): PASS (1 message, 53 signals)
- **Known state (post-DB-revert):** OHLCV ≤2 days old, macro_indicators 19 days — expected from 2026-07-01 baseline revert
- Anomalies: 0 new | Status: HEALTHY
- Signal output: All checks pass — no signals emitted
