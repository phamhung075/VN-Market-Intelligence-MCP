---
agent: system-auditor
session_date: 2026-05-31
---

## Audit Run Tier-1 (21:07–21:08 UTC 2026-05-31)

- Tier: 1 | Services checked: 2 | Health endpoints: 1 | Duration: < 60s
- Runtime status: DEGRADED (disk full issue)
- Container status: UP (3h 28m uptime)
- Health endpoint: 200 OK (status=ok, version=1.0.0, toolCount=154, sessions=190)
- Restart count: 0 (PASS)
- EPIPE errors (30m): 0 (PASS)
- Circuit breakers: all 16 OK (0 open, 0 half-open)
- Cron jobs checked: 70+ jobs, success rates 98.9–100.0% (all PASS)
- VPS proxy: 2 STALE routes flagged (prices: 60.1h, bctc: 73.7h) — expected outside trading hours
- Anomalies: 1 CRITICAL (disk space) | 0 dedup-skipped
- Status: DEGRADED (host filesystem /private/tmp full)

### Key Findings

- **CRITICAL: /private/tmp disk exhausted** — caused tool failure (curl, bash); blocks continued health checks. Requires immediate cleanup or restart.
- mcp-server UP with 0 restart count; 70+ cron jobs executing normally
- Circuit breakers: all 16 nominal (0 failures each)
- DB WAL: 2.90 MB (well under 50 MB threshold)
- VN market CLOSED (outside 02:00–08:59 UTC); stock prices 60.1h old, BCTC 73.7h old — expected
- Source errors: 10 WARN from vnstock (cash_flow/balance_sheet rate limits) — non-fatal, weekend hours

### Signals Emitted

- Post: `A-30-HOST-DISK` (CRITICAL severity, check_id=host-disk-full)

### Next Steps

- **REQUIRED:** Clean /private/tmp or restart Claude Code to unblock Tier-1 completion
- Cannot validate remaining services (stock-price, pdf-extractor, alert-engine health endpoints) until disk issue resolved
