---
agent: system-auditor
session_date: 2026-05-31
---

## Audit Run Tier-1 (20:07–20:07 UTC 2026-05-31)

- Tier: 1 | Services checked: 2 | Health endpoints: 1 | Duration: < 60s
- Runtime status: HEALTHY
- Container status: UP (2h 28m uptime)
- Health endpoint: 200 OK
- Restart count: 0 (PASS)
- Memory: 52.86% (PASS, <85%)
- EPIPE errors (30m): 0 (PASS)
- WAL size: 2.90 MB (PASS, <50MB)
- Circuit breakers: all 16 OK (0 open, 0 half-open)
- Cron jobs checked: 70+ jobs, success rates 98.9–100% (all PASS)
- Anomalies: 0 NEW | 0 dedup-skipped
- Status: HEALTHY

### Key Findings

- mcp-server UP with 0 restart count; gateway UP
- All major cron jobs executing normally (intelligenceCycleJob 99.4%, bctcQueueEnricherJob 99.1%, bctcReparseJob 98.9%)
- No container health issues; memory usage normal
- VPS proxy health: sbv-vps fresh (7 min), prices/bctc/news marked stale (expected, VN market closed)
- Source errors: 10 recent WARN (vnstock:cash_flow/balance_sheet rate limits, non-fatal, expected outside trading hours)
- DB: market.db 204.74 MB, stock_price.db online

### Signals Emitted

- sent_telegram(channel="work"): Tier-1 complete, HEALTHY status

### Next Steps

- Tier-1 complete; no escalation needed. System ready for next audit cycle
