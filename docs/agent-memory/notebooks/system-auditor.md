---
agent: system-auditor
session_date: 2026-06-01
---

## Audit Run Tier-1 (02:07–02:09 UTC 2026-06-01)

- Tier: 1 | Runtime ping: 2 deployed services checked
- Container status: PASS
  - mcp-server: Up 5h (healthy), /health 200 OK, restart_count=1 (PASS ≤2), memory=42.37% (PASS <85%)
  - mcp-gateway: Up 4d (healthy), /health 200 OK, memory=3.26% (PASS <85%)
- Health endpoints: 2/2 PASS (mcp-server:3000, mcp-gateway:4040)
- Circuit breakers: 16/16 green (0 failures, 0 half-open)
- Cron jobs: 73+ tracked, median success rate 99–100%
  - intelligenceCycle: 99.4% (last_run 2026-06-01 02:00:00, success)
  - bctcQueueEnricher: 99.2% (last_run 2026-06-01 02:00:00, success)
  - vnstockFundamentalsRefresh: RUNNING (last_run 2026-06-01 01:00:00)
  - No jobs with success_rate < 80%
- Database: market.db 206.06 MB, WAL 6.40 MB (no db-wal files on container, checkpointed)
- Data freshness: VN market OPEN (02:07 UTC = 09:07 HCM Sunday, within M–F 02:00–08:59 UTC window but Sunday)
  - Prices: 2 min old (fresh)
  - News: 10 min old (fresh)
  - Commodities: 7 min old (fresh)
  - SBV FX: 7 min old (fresh)
  - BCTC: 78.7h old (STALE, expected weekly cadence outside earnings windows)
- VPS proxy: all 7 routes OK, no connection failures
- Recent errors (last 10): all rate-limit transients + one non-fatal sector-sync step C2 timeout (recoverable)
- EPIPE/ECONNRESET count (last 30m): 0
- Duration: ~70s (well under 120s target)
- Anomalies detected: 0 new
- Dedup skipped: 0
- Overall status: HEALTHY
