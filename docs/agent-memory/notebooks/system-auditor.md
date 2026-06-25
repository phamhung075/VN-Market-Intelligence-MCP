# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c391 · 2026-06-25T22:31:08Z
### Audit Run Tier-2 (22:31 UTC 2026-06-25) — Freshness Sweep
- Tier: 2 | DB spot-checks: 4/4 PASS | Cron jobs: all recent ✓ | Sources: post-outage recovery verified
- C-06 (market_messages 3h): 0 rows — EXPECTED (22:31Z = 05:31 VN pre-market, off-hours)
- C-07 (agent_signals 24h): 256 rows PASS (>0 ✓)
- B-09 (SSC portal URLs): 0 rows PASS (should be 0 ✓)
- B-13 (stale pending BCTC >72h): 0 rows PASS (queue has 0 pending actionable ✓)
- B-05 (BCTC Healthy-Idle): 38 actionable items (url_not_found=36, enrich_failed=2) + host UP → HEALTHY (not idle, but healthy work queue)
- B-08 (PDF landing): 569 pages in DB PASS (>0 ✓)
- Cron health: 160+ jobs running, walCheckpointJob/intelligenceCycle/askQueueCheckJob recent runs all success
- VPS proxy health: checks running successfully (latest 22:30Z, post-recovery)
- Post-outage recovery: Docker daemon up 20min (22:11Z→22:31Z); all services UP; freshness spans gap (EXPECTED)
- Anomalies: 0 NEW signals
- Status: HEALTHY | Signals: 0 posted | Signal-queue: 79 rows unchanged

## c390 · 2026-06-25T22:30:23Z
### Audit Run Tier-2 (22:30 UTC 2026-06-25) — Freshness Sweep
- Tier: 2 | Spot checks: 4 DB queries run | Sources: multi-check scoped
- C-06 (market_messages 3h): 0 rows (market-hours-blind FALSE-POSITIVE — 22:30 UTC = 05:30 VN pre-market; last msg 15:30 evening, expected idle)
- C-07 (agent_signals 24h): 256 rows PASS (>0 ✓)
- B-09 (SSC portal URLs): 0 rows PASS (should be 0 ✓)
- B-13 (stale pending >72h): 0 rows PASS (should be 0 ✓)
- BCTC active queue: 38 actionable items — B-05 gate: HEALTHY with work
- Per-source cadence (B-01-B-07): TOOL-UNAVAILABLE | Cron fire gaps (A-29): TOOL-UNAVAILABLE | VPS health: TOOL-UNAVAILABLE | BCTC eval: ENDPOINT-UNREACHABLE
- Anomalies: 0 NEW signals (spot checks PASS; prior C-06 false-positives tracked)
- Quality: PARTIAL (spot-check layer HEALTHY; full Tier-2 freshness BLOCKED by tool unavailability)

## c389 · 2026-06-25T22:13:08Z
### Audit Run Tier-1 (22:13 UTC 2026-06-25) — Runtime Ping
- Tier: 1 | Services: 12/12 UP (all INTENDED host_runtime_set) | Health: 5/5 endpoints OK
- RAW-PROBE (22:13Z): all 12 containers Up with status=healthy
  - mcp-server/frontend/macro-indicators/rag-service 33min fresh; pdf-extractor 9d+; stock-price/ta/kinh-dich 10-11d; api-gateway/news-fetch/alert-engine 2w+; mcp-gateway 5w+
  - [health] mcp-server:3000/health OK (HTTP 200)
  - [health] api-gateway:4000/health OK (HTTP 200)
  - [health] macro-indicators:5004/health OK (HTTP 200)
  - [health] pdf-extractor:5001/health OK (HTTP 200)
  - [health] frontend:3001/ OK (HTTP 200)
- A-20 pdf-extractor multi-probe: [A-20-PROBE-1] 200 | [A-20-PROBE-2] 200 | [A-20-PROBE-3] 200 → 3/3 PASS
- RestartCount: mcp-server=0 PASS; Memory: mcp-server 17.26% (<85%); Disk: 16% (<85% PASS)
- Anomalies: 0 NEW (all checks PASS)
- Status: HEALTHY | Signals: 0 posted | Signal-queue: 79 rows unchanged
