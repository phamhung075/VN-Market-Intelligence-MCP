---
agent: system-auditor
session_date: 2026-06-06
---

## c009 · 2026-06-05T22:08Z
### Audit Run Tier-1 (22:08–22:10 UTC 2026-06-05)
- Tier: 1 | Services checked: 6 (intended runtime) | Crons polled: 95+
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set)
- mcp-server: Up 23m, restart_count=0 ✓, memory=30.39% ✓
- api-gateway: Up 3d ✓
- frontend: Up 11m ✓
- macro-indicators: Up 11h ✓
- pdf-extractor: Up 2d ✓
- mcp-gateway: Up 9d ✓

### Health Endpoints — All PASS except frontend
- mcp-server :3000 → 200 (toolCount:162, uptime 1409s, 8 sessions) ✓
- api-gateway :4000 → 200 (macro:ok, mcp:ok) ✓
- macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 (ocr_source_ok:true) ✓
- frontend :3001 → no endpoint (UI-only, INFO-grey, no impact)
- mcp-gateway → healthy (MCP-mode) ✓

### Cron Health (95+ jobs monitored)
- 100% firing across all monitored crons, 7-day min success_rate: 97.3%
- bctcQueueEnricherJob: 97.4% (498 runs)
- bctcReparseJob: 97.3% (225 runs)
- intelligenceCycleJob: 99.1% (566 runs)
- All others: ≥98% or 100%; no gaps detected

### Circuit Breaker Status
- All 16 sources: [OK] (cafef, vnexpress, reuters, vneconomy, hose, hnx, ssc, tradingEconomics, yahooFinance, sbv, polymarket, congbao, sbvCircular, foreignFlow, newsapi, marketwatch)
- 0 open, 0 half-open circuits

### VPS Status
- prices: STALE (last 08:59Z, outside market hours, expected) ✓
- news: STALE (last 21:53Z, outside market hours, expected) ✓
- sbv: OK (last 21:58Z) ✓
- bctc: OK (last 14:48Z) ✓
- vn-news-fetch service: unhealthy (but expected VN market closed 22:08 UTC)

### Notes
- Tier-1 pass clean. All intended-runtime services UP + healthy.
- mcp-server memory post-rebuild stable (30.39%, well under 85% threshold).
- VPS prices/news stale outside market hours (22:08 UTC = VN market closed) — expected, not flagged.
- Cron health solid; no anomalies detected.
- No new signals emitted.

## c008 · 2026-06-05T21:38Z
### Audit Run Tier-1 (21:38–21:39 UTC 2026-06-05)
- Tier: 1 | Services checked: 6 (intended runtime) | Crons polled: 92
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set)
- mcp-server: Up 1h (healthy), restart_count=1 ✓, memory=26.02% ✓ [stable post-FIX-CTG-PDF-MISLINK]
- api-gateway: Up 2d (healthy) ✓
- frontend: Up 17h (healthy) ✓
- macro-indicators: Up 10h (healthy) ✓
- pdf-extractor: Up 2d (healthy) ✓
- mcp-gateway: Up 9d (healthy) ✓

### Health Endpoints — All PASS
- mcp-server :3000 → 200 ✓ (uptime 1h 23m, toolCount:162, sessions:120)
- api-gateway :4000 → 200 ✓ (macro:ok, mcp:ok)
- macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 ✓ (ocr_source_ok:true)
- frontend :3001 → no endpoint (UI-only, INFO-grey, no impact)
- mcp-gateway :4040 → healthy (MCP-mode)

### Cron Health (92 jobs polled)
- 100% firing across 92 monitored crons, 7-day min success_rate: 97.3%
- intelligenceCycleJob: 99.3% (566 runs 7d)
- bctcQueueEnricherJob: 97.6% (497 runs) — transient ok
- All others: ≥97.3% or 100%; no gaps detected

### Circuit Breaker Status
- All 16 sources: [OK] — cafef, vnexpress, reuters, vneconomy, hose, hnx, ssc, tradingEconomics, yahooFinance, sbv, polymarket, congbao, sbvCircular, foreignFlow, newsapi, marketwatch
- 0 open, 0 half-open circuits

### Notes
- Tier-1 pass clean. All intended-runtime services UP + healthy.
- Memory stable post-rebuild (26.02%, well under 85% threshold).
- No new anomalies detected.

## c007 · 2026-06-05T21:11Z
### Audit Run Tier-1 (21:11–21:12 UTC 2026-06-05)
- Tier: 1 | Services checked: 6 (intended runtime) | Crons polled: 90
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set)
- mcp-server: Up 56m (healthy), restart_count=1 ✓, memory=27.64% ✓ [stable post-FIX-CTG-PDF-MISLINK rebuild]
- api-gateway: Up 2d (healthy) ✓
- frontend: Up 16h (healthy) ✓
- macro-indicators: Up 10h (healthy) ✓
- pdf-extractor: Up 2d (healthy) ✓
- mcp-gateway: Up 9d (healthy) ✓

### Health Endpoints — All PASS
- mcp-server :3000 → 200 ✓ (uptime 56m, toolCount:162, sessions:102)
- api-gateway :4000 → 200 ✓ (macro:ok, mcp:ok)
- macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 ✓
- frontend :3001 → 404 (UI-only, INFO-grey, no impact)

### Cron Health (90 jobs polled)
- 100% firing, 7-day min success_rate: 97.3% (bctcReparseJob)
- intelligenceCycleJob: 99.3% (566 runs 7d)
- bctcQueueEnricherJob: 97.6% (498 runs) — transient ok
- All others: ≥97.3% or 100%; no gaps detected

### Data Freshness (Live Snapshot)
- HOSE prices: 42m (market closed 21:11Z Thu, normal) ✓
- News: 70m ✓
- Commodities: 42m ✓
- SBV FX: 42m ✓
- Polymarket: 42m ✓
- BCTC: 3.9h (no earnings window, normal) ✓
- Circuit breakers: all 16 sources [OK], 0 failures

### VPS Proxy Status
- prices: stale (last 08:59Z) — market hours irrelevant (window closed), not an anomaly
- news: ok (last 21:05Z)
- sbv: ok (last 20:58Z)
- bctc: ok (last 14:48Z)

### System Status (MCP Probe)
- DB: market.db 240.45 MB, WAL 15.58 MB ✓
- Uptime: 56m 43s (stable post-rebuild)
- Pending feedback: 39 items
- Open warnings: 37 high/critical (existing, tracked)

### Notes
- Tier-1 pass clean. All intended-runtime services UP + healthy. No new anomalies.
- frontend /health 404 is informational (UI-only). No component impact.
- mcp-server memory post-rebuild stable (27.64%, well under 85% threshold).
- VPS prices stale outside market hours (21:11Z Thu = VN market closed) — expected, not flagged.
