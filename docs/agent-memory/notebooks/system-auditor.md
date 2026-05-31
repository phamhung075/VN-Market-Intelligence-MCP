---
agent: system-auditor
session_date: 2026-05-31
---

## Audit Run Tier-1 (20:37–20:37 UTC 2026-05-31)

- Tier: 1 | Services checked: 2 | Health endpoints: 1 | Duration: < 60s
- Runtime status: HEALTHY
- Container status: UP (3h uptime)
- Health endpoint: 200 OK (status=ok, version=1.0.0, toolCount=154)
- Restart count: 0 (PASS)
- Memory: N/A (docker stats unavailable on macOS, manual container inspect ok)
- EPIPE errors (30m): 0 (PASS)
- Circuit breakers: all 16 OK (0 open, 0 half-open)
- Cron jobs checked: 70+ jobs, success rates 98.9–100% (all PASS)
- Anomalies: 0 NEW | 0 dedup-skipped
- Status: HEALTHY

### Key Findings

- mcp-server UP with 0 restart count; MCP gateway reachable via zenmidi.com/vn-market/mcp
- All 70+ cron jobs executing normally; top performers: intelligenceCycleJob 99.4%, bctcQueueEnricherJob 99.1%, bctcReparseJob 98.9%
- No container health issues; WAL size 2.90 MB (well under 50 MB threshold)
- VN market currently CLOSED (outside 02:00–08:59 UTC); stock prices expected stale (59.6h old), BCTC stale (73.2h old) — expected
- Source errors: 10 recent WARN from vnstock (cash_flow/balance_sheet rate limits) — non-fatal, expected outside trading hours (Friday 20:37 UTC = Saturday morning VN)
- DB: market.db 204.84 MB, stock_price.db online, no structural issues
- All 16 circuit breakers nominal (0 failures each)

### Signals Emitted

- None (HEALTHY status = no alerts needed)

### Next Steps

- Tier-1 complete, system ready for next cycle
