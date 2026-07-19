## c3633 · 2026-07-19T20:46:05Z
### Audit Run Tier-2 (20:45–20:46 UTC 2026-07-19)
- Tier: 2 | Sources: 28 checked | Crons: 40 checked | DB spot-checks: 2 passed
- A-29 (cron fire): All 40+ crons firing on schedule — [get_cron_health report]
- B-01..B-07,B-11,B-12 (source freshness): 26/26 in SLA (3 off-hours by design: prices, foreign_flow, sbv_fx outside business hours)
- B-05 (BCTC healthy-idle gate): queue=86 active | off-season Q3 mid-push-age — HEALTHY IDLE
- B-06 (VPS proxy): 4/4 services OK — [get_vps_proxy_health report]
- B-09 (SSC URLs): 0 (PASS)
- B-13 (stale pending BCTC): 0 (PASS)
- C-06 (market_messages 3h): 1 message (PASS)
- C-07 (agent_signals 24h): 53 signals (PASS)
- **Known state (post-DB-revert):** OHLCV ≤2 days old (2026-07-17), macro_indicators 19 days old — expected from baseline revert to 2026-07-01, NOT new anomaly [context signal sys-20260719T111146-74ec]
- Anomalies: 0 new | Status: HEALTHY
- Signal output: All checks pass — no signals emitted | [dedup] OK — no duplicate issues from c129/c404

## c404 · 2026-07-19T11:10:43Z
### Audit Run Tier-1 (11:00–11:10 UTC 2026-07-19)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 3 findings
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set) — [RAW-PROBE L5-16]
- A-12 to A-20 (health endpoints): 5/5 OK — [RAW-PROBE L32-37]
- A-20 (pdf-extractor multi-probe): 3/3 PASS — [RAW-PROBE L43-46]
- A-21 (restart count): WARN (mcp-server=7 > 2) — [RAW-PROBE L18] — [dedup-skip 7d recent]
- A-30 (memory): WARN (95.54% >= 85% threshold) — [RAW-PROBE L22] — [dedup-skip 3h recent]
- A-32 (disk): 34% < 85% PASS — [RAW-PROBE L25]
- **CRITICAL FINDING**: boardDetailsRefreshJob persistent database corruption — "database disk image is malformed" — 0/5 success rate — 2nd independent observation confirms NOT transient — affects vnstock-sync + multiple jobs — [get_cron_health report]
- Anomalies: 1 new critical (DB corruption) | 2 dedup-skipped warns | Status: CRITICAL
- Signal output: [emit-signal] OK dedup_key=database_corruption:market.db:boardDetailsRefreshJob id=sys-20260719T111146-74ec | [emit-signal] SKIP-dedup A-30 | [emit-signal] SKIP-dedup A-21

## c129 · 2026-07-19T10:32:09Z
### Audit Run Tier-2 (10:30–10:31 UTC 2026-07-19)
- Tier: 2 | Sources: 29 checked | Crons: 1 checked | DB checks: 2 spot-checks
- A-29 (cron fire): 1 job with error (boardDetailsRefreshJob — dedup-skip) | All firing on schedule
- B-01..B-07,B-11,B-12 (source freshness): 29/29 within SLA | VPS services: 2 unhealthy (expected off-market)
- B-05 (BCTC gate): queue=173 active | push-age=51h << 107h threshold | HEALTHY IDLE
- B-09 (SSC URLs): 0 (PASS)
- B-13 (stale pending): 0 (PASS)
- C-06 (market_messages 3h): 0 (WARN - no activity 3h window)
- C-07 (agent_signals 24h): 93 (PASS)
- Anomalies: 1 new warn | Status: DEGRADED
- Signal output: [emit-signal] OK dedup_key=data_stale:market_messages:C-06 id=sys-20260719T103153-60de
