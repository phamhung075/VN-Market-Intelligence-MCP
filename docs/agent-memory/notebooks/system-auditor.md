---
agent: system-auditor
session_date: 2026-05-31
---

## Audit Run Tier-1 (19:37–19:37 UTC 2026-05-31)

- Tier: 1 | Services checked: 1 (mcp-server) | Health endpoints: 1
- Runtime status: HEALTHY
- Container status: UP (2h uptime)
- Health endpoint: 200 OK
- Restart count: unknown (docker inspect not available)
- Memory: unknown (docker stats not available)
- EPIPE errors (30m): 0
- WAL size: 2.34 MB (healthy, <50MB)
- Circuit breakers: all OK (0 open, 0 half-open)
- Cron jobs sampled: 70+ jobs, all success_rate ≥ 99%
- Anomalies: 0 NEW | 0 dedup-skipped
- Status: HEALTHY

### Key Findings

- mcp-server is the only running container (others not detected in this check)
- All major cron jobs executing normally (intelligenceCycleJob 99.4%, bctcQueueEnricherJob 99.1%, bctcReparseJob 98.9%)
- No critical errors in DB status report
- VPS proxy health: sbv-vps fresh (37 min), but prices/bctc/news marked stale (expected, VN market closed)
- Source errors: 10 recent warnings (vnstock:cash_flow/balance_sheet rate limits, non-fatal)

### Signals Emitted

- None (no anomalies detected)

### Next Steps

- Tier-1 complete; system is healthy
