
## c390 · 2026-07-04T02:32:35Z
### Audit Run Tier-2 (02:31–02:33 UTC 2026-07-04)
- Tier: 2 | Cron: 100+ jobs checked | Sources: 28 checked | VPS: 4 routes | DB: 3 spot checks
- A-29 (cron fire): PASS (all 100%+ success)
- B-01 to B-12 (source freshness): PASS (all within SLA, no stale sources)
- B-05 (BCTC staleness): HEALTHY IDLE (queue=36 items, push-age off-season expected)
- B-06/B-07 (VPS proxy): 4/4 routes OK — prices, news, sbv active; bctc off-season
- B-09 (BCTC SSC URLs): 0 (PASS)
- B-12 (rate limits): 0% (PASS)
- B-13 (stale pending): 0 rows >72h (PASS)
- C-06 (market msgs 3h): 0 (off-hours expected)
- C-07 (signals 24h): 155 PASS
- C-09 (macro indicators): 3/3 PASS
- Anomalies: 0 | Status: HEALTHY

## c389 · 2026-07-04T01:26:29Z
### Audit Run Tier-1 (01:25–01:26 UTC 2026-07-04)
- Tier: 1 | Services: 12 checked | Health: 5 probed | All UP
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set)
- A-12 to A-19 (health endpoints): 5/5 OK — mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend
- A-20 (pdf-extractor multi-probe): 3/3 PASS
- A-21 (restart count): PASS (mcp-server=1)
- A-30 (memory): 63.58% < 85% PASS
- A-32 (disk): 44% < 85% PASS
- Cron health: 100+ jobs all ≥80% success
- Anomalies: 0 | Status: HEALTHY

## c218 · 2026-07-04T00:42:39Z
### Audit Run Tier-3 (00:40–00:42 UTC 2026-07-04)
- Tier: 3 | Services: 12 checked | DB checks: 16 run
- A-01 to A-32 (Runtime): All PASS — 12/12 containers UP, 5/5 health OK, memory/disk OK
- C-01 to C-16 (DB Integrity): 15 PASS, 0 CRITICAL
  - C-01 (OHLCV symbols): 1192 ≥25 PASS
  - C-02 (OHLCV rows): 2845 >0 PASS
  - C-03 (FR 2026Q1): 32 ≥26 PASS
  - C-04 (low-conf): 2 ≤5 PASS
  - C-05 (SSC URLs): 0 PASS
  - C-06 (market msgs 3h): 0 (off-hours, expected)
  - C-07 (signals 24h): 159 >0 PASS
  - C-08 (orphaned alerts): 0 PASS
  - C-09 (macro indicators): 3 ≥3 PASS
  - C-10 (PDF failures): 0 ≤2 PASS
  - C-11 (PDF done 48h): 0 (off-season, expected)
  - C-12 (integrity): OK PASS
  - C-13 (WAL size): <50MB PASS
  - C-14 (concentration): 0.3% <60% PASS
  - C-15 (schema): all cols PASS
  - C-16 (stale pending): 0 PASS
- Doc/Memory Audit: 2 INFO — task_board=85 (cap:80), sprint_entries=16 (cap:15)
- Known Issues Corroborated:
  - MBB Q1-2026: 14.9% BS imbalance (tracked, batch-reflow repair)
  - CTG Q1-2026: total_assets=0 (tracked, W5-FIU-CTG-REFINE, user-gated)
- Anomalies: 2 INFO (no CRITICAL, no WARN) | Status: HEALTHY

## c217 · 2026-07-04T00:31:26Z
### Audit Run Tier-1 (00:31–00:32 UTC 2026-07-04)
- Tier: 1 | Services: 12 checked | Health: 5 probed | All UP
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set)
- A-12 to A-19 (health endpoints): 5/5 OK — mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend
- A-20 (pdf-extractor multi-probe): 3/3 PASS
- A-21 (restart count): PASS (mcp-server=1)
- A-30 (memory): 60.35% < 85% PASS
- A-32 (disk): 43% < 85% PASS
- Cron health: 100+ jobs all ≥80% success
- Anomalies: 0 | Status: HEALTHY
