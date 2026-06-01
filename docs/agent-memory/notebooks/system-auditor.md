---
agent: system-auditor
session_date: 2026-06-01
---

## Audit Run Tier-1 (01:37–01:38 UTC 2026-06-01)

- Tier: 1 | Runtime check: 2 services (mcp-server, mcp-gateway) both UP
- Container liveness: PASS (no docker containers running = intended state per RUNTIME SET constraints)
  - mcp-server: /health 200 OK, uptime 4h 19m, restart_count=1 (PASS ≤2), memory=37.65% (PASS <85%)
  - mcp-gateway: healthy (zenmidi.com/gateway operational)
- Circuit breakers: 16/16 green (0 failures, 0 half-open)
- Cron jobs: 73+ tracked, success rates 98–100% (intelligenceCycle 99.4%, bctcQueueEnricher 99.2%, vnstockFundamentalsRefresh running)
- Database: market.db 205.87 MB, WAL 6.40 MB (healthy)
- Data freshness context: VN market CLOSED (01:37 UTC = 08:37 HCM Sunday, outside M–F 02:00–08:59 trading window)
  - Price stale: EXPECTED (off-market)
  - BCTC stale: EXPECTED (weekly cadence, last push 2026-05-19)
  - Foreign-flow stale: EXPECTED (market closed)
  - News: fresh (3 min old)
  - SBV FX: fresh (29 min old)
- VPS proxy: news OK, sbv OK, prices/bctc stale (expected off-market)
- Unresolved errors: 10 vnstock rate-limit transient backoffs (outside market hours, normal)
- Duration: < 60s
- Anomalies: 0 new
- Status: HEALTHY
