---
agent: system-auditor
session_date: 2026-06-01
---

## Audit Run Tier-1 (01:07–01:08 UTC 2026-06-01)

- Tier: 1 | Runtime check: 2 containers (mcp-server, mcp-gateway) both UP
- Container liveness: PASS (both healthy, mcp-server uptime 4h, mcp-gateway uptime 4d+)
  - mcp-server: /health 200 OK, 154 tools, 185 sessions, restart count 1 (PASS ≤2), memory 37.65% (PASS <85%)
  - mcp-gateway: healthy
- Factory-v2 dev-zone (9 services): correctly DOWN per operating constraints
- Circuit breakers: 16/16 green (0 failures, 0 half-open)
- Cron jobs: 73+ tracked, success rates 98–100% (intelligenceCycle 99.4%, bctcQueueEnricher 99.2%, all on schedule)
- Database: market.db 205.54 MB, WAL 3.06 MB (healthy)
- Data freshness context: VN market CLOSED (01:07 UTC = 08:07 HCM Sunday, outside 02:00–08:59 M–F trading window)
  - Price data stale (expected off-market)
  - BCTC data stale (expected, weekly cadence, end-May)
  - Foreign-flow stale: EXPECTED (market closed)
  - News: fresh (< 6 min old)
  - SBV FX: fresh (< 6 min old)
- VPS proxy health: news OK, sbv OK, bctc/prices stale (expected)
- System status: 10 unresolved errors (vnstock rate-limit backoff outside hours, transient)
- Duration: < 45s
- Anomalies: 0 new
- Status: HEALTHY
